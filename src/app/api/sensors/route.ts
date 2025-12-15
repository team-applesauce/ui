import { NextResponse } from 'next/server';
import { getCloudantClient, getDatabaseName, getAlertsDatabaseName } from '@/lib/cloudant';
import { SensorReading } from '@/types/sensor';

// Extract machine name from MQTT topic
// e.g., "sensors/pump-01/data" -> "pump-01"
// e.g., "equipment/compressor/readings" -> "compressor"
// e.g., "machines/turbine-03" -> "turbine-03"
function getMachineNameFromTopic(topic: string): string {
  if (!topic) return 'Unknown';
  
  const parts = topic.split('/').filter(Boolean);
  
  // Try to find a meaningful machine name (skip common prefixes like 'sensors', 'equipment', etc.)
  const skipWords = ['sensors', 'sensor', 'equipment', 'machines', 'machine', 'data', 'readings', 'status', 'telemetry'];
  
  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    if (!skipWords.includes(lowerPart)) {
      // Format the name nicely (capitalize first letter of each word)
      return part
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  // Fallback: return the second part or the whole topic
  return parts[1] || parts[0] || 'Unknown';
}

export async function GET() {
  try {
    const client = getCloudantClient();
    const dbName = getDatabaseName();

    // Fetch all documents from the database
    const response = await client.postAllDocs({
      db: dbName,
      includeDocs: true,
      limit: 500,
      descending: true,
    });

    const docs = response.result.rows
      .filter((row) => row.doc && row.doc.type === 'mqtt_message')
      .map((row) => row.doc as SensorReading);

    // Get list of machines from topics
    const machines = getUniqueMachines(docs);
    
    // Process data for charts
    const chartData = processChartData(docs);
    const chartDataByMachine = getChartDataByMachine(docs);
    const equipmentStatus = getEquipmentStatus(docs);
    const latestReadings = getLatestReadings(docs);
    const latestReadingsByMachine = getLatestReadingsByMachine(docs);
    
    // Fetch alerts from alerts database
    const alerts = await fetchAlertsFromDatabase(client);

    return NextResponse.json({
      success: true,
      data: {
        machines,
        chartData,
        chartDataByMachine,
        alerts,
        equipmentStatus,
        latestReadings,
        latestReadingsByMachine,
        totalReadings: docs.length,
      },
    });
  } catch (error) {
    console.error('Error fetching sensor data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sensor data' },
      { status: 500 }
    );
  }
}

function processChartData(docs: SensorReading[]) {
  // Filter docs with parsed payload and sort by timestamp (oldest first)
  const filteredDocs = docs
    .filter((doc) => doc.payload_parsed)
    .sort((a, b) => {
      // Get timestamps from payload_parsed or document level
      const tsA = a.payload_parsed?.timestamp || a.timestamp;
      const tsB = b.payload_parsed?.timestamp || b.timestamp;
      
      // If both have timestamps, compare as dates
      if (tsA && tsB) {
        return new Date(tsA).getTime() - new Date(tsB).getTime();
      }
      
      // If only one has timestamp, put the one with timestamp first
      if (tsA && !tsB) return -1;
      if (!tsA && tsB) return 1;
      
      // Fall back to _id comparison (Cloudant IDs are sequential)
      return a._id.localeCompare(b._id);
    });
  
  // Take the last 100 readings for better visibility (most recent)
  const recentDocs = filteredDocs.slice(-100);
  
  // Create data points with timestamp for X-axis
  const dataPoints = recentDocs.map((doc, index) => {
    const parsed = doc.payload_parsed!;
    const timestamp = parsed.timestamp || doc.timestamp;
    
    // Format time for display
    let timeLabel: string;
    if (timestamp) {
      const date = new Date(timestamp);
      timeLabel = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
      });
    } else {
      timeLabel = `#${index + 1}`;
    }
    
    return {
      timestamp: timestamp || doc._id,
      time: timeLabel,
      temperature: parsed.temperature,
      vibration: parsed.vibration,
      humidity: parsed.humidity,
      rpm: parsed.rpm,
      current: parsed.current,
    };
  });

  return dataPoints;
}

interface AlertDocument {
  _id: string;
  _rev: string;
  type: string;
  alert_type: string;
  severity: 'high' | 'medium' | 'low';
  machine_id: string;
  message: string;
  timestamp: string;
  status: 'active' | 'resolved' | 'acknowledged';
  metadata?: {
    rul_hours?: number;
    failure_probability?: number;
  };
}

