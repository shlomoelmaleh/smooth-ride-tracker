import { buildRideMetadata, RideMetadata } from './metadata';
import { RideSession } from '../types';

/**
 * A minimal runtime sanity check utility for Metadata.
 * Can be imported and called in dev mode to verify logic.
 */
export function runMetadataSanityCheck() {
    console.log("--- Starting Metadata Sanity Check ---");

    const mockRide: RideSession = {
        id: "1736282000000-abcde",
        startTime: 1736282000000,
        endTime: 1736282060000, // 60 seconds
        dataPoints: Array.from({ length: 600 }).map((_, i) => ({
            timestamp: 1736282000000 + (i * 100),
            accelerometer: { x: 0, y: 9.8, z: 0, timestamp: 1736282000000 + (i * 100) },
            gyroscope: { alpha: 0, beta: 0, gamma: 0, timestamp: 1736282000000 + (i * 100) },
            location: i % 10 === 0 ? { latitude: 32.0, longitude: 34.0, accuracy: 10, timestamp: 1736282000000 + (i * 100) } : null,
            earth: null
        })),
        gpsUpdates: [
            { timestamp: 1736282000000, latitude: 32.0, longitude: 34.0, accuracy: 10, speed: 5, heading: 0 },
            { timestamp: 1736282030000, latitude: 32.1, longitude: 34.1, accuracy: 10, speed: 5, heading: 0 },
            { timestamp: 1736282060000, latitude: 32.2, longitude: 34.2, accuracy: 10, speed: 5, heading: 0 },
        ]
    };

    try {
        const meta = buildRideMetadata(mockRide);

        const checks = [
            { name: "Schema Version", pass: meta.schemaVersion === "1.2" },
            { name: "ID Strategy", pass: meta.idStrategy === "timestamp-ms + random-suffix" },
            { name: "Duration Seconds", pass: meta.durationSeconds === 60 },
            { name: "Accel Hz", pass: Math.round(meta.sampling.accelerometerHz) === 10 },
            { name: "GPS Native Hz", pass: meta.sampling.gps.nativeHz > 0 },
            { name: "Percentiles", pass: meta.statsSummary.maxAbsAccelContext.p95 !== null },
            { name: "Data Integrity", pass: !meta.qualityFlags.dataIntegrity.hasGaps },
            { name: "Privacy Declaration", pass: meta.privacy.intendedUse === "aggregated-analysis-only" }
        ];

        checks.forEach(c => {
            console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
        });

        if (checks.every(c => c.pass)) {
            console.log("SUCCESS: All metadata sanity checks passed.");
            return true;
        } else {
            console.error("FAILURE: Some metadata sanity checks failed.");
            return false;
        }
    } catch (e) {
        console.error("CRITICAL ERROR during metadata sanity check:", e);
        return false;
    }
}
