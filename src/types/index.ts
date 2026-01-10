import { RideMetadata } from '../lib/metadata';

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface GyroscopeData {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface EarthAcceleration {
  x: number;
  y: number;
  z: number;
}

export interface RideDataPoint {
  accelerometer: AccelerometerData;
  gyroscope: GyroscopeData | null;
  location: LocationData | null;
  earth: EarthAcceleration | null;
  timestamp: number;
}

export interface GpsUpdate {
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
}

export interface RideChunk {
  rideId: string;
  chunkIndex: number;
  createdAtEpochMs: number;
  format: "ndjson";
  byteLength: number;
  data: string; // NDJSON string
}

export interface RideSession {
  id: string;
  startTime: number;
  endTime: number | null;
  dataPoints: RideDataPoint[]; // Will be empty in the "header" stored in DB
  gpsUpdates?: GpsUpdate[];    // Will be empty in the "header" stored in DB
  smoothnessScore?: number;
  distance?: number;
  duration?: number;
  startBattery?: number;
  endBattery?: number;
  metadata?: RideMetadata;
  // Step 2 storage metrics
  storage?: {
    chunkCount: number;
    estimatedBytes: number;
    actualBytesStored: number;
    bytesWritten: number; // For Stage 2 requirement E-2
    avgChunkBytes: number; // For Stage 2 requirement E-2
    isFinalized: boolean;
  };
}

export interface RideStats {
  averageAcceleration: number;
  maxAcceleration: number;
  suddenStops: number;
  suddenAccelerations: number;
  vibrationLevel: number;
  duration: number;
  distance: number;
}

export interface RideAggregator {
  counts: {
    accelSamples: number;
    gyroSamples: number;
    gpsUpdates: number;
    gpsSnapshots: number;
    totalEvents: number;
  };
  maxAbsAccel: number;
  absAccelReservoir: number[];
  reservoirSize: number;
  gpsDistanceMeters: number;
  totalSpeedMps: number;
  gapCount: number;
  lastSensorTimestamp: number | null;
  stationaryLikely: boolean;
  firstGpsFixTimestamp: number | null;
  lastGpsUpdate: GpsUpdate | null;
}

// Re-export RideMetadata for convenience
export type { RideMetadata } from '../lib/metadata';
