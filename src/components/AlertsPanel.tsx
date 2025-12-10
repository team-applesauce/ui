'use client';

import { AlertTriangle, AlertCircle, Info, MapPin, Clock } from 'lucide-react';
import { Alert } from '@/types/sensor';
import { formatDistanceToNow } from 'date-fns';

interface AlertsPanelProps {
  alerts: Alert[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const getSeverityIcon = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="alert-icon alert-icon-critical" />;
      case 'warning':
        return <AlertCircle className="alert-icon alert-icon-warning" />;
      default:
        return <Info className="alert-icon alert-icon-info" />;
    }
  };

  const getSeverityClass = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'alert-item-critical';
      case 'warning':
        return 'alert-item-warning';
      default:
        return 'alert-item-info';
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="alerts-panel">
        <div className="alerts-header">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="alerts-title">Active Alerts</h3>
        </div>
        <div className="alerts-empty">
          <div className="alerts-empty-icon">✓</div>
          <p>No active alerts</p>
          <span>All systems operating normally</span>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="alerts-title">Active Alerts</h3>
        <span className="alerts-badge">{alerts.length}</span>
      </div>
      <div className="alerts-list">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-item ${getSeverityClass(alert.severity)}`}>
            <div className="alert-item-header">
              {getSeverityIcon(alert.severity)}
              <span className="alert-type">{alert.type.toUpperCase()}</span>
              <span className={`alert-severity-badge alert-severity-${alert.severity}`}>
                {alert.severity}
              </span>
            </div>
            <p className="alert-message">{alert.message}</p>
            <div className="alert-meta">
              <span className="alert-meta-item">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
              </span>
              {alert.location && (
                <span className="alert-meta-item">
                  <MapPin className="w-3 h-3" />
                  {alert.location}
                </span>
              )}
              <span className="alert-meta-item">
                Equipment: {alert.equipment_id}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

