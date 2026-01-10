import { useState, useEffect, useCallback, useRef } from 'react';
import { RideSession, RideStats, RideDataPoint, GpsUpdate, RideChunk, RideAggregator } from '@/types';
import { toast } from 'sonner';
import { buildRideMetadata, validateAndNormalizeMetadata, getHaversineDistance } from '@/lib/metadata';
import {
  saveRideHeader,
  getAllRides,
  deleteRideData,
  clearAllData,
  addRideChunk,
  getRideHeader,
  getRideChunks
} from '@/utils/idb';
import { ExportWorkerMessage, ExportWorkerResponse } from '@/workers/exportWorker';

export type ExportStatus = 'idle' | 'reading' | 'zipping' | 'done' | 'error';

const createInitialAggregator = (): RideAggregator => ({
  counts: {
    accelSamples: 0,
    gyroSamples: 0,
    gpsUpdates: 0,
    gpsSnapshots: 0,
    totalEvents: 0,
  },
  maxAbsAccel: 0,
  absAccelReservoir: [],
  reservoirSize: 2000,
  gpsDistanceMeters: 0,
  totalSpeedMps: 0,
  gapCount: 0,
  lastSensorTimestamp: null,
  stationaryLikely: false,
  firstGpsFixTimestamp: null,
  lastGpsUpdate: null,
});

