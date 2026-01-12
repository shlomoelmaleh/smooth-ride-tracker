
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

        // 4. Time Metric
        const durationMs = framesCount > 1
            ? this.frames[framesCount - 1].timestamp - this.frames[0].timestamp
            : 0;

        // 3. GPS Stats
        // Build a list of GPS fixes based only on GPS timestamps (avoid forward-fill).
        const gpsFixes = this.frames
            .filter(f => f.gps && typeof f.gps.timestamp === 'number' && !Number.isNaN(f.gps.timestamp))
            .map(f => f.gps as NonNullable<CoreFrameV1['gps']>)
            .sort((a, b) => a.timestamp - b.timestamp);

        const uniqueGpsFixes: typeof gpsFixes = [];
        for (const fix of gpsFixes) {
            const lastFix = uniqueGpsFixes[uniqueGpsFixes.length - 1];
            if (!lastFix || lastFix.timestamp !== fix.timestamp) {
                uniqueGpsFixes.push(fix);
            }
        }

        const gpsSamplesCount = uniqueGpsFixes.length;
        const gpsIntervals: number[] = [];
        for (let i = 1; i < uniqueGpsFixes.length; i++) {
            const dt = uniqueGpsFixes[i].timestamp - uniqueGpsFixes[i - 1].timestamp;
            // Guard: discard negative, zero, or suspicious outliers (below 200ms or above 60s)
            if (dt >= 200 && dt <= 60000) {
                gpsIntervals.push(dt);
            }
        }

        let gpsDtMedian: number | null = null;
        let gpsDtP95: number | null = null;
        let gpsObservedHz = 0;

        if (gpsIntervals.length > 0) {
            const sortedIntervals = [...gpsIntervals].sort((a, b) => a - b);
            gpsDtMedian = getMedian(sortedIntervals);
            gpsDtP95 = getPercentile(sortedIntervals, 0.95);
            gpsObservedHz = gpsDtMedian && gpsDtMedian > 0 ? 1000 / gpsDtMedian : 0;
        } else if (durationMs > 0 && gpsSamplesCount > 1) {
            // Fallback Hz calculation if jitter stats are insufficient
            gpsObservedHz = (gpsSamplesCount - 1) / (durationMs / 1000);
        }

        const gpsAccuracies = uniqueGpsFixes
            .map(f => f.accuracy)
            .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
            .sort((a, b) => a - b);
        const accuracyMedianM = getMedian(gpsAccuracies);
        const accuracyP95M = getPercentile(gpsAccuracies, 0.95);
        const hasSpeedObserved = uniqueGpsFixes.some(f => typeof f.speed === 'number' && !Number.isNaN(f.speed));

        const gpsStats = {
            samplesCount: gpsSamplesCount,
            observedHz: Number(gpsObservedHz.toFixed(2)),
            dtMedian: gpsDtMedian ? Number(gpsDtMedian.toFixed(2)) : null,
            dtP95: gpsDtP95 ? Number(gpsDtP95.toFixed(2)) : null
        };

        // 4. Flag Generation

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
