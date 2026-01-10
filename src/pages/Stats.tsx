import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import RideStats from '@/components/RideStats';
import { BarChart2 } from 'lucide-react';

const Stats = () => {
  const navigate = useNavigate();
  const { rides, getRideStats, exportRideData } = useRideData();
  const [aggrStats, setAggrStats] = useState({
    totalRides: 0,
    totalDistance: 0,
    totalDuration: 0,
    avgSmoothness: 0,
    avgSuddenEvents: 0,
    smoothnessDistribution: [] as { name: string, value: number }[],
    rideTimeline: [] as { date: string, smoothness: number, events: number }[]
  });
  const [showHeavyCharts, setShowHeavyCharts] = useState(false);

  const lastRide = rides.length > 0 ? rides[rides.length - 1] : null;
  const lastRideStats = lastRide ? getRideStats(lastRide) : null;

  useEffect(() => {
    if (rides.length > 0) {
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
        // USE PRECOMPUTED/LIGHTWEIGHT DATA ONLY
        const distance = ride.metadata?.statsSummary?.gpsDistanceMeters || ride.distance || 0;
        const duration = ride.metadata?.durationSeconds || ride.duration || 0;
        const score = ride.smoothnessScore || 0;
        const events = (ride.metadata?.counts?.totalEvents || 0); // Simplified event count from metadata

        totalDistance += distance;
        totalDuration += duration;
        totalSmoothness += score;
        totalSuddenEvents += events;

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

        timelineData[date].smoothness += score;
        timelineData[date].events += events;
        timelineData[date].count++;
      });

      const timeline = Object.entries(timelineData).map(([date, data]) => ({
        date,
        smoothness: Math.round(data.smoothness / data.count),
        events: Math.round(data.events / data.count)
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setAggrStats({
        totalRides,
        totalDistance,
        totalDuration,
        avgSmoothness: Math.round(totalSmoothness / totalRides),
        avgSuddenEvents: Math.round(totalSuddenEvents / totalRides),
        smoothnessDistribution: Object.entries(smoothnessGroups).map(([name, value]) => ({ name, value })),
        rideTimeline: timeline
      });
    }
  }, [rides]); // Removed getRideStats from deps to avoid unnecessary triggers

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
        <div className="bg-white p-2 border rounded shadow-sm text-xs">
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

  if (rides.length === 0) {
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
            />
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Distance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatDistance(aggrStats.totalDistance)}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatDuration(aggrStats.totalDuration)}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Average Smoothness</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{aggrStats.avgSmoothness}<span className="text-lg text-muted-foreground">/100</span></p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {!showHeavyCharts ? (
          <motion.div
            className="glass-panel p-12 text-center rounded-2xl border-dashed border-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <BarChart2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-medium mb-2">Visual Analytics</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Visualizing data for {aggrStats.totalRides} rides might be heavy on some devices.
            </p>
            <Button size="lg" onClick={() => setShowHeavyCharts(true)}>
              Load Charts & Insights
            </Button>
          </motion.div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Ride Smoothness</CardTitle>
                    <CardDescription>Distribution of ride quality</CardDescription>
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
                          {aggrStats.smoothnessDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Ride Timeline</CardTitle>
                    <CardDescription>Smoothness score over time</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={aggrStats.rideTimeline}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="smoothness"
                          name="Smoothness Score"
                          stroke="#3b82f6"
                          activeDot={{ r: 8 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Events Per Ride</CardTitle>
                  <CardDescription>Sudden stops and accelerations</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={aggrStats.rideTimeline}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="events" name="Events" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Stats;