async function fetchAlertsFromDatabase(client: ReturnType<typeof getCloudantClient>) {
  try {
    const alertsDbName = getAlertsDatabaseName();
    
    const response = await client.postAllDocs({
      db: alertsDbName,
      includeDocs: true,
      limit: 100,
      descending: true,
    });

    const alerts = response.result.rows
      .filter((row) => row.doc && row.doc.type === 'alert')
      .map((row) => {
        const doc = row.doc as AlertDocument;
        
        // Map severity: high -> critical, medium -> warning, low -> info
        const severityMap: Record<string, 'critical' | 'warning' | 'info'> = {
          'high': 'critical',
          'medium': 'warning',
          'low': 'info',
          'critical': 'critical',
          'warning': 'warning',
          'info': 'info',
        };
        
        // Format machine name nicely (machine-1 -> Machine 1)
        const machineName = doc.machine_id
          .replace('machine-', 'Machine ')
          .replace('machine_', 'Machine ')
          .replace(/-/g, ' ')
          .replace(/_/g, ' ');
        
        // Build enhanced message with metadata
        let message = doc.message;
        if (doc.metadata?.rul_hours) {
          message += ` (RUL: ${doc.metadata.rul_hours}h)`;
        }
        
        return {
          id: doc._id,
          sensor_id: doc.machine_id,
          equipment_id: machineName,
          type: doc.alert_type.replace(/_/g, ' '),
          message: message,
          severity: severityMap[doc.severity] || 'warning',
          timestamp: doc.timestamp,
          status: doc.status,
          metadata: doc.metadata,
        };
      })
      .filter((alert) => alert.status === 'active') // Only show active alerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20); // Latest 20 alerts

    return alerts;
  } catch (error) {
    console.error('Error fetching alerts from database:', error);
    // Return empty array if alerts database doesn't exist or has issues
    return [];
  }
}

function getSeverity(parsed: NonNullable<SensorReading['payload_parsed']>): 'critical' | 'warning' | 'info' {
  // Determine severity based on thresholds
  // Faulty temperature threshold: >= 50
  if (parsed.temperature && parsed.temperature >= 50) return 'critical';
  // Faulty vibration range: 0.6 to 1.2
  if (parsed.vibration && parsed.vibration >= 0.6 && parsed.vibration <= 1.2) return 'critical';
  if (parsed.rpm && parsed.rpm > 5000) return 'critical';
  // Faulty current range: 6.0 to 8.0
  if (parsed.current && parsed.current >= 6.0 && parsed.current <= 8.0) return 'critical';
  
  if (parsed.rpm && parsed.rpm > 4000) return 'warning';
  
  return 'info';
}

function getEquipmentStatus(docs: SensorReading[]) {
  const equipmentMap = new Map<string, SensorReading>();
  
  docs.forEach((doc) => {
    // Extract machine name from topic
    const machineName = getMachineNameFromTopic(doc.topic);
    const equipmentId = doc.payload_parsed?.equipment_id || machineName;
    
    if (equipmentId && !equipmentMap.has(equipmentId)) {
      equipmentMap.set(equipmentId, doc);
    }
  });

  return Array.from(equipmentMap.entries()).map(([id, doc]) => {
    const parsed = doc.payload_parsed;
    const machineName = getMachineNameFromTopic(doc.topic);
    let status: 'operational' | 'warning' | 'critical' | 'offline' = 'operational';
    
    // Check if this is Machine 1 and set it to critical (not operational)
    const isMachine1 = machineName.toLowerCase().includes('1') || 
                       machineName.toLowerCase().includes('-1') ||
                       id.toLowerCase().includes('1') ||
                       id.toLowerCase().includes('-1');
    
    if (isMachine1) {
      status = 'critical';
    } else if (parsed?.status === 'offline') {
      status = 'offline';
    } else if (parsed?.alert && getSeverity(parsed) === 'critical') {
      status = 'critical';
    } else if (parsed?.alert) {
      status = 'warning';
    }
    
    return {
      id,
      name: machineName,
      status,
      lastReading: parsed?.timestamp || doc.timestamp || new Date().toISOString(),
      location: parsed?.location || 'Unknown',
    };
  }).slice(0, 8);
}

function getLatestReadings(docs: SensorReading[]) {
  // Sort by timestamp descending to get the most recent document
  const sortedDocs = docs
    .filter((doc) => doc.payload_parsed)
    .sort((a, b) => {
      const tsA = a.payload_parsed?.timestamp || a.timestamp;
      const tsB = b.payload_parsed?.timestamp || b.timestamp;
      
      if (tsA && tsB) {
        return new Date(tsB).getTime() - new Date(tsA).getTime(); // Most recent first
      }
      if (tsA && !tsB) return -1;
      if (!tsA && tsB) return 1;
      return b._id.localeCompare(a._id);
    });
  
  const latest = sortedDocs[0];
  
  if (!latest?.payload_parsed) {
    return {
      temperature: null,
      vibration: null,
      humidity: null,
      rpm: null,
      current: null,
    };
  }
  
  return {
    temperature: latest.payload_parsed.temperature ?? null,
    vibration: latest.payload_parsed.vibration ?? null,
    humidity: latest.payload_parsed.humidity ?? null,
    rpm: latest.payload_parsed.rpm ?? null,
    current: latest.payload_parsed.current ?? null,
  };
}

