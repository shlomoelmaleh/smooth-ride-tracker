
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import RideHistory from '@/components/RideHistory';
import RideStats from '@/components/RideStats';
import { useRideData } from '@/hooks/useRideData';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { RideSession } from '@/types';

const History = () => {
  const navigate = useNavigate();
  const {
    rides,
    deleteRide,
    exportRideData,
    getRideStats
  } = useRideData();

  // 1. SELECT BY ID ONLY (Avoid passing massive objects through state)
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);

  // 2. MEMOIZE LOOKUP
  const selectedRide = React.useMemo(() => {
    if (!selectedRideId) return null;
    return rides.find(r => r.id === selectedRideId) || null;
  }, [selectedRideId, rides]);

  // 3. MEMOIZE STATS
  const selectedRideStats = React.useMemo(() => {
    if (!selectedRide) return null;
    return getRideStats(selectedRide);
  }, [selectedRide, getRideStats]);

  const handleViewDetails = React.useCallback((ride: RideSession) => {
    console.time('ViewDetails-Total');
    console.log('[History] Opening details for ride:', ride.id);
    setSelectedRideId(ride.id);
  }, []);

  const handleDelete = React.useCallback((rideId: string) => {
    deleteRide(rideId);
    if (selectedRideId === rideId) {
      setSelectedRideId(null);
    }
  }, [deleteRide, selectedRideId]);

  const handleExport = React.useCallback(() => {
    if (selectedRide) {
      exportRideData(selectedRide);
    }
  }, [selectedRide, exportRideData]);

  return (
    <Layout>
      <motion.div
        className="w-full max-w-3xl mx-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">Ride History</h1>
            <p className="text-muted-foreground">
              {rides.length} recorded {rides.length === 1 ? 'ride' : 'rides'}
            </p>
          </div>

          {rides.length === 0 && (
            <Button onClick={() => navigate('/')}>
              Start a Ride
            </Button>
          )}
        </div>

        <RideHistory
          rides={rides}
          getRideStats={getRideStats}
          onViewDetails={handleViewDetails}
          onDeleteRide={handleDelete}
        />
      </motion.div>

      <Dialog open={!!selectedRideId} onOpenChange={(open) => !open && setSelectedRideId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ride Details</DialogTitle>
            <DialogDescription>
              {selectedRide && new Date(selectedRide.startTime).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedRide && selectedRideStats && (
            <RideStats
              ride={selectedRide}
              stats={selectedRideStats}
              onExport={handleExport}
            />
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSelectedRideId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default History;
