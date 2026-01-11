
import { StreamHealth } from './sensorTypes';

export class SamplingHealthMonitor {
    private lastTs: number = 0;
    private firstTs: number = 0;
    private intervals: number[] = [];
    private count: number = 0;
    private readonly windowSize: number = 200;

    record(timestamp: number) {
        if (this.firstTs === 0) this.firstTs = timestamp;

        if (this.lastTs > 0) {
            const dt = timestamp - this.lastTs;
            this.intervals.push(dt);
            if (this.intervals.length > this.windowSize) {
                this.intervals.shift();
            }
        }

        this.lastTs = timestamp;
        this.count++;
    }

    getStats(): StreamHealth {
        if (this.count === 0) {
            return { samplesCount: 0, observedHz: 0, dtMsMedian: null, dtMsP95: null, lastSampleAgeMs: null };
        }

        const s = [...this.intervals].sort((a, b) => a - b);
        const median = s.length > 0 ? (s.length % 2 === 0 ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2 : s[Math.floor(s.length / 2)]) : null;
        const p95 = s.length > 0 ? s[Math.floor(s.length * 0.95)] : null;

        const durationMs = Date.now() - this.firstTs;
        const observedHz = durationMs > 0 ? (this.count / (durationMs / 1000)) : 0;

        return {
            samplesCount: this.count,
            observedHz: Number(observedHz.toFixed(1)),
            dtMsMedian: median ? Number(median.toFixed(2)) : null,
            dtMsP95: p95 ? Number(p95.toFixed(2)) : null,
            lastSampleAgeMs: Date.now() - this.lastTs
        };
    }

    reset() {
        this.lastTs = 0;
        this.firstTs = 0;
        this.intervals = [];
        this.count = 0;
    }
}
