
import { CoreFrameV1, ImpactEventV1, AnalyzeOptions } from './types';
import { getMedian, getMAD } from './stats';

/**
 * Detects significant physical events (Impacts) in the acceleration stream.
 */
export const detectImpacts = (
    frames: CoreFrameV1[],
    accelMags: number[],
    options: AnalyzeOptions = {}
): ImpactEventV1[] => {
    if (accelMags.length === 0) return [];

    const windowMs = options.eventWindowMs || 1500;
    const gpsMaxAgeMs = options.gpsMaxAgeMs || 5000;

    // 1. Calculate Robust Baseline
    const sortedMags = [...accelMags].sort((a, b) => a - b);
    const baseline = getMedian(sortedMags) || 0;
    const mad = getMAD(sortedMags);

    // threshold = baseline + 2.5 (fallback) or baseline + k*MAD
    const threshold = baseline + Math.max(2.5, mad * 3.5);

    const events: ImpactEventV1[] = [];
    let currentGroup: { startIndex: number, peakIndex: number, lastAboveIndex: number } | null = null;

    for (let i = 0; i < accelMags.length; i++) {
        const val = accelMags[i];
        const ts = frames[i].timestamp;

        if (val > threshold) {
            if (!currentGroup) {
                currentGroup = { startIndex: i, peakIndex: i, lastAboveIndex: i };
            } else {
                // Check if we should extend current group or start new one? 
                // Actually grouping is usually done by time window after the peak.
                if (val > accelMags[currentGroup.peakIndex]) {
                    currentGroup.peakIndex = i;
                }
                currentGroup.lastAboveIndex = i;
            }
        } else if (currentGroup) {
            // Is group finished? 
            const elapsedSinceLastAbove = ts - frames[currentGroup.lastAboveIndex].timestamp;
            if (elapsedSinceLastAbove > windowMs) {
                finalizeGroup(currentGroup, events, frames, accelMags, baseline, gpsMaxAgeMs);
                currentGroup = null;
            }
        }
    }

    // Don't forget the last one
    if (currentGroup) {
        finalizeGroup(currentGroup, events, frames, accelMags, baseline, gpsMaxAgeMs);
    }

    return events;
};

const finalizeGroup = (
    group: { startIndex: number, peakIndex: number, lastAboveIndex: number },
    events: ImpactEventV1[],
    frames: CoreFrameV1[],
    accelMags: number[],
    baseline: number,
    gpsMaxAgeMs: number
) => {
    const tStart = frames[group.startIndex].timestamp;
    const tPeak = frames[group.peakIndex].timestamp;
    const tEnd = frames[group.lastAboveIndex].timestamp;
    const peakAcc = accelMags[group.peakIndex];
    const durationMs = tEnd - tStart;

    // Energy Index: (peakAcc - baseline) * log(1 + durationMs)
    const energyIndex = (peakAcc - baseline) * Math.log1p(durationMs);

    // Find nearest GPS context
    let gpsContext: ImpactEventV1['gpsContext'] = undefined;
    const frameWithGps = frames
        .slice(Math.max(0, group.peakIndex - 20), Math.min(frames.length, group.peakIndex + 20))
        .filter(f => f.gps && Math.abs(f.timestamp - tPeak) < gpsMaxAgeMs)
        .sort((a, b) => Math.abs(a.timestamp - tPeak) - Math.abs(b.timestamp - tPeak))[0];

    if (frameWithGps && frameWithGps.gps) {
        gpsContext = {
            accuracy: frameWithGps.gps.accuracy,
            speed: frameWithGps.gps.speed
        };
    }

    events.push({
        tStart,
        tPeak,
        tEnd,
        peakAcc: Number(peakAcc.toFixed(2)),
        energyIndex: Number(energyIndex.toFixed(2)),
        gpsContext
    });
};
