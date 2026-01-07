import { RideSession, RideDataPoint, GpsUpdate } from '../types';
import pkg from '../../package.json';

const PKG_VERSION = pkg.version;

export interface RideMetadata {
    schemaVersion: string;
    idStrategy: "timestamp-ms + random-suffix";
    rideId: string;
    startEpochMs: number;
    endEpochMs: number;
    createdAtIso: string;
    endedAtIso: string;
    durationMs: number;
    durationSeconds: number;
    timezoneOffsetMinutes: number;
    app: {
        name: string;
        version?: string;
        build?: string;
    };
    device: {
        userAgent: string;
        os: {
            name: "iOS" | "Android" | "Windows" | "MacOS" | "Linux" | "Unknown";
            major?: number;
        };
        browserName: string;
        browserMajor: number | string;
        platform?: string;
        language?: string;
        screen?: {
            width: number;
            height: number;
            devicePixelRatio: number;
        };
    };
    sampling: {
        sensorRateHz: number; // Canonical rate (usually matching accelerometer)
        accelerometerHz?: number;
        gyroscopeHz?: number;
        gpsHz?: number; // Effective Hz based on actual updates
        gps: {
            nativeHz: number;
            replicatedToSensorRate: boolean;
            replicationMode: "repeat-last";
        };
        earthFrameEnabled?: boolean;
    };
    counts: {
        accelSamples: number;
        gyroSamples: number;
        gpsUpdates: number;
        gpsSnapshots?: number;
        totalEvents: number;
    };
    derivedRatios: {
        gpsReplicationFactor: number; // snapshots / max(1, updates)
        samplesPerSecond: number; // accelSamples / durationSeconds
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
        smoothing: {
            type: "none" | "ema" | "median";
            window: number | null;
            params: Record<string, any> | null;
        };
    };
    statsSummary: {
        maxAbsAccel: number;
        maxAbsAccelContext: {
            value: number;
            unit: "m/s^2";
            p99: number | null;
            p95: number | null;
        };
        maxAbsGyro?: number;
        gpsDistanceMeters?: number;
        avgSpeedMps?: number;
    };
    qualityFlags: {
        isGpsLikelyDuplicated: boolean;
        isStationaryLikely: boolean;
        hasLowGpsQuality: boolean;
        gpsQualityReason: "urban-canyon" | "low-fix-confidence" | "permission-denied" | "unknown";
        dataIntegrity: {
            hasGaps: boolean;
            gapCount: number;
        };
    };
    privacy: {
        containsRawGps: boolean;
        containsUserIdentifiers: boolean;
        intendedUse: "aggregated-analysis-only";
        dataMinimizationNotes: string;
    };
    notes?: string;
}

/**
 * Helper: Detect gaps in sensor data (delta > 2x expected period)
 */
function checkDataIntegrity(dataPoints: RideDataPoint[], expectedHz: number) {
    if (dataPoints.length < 2 || expectedHz <= 0) return { hasGaps: false, gapCount: 0 };

    const expectedPeriodMs = 1000 / expectedHz;
    const gapThreshold = expectedPeriodMs * 2;
    let gapCount = 0;

    for (let i = 1; i < dataPoints.length; i++) {
        const delta = dataPoints[i].timestamp - dataPoints[i - 1].timestamp;
        if (delta > gapThreshold) {
            gapCount++;
        }
    }

    return {
        hasGaps: gapCount > 0,
        gapCount
    };
}

/**
 * Helper: Calculate percentile from an array of numbers
 */
