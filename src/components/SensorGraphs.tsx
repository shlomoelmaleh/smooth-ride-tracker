
import React from 'react';
import { RideDataPoint } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface SensorGraphsProps {
  dataPoints: RideDataPoint[];
}

const SensorGraphs: React.FC<SensorGraphsProps> = ({ dataPoints }) => {
  // 1. EARLY EXIT FOR PERFORMANCE
  if (!dataPoints || dataPoints.length === 0) {
    return <div className="p-4 text-center text-muted-foreground italic">No sensor data recorded for this ride.</div>;
  }

  // 2. STRIKE A BALANCE: Maximum points to try to render (Recharts slows down > 1000-2000)
  const MAX_POINTS = 1200;
  const sampleRate = Math.max(1, Math.floor(dataPoints.length / MAX_POINTS));

  // 3. OPTIMIZED MAPPING: Only process points we'll actually show
  const displayData = React.useMemo(() => {
    const sampled = dataPoints.filter((_, i) => i % sampleRate === 0).slice(0, MAX_POINTS);

    return sampled.map((point, index) => {
      // Lazy format time only for display (optional: better to use raw timestamp and format in Tooltip)
      return {
        timestamp: point.timestamp,
        index: index * sampleRate,
        ax: point.accelerometer.x,
        ay: point.accelerometer.y,
        az: point.accelerometer.z,
        gx: point.gyroscope?.alpha || 0,
        gy: point.gyroscope?.beta || 0,
        gz: point.gyroscope?.gamma || 0,
        ex: point.earth?.x,
        ey: point.earth?.y,
        ez: point.earth?.z,
        lat: point.location?.latitude,
        lng: point.location?.longitude
      };
    });
  }, [dataPoints, sampleRate]);

  const hasGyroscopeData = dataPoints.some(point => point.gyroscope !== null);
  const hasEarthData = dataPoints.some(p => p.earth !== null);
  const hasLocationData = dataPoints.some(p => p.location !== null);

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
                  data={displayData}
                  margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="index"
                    label={{ value: 'Samples', position: 'insideBottomRight', offset: -15 }}
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
                  <Line type="monotone" dataKey="ax" name="X-axis" stroke="var(--color-x)" dot={false} strokeWidth={1} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ay" name="Y-axis" stroke="var(--color-y)" dot={false} strokeWidth={1} isAnimationActive={false} />
                  <Line type="monotone" dataKey="az" name="Z-axis" stroke="var(--color-z)" dot={false} strokeWidth={1} isAnimationActive={false} />
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
                  gx: { theme: { light: '#8b5cf6', dark: '#8b5cf6' } },
                  gy: { theme: { light: '#ec4899', dark: '#ec4899' } },
                  gz: { theme: { light: '#f59e0b', dark: '#f59e0b' } },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={displayData}
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Samples', position: 'insideBottomRight', offset: -15 }}
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
                    <Line type="monotone" dataKey="gx" name="Alpha" stroke="var(--color-gx)" dot={false} strokeWidth={1} isAnimationActive={false} />
                    <Line type="monotone" dataKey="gy" name="Beta" stroke="var(--color-gy)" dot={false} strokeWidth={1} isAnimationActive={false} />
                    <Line type="monotone" dataKey="gz" name="Gamma" stroke="var(--color-gz)" dot={false} strokeWidth={1} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {hasEarthData && (
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
                    data={displayData}
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Samples', position: 'insideBottomRight', offset: -15 }}
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
                    <Line type="monotone" dataKey="ez" name="Vertical (Z)" stroke="var(--color-ez)" dot={false} strokeWidth={1} isAnimationActive={false} />
                    <Line type="monotone" dataKey="ey" name="Lateral (Y)" stroke="var(--color-ey)" dot={false} strokeWidth={1} isAnimationActive={false} />
                    <Line type="monotone" dataKey="ex" name="Longitudinal (X)" stroke="var(--color-ex)" dot={false} strokeWidth={1} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {hasLocationData && (
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
                    data={displayData}
                    margin={{ top: 30, right: 45, left: 45, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Samples', position: 'insideBottomRight', offset: -15 }}
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
                    <Line type="step" dataKey="lat" name="Latitude" stroke="var(--color-lat)" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="step" dataKey="lng" name="Longitude" stroke="var(--color-lng)" dot={false} strokeWidth={2} isAnimationActive={false} />
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
