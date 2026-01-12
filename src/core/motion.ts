import { CoreMetricsV1, MotionClassificationV1, MotionState } from './types';

const clamp01 = (value: number): number => {
    return Math.min(1, Math.max(0, value));
};

const scoreLow = (value: number, goodMax: number, badMax: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (value <= goodMax) return 1;
    if (value >= badMax) return 0;
    return 1 - (value - goodMax) / (badMax - goodMax);
};

const scoreHigh = (value: number, badMin: number, goodMin: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (value <= badMin) return 0;
    if (value >= goodMin) return 1;
    return (value - badMin) / (goodMin - badMin);
};

const scoreBand = (
    value: number,
    lowBad: number,
    lowGood: number,
    highGood: number,
    highBad: number
): number => {
    return Math.min(scoreHigh(value, lowBad, lowGood), scoreLow(value, highGood, highBad));
};

export const classifyMotion = (metrics: CoreMetricsV1, framesCount: number): MotionClassificationV1 => {
    const accelRms = Number(metrics.accelRms ?? 0);
    const jerkRms = Number(metrics.jerkRms ?? 0);
    const gyroRms = typeof metrics.gyroRms === 'number' ? metrics.gyroRms : 0;
    const gyroAvailable = typeof metrics.gyroRms === 'number';

    if (framesCount < 10 || !Number.isFinite(accelRms) || !Number.isFinite(jerkRms)) {
        return {
            state: 'UNKNOWN',
            confidence: 0,
            signals: { accelRms: accelRms || 0, jerkRms: jerkRms || 0, gyroRms }
        };
    }

    // Heuristic thresholds tuned for static/table and walking datasets; no GPS required.
    const staticScore = scoreLow(jerkRms, 0.2, 0.8) * scoreLow(gyroRms, 0.08, 0.25);
    const walkingScore =
        scoreBand(jerkRms, 0.4, 0.7, 2.8, 4.5) * scoreBand(gyroRms, 0.15, 0.3, 2.2, 3.5);
    const vehicleScore = scoreBand(jerkRms, 0.25, 0.5, 1.8, 3.0) * scoreLow(gyroRms, 0.12, 0.35);

    const scores: Array<{ state: MotionState; score: number }> = [
        { state: 'STATIC', score: staticScore },
        { state: 'WALKING', score: walkingScore },
        { state: 'VEHICLE', score: vehicleScore }
    ];

    let top = scores[0];
    for (const candidate of scores) {
        if (candidate.score > top.score) top = candidate;
    }

    let confidence = clamp01(top.score);
    if (!gyroAvailable) {
        confidence *= 0.6;
    }

    const state: MotionState = confidence >= 0.25 ? top.state : 'UNKNOWN';

    return {
        state,
        confidence: Number(confidence.toFixed(3)),
        signals: { accelRms, jerkRms, gyroRms }
    };
};
