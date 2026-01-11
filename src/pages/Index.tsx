
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Navigation,
  Zap,
  Activity,
  Loader2,
  Eye,
  Download,
  Play,
  Square,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const navigate = useNavigate();
  const {
    isTracking,
    currentData,
    hasAccelerometer,
    hasGeolocation,
    startTracking,
    stopTracking,
    gpsUpdates
  } = useMotionSensors();

  const {
    currentRide,
    startRide,
    endRide,
    exportRideData,
    isCompressing
  } = useRideData();

  const [completedRide, setCompletedRide] = useState<any>(null);
  const intervalRef = useRef<number | null>(null);

  // Status mapping logic
  const systemState = useMemo(() => {
    if (isCompressing) return 'Saving ride...';
    if (isTracking) return 'Recording...';
    if (completedRide) return 'Ride saved';
    return 'Ready to record';
  }, [isTracking, isCompressing, completedRide]);

  const gpsStatus = useMemo(() => {
    if (!hasGeolocation) return { label: 'No signal', color: 'text-red-500 bg-red-500/10', icon: Navigation };
    if (isTracking && gpsUpdates.length === 0) return { label: 'Finding...', color: 'text-amber-500 bg-amber-500/10', icon: Navigation };
    if (isTracking) return { label: 'Locked', color: 'text-green-500 bg-green-500/10', icon: Navigation };
    return { label: 'Available', color: 'text-blue-500 bg-blue-500/10', icon: Navigation };
  }, [hasGeolocation, isTracking, gpsUpdates]);

  const motionStatus = useMemo(() => {
    if (!hasAccelerometer) return { label: 'Unavailable', color: 'text-red-500 bg-red-500/10', icon: Activity };
    if (isTracking && currentData) return { label: 'Active', color: 'text-green-500 bg-green-500/10', icon: Activity };
    return { label: 'Ready', color: 'text-blue-500 bg-blue-500/10', icon: Activity };
  }, [hasAccelerometer, isTracking, currentData]);

  const samplingStatus = useMemo(() => {
    if (!hasAccelerometer) return { label: 'Insufficient', color: 'text-red-500 bg-red-500/10', icon: Zap };
    if (isTracking) return { label: 'Stable', color: 'text-green-500 bg-green-500/10', icon: Zap };
    return { label: 'Standby', color: 'text-slate-500 bg-slate-500/10', icon: Zap };
  }, [hasAccelerometer, isTracking]);

  const microcopy = useMemo(() => {
    if (!hasAccelerometer) return "Motion sensors required to track ride quality.";
    if (!hasGeolocation) return "GPS unavailable — distance will not be recorded.";
    if (isTracking && gpsUpdates.length === 0) return "Waiting for GPS satellite lock...";
    if (isTracking) return "All systems look good. Recording in progress.";
    if (completedRide) return "Ride safely stored on this device.";
    return "Place phone in a stable position for best results.";
  }, [hasAccelerometer, hasGeolocation, isTracking, gpsUpdates, completedRide]);

  const handleStartTracking = async () => {
    const intervalId = await startTracking();
    if (intervalId) {
      await startRide();
      intervalRef.current = intervalId as unknown as number;
      setCompletedRide(null);
      toast.success('Recording started');
    }
  };

  const handleStopTracking = async () => {
    if (intervalRef.current !== null) {
      const { dataPoints: finalData, gpsUpdates: finalGps } = stopTracking(intervalRef.current);
      intervalRef.current = null;
      const completed = await endRide(finalData, finalGps);
      if (completed) {
        setCompletedRide(completed);
        toast.success('Ride captured');
      }
    }
  };

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 max-w-lg mx-auto overflow-hidden">

        {/* HEADER */}
        <div className="text-center mb-12 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">SmartRide</h1>
          <p className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground/60">Pilot Mode</p>
        </div>

        {/* MAIN STATUS CARD */}
        <Card className="w-full border-none shadow-2xl shadow-primary/5 bg-card/50 backdrop-blur-xl ring-1 ring-border/50 rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-8 space-y-8">

            {/* LARGE STATE TEXT */}
            <div className="text-center py-4">
              <AnimatePresence mode="wait">
                <motion.h2
                  key={systemState}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-2xl font-bold tracking-tight"
                >
                  {systemState}
                </motion.h2>
              </AnimatePresence>
            </div>

            {/* SENSOR STATUS BAR */}
            <div className="flex justify-between gap-2">
              {[gpsStatus, motionStatus, samplingStatus].map((status, i) => (
                <div key={i} className={`flex-1 flex flex-col items-center p-3 rounded-2xl ${status.color.split(' ')[1]} transition-colors duration-500`}>
                  <status.icon className={`h-4 w-4 mb-2 ${status.color.split(' ')[0]}`} />
                  <span className="text-[9px] uppercase font-black tracking-widest opacity-50 mb-0.5">
                    {i === 0 ? 'GPS' : i === 1 ? 'Motion' : 'Sampling'}
                  </span>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${status.color.split(' ')[0]}`}>
                    {status.label}
                  </span>
                </div>
              ))}
            </div>

            {/* MICROCOPY */}
            <p className="text-center text-xs text-muted-foreground/80 font-medium leading-relaxed">
              {microcopy}
            </p>
          </CardContent>
        </Card>

        {/* ACTION AREA */}
        <div className="w-full mt-10 flex flex-col items-center space-y-4">
          <AnimatePresence mode="wait">
            {!isTracking && !completedRide && !isCompressing && (
              <motion.div key="idle" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full">
                <Button
                  size="lg"
                  onClick={handleStartTracking}
                  className="w-full h-16 rounded-full text-lg font-bold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all"
                >
                  <Play className="mr-2 h-5 w-5 fill-current" /> Start Recording
                </Button>
              </motion.div>
            )}

            {isTracking && (
              <motion.div key="recording" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full">
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleStopTracking}
                  className="w-full h-16 rounded-full text-lg font-bold shadow-xl shadow-destructive/20 animate-pulse-subtle"
                >
                  <Square className="mr-2 h-5 w-5 fill-current" /> Stop Tracking
                </Button>
              </motion.div>
            )}

            {isCompressing && (
              <motion.div key="saving" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full">
                <Button
                  disabled
                  size="lg"
                  className="w-full h-16 rounded-full text-lg font-bold bg-muted text-muted-foreground"
                >
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving...
                </Button>
              </motion.div>
            )}

            {completedRide && !isTracking && !isCompressing && (
              <motion.div key="saved" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="w-full space-y-3">
                <Button
                  size="lg"
                  onClick={() => navigate(`/history/${completedRide.id}`)}
                  className="w-full h-16 rounded-full text-lg font-bold shadow-xl shadow-primary/20"
                >
                  <Eye className="mr-2 h-5 w-5" /> View Details
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => exportRideData(completedRide)}
                    className="flex-1 h-12 rounded-full font-bold"
                  >
                    <Download className="mr-2 h-4 w-4" /> Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setCompletedRide(null)}
                    className="flex-1 h-12 rounded-full font-bold text-muted-foreground"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reset
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FOOTER */}
        <div className="mt-12 opacity-40 flex items-center space-x-2">
          <ShieldCheck className="h-3 w-3" />
          <span className="text-[10px] uppercase tracking-widest font-bold">Privacy-first: data stays on your device.</span>
        </div>

      </div>
    </Layout>
  );
};

export default Index;
