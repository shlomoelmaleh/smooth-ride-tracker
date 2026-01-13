import { useState, useEffect, useRef, useCallback } from 'react';
import { RideDataPoint, GpsUpdate } from '@/types';
import { toast } from 'sonner';
import { detectCapabilities, requestSensorPermissions } from '@/sensors/sensorRegistry';
import { startCollectors } from '@/sensors/sensorCollector';
import { CollectionHealth, CapabilitiesReport } from '@/sensors/sensorTypes';
import { createDiagnosticsManager, DiagnosticEvent, DiagnosticIssue, DiagnosticsSummary, DiagnosticsPermissions } from '@/diagnostics/diagnostics';

export const useMotionSensors = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentData, setCurrentData] = useState<RideDataPoint | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<CollectionHealth | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesReport | null>(null);
  const [permissions, setPermissions] = useState<DiagnosticsPermissions>({ motion: 'prompt', location: 'prompt', orientation: 'prompt' });
  const [activeDiagnostics, setActiveDiagnostics] = useState<DiagnosticIssue[]>([]);
  const [sessionFindings, setSessionFindings] = useState<DiagnosticEvent[]>([]);
  const [diagnosticsSummary, setDiagnosticsSummary] = useState<DiagnosticsSummary>({ status: 'OK', issuesCount: 0 });

  const dataPointsRef = useRef<RideDataPoint[]>([]);
  const gpsUpdatesRef = useRef<GpsUpdate[]>([]);
  const collectorRef = useRef<{ stop: () => void } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const diagnosticsRef = useRef(createDiagnosticsManager());
  const baselineTimersRef = useRef<number[]>([]);

  const [hasAccelerometer, setHasAccelerometer] = useState(false);
  const [hasGeolocation, setHasGeolocation] = useState(false);

  useEffect(() => {
    const init = async () => {
      const caps = await detectCapabilities();
      setCapabilities(caps);
      setHasAccelerometer(caps.deviceMotion.supportedByApi);
      setHasGeolocation(caps.gps.supportedByApi);
      diagnosticsRef.current.updateCapabilities(caps);
    };
    init();

    return () => {
      if (collectorRef.current) collectorRef.current.stop();
      if (wakeLockRef.current) wakeLockRef.current.release();
      baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      baselineTimersRef.current = [];
    };
  }, []);

  const startTracking = useCallback(async () => {
    const permissions = await requestSensorPermissions();
    setPermissions(permissions);
    diagnosticsRef.current.updatePermissions(permissions);
    if (permissions.motion === 'denied' || permissions.location === 'denied') {
      toast.error('Required permissions denied');
      return false;
    }

    // Refresh capabilities after permission grant
    const caps = await detectCapabilities();
    setCapabilities(caps);
    diagnosticsRef.current.updateCapabilities(caps);

    if (!caps.deviceMotion.supportedByApi) {
      toast.error('Motion sensors not supported');
      return false;
    }

    dataPointsRef.current = [];
    gpsUpdatesRef.current = [];
    setIsTracking(true);
    const startSnapshot = diagnosticsRef.current.startSession(Date.now());
    setActiveDiagnostics(startSnapshot.activeIssues);
    setSessionFindings(startSnapshot.sessionFindings);
    setDiagnosticsSummary(startSnapshot.summary);
    baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    baselineTimersRef.current = [
      window.setTimeout(() => {
        const snapshot = diagnosticsRef.current.tick(Date.now());
        setActiveDiagnostics(snapshot.activeIssues);
        setSessionFindings(snapshot.sessionFindings);
        setDiagnosticsSummary(snapshot.summary);
      }, 250),
      window.setTimeout(() => {
        const snapshot = diagnosticsRef.current.tick(Date.now());
        setActiveDiagnostics(snapshot.activeIssues);
        setSessionFindings(snapshot.sessionFindings);
        setDiagnosticsSummary(snapshot.summary);
      }, 5000)
    ];

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
        diagnosticsRef.current.recordSample(sample);

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
        const snapshot = diagnosticsRef.current.updateHealth(health, Date.now());
        setActiveDiagnostics(snapshot.activeIssues);
        setSessionFindings(snapshot.sessionFindings);
        setDiagnosticsSummary(snapshot.summary);
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
    baselineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    baselineTimersRef.current = [];
    const snapshot = diagnosticsRef.current.stopSession(Date.now());
    setActiveDiagnostics([]);
    setDiagnosticsSummary({ status: 'OK', issuesCount: 0 });
    setSessionFindings(snapshot.sessionFindings);

    return {
      dataPoints: dataPointsRef.current,
      gpsUpdates: gpsUpdatesRef.current,
      sessionFindings: snapshot.sessionFindings,
      collectionHealth,
      capabilities
    };
  }, [collectionHealth, capabilities]);

  return {
    isTracking,
    currentData,
    collectionHealth,
    capabilities,
    permissions,
    activeDiagnostics,
    sessionFindings,
    diagnosticsSummary,
    hasAccelerometer,
    hasGeolocation,
    startTracking,
    stopTracking,
    gpsUpdates: [] // Legacy field, keeping for compatibility but now empty in state (use refs/end of ride)
  };
};
