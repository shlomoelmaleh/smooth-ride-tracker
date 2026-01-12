import { CoreMetricsV1, InVehicleDetectionV1, MotionClassificationV1, MotionState } from './types';

export const VEHICLE_SPEED_ON_MPS = 4.0;
export const VEHICLE_SPEED_OFF_MPS = 2.5;
export const VEHICLE_MIN_CONSEC_WINDOWS_ON = 2;
export const VEHICLE_MIN_CONSEC_WINDOWS_OFF = 2;
export const GPS_MIN_HZ_FOR_VEHICLE = 0.5;
export const GPS_MAX_ACCURACY_P95_M = 25;
export const IMU_WALKING_VETO_JERK_RMS = 15;
export const IMU_WALKING_VETO_GYRO_RMS = 5;
export const IMU_STATIC_CONFIRM_ACCEL_RMS = 0.2;

export interface VehicleGpsWindowStats {
    samplesCount: number;
    observedHz: number;
    accuracyP95M: number | null;
    speedMedian: number | null;
}

export interface VehicleImuWindowStats {
    accelRms: number;
    jerkRms: number;
    gyroRms?: number;
}

export interface VehicleWindowInput {
    gps: VehicleGpsWindowStats;
    imu: VehicleImuWindowStats;
}

export const isGpsWindowUsableForVehicle = (gps: VehicleGpsWindowStats): boolean => {
    if (gps.speedMedian === null) return false;
    const hasRate = gps.observedHz >= GPS_MIN_HZ_FOR_VEHICLE || gps.samplesCount >= 3;
    const accuracyOk = gps.accuracyP95M === null || gps.accuracyP95M <= GPS_MAX_ACCURACY_P95_M;
    return hasRate && accuracyOk;
};

export const isImuWalkingVeto = (imu: VehicleImuWindowStats): boolean => {
    const jerkRms = Number.isFinite(imu.jerkRms) ? imu.jerkRms : Number.NaN;
    const gyroRms = Number.isFinite(imu.gyroRms ?? Number.NaN) ? (imu.gyroRms as number) : Number.NaN;
    return (Number.isFinite(jerkRms) && jerkRms >= IMU_WALKING_VETO_JERK_RMS)
        || (Number.isFinite(gyroRms) && gyroRms >= IMU_WALKING_VETO_GYRO_RMS);
};

export const vehicleCandidateOn = (window: VehicleWindowInput): boolean => {
    if (!isGpsWindowUsableForVehicle(window.gps)) return false;
    if (window.gps.speedMedian === null) return false;
    if (isImuWalkingVeto(window.imu)) return false;
    return window.gps.speedMedian >= VEHICLE_SPEED_ON_MPS;
};

export const vehicleCandidateOff = (window: VehicleWindowInput): boolean => {
    if (!isGpsWindowUsableForVehicle(window.gps)) return false;
    if (window.gps.speedMedian === null) return false;
    return window.gps.speedMedian <= VEHICLE_SPEED_OFF_MPS;
};

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

const buildVehicleSignals = (imu: VehicleImuWindowStats, gps?: VehicleGpsWindowStats | null) => {
    const accelRms = Number.isFinite(imu.accelRms) ? imu.accelRms : 0;
    const jerkRms = Number.isFinite(imu.jerkRms) ? imu.jerkRms : 0;
    const gyroRms = Number.isFinite(imu.gyroRms ?? Number.NaN) ? (imu.gyroRms as number) : 0;
    return {
        accelRms,
        jerkRms,
        gyroRms,
        gpsSpeedMedian: gps?.speedMedian ?? null,
        gpsHz: gps?.observedHz,
        gpsAccuracyP95M: gps?.accuracyP95M ?? null,
        imuJerkRms: jerkRms,
        imuGyroRms: gyroRms
    };
};

export const detectInVehicle = (
    metrics: CoreMetricsV1,
    gpsStats?: VehicleGpsWindowStats | null,
    _motionClassification?: MotionClassificationV1 | null
): InVehicleDetectionV1 => {
    const window: VehicleWindowInput = {
        imu: {
            accelRms: metrics.accelRms,
            jerkRms: metrics.jerkRms,
            gyroRms: metrics.gyroRms
        },
        gps: gpsStats ?? { samplesCount: 0, observedHz: 0, accuracyP95M: null, speedMedian: null }
    };

    const gpsUsable = isGpsWindowUsableForVehicle(window.gps);
    const imuVeto = isImuWalkingVeto(window.imu);
    const signals = buildVehicleSignals(window.imu, window.gps);

    if (vehicleCandidateOn(window)) {
        return {
            value: true,
            confidence: 0.95,
            reason: 'gps_speed_hysteresis_on',
            signals
        };
    }

    if (imuVeto) {
        return {
            value: false,
            confidence: 0.95,
            reason: 'imu_walking_veto',
            signals
        };
    }

    return {
        value: false,
        confidence: 0.85,
        reason: gpsUsable ? 'hysteresis_hold' : 'gps_unusable_hold',
        signals
    };
};

export const applyVehicleHysteresis = (windows: VehicleWindowInput[]): InVehicleDetectionV1[] => {
    let currentInVehicle = false;
    let consecOnCount = 0;
    let consecOffCount = 0;

    return windows.map(window => {
        const gpsUsable = isGpsWindowUsableForVehicle(window.gps);
        const imuVeto = isImuWalkingVeto(window.imu);
        const signals = buildVehicleSignals(window.imu, window.gps);
        let entered = false;
        let exited = false;

        if (!currentInVehicle) {
            if (vehicleCandidateOn(window)) {
                consecOnCount += 1;
            } else {
                consecOnCount = 0;
            }

            if (consecOnCount >= VEHICLE_MIN_CONSEC_WINDOWS_ON) {
                currentInVehicle = true;
                entered = true;
                consecOnCount = 0;
            }
        } else {
            if (vehicleCandidateOff(window)) {
                consecOffCount += 1;
            } else {
                consecOffCount = 0;
            }

            if (consecOffCount >= VEHICLE_MIN_CONSEC_WINDOWS_OFF) {
                currentInVehicle = false;
                exited = true;
                consecOffCount = 0;
            }
        }

        if (entered) {
            return {
                value: true,
                confidence: 0.95,
                reason: 'gps_speed_hysteresis_on',
                signals
            };
        }

        if (exited) {
            return {
                value: false,
                confidence: 0.85,
                reason: 'gps_speed_hysteresis_off',
                signals
            };
        }

        if (!currentInVehicle && imuVeto) {
            return {
                value: false,
                confidence: 0.95,
                reason: 'imu_walking_veto',
                signals
            };
        }

        if (currentInVehicle) {
            return {
                value: true,
                confidence: gpsUsable ? 0.9 : 0.75,
                reason: gpsUsable ? 'hysteresis_hold' : 'gps_unusable_hold',
                signals
            };
        }

        return {
            value: false,
            confidence: 0.85,
            reason: gpsUsable ? 'hysteresis_hold' : 'gps_unusable_hold',
            signals
        };
    });
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
