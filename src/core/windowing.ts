import {
    CoreFrameV1,
    WindowingResultV1,
    WindowSummaryV1,
    SegmentSummaryV1,
    DisplaySegmentSummaryV1,
    WindowFlag,
    CoreStateV1,
    WindowEventV1
} from './types';
import { extractFeatures } from './features';
import { applyVehicleHysteresis } from './motion';
import { getMedian, getPercentile, getMAD } from './stats';
import { CORE_ANALYSIS_CONFIG } from './analysisConfig';

const DEFAULT_WINDOW_SIZE_MS = CORE_ANALYSIS_CONFIG.windowing.sizeMs;
const DEFAULT_WINDOW_STEP_MS = CORE_ANALYSIS_CONFIG.windowing.stepMs;
const MIN_IMU_SAMPLES = CORE_ANALYSIS_CONFIG.windowing.minImuSamples;
const MIN_GPS_SAMPLES = CORE_ANALYSIS_CONFIG.windowing.minGpsSamples;
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

const buildWindowEvent = (
    windowFrames: CoreFrameV1[],
    accelMags: number[],
    jerkRms: number,
    gpsStats: ReturnType<typeof computeGpsStats>,
    windowStart: number,
    windowEnd: number,
    boundsStart: number
): { event: WindowEventV1; trigger: 'peak' | 'energy' | 'jerk' } | null => {
    if (windowFrames.length === 0 || accelMags.length === 0) return null;

    const sorted = [...accelMags].sort((a, b) => a - b);
    const baseline = getMedian(sorted) ?? 0;
    const mad = getMAD(sorted);
    const threshold = baseline + Math.max(CORE_ANALYSIS_CONFIG.event.accelMinDelta, mad * CORE_ANALYSIS_CONFIG.event.accelMadMultiplier);

    let peakIndex = 0;
    for (let i = 1; i < accelMags.length; i++) {
        if (accelMags[i] > accelMags[peakIndex]) peakIndex = i;
    }
    const peakAcc = accelMags[peakIndex] ?? 0;

    const aboveIndices = accelMags.reduce<number[]>((acc, value, index) => {
        if (value > threshold) acc.push(index);
        return acc;
    }, []);
    const tStartMs = aboveIndices.length > 0 ? windowFrames[aboveIndices[0]].timestamp : windowStart;
    const tEndMs = aboveIndices.length > 0 ? windowFrames[aboveIndices[aboveIndices.length - 1]].timestamp : windowEnd;
    const tPeakMs = windowFrames[peakIndex]?.timestamp ?? windowStart;
    const durationMs = Math.max(0, tEndMs - tStartMs);
    const energyIndex = Math.max(0, (peakAcc - baseline)) * Math.log1p(durationMs);

    const peakTrigger = peakAcc >= CORE_ANALYSIS_CONFIG.event.peakAccMin;
    const energyTrigger = energyIndex >= CORE_ANALYSIS_CONFIG.event.energyIndexMin;
    const jerkTrigger = jerkRms >= CORE_ANALYSIS_CONFIG.event.jerkRmsMin;

    if (!peakTrigger && !energyTrigger && !jerkTrigger) return null;

    const trigger: 'peak' | 'energy' | 'jerk' = peakTrigger ? 'peak' : (energyTrigger ? 'energy' : 'jerk');
    const event: WindowEventV1 = {
        tStartSec: round((tStartMs - boundsStart) / 1000, 1),
        tPeakSec: round((tPeakMs - boundsStart) / 1000, 1),
        tEndSec: round((tEndMs - boundsStart) / 1000, 1),
        peakAcc: Number(peakAcc.toFixed(2)),
        energyIndex: Number(energyIndex.toFixed(2)),
        gpsContext: gpsStats.samplesCount > 0 ? {
            accuracy: gpsStats.accuracyMedianM ?? gpsStats.accuracyP95M ?? null,
            speed: gpsStats.speedMedian ?? null
        } : undefined
    };

    return { event, trigger };
};

