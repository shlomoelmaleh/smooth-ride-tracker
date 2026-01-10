import { useState, useCallback, useRef, useEffect } from 'react';
import { GpsUpdate, RideDataPoint } from '@/types';
import { toast } from 'sonner';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [dataPoints, setDataPoints] = useState<RideDataPoint[]>([]);
  const [gpsUpdates, setGpsUpdates] = useState<GpsUpdate[]>([]);

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const totalSamplesRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  // Check hardware availability on mount
  useEffect(() => {
    if ('DeviceMotionEvent' in window) setHasAccelerometer(true);
    if ('DeviceOrientationEvent' in window) setHasGyroscope(true);
    if ('geolocation' in navigator) setHasGeolocation(true);
  }, []);

  /**
   * CRITICAL for iOS: Request permissions for Motion AND Orientation
   * Must be called in response to a user gesture.
   */
  const requestPermissions = async (): Promise<boolean> => {
    try {
      // 1. Motion Admission (iOS 13+)
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const motionRes = await (DeviceMotionEvent as any).requestPermission();
        if (motionRes !== 'granted') {
          toast.error('Motion sensor access denied. Check iOS Settings > Safari.');
          return false;
        }
      }

      // 2. Orientation Admission (iOS 13+)
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const orientRes = await (DeviceOrientationEvent as any).requestPermission();
        if (orientRes !== 'granted') {
          toast.error('Orientation sensor access denied.');
          return false;
        }
      }

      // 3. Geolocation (All)
      if (navigator.geolocation) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (err) => {
              console.warn('Geolocation denied:', err);
              toast.error('Location access denied. Ride will lack 2D coordinates.');
              resolve(true); // Proceed without GPS if user allows
            },
            { timeout: 5000 }
          );
        });
      }

      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      toast.error('Hardware sensors unavailable or restricted.');
      return false;
    }
  };

  const startTracking = useCallback(async (
    onChunk: (chunk: RideDataPoint[], index: number) => void,
    onGpsUpdate?: (update: GpsUpdate) => void,
    onSensorSample?: (sample: RideDataPoint) => void
  ) => {
    setIsTracking(true);
    setDataPoints([]);
    setGpsUpdates([]);
    totalSamplesRef.current = 0;
    let chunkIndex = 0;
    let currentChunk: RideDataPoint[] = [];

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!event.acceleration) return;

      const sample: RideDataPoint = {
        timestamp: Date.now(),
        accelerometer: {
          x: event.acceleration.x || 0,
          y: event.acceleration.y || 0,
          z: event.acceleration.z || 0,
          timestamp: Date.now()
        },
        gyroscope: null,
        location: null,
        earth: null
      };

      currentChunk.push(sample);
      totalSamplesRef.current++;

      if (onSensorSample) onSensorSample(sample);

      if (currentChunk.length >= 100) {
        onChunk([...currentChunk], chunkIndex++);
        currentChunk = [];
      }
    };

    window.addEventListener('devicemotion', handleMotion);

    // Watch Geolocation
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const update: GpsUpdate = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp
          };
          setGpsUpdates(prev => [...prev, update]);
          if (onGpsUpdate) onGpsUpdate(update);
        },
        (err) => console.error('GPS error:', err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      setIsTracking(false);
      // Flush residual chunk
      if (currentChunk.length > 0) {
        onChunk(currentChunk, chunkIndex);
      }
    };
  }, []);

  return {
    isTracking,
    currentData,
    dataPoints,
    gpsUpdates,
    totalSamples: totalSamplesRef.current,
    hasAccelerometer,
    hasGyroscope,
    hasGeolocation,
    startTracking,
    requestPermissions
  };
};
