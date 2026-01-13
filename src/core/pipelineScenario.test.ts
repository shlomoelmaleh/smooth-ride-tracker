import { describe, expect, it } from 'vitest';
import { buildCoreWindowing } from './windowing';
import { CoreFrameV1 } from './types';

const ACC_G = { x: 0, y: 0, z: 9.8 };

const buildFrames = () => {
    const frames: CoreFrameV1[] = [];
    const hz = 25;
    const dtMs = 1000 / hz;
    let timestamp = 0;

    const pushFrame = (linAccX: number, speed: number | null) => {
        const frame: CoreFrameV1 = {
            schema: 1,
            timestamp,
            accG: ACC_G,
            linAcc: { x: linAccX, y: 0, z: 0 }
        };
        if (timestamp % 1000 === 0) {
            frame.gps = {
                lat: 0,
                lon: 0,
                accuracy: 10,
                speed,
                heading: null,
                timestamp
            };
        }
        frames.push(frame);
        timestamp += dtMs;
    };

    const addSegment = (durationSec: number, linAccX: number, speed: number | null, eventSpikes: number[] = []) => {
        const samples = Math.floor(durationSec * hz);
        const eventSampleSet = new Set(eventSpikes);
        for (let i = 0; i < samples; i++) {
            const spike = eventSampleSet.has(i);
            pushFrame(spike ? 3.0 : linAccX, speed);
        }
    };

    addSegment(60, 0.5, 6);
    addSegment(60, 0.05, 0);
    addSegment(60, 0.2, 1.5);
    addSegment(120, 0.5, 6, [50, 52, 400, 402]);

    return frames;
};

describe('core windowing pipeline scenario', () => {
    it('produces the expected narrative with short isolated events', () => {
        const frames = buildFrames();
        const result = buildCoreWindowing(frames);

        const narrativeStates = result.segments
            .filter(segment => segment.state === 'MOVING' || segment.state === 'STATIC' || segment.state === 'SLOW_MOVING')
            .map(segment => segment.state);

        expect(narrativeStates[0]).toBe('MOVING');
        expect(narrativeStates.indexOf('STATIC')).toBeGreaterThan(0);
        expect(narrativeStates.indexOf('SLOW_MOVING')).toBeGreaterThan(narrativeStates.indexOf('STATIC'));

        const staticSegment = result.segments.find(segment => segment.state === 'STATIC');
        const slowSegment = result.segments.find(segment => segment.state === 'SLOW_MOVING');
        const movingSegments = result.segments.filter(segment => segment.state === 'MOVING');

        expect(staticSegment).toBeTruthy();
        expect(slowSegment).toBeTruthy();
        expect(movingSegments.length).toBeGreaterThan(1);

        if (staticSegment) {
            expect(staticSegment.tEndSec - staticSegment.tStartSec).toBeGreaterThan(50);
        }
        if (slowSegment) {
            expect(slowSegment.tEndSec - slowSegment.tStartSec).toBeGreaterThan(50);
        }

        expect(result.events.length).toBe(2);
        result.events.forEach(event => {
            expect(event.tEndSec - event.tStartSec).toBeLessThanOrEqual(10);
        });

        const eventSegments = result.segments.filter(segment => segment.state === 'EVENT');
        expect(eventSegments.length).toBeGreaterThanOrEqual(2);
        eventSegments.forEach(segment => {
            expect(segment.tEndSec - segment.tStartSec).toBeLessThanOrEqual(10);
        });
    });
});
