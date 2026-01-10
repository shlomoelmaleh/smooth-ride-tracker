import { RideSession, RideDataPoint, GpsUpdate } from '../types';
import pkg from '../../package.json';
import { validateMetadata, ValidationResult } from './metadataValidator';

const PKG_VERSION = pkg.version;

/**
 * Metadata Schema v1.3 - Stable Data Contract
 * 
 * Timezone Sign Convention:
 * - jsTimezoneOffsetMinutes: Positive values = West of UTC (e.g., UTC-5 = +300)
 * - utcOffsetMinutes: Positive values = East of UTC (e.g., UTC+2 = +120)
 * - Invariant: utcOffsetMinutes = -jsTimezoneOffsetMinutes
 */
export interface RideMetadata {
    // Core Identity
    schemaVersion: string;
    idStrategy: "timestamp-ms + random-suffix";
    rideId: string;

    // Timing
    startEpochMs: number;
    endEpochMs: number;
    createdAtIso: string;
    endedAtIso: string;
    durationMs: number;
    durationSeconds: number;

    // Timezone (unambiguous - NO duplicate fields)
    timezone: {
        jsTimezoneOffsetMinutes: number; // JavaScript Date.getTimezoneOffset() value (e.g., Israel = -120)
        utcOffsetMinutes: number; // Always equal to -jsTimezoneOffsetMinutes (e.g., Israel = +120)
        note: string; // Explanation of sign convention
    };

    // Application
    app: {
        name: string;
        version: string;
        build?: string;
    };

    // Device
    device: {
        userAgent: string;
        os: {
            name: "iOS" | "Android" | "Windows" | "MacOS" | "Linux" | "Unknown";
            major?: number;
            versionFull?: string; // e.g., "26.2.0"
        };
        browserName: string;
        browserMajor: number | string;
        browserVersionFull?: string; // e.g., "143.0.7499.151"
        platform?: string;
        language?: string;
        screen?: {
            width: number;
            height: number;
            devicePixelRatio: number;
        };
    };

    // Sampling
    sampling: {
        sensorRateHz: number;
        accelerometerHz: number;
        gyroscopeHz?: number;
        gpsHz: number; // Always computed as: gpsUpdates / durationSeconds
        gps: {
            nativeHz: number;
            replicatedToSensorRate: boolean;
            replicationMode: "repeat-last";
            // Machine-readable GPS rate explanation
            rateEstimateMethod: "updates/duration";
            expectedRangeHz: [number, number]; // e.g., [0.2, 1.2]
            rateConfidence: "low" | "medium" | "high";
        };
        earthFrameEnabled?: boolean;
    };

    // Counts
    counts: {
        accelSamples: number;
        gyroSamples: number;
        gpsUpdates: number;
        gpsSnapshots: number;
        totalEvents: number; // accel + gyro + gpsUpdates
        // Sampling explanation fields
        warmupSamplesDropped: number; // Samples dropped during warmup
        firstGpsFixDelayMs: number | null; // Delay until first GPS fix
        permissionDelayMs: number | null; // Delay due to permission request
    };

    // Derived Ratios
    derivedRatios: {
        gpsReplicationFactor: number; // snapshots / max(1, updates)
        samplesPerSecond: number; // accelSamples / durationSeconds
    };

    // Units
    units: {
        accel: "m/s^2";
        gyro: "rad/s";
        speed: "m/s";
        distance: "m";
    };

    // Processing
    processing: {
        earthFrameEnabled: boolean;
        gravityRemoved: boolean;
        smoothing: {
            type: "none" | "ema" | "median";
            window: number | null;
            params: Record<string, any> | null;
        };
        integrityRules: {
            expectedDtMs: number; // Computed as 1000 / sensorRateHz
            gapThresholdMultiplier: number; // e.g., 2.0
            minGapMs: number; // e.g., 150 - minimum threshold to avoid false positives
            dropoutThresholdMs: number; // e.g., 5000
        };
    };

    // Statistics
    statsSummary: {
        maxAbsAccel: number;
        maxAbsAccelContext: {
            value: number;
            unit: "m/s^2";
            p95: number | null;
            p99: number | null;
        };
        maxAbsGyro?: number;
        gpsDistanceMeters: number;
        avgSpeedMps: number;
    };

