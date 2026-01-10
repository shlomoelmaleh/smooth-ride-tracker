import { RideSession, RideChunk } from '../types';

const DB_NAME = 'smoothRide';
const DB_VERSION = 1;
const CHUNKS_STORE = 'rideChunks';
const RIDES_STORE = 'rides';

export const openRideDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;

            // Store ride chunks with a composite key [rideId, chunkIndex]
            if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
                db.createObjectStore(CHUNKS_STORE, { keyPath: ['rideId', 'chunkIndex'] });
            }

            // Store ride headers (metadata/summary)
            if (!db.objectStoreNames.contains(RIDES_STORE)) {
                db.createObjectStore(RIDES_STORE, { keyPath: 'id' });
            }
        };
    });
};

export const saveRideHeader = async (ride: RideSession): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readwrite');
        const store = transaction.objectStore(RIDES_STORE);
        const request = store.put(ride);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to save ride header'));
    });
};

export const addRideChunk = async (chunk: RideChunk): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
        const store = transaction.objectStore(CHUNKS_STORE);
        const request = store.add(chunk);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to add ride chunk'));
    });
};

export const getRideChunks = async (rideId: string): Promise<RideChunk[]> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readonly');
        const store = transaction.objectStore(CHUNKS_STORE);
        const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);
        const request = store.openCursor(range);

        const chunks: RideChunk[] = [];
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                chunks.push(cursor.value);
                cursor.continue();
            } else {
                resolve(chunks);
            }
        };
        request.onerror = () => reject(new Error('Failed to retrieve ride chunks'));
    });
};

/**
 * Iterate over all chunks for a ride using a cursor (memory efficient)
 */
export const iterateRideChunks = async (
    rideId: string,
    onChunk: (chunk: RideChunk) => void
): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readonly');
        const store = transaction.objectStore(CHUNKS_STORE);

        // Composite key range for [rideId, 0] to [rideId, Infinity]
        const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);
        const request = store.openCursor(range);

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                onChunk(cursor.value);
                cursor.continue();
            } else {
                resolve();
            }
        };
    });
};

export const getAllRides = async (): Promise<RideSession[]> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readonly');
        const store = transaction.objectStore(RIDES_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to retrieve all rides'));
    });
};

export const getRideHeader = async (id: string): Promise<RideSession | undefined> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readonly');
        const store = transaction.objectStore(RIDES_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to retrieve ride header'));
    });
};

export const deleteRideData = async (rideId: string): Promise<void> => {
    const db = await openRideDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([RIDES_STORE, CHUNKS_STORE], 'readwrite');

        // Delete header
        transaction.objectStore(RIDES_STORE).delete(rideId);

        // Delete chunks
        const chunksStore = transaction.objectStore(CHUNKS_STORE);
        const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);
        const cursorRequest = chunksStore.openCursor(range);

        cursorRequest.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to delete ride data'));
    });
};

export const clearAllData = async (): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([RIDES_STORE, CHUNKS_STORE], 'readwrite');
        transaction.objectStore(RIDES_STORE).clear();
        transaction.objectStore(CHUNKS_STORE).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to clear database'));
    });
};
