import { describe, expect, it } from 'vitest';
import { buildDisplaySegments } from './windowing';
import { SegmentSummaryV1 } from './types';

const buildSegment = (
    tStartSec: number,
    tEndSec: number,
    state: SegmentSummaryV1['state'],
    confidence: number = 0.9,
    reason: string = 'test'
): SegmentSummaryV1 => ({
    tStartSec,
    tEndSec,
    state,
    confidence,
    reason
});

describe('buildDisplaySegments', () => {
    it('bridges short UNKNOWN segments between same states', () => {
        const coreSegments: SegmentSummaryV1[] = [
            buildSegment(0, 120, 'STATIC', 0.92),
            buildSegment(120, 128, 'UNKNOWN', 0),
            buildSegment(128, 218, 'STATIC', 0.88)
        ];
        const snapshot = coreSegments.map(segment => ({ ...segment }));

        const display = buildDisplaySegments(coreSegments);

        expect(coreSegments).toEqual(snapshot);
        expect(display).toHaveLength(1);
        expect(display[0]).toMatchObject({
            tStartSec: 0,
            tEndSec: 218,
            state: 'STATIC',
            confidence: 0.92,
            wasBridged: true,
            bridgedDurationSec: 8
        });
    });

    it('does not bridge UNKNOWN segments longer than the max', () => {
        const coreSegments: SegmentSummaryV1[] = [
            buildSegment(0, 60, 'STATIC', 0.9),
            buildSegment(60, 90, 'UNKNOWN', 0),
            buildSegment(90, 150, 'STATIC', 0.9)
        ];

        const display = buildDisplaySegments(coreSegments, 20);

        expect(display).toHaveLength(3);
        expect(display[1]).toMatchObject({ state: 'UNKNOWN', wasBridged: false });
    });

    it('does not bridge UNKNOWN between different states', () => {
        const coreSegments: SegmentSummaryV1[] = [
            buildSegment(0, 40, 'STATIC', 0.95),
            buildSegment(40, 50, 'UNKNOWN', 0),
            buildSegment(50, 80, 'MOVING', 0.85)
        ];

        const display = buildDisplaySegments(coreSegments);

        expect(display).toHaveLength(3);
        expect(display[1]).toMatchObject({ state: 'UNKNOWN', wasBridged: false });
    });

    it('does not bridge UNKNOWN segments at boundaries', () => {
        const coreSegments: SegmentSummaryV1[] = [
            buildSegment(0, 10, 'UNKNOWN', 0),
            buildSegment(10, 30, 'STATIC', 0.9),
            buildSegment(30, 45, 'UNKNOWN', 0)
        ];

        const display = buildDisplaySegments(coreSegments);

        expect(display).toHaveLength(3);
        expect(display[0]).toMatchObject({ state: 'UNKNOWN', wasBridged: false });
        expect(display[2]).toMatchObject({ state: 'UNKNOWN', wasBridged: false });
    });
});
