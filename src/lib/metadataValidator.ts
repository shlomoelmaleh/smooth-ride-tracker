/**
 * Automatic Metadata Validator
 * Validates metadata for internal consistency and embeds validation results
 */

export interface ValidationResult {
    status: "pass" | "warn" | "fail";
    errors: string[];
    warnings: string[];
    checkedAtIso: string;
    rulesVersion: string;
}

const RULES_VERSION = "1.0";

/**
 * Validate metadata for internal consistency
 * Returns validation result that should be embedded in metadata
 */
export function validateMetadata(meta: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // A. Time consistency
    validateTimeConsistency(meta, errors, warnings);

    // B. Sampling/count consistency
    validateSamplingConsistency(meta, errors, warnings);

    // C. Value sanity
    validateValueSanity(meta, errors, warnings);

    // D. Schema contract
    validateSchemaContract(meta, errors, warnings);

    // Determine status
    let status: "pass" | "warn" | "fail" = "pass";
    if (errors.length > 0) {
        status = "fail";
    } else if (warnings.length > 0) {
        status = "warn";
    }

    return {
        status,
        errors,
        warnings,
        checkedAtIso: new Date().toISOString(),
        rulesVersion: RULES_VERSION
    };
}

/**
 * A. Time consistency checks
 */
function validateTimeConsistency(meta: any, errors: string[], warnings: string[]) {
    // durationMs must equal endEpochMs - startEpochMs within ±10ms
    if (meta.startEpochMs && meta.endEpochMs && meta.durationMs) {
        const expectedDuration = meta.endEpochMs - meta.startEpochMs;
        const diff = Math.abs(meta.durationMs - expectedDuration);
        if (diff > 10) {
            errors.push(`Duration mismatch: durationMs=${meta.durationMs} but endEpochMs-startEpochMs=${expectedDuration} (diff=${diff}ms)`);
        }
    }

    // createdAtIso must match startEpochMs within ±1s
    if (meta.startEpochMs && meta.createdAtIso) {
        const createdMs = new Date(meta.createdAtIso).getTime();
        const diff = Math.abs(createdMs - meta.startEpochMs);
        if (diff > 1000) {
            errors.push(`createdAtIso mismatch: ${meta.createdAtIso} differs from startEpochMs by ${diff}ms`);
        }
    }

    // endedAtIso must match endEpochMs within ±1s
    if (meta.endEpochMs && meta.endedAtIso) {
        const endedMs = new Date(meta.endedAtIso).getTime();
        const diff = Math.abs(endedMs - meta.endEpochMs);
        if (diff > 1000) {
            errors.push(`endedAtIso mismatch: ${meta.endedAtIso} differs from endEpochMs by ${diff}ms`);
        }
    }
}

/**
 * B. Sampling/count consistency checks
 */
function validateSamplingConsistency(meta: any, errors: string[], warnings: string[]) {
    if (!meta.counts || !meta.sampling || !meta.durationSeconds) {
        warnings.push("Missing counts, sampling, or durationSeconds - skipping sampling consistency checks");
        return;
    }

    const duration = meta.durationSeconds;

    // accelSamples ≈ durationSeconds * accelerometerHz (tolerance: ±3%)
    if (meta.counts.accelSamples && meta.sampling.accelerometerHz) {
        const expected = duration * meta.sampling.accelerometerHz;
        const actual = meta.counts.accelSamples;
        const diff = Math.abs(actual - expected);
        const tolerance = expected * 0.03;
        if (diff > tolerance) {
            errors.push(`Accelerometer count mismatch: expected ${expected.toFixed(0)} samples, got ${actual} (diff=${diff.toFixed(0)}, tolerance=±${tolerance.toFixed(0)})`);
        }
    }

    // gyroSamples ≈ durationSeconds * gyroscopeHz (tolerance: ±3%)
    if (meta.counts.gyroSamples && meta.sampling.gyroscopeHz) {
        const expected = duration * meta.sampling.gyroscopeHz;
        const actual = meta.counts.gyroSamples;
        const diff = Math.abs(actual - expected);
        const tolerance = expected * 0.03;
        if (diff > tolerance) {
            errors.push(`Gyroscope count mismatch: expected ${expected.toFixed(0)} samples, got ${actual} (diff=${diff.toFixed(0)}, tolerance=±${tolerance.toFixed(0)})`);
        }
    }

    // gpsUpdates ≈ durationSeconds * gpsHz (tolerance: ±20%)
    if (typeof meta.counts.gpsUpdates !== 'undefined' && meta.sampling.gpsHz) {
        const expected = duration * meta.sampling.gpsHz;
        const actual = meta.counts.gpsUpdates;
        const diff = Math.abs(actual - expected);
        const tolerance = Math.max(expected * 0.20, 1); // At least 1 update tolerance
        if (diff > tolerance) {
            warnings.push(`GPS count mismatch: expected ${expected.toFixed(1)} updates, got ${actual} (diff=${diff.toFixed(1)}, tolerance=±${tolerance.toFixed(1)})`);
        }
    }

    // If gps.replicatedToSensorRate=true then gpsSnapshots should be close to accelSamples (tolerance: ±2%)
    if (meta.sampling.gps?.replicatedToSensorRate && meta.counts.gpsSnapshots && meta.counts.accelSamples) {
        const expected = meta.counts.accelSamples;
        const actual = meta.counts.gpsSnapshots;
        const diff = Math.abs(actual - expected);
        const tolerance = expected * 0.02;
        if (diff > tolerance) {
            warnings.push(`GPS replication mismatch: expected ${expected} snapshots, got ${actual} (diff=${diff}, tolerance=±${tolerance.toFixed(0)})`);
        }
    }
}

