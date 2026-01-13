export const CORE_ANALYSIS_CONFIG = {
    windowing: {
        sizeMs: 5000,
        stepMs: 5000,
        minImuSamples: 120,
        minGpsSamples: 2
    },
    gps: {
        minHz: 0.2,
        maxAccuracyP95M: 25,
        movingSpeedMps: 4.0,
        slowSpeedMps: 1.5,
        staticSpeedMps: 0.5
    },
    imu: {
        staticAccelRmsMax: 0.25,
        staticJerkRmsMax: 6,
        staticGyroRmsMax: 2.5,
        movingAccelRmsMin: 0.3,
        movingJerkRmsMin: 3.5,
        walkingVetoJerkRms: 15,
        walkingVetoGyroRms: 5
    },
    motionScoring: {
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
        moving: {
            accelRms: { lowBad: 0.15, lowGood: 0.3, highGood: 0.8, highBad: 1.5 },
            jerkRms: { lowBad: 1, lowGood: 2.5, highGood: 8, highBad: 15 },
            gyroRms: { lowBad: 0.5, lowGood: 1.5, highGood: 4, highBad: 6 }
        }
    },
    event: {
        peakAccMin: 2.5,
        energyIndexMin: 2.0,
        jerkRmsMin: 18,
        accelMadMultiplier: 3.5,
        accelMinDelta: 1.8
    },
    smoothing: {
        hysteresisWindows: 2,
        minSegmentSec: {
            moving: 10,
            static: 10
        },
        eventMaxSec: 10,
        unknownBridgeSec: 20
    }
};
