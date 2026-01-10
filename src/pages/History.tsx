
import { useState } from 'react';
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
  
  const [selectedRide, setSelectedRide] = useState<RideSession | null>(null);
  
  const handleViewDetails = (ride: RideSession) => {
    setSelectedRide(ride);
  };
  
  const handleDelete = (rideId: string) => {
    deleteRide(rideId);
    if (selectedRide?.id === rideId) {
      setSelectedRide(null);
    }
  };
  
  const handleExport = () => {
    if (selectedRide) {
      exportRideData(selectedRide);
    }
  };
  
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
      
      <Dialog open={!!selectedRide} onOpenChange={(open) => !open && setSelectedRide(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ride Details</DialogTitle>
            <DialogDescription>
              {selectedRide && new Date(selectedRide.startTime).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRide && (
            <RideStats
              ride={selectedRide}
              stats={getRideStats(selectedRide)}
              onExport={handleExport}
            />
          )}
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSelectedRide(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default History;
