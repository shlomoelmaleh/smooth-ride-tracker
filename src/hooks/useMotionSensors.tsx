import { useState, useCallback, useRef, useEffect } from 'react';
import { GpsUpdate, RideDataPoint } from '@/types';
import { toast } from 'sonner';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [dataPoints, setDataPoints] = useState<RideDataPoint[]>([]);
  const [gpsUpdates, setGpsUpdates] = useState<GpsUpdate[]>([]);
  const [sampleCount, setSampleCount] = useState(0);

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const totalSamplesRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const captureStartedRef = useRef(false);

  useEffect(() => {
    if ('DeviceMotionEvent' in window) setHasAccelerometer(true);
    if ('DeviceOrientationEvent' in window) setHasGyroscope(true);
    if ('geolocation' in navigator) setHasGeolocation(true);
  }, []);

  /**
   * CRITICAL for iOS: Permission Sequence
   * 1. Motion Admission (Must be first to preserve gesture)
   * 2. Orientation Admission
   * 3. Geolocation (Most likely to block/wait, so we do it last)
   */
  const requestPermissions = async (): Promise<boolean> => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      toast.error('Motion sensors require HTTPS on iOS. Current protocol: ' + window.location.protocol);
    }

    try {
      // 1. Motion Admission (iOS Safari 13+)
      if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const motionRes = await (DeviceMotionEvent as any).requestPermission();
        if (motionRes !== 'granted') {
          toast.error('Motion sensor access denied. Please enable in iOS Settings > Safari.');
          return false;
        }
      }

      // 2. Orientation Admission (iOS Safari 13+)
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const orientRes = await (DeviceOrientationEvent as any).requestPermission();
        if (orientRes !== 'granted') {
          toast.error('Orientation sensor access denied.');
          return false;
        }
      }

      // 3. Geolocation (All browsers)
      if (navigator.geolocation) {
        const geoGranted = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (err) => {
              console.warn('Geolocation denied/timeout:', err);
              toast.error('Location timing out. Ride will continue with motion data only.');
              resolve(true); // Allow proceeding
            },
            { timeout: 6000, enableHighAccuracy: true }
          );
        });
        if (!geoGranted) return false;
      }

      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      // Don't crash on Chrome iOS where requestPermission is missing
      if (window.navigator.userAgent.indexOf('CriOS') > -1) {
        toast.info('Chrome iOS detected. Standard sensor access attempted.');
        return true;
      }
      toast.error('Hardware sensors failed to initialize.');
      return false;
    }
  };

  const startTracking = useCallback(async (
    onChunk: (chunk: RideDataPoint[], index: number) => void,
    onGpsUpdate?: (update: GpsUpdate) => void,
    onSensorSample?: (sample: RideDataPoint) => void
  ) => {
    setIsTracking(true);
    setSampleCount(0);
    totalSamplesRef.current = 0;
    captureStartedRef.current = false;

    let chunkIndex = 0;
    let currentChunk: RideDataPoint[] = [];

    const handleMotion = (event: DeviceMotionEvent) => {
      // Robust Capture: Try user acceleration, then gravity-included
      const accel = event.acceleration || event.accelerationIncludingGravity;
      if (!accel) return;

      if (!captureStartedRef.current) {
        captureStartedRef.current = true;
        console.log('First motion sample received');
      }

      const sample: RideDataPoint = {
        timestamp: Date.now(),
        accelerometer: {
          x: accel.x ?? 0,
          y: accel.y ?? 0,
          z: accel.z ?? 0,
          timestamp: Date.now()
        },
        gyroscope: null,
        location: null,
        earth: null
      };

      currentChunk.push(sample);
      totalSamplesRef.current++;

      if (totalSamplesRef.current % 10 === 0) {
        setSampleCount(totalSamplesRef.current);
      }

      if (onSensorSample) onSensorSample(sample);

      if (currentChunk.length >= 100) {
        onChunk([...currentChunk], chunkIndex++);
        currentChunk = [];
      }
    };

    // Use multiple event options for maximum compatibility
    window.addEventListener('devicemotion', handleMotion, true);

    // Heartbeat check: If no data after 3s, alert the user
    setTimeout(() => {
      if (totalSamplesRef.current === 0) {
        toast.warning('No sensor data receiving. Try re-opening the app in Safari if on iOS.');
      }
    }, 3000);

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
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion, true);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      setIsTracking(false);
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
    sampleCount,
    totalSamples: totalSamplesRef.current,
    hasAccelerometer,
    hasGyroscope,
    hasGeolocation,
    startTracking,
    requestPermissions
  };
};
