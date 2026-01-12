import { CoreMetricsV1, InVehicleDetectionV1, MotionClassificationV1, MotionState } from './types';

const clamp01 = (value: number): number => {
    return Math.min(1, Math.max(0, value));
};

const scoreLow = (value: number, goodMax: number, badMax: number): number => {
    if (value <= goodMax) return 1;
    if (value >= badMax) return 0;
    return 1 - (value - goodMax) / (badMax - goodMax);
};

const scoreHigh = (value: number, badMin: number, goodMin: number): number => {
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

const scoreIfFinite = (value: number, scorer: (value: number) => number): number | null => {
    return Number.isFinite(value) ? scorer(value) : null;
};

const averageScore = (scores: Array<number | null>): number => {
    const filtered = scores.filter((score): score is number => typeof score === 'number');
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((sum, score) => sum + score, 0);
    return clamp01(total / filtered.length);
};

const scoreInsideBand = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (value < min || value > max) return 0;
    const half = (max - min) / 2;
    if (half <= 0) return 0;
    const margin = Math.min(value - min, max - value);
    return clamp01(margin / half);
};

const scoreOutsideBand = (value: number, min: number, max: number): number => {
    if (value < min) return clamp01((min - value) / min);
    if (value > max) return clamp01((value - max) / max);
    return 0;
};

export const detectInVehicle = (
    metrics: CoreMetricsV1,
    gpsSpeedMedian?: number | null,
    motionClassification?: MotionClassificationV1 | null
): InVehicleDetectionV1 => {
    const accelRms = Number.isFinite(metrics.accelRms) ? metrics.accelRms : Number.NaN;
    const jerkRms = Number.isFinite(metrics.jerkRms) ? metrics.jerkRms : Number.NaN;
    const gyroRms = Number.isFinite(metrics.gyroRms) ? metrics.gyroRms : Number.NaN;
    const gpsSpeed = Number.isFinite(gpsSpeedMedian ?? Number.NaN) ? gpsSpeedMedian! : null;

    const signals = {
        accelRms: Number.isFinite(accelRms) ? accelRms : 0,
        jerkRms: Number.isFinite(jerkRms) ? jerkRms : 0,
        gyroRms: Number.isFinite(gyroRms) ? gyroRms : 0,
        gpsSpeedMedian: gpsSpeed
    };

    if (gpsSpeed !== null && gpsSpeed >= 3.0) {
        return {
            value: true,
            confidence: 0.98,
            reason: 'gps_speed>=3.0mps',
            signals
        };
    }

    const accelOk = Number.isFinite(accelRms) && accelRms >= 0.2 && accelRms <= 2.5;
    const jerkOk = Number.isFinite(jerkRms) && jerkRms >= 1.5 && jerkRms <= 25;
    const gyroOk = Number.isFinite(gyroRms) && gyroRms >= 0.3 && gyroRms <= 10;
    const allAvailable = Number.isFinite(accelRms) && Number.isFinite(jerkRms) && Number.isFinite(gyroRms);

    if (!allAvailable) {
        return {
            value: false,
            confidence: 0,
            reason: 'imu_missing',
            signals
        };
    }

    if (accelOk && jerkOk && gyroOk) {
        const confidence = averageScore([
            scoreInsideBand(accelRms, 0.2, 2.5),
            scoreInsideBand(jerkRms, 1.5, 25),
            scoreInsideBand(gyroRms, 0.3, 10)
        ]);
        return {
            value: true,
            confidence: Number(confidence.toFixed(3)),
            reason: 'imu_in_range',
            signals
        };
    }

    const outsideScore = averageScore([
        scoreIfFinite(accelRms, value => scoreOutsideBand(value, 0.2, 2.5)),
        scoreIfFinite(jerkRms, value => scoreOutsideBand(value, 1.5, 25)),
        scoreIfFinite(gyroRms, value => scoreOutsideBand(value, 0.3, 10))
    ]);

    // Heuristic: start at 0.5 and add up to 0.5 based on distance outside vehicle-like bands.
    let confidence = 0.5 + 0.5 * Math.sqrt(outsideScore);
    if (motionClassification?.state === 'STATIC') {
        // Very low motion should read as strong "not in vehicle".
        confidence = Math.max(confidence, 0.9);
    }

    const reason = motionClassification?.state === 'STATIC'
        ? 'static_like'
        : motionClassification?.state === 'WALKING'
            ? 'walking_like'
            : 'imu_outside_vehicle_band';

    return {
        value: false,
        confidence: Number(confidence.toFixed(3)),
        reason,
        signals
    };
};

