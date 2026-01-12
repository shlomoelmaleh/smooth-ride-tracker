
import { CoreFrameV1, Vector3, CoreMetricsV1 } from './types';
import { getRMS, getPercentile, getMedian } from './stats';

const MIN_PERCENTILE_SAMPLES = 20;

const sanitizeMagnitudes = (values: number[]): number[] => {
    return values.filter(v => Number.isFinite(v) && v >= 0);
};

/**
 * Calculates the Euclidean magnitude of a 3D vector.
 */
export const getMagnitude = (v: Vector3): number => {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
};

export interface FeatureResult {
    metrics: CoreMetricsV1;
    accelMags: number[];
    jerkMags: number[];
    flags: string[];
}

/**
 * Extracts high-level features from a sequence of frames.
 */
export const extractFeatures = (frames: CoreFrameV1[]): FeatureResult => {
    const flags: string[] = [];
    if (frames.length === 0) {
        return {
            metrics: { accelRms: 0, accelP95: 0, jerkRms: 0, jerkP95: 0 },
            accelMags: [], jerkMags: [], flags: ["INSUFFICIENT_DATA"]
        };
    }

    // 1. Source Selection
    const linAccCount = frames.filter(f => f.linAcc).length;
    const useLinAcc = linAccCount > (frames.length * 0.5);

    if (!useLinAcc && linAccCount > 0) {
        flags.push("LINACC_MISSING_FALLBACK_TO_ACCG");
    }

    const accelMags: number[] = [];
    const timestamps: number[] = [];

    // Choose source and compute magnitudes
    frames.forEach(f => {
        let vec: Vector3;
        if (useLinAcc && f.linAcc) {
            vec = f.linAcc;
        } else {
            // Fallback to AccG (includes gravity)
            vec = f.accG;
        }
        accelMags.push(getMagnitude(vec));
        timestamps.push(f.timestamp);
    });

    // 2. Jerk Calculation
    const jerkMags: number[] = [];
    for (let i = 1; i < accelMags.length; i++) {
        const dtSeconds = (timestamps[i] - timestamps[i - 1]) / 1000;
        if (dtSeconds > 0.001) { // Skip suspiciously small or negative intervals
            const jerk = Math.abs(accelMags[i] - accelMags[i - 1]) / dtSeconds;
            jerkMags.push(jerk);
        }
    }

    // 3. Summary Metrics
    const accelValues = sanitizeMagnitudes(accelMags);
    const jerkValues = sanitizeMagnitudes(jerkMags);
    const sortedAccel = [...accelValues].sort((a, b) => a - b);
    const sortedJerk = [...jerkValues].sort((a, b) => a - b);

    const accelMedian = getMedian(sortedAccel);
    const jerkMedian = getMedian(sortedJerk);
    // Keep percentile and RMS on the same sanitized magnitudes; the previous MIN_PERCENTILE_SAMPLES gate
    // could force P95 to 0 while RMS used real samples.
    const accelP95Raw = sortedAccel.length > 0 ? getPercentile(sortedAccel, 0.95) : null;
    const jerkP95Raw = sortedJerk.length > 0 ? getPercentile(sortedJerk, 0.95) : null;

    if (sortedAccel.length < MIN_PERCENTILE_SAMPLES || sortedJerk.length < MIN_PERCENTILE_SAMPLES) {
        if (!flags.includes("CORE_METRICS_INCOMPLETE")) {
            flags.push("CORE_METRICS_INCOMPLETE");
        }
    }

    const accelMedianClamped = accelMedian !== null ? Math.max(0, accelMedian) : null;
    const jerkMedianClamped = jerkMedian !== null ? Math.max(0, jerkMedian) : null;
    const accelP95 = accelP95Raw !== null ? Math.max(accelP95Raw, accelMedianClamped ?? 0, 0) : null;
    const jerkP95 = jerkP95Raw !== null ? Math.max(jerkP95Raw, jerkMedianClamped ?? 0, 0) : null;

    const metrics: CoreMetricsV1 = {
        accelRms: Number(getRMS(accelValues).toFixed(3)),
        accelP95: Number(((accelP95 ?? 0)).toFixed(3)),
        jerkRms: Number(getRMS(jerkValues).toFixed(3)),
        jerkP95: Number(((jerkP95 ?? 0)).toFixed(3))
    };

    // Optional Gyro
    const gyroMags = frames
        .filter(f => f.gyroRate && f.gyroRate.alpha !== null)
        .map(f => {
            const r = f.gyroRate!;
            return Math.sqrt((r.alpha || 0) ** 2 + (r.beta || 0) ** 2 + (r.gamma || 0) ** 2);
        });
    const gyroValues = sanitizeMagnitudes(gyroMags);

    if (gyroValues.length > 0) {
        const sortedGyro = [...gyroValues].sort((a, b) => a - b);
        metrics.gyroRms = Number(getRMS(gyroValues).toFixed(3));
        const gyroP95Raw = getPercentile(sortedGyro, 0.95);
        metrics.gyroP95 = Number(((gyroP95Raw ?? 0)).toFixed(3));
    }

    return { metrics, accelMags, jerkMags, flags };
};
