import { z } from 'zod';

/**
 * Zod schema for RideMetadata v1.3
 * Provides runtime validation to ensure metadata integrity before export
 */

const OSNameSchema = z.enum(["iOS", "Android", "Windows", "MacOS", "Linux", "Unknown"]);

const GpsQualityReasonSchema = z.enum(["good", "urban-canyon", "no-fix", "low-accuracy", "unknown"]);

const PhoneStabilitySchema = z.enum(["stable", "mixed", "unstable", "unknown"]);

const RateConfidenceSchema = z.enum(["low", "medium", "high"]);

export const RideMetadataSchema = z.object({
    // Core Identity
    schemaVersion: z.string(),
    idStrategy: z.literal("timestamp-ms + random-suffix"),
    rideId: z.string().min(1),

    // Timing
    startEpochMs: z.number().int().positive(),
    endEpochMs: z.number().int().positive(),
    createdAtIso: z.string().datetime(),
    endedAtIso: z.string().datetime(),
    durationMs: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative(),

    // Timezone (nested, no duplicates)
    timezone: z.object({
        jsTimezoneOffsetMinutes: z.number().int().min(-720).max(840),
        utcOffsetMinutes: z.number().int().min(-840).max(720),
        note: z.string(),
    }),

    // Application
    app: z.object({
        name: z.string(),
        version: z.string(),
        build: z.string().optional(),
    }),

    // Device
    device: z.object({
        userAgent: z.string(),
        os: z.object({
            name: OSNameSchema,
            major: z.number().optional(),
            versionFull: z.string().optional(),
        }),
        browserName: z.string(),
        browserMajor: z.union([z.number(), z.string()]),
        browserVersionFull: z.string().optional(),
        platform: z.string().optional(),
        language: z.string().optional(),
        screen: z.object({
            width: z.number(),
            height: z.number(),
            devicePixelRatio: z.number(),
        }).optional(),
    }),

    // Sampling
    sampling: z.object({
        sensorRateHz: z.number().nonnegative(),
        accelerometerHz: z.number().nonnegative(),
        gyroscopeHz: z.number().nonnegative().optional(),
        gpsHz: z.number().nonnegative(),
        gps: z.object({
            nativeHz: z.number().nonnegative(),
            replicatedToSensorRate: z.boolean(),
            replicationMode: z.literal("repeat-last"),
            rateEstimateMethod: z.literal("updates/duration"),
            expectedRangeHz: z.tuple([z.number(), z.number()]),
            rateConfidence: RateConfidenceSchema,
        }),
        earthFrameEnabled: z.boolean().optional(),
    }),

    // Counts
    counts: z.object({
        accelSamples: z.number().int().nonnegative(),
        gyroSamples: z.number().int().nonnegative(),
        gpsUpdates: z.number().int().nonnegative(),
        gpsSnapshots: z.number().int().nonnegative(),
        totalEvents: z.number().int().nonnegative(),
        warmupSamplesDropped: z.number().int().nonnegative(),
        firstGpsFixDelayMs: z.number().nullable(),
        permissionDelayMs: z.number().nullable(),
    }),

    // Derived Ratios
    derivedRatios: z.object({
        gpsReplicationFactor: z.number().nonnegative(),
        samplesPerSecond: z.number().nonnegative(),
    }),

    // Units
    units: z.object({
        accel: z.literal("m/s^2"),
        gyro: z.literal("rad/s"),
        speed: z.literal("m/s"),
        distance: z.literal("m"),
    }),

    // Processing
    processing: z.object({
        earthFrameEnabled: z.boolean(),
        gravityRemoved: z.boolean(),
        smoothing: z.object({
            type: z.enum(["none", "ema", "median"]),
            window: z.number().nullable(),
            params: z.record(z.any()).nullable(),
        }),
        integrityRules: z.object({
            expectedDtMs: z.number().positive(),
            gapThresholdMultiplier: z.number().positive(),
            minGapMs: z.number().positive(),
            dropoutThresholdMs: z.number().positive(),
        }),
    }),

    // Statistics
    statsSummary: z.object({
        maxAbsAccel: z.number().nonnegative(),
        maxAbsAccelContext: z.object({
            value: z.number().nonnegative(),
            unit: z.literal("m/s^2"),
            p95: z.number().nullable(),
            p99: z.number().nullable(),
        }),
        maxAbsGyro: z.number().nonnegative().optional(),
        gpsDistanceMeters: z.number().nonnegative(),
        avgSpeedMps: z.number().nonnegative(),
    }),

    // Quality Flags
    qualityFlags: z.object({
        isGpsLikelyDuplicated: z.boolean(),
        isStationaryLikely: z.boolean(),
        hasLowGpsQuality: z.boolean(),
        gpsQualityReason: GpsQualityReasonSchema,
        gpsQualityEvidence: z.object({
            avgAccuracyMeters: z.number().optional(),
            maxJumpMeters: z.number().optional(),
            avgSpeedMps: z.number().optional(),
            unrealisticSpeedCount: z.number().optional(),
        }).optional(),
        phoneStability: PhoneStabilitySchema,
        dataIntegrity: z.object({
            hasGaps: z.boolean(),
            gapCount: z.number().int().nonnegative(),
            dropoutCount: z.number().int().nonnegative(),
        }),
    }),

    // Privacy
    privacy: z.object({
        containsRawGps: z.boolean(),
        containsUserIdentifiers: z.boolean(),
        intendedUse: z.literal("aggregated-analysis-only"),
        dataMinimizationNotes: z.string(),
    }),

    // UI Display (i18n)
    display: z.object({
        summaryReasonKey: z.string(),
        summaryReasonI18n: z.object({
            he: z.string(),
            en: z.string(),
        }),
    }),

    // Export Metadata
    export: z.object({
        format: z.enum(["json", "zip"]),
        files: z.array(z.object({
            name: z.string(),
            bytes: z.number(),
            sha256: z.string().optional(),
        })),
        compressionRatio: z.number().nullable(),
        hashUnavailableReason: z.string().optional(),
    }).optional(),

    notes: z.string().optional(),
});

