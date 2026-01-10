import { useState, useEffect, useRef, useCallback } from 'react';
import { AccelerometerData, GyroscopeData, LocationData, RideDataPoint, GpsUpdate } from '@/types';
import { toast } from 'sonner';
import { calculateEarthAcceleration } from '@/utils/motionMath';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [dataPoints, setDataPoints] = useState<RideDataPoint[]>([]);
  const dataPointsRef = useRef<RideDataPoint[]>([]);
  const gpsUpdatesRef = useRef<GpsUpdate[]>([]);
  const [gpsUpdates, setGpsUpdates] = useState<GpsUpdate[]>([]);

  const hasGyroscopeRefIndex = useRef(false); // Renamed to avoid confusion with value refs

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  const accelerometerRef = useRef<number | null>(null);
  const gyroscopeRef = useRef<number | null>(null);
  const geolocationRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Check for DeviceMotionEvent and DeviceOrientationEvent
    // IOS 13+ requires permission for these
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      // iOS: We set it to true initially to ENABLE the start button.
      // If permission is denied later, we will set it to false.
      setHasAccelerometer(true);
    } else if ('DeviceMotionEvent' in window) {
      // Non-iOS (Android/Desktop): capable by default
      setHasAccelerometer(true);
    }

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS: Wait for permission
    } else if ('DeviceOrientationEvent' in window) {
      setHasGyroscope(true);
      hasGyroscopeRefIndex.current = true;
    }

    if ('geolocation' in navigator) {
      setHasGeolocation(true);
    }

    // Clean up wake lock on unmount
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(e => console.error('Wake Lock Release Error:', e));
      }
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    try {
      // Handle iOS 13+ permissions FIRST to preserve user gesture
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const permissionState = await (DeviceMotionEvent as any).requestPermission();

          if (permissionState !== 'granted') {
            toast.error('Motion permission denied');
            return false;
          }

          // On iOS, this single permission covers both Motion and Orientation
          setHasGyroscope(true);
          hasGyroscopeRefIndex.current = true;
        } catch (e) {
          console.error(e);
          toast.error('Motion request failed');
          return false;
        }
      }

      // Orientation permission handled via Motion on iOS


      // Request Wake Lock AFTER motion permissions
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

  const handleAccelerometerData = useCallback((event: DeviceMotionEvent) => {
    if (!event.accelerationIncludingGravity) return;

    const accelerometerData: AccelerometerData = {
      x: event.accelerationIncludingGravity.x || 0,
      y: event.accelerationIncludingGravity.y || 0,
      z: event.accelerationIncludingGravity.z || 0,
      timestamp: Date.now()
    };

    const earthAcceleration = lastKnownGyroscopeRef.current
      ? calculateEarthAcceleration(accelerometerData, lastKnownGyroscopeRef.current)
      : null;

    const newDataPoint: RideDataPoint = {
      accelerometer: accelerometerData,
      gyroscope: lastKnownGyroscopeRef.current, // Will be updated if gyro event fires
      location: lastKnownLocationRef.current, // Use cached location
      earth: earthAcceleration,
      timestamp: Date.now()
    };

    setCurrentData(prev => ({
      ...prev,
      ...newDataPoint,
    }));

    dataPointsRef.current.push(newDataPoint);
  }, []);

  const handleGyroscopeData = useCallback((event: DeviceOrientationEvent) => {
    const gyroscopeData: GyroscopeData = {
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
      timestamp: Date.now()
    };

    // Cache for high-frequency updates
    lastKnownGyroscopeRef.current = gyroscopeData;

    // Update state without stale check
    setCurrentData(prev => prev ? {
      ...prev,
      gyroscope: gyroscopeData,
    } : null);

    // Update ref directly
    if (dataPointsRef.current.length > 0) {
      const lastIndex = dataPointsRef.current.length - 1;
      dataPointsRef.current[lastIndex] = {
        ...dataPointsRef.current[lastIndex],
        gyroscope: gyroscopeData,
      };
    }
  }, []);

  // Helper to get specific error message
  const getGeoErrorMessage = (code: number) => {
    switch (code) {
      case 1: return 'Location permission denied';
      case 2: return 'Location unavailable (GPS signal lost)';
      case 3: return 'Location request timed out';
      default: return 'Unknown location error';
    }
  };

  const setupGeolocation = useCallback(() => {
    if (!hasGeolocation) return;

    return navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };

        const trueGpsUpdate: GpsUpdate = {
          timestamp: Date.now(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading
        };

        // Cache for high-frequency updates
        lastKnownLocationRef.current = locationData;
        gpsUpdatesRef.current.push(trueGpsUpdate);

        setCurrentData(prev => prev ? {
          ...prev,
          location: locationData,
        } : null);

        const lastIndex = dataPointsRef.current.length - 1;
        if (lastIndex >= 0) {
          dataPointsRef.current[lastIndex] = {
            ...dataPointsRef.current[lastIndex],
            location: locationData,
          };
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000 // Increased timeout to avoid constant errors, but maximumAge 0 for frequency
      }
    );
  }, [hasGeolocation]);

  const startTracking = useCallback(async () => {
    // Request permissions first
    const granted = await requestPermissions();
    if (!granted) return false;

    if (!hasAccelerometer) {
      toast.error('Accelerometer not available on this device');
      return false;
    }

    dataPointsRef.current = [];
    gpsUpdatesRef.current = [];
    setDataPoints([]);
    setGpsUpdates([]);

    if (hasAccelerometer) {
      window.addEventListener('devicemotion', handleAccelerometerData);
    }

    // Use ref to check for gyro support including recently granted permission
    if (hasGyroscope || hasGyroscopeRefIndex.current) {
      window.addEventListener('deviceorientation', handleGyroscopeData);
    }

    if (hasGeolocation) {
      geolocationRef.current = setupGeolocation() || null;
    }

    // ... rest of startTracking
    setIsTracking(true);

    const intervalId = setInterval(() => {
      setDataPoints([...dataPointsRef.current]);
      setGpsUpdates([...gpsUpdatesRef.current]);
    }, 1000);

    return intervalId;
  }, [
    hasAccelerometer,
    hasGyroscope,
    hasGeolocation,
    handleAccelerometerData,
    handleGyroscopeData,
    setupGeolocation,
    requestPermissions // Added dependency
  ]);

  const stopTracking = useCallback((intervalId: number) => {
    window.removeEventListener('devicemotion', handleAccelerometerData);

    // Use ref here too just to be safe, though state should have updated by now
    if (hasGyroscope || hasGyroscopeRefIndex.current) {
      window.removeEventListener('deviceorientation', handleGyroscopeData);
    }

    if (geolocationRef.current !== null && hasGeolocation) {
      navigator.geolocation.clearWatch(geolocationRef.current);
    }

    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      }).catch(e => console.error(e));
    }

    clearInterval(intervalId);

    setDataPoints([...dataPointsRef.current]);
    setGpsUpdates([...gpsUpdatesRef.current]);
    setIsTracking(false);

    return {
      dataPoints: dataPointsRef.current,
      gpsUpdates: gpsUpdatesRef.current
    };
  }, [handleAccelerometerData, handleGyroscopeData, hasGeolocation]);

  return {
    isTracking,
    currentData,
    dataPoints,
    gpsUpdates,
    hasAccelerometer,
    hasGyroscope,
    hasGeolocation,
    startTracking,
    stopTracking
  };
};
