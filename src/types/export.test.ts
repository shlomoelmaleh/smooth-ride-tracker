import { describe, it, expect, vi } from 'vitest';
import { RideDataPoint, RideChunk } from './index';

// Simulating the logic from useRideData and exportWorker
describe('Export Pipeline Logic (Conceptual)', () => {
    it('should correctly chunk samples and maintaining order', () => {
        const samples: RideDataPoint[] = Array.from({ length: 250 }).map((_, i) => ({
            timestamp: 1000 + i,
            accelerometer: { x: 0, y: 0, z: 1, timestamp: 1000 + i },
            gyroscope: null,
            location: null,
            earth: null
        }));

        const CHUNK_SIZE = 120;
        const chunked: RideChunk[] = [];

        for (let i = 0; i < samples.length; i += CHUNK_SIZE) {
            const slice = samples.slice(i, i + CHUNK_SIZE);
            const ndjson = slice.map(p => JSON.stringify(p)).join('\n') + '\n';
            chunked.push({
                rideId: 'test-ride',
                chunkIndex: Math.floor(i / CHUNK_SIZE),
                createdAtEpochMs: Date.now(),
                format: 'ndjson',
                byteLength: ndjson.length,
                data: ndjson
            });
        }

        expect(chunked).toHaveLength(3); // 120 + 120 + 10
        expect(chunked[0].chunkIndex).toBe(0);
        expect(chunked[1].chunkIndex).toBe(1);
        expect(chunked[2].chunkIndex).toBe(2);

        // Re-assembly test
        const reassembled = chunked
            .sort((a, b) => a.chunkIndex - b.chunkIndex)
            .map(c => c.data)
            .join('')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line));

        expect(reassembled).toHaveLength(250);
        expect(reassembled[0].timestamp).toBe(1000);
        expect(reassembled[249].timestamp).toBe(1249);
    });

    it('should ensure NDJSON termination per chunk for safe concatenation', () => {
        const p1: RideDataPoint = { timestamp: 1, accelerometer: { x: 0, y: 0, z: 0, timestamp: 1 }, gyroscope: null, location: null, earth: null };
        const ndjson = JSON.stringify(p1) + '\n';

        // Concatenating two such chunks
        const combined = ndjson + ndjson;
        const lines = combined.trim().split('\n');
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0])).toEqual(p1);
        expect(JSON.parse(lines[1])).toEqual(p1);
    });
});
