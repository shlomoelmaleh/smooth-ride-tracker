/**
 * Safe helpers for computing ride statistics from metadata without loading raw samples.
 */

import { RideMetadata, RideStats } from '@/types';

/**
 * Computes a standard RideStats object from a validated RideMetadata object.
 * Always returns a valid object even if fields are missing.
 */
export const computeRideSummaryFromMetadata = (meta: RideMetadata): RideStats => {
    if (!meta) {
        return {
            averageAcceleration: 0,
            maxAcceleration: 0,
            suddenStops: 0,
            suddenAccelerations: 0,
            vibrationLevel: 0,
            duration: 0,
            distance: 0
        };
    }

    return {
        averageAcceleration: meta.statsSummary?.maxAbsAccel || 0, // Fallback to max since avg isn't direct in meta yet
        maxAcceleration: meta.statsSummary?.maxAbsAccel || 0,
        suddenStops: meta.qualityFlags?.dataIntegrity?.gapCount || 0,
        suddenAccelerations: 0,
        vibrationLevel: meta.statsSummary?.maxAbsAccelContext?.p95 || 0,
        duration: (meta.durationMs || 0) / 1000,
        distance: meta.statsSummary?.gpsDistanceMeters || 0
    };
};

/**
 * Generates a short text summary of the ride quality.
 */
export const formatRideQualityLabel = (smoothnessScore: number | undefined): string => {
    const score = smoothnessScore ?? 0;
    if (score >= 85) return 'Very Smooth';
    if (score >= 70) return 'Smooth';
    if (score >= 50) return 'Average';
    if (score >= 30) return 'Bumpy';
    return 'Very Bumpy';
};

/**
 * Safely access nested metadata counts.
 */
export const getSafeRideMetric = (meta: any, path: string, fallback: any = 0): any => {
    return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : fallback, meta);
};
