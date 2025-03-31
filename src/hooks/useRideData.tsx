import { useState, useEffect, useMemo } from 'react';
import { RideSession, RideStats, RideDataPoint } from '@/types';
import { toast } from 'sonner';

// Calculate the smoothness score from accelerometer data
const calculateSmoothnessScore = (dataPoints: RideDataPoint[]): number => {
  if (dataPoints.length === 0) return 0;
  
  // Calculate the variance of acceleration magnitude
  const accelerations = dataPoints.map(point => {
    const { x, y, z } = point.accelerometer;
    // Magnitude of acceleration vector
    return Math.sqrt(x * x + y * y + z * z);
  });
  
  // Calculate mean
  const mean = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length;
  
  // Calculate variance
  const variance = accelerations.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / accelerations.length;
  
  // Calculate standard deviation
  const stdDev = Math.sqrt(variance);
  
  // Convert to a 0-100 score (lower stdDev means smoother ride)
  // The values below are calibrated for typical ride data
  const baseScore = 100 - (stdDev * 10);
  
  // Clamp between 0-100
  return Math.max(0, Math.min(100, baseScore));
};

// Calculate distance from GPS points using Haversine formula
const calculateDistance = (dataPoints: RideDataPoint[]): number => {
  const pointsWithLocation = dataPoints.filter(point => point.location !== null);
  
  if (pointsWithLocation.length < 2) return 0;
  
  let totalDistance = 0;
  
  for (let i = 1; i < pointsWithLocation.length; i++) {
    const prevPoint = pointsWithLocation[i-1].location!;
    const currPoint = pointsWithLocation[i].location!;
    
    // Haversine formula
    const R = 6371e3; // Earth radius in meters
    const φ1 = prevPoint.latitude * Math.PI/180;
    const φ2 = currPoint.latitude * Math.PI/180;
    const Δφ = (currPoint.latitude - prevPoint.latitude) * Math.PI/180;
    const Δλ = (currPoint.longitude - prevPoint.longitude) * Math.PI/180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    const distance = R * c;
    totalDistance += distance;
  }
  
  return totalDistance;
};

// Calculate ride stats
const calculateRideStats = (dataPoints: RideDataPoint[]): RideStats => {
  if (dataPoints.length === 0) {
    return {
      averageAcceleration: 0,
      maxAcceleration: 0,
      suddenStops: 0,
      suddenAccelerations: 0,
      vibrationLevel: 0,
      duration: 0,
      distance: 0
    };
  }
  
  // Extract acceleration magnitudes
  const accelerations = dataPoints.map(point => {
    const { x, y, z } = point.accelerometer;
    return Math.sqrt(x * x + y * y + z * z);
  });
  
  // Calculate average acceleration
  const averageAcceleration = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length;
  
  // Calculate max acceleration
  const maxAcceleration = Math.max(...accelerations);
  
  // Calculate acceleration changes between consecutive readings
  const accelerationChanges = [];
  for (let i = 1; i < accelerations.length; i++) {
    accelerationChanges.push(accelerations[i] - accelerations[i-1]);
  }
  
  // Define thresholds for sudden changes
  const SUDDEN_DECELERATION_THRESHOLD = -2; // m/s²
  const SUDDEN_ACCELERATION_THRESHOLD = 2; // m/s²
  
  // Count sudden stops and accelerations
  const suddenStops = accelerationChanges.filter(change => change < SUDDEN_DECELERATION_THRESHOLD).length;
  const suddenAccelerations = accelerationChanges.filter(change => change > SUDDEN_ACCELERATION_THRESHOLD).length;
  
  // Calculate vibration level (standard deviation of acceleration)
  const mean = averageAcceleration;
  const variance = accelerations.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / accelerations.length;
  const vibrationLevel = Math.sqrt(variance);
  
  // Calculate duration
  const startTime = dataPoints[0].timestamp;
  const endTime = dataPoints[dataPoints.length - 1].timestamp;
  const duration = (endTime - startTime) / 1000; // in seconds
  
  // Calculate distance
  const distance = calculateDistance(dataPoints);
  
  return {
    averageAcceleration,
    maxAcceleration,
    suddenStops,
    suddenAccelerations,
    vibrationLevel,
    duration,
    distance
  };
};

export const useRideData = () => {
  const [rides, setRides] = useState<RideSession[]>([]);
  const [currentRide, setCurrentRide] = useState<RideSession | null>(null);
  
  // Load rides from localStorage on mount
  useEffect(() => {
    try {
      const storedRides = localStorage.getItem('smartRideData');
      if (storedRides) {
        setRides(JSON.parse(storedRides));
      }
    } catch (error) {
      console.error('Error loading ride data:', error);
      toast.error('Failed to load ride history');
    }
  }, []);
  
  // Save rides to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('smartRideData', JSON.stringify(rides));
    } catch (error) {
      console.error('Error saving ride data:', error);
      toast.error('Failed to save ride data');
    }
  }, [rides]);
  
  // Start a new ride session
  const startRide = () => {
    const newRide: RideSession = {
      id: Date.now().toString(),
      startTime: Date.now(),
      endTime: null,
      dataPoints: []
    };
    
    setCurrentRide(newRide);
    return newRide;
  };
  
  // Update the current ride with new data points
  const updateRideData = (dataPoints: RideDataPoint[]) => {
    if (!currentRide) return;
    
    setCurrentRide(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dataPoints: dataPoints
      };
    });
  };
  
  // End the current ride and save it
  const endRide = (dataPoints: RideDataPoint[]) => {
    if (!currentRide) return null;
    
    const endTime = Date.now();
    const distance = calculateDistance(dataPoints);
    const smoothnessScore = calculateSmoothnessScore(dataPoints);
    const duration = (endTime - currentRide.startTime) / 1000; // in seconds
    
    const completedRide: RideSession = {
      ...currentRide,
      endTime,
      dataPoints,
      smoothnessScore,
      distance,
      duration
    };
    
    setRides(prev => [...prev, completedRide]);
    setCurrentRide(null);
    
    return completedRide;
  };
  
  // Delete a specific ride
  const deleteRide = (rideId: string) => {
    setRides(prev => prev.filter(ride => ride.id !== rideId));
  };
  
  // Export ride data
  const exportRideData = (ride: RideSession) => {
    try {
      const dataStr = JSON.stringify(ride, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `smartride_${new Date(ride.startTime).toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      toast.success('Ride data exported successfully');
    } catch (error) {
      console.error('Error exporting ride data:', error);
      toast.error('Failed to export ride data');
    }
  };
  
  // Get stats for a specific ride
  const getRideStats = (ride: RideSession): RideStats => {
    return calculateRideStats(ride.dataPoints);
  };
  
  return {
    rides,
    currentRide,
    startRide,
    updateRideData,
    endRide,
    deleteRide,
    exportRideData,
    getRideStats
  };
};
