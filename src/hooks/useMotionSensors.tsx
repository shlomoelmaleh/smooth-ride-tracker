import { useState, useEffect, useRef, useCallback } from 'react';
import { RideDataPoint, GpsUpdate } from '@/types';
import { toast } from 'sonner';
import { detectCapabilities, requestSensorPermissions } from '@/sensors/sensorRegistry';
import { startCollectors } from '@/sensors/sensorCollector';
import { CollectionHealth, CapabilitiesReport } from '@/sensors/sensorTypes';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<CollectionHealth | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesReport | null>(null);

  const dataPointsRef = useRef<RideDataPoint[]>([]);
  const gpsUpdatesRef = useRef<GpsUpdate[]>([]);
  const collectorRef = useRef<{ stop: () => void } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  useEffect(() => {
    const init = async () => {
      const caps = await detectCapabilities();
      setCapabilities(caps);
      setHasAccelerometer(caps.deviceMotion.supportedByApi);
      setHasGeolocation(caps.gps.supportedByApi);
    };
    init();

    return () => {
      if (collectorRef.current) collectorRef.current.stop();
      if (wakeLockRef.current) wakeLockRef.current.release();
    };
  }, []);

  const startTracking = useCallback(async () => {
    const permissions = await requestSensorPermissions();
    if (permissions.motion === 'denied' || permissions.location === 'denied') {
      toast.error('Required permissions denied');
      return false;
    }

    // Refresh capabilities after permission grant
    const caps = await detectCapabilities();
    setCapabilities(caps);

    if (!caps.deviceMotion.supportedByApi) {
      toast.error('Motion sensors not supported');
      return false;
    }

    dataPointsRef.current = [];
    gpsUpdatesRef.current = [];
    setIsTracking(true);

    // Keep screen awake
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (e) { }
    }

    const collector = startCollectors({
      onSample: (sample) => {
        dataPointsRef.current.push(sample);
        setCurrentData(sample);

        // Populate gpsUpdatesRef for backward compatibility if needed
        if (sample.sensors.gps) {
          const lastGps = gpsUpdatesRef.current[gpsUpdatesRef.current.length - 1];
          if (!lastGps || lastGps.timestamp !== sample.sensors.gps.timestamp) {
            gpsUpdatesRef.current.push({
              timestamp: sample.sensors.gps.timestamp,
              latitude: sample.sensors.gps.lat,
              longitude: sample.sensors.gps.lon,
              accuracy: sample.sensors.gps.accuracy,
              speed: sample.sensors.gps.speed,
              heading: sample.sensors.gps.heading
            });
          }
        }
      },
      onHealthUpdate: (health) => {
        setCollectionHealth(health);
      }
    });

    collectorRef.current = collector;
    return true; // Return true as indicator
  }, []);

  const stopTracking = useCallback(() => {
    if (collectorRef.current) {
      collectorRef.current.stop();
      collectorRef.current = null;
    }

    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    setIsTracking(false);

    return {
      dataPoints: dataPointsRef.current,
      gpsUpdates: gpsUpdatesRef.current,
      collectionHealth,
      capabilities
    };
  }, [collectionHealth, capabilities]);

  return {
    isTracking,
    currentData,
    collectionHealth,
    capabilities,
    hasAccelerometer,
    hasGeolocation,
    startTracking,
    stopTracking,
    gpsUpdates: [] // Legacy field, keeping for compatibility but now empty in state (use refs/end of ride)
  };
};
