
import { useState, useEffect, useRef, useCallback } from 'react';
import { AccelerometerData, GyroscopeData, LocationData, RideDataPoint } from '@/types';
import { toast } from '@/components/ui/sonner';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [dataPoints, setDataPoints] = useState<RideDataPoint[]>([]);
  const dataPointsRef = useRef<RideDataPoint[]>([]);
  
  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGyroscope, setHasGyroscope] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);
  
  const accelerometerRef = useRef<number | null>(null);
  const gyroscopeRef = useRef<number | null>(null);
  const geolocationRef = useRef<number | null>(null);
  
  // Check device capabilities
  useEffect(() => {
    // Check if accelerometer is available
    if ('DeviceMotionEvent' in window) {
      setHasAccelerometer(true);
    }
    
    // Check if gyroscope is available
    if ('DeviceOrientationEvent' in window) {
      setHasGyroscope(true);
    }
    
    // Check if geolocation is available
    if ('geolocation' in navigator) {
      setHasGeolocation(true);
    }
  }, []);

  // Handle accelerometer data
  const handleAccelerometerData = useCallback((event: DeviceMotionEvent) => {
    if (!event.accelerationIncludingGravity) return;
    
    const accelerometerData: AccelerometerData = {
      x: event.accelerationIncludingGravity.x || 0,
      y: event.accelerationIncludingGravity.y || 0,
      z: event.accelerationIncludingGravity.z || 0,
      timestamp: Date.now()
    };
    
    const newDataPoint: RideDataPoint = {
      accelerometer: accelerometerData,
      gyroscope: null,
      location: null,
      timestamp: Date.now()
    };
    
    setCurrentData(prev => ({
      ...prev,
      ...newDataPoint,
    }));
    
    dataPointsRef.current.push(newDataPoint);
  }, []);

  // Handle gyroscope data
  const handleGyroscopeData = useCallback((event: DeviceOrientationEvent) => {
    const gyroscopeData: GyroscopeData = {
      alpha: event.alpha || 0,
      beta: event.beta || 0, 
      gamma: event.gamma || 0,
      timestamp: Date.now()
    };
    
    if (currentData) {
      setCurrentData(prev => prev ? {
        ...prev,
        gyroscope: gyroscopeData,
      } : null);
      
      // Update the last data point with gyroscope data
      if (dataPointsRef.current.length > 0) {
        const lastIndex = dataPointsRef.current.length - 1;
        dataPointsRef.current[lastIndex] = {
          ...dataPointsRef.current[lastIndex],
          gyroscope: gyroscopeData,
        };
      }
    }
  }, [currentData]);

  // Handle location data
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
        
        if (currentData) {
          setCurrentData(prev => prev ? {
            ...prev,
            location: locationData,
          } : null);
          
          // Update the last few data points with location data
          // since location updates less frequently
          const lastIndex = dataPointsRef.current.length - 1;
          if (lastIndex >= 0) {
            dataPointsRef.current[lastIndex] = {
              ...dataPointsRef.current[lastIndex],
              location: locationData,
            };
          }
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error('Could not access location services. Some features may be limited.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );
  }, [hasGeolocation, currentData]);

  // Start tracking
  const startTracking = useCallback(() => {
    if (!hasAccelerometer) {
      toast.error('Accelerometer not available on this device');
      return false;
    }
    
    // Clear previous data
    dataPointsRef.current = [];
    setDataPoints([]);
    
    // Start accelerometer
    if (hasAccelerometer) {
      window.addEventListener('devicemotion', handleAccelerometerData);
    }
    
    // Start gyroscope if available
    if (hasGyroscope) {
      window.addEventListener('deviceorientation', handleGyroscopeData);
    }
    
    // Start geolocation if available
    if (hasGeolocation) {
      geolocationRef.current = setupGeolocation() || null;
    }
    
    setIsTracking(true);
    
    // Schedule regular updates of the state (not every data point to avoid performance issues)
    const intervalId = setInterval(() => {
      setDataPoints([...dataPointsRef.current]);
    }, 1000);
    
    // Store interval ID for cleanup
    return intervalId;
  }, [
    hasAccelerometer, 
    hasGyroscope, 
    hasGeolocation, 
    handleAccelerometerData, 
    handleGyroscopeData, 
    setupGeolocation
  ]);

  // Stop tracking
  const stopTracking = useCallback((intervalId: number) => {
    // Remove event listeners
    window.removeEventListener('devicemotion', handleAccelerometerData);
    
    if (hasGyroscope) {
      window.removeEventListener('deviceorientation', handleGyroscopeData);
    }
    
    if (geolocationRef.current !== null && hasGeolocation) {
      navigator.geolocation.clearWatch(geolocationRef.current);
    }
    
    // Clear interval
    clearInterval(intervalId);
    
    // Final update of data points
    setDataPoints([...dataPointsRef.current]);
    setIsTracking(false);
    
    return dataPointsRef.current;
  }, [handleAccelerometerData, handleGyroscopeData, hasGeolocation, hasGyroscope]);

  return {
    isTracking,
    currentData,
    dataPoints,
    hasAccelerometer,
    hasGyroscope,
    hasGeolocation,
    startTracking,
    stopTracking
  };
};
