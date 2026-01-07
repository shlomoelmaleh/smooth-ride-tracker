import { RideSession, RideDataPoint, GpsUpdate } from '../types';
import pkg from '../../package.json';
const PKG_VERSION = pkg.version;

export interface RideMetadata {
    schemaVersion: string;
    rideId: string;
    createdAtIso: string;
    endedAtIso: string;
    durationMs: number;
    timezoneOffsetMinutes: number;
    app: {
        name: string;
        version?: string;
        build?: string;
    };
    device: {
        userAgent: string;
        platform?: string;
        language?: string;
        screen?: {
            width: number;
            height: number;
            devicePixelRatio: number;
        };
    };
    sampling: {
        accelerometerHz?: number;
        gyroscopeHz?: number;
        gpsHz?: number; // Based on ACTUAL updates
        earthFrameEnabled?: boolean;
    };
    counts: {
        accelSamples: number;
        gyroSamples: number;
        gpsUpdates: number;
        gpsSnapshots?: number;
        totalEvents: number;
    };
    units: {
        accel: "m/s^2";
        gyro: "rad/s";
        speed: "m/s";
        distance: "m";
    };
    processing: {
        earthFrameEnabled?: boolean;
        gravityRemoved?: boolean;
        smoothing?: {
            type: "none" | "ema" | "median";
            param?: number;
        };
    };
    statsSummary?: {
        maxAbsAccel?: number;
        maxAbsGyro?: number;
        gpsDistanceMeters?: number;
        avgSpeedMps?: number;
    };
    qualityFlags: {
        isGpsLikelyDuplicated: boolean;
        isStationaryLikely: boolean;
        hasLowGpsQuality: boolean;
    };
    privacy: {
        containsRawGps: boolean;
        containsUserIdentifiers: boolean;
    };
    notes?: string;
}

/**
 * Helper: Haversine distance between two points in meters
 */
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Builds refined, truthful metadata for a ride session.
 */
export function buildRideMetadata(
    ride: RideSession,
    appVersion: string = PKG_VERSION
): RideMetadata {
    const { startTime, endTime, dataPoints, gpsUpdates = [] } = ride;
    const durationMs = (endTime || Date.now()) - startTime;
    const durationSec = Math.max(0.1, durationMs / 1000);

    // Raw counts
    const accelSamples = dataPoints.length;
    const gyroSamples = dataPoints.filter(p => !!p.gyroscope).length;
    const actualGpsUpdates = gpsUpdates.length;
    const gpsSnapshots = dataPoints.filter(p => !!p.location).length;

    // Hz computation (Truthful)
    const accelHz = Number((accelSamples / durationSec).toFixed(1));
    const gyroHz = Number((gyroSamples / durationSec).toFixed(1));
    const gpsHz = Number((actualGpsUpdates / durationSec).toFixed(2));

    // Distance & Speed (using ONLY actualGpsUpdates)
    let totalDistanceMeters = 0;
    let hasLowGpsQuality = false;

    if (actualGpsUpdates >= 2) {
        for (let i = 1; i < actualGpsUpdates; i++) {
            const p1 = gpsUpdates[i - 1];
            const p2 = gpsUpdates[i];

            // Basic quality check for accuracy
            if (p2.accuracy > 50) hasLowGpsQuality = true;

            const d = getHaversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);

            // Filter unrealistic jumps (> 100 m/s for a bus is high but safer than 60)
            const dt = (p2.timestamp - p1.timestamp) / 1000;
            if (dt > 0 && (d / dt) > 100) {
                hasLowGpsQuality = true;
                continue;
            }

            totalDistanceMeters += d;
        }
    }

    const avgSpeedMps = durationSec > 0 ? totalDistanceMeters / durationSec : 0;

    // Max acceleration (Magnitude)
    let maxAbsAccel = 0;
    dataPoints.forEach(p => {
        const acc = p.earth || p.accelerometer;
        const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
        if (mag > maxAbsAccel) maxAbsAccel = mag;
    });

    // Quality Flags
    // GPS Duplication detection: if snapshots exist but updates are suspiciously low
    const isGpsLikelyDuplicated = gpsSnapshots > 0 &&
        gpsSnapshots >= (accelSamples * 0.9) &&
        actualGpsUpdates <= Math.max(2, durationSec * 0.1);

    // Stationary detection
    const isStationaryLikely = durationSec > 30 && (totalDistanceMeters < 30 || avgSpeedMps < 0.5);

    return {
        schemaVersion: "1.1",
        rideId: ride.id,
        createdAtIso: new Date(startTime).toISOString(),
        endedAtIso: endTime ? new Date(endTime).toISOString() : new Date().toISOString(),
        durationMs,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        app: {
            name: "Smooth Ride Tracker",
            version: appVersion,
        },
        device: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            platform: typeof navigator !== 'undefined' ? (navigator as any).platform : undefined,
            language: typeof navigator !== 'undefined' ? navigator.language : undefined,
            screen: typeof window !== 'undefined' ? {
                width: window.screen.width,
                height: window.screen.height,
                devicePixelRatio: window.devicePixelRatio,
            } : undefined,
        },
        sampling: {
            accelerometerHz: accelHz,
            gyroscopeHz: gyroHz,
            gpsHz: gpsHz,
            earthFrameEnabled: dataPoints.some(p => !!p.earth),
        },
        counts: {
            accelSamples,
            gyroSamples,
            gpsUpdates: actualGpsUpdates,
            gpsSnapshots,
            totalEvents: accelSamples + gyroSamples + actualGpsUpdates,
        },
        units: {
            accel: "m/s^2",
            gyro: "rad/s",
            speed: "m/s",
            distance: "m",
        },
        processing: {
            earthFrameEnabled: dataPoints.some(p => !!p.earth),
            gravityRemoved: true,
            smoothing: { type: "none" }
        },
        statsSummary: {
            maxAbsAccel: Number(maxAbsAccel.toFixed(3)),
            gpsDistanceMeters: Number(totalDistanceMeters.toFixed(2)),
            avgSpeedMps: Number(avgSpeedMps.toFixed(2)),
        },
        qualityFlags: {
            isGpsLikelyDuplicated,
            isStationaryLikely,
            hasLowGpsQuality: hasLowGpsQuality || (actualGpsUpdates < 3 && durationSec > 60),
        },
        privacy: {
            containsRawGps: actualGpsUpdates > 0,
            containsUserIdentifiers: false,
        },
        notes: ""
    };
}
