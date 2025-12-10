'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Flame } from 'lucide-react';
import { SensorChart } from '@/components/SensorChart';
import { AlertsPanel } from '@/components/AlertsPanel';
import { MetricCard } from '@/components/MetricCard';
import { EquipmentStatus } from '@/components/EquipmentStatus';
import { ChartDataPoint, Alert, EquipmentStatus as EquipmentStatusType } from '@/types/sensor';

interface DashboardData {
  chartData: ChartDataPoint[];
  alerts: Alert[];
  equipmentStatus: EquipmentStatusType[];
  latestReadings: {
    temperature: number | null;
    vibration: number | null;
    humidity: number | null;
    rpm: number | null;
    current: number | null;
  };
  totalReadings: number;
}

function getMetricStatus(value: number | null, metric: string): 'normal' | 'warning' | 'critical' {
  if (value === null) return 'normal';
  
  switch (metric) {
    case 'temperature':
      if (value > 100) return 'critical';
      if (value > 80) return 'warning';
      return 'normal';
    case 'vibration':
      if (value > 8) return 'critical';
      if (value > 5) return 'warning';
      return 'normal';
    case 'rpm':
      if (value > 5000) return 'critical';
      if (value > 4000) return 'warning';
      return 'normal';
    case 'current':
      if (value > 50) return 'critical';
      if (value > 40) return 'warning';
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
  }, []);

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

  const { chartData, alerts, equipmentStatus, latestReadings, totalReadings } = data || {
    chartData: [],
    alerts: [],
    equipmentStatus: [],
    latestReadings: { temperature: null, vibration: null, humidity: null, rpm: null, current: null },
    totalReadings: 0,
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="dashboard-logo">
          <div className="dashboard-logo-icon">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="dashboard-title">PredictiveOps</h1>
            <p className="dashboard-subtitle">Oil & Gas Predictive Maintenance System</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="ibm-badge">
            Powered by <span>IBM Cloudant</span>
          </div>
          
          <button 
            className="refresh-button" 
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Updating...' : 'Refresh'}
          </button>
          
          <div className="dashboard-status">
            <span className={`status-indicator ${refreshing ? 'loading' : ''}`}></span>
            <span className="status-text">
              {lastUpdated 
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Live'
              }
            </span>
          </div>
        </div>
      </header>

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
      <div className="charts-section">
        <SensorChart
          data={chartData}
          title="🌡️ Temperature Trend"
          dataKey="temperature"
          color="#ef4444"
          unit="°C"
          minValue={0}
          maxValue={100}
        />
        <SensorChart
          data={chartData}
          title="📈 Vibration Analysis"
          dataKey="vibration"
          color="#10b981"
          unit=" mm/s"
          minValue={0}
          maxValue={30}
        />
        <SensorChart
          data={chartData}
          title="⚙️ RPM Monitor"
          dataKey="rpm"
          color="#8b5cf6"
          unit=""
          minValue={0}
          maxValue={3000}
        />
        <SensorChart
          data={chartData}
          title="⚡ Current Monitor"
          dataKey="current"
          color="#f59e0b"
          unit=" A"
          minValue={0}
          maxValue={60}
        />
        <SensorChart
          data={chartData}
          title="💨 Humidity Trend"
          dataKey="humidity"
          color="#06b6d4"
          unit="%"
          minValue={0}
          maxValue={100}
        />
      </div>

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
        Monitoring {totalReadings} sensor readings • {equipmentStatus.length} equipment units tracked
      </div>
    </div>
  );
}
