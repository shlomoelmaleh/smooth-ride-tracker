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
  isCompressing?: boolean;
}

const RideStats: React.FC<RideStatsProps> = ({ ride, stats, onExport, isCompressing }) => {
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
            <h2 className="text-sm font-semibold">Technical Info</h2>
            {ride.metadata ? (
              <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                <p>ID: <span className="font-mono">{ride.id.slice(-8)}</span></p>
                <p>Duration: {ride.metadata.durationSeconds ? ride.metadata.durationSeconds.toFixed(1) + 's' : 'N/A'}</p>
                <p>Accel: {ride.metadata.counts?.accelSamples ?? '0'} ({ride.metadata.sampling?.accelerometerHz ?? '0'} Hz)</p>
                <p>Gyro: {ride.metadata.counts?.gyroSamples ?? '0'} ({ride.metadata.sampling?.gyroscopeHz ?? '0'} Hz)</p>
                <p>GPS Updates: {ride.metadata.counts?.gpsUpdates ?? '0'} ({ride.metadata.sampling?.gpsHz ?? '0'} Hz)</p>
                <p>Dist: {ride.metadata.statsSummary?.gpsDistanceMeters?.toFixed(1) ?? '0'} m</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Extended metadata unavailable</p>
            )}

            {ride.metadata?.qualityFlags && (
              <div className="mt-2 space-y-1">
                {ride.metadata.qualityFlags.isGpsLikelyDuplicated && (
                  <p className="text-[10px] text-amber-500 font-medium">⚠️ GPS data may be duplicated (low update rate)</p>
                )}
                {ride.metadata.qualityFlags.hasLowGpsQuality && (
                  <p className="text-[10px] text-amber-500 font-medium">⚠️ Low GPS quality: {ride.metadata.qualityFlags.gpsQualityReason}</p>
                )}
                {ride.metadata.qualityFlags.dataIntegrity?.hasGaps && (
                  <p className="text-[10px] text-red-500 font-medium">❌ Signal integrity issue: {ride.metadata.qualityFlags.dataIntegrity.gapCount} gaps</p>
                )}
                {ride.metadata.qualityFlags.isStationaryLikely && (
                  <p className="text-[10px] text-blue-500 font-medium">ℹ️ Ride appears to be stationary</p>
                )}
              </div>
            )}
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
            <Button onClick={onExport} disabled={isCompressing}>
              <Download className="h-4 w-4 mr-2" />
              {isCompressing ? 'Compressing...' : 'Export Data (ZIP)'}
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
