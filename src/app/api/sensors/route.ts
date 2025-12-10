import { NextResponse } from 'next/server';
import { getCloudantClient, getDatabaseName } from '@/lib/cloudant';
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

    // Process data for charts and alerts
    const chartData = processChartData(docs);
    const alerts = extractAlerts(docs);
    const equipmentStatus = getEquipmentStatus(docs);
    const latestReadings = getLatestReadings(docs);

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        alerts,
        equipmentStatus,
        latestReadings,
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
  // Filter docs with parsed payload and sort by _id (Cloudant IDs are sequential)
  const filteredDocs = docs
    .filter((doc) => doc.payload_parsed)
    .sort((a, b) => a._id.localeCompare(b._id)); // Sort by document ID (oldest first)
  
  // Take the last 100 readings for better visibility
  const recentDocs = filteredDocs.slice(-100);
  
  // Create data points with sequential index for X-axis
  const dataPoints = recentDocs.map((doc, index) => {
    const parsed = doc.payload_parsed!;
    
    return {
      timestamp: doc._id, // Use _id as unique identifier
      time: `#${index + 1}`, // Sequential reading number
      temperature: parsed.temperature,
      vibration: parsed.vibration,
      humidity: parsed.humidity,
      rpm: parsed.rpm,
      current: parsed.current,
    };
  });

  return dataPoints;
}

function extractAlerts(docs: SensorReading[]) {
  const alerts = docs
    .filter((doc) => doc.payload_parsed?.alert === true)
    .map((doc) => {
      const parsed = doc.payload_parsed!;
      const machineName = getMachineNameFromTopic(doc.topic);
      return {
        id: doc._id,
        sensor_id: parsed.sensor_id || machineName,
        equipment_id: parsed.equipment_id || machineName,
        type: parsed.alert_type || 'general',
        message: parsed.alert_message || 'Alert triggered',
        severity: getSeverity(parsed),
        timestamp: parsed.timestamp || doc.timestamp || new Date().toISOString(),
        location: parsed.location,
      };
    })
    .slice(0, 10); // Latest 10 alerts

  return alerts;
}

function getSeverity(parsed: NonNullable<SensorReading['payload_parsed']>): 'critical' | 'warning' | 'info' {
  // Determine severity based on thresholds
  if (parsed.temperature && parsed.temperature > 100) return 'critical';
  if (parsed.vibration && parsed.vibration > 8) return 'critical';
  if (parsed.rpm && parsed.rpm > 5000) return 'critical';
  if (parsed.current && parsed.current > 50) return 'critical';
  
  if (parsed.temperature && parsed.temperature > 80) return 'warning';
  if (parsed.vibration && parsed.vibration > 5) return 'warning';
  if (parsed.rpm && parsed.rpm > 4000) return 'warning';
  if (parsed.current && parsed.current > 40) return 'warning';
  
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
    
    if (parsed?.status === 'offline') status = 'offline';
    else if (parsed?.alert && getSeverity(parsed) === 'critical') status = 'critical';
    else if (parsed?.alert) status = 'warning';
    
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
  // Sort by _id descending to get the most recent document
  const sortedDocs = docs
    .filter((doc) => doc.payload_parsed)
    .sort((a, b) => b._id.localeCompare(a._id)); // Most recent first
  
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

