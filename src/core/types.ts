
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
    | 'CORE_METRICS_INCOMPLETE'
    | 'LINACC_MISSING_FALLBACK_TO_ACCG'
    | 'GPS_DENIED_OR_UNAVAILBLE'
    | 'GPS_LOW_RATE'
    | 'GPS_STALE_MOST_OF_TIME'
    | 'INSUFFICIENT_DATA'
    | 'STABLE_OR_STATIC_OBSERVED'
    | 'STATS_INCONSISTENT';

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

export type MotionState = 'STATIC' | 'MOVING' | 'UNKNOWN';

export type CoreStateV1 = 'STATIC' | 'MOVING' | 'SLOW_MOVING' | 'EVENT' | 'UNKNOWN';

export interface MotionClassificationV1 {
    state: MotionState;
    confidence: number;
    signals: {
        accelRms: number;
        jerkRms: number;
        gyroRms: number;
    };
    debug?: {
        rule: MotionState;
        scores: {
            static: number;
            walking: number;
            moving: number;
        };
        thresholds: {
            static: {
                accelRms: { goodMax: number; badMax: number };
                jerkRms: { goodMax: number; badMax: number };
                gyroRms: { goodMax: number; badMax: number };
            };
            walking: {
                accelRms: { badMin: number; goodMin: number };
                jerkRms: { badMin: number; goodMin: number };
                gyroRms: { badMin: number; goodMin: number };
            };
            moving: {
                accelRms: { lowBad: number; lowGood: number; highGood: number; highBad: number };
                jerkRms: { lowBad: number; lowGood: number; highGood: number; highBad: number };
                gyroRms: { lowBad: number; lowGood: number; highGood: number; highBad: number };
            };
        };
    };
}

export interface InVehicleDetectionV1 {
    value: boolean;
    confidence: number;
    reason: string;
    signals: {
        accelRms: number;
        jerkRms: number;
        gyroRms: number;
        gpsSpeedMedian?: number | null;
        gpsHz?: number;
        gpsAccuracyP95M?: number | null;
        imuJerkRms?: number;
        imuGyroRms?: number;
    };
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

export interface WindowEventV1 {
    tStartSec: number;
    tPeakSec: number;
    tEndSec: number;
    peakAcc: number;
    energyIndex: number;
    gpsContext?: {
        accuracy: number | null;
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
    motionClassification: MotionClassificationV1;
    inVehicle: InVehicleDetectionV1;
    flags: CoreFlag[];
    statsDebug?: {
        inconsistentMetrics: Array<'accel' | 'jerk' | 'gyro'>;
    };
    impactEvents: ImpactEventV1[];
}

export type WindowFlag = 'GPS_LOW_RATE' | 'STATS_INCONSISTENT' | 'INSUFFICIENT_DATA';

export interface WindowSummaryV1 {
    tStartSec: number;
    tEndSec: number;
    durationMs: number;
    imu: {
        samplesCount: number;
        accelRms: number;
        accelP95: number;
        jerkRms: number;
        jerkP95: number;
        gyroRms?: number;
        gyroP95?: number;
    };
    gps: {
        samplesCount: number;
        observedHz: number;
        accuracyMedianM: number | null;
        accuracyP95M: number | null;
        speedMedian: number | null;
    };
    classification: {
        state: CoreStateV1;
        confidence: number;
        reason: string;
        signals: {
            accelRms: number;
            jerkRms: number;
            gyroRms?: number;
            gpsSpeedMedian?: number | null;
            gpsHz?: number;
            gpsAccuracyP95M?: number | null;
        };
        debug?: {
            walkingVeto: boolean;
            gpsUsable: boolean;
        };
    };
    inVehicle: InVehicleDetectionV1;
    event?: WindowEventV1 | null;
    flags: WindowFlag[];
}

export interface SegmentSummaryV1 {
    tStartSec: number;
    tEndSec: number;
    state: CoreStateV1;
    confidence: number;
    reason: string;
}

export interface DisplaySegmentSummaryV1 extends SegmentSummaryV1 {
    wasBridged: boolean;
    bridgedDurationSec?: number;
}

export interface CoreAnalysisWindowsV1 {
    windowSizeMs: number;
    stepMs: number;
    windowsCount: number;
    windows: WindowSummaryV1[];
}

export interface WindowingResultV1 {
    windowSizeMs: number;
    stepMs: number;
    windows: WindowSummaryV1[];
    segments: SegmentSummaryV1[];
    displaySegments: DisplaySegmentSummaryV1[];
    events: WindowEventV1[];
}

export interface CoreEngine {
    ingest(frame: CoreFrameV1): void;
    setCapabilities(report: CapabilitiesReport): void;
    finalize(): AnalyzeResultV1;
    reset(): void;
}
