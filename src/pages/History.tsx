
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History as HistoryIcon,
  MapPin,
  Clock,
  Zap,
  ChevronRight,
  Play
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { RideSession, RideDetailsViewModel } from '@/types';

const History = () => {
  const navigate = useNavigate();
  const { rides } = useRideData();

  const sortedRides = useMemo(() => {
    return [...rides].sort((a, b) => b.startTime - a.startTime);
  }, [rides]);

  const handleViewDetails = (ride: RideSession) => {
    const viewModel: RideDetailsViewModel = {
      rideId: ride.id,
      createdAtIso: new Date(ride.startTime).toISOString(),
      endedAtIso: ride.endTime ? new Date(ride.endTime).toISOString() : undefined,
      durationSeconds: ride.metadata?.durationSeconds ?? ride.duration ?? 0,
      distanceMeters: ride.metadata?.statsSummary?.gpsDistanceMeters ?? ride.distance,
      smoothnessScore: ride.smoothnessScore,
      smoothnessLabel: ride.metadata?.qualityFlags?.isStationaryLikely ? 'Stationary' : 'Valid',
      statsSummary: ride.metadata?.statsSummary ? {
        suddenStops: ride.metadata.counts?.totalEvents ? Math.floor(ride.metadata.counts.totalEvents / 2) : 0,
        suddenAccelerations: ride.metadata.counts?.totalEvents ? Math.ceil(ride.metadata.counts.totalEvents / 2) : 0,
        maxAbsAccel: ride.metadata.statsSummary.maxAbsAccel,
        vibrationLevel: undefined
      } : undefined,
      qualityFlags: ride.metadata?.qualityFlags ? {
        isGpsLikelyDuplicated: ride.metadata.qualityFlags.isGpsLikelyDuplicated,
        hasLowGpsQuality: ride.metadata.qualityFlags.hasLowGpsQuality,
        gpsQualityReason: ride.metadata.qualityFlags.gpsQualityReason
      } : undefined,
      events: ride.metadata?.events
    };

    navigate(`/history/${ride.id}`, { state: { viewModel } });
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <Layout>
      <div className="w-full max-w-lg mx-auto px-2 pb-20">

        {/* HEADER */}
        <div className="mb-10 mt-4 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground/60 font-medium">
            All recorded rides on this device
          </p>
        </div>

        {/* RIDE LIST */}
        <div className="space-y-4">
          {sortedRides.length > 0 ? (
            sortedRides.map((ride, idx) => (
              <motion.div
                key={ride.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card
                  onClick={() => handleViewDetails(ride)}
                  className="group relative overflow-hidden border-none bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-all cursor-pointer ring-1 ring-border/50 hover:ring-primary/20 rounded-[1.5rem]"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-3 flex-1">
                        {/* DATE & TIME */}
                        <div className="flex items-baseline space-x-2">
                          <span className="text-lg font-bold tracking-tight">
                            {formatDate(ride.startTime)}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground/50">
                            {formatTime(ride.startTime)}
                          </span>
                        </div>

                        {/* COMPACT SUMMARY */}
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                          <div className="flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <span className="text-xs font-semibold text-muted-foreground/70">
                              {formatDuration(ride.metadata?.durationSeconds || ride.duration || 0)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <span className="text-xs font-semibold text-muted-foreground/70">
                              {formatDistance(ride.metadata?.statsSummary?.gpsDistanceMeters || ride.distance || 0)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <span className="text-xs font-semibold text-muted-foreground/70">
                              {Math.round(ride.smoothnessScore || 0)} Smooth
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* DATA HEALTH & NAV HINT */}
                      <div className="flex items-center space-x-3 ml-4">
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${ride.metadata?.qualityFlags?.hasLowGpsQuality
                            ? 'bg-amber-400/40'
                            : 'bg-emerald-400/40'
                            }`}
                        />
                        <ChevronRight className="h-5 w-5 text-muted-foreground/20 group-hover:text-primary/40 transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          ) : (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
              <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center">
                <HistoryIcon className="h-10 w-10 text-muted-foreground/20" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">No rides recorded yet</h3>
                <p className="text-sm text-muted-foreground/60 max-w-[240px] mx-auto">
                  Your completed rides will appear here as soon as you stop tracking.
                </p>
              </div>
              <Button
                onClick={() => navigate('/')}
                className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/10"
              >
                <Play className="h-4 w-4 mr-2 fill-current" /> Start your first recording
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default History;
