import React, { useState } from 'react';
import { Download, TrendingUp, MapPin, Clock, BarChart2 } from 'lucide-react';
import type { RideSession, RideStats as RideStatsType } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import SensorGraphs from './SensorGraphs';

interface RideStatsProps {
  ride: RideSession;
  stats: RideStatsType;
  onExport: () => void;
}

const RideStats: React.FC<RideStatsProps> = ({ ride, stats, onExport }) => {
  const [showGraphs, setShowGraphs] = useState(false);

  const formatDuration = (durationInSeconds: number): string => {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);

    let formatted = '';
    if (hours > 0) {
      formatted += `${hours}h `;
    }
    if (minutes > 0 || hours > 0) {
      formatted += `${minutes}m `;
    }
    formatted += `${seconds}s`;

    return formatted;
  };

  const formatDistance = (distanceInMeters: number): string => {
    const distanceInKilometers = distanceInMeters / 1000;
    return `${distanceInKilometers.toFixed(2)} km`;
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Ride Statistics</CardTitle>
          <CardDescription>Summary of your recent ride</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Smoothness Score</h2>
            </div>
            <Progress value={ride.smoothnessScore || 0} />
            <p className="text-sm text-muted-foreground">
              {ride.smoothnessScore?.toFixed(0) || 0}%
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Distance</h2>
            </div>
            <p className="text-sm">
              {formatDistance(ride.distance || 0)}
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Duration</h2>
            </div>
            <p className="text-sm">
              {formatDuration(ride.duration || 0)}
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Average Acceleration</h2>
            <p className="text-sm">
              {stats.averageAcceleration.toFixed(2)} m/s²
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Max Acceleration</h2>
            <p className="text-sm">
              {stats.maxAcceleration.toFixed(2)} m/s²
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Sudden Stops</h2>
            <p className="text-sm">
              {stats.suddenStops}
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Sudden Accelerations</h2>
            <p className="text-sm">
              {stats.suddenAccelerations}
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Vibration Level</h2>
            <p className="text-sm">
              {stats.vibrationLevel.toFixed(2)}
            </p>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Sampling Stats</h2>
            <div className="text-xs text-muted-foreground">
              <p>Samples: {ride.dataPoints.length}</p>
              <p>Duration: {((ride.endTime || Date.now()) - ride.startTime).toFixed(0)} ms</p>
              <p>Rate: {(ride.dataPoints.length / (((ride.endTime || Date.now()) - ride.startTime) / 1000)).toFixed(1)} Hz</p>
            </div>
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Battery Impact</h2>
            <p className="text-sm">
              {ride.startBattery !== undefined && ride.endBattery !== undefined
                ? `Used: ${((ride.startBattery - ride.endBattery) * 100).toFixed(1)}%`
                : 'Not available on this device/browser'}
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Recorded on {new Date(ride.startTime).toLocaleDateString()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGraphs(!showGraphs)}>
              <BarChart2 className="h-4 w-4 mr-2" />
              {showGraphs ? 'Hide Graphs' : 'Show Graphs'}
            </Button>
            <Button onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>
        </CardFooter>
      </Card>

      {showGraphs && ride.dataPoints.length > 0 && (
        <SensorGraphs dataPoints={ride.dataPoints} />
      )}
    </div>
  );
};

export default RideStats;
