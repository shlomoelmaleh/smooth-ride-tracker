import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideButton from '@/components/RideButton';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { RideDataPoint } from '@/types';

const Index = () => {
  const navigate = useNavigate();
  const {
    isTracking,
    gpsUpdates,
    hasAccelerometer,
    startTracking,
    requestPermissions,
  } = useMotionSensors();

  const {
    startRide,
    saveChunk,
    endRide,
    updateAggregatorWithSample,
    updateAggregatorWithGps
  } = useRideData();

  const [completedRide, setCompletedRide] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  /**
   * CRITICAL for iOS: Permission must be requested in the same tick as the user click.
   */
  const handleStartTracking = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    if (!hasAccelerometer) {
      toast.error('Accelerometer not discovered. Check permissions or device support.');
      return;
    }

    // Now safe to do async DB work
    const ride = await startRide();
    if (!ride) return;

    const stopTracking = await startTracking(
      (chunk, index) => saveChunk(ride.id, chunk, index),
      (gpsUpdate) => updateAggregatorWithGps(gpsUpdate),
      (sample) => updateAggregatorWithSample(sample)
    );

    if (stopTracking) {
      stopTrackingRef.current = stopTracking;
      toast.success('Ride tracking started');
    }
  };

  const handleFinalStop = async (gps: any[]) => {
    if (stopTrackingRef.current) {
      stopTrackingRef.current();
      stopTrackingRef.current = null;
      const completed = await endRide(gps);
      if (completed) {
        setCompletedRide(completed);
        toast.success('Ride completed');
      }
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8 animate-fade-in">
          <div className="glass-panel mx-auto mb-6 p-6">
            <motion.h1
              className="text-3xl font-semibold text-balance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              SmartRide <span className="text-xs font-mono font-normal opacity-50">v0.3.2</span>
            </motion.h1>
            <motion.p
              className="text-muted-foreground mt-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Advanced Ride Tracking
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <RideButton
              isTracking={isTracking}
              onStart={handleStartTracking}
              onStop={() => handleFinalStop(gpsUpdates)}
              hasRequiredSensors={hasAccelerometer}
            />
          </motion.div>

          {isTracking && (
            <motion.div
              className="mt-12 animate-fade-in"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <p className="text-sm text-muted-foreground mb-2">Recording Duration</p>
                <p className="text-5xl font-mono font-bold text-primary tracking-tight">
                  {formatElapsedTime(elapsedSeconds)}
                </p>
                <div className="flex items-center justify-center mt-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-2" />
                  <span>Recording Session...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {completedRide && !isTracking && (
          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-xl font-medium mb-4">Ride Captured Successfully</h2>
            <div className="bg-muted/30 p-6 rounded-2xl border border-dashed text-sm text-muted-foreground mb-6">
              Your ride data is safely stored.
              <br />
              Visit History to view stats or export.
            </div>

            <button
              onClick={() => navigate('/history')}
              className="w-full py-4 bg-primary text-primary-foreground rounded-full font-bold shadow-lg hover:bg-primary/90 transition-all"
            >
              VIEW RIDE HISTORY
            </button>
          </motion.div>
        )}

        {!isTracking && !completedRide && (
          <motion.div
            className="flex flex-col items-center justify-center text-center px-4 py-8 glass-panel shadow-inner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="text-lg font-medium mb-2">Advanced Pipeline v2</h2>
            <p className="text-xs text-muted-foreground mb-6">Designed for 30+ minute sessions</p>
            <ol className="text-sm text-muted-foreground mt-2 space-y-4 text-left max-w-[280px]">
              <li className="flex items-start">
                <span className="font-bold text-primary mr-3">✓</span>
                <p><strong>Chunked Storage:</strong> Data is flushed to disk every 2s, saving your RAM.</p>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-primary mr-3">✓</span>
                <p><strong>Sync-Safe permissions:</strong> iOS Motion/Orientation requested on user gesture.</p>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-primary mr-3">✓</span>
                <p><strong>Safe Export:</strong> Optimized for iOS Safari download reliability.</p>
              </li>
            </ol>
          </motion.div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
