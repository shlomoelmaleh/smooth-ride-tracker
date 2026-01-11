
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
    collectionHealth,
    hasAccelerometer,
    hasGeolocation,
    startTracking,
    stopTracking
  } = useMotionSensors();

  const {
    currentRide,
    startRide,
    endRide,
    exportRideData,
    isCompressing
  } = useRideData();

  const [completedRide, setCompletedRide] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Status mapping logic
  const systemState = useMemo(() => {
    if (isCompressing) return 'Saving ride...';
    if (isTracking) return 'Recording...';
    if (completedRide) return 'Ride saved';
    return 'Ready to record';
  }, [isTracking, isCompressing, completedRide]);

  // Timer effect
  useEffect(() => {
    if (isTracking) {
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking]);

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const gpsStatus = useMemo(() => {
    if (!hasGeolocation) return { label: 'No signal', color: 'text-red-500 bg-red-500/10', icon: Navigation };
    if (isTracking && !collectionHealth?.gps?.samplesCount) return { label: 'Finding...', color: 'text-amber-500 bg-amber-500/10', icon: Navigation };
    if (isTracking) return { label: `${collectionHealth?.gps?.observedHz || 0} Hz`, color: 'text-green-500 bg-green-500/10', icon: Navigation };
    return { label: 'Ready', color: 'text-blue-500 bg-blue-500/10', icon: Navigation };
  }, [hasGeolocation, isTracking, collectionHealth]);

  const motionStatus = useMemo(() => {
    if (!hasAccelerometer) return { label: 'Unavailable', color: 'text-red-500 bg-red-500/10', icon: Activity };
    if (isTracking && collectionHealth?.motion) return { label: `${collectionHealth.motion.observedHz} Hz`, color: 'text-green-500 bg-green-500/10', icon: Activity };
    return { label: 'Ready', color: 'text-blue-500 bg-blue-500/10', icon: Activity };
  }, [hasAccelerometer, isTracking, collectionHealth]);

  const samplingStatus = useMemo(() => {
    if (!hasAccelerometer) return { label: 'Insufficient', color: 'text-red-500 bg-red-500/10', icon: Zap };
    if (isTracking) {
      const jitter = collectionHealth?.motion?.dtMsP95 || 0;
      return { label: jitter > 50 ? 'Jittery' : 'Stable', color: jitter > 50 ? 'text-amber-500 bg-amber-500/10' : 'text-green-500 bg-green-500/10', icon: Zap };
    }
    return { label: 'Standby', color: 'text-slate-500 bg-slate-500/10', icon: Zap };
  }, [hasAccelerometer, isTracking, collectionHealth]);

  const microcopy = useMemo(() => {
    if (!hasAccelerometer) return "Motion sensors required to track ride quality.";
    if (!hasGeolocation) return "GPS unavailable — distance will not be recorded.";
    if (isTracking && !collectionHealth?.gps?.samplesCount) return "Waiting for GPS satellite lock...";
    if (isTracking) return "All systems look good. Recording in progress.";
    if (completedRide) return "Ride safely stored on this device.";
    return "Place phone in a stable position for best results.";
  }, [hasAccelerometer, hasGeolocation, isTracking, collectionHealth, completedRide]);

  const handleStartTracking = async () => {
    const success = await startTracking();
    if (success) {
      await startRide();
      setCompletedRide(null);
      toast.success('Recording started');
    }
  };

  const handleStopTracking = async () => {
    const { dataPoints, gpsUpdates, collectionHealth: finalHealth, capabilities: finalCaps } = stopTracking();
    const completed = await endRide(dataPoints, gpsUpdates, finalHealth || undefined, finalCaps || undefined);
    if (completed) {
      setCompletedRide(completed);
      toast.success('Ride captured');
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

            {/* LARGE STATE TEXT & TIMER */}
            <div className="text-center py-4 space-y-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={systemState}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <h2 className="text-2xl font-bold tracking-tight">
                    {systemState}
                  </h2>
                </motion.div>
              </AnimatePresence>

              {isTracking && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-lg font-mono text-muted-foreground/60 tracking-wider"
                >
                  {formatElapsedTime(elapsedSeconds)}
                </motion.p>
              )}
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
              <motion.div key="saved" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="w-full space-y-4">
                <Button
                  size="lg"
                  onClick={() => navigate(`/history/${completedRide.id}`)}
                  className="w-full h-16 rounded-full text-lg font-bold shadow-xl shadow-primary/20"
                >
                  <Eye className="mr-2 h-5 w-5" /> View Details
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setCompletedRide(null)}
                  className="w-full h-16 rounded-full text-lg font-bold border-2"
                >
                  <Play className="mr-2 h-5 w-5" /> Start new recording
                </Button>

                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportRideData(completedRide)}
                    className="text-muted-foreground hover:text-foreground font-bold"
                  >
                    <Download className="mr-2 h-4 w-4" /> Export Ride Data
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
