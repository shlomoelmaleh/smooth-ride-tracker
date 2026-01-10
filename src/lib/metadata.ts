import { RideSession, RideDataPoint, GpsUpdate } from '../types';
import pkg from '../../package.json';

const PKG_VERSION = pkg.version;

/**
 * Metadata Schema v1.3 - Stable Data Contract
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
    timezoneOffsetMinutes: number; // Positive = West of UTC (JS convention)

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

    // Sampling
    sampling: {
        sensorRateHz: number;
        accelerometerHz: number;
        gyroscopeHz?: number;
        gpsHz: number; // Actual: gpsUpdates / durationSeconds
        gps: {
            nativeHz: number;
            replicatedToSensorRate: boolean;
            replicationMode: "repeat-last";
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
            gapThresholdMultiplier: number;
            dropoutThresholdMs: number;
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
        gpsQualityReason: "urban-canyon" | "low-fix-confidence" | "permission-denied" | "unknown";
        phoneStability: "stable" | "unstable" | "unknown";
        dataIntegrity: {
            hasGaps: boolean;
            gapCount: number;
            dropoutCount: number;
        };
    };

    // Privacy
    privacy: {
        containsRawGps: boolean;
        containsUserIdentifiers: boolean;
        intendedUse: "aggregated-analysis-only";
        dataMinimizationNotes: string;
    };

    // UI Display
    display: {
        summaryReason: string; // Hebrew-ready summary
    };

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
 * Helper: Enhanced browser detection (handles iOS Chrome "CriOS")
 */