function calculatePercentile(values: number[], percentile: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Helper: Best-effort OS and Browser detection
 */
function getDeviceInfo() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

    let osName: RideMetadata['device']['os']['name'] = 'Unknown';
    let osMajor: number | undefined = undefined;
    let browserName = 'Unknown';
    let browserVersion: string | number = 'Unknown';

    // Basic OS detection
    if (/iPad|iPhone|iPod/.test(ua)) {
        osName = 'iOS';
        const match = ua.match(/OS (\d+)_/);
        if (match) osMajor = parseInt(match[1]);
    } else if (/Android/.test(ua)) {
        osName = 'Android';
        const match = ua.match(/Android (\d+)/);
        if (match) osMajor = parseInt(match[1]);
    } else if (/Windows/.test(ua)) {
        osName = 'Windows';
        const match = ua.match(/Windows NT (\d+\.\d+)/);
        if (match) osMajor = parseFloat(match[1]);
    } else if (/Mac/.test(ua)) {
        osName = 'MacOS';
    } else if (/Linux/.test(ua)) {
        osName = 'Linux';
    }

    // Basic Browser detection
    if (/Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua)) {
        browserName = 'Chrome';
        const match = ua.match(/Chrome\/(\d+)/);
        if (match) browserVersion = parseInt(match[1]);
    } else if (/Safari/.test(ua) && !/Chrome|Android/.test(ua)) {
        browserName = 'Safari';
        const match = ua.match(/Version\/(\d+)/);
        if (match) browserVersion = parseInt(match[1]);
    } else if (/Firefox/.test(ua)) {
        browserName = 'Firefox';
        const match = ua.match(/Firefox\/(\d+)/);
        if (match) browserVersion = parseInt(match[1]);
    } else if (/Edge|Edg/.test(ua)) {
        browserName = 'Edge';
        const match = ua.match(/Edg?\/(\d+)/);
        if (match) browserVersion = parseInt(match[1]);
    }

    return { osName, osMajor, browserName, browserVersion };
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
 * Builds refined, truthful, professional metadata for a ride session.
 */
