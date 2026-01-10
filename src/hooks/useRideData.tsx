import { useState, useEffect, useCallback, useRef } from 'react';
import { RideSession, RideStats, RideDataPoint, GpsUpdate, RideChunk } from '@/types';
import { toast } from 'sonner';
import { buildRideMetadata, validateAndNormalizeMetadata } from '@/lib/metadata';
import {
  saveRideHeader,
  getAllRides,
  deleteRideData,
  clearAllData,
  addRideChunk,
  getRideHeader,
  getRideChunks
} from '@/lib/db';
import { ExportWorkerMessage, ExportWorkerResponse } from '@/workers/exportWorker';

export type ExportStatus = 'idle' | 'reading chunks' | 'assembling ndjson' | 'zipping' | 'finalizing' | 'ready' | 'error';

export const useRideData = () => {
  const [rides, setRides] = useState<RideSession[]>([]);
  const [currentRide, setCurrentRide] = useState<RideSession | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState<{ blob: Blob, filename: string } | null>(null);

  const workerRef = useRef<Worker | null>(null);

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
      setExportStatus('ready');
      toast.success('Export assembled successfully');
    } else if (type === 'ERROR') {
      setExportStatus('error');
      toast.error(`Export failed: ${e.data.message}`);
    }
  }, []);

  // Start a new ride session
  const startRide = async () => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const rideId = `${timestamp}-${randomSuffix}`;

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
      const updated = {
        ...prev,
        storage: {
          ...prev.storage!,
          chunkCount: index + 1,
          actualBytesStored: prev.storage!.actualBytesStored + bytes,
          estimatedBytes: prev.storage!.actualBytesStored + bytes, // simplified
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

    // 1. Gather all chunks to compute final metadata
    const chunks = await getRideChunks(currentRide.id);
    const allDataPoints: RideDataPoint[] = [];
    for (const chunk of chunks) {
      const points = chunk.data.trim().split('\n').map(line => JSON.parse(line));
      allDataPoints.push(...points);
    }

    const finalizedRide: RideSession = {
      ...currentRide,
      endTime,
      dataPoints: allDataPoints, // Temporarily attach for metadata builder
      gpsUpdates,
      endBattery,
      duration: (endTime - currentRide.startTime) / 1000,
      storage: {
        ...currentRide.storage!,
        isFinalized: true,
        actualBytesStored: chunks.reduce((acc, c) => acc + c.byteLength, 0),
        chunkCount: chunks.length
      }
    };

    // 2. Build and validate metadata
    const rawMetadata = buildRideMetadata(finalizedRide);
    finalizedRide.metadata = validateAndNormalizeMetadata(rawMetadata);

    // 3. Clear large arrays before saving header
    const rideToSave = { ...finalizedRide, dataPoints: [] };
    await saveRideHeader(rideToSave);

    setRides(prev => [...prev.filter(r => r.id !== finalizedRide.id), rideToSave]);
    setCurrentRide(null);

    // 4. Initial background export start
    initiateExport(finalizedRide);

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
    setExportStatus('reading chunks');
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

  // Clear all
  const clearAllRides = async () => {
    try {
      await clearAllData();
      setRides([]);
      toast.success('All history cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

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
    downloadExport
  };
};