export const classifyMotion = (metrics: CoreMetricsV1, framesCount: number): MotionClassificationV1 => {
    const accelRms = Number.isFinite(metrics.accelRms) ? metrics.accelRms : Number.NaN;
    const jerkRms = Number.isFinite(metrics.jerkRms) ? metrics.jerkRms : Number.NaN;
    const gyroRms = Number.isFinite(metrics.gyroRms) ? metrics.gyroRms : Number.NaN;
    const accelAvailable = Number.isFinite(accelRms);
    const jerkAvailable = Number.isFinite(jerkRms);
    const gyroAvailable = Number.isFinite(gyroRms);
    const availableSignals = [accelAvailable, jerkAvailable, gyroAvailable].filter(Boolean).length;

    const thresholds = {
        static: {
            accelRms: { goodMax: 0.2, badMax: 0.6 },
            jerkRms: { goodMax: 5, badMax: 12 },
            gyroRms: { goodMax: 2, badMax: 6 }
        },
        walking: {
            accelRms: { badMin: 0.3, goodMin: 1.0 },
            jerkRms: { badMin: 5, goodMin: 15 },
            gyroRms: { badMin: 2, goodMin: 5 }
        },
        vehicle: {
            accelRms: { lowBad: 0.15, lowGood: 0.3, highGood: 0.8, highBad: 1.5 },
            jerkRms: { lowBad: 1, lowGood: 2.5, highGood: 8, highBad: 15 },
            gyroRms: { lowBad: 0.5, lowGood: 1.5, highGood: 4, highBad: 6 }
        }
    };

    if (availableSignals === 0) {
        return {
            state: 'UNKNOWN',
            confidence: 0,
            signals: {
                accelRms: Number.isFinite(accelRms) ? accelRms : 0,
                jerkRms: Number.isFinite(jerkRms) ? jerkRms : 0,
                gyroRms: Number.isFinite(gyroRms) ? gyroRms : 0
            },
            debug: {
                rule: 'UNKNOWN',
                scores: { static: 0, walking: 0, vehicle: 0 },
                thresholds
            }
        };
    }

    const staticScore = averageScore([
        scoreIfFinite(accelRms, value => scoreLow(value, thresholds.static.accelRms.goodMax, thresholds.static.accelRms.badMax)),
        scoreIfFinite(jerkRms, value => scoreLow(value, thresholds.static.jerkRms.goodMax, thresholds.static.jerkRms.badMax)),
        scoreIfFinite(gyroRms, value => scoreLow(value, thresholds.static.gyroRms.goodMax, thresholds.static.gyroRms.badMax))
    ]);

    const walkingScore = averageScore([
        scoreIfFinite(accelRms, value => scoreHigh(value, thresholds.walking.accelRms.badMin, thresholds.walking.accelRms.goodMin)),
        scoreIfFinite(jerkRms, value => scoreHigh(value, thresholds.walking.jerkRms.badMin, thresholds.walking.jerkRms.goodMin)),
        scoreIfFinite(gyroRms, value => scoreHigh(value, thresholds.walking.gyroRms.badMin, thresholds.walking.gyroRms.goodMin))
    ]);

    const vehicleScore = averageScore([
        scoreIfFinite(accelRms, value =>
            scoreBand(value, thresholds.vehicle.accelRms.lowBad, thresholds.vehicle.accelRms.lowGood, thresholds.vehicle.accelRms.highGood, thresholds.vehicle.accelRms.highBad)
        ),
        scoreIfFinite(jerkRms, value =>
            scoreBand(value, thresholds.vehicle.jerkRms.lowBad, thresholds.vehicle.jerkRms.lowGood, thresholds.vehicle.jerkRms.highGood, thresholds.vehicle.jerkRms.highBad)
        ),
        scoreIfFinite(gyroRms, value =>
            scoreBand(value, thresholds.vehicle.gyroRms.lowBad, thresholds.vehicle.gyroRms.lowGood, thresholds.vehicle.gyroRms.highGood, thresholds.vehicle.gyroRms.highBad)
        )
    ]);

    const scores: Array<{ state: MotionState; score: number }> = [
        { state: 'STATIC', score: staticScore },
        { state: 'WALKING', score: walkingScore },
        { state: 'VEHICLE', score: vehicleScore }
    ];

    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const top = sortedScores[0];
    const runnerUp = sortedScores[1];

    const separation = clamp01(top.score - runnerUp.score);
    const availabilityFactor = 0.6 + 0.4 * (availableSignals / 3);
    const sampleFactor = framesCount < 10 ? 0.6 : 1;
    let confidence = clamp01(separation * availabilityFactor * sampleFactor);
    if (confidence === 0) {
        confidence = clamp01(top.score * 0.6 * availabilityFactor * sampleFactor);
    }

    const state: MotionState = top.score >= 0.35 && confidence >= 0.1 ? top.state : 'UNKNOWN';

    return {
        state,
        confidence: Number(confidence.toFixed(3)),
        signals: {
            accelRms: Number.isFinite(accelRms) ? accelRms : 0,
            jerkRms: Number.isFinite(jerkRms) ? jerkRms : 0,
            gyroRms: Number.isFinite(gyroRms) ? gyroRms : 0
        },
        debug: {
            rule: state,
            scores: {
                static: Number(staticScore.toFixed(3)),
                walking: Number(walkingScore.toFixed(3)),
                vehicle: Number(vehicleScore.toFixed(3))
            },
            thresholds
        }
    };
};
