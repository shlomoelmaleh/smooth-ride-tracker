import { describe, it, expect } from 'vitest';
import { validateMetadata } from './metadataValidator';

describe('Metadata Validator', () => {
    const baseMetadata = {
        schemaVersion: "1.3",
        rideId: "test-ride-123",
        startEpochMs: 1736535000000,
        endEpochMs: 1736535060000,
        durationMs: 60000,
        durationSeconds: 60,
        createdAtIso: "2025-01-10T18:50:00.000Z",
        endedAtIso: "2025-01-10T18:51:00.000Z",
        timezone: {
            jsTimezoneOffsetMinutes: -120,
            utcOffsetMinutes: 120,
            note: "test"
        },
        app: { name: "Test App", version: "1.0.0" },
        device: { userAgent: "test", os: { name: "iOS" }, browserName: "Test", browserMajor: 1 },
        sampling: {
            sensorRateHz: 50,
            accelerometerHz: 50,
            gyroscopeHz: 50,
            gpsHz: 1,
            gps: { replicatedToSensorRate: false }
        },
        counts: {
            accelSamples: 3000, // 60s * 50Hz
            gyroSamples: 3000,
            gpsUpdates: 60,
            gpsSnapshots: 60,
            totalEvents: 6060,
            warmupSamplesDropped: 0,
            firstGpsFixDelayMs: 0,
            permissionDelayMs: 0
        },
        privacy: { intendedUse: "aggregated-analysis-only" }
    };

    it('should pass for valid metadata', () => {
        const result = validateMetadata(baseMetadata);
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
    });

    it('should fail for duration mismatch', () => {
        const invalidMeta = {
            ...baseMetadata,
            durationMs: 50000 // Should be 60000
        };
        const result = validateMetadata(invalidMeta);
        expect(result.status).toBe('fail');
        expect(result.errors.some(e => e.includes('Duration mismatch'))).toBe(true);
    });

    it('should warn for low GPS updates', () => {
        const warningMeta = {
            ...baseMetadata,
            counts: {
                ...baseMetadata.counts,
                gpsUpdates: 5 // 5 updates in 60s at 1Hz is way below ±20% (60 updates)
            }
        };
        const result = validateMetadata(warningMeta);
        expect(result.status).toBe('warn');
        expect(result.warnings.some(w => w.includes('GPS count mismatch'))).toBe(true);
    });
});
