
import React from 'react';
import { RideDataPoint } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface SensorGraphsProps {
  dataPoints: RideDataPoint[];
}

const SensorGraphs: React.FC<SensorGraphsProps> = ({ dataPoints }) => {
  // Format data for the accelerometer graph
  const accelerometerData = dataPoints.map((point, index) => {
    const timestamp = new Date(point.timestamp).toLocaleTimeString();
    return {
      name: timestamp,
      x: point.accelerometer.x,
      y: point.accelerometer.y,
      z: point.accelerometer.z,
      index
    };
  });

  // Only include every nth point to avoid overwhelming the graph
  const sampleRate = Math.max(1, Math.floor(accelerometerData.length / 100));
  const sampledData = accelerometerData.filter((_, i) => i % sampleRate === 0);

  // Format data for the gyroscope graph (if available)
  const hasGyroscopeData = dataPoints.some(point => point.gyroscope !== null);
  const gyroscopeData = hasGyroscopeData ? dataPoints.map((point, index) => {
    const timestamp = new Date(point.timestamp).toLocaleTimeString();
    return {
      name: timestamp,
      alpha: point.gyroscope?.alpha || 0,
      beta: point.gyroscope?.beta || 0,
      gamma: point.gyroscope?.gamma || 0,
      index
    };
  }).filter((_, i) => i % sampleRate === 0) : [];

  return (
    <div className="space-y-8 w-full mb-8">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Accelerometer Data</CardTitle>
          <CardDescription>X, Y, Z acceleration values over time</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px] pt-4">
          <ChartContainer
            config={{
              x: { theme: { light: '#ef4444', dark: '#ef4444' } },
              y: { theme: { light: '#22c55e', dark: '#22c55e' } },
              z: { theme: { light: '#3b82f6', dark: '#3b82f6' } },
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={sampledData} 
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="index" 
                  label={{ value: 'Time', position: 'insideBottom', offset: 0 }} 
                  tick={false}
                />
                <YAxis 
                  label={{ value: 'm/s²', angle: -90, position: 'insideLeft', offset: 0 }} 
                  width={30}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="x" name="X-axis" stroke="var(--color-x)" dot={false} />
                <Line type="monotone" dataKey="y" name="Y-axis" stroke="var(--color-y)" dot={false} />
                <Line type="monotone" dataKey="z" name="Z-axis" stroke="var(--color-z)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {hasGyroscopeData && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Gyroscope Data</CardTitle>
            <CardDescription>Orientation values over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] pt-4">
            <ChartContainer
              config={{
                alpha: { theme: { light: '#8b5cf6', dark: '#8b5cf6' } },
                beta: { theme: { light: '#ec4899', dark: '#ec4899' } },
                gamma: { theme: { light: '#f59e0b', dark: '#f59e0b' } },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={gyroscopeData} 
                  margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="index" 
                    label={{ value: 'Time', position: 'insideBottom', offset: 0 }} 
                    tick={false}
                  />
                  <YAxis 
                    label={{ value: 'degrees', angle: -90, position: 'insideLeft', offset: 0 }} 
                    width={30}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line type="monotone" dataKey="alpha" name="Alpha" stroke="var(--color-alpha)" dot={false} />
                  <Line type="monotone" dataKey="beta" name="Beta" stroke="var(--color-beta)" dot={false} />
                  <Line type="monotone" dataKey="gamma" name="Gamma" stroke="var(--color-gamma)" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SensorGraphs;
