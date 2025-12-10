'use client';

import { AlertTriangle, AlertCircle, Info, Clock, Cpu, Timer } from 'lucide-react';
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

  const formatProbability = (prob: number) => {
    return `${Math.round(prob * 100)}%`;
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
            
            {/* Metadata: Failure Probability & RUL */}
            {alert.metadata && (
              <div className="alert-metadata">
                {alert.metadata.failure_probability !== undefined && (
                  <span className="alert-metadata-item alert-probability">
                    <span className="metadata-label">Failure Risk:</span>
                    <span className={`metadata-value ${alert.metadata.failure_probability > 0.7 ? 'high' : alert.metadata.failure_probability > 0.4 ? 'medium' : 'low'}`}>
                      {formatProbability(alert.metadata.failure_probability)}
                    </span>
                  </span>
                )}
                {alert.metadata.rul_hours !== undefined && (
                  <span className="alert-metadata-item alert-rul">
                    <Timer className="w-3 h-3" />
                    <span className="metadata-label">RUL:</span>
                    <span className="metadata-value">{alert.metadata.rul_hours}h</span>
                  </span>
                )}
              </div>
            )}
            
            <div className="alert-meta">
              <span className="alert-meta-item">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
              </span>
              <span className="alert-meta-item">
                <Cpu className="w-3 h-3" />
                {alert.equipment_id}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

