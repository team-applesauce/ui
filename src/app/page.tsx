'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { SensorChart } from '@/components/SensorChart';
import { AlertsPanel } from '@/components/AlertsPanel';
import { MetricCard } from '@/components/MetricCard';
import { EquipmentStatus } from '@/components/EquipmentStatus';
import { Navbar } from '@/components/Navbar';
import { ChartDataPoint, Alert, EquipmentStatus as EquipmentStatusType } from '@/types/sensor';

interface Machine {
  id: string;
  name: string;
  topic: string;
}

interface LatestReadings {
  temperature: number | null;
  vibration: number | null;
  humidity: number | null;
  rpm: number | null;
  current: number | null;
}

interface DashboardData {
  machines: Machine[];
  chartData: ChartDataPoint[];
  chartDataByMachine: Record<string, ChartDataPoint[]>;
  alerts: Alert[];
  equipmentStatus: EquipmentStatusType[];
  latestReadings: LatestReadings;
  latestReadingsByMachine: Record<string, LatestReadings>;
  totalReadings: number;
}

function getMetricStatus(value: number | null, metric: string): 'normal' | 'warning' | 'critical' {
  if (value === null) return 'normal';
  
  switch (metric) {
    case 'temperature':
      // Faulty threshold: >= 50
      if (value >= 50) return 'critical';
      return 'normal';
    case 'vibration':
      // Faulty range: 0.6 to 1.2
      if (value >= 0.6 && value <= 1.2) return 'critical';
      return 'normal';
    case 'rpm':
      if (value > 5000) return 'critical';
      if (value > 4000) return 'warning';
      return 'normal';
    case 'current':
      // Faulty range: 6.0 to 8.0
      if (value >= 6.0 && value <= 8.0) return 'critical';
      return 'normal';
    default:
      return 'normal';
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      
      const response = await fetch('/api/sensors');
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date());
        setError(null);
        
        // Auto-select first machine if none selected
        if (!selectedMachine && result.data.machines?.length > 0) {
          setSelectedMachine(result.data.machines[0].name);
        }
      } else {
        setError(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Unable to connect to the server');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMachine]);

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Initializing sensors...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-container">
          <div className="error-icon">⚠</div>
          <h2 className="error-title">Connection Error</h2>
          <p className="error-message">{error}</p>
          <button className="retry-button" onClick={() => fetchData()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { 
    machines = [], 
    chartDataByMachine = {}, 
    alerts = [], 
    equipmentStatus = [], 
    latestReadingsByMachine = {},
    totalReadings = 0 
  } = data || {};

  // Get data for selected machine
  const chartData = selectedMachine ? (chartDataByMachine[selectedMachine] || []) : [];
  const latestReadings = selectedMachine 
    ? (latestReadingsByMachine[selectedMachine] || { temperature: null, vibration: null, humidity: null, rpm: null, current: null })
    : { temperature: null, vibration: null, humidity: null, rpm: null, current: null };

  return (
    <div className="dashboard">
      {/* Header */}
      <Navbar
        showRefresh={true}
        onRefresh={() => fetchData(true)}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
      />

      {/* Machine Selector */}
      <div className="machine-selector-container">
        <label className="machine-selector-label">Select Machine:</label>
        <div className="machine-selector-wrapper">
          <button 
            className="machine-selector-button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span>{selectedMachine || 'Select a machine'}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {dropdownOpen && (
            <div className="machine-selector-dropdown">
              {machines.map((machine) => (
                <button
                  key={machine.id}
                  className={`machine-selector-option ${selectedMachine === machine.name ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedMachine(machine.name);
                    setDropdownOpen(false);
                  }}
                >
                  <span className="machine-option-name">{machine.name}</span>
                  <span className="machine-option-topic">{machine.topic}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Machine quick select buttons */}
        <div className="machine-tabs">
          {machines.map((machine) => (
            <button
              key={machine.id}
              className={`machine-tab ${selectedMachine === machine.name ? 'active' : ''}`}
              onClick={() => setSelectedMachine(machine.name)}
            >
              {machine.name}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <MetricCard
          title="Temperature"
          value={latestReadings.temperature}
          unit="°C"
          icon="temperature"
          status={getMetricStatus(latestReadings.temperature, 'temperature')}
        />
        <MetricCard
          title="Vibration"
          value={latestReadings.vibration}
          unit="mm/s"
          icon="vibration"
          status={getMetricStatus(latestReadings.vibration, 'vibration')}
        />
        <MetricCard
          title="RPM"
          value={latestReadings.rpm}
          unit="rpm"
          icon="rpm"
          status={getMetricStatus(latestReadings.rpm, 'rpm')}
        />
        <MetricCard
          title="Current"
          value={latestReadings.current}
          unit="A"
          icon="current"
          status={getMetricStatus(latestReadings.current, 'current')}
        />
        <MetricCard
          title="Humidity"
          value={latestReadings.humidity}
          unit="%"
          icon="humidity"
        />
      </div>

      {/* Charts Section */}
      {selectedMachine && chartData.length > 0 ? (
        <div className="charts-section">
          <SensorChart
            data={chartData}
            title={`🌡️ Temperature - ${selectedMachine}`}
            dataKey="temperature"
            color="#ef4444"
            unit="°C"
            minValue={0}
            maxValue={100}
          />
          <SensorChart
            data={chartData}
            title={`📈 Vibration - ${selectedMachine}`}
            dataKey="vibration"
            color="#10b981"
            unit=" mm/s"
            minValue={0}
            maxValue={30}
          />
          <SensorChart
            data={chartData}
            title={`⚙️ RPM - ${selectedMachine}`}
            dataKey="rpm"
            color="#8b5cf6"
            unit=""
            minValue={0}
            maxValue={3000}
          />
          <SensorChart
            data={chartData}
            title={`⚡ Current - ${selectedMachine}`}
            dataKey="current"
            color="#f59e0b"
            unit=" A"
            minValue={0}
            maxValue={60}
          />
          <SensorChart
            data={chartData}
            title={`💨 Humidity - ${selectedMachine}`}
            dataKey="humidity"
            color="#06b6d4"
            unit="%"
            minValue={0}
            maxValue={100}
          />
        </div>
      ) : (
        <div className="no-data-message">
          <p>Select a machine to view sensor data</p>
        </div>
      )}

      {/* Bottom Section: Alerts & Equipment */}
      <div className="bottom-section">
        <AlertsPanel alerts={alerts} />
        <EquipmentStatus equipment={equipmentStatus} />
      </div>

      {/* Footer Stats */}
      <div style={{ 
        marginTop: '1.5rem', 
        textAlign: 'center', 
        color: 'var(--text-muted)',
        fontSize: '0.75rem'
      }}>
        Monitoring {totalReadings} sensor readings • {machines.length} machines tracked
      </div>
    </div>
  );
}
