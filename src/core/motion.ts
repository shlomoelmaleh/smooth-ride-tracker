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
    const accelP95 = Number(metrics.accelP95 ?? 0);
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
    const accelScore = scoreLow(accelRms, 0.08, 0.25);
    const accelP95Available = Number.isFinite(accelP95) && accelP95 > 0;
    const accelP95Score = accelP95Available ? scoreLow(accelP95, 0.15, 0.45) : 1;
    const gyroScore = gyroAvailable ? scoreLow(gyroRms, 0.08, 0.25) : 0.7;
    const jerkPenalty = scoreLow(jerkRms, 0.4, 1.6);

    let staticScore = accelScore * gyroScore * accelP95Score;
    staticScore *= (0.65 + 0.35 * jerkPenalty);

    const veryStatic = accelRms <= 0.08 && gyroRms <= 0.08;
    if (veryStatic) {
        staticScore = Math.max(staticScore, 0.9);
    }

    const walkingScore =
        scoreBand(jerkRms, 0.5, 0.9, 3.2, 5.0) *
        scoreBand(gyroRms, 0.2, 0.4, 2.4, 3.8) *
        scoreHigh(accelRms, 0.12, 0.25);
    const vehicleScore =
        scoreBand(jerkRms, 0.25, 0.5, 1.6, 2.8) *
        scoreLow(gyroRms, 0.1, 0.3) *
        scoreBand(accelRms, 0.06, 0.12, 0.6, 1.2);

    const scores: Array<{ state: MotionState; score: number }> = [
        { state: 'STATIC', score: staticScore },
        { state: 'WALKING', score: walkingScore },
        { state: 'VEHICLE', score: vehicleScore }
    ];

    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const top = sortedScores[0];
    const runnerUp = sortedScores[1];

    const separation = clamp01(top.score - runnerUp.score);
    let confidence = clamp01(top.score * 0.85 + separation * 0.5);
    if (!gyroAvailable) {
        confidence *= 0.7;
    }

    const state: MotionState = confidence >= 0.3 ? top.state : 'UNKNOWN';

    return {
        state,
        confidence: Number(confidence.toFixed(3)),
        signals: { accelRms, jerkRms, gyroRms }
    };
};
