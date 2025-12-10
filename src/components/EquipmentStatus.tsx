'use client';

import { Server, MapPin, Clock } from 'lucide-react';
import { EquipmentStatus as EquipmentStatusType } from '@/types/sensor';
import { formatDistanceToNow } from 'date-fns';

interface EquipmentStatusProps {
  equipment: EquipmentStatusType[];
}

export function EquipmentStatus({ equipment }: EquipmentStatusProps) {
  const getStatusColor = (status: EquipmentStatusType['status']) => {
    switch (status) {
      case 'operational':
        return 'equipment-status-operational';
      case 'warning':
        return 'equipment-status-warning';
      case 'critical':
        return 'equipment-status-critical';
      case 'offline':
        return 'equipment-status-offline';
    }
  };

  const getStatusText = (status: EquipmentStatusType['status']) => {
    switch (status) {
      case 'operational':
        return 'Operational';
      case 'warning':
        return 'Warning';
      case 'critical':
        return 'Critical';
      case 'offline':
        return 'Offline';
    }
  };

  if (equipment.length === 0) {
    return (
      <div className="equipment-panel">
        <div className="equipment-header">
          <Server className="w-5 h-5 text-blue-500" />
          <h3 className="equipment-title">Equipment Status</h3>
        </div>
        <div className="equipment-empty">
          <p>No equipment data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="equipment-panel">
      <div className="equipment-header">
        <Server className="w-5 h-5 text-blue-500" />
        <h3 className="equipment-title">Equipment Status</h3>
        <span className="equipment-count">{equipment.length} units</span>
      </div>
      <div className="equipment-grid">
        {equipment.map((eq) => (
          <div key={eq.id} className="equipment-card">
            <div className="equipment-card-header">
              <span className="equipment-name">{eq.name}</span>
              <span className={`equipment-badge ${getStatusColor(eq.status)}`}>
                {getStatusText(eq.status)}
              </span>
            </div>
            <div className="equipment-meta">
              <span className="equipment-meta-item">
                <MapPin className="w-3 h-3" />
                {eq.location}
              </span>
              <span className="equipment-meta-item">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(eq.lastReading), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