// Vehicle-centric window classifier with explicit EVENT override and walking veto as a soft UNKNOWN.
const classifyWindowState = (
    window: WindowSummaryV1,
    eventCandidate: { event: WindowEventV1; trigger: 'peak' | 'energy' | 'jerk' } | null
): WindowSummaryV1['classification'] => {
    const { imu, gps } = window;
    const walkingVeto = (Number.isFinite(imu.jerkRms) && imu.jerkRms >= CORE_ANALYSIS_CONFIG.imu.walkingVetoJerkRms)
        || (Number.isFinite(imu.gyroRms ?? Number.NaN) && (imu.gyroRms as number) >= CORE_ANALYSIS_CONFIG.imu.walkingVetoGyroRms);

    const gpsUsable = gps.samplesCount >= MIN_GPS_SAMPLES
        && gps.observedHz >= CORE_ANALYSIS_CONFIG.gps.minHz
        && (gps.accuracyP95M === null || gps.accuracyP95M <= CORE_ANALYSIS_CONFIG.gps.maxAccuracyP95M);

    const dataQuality = imu.samplesCount < MIN_IMU_SAMPLES ? 0.6 : 1;

    if (eventCandidate) {
        return {
            state: 'EVENT',
            confidence: Number((0.95 * dataQuality).toFixed(3)),
            reason: `event_${eventCandidate.trigger}`,
            signals: {
                accelRms: imu.accelRms,
                jerkRms: imu.jerkRms,
                gyroRms: imu.gyroRms,
                gpsSpeedMedian: gps.speedMedian,
                gpsHz: gps.observedHz,
                gpsAccuracyP95M: gps.accuracyP95M
            },
            debug: { walkingVeto, gpsUsable }
        };
    }

    if (gpsUsable && gps.speedMedian !== null) {
        if (gps.speedMedian >= CORE_ANALYSIS_CONFIG.gps.movingSpeedMps) {
            return {
                state: 'MOVING',
                confidence: Number((0.9 * dataQuality).toFixed(3)),
                reason: 'gps_speed_moving',
                signals: {
                    accelRms: imu.accelRms,
                    jerkRms: imu.jerkRms,
                    gyroRms: imu.gyroRms,
                    gpsSpeedMedian: gps.speedMedian,
                    gpsHz: gps.observedHz,
                    gpsAccuracyP95M: gps.accuracyP95M
                },
                debug: { walkingVeto, gpsUsable }
            };
        }
        if (gps.speedMedian >= CORE_ANALYSIS_CONFIG.gps.slowSpeedMps) {
            return {
                state: 'SLOW_MOVING',
                confidence: Number((0.8 * dataQuality).toFixed(3)),
                reason: 'gps_speed_slow',
                signals: {
                    accelRms: imu.accelRms,
                    jerkRms: imu.jerkRms,
                    gyroRms: imu.gyroRms,
                    gpsSpeedMedian: gps.speedMedian,
                    gpsHz: gps.observedHz,
                    gpsAccuracyP95M: gps.accuracyP95M
                },
                debug: { walkingVeto, gpsUsable }
            };
        }
        if (gps.speedMedian <= CORE_ANALYSIS_CONFIG.gps.staticSpeedMps) {
            return {
                state: 'STATIC',
                confidence: Number((0.85 * dataQuality).toFixed(3)),
                reason: 'gps_speed_static',
                signals: {
                    accelRms: imu.accelRms,
                    jerkRms: imu.jerkRms,
                    gyroRms: imu.gyroRms,
                    gpsSpeedMedian: gps.speedMedian,
                    gpsHz: gps.observedHz,
                    gpsAccuracyP95M: gps.accuracyP95M
                },
                debug: { walkingVeto, gpsUsable }
            };
        }
    }

    const staticCandidate = imu.accelRms <= CORE_ANALYSIS_CONFIG.imu.staticAccelRmsMax
        && imu.jerkRms <= CORE_ANALYSIS_CONFIG.imu.staticJerkRmsMax
        && (imu.gyroRms === undefined || imu.gyroRms <= CORE_ANALYSIS_CONFIG.imu.staticGyroRmsMax);

    if (staticCandidate) {
        return {
            state: 'STATIC',
            confidence: Number((0.65 * dataQuality).toFixed(3)),
            reason: 'imu_static',
            signals: {
                accelRms: imu.accelRms,
                jerkRms: imu.jerkRms,
                gyroRms: imu.gyroRms,
                gpsSpeedMedian: gps.speedMedian,
                gpsHz: gps.observedHz,
                gpsAccuracyP95M: gps.accuracyP95M
            },
            debug: { walkingVeto, gpsUsable }
        };
    }

    const movingCandidate = imu.accelRms >= CORE_ANALYSIS_CONFIG.imu.movingAccelRmsMin
        || imu.jerkRms >= CORE_ANALYSIS_CONFIG.imu.movingJerkRmsMin;

    if (movingCandidate && !walkingVeto) {
        return {
            state: 'MOVING',
            confidence: Number((0.6 * dataQuality).toFixed(3)),
            reason: 'imu_motion',
            signals: {
                accelRms: imu.accelRms,
                jerkRms: imu.jerkRms,
                gyroRms: imu.gyroRms,
                gpsSpeedMedian: gps.speedMedian,
                gpsHz: gps.observedHz,
                gpsAccuracyP95M: gps.accuracyP95M
            },
            debug: { walkingVeto, gpsUsable }
        };
    }

    return {
        state: 'UNKNOWN',
        confidence: Number((0.35 * dataQuality).toFixed(3)),
        reason: walkingVeto ? 'imu_walking_veto' : 'signals_ambiguous',
        signals: {
            accelRms: imu.accelRms,
            jerkRms: imu.jerkRms,
            gyroRms: imu.gyroRms,
            gpsSpeedMedian: gps.speedMedian,
            gpsHz: gps.observedHz,
            gpsAccuracyP95M: gps.accuracyP95M
        },
        debug: { walkingVeto, gpsUsable }
    };
};