export type RideMetadataValidated = z.infer<typeof RideMetadataSchema>;

/**
 * Validate metadata and return detailed error messages
 */
export function validateMetadata(metadata: any): {
    success: boolean;
    errors?: string[];
    data?: RideMetadataValidated;
} {
    const result = RideMetadataSchema.safeParse(metadata);

    if (result.success) {
        return { success: true, data: result.data };
    }

    // Format errors for user-friendly display
    const errors = result.error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
    });

    return { success: false, errors };
}

/**
 * Quick check if metadata is valid
 */
export function isMetadataValid(metadata: any): boolean {
    return RideMetadataSchema.safeParse(metadata).success;
}

/**
 * Custom validation: Ensure timezone inversion is correct
 */
export function validateTimezoneInversion(metadata: any): boolean {
    if (!metadata.timezone?.jsTimezoneOffsetMinutes || typeof metadata.timezone?.utcOffsetMinutes === 'undefined') {
        return false;
    }
    return metadata.timezone.utcOffsetMinutes === -metadata.timezone.jsTimezoneOffsetMinutes;
}

/**
 * Custom validation: Ensure GPS rate computation is correct
 */
export function validateGpsRateComputation(metadata: any): boolean {
    if (!metadata.counts || !metadata.sampling || !metadata.durationSeconds) {
        return false;
    }

    const expectedGpsHz = metadata.counts.gpsUpdates / metadata.durationSeconds;
    const actualGpsHz = metadata.sampling.gpsHz;

    // Allow small floating point differences
    return Math.abs(expectedGpsHz - actualGpsHz) < 0.001;
}

/**
 * Run all custom validations
 */
export function runCustomValidations(metadata: any): {
    timezoneInversion: boolean;
    gpsRateComputation: boolean;
} {
    return {
        timezoneInversion: validateTimezoneInversion(metadata),
        gpsRateComputation: validateGpsRateComputation(metadata),
    };
}
