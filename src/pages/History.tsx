
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
    getRideStats
  } = useRideData();

  const handleViewDetails = React.useCallback((ride: RideSession) => {
    navigate(`/history/${ride.id}`);
  }, [navigate]);

  const handleDelete = React.useCallback((rideId: string) => {
    deleteRide(rideId);
  }, [deleteRide]);

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
    </Layout>
  );
};

export default History;
