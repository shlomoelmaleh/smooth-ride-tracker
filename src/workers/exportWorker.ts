import * as fflate from 'fflate';
import { openRideDB } from '../lib/db';
import { RideMetadata } from '../types';

/**
 * Worker protocol messages
 */
export type ExportWorkerMessage =
    | { type: 'START', rideId: string, metadata: RideMetadata }
    | { type: 'CANCEL' };

export type ExportWorkerResponse =
    | { type: 'PROGRESS', stage: string, percent: number }
    | { type: 'SUCCESS', blob: Blob, filename: string }
    | { type: 'ERROR', message: string };

self.onmessage = async (e: MessageEvent<ExportWorkerMessage>) => {
    const { type } = e.data;

    if (type === 'START') {
        const { rideId, metadata } = e.data;
        let ndjsonStringForFallback: string | undefined; // Declare here to be accessible in catch block
        try {
            ndjsonStringForFallback = await processExport(rideId, metadata);
        } catch (error: any) {
            console.error('ZIP process failed, attempting NDJSON fallback...', error);
            if (ndjsonStringForFallback) {
                try {
                    // Fallback: Just return the NDJSON blob if ZIP fails
                    const blob = new Blob([ndjsonStringForFallback], { type: 'application/x-ndjson' });
                    const filename = `ride_${rideId}_fallback.ndjson`;
                    self.postMessage({ type: 'SUCCESS', blob, filename });
                } catch (fallbackError: any) {
                    self.postMessage({
                        type: 'ERROR',
                        message: `Export failed completely: ${error.message}. Fallback also failed: ${fallbackError.message}`
                    });
                }
            } else {
                self.postMessage({ type: 'ERROR', message: error.message || 'Unknown export error' });
            }
        }
    }
};

async function processExport(rideId: string, metadata: RideMetadata): Promise<string> {
    const CHUNKS_STORE = 'rideChunks';

    // 1. Reading Chunks
    self.postMessage({ type: 'PROGRESS', stage: 'reading chunks', percent: 0 });

    const db = await openRideDB();
    const transaction = db.transaction(CHUNKS_STORE, 'readonly');
    const store = transaction.objectStore(CHUNKS_STORE);
    const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);

    const chunks: any[] = [];
    return new Promise<string>((resolve, reject) => {
        const request = store.openCursor(range);

        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                chunks.push(cursor.value);
                cursor.continue();
            } else {
                // All chunks read
                assembleAndZip(chunks, metadata, rideId).then(resolve).catch(reject);
            }
        };
        request.onerror = () => reject(new Error('Failed to read chunks from IndexedDB'));
    });
}

async function assembleAndZip(chunks: any[], metadata: RideMetadata, rideId: string) {
    // Sort chunks just in case, though IDB should return them ordered by secondary key
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const totalChunks = chunks.length;

    // 2. Assembling NDJSON
    self.postMessage({ type: 'PROGRESS', stage: 'assembling ndjson', percent: 20 });

    // We use TextEncoder to get Uint8Array for fflate
    const encoder = new TextEncoder();

    // Concatenate all data from chunks
    // NDJSON: each chunk already has multiple lines, we just need to join them with \n if not already present
    let ndjsonString = '';
    for (let i = 0; i < chunks.length; i++) {
        ndjsonString += chunks[i].data;
        if (!chunks[i].data.endsWith('\n')) {
            ndjsonString += '\n';
        }

        if (i % 5 === 0) {
            const percent = 20 + Math.floor((i / totalChunks) * 30);
            self.postMessage({ type: 'PROGRESS', stage: 'assembling ndjson', percent });
        }
    }

    const ndjsonUint8 = encoder.encode(ndjsonString);
    const metaUint8 = encoder.encode(JSON.stringify(metadata, null, 2));

    // 3. Zipping
    self.postMessage({ type: 'PROGRESS', stage: 'zipping', percent: 50 });

    // Create ZIP structure
    const zipData: fflate.Zippable = {
        'metadata.json': metaUint8,
        'samples.ndjson': ndjsonUint8
    };

    return new Promise<string>((resolve, reject) => {
        fflate.zip(zipData, { level: 9 }, (err, data) => {
            if (err) {
                reject(new Error('Zip compression failed: ' + err.message));
                return;
            }

            // 4. Finalizing
            self.postMessage({ type: 'PROGRESS', stage: 'finalizing', percent: 90 });

            const blob = new Blob([data as any], { type: 'application/zip' });
            const filename = `ride_${rideId}.zip`;

            self.postMessage({ type: 'SUCCESS', blob, filename });
            self.postMessage({ type: 'PROGRESS', stage: 'complete', percent: 100 });
            resolve(ndjsonString);
        });
    });
}
