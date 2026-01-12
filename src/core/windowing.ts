import {
    CoreFrameV1,
    WindowingResultV1,
    WindowSummaryV1,
    SegmentSummaryV1,
    WindowFlag
} from './types';
import { extractFeatures } from './features';
import { applyVehicleHysteresis, classifyMotion } from './motion';
import { getMedian, getPercentile } from './stats';

const DEFAULT_WINDOW_SIZE_MS = 10000;
const DEFAULT_WINDOW_STEP_MS = 10000;
const MIN_IMU_SAMPLES = 200;
const MIN_GPS_SAMPLES = 2;
const EPS = 1e-3;

const round = (value: number, digits: number): number => {
    return Number(value.toFixed(digits));
};

const getWindowTimeBounds = (frames: CoreFrameV1[]): { start: number; end: number } | null => {
    if (frames.length === 0) return null;
    const sorted = [...frames].sort((a, b) => a.timestamp - b.timestamp);
    const frameStart = sorted[0].timestamp;
    const frameEnd = sorted[sorted.length - 1].timestamp;
    return { start: frameStart, end: frameEnd };
};

const buildUniqueGpsFixes = (frames: CoreFrameV1[]) => {
    const gpsFixes = frames
        .filter(f => f.gps && Number.isFinite(f.gps.timestamp))
        .map(f => f.gps as NonNullable<CoreFrameV1['gps']>)
        .sort((a, b) => a.timestamp - b.timestamp);

    const unique: typeof gpsFixes = [];
    for (const fix of gpsFixes) {
        const last = unique[unique.length - 1];
        if (!last || last.timestamp !== fix.timestamp) {
            unique.push(fix);
        }
    }

    return unique;
};

const computeGpsStats = (fixes: Array<NonNullable<CoreFrameV1['gps']>>, durationMs: number) => {
    const samplesCount = fixes.length;
    if (samplesCount === 0) {
        return {
            samplesCount,
            observedHz: 0,
            accuracyMedianM: null,
            accuracyP95M: null,
            speedMedian: null
        };
    }

    const intervals: number[] = [];
    for (let i = 1; i < fixes.length; i++) {
        const dt = fixes[i].timestamp - fixes[i - 1].timestamp;
        if (dt >= 200 && dt <= 60000) {
            intervals.push(dt);
        }
    }

    let observedHz = 0;
    if (intervals.length > 0) {
        const sortedIntervals = [...intervals].sort((a, b) => a - b);
        const dtMedian = getMedian(sortedIntervals);
        observedHz = dtMedian && dtMedian > 0 ? 1000 / dtMedian : 0;
    } else if (samplesCount > 1 && durationMs > 0) {
        observedHz = (samplesCount - 1) / (durationMs / 1000);
    }

    const accuracies = fixes
        .map(fix => fix.accuracy)
        .filter((v): v is number => Number.isFinite(v))
        .sort((a, b) => a - b);
    const accuracyMedianM = getMedian(accuracies);
    const accuracyP95M = getPercentile(accuracies, 0.95);

    const speeds = fixes
        .map(fix => fix.speed)
        .filter((v): v is number => Number.isFinite(v))
        .sort((a, b) => a - b);
    const speedMedian = getMedian(speeds);

    return {
        samplesCount,
        observedHz: round(observedHz, 2),
        accuracyMedianM: accuracyMedianM !== null ? round(accuracyMedianM, 2) : null,
        accuracyP95M: accuracyP95M !== null ? round(accuracyP95M, 2) : null,
        speedMedian: speedMedian !== null ? round(speedMedian, 2) : null
    };
};

const toEffectiveState = (window: WindowSummaryV1) => {
    if (window.inVehicle.value && window.inVehicle.confidence >= 0.7) {
        return { state: 'IN_VEHICLE' as const, confidence: window.inVehicle.confidence, reason: window.inVehicle.reason };
    }
    if ((window.motionClassification.state === 'STATIC' || window.motionClassification.state === 'WALKING')
        && window.motionClassification.confidence >= 0.7) {
        const state = window.motionClassification.state;
        return { state, confidence: window.motionClassification.confidence, reason: `motion_${state.toLowerCase()}` };
    }
    return { state: 'UNKNOWN' as const, confidence: 0, reason: '' };
};