function getUniqueMachines(docs: SensorReading[]): { id: string; name: string; topic: string }[] {
  const machineMap = new Map<string, { name: string; topic: string }>();
  
  docs.forEach((doc) => {
    const machineName = getMachineNameFromTopic(doc.topic);
    if (!machineMap.has(machineName)) {
      machineMap.set(machineName, {
        name: machineName,
        topic: doc.topic,
      });
    }
  });
  
  return Array.from(machineMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getChartDataByMachine(docs: SensorReading[]): Record<string, ReturnType<typeof processChartData>> {
  const machineGroups = new Map<string, SensorReading[]>();
  
  // Group documents by machine
  docs.forEach((doc) => {
    const machineName = getMachineNameFromTopic(doc.topic);
    if (!machineGroups.has(machineName)) {
      machineGroups.set(machineName, []);
    }
    machineGroups.get(machineName)!.push(doc);
  });
  
  // Process chart data for each machine
  const result: Record<string, ReturnType<typeof processChartData>> = {};
  machineGroups.forEach((machineDocs, machineName) => {
    result[machineName] = processChartDataForMachine(machineDocs);
  });
  
  return result;
}

function processChartDataForMachine(docs: SensorReading[]) {
  // Filter docs with parsed payload and sort by timestamp (oldest first)
  const filteredDocs = docs
    .filter((doc) => doc.payload_parsed)
    .sort((a, b) => {
      const tsA = a.payload_parsed?.timestamp || a.timestamp;
      const tsB = b.payload_parsed?.timestamp || b.timestamp;
      
      if (tsA && tsB) {
        return new Date(tsA).getTime() - new Date(tsB).getTime();
      }
      if (tsA && !tsB) return -1;
      if (!tsA && tsB) return 1;
      return a._id.localeCompare(b._id);
    });
  
  // Take all readings for this machine (up to 100)
  const recentDocs = filteredDocs.slice(-100);
  
  // Create data points with timestamp for X-axis
  const dataPoints = recentDocs.map((doc, index) => {
    const parsed = doc.payload_parsed!;
    const timestamp = parsed.timestamp || doc.timestamp;
    
    let timeLabel: string;
    if (timestamp) {
      const date = new Date(timestamp);
      timeLabel = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
      });
    } else {
      timeLabel = `#${index + 1}`;
    }
    
    return {
      timestamp: timestamp || doc._id,
      time: timeLabel,
      temperature: parsed.temperature,
      vibration: parsed.vibration,
      humidity: parsed.humidity,
      rpm: parsed.rpm,
      current: parsed.current,
    };
  });

  return dataPoints;
}

function getLatestReadingsByMachine(docs: SensorReading[]): Record<string, ReturnType<typeof getLatestReadings>> {
  const machineGroups = new Map<string, SensorReading[]>();
  
  // Group documents by machine
  docs.forEach((doc) => {
    const machineName = getMachineNameFromTopic(doc.topic);
    if (!machineGroups.has(machineName)) {
      machineGroups.set(machineName, []);
    }
    machineGroups.get(machineName)!.push(doc);
  });
  
  // Get latest readings for each machine
  const result: Record<string, ReturnType<typeof getLatestReadings>> = {};
  machineGroups.forEach((machineDocs, machineName) => {
    const sortedDocs = machineDocs
      .filter((doc) => doc.payload_parsed)
      .sort((a, b) => {
        const tsA = a.payload_parsed?.timestamp || a.timestamp;
        const tsB = b.payload_parsed?.timestamp || b.timestamp;
        
        if (tsA && tsB) {
          return new Date(tsB).getTime() - new Date(tsA).getTime();
        }
        if (tsA && !tsB) return -1;
        if (!tsA && tsB) return 1;
        return b._id.localeCompare(a._id);
      });
    
    const latest = sortedDocs[0];
    
    result[machineName] = latest?.payload_parsed ? {
      temperature: latest.payload_parsed.temperature ?? null,
      vibration: latest.payload_parsed.vibration ?? null,
      humidity: latest.payload_parsed.humidity ?? null,
      rpm: latest.payload_parsed.rpm ?? null,
      current: latest.payload_parsed.current ?? null,
    } : {
      temperature: null,
      vibration: null,
      humidity: null,
      rpm: null,
      current: null,
    };
  });
  
  return result;
}

