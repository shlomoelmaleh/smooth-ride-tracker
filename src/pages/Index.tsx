import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideButton from '@/components/RideButton';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const navigate = useNavigate();
  const {
    isTracking,
    sampleCount,
    gpsCount,
    motionStatus,
    gpsStatus,
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

  const handleStartTracking = async () => {
    setCompletedRide(null);
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const rideId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. START SENSORS FIRST (Synchronous as possible)
    const stopTracking = await startTracking(
      (chunk, index) => saveChunk(rideId, chunk, index),
      (gpsUpdate) => updateAggregatorWithGps(gpsUpdate),
      (sample) => updateAggregatorWithSample(sample)
    );

    if (stopTracking) {
      stopTrackingRef.current = stopTracking;
      // 2. Init Storage (Async Background)
      startRide(rideId).catch(err => {
        console.error('Storage lazy init deferred:', err);
      });
      toast.success('Recording session started');
    }
  };

  const handleFinalStop = async () => {
    if (stopTrackingRef.current) {
      const stopFn = stopTrackingRef.current;
      stopTrackingRef.current = null;
      stopFn(); // Triggers sensor detach and final chunk flush

      const completed = await endRide([]);
      if (completed) {
        setCompletedRide(completed);
        toast.success('Ride saved successfully');
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
              SmartRide <span className="text-xs font-mono font-normal opacity-50">v0.3.5</span>
            </motion.h1>
            <motion.p
              className="text-muted-foreground mt-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Absolute Stability Build
            </motion.p>
          </div>

          <div className="flex justify-center gap-3 mb-8 text-[10px] font-bold uppercase tracking-widest">
            <div className={`px-3 py-1 rounded-full border ${motionStatus === 'active' ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-muted border-transparent opacity-50'}`}>
              Motion: {motionStatus}
            </div>
            <div className={`px-3 py-1 rounded-full border ${gpsStatus === 'active' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : 'bg-muted border-transparent opacity-50'}`}>
              GPS: {gpsStatus}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <RideButton
              isTracking={isTracking}
              onStart={handleStartTracking}
              onStop={handleFinalStop}
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
              <div className="text-center mb-6">
                <p className="text-sm text-muted-foreground mb-1">Live Telemetry</p>
                <p className="text-5xl font-mono font-bold text-primary tracking-tight">
                  {formatElapsedTime(elapsedSeconds)}
                </p>
              </div>

              <div className="glass-panel p-5 grid grid-cols-2 gap-4 rounded-2xl bg-primary/5 border-primary/10">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Samples Received</p>
                  <p className={`text-2xl font-mono font-bold ${sampleCount > 0 ? 'text-green-500' : 'text-amber-500 animate-pulse'}`}>
                    {sampleCount}
                  </p>
                </div>
                <div className="text-center border-l border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">GPS Points</p>
                  <p className={`text-2xl font-mono font-bold ${gpsCount > 0 ? 'text-blue-500' : 'text-primary'}`}>
                    {gpsCount}
                  </p>
                </div>
              </div>

              {sampleCount === 0 && (
                <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 font-medium">
                  <strong>Still no data?</strong> Ensure your phone is held flat or moved slightly. If on iOS, check <u>Settings &gt; Safari &gt; Motion &amp; Orientation</u>.
                </div>
              )}
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {completedRide && !isTracking && (
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="bg-green-500/5 p-8 rounded-3xl border border-green-500/20 shadow-lg shadow-green-500/5">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white">
                  ✓
                </div>
                <h2 className="text-2xl font-bold mb-2">Ride Captured</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {completedRide.metadata?.statsSummary?.accelSamples || 0} accelerations recorded over {completedRide.duration?.toFixed(1) || 0}s.
                </p>
                <button
                  onClick={() => navigate('/history')}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-xl hover:bg-primary/90 transition-all hover:scale-[1.02]"
                >
                  OPEN HISTORY
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isTracking && !completedRide && (
          <motion.div
            className="flex flex-col items-center justify-center text-center px-4 py-8 glass-panel shadow-inner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="text-lg font-bold mb-1 text-primary">Stability Build v0.3.5</h2>
            <p className="text-[10px] uppercase tracking-tighter text-muted-foreground mb-6">Optimized Sensor Pipeline</p>
            <div className="text-xs text-muted-foreground text-left space-y-4 max-w-[280px]">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                <p><strong>Sync-Binding:</strong> Zero-latency attachment to hardware listeners.</p>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                <p><strong>Fallback Stream:</strong> Monitors both gravity and linear motion buffers.</p>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
                <p><strong>Hardware Pulse:</strong> Live visual status of sensor authorization and data flow.</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
