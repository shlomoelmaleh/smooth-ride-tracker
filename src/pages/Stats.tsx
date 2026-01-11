
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  MapPin,
  History,
  ShieldCheck,
  Activity,
  Zap,
  ExternalLink
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useRideData } from '@/hooks/useRideData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const Stats = () => {
  const navigate = useNavigate();
  const { rides } = useRideData();

  const stats = useMemo(() => {
    if (rides.length === 0) return null;

    const totalRides = rides.length;
    let totalTime = 0;
    let totalDistance = 0;
    let totalSmoothness = 0;
    let ridesWithLowQuality = 0;
    let ridesWithExtremeEvents = 0;

    rides.forEach(ride => {
      totalTime += ride.metadata?.durationSeconds || ride.duration || 0;
      totalDistance += ride.metadata?.statsSummary?.gpsDistanceMeters || ride.distance || 0;
      totalSmoothness += ride.smoothnessScore || 0;

      if (ride.metadata?.qualityFlags?.hasLowGpsQuality) {
        ridesWithLowQuality++;
      }

      const events = (ride.metadata?.counts?.totalEvents || 0);
      if (events > 10 || (ride.metadata?.statsSummary?.maxAbsAccel || 0) > 30) {
        ridesWithExtremeEvents++;
      }
    });

    const avgSmoothness = totalSmoothness / totalRides;

    // Logical Insights mapping
    const qualitySentence = avgSmoothness >= 80
      ? "Most rides show high-to-exceptional smoothness."
      : avgSmoothness >= 60
        ? "Most rides show medium-to-high smoothness."
        : "Ride quality varies significantly across recordings.";

    const variabilitySentence = totalRides < 3
      ? "Collecting more data to determine stability patterns."
      : "Most extreme events are concentrated in a small number of rides.";

    const eventDensitySentence = ridesWithExtremeEvents / totalRides > 0.3
      ? "Notable impact events are present across several recordings."
      : "High-impact events are rare across your recordings.";

    const dataHealthSentence = (ridesWithLowQuality / totalRides) < 0.2
      ? "Overall data quality is good."
      : "GPS noise present in several recordings.";

    return {
      totalRides,
      totalTime,
      totalDistance,
      qualitySentence,
      variabilitySentence,
      eventDensitySentence,
      dataHealthSentence,
      hasReliableDistance: totalDistance > 0 && ridesWithLowQuality / totalRides < 0.5
    };
  }, [rides]);

  const formatHours = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(0)}km`;
  };

  if (rides.length === 0) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center space-y-6">
          <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground/20" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No Stats Ready</h3>
            <p className="text-sm text-muted-foreground/60 max-w-[240px] mx-auto">
              Complete a few rides to see aggregated insights here.
            </p>
          </div>
          <Button onClick={() => navigate('/')} className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/10">
            Go to Home
          </Button>
        </div>
      </Layout>
    );
  }

  if (!stats) return null;

  return (
    <Layout>
      <div className="w-full max-w-lg mx-auto pb-20 px-6 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">

        {/* HEADER */}
        <div className="mb-12 mt-4 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Stats</h1>
          <p className="text-sm text-muted-foreground/60 font-medium leading-relaxed">
            Aggregated insights based on all rides recorded on this device
          </p>
        </div>

        {/* SECTION 1: DATASET OVERVIEW */}
        <div className="grid grid-cols-3 gap-3 mb-12">
          <div className="bg-card/40 border border-border/50 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Rides</span>
            <p className="text-xl font-bold">{stats.totalRides}</p>
          </div>
          <div className="bg-card/40 border border-border/50 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Time</span>
            <p className="text-xl font-bold">{formatHours(stats.totalTime)}</p>
          </div>
          <div className="bg-card/40 border border-border/50 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">Distance</span>
            <p className="text-xl font-bold">{stats.hasReliableDistance ? formatDistance(stats.totalDistance) : "—"}</p>
          </div>
        </div>

        {/* INSIGHT CARDS */}
        <div className="space-y-6">
          {/* SECTION 2: RIDE QUALITY */}
          <div className="flex items-start space-x-4">
            <div className="mt-1 h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary/60" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground/40">Ride Quality Snapshot</h4>
              <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
                {stats.qualitySentence}
              </p>
            </div>
          </div>

          {/* SECTION 3: VARIABILITY */}
          <div className="flex items-start space-x-4">
            <div className="mt-1 h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
              <History className="h-4 w-4 text-primary/60" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground/40">Variability & Patterns</h4>
              <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
                {stats.variabilitySentence}
              </p>
            </div>
          </div>

          {/* SECTION 4: EVENT DENSITY */}
          <div className="flex items-start space-x-4">
            <div className="mt-1 h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4 text-primary/60" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground/40">Event Density</h4>
              <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
                {stats.eventDensitySentence}
              </p>
            </div>
          </div>

          {/* SECTION 5: DATA QUALITY */}
          <div className="flex items-start space-x-4">
            <div className="mt-1 h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-primary/60" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground/40">Data Quality Overview</h4>
              <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
                {stats.dataHealthSentence}
              </p>
            </div>
          </div>
        </div>

        {/* FOOTER / CTA */}
        <div className="mt-16 pt-8 border-t border-border/50 flex flex-col items-center">
          <Button
            variant="outline"
            size="lg"
            className="rounded-full px-8 h-12 font-bold text-muted-foreground hover:text-foreground border-2"
            disabled
          >
            <ExternalLink className="h-4 w-4 mr-2" /> View Detailed Analytics
          </Button>
          <p className="mt-4 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/30">
            Advanced Insights Locked
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Stats;
