import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, YAxis, XAxis, Tooltip } from 'recharts';
import { RideDataPoint } from '@/types';

interface LiveChartsProps {
    data: RideDataPoint[];
}

const LiveCharts: React.FC<LiveChartsProps> = ({ data }) => {
    // Map data to chart format
    const chartData = useMemo(() => {
        return data.map(p => ({
            time: p.timestamp,
            accel: Math.sqrt(
                (p.accelerometer.x ** 2) +
                (p.accelerometer.y ** 2) +
                (p.accelerometer.z ** 2)
            )
        }));
    }, [data]);

    if (data.length < 2) {
        return (
            <div className="h-40 w-full flex items-center justify-center bg-muted/10 rounded-xl border border-dashed border-muted">
                <span className="text-xs text-muted-foreground animate-pulse">Waiting for vibration data...</span>
            </div>
        );
    }

    return (
        <div className="h-40 w-full bg-muted/5 rounded-xl border border-primary/10 overflow-hidden relative">
            <div className="absolute top-2 left-3 z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Live Vibration</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <Line
                        type="monotone"
                        dataKey="accel"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <YAxis hide domain={[0, 'auto']} />
                    <XAxis hide dataKey="time" />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-background/90 backdrop-blur-sm border border-primary/20 p-2 rounded text-[10px] shadow-xl">
                                        {payload[0].value?.toLocaleString()} m/s²
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default LiveCharts;