export const useRideData = () => {
  const [rides, setRides] = useState<RideSession[]>([]);
  const [currentRide, setCurrentRide] = useState<RideSession | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState<{ blob: Blob, filename: string } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const aggregatorRef = useRef<RideAggregator>(createInitialAggregator());

  // Load rides from storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        const dbRides = await getAllRides();
        setRides(dbRides);
      } catch (error) {
        console.error('Error initialization storage:', error);
      }
    };
    initStorage();

    // Cleanup worker
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Handlers for Worker messages
  const handleWorkerMessage = useCallback((e: MessageEvent<ExportWorkerResponse>) => {
    const { type } = e.data;
    if (type === 'PROGRESS') {
      setExportStatus(e.data.stage as ExportStatus);
      setExportProgress(e.data.percent);
    } else if (type === 'SUCCESS') {
      setExportResult({ blob: e.data.blob, filename: e.data.filename });
      setExportStatus('done');
      toast.success('Export assembled successfully');
    } else if (type === 'ERROR') {
      setExportStatus('error');
      toast.error(`Export failed: ${e.data.message}`);
    }
  }, []);

  // Incremental aggregator updates
  const updateAggregatorWithSample = useCallback((sample: RideDataPoint) => {
    const agg = aggregatorRef.current;
    agg.counts.accelSamples++;
    if (sample.gyroscope) agg.counts.gyroSamples++;
    if (sample.location) agg.counts.gpsSnapshots++;
    agg.counts.totalEvents++;

    const acc = sample.earth || sample.accelerometer;
    const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    if (mag > agg.maxAbsAccel) agg.maxAbsAccel = mag;

    // Reservoir sampling for percentiles
    if (agg.absAccelReservoir.length < agg.reservoirSize) {
      agg.absAccelReservoir.push(mag);
    } else {
      const j = Math.floor(Math.random() * agg.counts.accelSamples);
      if (j < agg.reservoirSize) {
        agg.absAccelReservoir[j] = mag;
      }
    }

    // Gap detection
    if (agg.lastSensorTimestamp && (sample.timestamp - agg.lastSensorTimestamp > 250)) {
      agg.gapCount++;
    }
    agg.lastSensorTimestamp = sample.timestamp;
  }, []);

  const updateAggregatorWithGps = useCallback((update: GpsUpdate) => {
    const agg = aggregatorRef.current;
    agg.counts.gpsUpdates++;
    agg.totalSpeedMps += update.speed || 0;

    if (!agg.firstGpsFixTimestamp) {
      agg.firstGpsFixTimestamp = update.timestamp;
    }

    if (agg.lastGpsUpdate) {
      const dist = getHaversineDistance(
        agg.lastGpsUpdate.latitude, agg.lastGpsUpdate.longitude,
        update.latitude, update.longitude
      );
      agg.gpsDistanceMeters += dist;
    }
    agg.lastGpsUpdate = update;
  }, []);

  // Start a new ride session
  const startRide = async () => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const rideId = `${timestamp}-${randomSuffix}`;

    aggregatorRef.current = createInitialAggregator();

    // Attempt to get battery level
    let startBattery: number | undefined;
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        startBattery = battery.level;
      }
    } catch (e) { }

    const newRide: RideSession = {
      id: rideId,
      startTime: timestamp,
      endTime: null,
      dataPoints: [],
      startBattery,
      storage: {
        chunkCount: 0,
        estimatedBytes: 0,
        actualBytesStored: 0,
        bytesWritten: 0,
        avgChunkBytes: 0,
        isFinalized: false
      }
    };

    setExportResult(null);
    setExportStatus('idle');
    setCurrentRide(newRide);

    // Save initial header
    await saveRideHeader(newRide);

    return newRide;
  };

  // Process a chunk of data points from useMotionSensors
  const saveChunk = useCallback(async (rideId: string, chunkData: RideDataPoint[], index: number) => {
    const ndjson = chunkData.map(p => JSON.stringify(p)).join('\n') + '\n';
    const bytes = new TextEncoder().encode(ndjson).length;

    const chunk: RideChunk = {
      rideId,
      chunkIndex: index,
      createdAtEpochMs: Date.now(),
      format: 'ndjson',
      byteLength: bytes,
      data: ndjson
    };

    await addRideChunk(chunk);

    // Update local metrics and header
    setCurrentRide(prev => {
      if (!prev || prev.id !== rideId) return prev;
      const newBytes = prev.storage!.actualBytesStored + bytes;
      const newCount = index + 1;
      const updated = {
        ...prev,
        storage: {
          ...prev.storage!,
          chunkCount: newCount,
          actualBytesStored: newBytes,
          bytesWritten: prev.storage!.bytesWritten + bytes,
          estimatedBytes: newBytes,
          avgChunkBytes: Math.round(newBytes / newCount)
        }
      };

      // Persist header update periodically or at least once
      saveRideHeader(updated).catch(console.error);
      return updated;
    });
  }, []);

  // End the current ride
  const endRide = async (gpsUpdates: GpsUpdate[]) => {
    if (!currentRide) return null;

    const endTime = Date.now();
    let endBattery: number | undefined;
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        endBattery = battery.level;
      }
    } catch (e) { }

    const duration = (endTime - currentRide.startTime) / 1000;
    const agg = aggregatorRef.current;

    // Stationary check
    agg.stationaryLikely = duration > 30 && (agg.gpsDistanceMeters < 30 || (agg.totalSpeedMps / Math.max(1, agg.counts.gpsUpdates)) < 0.5);

    const finalizedRide: RideSession = {
      ...currentRide,
      endTime,
      dataPoints: [], // Keep empty
      gpsUpdates: [], // Keep empty
      endBattery,
      duration,
      storage: {
        ...currentRide.storage!,
        isFinalized: true
      }
    };

    // 2. Build and validate metadata using aggregator
    const rawMetadata = buildRideMetadata(finalizedRide, agg);
    finalizedRide.metadata = validateAndNormalizeMetadata(rawMetadata);

    await saveRideHeader(finalizedRide);

    setRides(prev => [...prev.filter(r => r.id !== finalizedRide.id), finalizedRide]);
    setCurrentRide(null);

    // 3. No automatic export initiation anymore

    return finalizedRide;
  };

  // Initiate background export via Worker
  const initiateExport = useCallback(async (ride: RideSession) => {
    if (!ride.metadata) {
      const header = await getRideHeader(ride.id);
      if (!header || !header.metadata) return;
      ride = header;
    }

    setExportResult(null);
    setExportStatus('reading');
    setExportProgress(0);

    // Initialize worker if needed
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/exportWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = handleWorkerMessage;
    }

    const message: ExportWorkerMessage = {
      type: 'START',
      rideId: ride.id,
      metadata: ride.metadata!
    };
    workerRef.current.postMessage(message);
  }, [handleWorkerMessage]);

  // Handle final download click
  const downloadExport = useCallback(() => {
    if (!exportResult) return;

    const url = URL.createObjectURL(exportResult.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportResult.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke after a delay to ensure Safari catches it
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [exportResult]);

  // Delete a ride
  const deleteRide = async (rideId: string) => {
    try {
      await deleteRideData(rideId);
      setRides(prev => prev.filter(ride => ride.id !== rideId));
      toast.success('Ride deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete ride');
    }
  };

  // Clear all rides
  const clearAllRides = async () => {
    try {
      await clearAllData();
      setRides([]);
      toast.success('All history cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

  // Get stats for a ride (from metadata)
  const getRideStats = useCallback((ride: RideSession): RideStats => {
    const meta = ride.metadata;
    if (!meta) {
      return {
        averageAcceleration: 0,
        maxAcceleration: 0,
        suddenStops: 0,
        suddenAccelerations: 0,
        vibrationLevel: 0,
        duration: ride.duration || 0,
        distance: ride.distance || 0
      };
    }

    return {
      averageAcceleration: meta.statsSummary?.maxAbsAccel || 0, // Using maxAbsAccel as approximation
      maxAcceleration: meta.statsSummary?.maxAbsAccel || 0,
      suddenStops: meta.qualityFlags?.dataIntegrity?.gapCount || 0,
      suddenAccelerations: 0,
      vibrationLevel: meta.statsSummary?.maxAbsAccelContext?.p95 || 0,
      duration: (meta.durationMs || 0) / 1000,
      distance: meta.statsSummary?.gpsDistanceMeters || 0
    };
  }, []);

  return {
    rides,
    currentRide,
    exportStatus,
    exportProgress,
    exportResult,
    startRide,
    saveChunk,
    endRide,
    deleteRide,
    clearAllRides,
    initiateExport,
    exportRideData: initiateExport,
    downloadExport,
    getRideStats,
    updateAggregatorWithSample,
    updateAggregatorWithGps
  };
};