// Process layer: hysteresis across windows plus strict EVENT isolation (short-lived).
const applyStateSmoothing = (
    windows: WindowSummaryV1[]
): Array<{ state: CoreStateV1; reason: string; confidence: number }> => {
    if (windows.length === 0) return [];

    let currentState: CoreStateV1 = windows[0].classification.state;
    let pendingState: CoreStateV1 = currentState;
    let pendingCount = 0;
    let eventRunSec = 0;

    return windows.map(window => {
        const candidate = window.classification.state;
        const windowDurationSec = window.tEndSec - window.tStartSec;

        if (candidate === 'EVENT') {
            eventRunSec += windowDurationSec;
            if (eventRunSec <= CORE_ANALYSIS_CONFIG.smoothing.eventMaxSec) {
                return {
                    state: 'EVENT',
                    reason: window.classification.reason,
                    confidence: window.classification.confidence
                };
            }
            return {
                state: 'UNKNOWN',
                reason: 'event_over_max',
                confidence: 0
            };
        }

        eventRunSec = 0;

        if (candidate === currentState) {
            pendingState = currentState;
            pendingCount = 0;
            return {
                state: currentState,
                reason: 'hysteresis_hold',
                confidence: window.classification.confidence
            };
        }

        if (candidate !== pendingState) {
            pendingState = candidate;
            pendingCount = 1;
        } else {
            pendingCount += 1;
        }

        if (pendingCount >= CORE_ANALYSIS_CONFIG.smoothing.hysteresisWindows) {
            currentState = candidate;
            pendingState = currentState;
            pendingCount = 0;
            return {
                state: currentState,
                reason: 'hysteresis_switch',
                confidence: window.classification.confidence
            };
        }

        return {
            state: currentState,
            reason: 'hysteresis_hold',
            confidence: Number((window.classification.confidence * 0.6).toFixed(3))
        };
    });
};

