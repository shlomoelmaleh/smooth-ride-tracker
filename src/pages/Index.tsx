import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideButton from '@/components/RideButton';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const Index = () => {
  const navigate = useNavigate();
  const {
    isTracking,
    gpsUpdates,
    sampleCount,
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
   * CRITICAL for iOS: Handle permissions and start sequence.
   */
  const handleStartTracking = async () => {
    // 1. Request permissions with prioritized sensor order
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    // Generate ID for the session
    const timestamp = Date.now();
    const rideId = `${timestamp}-${Math.random().toString(36).substring(2, 7)}`;

    // 2. ATTACH SENSORS IMMEDIATELY
    const stopTracking = await startTracking(
      (chunk, index) => saveChunk(rideId, chunk, index),
      (gpsUpdate) => updateAggregatorWithGps(gpsUpdate),
      (sample) => updateAggregatorWithSample(sample)
    );

    if (stopTracking) {
      stopTrackingRef.current = stopTracking;
      // 3. Initialize DB Header in background
      startRide(rideId).catch(err => {
        console.error('Ride initialization deferred:', err);
      });
      toast.success('Capture started');
    }
  };

  const handleFinalStop = async (gps: any[]) => {
    if (stopTrackingRef.current) {
      stopTrackingRef.current();
      stopTrackingRef.current = null;
      const completed = await endRide(gps);
      if (completed) {
        setCompletedRide(completed);
        toast.success('Capture completed');
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
              SmartRide <span className="text-xs font-mono font-normal opacity-50">v0.3.4</span>
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
              className="mt-8 animate-fade-in"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground mb-1">Live Capture</p>
                <p className="text-5xl font-mono font-bold text-primary tracking-tight">
                  {formatElapsedTime(elapsedSeconds)}
                </p>
              </div>

              <div className="glass-panel p-4 flex justify-around items-center rounded-xl bg-primary/5 border-primary/10">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Samples</p>
                  <p className={`text-xl font-mono font-bold ${sampleCount > 0 ? 'text-green-500' : 'text-primary'}`}>{sampleCount}</p>
                </div>
                <div className="h-8 w-[1px] bg-border" />
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">GPS</p>
                  <p className={`text-xl font-mono font-bold ${gpsUpdates.length > 0 ? 'text-green-500' : 'text-primary'}`}>{gpsUpdates.length}</p>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-muted-foreground flex items-center justify-center">
                {sampleCount === 0 ? (
                  <span className="text-amber-500 animate-pulse">Waiting for sensor data...</span>
                ) : (
                  <span className="text-green-500">✓ Sensors active and transmitting</span>
                )}
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
              Your ride data is safely stored locally.
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
            <h2 className="text-lg font-medium mb-1 text-primary">Precision Build v0.3.4</h2>
            <p className="text-xs text-muted-foreground mb-6">Optimized for iOS Native & Chrome</p>
            <div className="text-xs text-muted-foreground text-left space-y-3 max-w-[280px]">
              <div className="flex gap-3">
                <span className="bg-primary/10 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                <p><strong>Gesture Protection:</strong> Sensor permissions requested within the user tap window.</p>
              </div>
              <div className="flex gap-3">
                <span className="bg-primary/10 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                <p><strong>Chrome iOS-Safe:</strong> Graceful fallbacks for non-Safari mobile browsers.</p>
              </div>
              <div className="flex gap-3">
                <span className="bg-primary/10 text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                <p><strong>Heartbeat Check:</strong> Automatic warnings if data capture fails to initialize.</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
