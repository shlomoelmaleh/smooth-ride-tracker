
import {
    CoreEngine,
    CoreFrameV1,
    AnalyzeResultV1,
    AnalyzeOptions,
    CapabilitiesReport,
    CoreFlag
} from './types';
import { computeStreamStats, getMedian, getPercentile } from './stats';
import { extractFeatures } from './features';
import { detectImpacts } from './events';

class SmartRideCoreEngineV1 implements CoreEngine {
    private frames: CoreFrameV1[] = [];
    private caps: CapabilitiesReport | null = null;
    private options: AnalyzeOptions;

    constructor(options: AnalyzeOptions = {}) {
        this.options = {
            expectedImuHz: 50,
            gpsMaxAgeMs: 5000,
            eventWindowMs: 1500,
            ...options
        };
    }

    ingest(frame: CoreFrameV1): void {
        this.frames.push(frame);
    }

    setCapabilities(report: CapabilitiesReport): void {
        this.caps = report;
    }

    finalize(): AnalyzeResultV1 {
        const flags: CoreFlag[] = [];
        const framesCount = this.frames.length;

        // 1. Feature Extraction & IMU Metrics
        const featureResult = extractFeatures(this.frames);
        featureResult.flags.forEach(f => flags.push(f as CoreFlag));

        // 2. Stream Stats (IMU)
        const imuTimestamps = this.frames.map(f => f.timestamp);
        const imuStats = computeStreamStats(imuTimestamps);

        // 3. GPS Stats
        const gpsFrames = this.frames.filter(f => f.gps);
        const gpsTimestamps = gpsFrames.map(f => f.timestamp);
        const gpsStats = computeStreamStats(gpsTimestamps);

        const gpsAccuracies = gpsFrames.map(f => f.gps!.accuracy).sort((a, b) => a - b);
        const accuracyMedianM = getMedian(gpsAccuracies);
        const accuracyP95M = getPercentile(gpsAccuracies, 0.95);
        const hasSpeedObserved = gpsFrames.some(f => f.gps!.speed !== null);

        // 4. Flag Generation
        const durationMs = framesCount > 1
            ? this.frames[framesCount - 1].timestamp - this.frames[0].timestamp
            : 0;

        if (imuStats.observedHz < (this.options.expectedImuHz! * 0.75)) {
            flags.push('IMU_LOW_RATE');
        }
        if (imuStats.dtMedian && imuStats.dtP95 && (imuStats.dtP95 - imuStats.dtMedian > 5)) {
            flags.push('IMU_JITTER_HIGH');
        }
        if (!this.caps?.gps.supportedInPractice || gpsStats.samplesCount === 0) {
            flags.push('GPS_DENIED_OR_UNAVAILBLE');
        } else if (gpsStats.observedHz < 0.5) {
            flags.push('GPS_LOW_RATE');
        }

        if (framesCount < 120) {
            flags.push('INSUFFICIENT_DATA');
        }

        // 5. Impact Detection
        const impactEvents = detectImpacts(this.frames, featureResult.accelMags, this.options);

        return {
            durationMs,
            imu: {
                ...imuStats,
                ...featureResult.metrics
            },
            gps: {
                ...gpsStats,
                accuracyMedianM,
                accuracyP95M,
                hasSpeedObserved
            },
            flags: [...new Set(flags)],
            impactEvents
        };
    }

    reset(): void {
        this.frames = [];
        this.caps = null;
    }
}

export const createEngine = (options?: AnalyzeOptions): CoreEngine => {
    return new SmartRideCoreEngineV1(options);
};
