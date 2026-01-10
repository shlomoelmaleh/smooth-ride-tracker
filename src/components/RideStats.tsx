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

  const formatDuration = (durationInSeconds: number | undefined): string => {
    if (durationInSeconds === undefined || isNaN(durationInSeconds)) return 'N/A';
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);

    let formatted = '';
    if (hours > 0) formatted += `${hours}h `;
    if (minutes > 0 || hours > 0) formatted += `${minutes}m `;
    formatted += `${seconds}s`;

    return formatted || '0s';
  };

  const formatDistance = (distanceInMeters: number | undefined): string => {
    if (distanceInMeters === undefined || isNaN(distanceInMeters)) return 'N/A';
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
              <h2 className="text-sm font-semibold">Smoothness</h2>
            </div>
            <Progress value={ride?.smoothnessScore || 0} />
            <p className="text-sm text-muted-foreground">
              {ride?.smoothnessScore?.toFixed(0) || 0}%
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase">Distance</span>
              </div>
              <p className="text-sm font-medium">
                {formatDistance(ride?.distance || stats?.distance)}
              </p>
            </div>

            <div className="grid gap-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase">Duration</span>
              </div>
              <p className="text-sm font-medium">
                {formatDuration(ride?.duration || stats?.duration)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-8 pt-2 border-t mt-2">
            <div className="grid gap-0.5">
              <h3 className="text-[10px] text-muted-foreground uppercase font-bold">Avg Accel</h3>
              <p className="text-xs">{stats?.averageAcceleration?.toFixed(2) || '0.00'} m/s²</p>
            </div>
            <div className="grid gap-0.5">
              <h3 className="text-[10px] text-muted-foreground uppercase font-bold">Max Accel</h3>
              <p className="text-xs">{stats?.maxAcceleration?.toFixed(2) || '0.00'} m/s²</p>
            </div>
            <div className="grid gap-0.5">
              <h3 className="text-[10px] text-muted-foreground uppercase font-bold">Sudden Stops</h3>
              <p className="text-xs">{stats?.suddenStops ?? 0}</p>
            </div>
            <div className="grid gap-0.5">
              <h3 className="text-[10px] text-muted-foreground uppercase font-bold">Vibration</h3>
              <p className="text-xs">{stats?.vibrationLevel?.toFixed(2) || '0.00'}</p>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h2 className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Technical Insights</h2>
            <div className="text-[10px] text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
              <p>ID: <span className="font-mono">{(ride?.id || '').slice(-8)}</span></p>
              <p>Duration: {ride?.metadata?.durationMs ? (ride.metadata.durationMs / 1000).toFixed(1) + 's' : 'N/A'}</p>
              <p>Accel: {ride?.metadata?.counts?.accelSamples ?? '0'} ({ride?.metadata?.sampling?.accelerometerHz ?? '0'} Hz)</p>
              <p>GPS: {ride?.metadata?.counts?.gpsUpdates ?? '0'} ({ride?.metadata?.sampling?.gpsHz ?? '0'} Hz)</p>
            </div>

            {ride?.metadata?.qualityFlags && (
              <div className="mt-3 space-y-1">
                {ride.metadata.qualityFlags.isGpsLikelyDuplicated && (
                  <p className="text-[10px] text-amber-500 font-medium">⚠️ GPS data may be low resolution</p>
                )}
                {ride.metadata.qualityFlags.hasLowGpsQuality && (
                  <p className="text-[10px] text-amber-500 font-medium">⚠️ {ride.metadata.qualityFlags.gpsQualityReason}</p>
                )}
                {ride.metadata.qualityFlags.dataIntegrity?.hasGaps && (
                  <p className="text-[10px] text-red-500 font-medium font-bold">❌ {ride.metadata.qualityFlags.dataIntegrity.gapCount} data gaps detected</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6 border-t bg-muted/5">
          <div className="flex gap-2 w-full">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowGraphs(!showGraphs)}>
              <BarChart2 className="h-3.5 w-3.5 mr-2" />
              {showGraphs ? 'Hide Graphs' : 'Graphs'}
            </Button>
            <Button size="sm" className="flex-1" onClick={onExport} disabled={isCompressing}>
              <Download className="h-3.5 w-3.5 mr-2" />
              {isCompressing ? 'Zipping...' : 'Export (ZIP)'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {showGraphs && ride?.dataPoints && ride.dataPoints.length > 0 && (
        <SensorGraphs dataPoints={ride.dataPoints} />
      )}
    </div>
  );
};

export default RideStats;
