'use client';

import { 
  Thermometer, 
  Activity, 
  Wind,
  RotateCw,
  Zap
} from 'lucide-react';
import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: number | null;
  unit: string;
  icon: 'temperature' | 'vibration' | 'humidity' | 'rpm' | 'current';
  status?: 'normal' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
}

const icons: Record<MetricCardProps['icon'], ReactNode> = {
  temperature: <Thermometer className="metric-icon" />,
  vibration: <Activity className="metric-icon" />,
  humidity: <Wind className="metric-icon" />,
  rpm: <RotateCw className="metric-icon" />,
  current: <Zap className="metric-icon" />,
};

const iconColors: Record<MetricCardProps['icon'], string> = {
  temperature: 'text-red-500',
  vibration: 'text-emerald-500',
  humidity: 'text-cyan-500',
  rpm: 'text-purple-500',
  current: 'text-amber-500',
};

export function MetricCard({ title, value, unit, icon, status = 'normal' }: MetricCardProps) {
  const getStatusClass = () => {
    switch (status) {
      case 'critical':
        return 'metric-card-critical';
      case 'warning':
        return 'metric-card-warning';
      default:
        return '';
    }
  };

  return (
    <div className={`metric-card ${getStatusClass()}`}>
      <div className="metric-header">
        <span className={`metric-icon-wrapper ${iconColors[icon]}`}>
          {icons[icon]}
        </span>
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-value-container">
        {value !== null ? (
          <>
            <span className="metric-value">{value.toFixed(1)}</span>
            <span className="metric-unit">{unit}</span>
          </>
        ) : (
          <span className="metric-no-data">No data</span>
        )}
      </div>
      <div className={`metric-status metric-status-${status}`}>
        <span className="metric-status-dot"></span>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    </div>
  );
}

