
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
      <Card>
        <CardHeader>
          <CardTitle>Accelerometer Data</CardTitle>
          <CardDescription>X, Y, Z acceleration values over time</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] px-4 py-6">
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
                  margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="index"
                    label={{ value: 'Time', position: 'insideBottomRight', offset: -15 }}
                    tick={false}
                    axisLine={{ strokeWidth: 1.5 }}
                  />
                  <YAxis
                    label={{ value: 'm/s²', angle: -90, position: 'insideLeft', offset: 15 }}
                    width={60}
                    axisLine={{ strokeWidth: 1.5 }}
                    tickMargin={10}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend verticalAlign="top" height={40} />
                  <Line type="monotone" dataKey="x" name="X-axis" stroke="var(--color-x)" dot={false} />
                  <Line type="monotone" dataKey="y" name="Y-axis" stroke="var(--color-y)" dot={false} />
                  <Line type="monotone" dataKey="z" name="Z-axis" stroke="var(--color-z)" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {hasGyroscopeData && (
        <Card>
          <CardHeader>
            <CardTitle>Gyroscope Data</CardTitle>
            <CardDescription>Orientation values over time</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] px-4 py-6">
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
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Time', position: 'insideBottomRight', offset: -15 }}
                      tick={false}
                      axisLine={{ strokeWidth: 1.5 }}
                    />
                    <YAxis
                      label={{ value: 'degrees', angle: -90, position: 'insideLeft', offset: 15 }}
                      width={60}
                      axisLine={{ strokeWidth: 1.5 }}
                      tickMargin={10}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend verticalAlign="top" height={40} />
                    <Line type="monotone" dataKey="alpha" name="Alpha" stroke="var(--color-alpha)" dot={false} />
                    <Line type="monotone" dataKey="beta" name="Beta" stroke="var(--color-beta)" dot={false} />
                    <Line type="monotone" dataKey="gamma" name="Gamma" stroke="var(--color-gamma)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {dataPoints.some(p => p.earth !== null) && (
        <Card>
          <CardHeader>
            <CardTitle>Earth-Relative Acceleration</CardTitle>
            <CardDescription>Acceleration transformed to Earth Frame (Neutralized tilt)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] px-4 py-6">
              <ChartContainer
                config={{
                  ex: { theme: { light: '#ef4444', dark: '#ef4444' } },
                  ey: { theme: { light: '#22c55e', dark: '#22c55e' } },
                  ez: { theme: { light: '#3b82f6', dark: '#3b82f6' } },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dataPoints.filter((_, i) => i % sampleRate === 0).map((p, i) => ({
                      index: i,
                      ex: p.earth?.x,
                      ey: p.earth?.y,
                      ez: p.earth?.z
                    }))}
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Time', position: 'insideBottomRight', offset: -15 }}
                      tick={false}
                      axisLine={{ strokeWidth: 1.5 }}
                    />
                    <YAxis
                      label={{ value: 'm/s²', angle: -90, position: 'insideLeft', offset: 15 }}
                      width={60}
                      axisLine={{ strokeWidth: 1.5 }}
                      tickMargin={10}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend verticalAlign="top" height={40} />
                    <Line type="monotone" dataKey="ez" name="Vertical (Z)" stroke="var(--color-ez)" dot={false} />
                    <Line type="monotone" dataKey="ey" name="Lateral (Y)" stroke="var(--color-ey)" dot={false} />
                    <Line type="monotone" dataKey="ex" name="Longitudinal (X)" stroke="var(--color-ex)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {dataPoints.some(p => p.location !== null) && (
        <Card>
          <CardHeader>
            <CardTitle>GPS Data</CardTitle>
            <CardDescription>Latitude and Longitude updates</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] px-4 py-6">
              <ChartContainer
                config={{
                  lat: { theme: { light: '#06b6d4', dark: '#06b6d4' } },
                  lng: { theme: { light: '#84cc16', dark: '#84cc16' } },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dataPoints.filter((_, i) => i % sampleRate === 0).map((p, i) => ({
                      index: i,
                      lat: p.location?.latitude,
                      lng: p.location?.longitude
                    }))}
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Time', position: 'insideBottomRight', offset: -15 }}
                      tick={false}
                      axisLine={{ strokeWidth: 1.5 }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      label={{ value: 'Coordin.', angle: -90, position: 'insideLeft', offset: 15 }}
                      width={60}
                      axisLine={{ strokeWidth: 1.5 }}
                      tickMargin={10}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend verticalAlign="top" height={40} />
                    <Line type="step" dataKey="lat" name="Latitude" stroke="var(--color-lat)" dot={false} strokeWidth={2} />
                    <Line type="step" dataKey="lng" name="Longitude" stroke="var(--color-lng)" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SensorGraphs;