    // Quality Flags
    qualityFlags: {
        isGpsLikelyDuplicated: boolean;
        isStationaryLikely: boolean;
        hasLowGpsQuality: boolean;
        gpsQualityReason: "good" | "urban-canyon" | "no-fix" | "low-accuracy" | "unknown";
        gpsQualityEvidence?: {
            // Evidence-based numeric indicators
            avgAccuracyMeters?: number;
            maxJumpMeters?: number;
            avgSpeedMps?: number;
            unrealisticSpeedCount?: number;
        };
        phoneStability: "stable" | "mixed" | "unstable" | "unknown";
        dataIntegrity: {
            hasGaps: boolean; // True only if meaningful gaps exist (not 1-sample jitter)
            gapCount: number; // Always present, even if 0
            dropoutCount: number; // Always present, even if 0
        };
    };

    // Privacy
    privacy: {
        containsRawGps: boolean;
        containsUserIdentifiers: boolean;
        intendedUse: "aggregated-analysis-only";
        dataMinimizationNotes: string;
    };

    // UI Display (i18n)
    display: {
        summaryReasonKey: string; // Stable key for localization
        summaryReasonI18n: {
            he: string; // Hebrew text
            en: string; // English text
        };
    };

    // Export Metadata
    export?: {
        format: "json" | "zip";
        files: Array<{
            name: string;
            bytes: number;
            sha256?: string; // Optional if hashing unavailable
        }>;
        compressionRatio: number | null;
        hashUnavailableReason?: string;
    };

    // Validation Results (embedded automatically)
    validation: ValidationResult;

    notes?: string;
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
 * Helper: Enhanced browser detection with full version strings
 */
function getDeviceInfo() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

    let osName: RideMetadata['device']['os']['name'] = 'Unknown';
    let osMajor: number | undefined = undefined;
    let osVersionFull: string | undefined = undefined;
    let browserName = 'Unknown';
    let browserMajor: string | number = 'Unknown';
    let browserVersionFull: string | undefined = undefined;

    // OS detection with full version
    if (/iPad|iPhone|iPod/.test(ua)) {
        osName = 'iOS';
        const match = ua.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
        if (match) {
            osMajor = parseInt(match[1]);
            osVersionFull = match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}.0`;
        }
    } else if (/Android/.test(ua)) {
        osName = 'Android';
        const match = ua.match(/Android (\d+)(?:\.(\d+))?(?:\.(\d+))?/);
        if (match) {
            osMajor = parseInt(match[1]);
            osVersionFull = match[3] ? `${match[1]}.${match[2]}.${match[3]}` :
                match[2] ? `${match[1]}.${match[2]}.0` : `${match[1]}.0.0`;
        }
    } else if (/Windows/.test(ua)) {
        osName = 'Windows';
        const match = ua.match(/Windows NT (\d+\.\d+)/);
        if (match) {
            osMajor = parseFloat(match[1]);
            osVersionFull = match[1];
        }
    } else if (/Mac/.test(ua)) {
        osName = 'MacOS';
        const match = ua.match(/Mac OS X (\d+)[_.](\d+)(?:[_.](\d+))?/);
        if (match) {
            osMajor = parseInt(match[1]);
            osVersionFull = match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}.0`;
        }
    } else if (/Linux/.test(ua)) {
        osName = 'Linux';
    }

    // Browser detection with full version (iOS Chrome special case)
    if (/CriOS/.test(ua)) {
        // iOS Chrome
        browserName = 'Chrome iOS';
        const match = ua.match(/CriOS\/([\d.]+)/);
        if (match) {
            browserVersionFull = match[1];
            browserMajor = parseInt(match[1].split('.')[0]);
        }
    } else if (/Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua)) {
        browserName = 'Chrome';
        const match = ua.match(/Chrome\/([\d.]+)/);
        if (match) {
            browserVersionFull = match[1];
            browserMajor = parseInt(match[1].split('.')[0]);
        }
    } else if (/Safari/.test(ua) && !/Chrome|Android/.test(ua)) {
        browserName = 'Safari';
        const match = ua.match(/Version\/([\d.]+)/);
        if (match) {
            browserVersionFull = match[1];
            browserMajor = parseInt(match[1].split('.')[0]);
        }
    } else if (/Firefox/.test(ua)) {
        browserName = 'Firefox';
        const match = ua.match(/Firefox\/([\d.]+)/);
        if (match) {
            browserVersionFull = match[1];
            browserMajor = parseInt(match[1].split('.')[0]);
        }
    } else if (/Edge|Edg/.test(ua)) {
        browserName = 'Edge';
        const match = ua.match(/Edg?\/([\d.]+)/);
        if (match) {
            browserVersionFull = match[1];
            browserMajor = parseInt(match[1].split('.')[0]);
        }
    }

    return { osName, osMajor, osVersionFull, browserName, browserMajor, browserVersionFull };
}

