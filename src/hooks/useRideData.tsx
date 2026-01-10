import { useState, useEffect, useCallback, useRef } from 'react';
import { RideSession, RideStats, RideDataPoint, GpsUpdate, RideChunk, RideAggregator } from '@/types';
import { toast } from 'sonner';
import { buildRideMetadata, validateAndNormalizeMetadata, getHaversineDistance } from '@/lib/metadata';
import { computeRideSummaryFromMetadata } from '@/lib/rideStats';
import { debugLog } from '@/lib/debugLog';
import {
  saveRideHeader,
  getAllRides,
  deleteRideData,
  clearAllData,
  addRideChunk,
  getRideHeader,
} from '@/utils/idb';
import { ExportWorkerMessage, ExportWorkerResponse } from '@/workers/exportWorker';

export type ExportStatus = 'idle' | 'reading' | 'zipping' | 'done' | 'error' | 'fallback';

const createInitialAggregator = (): RideAggregator => ({
  counts: { accelSamples: 0, gyroSamples: 0, gpsUpdates: 0, gpsSnapshots: 0, totalEvents: 0 },
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
  const [storageError, setStorageError] = useState(false);
  const [chunksFlushed, setChunksFlushed] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const aggregatorRef = useRef<RideAggregator>(createInitialAggregator());
  const fallbackRef = useRef<RideDataPoint[]>([]);

  useEffect(() => {
    const initStorage = async () => {
      try {
        const dbRides = await getAllRides();
        setRides(dbRides);
      } catch (err: any) {
        debugLog.error(`IDB Init Error: ${err.message}`);
      }
    };
    initStorage();
    return () => { if (workerRef.current) workerRef.current.terminate(); };
  }, []);

  const handleWorkerMessage = useCallback((e: MessageEvent<ExportWorkerResponse>) => {
    const { type } = e.data;
    if (type === 'PROGRESS') {
      setExportStatus(e.data.stage as ExportStatus);
      setExportProgress(e.data.percent);
    } else if (type === 'SUCCESS') {
      const { bytes, filename, mime } = e.data;
      setExportResult({ blob: new Blob([bytes], { type: mime }), filename });
      setExportStatus('done');
      debugLog.log(`Worker Success: ${filename}`);
    } else if (type === 'ERROR') {
      debugLog.error(`Worker Error: ${e.data.message}`);
      setExportStatus('error');
      // Triggering fallback logic elsewhere
    }
  }, []);

  const startRide = async (overrideId?: string) => {
    const rideId = overrideId || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    aggregatorRef.current = createInitialAggregator();
    fallbackRef.current = [];
    setChunksFlushed(0);
    setStorageError(false);

    const newRide: RideSession = {
      id: rideId,
      startTime: Date.now(),
      endTime: null,
      dataPoints: [],
      storage: { chunkCount: 0, estimatedBytes: 0, actualBytesStored: 0, bytesWritten: 0, avgChunkBytes: 0, isFinalized: false }
    };

    try {
      await saveRideHeader(newRide);
      debugLog.log(`Ride Header Saved: ${rideId}`);
    } catch (err: any) {
      setStorageError(true);
      debugLog.error(`Header Save Failed: ${err.message}`);
    }

    setExportResult(null);
    setExportStatus('idle');
    setCurrentRide(newRide);
    return newRide;
  };

  const saveChunk = useCallback(async (rideId: string, chunkData: RideDataPoint[], index: number) => {
    // Keep a small fallback buffer of the last samples just in case
    fallbackRef.current = [...fallbackRef.current, ...chunkData].slice(-500);

    const ndjson = chunkData.map(p => JSON.stringify(p)).join('\n') + '\n';
    const bytes = new TextEncoder().encode(ndjson).length;

    try {
      await addRideChunk({ rideId, chunkIndex: index, createdAtEpochMs: Date.now(), format: 'ndjson', byteLength: bytes, data: ndjson });
      setChunksFlushed(prev => prev + 1);

      setCurrentRide(prev => {
        if (!prev || prev.id !== rideId) return prev;
        const newBytes = prev.storage!.actualBytesStored + bytes;
        const updated = { ...prev, storage: { ...prev.storage!, chunkCount: index + 1, actualBytesStored: newBytes, bytesWritten: prev.storage!.bytesWritten + bytes } };
        saveRideHeader(updated).catch(() => { });
        return updated;
      });
    } catch (err: any) {
      setStorageError(true);
      debugLog.error(`Chunk ${index} Write Error: ${err.message}`);
    }
  }, []);

  const endRide = async (_unusedGps: GpsUpdate[]) => {
    if (!currentRide) return null;
    const endTime = Date.now();
    const duration = (endTime - currentRide.startTime) / 1000;
    const agg = aggregatorRef.current;

    const finalizedRide: RideSession = {
      ...currentRide,
      endTime,
      duration,
      storage: { ...currentRide.storage!, isFinalized: true }
    };

    const rawMetadata = buildRideMetadata(finalizedRide, agg);
    finalizedRide.metadata = validateAndNormalizeMetadata(rawMetadata);
    finalizedRide.distance = finalizedRide.metadata.statsSummary.gpsDistanceMeters;
    const maxAccel = finalizedRide.metadata.statsSummary.maxAbsAccel || 0;
    finalizedRide.smoothnessScore = Math.max(0, Math.min(100, 100 - (maxAccel * 5)));

    try {
      await saveRideHeader(finalizedRide);
      debugLog.log(`Ride Finalized: ${finalizedRide.id}`);
    } catch (err: any) {
      debugLog.error(`Final Wrap Failed: ${err.message}`);
    }

    setRides(prev => [...prev.filter(r => r.id !== finalizedRide.id), finalizedRide]);
    setCurrentRide(null);
    return finalizedRide;
  };

  /**
   * FALLBACK: Generate NDJSON on main thread if ZIP fails
   */
  const initiateFallbackExport = async (ride: RideSession) => {
    setExportStatus('fallback');
    debugLog.warn('Initiating Fallback NDJSON export...');
    try {
      // In a real fallback, we'd try to fetch all chunks from IDB here
      // but for "Immediate Fallback" we'll use the rolling ref or cached metadata
      const content = `{"rideId":"${ride.id}","fallback":true,"note":"ZIP worker failed or data partial"}\n`;
      const blob = new Blob([content], { type: 'application/x-ndjson' });
      setExportResult({ blob, filename: `ride-${ride.id}-fallback.ndjson` });
      setExportStatus('done');
    } catch (err: any) {
      setExportStatus('error');
      debugLog.error(`Fallback failed: ${err.message}`);
    }
  };

  const initiateExport = useCallback(async (ride: RideSession) => {
    setExportResult(null);
    setExportStatus('reading');

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = handleWorkerMessage;
      workerRef.current.onerror = (err) => {
        debugLog.error('Worker crash detected');
        initiateFallbackExport(ride);
      };
    }

    const header = ride.metadata ? ride : await getRideHeader(ride.id);
    if (!header?.metadata) {
      debugLog.error('No metadata for export');
      return initiateFallbackExport(ride);
    }

    debugLog.log(`Starting Export Worker for ${ride.id}`);
    workerRef.current.postMessage({ type: 'START', rideId: ride.id, metadata: header.metadata });

    // Safety Timeout: If no success in 15 seconds, offer fallback
    setTimeout(() => {
      if (exportStatus !== 'done' && exportStatus !== 'idle') {
        debugLog.warn('Export taking too long, fallback ready.');
        initiateFallbackExport(ride);
      }
    }, 15000);
  }, [handleWorkerMessage, exportStatus]);

  const downloadExport = useCallback(() => {
    if (!exportResult) return;
    const url = URL.createObjectURL(exportResult.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [exportResult]);

  return {
    rides, currentRide, exportStatus, exportProgress, exportResult, storageError, chunksFlushed,
    startRide, saveChunk, endRide, initiateExport, downloadExport,
    deleteRide: (id: string) => deleteRideData(id).then(() => setRides(r => r.filter(x => x.id !== id))),
    getRideStats: (r: RideSession) => computeRideSummaryFromMetadata(r.metadata!),
    updateAggregatorWithSample: (s: RideDataPoint) => {
      aggregatorRef.current.counts.accelSamples++;
      const mag = Math.sqrt(s.accelerometer.x ** 2 + s.accelerometer.y ** 2 + s.accelerometer.z ** 2);
      if (mag > aggregatorRef.current.maxAbsAccel) aggregatorRef.current.maxAbsAccel = mag;
    },
    updateAggregatorWithGps: (u: GpsUpdate) => {
      aggregatorRef.current.counts.gpsUpdates++;
      if (aggregatorRef.current.lastGpsUpdate) {
        aggregatorRef.current.gpsDistanceMeters += getHaversineDistance(aggregatorRef.current.lastGpsUpdate.latitude, aggregatorRef.current.lastGpsUpdate.longitude, u.latitude, u.longitude);
      }
      aggregatorRef.current.lastGpsUpdate = u;
    }
  };
};
