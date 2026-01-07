import { useState, useEffect, useCallback } from 'react';
import { RideSession, RideStats, RideDataPoint } from '@/types';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { buildRideMetadata } from '@/lib/metadata';

// Calculate the smoothness score from accelerometer data
const calculateSmoothnessScore = (dataPoints: RideDataPoint[]): number => {
  if (dataPoints.length === 0) return 0;

  // Calculate the variance of acceleration magnitude
  const accelerations = dataPoints.map(point => {
    // If we have earth-relative data, use it (it's tilt-neutralized)
    const data = point.earth || point.accelerometer;
    const { x, y, z } = data;
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
    const prevPoint = pointsWithLocation[i - 1].location!;
    const currPoint = pointsWithLocation[i].location!;

    // Haversine formula
    const R = 6371e3; // Earth radius in meters
    const φ1 = prevPoint.latitude * Math.PI / 180;
    const φ2 = currPoint.latitude * Math.PI / 180;
    const Δφ = (currPoint.latitude - prevPoint.latitude) * Math.PI / 180;
    const Δλ = (currPoint.longitude - prevPoint.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

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
    const data = point.earth || point.accelerometer;
    const { x, y, z } = data;
    return Math.sqrt(x * x + y * y + z * z);
  });

  // Calculate average acceleration
  const averageAcceleration = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length;

  // Calculate max acceleration
  const maxAcceleration = Math.max(...accelerations);

  // Calculate acceleration changes between consecutive readings
  const accelerationChanges = [];
  for (let i = 1; i < accelerations.length; i++) {
    accelerationChanges.push(accelerations[i] - accelerations[i - 1]);
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

// Helper to get battery level safely
const getBatteryLevel = async (): Promise<number | undefined> => {
  try {
    if ('getBattery' in navigator) {
      const battery: any = await (navigator as any).getBattery();
      return battery.level;
    }
    return undefined;
  } catch (error) {
    console.warn('Battery API error:', error);
    return undefined;
  }
};

export const useRideData = () => {
  const [rides, setRides] = useState<RideSession[]>([]);
  const [currentRide, setCurrentRide] = useState<RideSession | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [lastCompressedBlob, setLastCompressedBlob] = useState<Blob | null>(null);
  const [lastCompressedFilename, setLastCompressedFilename] = useState<string>('');

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

  // Generate filename for ride
  const generateFilename = (ride: RideSession, extension = 'json') => {
    const date = new Date(ride.startTime);
    const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const shortId = ride.id.slice(-5);
    return `smartride_${timestamp}_${shortId}.${extension}`;
  };

  // Helper to compress ride data
  const compressRideData = async (ride: RideSession): Promise<{ blob: Blob, filename: string } | null> => {
    try {
      setIsCompressing(true);
      const zip = new JSZip();

      // Original ride data as ride.json
      const jsonContent = JSON.stringify(ride, null, 2);
      zip.file('ride.json', jsonContent);

      // Metadata as meta.json
      const metadata = ride.metadata || buildRideMetadata(ride);
      zip.file('meta.json', JSON.stringify(metadata, null, 2));

      const zipFilename = generateFilename(ride, 'zip');

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });

      return { blob, filename: zipFilename };
    } catch (error) {
      console.error('Compression error:', error);
      toast.error('Failed to compress ride data');
      return null;
    } finally {
      setIsCompressing(false);
    }
  };

  // Start a new ride session
  const startRide = async () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000000000);
    const startBattery = await getBatteryLevel();

    const newRide: RideSession = {
      id: (timestamp + randomNum).toString(),
      startTime: timestamp,
      endTime: null,
      dataPoints: [],
      startBattery: startBattery
    };

    setLastCompressedBlob(null);
    setLastCompressedFilename('');
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
  const endRide = async (dataPoints: RideDataPoint[]) => {
    if (!currentRide) return null;

    const endTime = Date.now();
    const distance = calculateDistance(dataPoints);
    const smoothnessScore = calculateSmoothnessScore(dataPoints);
    const duration = (endTime - currentRide.startTime) / 1000; // in seconds
    const endBattery = await getBatteryLevel();

    const completedRide: RideSession = {
      ...currentRide,
      endTime,
      dataPoints,
      smoothnessScore,
      distance,
      duration,
      endBattery: endBattery
    };

    // Attach metadata
    completedRide.metadata = buildRideMetadata(completedRide);

    setRides(prev => [...prev, completedRide]);
    setCurrentRide(null);

    // Initial background compression
    const result = await compressRideData(completedRide);
    if (result) {
      setLastCompressedBlob(result.blob);
      setLastCompressedFilename(result.filename);
    }

    return completedRide;
  };

  // Delete a specific ride
  const deleteRide = (rideId: string) => {
    setRides(prev => prev.filter(ride => ride.id !== rideId));
  };

  // Export ride data
  const exportRideData = async (ride: RideSession) => {
    try {
      let downloadBlob: Blob;
      let filename: string;

      if (lastCompressedBlob && generateFilename(ride, 'zip') === lastCompressedFilename) {
        // Use pre-compressed blob if available
        downloadBlob = lastCompressedBlob;
        filename = lastCompressedFilename;
      } else {
        // Fallback to on-demand compression (e.g., for history items)
        const result = await compressRideData(ride);
        if (!result) return;
        downloadBlob = result.blob;
        filename = result.filename;
      }

      const url = URL.createObjectURL(downloadBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Compressed ride data exported');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
  };

  // Get stats for a specific ride
  const getRideStats = (ride: RideSession): RideStats => {
    return calculateRideStats(ride.dataPoints);
  };

  return {
    rides,
    currentRide,
    isCompressing,
    lastCompressedBlob,
    startRide,
    updateRideData,
    endRide,
    deleteRide,
    exportRideData,
    getRideStats
  };
};