/**
 * Helper: Haversine distance between two points in meters
 */
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
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
 * Helper: Detect gaps and dropouts in sensor data
 * A gap is counted only if BOTH thresholds are exceeded to avoid false positives
 */
function checkDataIntegrity(
    dataPoints: RideDataPoint[],
    expectedHz: number,
    gapThresholdMultiplier: number = 2.0,
    minGapMs: number = 150,
    dropoutThresholdMs: number = 5000
) {
    if (dataPoints.length < 2 || expectedHz <= 0) {
        return { hasGaps: false, gapCount: 0, dropoutCount: 0 };
    }

    const expectedPeriodMs = 1000 / expectedHz;
    const gapThreshold = expectedPeriodMs * gapThresholdMultiplier;
    let gapCount = 0;
    let dropoutCount = 0;

    for (let i = 1; i < dataPoints.length; i++) {
        const delta = dataPoints[i].timestamp - dataPoints[i - 1].timestamp;

        if (delta > dropoutThresholdMs) {
            dropoutCount++;
        } else if (delta > gapThreshold && delta > minGapMs) {
            // Count as gap only if BOTH thresholds exceeded
            gapCount++;
        }
    }

    return {
        hasGaps: gapCount > 0 || dropoutCount > 0,
        gapCount,
        dropoutCount
    };
}

/**
 * Helper: Calculate phone stability from acceleration variance
 */
function calculatePhoneStability(accelMagnitudes: number[]): "stable" | "mixed" | "unstable" | "unknown" {
    if (accelMagnitudes.length < 10) return "unknown";

    const mean = accelMagnitudes.reduce((sum, val) => sum + val, 0) / accelMagnitudes.length;
    const variance = accelMagnitudes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / accelMagnitudes.length;
    const stdDev = Math.sqrt(variance);

    // Thresholds: < 1.5 = stable, 1.5-3.0 = mixed, > 3.0 = unstable
    if (stdDev < 1.5) return "stable";
    if (stdDev < 3.0) return "mixed";
    return "unstable";
}

/**
 * Helper: Generate i18n summary keys and text based on quality flags
 */
function generateSummaryI18n(meta: Partial<RideMetadata>): { key: string; he: string; en: string } {
    const flags = meta.qualityFlags;
    const stats = meta.statsSummary;

    if (!flags || !stats) {
        return {
            key: "ride_completed_success",
            he: "נסיעה הושלמה בהצלחה",
            en: "Ride completed successfully"
        };
    }

    // Priority 1: GPS Issues
    if (flags.gpsQualityReason === "no-fix") {
        return {
            key: "gps_no_fix",
            he: "לא ניתן גישה ל-GPS — נתוני מיקום חסרים",
            en: "No GPS access — location data missing"
        };
    }
    if (flags.gpsQualityReason === "urban-canyon") {
        return {
            key: "gps_urban_canyon",
            he: "GPS חלש (Urban Canyon) — נתוני מיקום פחות אמינים",
            en: "Weak GPS (Urban Canyon) — less reliable location data"
        };
    }
    if (flags.gpsQualityReason === "low-accuracy") {
        return {
            key: "gps_low_accuracy",
            he: "דיוק GPS נמוך — נתוני מיקום משוערים",
            en: "Low GPS accuracy — estimated location data"
        };
    }

    // Priority 2: Data Integrity
    if (flags.dataIntegrity?.dropoutCount && flags.dataIntegrity.dropoutCount > 0) {
        return {
            key: "data_dropouts",
            he: `זוהו הפסקות בהקלטה — ${flags.dataIntegrity.dropoutCount} הפסקות`,
            en: `Recording dropouts detected — ${flags.dataIntegrity.dropoutCount} dropouts`
        };
    }
    if (flags.dataIntegrity?.gapCount && flags.dataIntegrity.gapCount > 10) {
        return {
            key: "data_gaps",
            he: `זוהו פערים בנתונים — ${flags.dataIntegrity.gapCount} פערים`,
            en: `Data gaps detected — ${flags.dataIntegrity.gapCount} gaps`
        };
    }

    // Priority 3: Phone Stability
    if (flags.phoneStability === "unstable") {
        return {
            key: "phone_unstable",
            he: "הרבה רעידות — ייתכן כביש משובש או טלפון לא יציב",
            en: "High vibrations — possibly rough road or unstable phone"
        };
    }

    // Priority 4: Ride Quality
    if (flags.isStationaryLikely) {
        return {
            key: "ride_stationary",
            he: "נסיעה נייחת — כמעט ללא תנועה",
            en: "Stationary ride — almost no movement"
        };
    }
    if (stats.maxAbsAccel < 12 && flags.phoneStability === "stable") {
        return {
            key: "ride_very_smooth",
            he: "נסיעה חלקה מאוד, כמעט בלי בלימות חדות",
            en: "Very smooth ride, almost no hard braking"
        };
    }
    if (stats.maxAbsAccel >= 15) {
        return {
            key: "ride_hard_braking",
            he: `נסיעה עם בלימות חדות — ${stats.maxAbsAccel.toFixed(1)} m/s²`,
            en: `Ride with hard braking — ${stats.maxAbsAccel.toFixed(1)} m/s²`
        };
    }

    return {
        key: "ride_completed_success",
        he: "נסיעה הושלמה בהצלחה",
        en: "Ride completed successfully"
    };
}

