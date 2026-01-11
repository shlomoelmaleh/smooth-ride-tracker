
export type MsEpoch = number;

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface GpsFix {
    lat: number;
    lon: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
    timestamp: MsEpoch;
}

export interface CoreFrameV1 {
    schema: 1;
    timestamp: MsEpoch;
    accG: Vector3;
    linAcc?: Vector3;
    gyroRate?: { alpha: number | null, beta: number | null, gamma: number | null };
    gps?: GpsFix;
}

export interface CapabilitiesReport {
    deviceMotion: { supportedByApi: boolean, supportedInPractice: boolean };
    gps: { supportedByApi: boolean, supportedInPractice: boolean };
}

export interface AnalyzeOptions {
    expectedImuHz?: number;
    gpsMaxAgeMs?: number;
    eventWindowMs?: number;
    impactThreshold?: number;
}

export type CoreFlag =
    | 'IMU_LOW_RATE'
    | 'IMU_JITTER_HIGH'
    | 'LINACC_MISSING_FALLBACK_TO_ACCG'
    | 'GPS_DENIED_OR_UNAVAILBLE'
    | 'GPS_LOW_RATE'
    | 'GPS_STALE_MOST_OF_TIME'
    | 'INSUFFICIENT_DATA'
    | 'STABLE_OR_STATIC_OBSERVED';

export interface StreamStats {
    samplesCount: number;
    observedHz: number;
    dtMedian: number | null;
    dtP95: number | null;
}

export interface CoreMetricsV1 {
    accelRms: number;
    accelP95: number;
    jerkRms: number;
    jerkP95: number;
    gyroRms?: number;
    gyroP95?: number;
}

export interface ImpactEventV1 {
    tStart: MsEpoch;
    tPeak: MsEpoch;
    tEnd: MsEpoch;
    peakAcc: number;
    energyIndex: number;
    gpsContext?: {
        accuracy: number;
        speed: number | null;
    };
}

export interface AnalyzeResultV1 {
    durationMs: number;
    imu: StreamStats & CoreMetricsV1;
    gps: StreamStats & {
        accuracyMedianM: number | null;
        accuracyP95M: number | null;
        hasSpeedObserved: boolean;
    };
    flags: CoreFlag[];
    impactEvents: ImpactEventV1[];
}

export interface CoreEngine {
    ingest(frame: CoreFrameV1): void;
    setCapabilities(report: CapabilitiesReport): void;
    finalize(): AnalyzeResultV1;
    reset(): void;
}
