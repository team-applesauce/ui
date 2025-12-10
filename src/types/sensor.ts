export interface SensorReading {
  _id: string;
  _rev: string;
  topic: string;
  payload: string;
  payload_parsed?: {
    sensor_id?: string;
    temperature?: number;
    vibration?: number;
    humidity?: number;
    rpm?: number;
    current?: number;
    timestamp?: string;
    equipment_id?: string;
    location?: string;
    status?: string;
    alert?: boolean;
    alert_type?: string;
    alert_message?: string;
  };
  qos: number;
  type: string;
  timestamp?: string;
}

export interface ChartDataPoint {
  timestamp: string;
  time: string;
  temperature?: number;
  vibration?: number;
  humidity?: number;
  rpm?: number;
  current?: number;
}

export interface Alert {
  id: string;
  sensor_id: string;
  equipment_id: string;
  type: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  location?: string;
  status?: 'active' | 'resolved' | 'acknowledged';
  metadata?: {
    rul_hours?: number;
    failure_probability?: number;
  };
}

export interface EquipmentStatus {
  id: string;
  name: string;
  status: 'operational' | 'warning' | 'critical' | 'offline';
  lastReading: string;
  location: string;
}