/**
 * Build initial metadata from ride session
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

    // Sampling explanation fields
    const warmupSamplesDropped = 0; // TODO: Implement warmup detection
    const firstGpsFixDelayMs = actualGpsUpdates > 0 ? gpsUpdates[0].timestamp - startEpochMs : null;
    const permissionDelayMs = null; // TODO: Track permission request timing

    // Hz computation
    const accelHz = Number((accelSamples / durationSec).toFixed(2));
    const gyroHz = gyroSamples > 0 ? Number((gyroSamples / durationSec).toFixed(2)) : 0;
    const gpsHz = Number((actualGpsUpdates / durationSec).toFixed(3));

    // GPS rate confidence
    let gpsRateConfidence: "low" | "medium" | "high" = "low";
    if (actualGpsUpdates > 30) {
        gpsRateConfidence = "high";
    } else if (actualGpsUpdates >= 15) {
        gpsRateConfidence = "medium";
    }

    // Data Integrity
    const minGapMs = 150;
    const integrity = checkDataIntegrity(dataPoints, accelHz, 2.0, minGapMs, 5000);

    // Device Info
    const { osName, osMajor, osVersionFull, browserName, browserMajor, browserVersionFull } = getDeviceInfo();

    // Signal Statistics
    const accelMagnitudes = dataPoints.map(p => {
        const acc = p.earth || p.accelerometer;
        return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    });

    const maxAbsAccel = accelMagnitudes.length > 0 ? Math.max(...accelMagnitudes) : 0;
    const p95Accel = calculatePercentile(accelMagnitudes, 95);
    const p99Accel = calculatePercentile(accelMagnitudes, 99);
    const phoneStability = calculatePhoneStability(accelMagnitudes);

    // Distance & Speed with GPS quality evidence
    let totalDistanceMeters = 0;
    let hasLowGpsQuality = false;
    let gpsQualityReason: RideMetadata['qualityFlags']['gpsQualityReason'] = 'unknown';
    let avgAccuracyMeters = 0;
    let maxJumpMeters = 0;
    let unrealisticSpeedCount = 0;

    if (actualGpsUpdates >= 2) {
        let totalAccuracy = 0;
        for (let i = 1; i < actualGpsUpdates; i++) {
            const p1 = gpsUpdates[i - 1];
            const p2 = gpsUpdates[i];

            totalAccuracy += p2.accuracy;

            if (p2.accuracy > 50) {
                hasLowGpsQuality = true;
                gpsQualityReason = 'low-accuracy';
            }

            const d = getHaversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
            const dt = (p2.timestamp - p1.timestamp) / 1000;

            if (d > maxJumpMeters) maxJumpMeters = d;

            if (dt > 0 && (d / dt) > 100) {
                hasLowGpsQuality = true;
                gpsQualityReason = 'urban-canyon';
                unrealisticSpeedCount++;
                continue;
            }

            totalDistanceMeters += d;
        }
        avgAccuracyMeters = totalAccuracy / actualGpsUpdates;
    } else if (actualGpsUpdates === 0 && gpsSnapshots === 0) {
        gpsQualityReason = 'no-fix';
    }

    // Set "good" if no issues detected
    if (!hasLowGpsQuality && actualGpsUpdates >= 3) {
        gpsQualityReason = 'good';
    }

    const avgSpeedMps = durationSec > 0 ? totalDistanceMeters / durationSec : 0;

    // Timezone fields
    const jsTimezoneOffset = new Date().getTimezoneOffset();
    const utcOffset = -jsTimezoneOffset;

    // Build metadata object
    const metadata: RideMetadata = {
        schemaVersion: "1.3",
        idStrategy: "timestamp-ms + random-suffix",
        rideId: ride.id,
        startEpochMs,
        endEpochMs,
        createdAtIso: new Date(startEpochMs).toISOString(),
        endedAtIso: new Date(endEpochMs).toISOString(),
        durationMs,
        durationSeconds: Number(durationSec.toFixed(3)),
        timezone: {
            jsTimezoneOffsetMinutes: jsTimezoneOffset,
            utcOffsetMinutes: utcOffset,
            note: "jsTimezoneOffsetMinutes: positive = west of UTC; utcOffsetMinutes: positive = east of UTC"
        },
        app: {
            name: "Smooth Ride Tracker",
            version: appVersion,
        },
        device: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            os: {
                name: osName,
                major: osMajor,
                versionFull: osVersionFull
            },
            browserName,
            browserMajor,
            browserVersionFull,
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
            gyroscopeHz: gyroHz > 0 ? gyroHz : undefined,
            gpsHz: gpsHz,
            gps: {
                nativeHz: gpsHz,
                replicatedToSensorRate: true,
                replicationMode: "repeat-last",
                rateEstimateMethod: "updates/duration",
                expectedRangeHz: [0.2, 1.2],
                rateConfidence: gpsRateConfidence
            },
            earthFrameEnabled: dataPoints.some(p => !!p.earth),
        },
        counts: {
            accelSamples,
            gyroSamples,
            gpsUpdates: actualGpsUpdates,
            gpsSnapshots,
            totalEvents: accelSamples + gyroSamples + actualGpsUpdates,
            warmupSamplesDropped,
            firstGpsFixDelayMs,
            permissionDelayMs
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
            },
            integrityRules: {
                expectedDtMs: accelHz > 0 ? Number((1000 / accelHz).toFixed(2)) : 0,
                gapThresholdMultiplier: 2.0,
                minGapMs: 150,
                dropoutThresholdMs: 5000
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
            gpsQualityEvidence: hasLowGpsQuality || actualGpsUpdates >= 2 ? {
                avgAccuracyMeters: Number(avgAccuracyMeters.toFixed(1)),
                maxJumpMeters: Number(maxJumpMeters.toFixed(1)),
                avgSpeedMps: Number(avgSpeedMps.toFixed(2)),
                unrealisticSpeedCount
            } : undefined,
            phoneStability,
            dataIntegrity: integrity,
        },
        privacy: {
            containsRawGps: actualGpsUpdates > 0,
            containsUserIdentifiers: false,
            intendedUse: "aggregated-analysis-only",
            dataMinimizationNotes: "No persistent device identifiers (UDID/IMEI) or user accounts are used. Data is stored locally or exported manually by the user.",
        },
        display: {
            summaryReasonKey: "",
            summaryReasonI18n: { he: "", en: "" }
        },
        validation: {
            status: "pass",
            errors: [],
            warnings: [],
            checkedAtIso: new Date().toISOString(),
            rulesVersion: "1.0"
        },
        notes: ""
    };

    // Generate summary after metadata is complete
    const summary = generateSummaryI18n(metadata);
    metadata.display.summaryReasonKey = summary.key;
    metadata.display.summaryReasonI18n = { he: summary.he, en: summary.en };

    // Run automatic validation and embed results
    metadata.validation = validateMetadata(metadata);

    return metadata;
}

/**
 * Validate and normalize metadata (graceful degradation)
 */