// Merge windows into segments, then enforce minimum durations on stable states.
const buildSegments = (
    windows: WindowSummaryV1[],
    smoothed: Array<{ state: CoreStateV1; reason: string; confidence: number }>
): SegmentSummaryV1[] => {
    if (windows.length === 0) return [];

    const segments: SegmentSummaryV1[] = [];
    let currentState = smoothed[0];
    let currentStart = windows[0].tStartSec;
    let currentEnd = windows[0].tEndSec;
    let confidenceSum = currentState.confidence;
    let confidenceCount = 1;
    const reasons: Record<string, number> = {};
    if (currentState.reason) reasons[currentState.reason] = 1;

    for (let i = 1; i < windows.length; i++) {
        const smoothedState = smoothed[i];
        const window = windows[i];

        if (smoothedState.state === currentState.state) {
            currentEnd = window.tEndSec;
            confidenceSum += smoothedState.confidence;
            confidenceCount += 1;
            if (smoothedState.reason) {
                reasons[smoothedState.reason] = (reasons[smoothedState.reason] || 0) + 1;
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

        currentState = smoothedState;
        currentStart = window.tStartSec;
        currentEnd = window.tEndSec;
        confidenceSum = smoothedState.confidence;
        confidenceCount = 1;
        Object.keys(reasons).forEach(key => delete reasons[key]);
        if (smoothedState.reason) reasons[smoothedState.reason] = 1;
    }

    const finalReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0] || '';
    segments.push({
        tStartSec: currentStart,
        tEndSec: currentEnd,
        state: currentState.state,
        confidence: round(confidenceSum / Math.max(1, confidenceCount), 3),
        reason: finalReason
    });

    const minMovingSec = CORE_ANALYSIS_CONFIG.smoothing.minSegmentSec.moving;
    const minStaticSec = CORE_ANALYSIS_CONFIG.smoothing.minSegmentSec.static;

    const adjusted = segments.map(segment => {
        const duration = segment.tEndSec - segment.tStartSec;
        if (segment.state === 'MOVING' && duration < minMovingSec) {
            return { ...segment, state: 'UNKNOWN', confidence: Math.min(segment.confidence, 0.3), reason: 'min_duration' };
        }
        if (segment.state === 'STATIC' && duration < minStaticSec) {
            return { ...segment, state: 'UNKNOWN', confidence: Math.min(segment.confidence, 0.3), reason: 'min_duration' };
        }
        return segment;
    });

    const merged: SegmentSummaryV1[] = [];
    for (const segment of adjusted) {
        const last = merged[merged.length - 1];
        if (last && last.state === segment.state) {
            last.tEndSec = segment.tEndSec;
            last.confidence = round((last.confidence + segment.confidence) / 2, 3);
            if (last.reason !== segment.reason) {
                last.reason = last.reason || segment.reason;
            }
        } else {
            merged.push({ ...segment });
        }
    }

    return merged;
};

export const buildDisplaySegments = (
    coreSegments: SegmentSummaryV1[],
    maxUnknownSec: number = CORE_ANALYSIS_CONFIG.smoothing.unknownBridgeSec
): DisplaySegmentSummaryV1[] => {
    if (coreSegments.length === 0) return [];

    const displaySegments: DisplaySegmentSummaryV1[] = [];

    for (let i = 0; i < coreSegments.length; i++) {
        const segment = coreSegments[i];

        if (segment.state === 'UNKNOWN') {
            const prev = coreSegments[i - 1];
            const next = coreSegments[i + 1];
            const durationSec = segment.tEndSec - segment.tStartSec;

            if (
                prev &&
                next &&
                prev.state === next.state &&
                prev.state !== 'UNKNOWN' &&
                durationSec <= maxUnknownSec
            ) {
                const last = displaySegments[displaySegments.length - 1];
                if (last && last.state === prev.state && last.tEndSec === prev.tEndSec) {
                    last.tEndSec = next.tEndSec;
                    last.wasBridged = true;
                    last.bridgedDurationSec = (last.bridgedDurationSec ?? 0) + durationSec;
                } else {
                    displaySegments.push({
                        ...prev,
                        tEndSec: next.tEndSec,
                        wasBridged: true,
                        bridgedDurationSec: durationSec
                    });
                }
                i += 1;
                continue;
            }
        }

        displaySegments.push({
            ...segment,
            wasBridged: false
        });
    }

    return displaySegments;
};

export const buildCoreWindowing = (
    frames: CoreFrameV1[],
    windowSizeMs: number = DEFAULT_WINDOW_SIZE_MS,
    stepMs: number = DEFAULT_WINDOW_STEP_MS
): WindowingResultV1 => {
    const bounds = getWindowTimeBounds(frames);
    if (!bounds) {
        return { windowSizeMs, stepMs, windows: [], segments: [], displaySegments: [], events: [] };
    }

    const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp);
    const gpsFixes = buildUniqueGpsFixes(frames);
    const windows: WindowSummaryV1[] = [];
    const events: WindowEventV1[] = [];

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
        const gpsStats = computeGpsStats(windowGpsFixes, durationMs);
        const eventCandidate = buildWindowEvent(
            windowFrames,
            featureResult.accelMags,
            metrics.jerkRms,
            gpsStats,
            windowStart,
            windowEnd,
            bounds.start
        );
        const flags: WindowFlag[] = [];
        if (windowFrames.length < MIN_IMU_SAMPLES) {
            flags.push('INSUFFICIENT_DATA');
        }
        if (gpsStats.samplesCount >= MIN_GPS_SAMPLES && gpsStats.observedHz < CORE_ANALYSIS_CONFIG.gps.minHz) {
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

        const windowSummary: WindowSummaryV1 = {
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
            classification: {
                state: 'UNKNOWN',
                confidence: 0,
                reason: '',
                signals: {
                    accelRms: metrics.accelRms,
                    jerkRms: metrics.jerkRms,
                    gyroRms: metrics.gyroRms,
                    gpsSpeedMedian: gpsStats.speedMedian,
                    gpsHz: gpsStats.observedHz,
                    gpsAccuracyP95M: gpsStats.accuracyP95M
                }
            },
            inVehicle: {
                value: false,
                confidence: 0,
                reason: 'unassigned',
                signals: {
                    accelRms: metrics.accelRms,
                    jerkRms: metrics.jerkRms,
                    gyroRms: metrics.gyroRms ?? 0
                }
            },
            event: eventCandidate?.event ?? null,
            flags: [...new Set(flags)]
        };

        windowSummary.classification = classifyWindowState(windowSummary, eventCandidate);
        if (eventCandidate?.event) {
            events.push(eventCandidate.event);
        }

        windows.push(windowSummary);
    }

    const inVehicleDetections = applyVehicleHysteresis(
        windows.map(window => ({ imu: window.imu, gps: window.gps }))
    );

    windows.forEach((window, index) => {
        window.inVehicle = inVehicleDetections[index];
    });

    const smoothed = applyStateSmoothing(windows);
    const segments = buildSegments(windows, smoothed);
    const displaySegments = buildDisplaySegments(segments);
    return { windowSizeMs, stepMs, windows, segments, displaySegments, events };
};
