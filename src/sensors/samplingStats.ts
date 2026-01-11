
import { StreamHealth } from './sensorTypes';

export class SamplingHealthMonitor {
    private lastTs: number = 0;
    private firstTs: number = 0;
    private intervals: number[] = [];
    private accuracyValues: number[] = [];
    private speedValues: number[] = [];
    private count: number = 0;
    private readonly windowSize: number = 1000; // Increased window for Audit accuracy

    record(timestamp: number, extras?: { accuracy?: number | null, speed?: number | null }) {
        if (this.firstTs === 0) this.firstTs = timestamp;

        if (this.lastTs > 0) {
            const dt = timestamp - this.lastTs;
            this.intervals.push(dt);
            if (this.intervals.length > this.windowSize) {
                this.intervals.shift();
            }
        }

        if (extras?.accuracy !== undefined && extras.accuracy !== null) {
            this.accuracyValues.push(extras.accuracy);
            if (this.accuracyValues.length > this.windowSize) this.accuracyValues.shift();
        }

        if (extras?.speed !== undefined && extras.speed !== null) {
            this.speedValues.push(extras.speed);
            if (this.speedValues.length > this.windowSize) this.speedValues.shift();
        }

        this.lastTs = timestamp;
        this.count++;
    }

    getStats(): StreamHealth {
        if (this.count === 0) {
            return { samplesCount: 0, observedHz: 0, dtMsMedian: null, dtMsP95: null, lastSampleAgeMs: null };
        }

        // Robustness: Nullify dt stats if < 3 samples (user requirement)
        let median: number | null = null;
        let p95: number | null = null;

        if (this.count >= 3 && this.intervals.length > 0) {
            const s = [...this.intervals].sort((a, b) => a - b);
            median = s.length % 2 === 0 ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2 : s[Math.floor(s.length / 2)];
            p95 = s[Math.floor(s.length * 0.95)];
        }

        const durationMs = Date.now() - this.firstTs;
        const observedHz = durationMs > 0 ? (this.count / (durationMs / 1000)) : 0;

        // GPS Extras
        let accuracyMedian: number | null = null;
        let accuracyP95: number | null = null;
        let speedMedian: number | null = null;

        if (this.accuracyValues.length > 0) {
            const accs = [...this.accuracyValues].sort((a, b) => a - b);
            accuracyMedian = accs.length % 2 === 0 ? (accs[accs.length / 2 - 1] + accs[accs.length / 2]) / 2 : accs[Math.floor(accs.length / 2)];
            accuracyP95 = accs[Math.floor(accs.length * 0.95)];
        }

        if (this.speedValues.length > 0) {
            const speeds = [...this.speedValues].sort((a, b) => a - b);
            speedMedian = speeds.length % 2 === 0 ? (speeds[speeds.length / 2 - 1] + speeds[speeds.length / 2]) / 2 : speeds[Math.floor(speeds.length / 2)];
        }

        return {
            samplesCount: this.count,
            observedHz: Number(observedHz.toFixed(1)),
            dtMsMedian: median ? Number(median.toFixed(2)) : null,
            dtMsP95: p95 ? Number(p95.toFixed(2)) : null,
            lastSampleAgeMs: Date.now() - this.lastTs,
            accuracyMedianM: accuracyMedian ? Number(accuracyMedian.toFixed(2)) : null,
            accuracyP95M: accuracyP95 ? Number(accuracyP95.toFixed(2)) : null,
            speedMedian: speedMedian ? Number(speedMedian.toFixed(2)) : null
        };
    }

    reset() {
        this.lastTs = 0;
        this.firstTs = 0;
        this.intervals = [];
        this.accuracyValues = [];
        this.speedValues = [];
        this.count = 0;
    }
}
