
export type StreamName = 'motion' | 'orientation' | 'gps';

export interface Vector3D {
    x: number;
    y: number;
    z: number;
}

export interface RotationRate {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
}

export interface MotionPayload {
    accel?: Vector3D;
    accelGravity?: Vector3D;
    rotationRate?: RotationRate;
    intervalMs?: number;
}

export interface OrientationPayload {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
    absolute?: boolean;
}

export interface GpsPayload {
    lat: number;
    lon: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
    altitude: number | null;
    timestamp: number;
}

export interface UnifiedSampleV2 {
    schemaVersion: 2;
    timestamp: number;
    // Legacy fields for backward compatibility
    accelerometer: { x: number; y: number; z: number; timestamp: number };
    gyroscope: { alpha: number; beta: number; gamma: number; timestamp: number } | null;
    location: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null;
    earth: { x: number; y: number; z: number } | null;

    // New V2 fields
    sensors: {
        motion?: MotionPayload;
        orientation?: OrientationPayload;
        gps?: GpsPayload;
    };
}

export interface CapabilityStatus {
    supportedByApi: boolean;
    supportedInPractice: boolean;
}

export interface CapabilitiesReport {
    deviceMotion: CapabilityStatus;
    deviceOrientation: CapabilityStatus;
    gyroscopeRate: CapabilityStatus;
    linearAcceleration: CapabilityStatus;
    accelerometer: CapabilityStatus;
    gps: CapabilityStatus & { hasSpeed: boolean; hasAccuracy: boolean };
    flags: string[];
}

export interface StreamHealth {
    samplesCount: number;
    observedHz: number | null;
    dtMsMedian: number | null;
    dtMsP95: number | null;
    lastSampleAgeMs: number | null;
    missingRate?: number;
    // Expanded GPS stats
    accuracyMedianM?: number | null;
    accuracyP95M?: number | null;
    speedMedian?: number | null;
}

export interface CollectionHealth {
    motion?: StreamHealth;
    orientation?: StreamHealth;
    gps?: StreamHealth;
}
