
/**
 * Computes the percentile of a sorted numeric array.
 */
export const getPercentile = (sorted: number[], p: number): number | null => {
    if (sorted.length === 0) return null;
    if (!Number.isFinite(p)) return null;
    if (p <= 0) return sorted[0];
    if (p >= 1) return sorted[sorted.length - 1];
    const index = Math.ceil((sorted.length - 1) * p);
    return sorted[index];
};

/**
 * Computes the median of a sorted numeric array.
 */
export const getMedian = (sorted: number[]): number | null => {
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
};

/**
 * Computes Median Absolute Deviation (MAD).
 * MAD = median(|x_i - median(X)|)
 */
export const getMAD = (sorted: number[]): number => {
    if (sorted.length === 0) return 0;
    const median = getMedian(sorted)!;
    const absoluteDeviations = sorted
        .map(v => Math.abs(v - median))
        .sort((a, b) => a - b);
    return getMedian(absoluteDeviations) || 0;
};

/**
 * Calculates RMS (Root Mean Square) for a series.
 */
export const getRMS = (values: number[]): number => {
    if (values.length === 0) return 0;
    const squaredSum = values.reduce((acc, v) => acc + v * v, 0);
    return Math.sqrt(squaredSum / values.length);
};

/**
 * Computes stream timing statistics.
 */
export const computeStreamStats = (timestamps: number[]) => {
    const samplesCount = timestamps.length;
    if (samplesCount < 2) {
        return { samplesCount, observedHz: 0, dtMedian: null, dtP95: null };
    }

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
        const dt = timestamps[i] - timestamps[i - 1];
        if (dt > 0) intervals.push(dt);
    }

    if (samplesCount < 3 || intervals.length === 0) {
        // User requirement: if < 3 samples, dt stats are null
        const first = timestamps[0];
        const last = timestamps[timestamps.length - 1];
        const dur = (last - first) / 1000;
        const observedHz = dur > 0 ? samplesCount / dur : 0;
        return { samplesCount, observedHz, dtMedian: null, dtP95: null };
    }

    const sorted = [...intervals].sort((a, b) => a - b);
    const dtMedian = getMedian(sorted);
    const dtP95 = getPercentile(sorted, 0.95);
    const observedHz = dtMedian && dtMedian > 0 ? 1000 / dtMedian : 0;

    return {
        samplesCount,
        observedHz: Number(observedHz.toFixed(1)),
        dtMedian: dtMedian ? Number(dtMedian.toFixed(2)) : null,
        dtP95: dtP95 ? Number(dtP95.toFixed(2)) : null
    };
};