export function validateAndNormalizeMetadata(meta: any): RideMetadata {
    try {
        // Ensure schema version
        if (!meta.schemaVersion) meta.schemaVersion = "1.3";

        // Validate and fix required fields
        meta.rideId = meta.rideId || "unknown-" + Date.now();
        meta.startEpochMs = Number(meta.startEpochMs) || Date.now();
        meta.endEpochMs = Number(meta.endEpochMs) || meta.startEpochMs;
        meta.durationMs = Number(meta.durationMs) || (meta.endEpochMs - meta.startEpochMs);
        meta.durationSeconds = Number(meta.durationSeconds) || Number((meta.durationMs / 1000).toFixed(3));

        // Fix ISO dates
        if (!meta.createdAtIso || isNaN(Date.parse(meta.createdAtIso))) {
            meta.createdAtIso = new Date(meta.startEpochMs).toISOString();
        }
        if (!meta.endedAtIso || isNaN(Date.parse(meta.endedAtIso))) {
            meta.endedAtIso = new Date(meta.endEpochMs).toISOString();
        }

        // Migrate old timezone format to new nested structure
        if (!meta.timezone) {
            const jsOffset = meta.jsTimezoneOffsetMinutes ?? meta.timezoneOffsetMinutes ?? new Date().getTimezoneOffset();
            meta.timezone = {
                jsTimezoneOffsetMinutes: jsOffset,
                utcOffsetMinutes: -jsOffset,
                note: "jsTimezoneOffsetMinutes: positive = west of UTC; utcOffsetMinutes: positive = east of UTC"
            };
        } else {
            // Ensure all timezone fields exist
            if (typeof meta.timezone.jsTimezoneOffsetMinutes === 'undefined') {
                meta.timezone.jsTimezoneOffsetMinutes = new Date().getTimezoneOffset();
            }
            if (typeof meta.timezone.utcOffsetMinutes === 'undefined') {
                meta.timezone.utcOffsetMinutes = -meta.timezone.jsTimezoneOffsetMinutes;
            }
            if (!meta.timezone.note) {
                meta.timezone.note = "jsTimezoneOffsetMinutes: positive = west of UTC; utcOffsetMinutes: positive = east of UTC";
            }
        }

        // Ensure app info
        if (!meta.app) meta.app = {};
        meta.app.name = meta.app.name || "Smooth Ride Tracker";
        meta.app.version = meta.app.version || PKG_VERSION;

        // Ensure device info
        if (!meta.device) meta.device = {};
        meta.device.userAgent = meta.device.userAgent || "unknown";
        if (!meta.device.os) meta.device.os = { name: "Unknown" };
        meta.device.browserName = meta.device.browserName || "Unknown";
        meta.device.browserMajor = meta.device.browserMajor || "Unknown";

        // Ensure counts has new fields
        if (meta.counts) {
            if (typeof meta.counts.warmupSamplesDropped === 'undefined') {
                meta.counts.warmupSamplesDropped = 0;
            }
            if (typeof meta.counts.firstGpsFixDelayMs === 'undefined') {
                meta.counts.firstGpsFixDelayMs = null;
            }
            if (typeof meta.counts.permissionDelayMs === 'undefined') {
                meta.counts.permissionDelayMs = null;
            }
        }

        // Recompute derived ratios to ensure correctness
        if (meta.counts && meta.durationSeconds > 0) {
            meta.derivedRatios = meta.derivedRatios || {};
            meta.derivedRatios.gpsReplicationFactor = Number(
                (meta.counts.gpsSnapshots / Math.max(1, meta.counts.gpsUpdates)).toFixed(2)
            );
            meta.derivedRatios.samplesPerSecond = Number(
                (meta.counts.accelSamples / meta.durationSeconds).toFixed(2)
            );
        }

        // Recompute gpsHz to ensure correctness
        if (meta.counts && meta.durationSeconds > 0) {
            const correctGpsHz = Number((meta.counts.gpsUpdates / meta.durationSeconds).toFixed(3));
            if (meta.sampling) {
                meta.sampling.gpsHz = correctGpsHz;
                if (meta.sampling.gps) {
                    meta.sampling.gps.nativeHz = correctGpsHz;
                }
            }
        }

        // Ensure GPS sampling fields exist
        if (meta.sampling?.gps) {
            if (!meta.sampling.gps.rateEstimateMethod) {
                meta.sampling.gps.rateEstimateMethod = "updates/duration";
            }
            if (!meta.sampling.gps.expectedRangeHz) {
                meta.sampling.gps.expectedRangeHz = [0.2, 1.2];
            }
            if (!meta.sampling.gps.rateConfidence) {
                const gpsUpdates = meta.counts?.gpsUpdates || 0;
                meta.sampling.gps.rateConfidence = gpsUpdates > 30 ? "high" : gpsUpdates >= 15 ? "medium" : "low";
            }
        }

        // Ensure totalEvents is correct
        if (meta.counts) {
            const correctTotal = (meta.counts.accelSamples || 0) +
                (meta.counts.gyroSamples || 0) +
                (meta.counts.gpsUpdates || 0);
            meta.counts.totalEvents = correctTotal;
        }

        // Migrate old display format to i18n
        if (meta.display && !meta.display.summaryReasonI18n) {
            const oldSummary = meta.display.summaryReason || "נסיעה הושלמה בהצלחה";
            meta.display.summaryReasonKey = "ride_completed_success";
            meta.display.summaryReasonI18n = {
                he: oldSummary,
                en: "Ride completed successfully"
            };
        }

        // Ensure processing.integrityRules has all required fields
        if (!meta.processing) meta.processing = {};
        if (!meta.processing.integrityRules) {
            const sensorHz = meta.sampling?.sensorRateHz || 10;
            meta.processing.integrityRules = {
                expectedDtMs: sensorHz > 0 ? Number((1000 / sensorHz).toFixed(2)) : 100,
                gapThresholdMultiplier: 2.0,
                minGapMs: 150,
                dropoutThresholdMs: 5000
            };
        } else {
            // Ensure all fields exist
            const sensorHz = meta.sampling?.sensorRateHz || 10;
            if (typeof meta.processing.integrityRules.expectedDtMs === 'undefined') {
                meta.processing.integrityRules.expectedDtMs = sensorHz > 0 ? Number((1000 / sensorHz).toFixed(2)) : 100;
            }
            if (typeof meta.processing.integrityRules.minGapMs === 'undefined') {
                meta.processing.integrityRules.minGapMs = 150;
            }
        }

        // Ensure qualityFlags.phoneStability exists
        if (!meta.qualityFlags) meta.qualityFlags = {};
        if (!meta.qualityFlags.phoneStability) {
            meta.qualityFlags.phoneStability = "unknown";
        }

        // Ensure dataIntegrity.dropoutCount exists
        if (!meta.qualityFlags.dataIntegrity) {
            meta.qualityFlags.dataIntegrity = { hasGaps: false, gapCount: 0, dropoutCount: 0 };
        }
        if (typeof meta.qualityFlags.dataIntegrity.dropoutCount === 'undefined') {
            meta.qualityFlags.dataIntegrity.dropoutCount = 0;
        }

        // Run validation to update the validation status
        meta.validation = validateMetadata(meta);

        return meta as RideMetadata;
    } catch (error) {
        console.error("Metadata validation error:", error);
        // Return minimal valid metadata
        const jsOffset = new Date().getTimezoneOffset();
        return {
            schemaVersion: "1.3",
            idStrategy: "timestamp-ms + random-suffix",
            rideId: "error-" + Date.now(),
            startEpochMs: Date.now(),
            endEpochMs: Date.now(),
            createdAtIso: new Date().toISOString(),
            endedAtIso: new Date().toISOString(),
            durationMs: 0,
            durationSeconds: 0,
            timezone: {
                jsTimezoneOffsetMinutes: jsOffset,
                utcOffsetMinutes: -jsOffset,
                note: "jsTimezoneOffsetMinutes: positive = west of UTC; utcOffsetMinutes: positive = east of UTC"
            },
            app: { name: "Smooth Ride Tracker", version: PKG_VERSION },
            device: {
                userAgent: "unknown",
                os: { name: "Unknown" },
                browserName: "Unknown",
                browserMajor: "Unknown"
            },
            sampling: {
                sensorRateHz: 0,
                accelerometerHz: 0,
                gpsHz: 0,
                gps: {
                    nativeHz: 0,
                    replicatedToSensorRate: true,
                    replicationMode: "repeat-last",
                    rateEstimateMethod: "updates/duration",
                    expectedRangeHz: [0, 2],
                    rateConfidence: "low"
                }
            },
            counts: {
                accelSamples: 0,
                gyroSamples: 0,
                gpsUpdates: 0,
                gpsSnapshots: 0,
                totalEvents: 0,
                warmupSamplesDropped: 0,
                firstGpsFixDelayMs: null,
                permissionDelayMs: null
            },
            derivedRatios: {
                gpsReplicationFactor: 0,
                samplesPerSecond: 0
            },
            units: { accel: "m/s^2", gyro: "rad/s", speed: "m/s", distance: "m" },
            processing: {
                earthFrameEnabled: false,
                gravityRemoved: true,
                smoothing: { type: "none", window: null, params: null },
                integrityRules: {
                    expectedDtMs: 100,
                    gapThresholdMultiplier: 2.0,
                    minGapMs: 150,
                    dropoutThresholdMs: 5000
                }
            },
            statsSummary: {
                maxAbsAccel: 0,
                maxAbsAccelContext: { value: 0, unit: "m/s^2", p95: null, p99: null },
                gpsDistanceMeters: 0,
                avgSpeedMps: 0
            },
            qualityFlags: {
                isGpsLikelyDuplicated: false,
                isStationaryLikely: false,
                hasLowGpsQuality: true,
                gpsQualityReason: "unknown",
                phoneStability: "unknown",
                dataIntegrity: { hasGaps: false, gapCount: 0, dropoutCount: 0 }
            },
            privacy: {
                containsRawGps: false,
                containsUserIdentifiers: false,
                intendedUse: "aggregated-analysis-only",
                dataMinimizationNotes: "No persistent device identifiers (UDID/IMEI) or user accounts are used. Data is stored locally or exported manually by the user."
            },
            display: {
                summaryReasonKey: "error_processing",
                summaryReasonI18n: {
                    he: "שגיאה בעיבוד נתוני הנסיעה",
                    en: "Error processing ride data"
                }
            },
            validation: {
                status: "fail",
                errors: ["Metadata processing failed - using fallback values"],
                warnings: [],
                checkedAtIso: new Date().toISOString(),
                rulesVersion: "1.0"
            },
            notes: "Metadata validation failed - using fallback values"
        };
    }
}

