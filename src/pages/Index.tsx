import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideButton from '@/components/RideButton';
import LiveCharts from '@/components/LiveCharts';
import DebugOverlay from '@/components/DebugOverlay';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, Download, History as HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const navigate = useNavigate();
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const {
    isTracking,
    sampleCount,
    gpsCount,
    rollingBuffer,
    motionStatus,
    gpsStatus,
    hasAccelerometer,
    startTracking,
    requestPermissions,
  } = useMotionSensors();

  const {
    currentRide,
    startRide,
    saveChunk,
    endRide,
    updateAggregatorWithSample,
    updateAggregatorWithGps,
    storageError,
    chunksFlushed,
    exportStatus,
    exportResult,
    initiateExport,
    downloadExport
  } = useRideData();

  const [completedRide, setCompletedRide] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTracking) {
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTracking]);

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = async () => {
    setCompletedRide(null);
    const ok = await requestPermissions();
    if (!ok) return;

    const rideId = `${Date.now()}`;
    const stopTracking = await startTracking(
      (chunk, index) => saveChunk(rideId, chunk, index),
      updateAggregatorWithGps,
      updateAggregatorWithSample
    );

    if (stopTracking) {
      stopTrackingRef.current = stopTracking;
      await startRide(rideId);
      toast.success('Recording...');
    }
  };

  const handleStop = async () => {
    if (stopTrackingRef.current) {
      stopTrackingRef.current();
      stopTrackingRef.current = null;
      const completed = await endRide([]);
      if (completed) {
        setCompletedRide(completed);
        initiateExport(completed);
      }
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto relative min-h-full flex flex-col pt-4">
        {/* Header Area */}
        <div className="flex justify-between items-center mb-8 px-2">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight">SmartRide</h1>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest opacity-60">Build 0.4.0 (Stable)</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsDebugOpen(true)} className="rounded-full h-8 w-8 p-0 border border-primary/10">
            <Bug size={14} className={storageError ? 'text-red-500' : 'text-primary'} />
          </Button>
        </div>

        {/* Main Interface */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {isTracking ? (
              <motion.div key="recording" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                <div className="text-center py-6">
                  <p className="text-6xl font-mono font-bold tracking-tighter tabular-nums drop-shadow-sm">
                    {formatElapsedTime(elapsedSeconds)}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Live Session</span>
                  </div>
                </div>

                <div className="px-2">
                  <LiveCharts data={rollingBuffer} />
                </div>

                <div className="flex justify-center pt-8">
                  <RideButton isTracking={true} onStart={() => { }} onStop={handleStop} hasRequiredSensors={true} />
                </div>
              </motion.div>
            ) : completedRide ? (
              <motion.div key="completed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4 px-2">
                <div className="glass-panel p-8 text-center rounded-3xl border-primary/20 shadow-2xl">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Download className="text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Ride Finished</h2>
                  <p className="text-sm text-muted-foreground mb-8">Data persisted locally. {completedRide.metadata?.statsSummary?.accelSamples || 0} points collected.</p>

                  <div className="space-y-3">
                    <Button onClick={downloadExport} disabled={!exportResult} className="w-full h-14 rounded-2xl font-bold text-lg shadow-lg">
                      {exportStatus === 'reading' || exportStatus === 'zipping' ? 'Compressing...' : 'DOWNLOAD DATA'}
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/history')} className="w-full h-14 rounded-2xl font-semibold border-primary/20">
                      VIEW FULL HISTORY
                    </Button>
                    <Button variant="link" onClick={() => setCompletedRide(null)} className="w-full text-xs opacity-50">RECORD ANOTHER RIDE</Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 py-12">
                <div className="flex justify-center">
                  <RideButton isTracking={false} onStart={handleStart} onStop={() => { }} hasRequiredSensors={true} />
                </div>

                <div className="glass-panel mx-4 p-6 rounded-2xl border-dashed border-primary/20 flex flex-col items-center text-center">
                  <HistoryIcon className="text-muted-foreground mb-3 opacity-30" size={32} />
                  <p className="text-xs text-muted-foreground max-w-[200px]">Stable MVP: Local storage & verified CSV/JSON export enabled.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Diagnostic Panel (Always injected but hidden) */}
        <DebugOverlay isOpen={isDebugOpen} onClose={() => setIsDebugOpen(false)} state={{
          isTracking,
          motionStatus,
          gpsStatus,
          rideId: currentRide?.id || 'none',
          chunksFlushed,
          storageError,
          exportStatus,
          samples: sampleCount,
          gpsPoints: gpsCount
        }} />
      </div>
    </Layout>
  );
};

export default Index;
