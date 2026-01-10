import { useState, useCallback, useRef, useEffect } from 'react';
import { GpsUpdate, RideDataPoint } from '@/types';
import { toast } from 'sonner';

export type SensorStatus = 'idle' | 'waiting' | 'active' | 'error' | 'denied';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [gpsCount, setGpsCount] = useState(0);

  const [motionStatus, setMotionStatus] = useState<SensorStatus>('idle');
  const [gpsStatus, setGpsStatus] = useState<SensorStatus>('idle');

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const totalSamplesRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const motionHandlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);

  useEffect(() => {
    if ('DeviceMotionEvent' in window) setHasAccelerometer(true);
    if ('DeviceOrientationEvent' in window) setHasGyroscope(true);
    if ('geolocation' in navigator) setHasGeolocation(true);

    return () => {
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current, true);
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  /**
   * CRITICAL for iOS: Permission Sequence v0.3.5
   * Attempts to preserve user gesture context for Motion sensors.
   */
  const requestPermissions = async (): Promise<boolean> => {
    // Basic diagnostic
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      toast.error('SSL Required: Sensors fail on insecure connections.');
    }

    const isChromeIOS = /CriOS/i.test(navigator.userAgent);

    try {
      // 1. Motion Admission (Priority 1)
      if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        setMotionStatus('waiting');
        const motionRes = await (DeviceMotionEvent as any).requestPermission();
        if (motionRes !== 'granted') {
          setMotionStatus('denied');
          toast.error('Motion access denied. Enable in Settings > Safari.');
          return false;
        }
        setMotionStatus('active');
      } else if (isChromeIOS) {
        setMotionStatus('active'); // Assume active for now
      }

      // 2. Orientation Admission
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        await (DeviceOrientationEvent as any).requestPermission();
      }

      // 3. Geolocation (Last, as it can be slow)
      if (navigator.geolocation) {
        setGpsStatus('waiting');
        const geoRes = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (err) => {
              console.warn('Geo prompt error:', err);
              setGpsStatus('error');
              toast.error('Location prompt skipped or denied.');
              resolve(true); // Continue with motion
            },
            { timeout: 5000 }
          );
        });
        if (geoRes) setGpsStatus('active');
      }

      return true;
    } catch (error) {
      console.error('Permission flow failed:', error);
      toast.error('Hardware initialization failed.');
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
    setGpsCount(0);
    totalSamplesRef.current = 0;

    let chunkIndex = 0;
    let currentChunk: RideDataPoint[] = [];

    // Cleanup previous listener if any
    if (motionHandlerRef.current) {
      window.removeEventListener('devicemotion', motionHandlerRef.current, true);
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      // DUAL PICKUP: User acceleration or gravity-included
      // On some iOS states, .acceleration is null but .accelerationIncludingGravity works
      const accel = event.acceleration || event.accelerationIncludingGravity;

      // If we are getting events but no numeric data, we still count "beats" for debug
      if (!accel || (accel.x === null && accel.y === null)) return;

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

      if (totalSamplesRef.current % 20 === 0) {
        setSampleCount(totalSamplesRef.current);
      }

      if (onSensorSample) onSensorSample(sample);

      if (currentChunk.length >= 100) {
        onChunk([...currentChunk], chunkIndex++);
        currentChunk = [];
      }
    };

    motionHandlerRef.current = handleMotion;
    window.addEventListener('devicemotion', handleMotion, true);

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
          setGpsCount(prev => prev + 1);
          if (onGpsUpdate) onGpsUpdate(update);
        },
        (err) => console.error('GPS tracking error:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    // Diagnostic Heartbeat
    const checkTimer = setTimeout(() => {
      if (totalSamplesRef.current === 0) {
        toast.warning('No sensor data yet. Try moving the phone or checking Safari settings.');
      }
    }, 4000);

    return () => {
      clearTimeout(checkTimer);
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current, true);
        motionHandlerRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);

      // CRITICAL: Final Flush
      if (currentChunk.length > 0) {
        onChunk(currentChunk, chunkIndex);
      }
    };
  }, []);

  return {
    isTracking,
    sampleCount,
    gpsCount,
    motionStatus,
    gpsStatus,
    hasAccelerometer,
    hasGeolocation,
    startTracking,
    requestPermissions
  };
};