export function buildRideMetadata(
    ride: RideSession,
    appVersion: string = PKG_VERSION
): RideMetadata {
    const { startTime, endTime, dataPoints, gpsUpdates = [] } = ride;
    const startEpochMs = startTime;
    const endEpochMs = endTime || Date.now();
    const durationMs = endEpochMs - startEpochMs;
    const durationSec = Math.max(0.001, durationMs / 1000);

    // Raw counts
    const accelSamples = dataPoints.length;
    const gyroSamples = dataPoints.filter(p => !!p.gyroscope).length;
    const actualGpsUpdates = gpsUpdates.length;
    const gpsSnapshots = dataPoints.filter(p => !!p.location).length;

    // Hz computation
    const accelHz = Number((accelSamples / durationSec).toFixed(2));
    const gyroHz = Number((gyroSamples / durationSec).toFixed(2));
    const gpsHz = Number((actualGpsUpdates / durationSec).toFixed(3));

    // Data Integrity
    const integrity = checkDataIntegrity(dataPoints, accelHz);

    // Device Info
    const { osName, osMajor, browserName, browserVersion } = getDeviceInfo();

    // Signal Statistics (Magnitudes)
    const accelMagnitudes = dataPoints.map(p => {
        const acc = p.earth || p.accelerometer;
        return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    });

    const maxAbsAccel = accelMagnitudes.length > 0 ? Math.max(...accelMagnitudes) : 0;
    const p95Accel = calculatePercentile(accelMagnitudes, 95);
    const p99Accel = calculatePercentile(accelMagnitudes, 99);

    // Distance & Speed (using ONLY actualGpsUpdates)
    let totalDistanceMeters = 0;
    let hasLowGpsQuality = false;
    let gpsQualityReason: RideMetadata['qualityFlags']['gpsQualityReason'] = 'unknown';

    if (actualGpsUpdates >= 2) {
        for (let i = 1; i < actualGpsUpdates; i++) {
            const p1 = gpsUpdates[i - 1];
            const p2 = gpsUpdates[i];

            if (p2.accuracy > 50) {
                hasLowGpsQuality = true;
                gpsQualityReason = 'low-fix-confidence';
            }

            const d = getHaversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
            const dt = (p2.timestamp - p1.timestamp) / 1000;

            if (dt > 0 && (d / dt) > 100) {
                hasLowGpsQuality = true;
                gpsQualityReason = 'urban-canyon'; // Jumps often caused by multi-path in cities
                continue;
            }

            totalDistanceMeters += d;
        }
    } else if (actualGpsUpdates === 0 && gpsSnapshots === 0) {
        gpsQualityReason = 'permission-denied';
    }

    const avgSpeedMps = durationSec > 0 ? totalDistanceMeters / durationSec : 0;

    // Final Object Construction
    return {
        schemaVersion: "1.2",
        idStrategy: "timestamp-ms + random-suffix",
        rideId: ride.id,
        startEpochMs,
        endEpochMs,
        createdAtIso: new Date(startEpochMs).toISOString(),
        endedAtIso: new Date(endEpochMs).toISOString(),
        durationMs,
        durationSeconds: Number(durationSec.toFixed(3)),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        app: {
            name: "Smooth Ride Tracker",
            version: appVersion,
        },
        device: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            os: { name: osName, major: osMajor },
            browserName,
            browserMajor: browserVersion,
            platform: typeof navigator !== 'undefined' ? (navigator as any).platform : undefined,
            language: typeof navigator !== 'undefined' ? navigator.language : undefined,
            screen: typeof window !== 'undefined' ? {
                width: window.screen.width,
                height: window.screen.height,
                devicePixelRatio: window.devicePixelRatio,
            } : undefined,
        },
        sampling: {
            sensorRateHz: accelHz,
            accelerometerHz: accelHz,
            gyroscopeHz: gyroHz,
            gpsHz: gpsHz,
            gps: {
                nativeHz: gpsHz,
                replicatedToSensorRate: true,
                replicationMode: "repeat-last"
            },
            earthFrameEnabled: dataPoints.some(p => !!p.earth),
        },
        counts: {
            accelSamples,
            gyroSamples,
            gpsUpdates: actualGpsUpdates,
            gpsSnapshots,
            totalEvents: accelSamples + gyroSamples + actualGpsUpdates,
        },
        derivedRatios: {
            gpsReplicationFactor: Number((gpsSnapshots / Math.max(1, actualGpsUpdates)).toFixed(2)),
            samplesPerSecond: Number((accelSamples / durationSec).toFixed(2)),
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
            smoothing: {
                type: "none",
                window: null,
                params: null
            }
        },
        statsSummary: {
            maxAbsAccel: Number(maxAbsAccel.toFixed(3)),
            maxAbsAccelContext: {
                value: Number(maxAbsAccel.toFixed(3)),
                unit: "m/s^2",
                p95: p95Accel !== null ? Number(p95Accel.toFixed(3)) : null,
                p99: p99Accel !== null ? Number(p99Accel.toFixed(3)) : null,
            },
            gpsDistanceMeters: Number(totalDistanceMeters.toFixed(2)),
            avgSpeedMps: Number(avgSpeedMps.toFixed(2)),
        },
        qualityFlags: {
            isGpsLikelyDuplicated: gpsSnapshots > 0 && actualGpsUpdates <= Math.max(2, durationSec * 0.1),
            isStationaryLikely: durationSec > 30 && (totalDistanceMeters < 30 || avgSpeedMps < 0.5),
            hasLowGpsQuality: hasLowGpsQuality || (actualGpsUpdates < 3 && durationSec > 60),
            gpsQualityReason,
            dataIntegrity: integrity,
        },
        privacy: {
            containsRawGps: actualGpsUpdates > 0,
            containsUserIdentifiers: false,
            intendedUse: "aggregated-analysis-only",
            dataMinimizationNotes: "No persistent device identifiers (UDID/IMEI) or user accounts are used. Data is stored locally or exported manually by the user.",
        },
        notes: ""
    };
}
