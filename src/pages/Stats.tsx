import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import RideStats from '@/components/RideStats';

const Stats = () => {
  const navigate = useNavigate();
  const { rides, getRideStats, exportRideData, exportStatus } = useRideData();
  const [aggrStats, setAggrStats] = useState({
    totalRides: 0,
    totalDistance: 0,
    totalDuration: 0,
    avgSmoothness: 0,
    avgSuddenEvents: 0,
    smoothnessDistribution: [] as { name: string, value: number }[],
    rideTimeline: [] as { date: string, smoothness: number, events: number }[]
  });

  const lastRide = (rides && rides.length > 0) ? rides[rides.length - 1] : null;
  const lastRideStats = lastRide ? getRideStats(lastRide) : null;

  useEffect(() => {
    if (rides && rides.length > 0) {
      const totalRides = rides.length;
      let totalDistance = 0;
      let totalDuration = 0;
      let totalSmoothness = 0;
      let totalSuddenEvents = 0;

      const smoothnessGroups = {
        'Very Smooth': 0,
        'Smooth': 0,
        'Average': 0,
        'Bumpy': 0,
        'Very Bumpy': 0
      };

      const timelineData: { [key: string]: { smoothness: number, events: number, count: number } } = {};

      rides.forEach(ride => {
        const stats = getRideStats(ride);

        totalDistance += (stats?.distance || 0);
        totalDuration += (stats?.duration || 0);
        totalSmoothness += (ride.smoothnessScore || 0);
        totalSuddenEvents += ((stats?.suddenStops || 0) + (stats?.suddenAccelerations || 0));

        const score = ride.smoothnessScore || 0;
        if (score >= 85) smoothnessGroups['Very Smooth']++;
        else if (score >= 70) smoothnessGroups['Smooth']++;
        else if (score >= 50) smoothnessGroups['Average']++;
        else if (score >= 30) smoothnessGroups['Bumpy']++;
        else smoothnessGroups['Very Bumpy']++;

        const date = new Date(ride.startTime).toLocaleDateString();
        if (!timelineData[date]) {
          timelineData[date] = {
            smoothness: 0,
            events: 0,
            count: 0
          };
        }

        timelineData[date].smoothness += (ride.smoothnessScore || 0);
        timelineData[date].events += ((stats?.suddenStops || 0) + (stats?.suddenAccelerations || 0));
        timelineData[date].count++;
      });

      const timeline = Object.entries(timelineData).map(([date, data]) => ({
        date,
        smoothness: Math.round(data.smoothness / Math.max(1, data.count)),
        events: Math.round(data.events / Math.max(1, data.count))
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setAggrStats({
        totalRides,
        totalDistance,
        totalDuration,
        avgSmoothness: Math.round(totalSmoothness / Math.max(1, totalRides)),
        avgSuddenEvents: Math.round(totalSuddenEvents / Math.max(1, totalRides)),
        smoothnessDistribution: Object.entries(smoothnessGroups).map(([name, value]) => ({ name, value })),
        rideTimeline: timeline
      });
    }
  }, [rides, getRideStats]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters.toFixed(0)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const COLORS = ['#4ade80', '#22d3ee', '#fcd34d', '#fb923c', '#f87171'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border rounded shadow-sm text-xs text-black">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!rides || rides.length === 0) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-12">
          <motion.div
            className="glass-panel p-8 rounded-2xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-xl font-semibold mb-4">No Ride Data Yet</h1>
            <p className="text-muted-foreground mb-6">
              Start tracking your rides to see statistics and insights here.
            </p>
            <Button onClick={() => navigate('/')}>
              Go to Home Page
            </Button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-5xl mx-auto">
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-semibold">Your Ride Statistics</h1>
          <p className="text-muted-foreground">
            Insights from {aggrStats.totalRides} recorded rides
          </p>
        </motion.div>

        {lastRide && lastRideStats && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <RideStats
              ride={lastRide}
              stats={lastRideStats}
              onExport={() => exportRideData(lastRide)}
              isCompressing={exportStatus !== 'idle' && exportStatus !== 'done' && exportStatus !== 'error'}
            />
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total Distance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatDistance(aggrStats.totalDistance)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatDuration(aggrStats.totalDuration)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Avg Smoothness</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{aggrStats.avgSmoothness}<span className="text-lg text-muted-foreground">/100</span></p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Ride Quality</CardTitle>
              <CardDescription>Distribution across sessions</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aggrStats.smoothnessDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {aggrStats.smoothnessDistribution.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Smoothing score trend</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aggrStats.rideTimeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="smoothness" name="Score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Stats;