function getDeviceInfo() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

    let osName: RideMetadata['device']['os']['name'] = 'Unknown';
    let osMajor: number | undefined = undefined;
    let browserName = 'Unknown';
    let browserVersion: string | number = 'Unknown';

    // OS detection
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

    // Browser detection (iOS Chrome special case)
    if (/CriOS/.test(ua)) {
        // iOS Chrome
        browserName = 'Chrome';
        const match = ua.match(/CriOS\/(\d+)/);
        if (match) browserVersion = parseInt(match[1]);
    } else if (/Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua)) {
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
 */
function checkDataIntegrity(
    dataPoints: RideDataPoint[],
    expectedHz: number,
    gapThresholdMultiplier: number = 2.0,
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
        } else if (delta > gapThreshold) {
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
function calculatePhoneStability(accelMagnitudes: number[]): "stable" | "unstable" | "unknown" {
    if (accelMagnitudes.length < 10) return "unknown";

    const mean = accelMagnitudes.reduce((sum, val) => sum + val, 0) / accelMagnitudes.length;
    const variance = accelMagnitudes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / accelMagnitudes.length;
    const stdDev = Math.sqrt(variance);

    // Threshold: 2.0 m/s² standard deviation
    return stdDev < 2.0 ? "stable" : "unstable";
}

/**
 * Helper: Generate Hebrew UI summary based on quality flags
 */
function generateSummaryReason(meta: Partial<RideMetadata>): string {
    const flags = meta.qualityFlags;
    const stats = meta.statsSummary;

    if (!flags || !stats) return "נסיעה הושלמה בהצלחה";

    // Priority 1: GPS Issues
    if (flags.gpsQualityReason === "permission-denied") {
        return "לא ניתן גישה ל-GPS — נתוני מיקום חסרים";
    }
    if (flags.gpsQualityReason === "urban-canyon") {
        return "GPS חלש (Urban Canyon) — נתוני מיקום פחות אמינים";
    }
    if (flags.gpsQualityReason === "low-fix-confidence") {
        return "דיוק GPS נמוך — נתוני מיקום משוערים";
    }

    // Priority 2: Data Integrity
    if (flags.dataIntegrity?.dropoutCount && flags.dataIntegrity.dropoutCount > 0) {
        return `זוהו הפסקות בהקלטה — ${flags.dataIntegrity.dropoutCount} הפסקות`;
    }
    if (flags.dataIntegrity?.gapCount && flags.dataIntegrity.gapCount > 10) {
        return `זוהו פערים בנתונים — ${flags.dataIntegrity.gapCount} פערים`;
    }

    // Priority 3: Phone Stability
    if (flags.phoneStability === "unstable") {
        return "הרבה רעידות — ייתכן כביש משובש או טלפון לא יציב";
    }

    // Priority 4: Ride Quality
    if (flags.isStationaryLikely) {
        return "נסיעה נייחת — כמעט ללא תנועה";
    }
    if (stats.maxAbsAccel < 12 && flags.phoneStability === "stable") {
        return "נסיעה חלקה מאוד, כמעט בלי בלימות חדות";
    }
    if (stats.maxAbsAccel >= 15) {
        return `נסיעה עם בלימות חדות — ${stats.maxAbsAccel.toFixed(1)} m/s²`;
    }

    return "נסיעה הושלמה בהצלחה";
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

    // Hz computation
    const accelHz = Number((accelSamples / durationSec).toFixed(2));
    const gyroHz = gyroSamples > 0 ? Number((gyroSamples / durationSec).toFixed(2)) : 0;
    const gpsHz = Number((actualGpsUpdates / durationSec).toFixed(3));

    // Data Integrity
    const integrity = checkDataIntegrity(dataPoints, accelHz);

    // Device Info
    const { osName, osMajor, browserName, browserVersion } = getDeviceInfo();

    // Signal Statistics
    const accelMagnitudes = dataPoints.map(p => {
        const acc = p.earth || p.accelerometer;
        return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    });

    const maxAbsAccel = accelMagnitudes.length > 0 ? Math.max(...accelMagnitudes) : 0;
    const p95Accel = calculatePercentile(accelMagnitudes, 95);
    const p99Accel = calculatePercentile(accelMagnitudes, 99);
    const phoneStability = calculatePhoneStability(accelMagnitudes);

    // Distance & Speed
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
                gpsQualityReason = 'urban-canyon';
                continue;
            }

            totalDistanceMeters += d;
        }
    } else if (actualGpsUpdates === 0 && gpsSnapshots === 0) {
        gpsQualityReason = 'permission-denied';
    }

    const avgSpeedMps = durationSec > 0 ? totalDistanceMeters / durationSec : 0;

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
            gyroscopeHz: gyroHz > 0 ? gyroHz : undefined,
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
            },
            integrityRules: {
                gapThresholdMultiplier: 2.0,
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
            summaryReason: "" // Will be filled by generateSummaryReason
        },
        notes: ""
    };

    // Generate summary after metadata is complete
    metadata.display.summaryReason = generateSummaryReason(metadata);

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

        // Validate timezone offset
        const tzOffset = Number(meta.timezoneOffsetMinutes);
        if (isNaN(tzOffset) || tzOffset < -720 || tzOffset > 840) {
            meta.timezoneOffsetMinutes = new Date().getTimezoneOffset();
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

        // Ensure totalEvents is correct
        if (meta.counts) {
            const correctTotal = (meta.counts.accelSamples || 0) +
                (meta.counts.gyroSamples || 0) +
                (meta.counts.gpsUpdates || 0);
            meta.counts.totalEvents = correctTotal;
        }

        // Ensure display.summaryReason exists
        if (!meta.display) meta.display = {};
        if (!meta.display.summaryReason) {
            meta.display.summaryReason = generateSummaryReason(meta);
        }

        // Ensure processing.integrityRules exists
        if (!meta.processing) meta.processing = {};
        if (!meta.processing.integrityRules) {
            meta.processing.integrityRules = {
                gapThresholdMultiplier: 2.0,
                dropoutThresholdMs: 5000
            };
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

        return meta as RideMetadata;
    } catch (error) {
        console.error("Metadata validation error:", error);
        // Return minimal valid metadata
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
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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
                gps: { nativeHz: 0, replicatedToSensorRate: true, replicationMode: "repeat-last" }
            },
            counts: {
                accelSamples: 0,
                gyroSamples: 0,
                gpsUpdates: 0,
                gpsSnapshots: 0,
                totalEvents: 0
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
                integrityRules: { gapThresholdMultiplier: 2.0, dropoutThresholdMs: 5000 }
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
                summaryReason: "שגיאה בעיבוד נתוני הנסיעה"
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

            // Add display field
            display: {
                summaryReason: generateSummaryReason(oldMeta)
            },

            // Enhance qualityFlags
            qualityFlags: {
                ...oldMeta.qualityFlags,
                phoneStability: "unknown" as const,
                dataIntegrity: {
                    ...oldMeta.qualityFlags?.dataIntegrity,
                    dropoutCount: 0
                }
            },

            // Add processing rules
            processing: {
                ...oldMeta.processing,
                integrityRules: {
                    gapThresholdMultiplier: 2.0,
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
