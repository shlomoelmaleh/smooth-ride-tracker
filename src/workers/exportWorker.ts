import * as fflate from 'fflate';
import { iterateRideChunks } from '../utils/idb';
import { RideMetadata } from '../types';

/**
 * Worker protocol messages
 */
export type ExportWorkerMessage =
    | { type: 'START', rideId: string, metadata: RideMetadata }
    | { type: 'CANCEL' };

export type ExportWorkerResponse =
    | { type: 'PROGRESS', stage: string, percent: number }
    | { type: 'SUCCESS', bytes: Uint8Array, filename: string, mime: 'application/zip' }
    | { type: 'ERROR', message: string };

self.onmessage = async (e: MessageEvent<ExportWorkerMessage>) => {
    const { type } = e.data;

    if (type === 'START') {
        const { rideId, metadata } = e.data;
        try {
            await processExportStreaming(rideId, metadata);
        } catch (error: any) {
            console.error('Streaming export failed:', error);
            self.postMessage({ type: 'ERROR', message: error.message || 'Unknown export error' });
        }
    }
};

/**
 * Process export using streaming to avoid memory pressure.
 * CRITICAL for iOS: Return Uint8Array instead of Blob to avoid transfer hangs.
 */
async function processExportStreaming(rideId: string, metadata: RideMetadata): Promise<void> {
    const encoder = new TextEncoder();
    const zipDataChunks: Uint8Array[] = [];

    return new Promise<void>(async (resolve, reject) => {
        try {
            self.postMessage({ type: 'PROGRESS', stage: 'zipping', percent: 0 });

            // Initialize ZIP with a callback to collect output chunks
            const zip = new fflate.Zip((err, data, final) => {
                if (err) {
                    reject(new Error(`Zip error: ${err.message}`));
                    return;
                }
                zipDataChunks.push(data);
                if (final) {
                    // Combine chunks into a single Uint8Array for transfer
                    const totalLength = zipDataChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    const result = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of zipDataChunks) {
                        result.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Post as Success with Transferable bytes
                    self.postMessage({
                        type: 'SUCCESS',
                        bytes: result,
                        filename: `ride_${rideId}.zip`,
                        mime: 'application/zip'
                    }, [result.buffer] as any);

                    self.postMessage({ type: 'PROGRESS', stage: 'complete', percent: 100 });
                    resolve();
                }
            });

            // 1. Add metadata.json
            const metaUint8 = encoder.encode(JSON.stringify(metadata, null, 2));
            const metaFile = new fflate.ZipPassThrough('metadata.json');
            zip.add(metaFile);
            metaFile.push(metaUint8, true);

            // 2. Add samples.ndjson via streaming
            const samplesFile = new fflate.ZipPassThrough('samples.ndjson');
            zip.add(samplesFile);

            let processedChunks = 0;
            // Estimate total chunks from metadata to show progress
            const estimatedTotalChunks = Math.max(1, Math.ceil(metadata.counts.accelSamples / 120));

            await iterateRideChunks(rideId, (chunk) => {
                const chunkUint8 = encoder.encode(chunk.data);
                samplesFile.push(chunkUint8);

                processedChunks++;
                if (processedChunks % 10 === 0 || processedChunks === 1) {
                    const percent = Math.min(95, Math.round((processedChunks / estimatedTotalChunks) * 90));
                    self.postMessage({ type: 'PROGRESS', stage: 'zipping', percent });
                }
            });

            // Finalize files and zip
            samplesFile.push(new Uint8Array(0), true);
            zip.end();

        } catch (error: any) {
            reject(error);
        }
    });
}
