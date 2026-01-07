import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideButton from '@/components/RideButton';
import RideStats from '@/components/RideStats';
import { useMotionSensors } from '@/hooks/useMotionSensors';
import { useRideData } from '@/hooks/useRideData';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';

const Index = () => {
  const navigate = useNavigate();
  const {
    isTracking,
    currentData,
    dataPoints,
    hasAccelerometer,
    startTracking,
    stopTracking
  } = useMotionSensors();

  const {
    currentRide,
    startRide,
    updateRideData,
    endRide,
    exportRideData,
    getRideStats
  } = useRideData();

  const [completedRide, setCompletedRide] = useState<any>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTracking && currentRide) {
      updateRideData(dataPoints);
    }
  }, [isTracking, dataPoints, currentRide, updateRideData]);

  const handleStartTracking = async () => {
    // Start the ride session first

    // Attempt to start tracking (requests permissions)
    const intervalId = await startTracking();

    if (intervalId) {
      startRide(); // Only start the ride if we actually got permissions/started tracking
      intervalRef.current = intervalId as unknown as number;
      toast.success('Ride tracking started');
    } else {
      // If it returned false, it means permission denied or error
      // toast is already handled in startTracking
    }
  };

  const handleStopTracking = () => {
    if (intervalRef.current !== null) {
      const finalData = stopTracking(intervalRef.current);
      intervalRef.current = null;

      const completed = endRide(finalData);
      if (completed) {
        setCompletedRide(completed);
        toast.success('Ride completed and saved');
      }
    }
  };

  const handleExport = () => {
    if (completedRide) {
      exportRideData(completedRide);
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
              SmartRide
            </motion.h1>
            <motion.p
              className="text-muted-foreground mt-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Track ride quality during transit
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
              onStop={handleStopTracking}
              hasRequiredSensors={hasAccelerometer}
            />
          </motion.div>

          {isTracking && currentData && (
            <motion.div
              className="mt-6 animate-fade-in"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm mb-2">
                    Currently tracking <span className="font-semibold">{dataPoints.length}</span> data points
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>X: {currentData.accelerometer.x.toFixed(2)}</span>
                    <span>Y: {currentData.accelerometer.y.toFixed(2)}</span>
                    <span>Z: {currentData.accelerometer.z.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {completedRide && !isTracking && (
          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-xl font-medium mb-4 text-center">Last Ride Summary</h2>
            <RideStats
              ride={completedRide}
              stats={getRideStats(completedRide)}
              onExport={handleExport}
            />

            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/history')}
                className="text-primary underline text-sm"
              >
                View all rides
              </button>
            </div>
          </motion.div>
        )}

        {!isTracking && !completedRide && (
          <motion.div
            className="flex flex-col items-center justify-center text-center px-4 py-8 glass-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="text-lg font-medium mb-2">How it works</h2>
            <ol className="text-sm text-muted-foreground mt-2 space-y-3 text-left">
              <li className="flex items-start">
                <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center mr-2 mt-0.5">
                  <span className="text-xs font-medium text-primary">1</span>
                </div>
                <p>Press START when you begin your transit journey</p>
              </li>
              <li className="flex items-start">
                <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center mr-2 mt-0.5">
                  <span className="text-xs font-medium text-primary">2</span>
                </div>
                <p>Keep your phone in a stable position (pocket or bag)</p>
              </li>
              <li className="flex items-start">
                <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center mr-2 mt-0.5">
                  <span className="text-xs font-medium text-primary">3</span>
                </div>
                <p>Press STOP when you complete your journey</p>
              </li>
              <li className="flex items-start">
                <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center mr-2 mt-0.5">
                  <span className="text-xs font-medium text-primary">4</span>
                </div>
                <p>Review your ride quality stats and insights</p>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-4">
              All data remains on your device unless exported
            </p>
          </motion.div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