const buildSegments = (windows: WindowSummaryV1[]): SegmentSummaryV1[] => {
    if (windows.length === 0) return [];

    const segments: SegmentSummaryV1[] = [];
    let currentState = toEffectiveState(windows[0]);
    let currentStart = windows[0].tStartSec;
    let currentEnd = windows[0].tEndSec;
    let confidenceSum = currentState.confidence;
    let confidenceCount = 1;
    const reasons: Record<string, number> = {};
    if (currentState.reason) reasons[currentState.reason] = 1;

    for (let i = 1; i < windows.length; i++) {
        const window = windows[i];
        const effective = toEffectiveState(window);

        if (effective.state === currentState.state) {
            currentEnd = window.tEndSec;
            confidenceSum += effective.confidence;
            confidenceCount += 1;
            if (effective.reason) {
                reasons[effective.reason] = (reasons[effective.reason] || 0) + 1;
            }
            continue;
        }

        const reason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0] || '';
        segments.push({
            tStartSec: currentStart,
            tEndSec: currentEnd,
            state: currentState.state,
            confidence: round(confidenceSum / Math.max(1, confidenceCount), 3),
            reason
        });

        currentState = effective;
        currentStart = window.tStartSec;
        currentEnd = window.tEndSec;
        confidenceSum = effective.confidence;
        confidenceCount = 1;
        Object.keys(reasons).forEach(key => delete reasons[key]);
        if (effective.reason) reasons[effective.reason] = 1;
    }

    const finalReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0] || '';
    segments.push({
        tStartSec: currentStart,
        tEndSec: currentEnd,
        state: currentState.state,
        confidence: round(confidenceSum / Math.max(1, confidenceCount), 3),
        reason: finalReason
    });

    return segments;
};

export const buildCoreWindowing = (
    frames: CoreFrameV1[],
    windowSizeMs: number = DEFAULT_WINDOW_SIZE_MS,
    stepMs: number = DEFAULT_WINDOW_STEP_MS
): WindowingResultV1 => {
    const bounds = getWindowTimeBounds(frames);
    if (!bounds) {
        return { windowSizeMs, stepMs, windows: [], segments: [] };
    }

    const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp);
    const gpsFixes = buildUniqueGpsFixes(frames);
    const windows: Array<Omit<WindowSummaryV1, 'inVehicle'>> = [];

    for (let windowStart = bounds.start; windowStart < bounds.end; windowStart += stepMs) {
        const windowEnd = Math.min(windowStart + windowSizeMs, bounds.end);
        if (windowEnd <= windowStart) break;

        const windowFrames = sortedFrames.filter(frame => frame.timestamp >= windowStart && frame.timestamp < windowEnd);
        const windowGpsFixes = gpsFixes.filter(fix => fix.timestamp >= windowStart && fix.timestamp < windowEnd);
        if (windowFrames.length === 0 && windowGpsFixes.length === 0) {
            continue;
        }

        const durationMs = windowEnd - windowStart;
        const featureResult = extractFeatures(windowFrames);
        const metrics = featureResult.metrics;
        const motionClassification = classifyMotion(metrics, windowFrames.length);
        const gpsStats = computeGpsStats(windowGpsFixes, durationMs);
        const flags: WindowFlag[] = [];
        if (windowFrames.length < MIN_IMU_SAMPLES) {
            flags.push('INSUFFICIENT_DATA');
        }
        if (gpsStats.samplesCount >= MIN_GPS_SAMPLES && gpsStats.observedHz < 0.2) {
            flags.push('GPS_LOW_RATE');
        }

        const statsInconsistent: Array<'accel' | 'jerk' | 'gyro'> = [];
        if (metrics.accelP95 + EPS < metrics.accelRms) statsInconsistent.push('accel');
        if (metrics.jerkP95 + EPS < metrics.jerkRms) statsInconsistent.push('jerk');
        if (Number.isFinite(metrics.gyroRms ?? Number.NaN) && Number.isFinite(metrics.gyroP95 ?? Number.NaN)) {
            if ((metrics.gyroP95 ?? 0) + EPS < (metrics.gyroRms ?? 0)) statsInconsistent.push('gyro');
        }
        if (statsInconsistent.length > 0) {
            flags.push('STATS_INCONSISTENT');
        }

        const tStartSec = round((windowStart - bounds.start) / 1000, 1);
        const tEndSec = round((windowEnd - bounds.start) / 1000, 1);

        windows.push({
            tStartSec,
            tEndSec,
            durationMs,
            imu: {
                samplesCount: windowFrames.length,
                accelRms: metrics.accelRms,
                accelP95: metrics.accelP95,
                jerkRms: metrics.jerkRms,
                jerkP95: metrics.jerkP95,
                gyroRms: metrics.gyroRms,
                gyroP95: metrics.gyroP95
            },
            gps: {
                samplesCount: gpsStats.samplesCount,
                observedHz: gpsStats.observedHz,
                accuracyMedianM: gpsStats.accuracyMedianM,
                accuracyP95M: gpsStats.accuracyP95M,
                speedMedian: gpsStats.speedMedian
            },
            motionClassification: {
                state: motionClassification.state,
                confidence: motionClassification.confidence,
                signals: motionClassification.signals
            },
            flags: [...new Set(flags)]
        });
    }

    const inVehicleDetections = applyVehicleHysteresis(
        windows.map(window => ({ imu: window.imu, gps: window.gps }))
    );
    const windowsWithInVehicle: WindowSummaryV1[] = windows.map((window, index) => ({
        ...window,
        inVehicle: inVehicleDetections[index]
    }));

    const segments = buildSegments(windowsWithInVehicle);
    return { windowSizeMs, stepMs, windows: windowsWithInVehicle, segments };
};
