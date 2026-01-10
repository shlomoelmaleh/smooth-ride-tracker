import { useState, useEffect, useRef, useCallback } from 'react';
import { AccelerometerData, GyroscopeData, LocationData, RideDataPoint, GpsUpdate } from '@/types';
import { toast } from 'sonner';
import { calculateEarthAcceleration } from '@/utils/motionMath';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [dataPoints, setDataPoints] = useState<RideDataPoint[]>([]); // Rolling buffer for UI
  const [gpsUpdates, setGpsUpdates] = useState<GpsUpdate[]>([]);

  // Ref for all GPS updates (small enough to keep in RAM usually, but we could chunk if needed)
  const gpsUpdatesRef = useRef<GpsUpdate[]>([]);

  // Chunks and buffering
  const currentChunkBufferRef = useRef<RideDataPoint[]>([]);
  const lastChunkFlushTimeRef = useRef<number>(0);
  const chunkIndexRef = useRef<number>(0);
  const totalSamplesRef = useRef<number>(0);

  const hasGyroscopeRefIndex = useRef(false);

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const geolocationRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Configuration thresholds
  const CHUNK_DURATION_MS = 2000;
  const MAX_SAMPLES_PER_CHUNK = 120; // 60Hz * 2s
  const UI_ROLLING_BUFFER_MS = 10000; // 10 seconds

  useEffect(() => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      setHasAccelerometer(true);
    } else if ('DeviceMotionEvent' in window) {
      setHasAccelerometer(true);
    }

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS
    } else if ('DeviceOrientationEvent' in window) {
      setHasGyroscope(true);
      hasGyroscopeRefIndex.current = true;
    }

    if ('geolocation' in navigator) {
      setHasGeolocation(true);
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(e => console.error('Wake Lock Release Error:', e));
      }
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    try {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState !== 'granted') {
          toast.error('Motion permission denied');
          return false;
        }
        setHasGyroscope(true);
        hasGyroscopeRefIndex.current = true;
      }

      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.error('Wake Lock Error:', err);
        }
      }
      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  };

  const lastKnownLocationRef = useRef<LocationData | null>(null);
  const lastKnownGyroscopeRef = useRef<GyroscopeData | null>(null);

  const handleAccelerometerData = useCallback((
    event: DeviceMotionEvent,
    onChunk: (chunk: RideDataPoint[], index: number) => void,
    onSample?: (sample: RideDataPoint) => void
  ) => {
    if (!event.accelerationIncludingGravity) return;

    const now = Date.now();
    const accelerometerData: AccelerometerData = {
      x: event.accelerationIncludingGravity.x || 0,
      y: event.accelerationIncludingGravity.y || 0,
      z: event.accelerationIncludingGravity.z || 0,
      timestamp: now
    };

    const earthAcceleration = lastKnownGyroscopeRef.current
      ? calculateEarthAcceleration(accelerometerData, lastKnownGyroscopeRef.current)
      : null;

    const newDataPoint: RideDataPoint = {
      accelerometer: accelerometerData,
      gyroscope: lastKnownGyroscopeRef.current,
      location: lastKnownLocationRef.current,
      earth: earthAcceleration,
      timestamp: now
    };

    setCurrentData(newDataPoint);
    if (onSample) onSample(newDataPoint);

    // 1. Add to rolling UI buffer
    setDataPoints(prev => {
      const updated = [...prev, newDataPoint];
      // Trim to last 10 seconds
      const cutoff = now - UI_ROLLING_BUFFER_MS;
      while (updated.length > 0 && updated[0].timestamp < cutoff) {
        updated.shift();
      }
      return updated;
    });

    // 2. Add to chunk buffer
    currentChunkBufferRef.current.push(newDataPoint);
    totalSamplesRef.current++;

    // 3. Check for flush
    const timeSinceLastFlush = now - lastChunkFlushTimeRef.current;
    if (
      currentChunkBufferRef.current.length >= MAX_SAMPLES_PER_CHUNK ||
      (timeSinceLastFlush >= CHUNK_DURATION_MS && currentChunkBufferRef.current.length > 0)
    ) {
      const chunkToFlush = [...currentChunkBufferRef.current];
      const index = chunkIndexRef.current++;
      currentChunkBufferRef.current = [];
      lastChunkFlushTimeRef.current = now;
      onChunk(chunkToFlush, index);
    }
  }, []);

  const handleGyroscopeData = useCallback((event: DeviceOrientationEvent) => {
    const gyroscopeData: GyroscopeData = {
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
      timestamp: Date.now()
    };
    lastKnownGyroscopeRef.current = gyroscopeData;
    setCurrentData(prev => prev ? { ...prev, gyroscope: gyroscopeData } : null);
  }, []);

  const setupGeolocation = useCallback((onGpsUpdate?: (update: GpsUpdate) => void) => {
    if (!hasGeolocation) return;

    return navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: now
        };

        const trueGpsUpdate: GpsUpdate = {
          timestamp: now,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading
        };

        lastKnownLocationRef.current = locationData;
        gpsUpdatesRef.current.push(trueGpsUpdate);
        setGpsUpdates([...gpsUpdatesRef.current]);

        if (onGpsUpdate) onGpsUpdate(trueGpsUpdate);

        setCurrentData(prev => prev ? { ...prev, location: locationData } : null);
      },
      (error) => console.error('Geolocation error:', error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [hasGeolocation]);

  const startTracking = useCallback(async (
    onChunk: (chunk: RideDataPoint[], index: number) => void,
    onGpsUpdate?: (update: GpsUpdate) => void,
    onSensorSample?: (sample: RideDataPoint) => void
  ) => {
    const granted = await requestPermissions();
    if (!granted) return false;

    if (!hasAccelerometer) {
      toast.error('Accelerometer not available');
      return false;
    }

    // Reset counters
    currentChunkBufferRef.current = [];
    lastChunkFlushTimeRef.current = Date.now();
    chunkIndexRef.current = 0;
    totalSamplesRef.current = 0;
    gpsUpdatesRef.current = [];
    setDataPoints([]);
    setGpsUpdates([]);

    const accelHandler = (e: DeviceMotionEvent) => handleAccelerometerData(e, onChunk, onSensorSample);
    window.addEventListener('devicemotion', accelHandler);

    if (hasGyroscope || hasGyroscopeRefIndex.current) {
      window.addEventListener('deviceorientation', handleGyroscopeData);
    }

    if (hasGeolocation) {
      geolocationRef.current = setupGeolocation(onGpsUpdate) || null;
    }

    setIsTracking(true);

    return () => {
      window.removeEventListener('devicemotion', accelHandler);
      window.removeEventListener('deviceorientation', handleGyroscopeData);
      if (geolocationRef.current !== null) navigator.geolocation.clearWatch(geolocationRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release().then(() => wakeLockRef.current = null).catch(console.error);
      setIsTracking(false);

      // Final flush
      if (currentChunkBufferRef.current.length > 0) {
        onChunk([...currentChunkBufferRef.current], chunkIndexRef.current++);
      }
    };
  }, [hasAccelerometer, hasGyroscope, hasGeolocation, handleAccelerometerData, handleGyroscopeData, setupGeolocation]);

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

