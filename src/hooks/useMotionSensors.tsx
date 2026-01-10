import { useState, useCallback, useRef, useEffect } from 'react';
import { GpsUpdate, RideDataPoint } from '@/types';
import { toast } from 'sonner';
import { debugLog } from '@/lib/debugLog';

export type SensorStatus = 'idle' | 'waiting' | 'active' | 'error' | 'denied';

const MAX_ROLLING_BUFFER = 50; // Points for live chart (~2-5 seconds)

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [gpsCount, setGpsCount] = useState(0);
  const [rollingBuffer, setRollingBuffer] = useState<RideDataPoint[]>([]);

  const [motionStatus, setMotionStatus] = useState<SensorStatus>('idle');
  const [gpsStatus, setGpsStatus] = useState<SensorStatus>('idle');

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const totalSamplesRef = useRef(0);
  const rollingRef = useRef<RideDataPoint[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const motionHandlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);

  useEffect(() => {
    if ('DeviceMotionEvent' in window) setHasAccelerometer(true);
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

  const requestPermissions = async (): Promise<boolean> => {
    debugLog.log('User requested permissions...');
    const isChromeIOS = /CriOS/i.test(navigator.userAgent);

    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        setMotionStatus('waiting');
        const motionRes = await (DeviceMotionEvent as any).requestPermission();
        debugLog.log(`Motion permission: ${motionRes}`);
        if (motionRes !== 'granted') {
          setMotionStatus('denied');
          toast.error('Motion access denied.');
          return false;
        }
        setMotionStatus('active');
      } else if (isChromeIOS) {
        debugLog.log('Chrome iOS detected, assuming permission granted (or default)');
        setMotionStatus('active');
      }

      if (navigator.geolocation) {
        setGpsStatus('waiting');
        const geoRes = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (err) => {
              debugLog.warn(`Geo prompt failed: ${err.message}`);
              setGpsStatus('error');
              resolve(true);
            },
            { timeout: 5000 }
          );
        });
        if (geoRes) {
          setGpsStatus('active');
          debugLog.log('GPS initialized');
        }
      }

      return true;
    } catch (error: any) {
      debugLog.error(`Permission catch: ${error.message}`);
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
    rollingRef.current = [];
    setRollingBuffer([]);

    let chunkIndex = 0;
    let currentChunk: RideDataPoint[] = [];

    const handleMotion = (event: DeviceMotionEvent) => {
      const accel = event.acceleration || event.accelerationIncludingGravity;
      if (!accel) return;

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

      // Update rolling buffer for charts
      rollingRef.current.push(sample);
      if (rollingRef.current.length > MAX_ROLLING_BUFFER) {
        rollingRef.current.shift();
      }

      // Update UI state every 10 samples (reduce React churn)
      if (totalSamplesRef.current % 10 === 0) {
        setSampleCount(totalSamplesRef.current);
        setRollingBuffer([...rollingRef.current]);
      }

      if (onSensorSample) onSensorSample(sample);

      if (currentChunk.length >= 100) {
        onChunk([...currentChunk], chunkIndex++);
        currentChunk = [];
      }
    };

    if (motionHandlerRef.current) {
      window.removeEventListener('devicemotion', motionHandlerRef.current, true);
    }
    motionHandlerRef.current = handleMotion;
    window.addEventListener('devicemotion', handleMotion, true);
    debugLog.log('App listeners attached (devicemotion)');

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
        (err) => debugLog.warn(`GPS Stream Error: ${err.message}`),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      debugLog.log('Stopping tracking, cleaning up listeners...');
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current, true);
        motionHandlerRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      if (currentChunk.length > 0) {
        onChunk(currentChunk, chunkIndex);
      }
    };
  }, []);

  return {
    isTracking,
    sampleCount,
    gpsCount,
    rollingBuffer,
    motionStatus,
    gpsStatus,
    hasAccelerometer,
    startTracking,
    requestPermissions
  };
};
