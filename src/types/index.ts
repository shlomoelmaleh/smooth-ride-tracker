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

export type RideEventType = 'stop' | 'acceleration' | 'impact' | 'turn' | 'other';

export interface RideEventMarker {
  timestamp: number;
  relativeTimeMs: number;
  type: RideEventType;
  intensity: number; // 0.0 to 1.0 (relative)
  label: string;
}

export interface GpsUpdate {
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
}

export interface RideSession {
  id: string;
  startTime: number;
  endTime: number | null;
  dataPoints: RideDataPoint[];
  gpsUpdates?: GpsUpdate[];
  smoothnessScore?: number;
  distance?: number;
  duration?: number;
  startBattery?: number;
  endBattery?: number;
  metadata?: RideMetadata; // Now properly typed
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

export interface RideDetailsViewModel {
  rideId: string;
  createdAtIso: string;
  endedAtIso?: string;
  durationSeconds: number;
  distanceMeters?: number;
  smoothnessScore?: number;
  smoothnessLabel?: string;
  statsSummary?: {
    suddenStops?: number;
    suddenAccelerations?: number;
    maxAbsAccel?: number;
    vibrationLevel?: number;
  };
  qualityFlags?: {
    isGpsLikelyDuplicated?: boolean;
    hasLowGpsQuality?: boolean;
    gpsQualityReason?: string;
  };
  events?: RideEventMarker[];
}

// Re-export RideMetadata for convenience
export type { RideMetadata } from '../lib/metadata';