/**
 * C. Value sanity checks
 */
function validateValueSanity(meta: any, errors: string[], warnings: string[]) {
    // sensorRateHz/accelerometerHz/gyroscopeHz in [10..240]
    if (meta.sampling?.sensorRateHz) {
        if (meta.sampling.sensorRateHz < 10 || meta.sampling.sensorRateHz > 240) {
            errors.push(`sensorRateHz out of range: ${meta.sampling.sensorRateHz} (expected 10-240 Hz)`);
        }
    }

    if (meta.sampling?.accelerometerHz) {
        if (meta.sampling.accelerometerHz < 10 || meta.sampling.accelerometerHz > 240) {
            errors.push(`accelerometerHz out of range: ${meta.sampling.accelerometerHz} (expected 10-240 Hz)`);
        }
    }

    if (meta.sampling?.gyroscopeHz) {
        if (meta.sampling.gyroscopeHz < 10 || meta.sampling.gyroscopeHz > 240) {
            errors.push(`gyroscopeHz out of range: ${meta.sampling.gyroscopeHz} (expected 10-240 Hz)`);
        }
    }

    // gpsHz in [0.1..5]
    if (meta.sampling?.gpsHz !== undefined) {
        if (meta.sampling.gpsHz < 0.1 || meta.sampling.gpsHz > 5) {
            warnings.push(`gpsHz out of typical range: ${meta.sampling.gpsHz} (expected 0.1-5 Hz)`);
        }
    }

    // timezone in [-720..840]
    const tzOffset = meta.timezone?.jsTimezoneOffsetMinutes ?? meta.jsTimezoneOffsetMinutes ?? meta.timezoneOffsetMinutes;
    if (typeof tzOffset === 'number') {
        if (tzOffset < -720 || tzOffset > 840) {
            errors.push(`timezoneOffsetMinutes out of range: ${tzOffset} (expected -720 to 840)`);
        }
    }
}

/**
 * D. Schema contract checks
 */
function validateSchemaContract(meta: any, errors: string[], warnings: string[]) {
    // Required fields
    const requiredFields = [
        'schemaVersion',
        'rideId',
        'startEpochMs',
        'endEpochMs',
        'durationMs',
        'app',
        'device',
        'sampling',
        'counts',
        'privacy'
    ];

    for (const field of requiredFields) {
        if (meta[field] === undefined || meta[field] === null) {
            errors.push(`Required field missing: ${field}`);
        }
    }

    // Type checks for critical fields
    if (typeof meta.startEpochMs !== 'number') {
        errors.push(`startEpochMs must be a number, got ${typeof meta.startEpochMs}`);
    }
    if (typeof meta.endEpochMs !== 'number') {
        errors.push(`endEpochMs must be a number, got ${typeof meta.endEpochMs}`);
    }
    if (typeof meta.durationMs !== 'number') {
        errors.push(`durationMs must be a number, got ${typeof meta.durationMs}`);
    }
    if (typeof meta.durationSeconds !== 'number') {
        errors.push(`durationSeconds must be a number, got ${typeof meta.durationSeconds}`);
    }

    // Optional field type checks (warn only)
    if (meta.counts) {
        if (typeof meta.counts.accelSamples !== 'number') {
            warnings.push(`counts.accelSamples should be a number, got ${typeof meta.counts.accelSamples}`);
        }
        if (typeof meta.counts.gyroSamples !== 'number') {
            warnings.push(`counts.gyroSamples should be a number, got ${typeof meta.counts.gyroSamples}`);
        }
    }
}
