import { RideSession, RideDataPoint } from '../types';

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
        gpsHz?: number;
        earthFrameEnabled?: boolean;
    };
    counts: {
        accelSamples: number;
        gyroSamples: number;
        gpsSamples: number;
        totalSamples?: number;
    };
    statsSummary?: {
        maxAbsAccel?: number;
        maxAbsGyro?: number;
        gpsDistanceMeters?: number;
        avgSpeedMps?: number;
    };
    privacy: {
        containsRawGps: boolean;
        containsUserIdentifiers: boolean;
    };
    notes?: string;
}

/**
 * Builds a robust metadata object for a completed ride.
 * Implements logic to estimate sampling rates and extract device info safely.
 */
export function buildRideMetadata(
    ride: RideSession,
    appVersion: string = '0.2.2'
): RideMetadata {
    const { startTime, endTime, dataPoints } = ride;
    const durationMs = (endTime || Date.now()) - startTime;
    const durationSec = durationMs / 1000;

    // Count availability
    const accelCount = dataPoints.length;
    // Based on current implementation, we store gyro/location if available
    const gyroCount = dataPoints.filter(p => p.gyroscope !== undefined && p.gyroscope !== null).length;
    const gpsCount = dataPoints.filter(p => p.location !== undefined && p.location !== null).length;

    // Max acceleration (Earth magnitude if available, else standard)
    let maxAbsAccel = 0;
    dataPoints.forEach(p => {
        const acc = p.earth || p.accelerometer;
        const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
        if (mag > maxAbsAccel) maxAbsAccel = mag;
    });

    // Simple haversine for distance (if not already in ride object)
    // Our ride object has distance in km/m depending on calculation
    const gpsDistanceMeters = ride.distance || 0;

    return {
        schemaVersion: "1.0",
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
            accelerometerHz: durationSec > 0 ? Number((accelCount / durationSec).toFixed(1)) : 0,
            gyroscopeHz: durationSec > 0 && gyroCount > 0 ? Number((gyroCount / durationSec).toFixed(1)) : 0,
            gpsHz: durationSec > 0 && gpsCount > 0 ? Number((gpsCount / durationSec).toFixed(1)) : 0,
            earthFrameEnabled: dataPoints.some(p => !!p.earth),
        },
        counts: {
            accelSamples: accelCount,
            gyroSamples: gyroCount,
            gpsSamples: gpsCount,
            totalSamples: accelCount,
        },
        statsSummary: {
            maxAbsAccel: Number(maxAbsAccel.toFixed(3)),
            gpsDistanceMeters: Number(gpsDistanceMeters.toFixed(2)),
            avgSpeedMps: durationSec > 0 ? Number((gpsDistanceMeters / durationSec).toFixed(2)) : 0,
        },
        privacy: {
            containsRawGps: gpsCount > 0,
            containsUserIdentifiers: false,
        },
        notes: ""
    };
}
