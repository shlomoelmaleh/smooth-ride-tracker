import { describe, expect, it } from 'vitest';
import { applyVehicleHysteresis, VehicleWindowInput } from './motion';
import { buildCoreWindowing } from './windowing';
import { CoreFrameV1, GpsFix } from './types';

const buildWindow = (overrides: Partial<VehicleWindowInput> = {}): VehicleWindowInput => ({
    imu: {
        accelRms: 0.6,
        jerkRms: 8,
        gyroRms: 2,
        ...(overrides.imu || {})
    },
    gps: {
        samplesCount: 5,
        observedHz: 1,
        accuracyP95M: 10,
        speedMedian: 0.8,
        ...(overrides.gps || {})
    }
});

describe('applyVehicleHysteresis', () => {
    it('does not enter vehicle on a single GPS speed spike during walking', () => {
        const windows = Array.from({ length: 30 }, (_, index) =>
            buildWindow({
                imu: { jerkRms: 16, gyroRms: 6 },
                gps: { speedMedian: index === 12 ? 3.7 : 0.9 }
            })
        );

        const detections = applyVehicleHysteresis(windows);
        expect(detections.some(d => d.value)).toBe(false);
    });

    it('enters vehicle within 20s of sustained usable GPS speed', () => {
        const windows = [
            buildWindow({ gps: { speedMedian: 0.5 } }),
            buildWindow({ gps: { speedMedian: 6 } }),
            buildWindow({ gps: { speedMedian: 6 } }),
            buildWindow({ gps: { speedMedian: 6 } })
        ];

        const detections = applyVehicleHysteresis(windows);
        expect(detections[1].value).toBe(false);
        expect(detections[2].value).toBe(true);
    });

    it('holds vehicle state when GPS is unusable', () => {
        const windows = [
            buildWindow({ gps: { speedMedian: 6 } }),
            buildWindow({ gps: { speedMedian: 6 } }),
            buildWindow({ gps: { speedMedian: null, observedHz: 0.1, samplesCount: 1 } }),
            buildWindow({ gps: { speedMedian: null, observedHz: 0.1, samplesCount: 1 } })
        ];

        const detections = applyVehicleHysteresis(windows);
        expect(detections[1].value).toBe(true);
        expect(detections[2].value).toBe(true);
        expect(detections[2].reason).toBe('gps_unusable_hold');
        expect(detections[3].value).toBe(true);
    });
});

describe('buildCoreWindowing', () => {
    it('flags GPS_LOW_RATE for low-rate GPS windows', () => {
        const gpsFix = (timestamp: number): GpsFix => ({
            lat: 0,
            lon: 0,
            accuracy: 10,
            speed: 0,
            heading: null,
            timestamp
        });

        const frames: CoreFrameV1[] = [
            { schema: 1, timestamp: 0, accG: { x: 0, y: 0, z: 9.8 }, gps: gpsFix(0) },
            { schema: 1, timestamp: 8000, accG: { x: 0, y: 0, z: 9.8 }, gps: gpsFix(8000) },
            { schema: 1, timestamp: 9001, accG: { x: 0, y: 0, z: 9.8 } }
        ];

        const result = buildCoreWindowing(frames);
        expect(result.windows[0]?.flags).toContain('GPS_LOW_RATE');
    });
});
