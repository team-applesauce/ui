'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartDataPoint } from '@/types/sensor';

interface SensorChartProps {
  data: ChartDataPoint[];
  title: string;
  dataKey: keyof Omit<ChartDataPoint, 'timestamp' | 'time'>;
  color: string;
  unit: string;
  minValue?: number;
  maxValue?: number;
}

export function SensorChart({
  data,
  title,
  dataKey,
  color,
  unit,
  minValue,
  maxValue,
}: SensorChartProps) {
  const filteredData = data.filter((d) => d[dataKey] !== undefined);
  
  // Calculate tick interval to show more x-axis labels
  const tickInterval = Math.max(1, Math.floor(filteredData.length / 20));

  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis 
              dataKey="time" 
              stroke="#6b7280" 
              fontSize={9}
              tickLine={false}
              interval={tickInterval}
              angle={-45}
              textAnchor="end"
              height={40}
            />
            <YAxis 
              stroke="#6b7280" 
              fontSize={10}
              tickLine={false}
              domain={[minValue ?? 'auto', maxValue ?? 'auto']}
              tickFormatter={(value) => `${value}`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f9fafb',
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value: number) => [`${value.toFixed(2)}${unit}`, title]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface MultiLineChartProps {
  data: ChartDataPoint[];
  title: string;
}

export function MultiLineChart({ data, title }: MultiLineChartProps) {
  return (
    <div className="chart-card chart-card-large">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-container-large">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis 
              dataKey="time" 
              stroke="#6b7280" 
              fontSize={11}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280" 
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f9fafb',
              }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="temperature"
              name="Temperature (°C)"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="vibration"
              name="Vibration (mm/s)"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="rpm"
              name="RPM"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="current"
              name="Current (A)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