/**
 * Migrate metadata from v1.2 to v1.3
 */
export function migrateMetadata(oldMeta: any): RideMetadata {
    if (oldMeta.schemaVersion === "1.3") {
        return validateAndNormalizeMetadata(oldMeta);
    }

    if (oldMeta.schemaVersion === "1.2") {
        const migrated = {
            ...oldMeta,
            schemaVersion: "1.3",

            // Migrate timezone to nested structure
            timezone: {
                jsTimezoneOffsetMinutes: oldMeta.jsTimezoneOffsetMinutes ?? oldMeta.timezoneOffsetMinutes ?? new Date().getTimezoneOffset(),
                utcOffsetMinutes: oldMeta.utcOffsetMinutes ?? -(oldMeta.timezoneOffsetMinutes ?? new Date().getTimezoneOffset()),
                note: "jsTimezoneOffsetMinutes: positive = west of UTC; utcOffsetMinutes: positive = east of UTC"
            },

            // Migrate display to i18n
            display: {
                summaryReasonKey: "ride_completed_success",
                summaryReasonI18n: {
                    he: oldMeta.display?.summaryReason || "נסיעה הושלמה בהצלחה",
                    en: "Ride completed successfully"
                }
            },

            // Add new counts fields
            counts: {
                ...oldMeta.counts,
                warmupSamplesDropped: 0,
                firstGpsFixDelayMs: null,
                permissionDelayMs: null
            },

            // Enhance qualityFlags
            qualityFlags: {
                ...oldMeta.qualityFlags,
                phoneStability: oldMeta.qualityFlags?.phoneStability || "unknown",
                dataIntegrity: {
                    ...oldMeta.qualityFlags?.dataIntegrity,
                    dropoutCount: oldMeta.qualityFlags?.dataIntegrity?.dropoutCount || 0
                }
            },

            // Add processing rules
            processing: {
                ...oldMeta.processing,
                integrityRules: {
                    expectedDtMs: oldMeta.processing?.integrityRules?.expectedDtMs || 100,
                    gapThresholdMultiplier: 2.0,
                    minGapMs: 150,
                    dropoutThresholdMs: 5000
                }
            }
        };

        return validateAndNormalizeMetadata(migrated);
    }

    // For v1.1 or earlier, rebuild from scratch if possible
    console.warn(`Unsupported schema version: ${oldMeta.schemaVersion}`);
    return validateAndNormalizeMetadata(oldMeta);
}

/**
 * Compute SHA-256 hash of a string using Web Crypto API
 */
export async function computeSHA256(data: string): Promise<string | null> {
    try {
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            return null;
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        console.error("SHA-256 computation error:", error);
        return null;
    }
}

/**
 * Add export metadata to ride metadata
 */
export async function addExportMetadata(
    metadata: RideMetadata,
    jsonString: string,
    format: "json" | "zip" = "json",
    compressionRatio: number | null = null
): Promise<RideMetadata> {
    const bytes = new Blob([jsonString]).size;
    const sha256 = await computeSHA256(jsonString);

    metadata.export = {
        format,
        files: [{
            name: `ride_${metadata.rideId}.json`,
            bytes,
            sha256: sha256 || undefined
        }],
        compressionRatio,
        hashUnavailableReason: sha256 ? undefined : "Web Crypto API not available"
    };

    return metadata;
}
