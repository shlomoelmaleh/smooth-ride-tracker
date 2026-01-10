import { RideSession, RideChunk } from '../types';

const DB_NAME = 'smoothRide';
const DB_VERSION = 2; // Incremented Version for new schema
const RIDES_STORE = 'rides';
const CHUNKS_STORE = 'rideChunks';

/**
 * Open the IndexedDB database with stores for rides and chunks
 */
export const openRideDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Store for ride headers/metadata
            if (!db.objectStoreNames.contains(RIDES_STORE)) {
                db.createObjectStore(RIDES_STORE, { keyPath: 'id' });
            }

            // Store for data chunks
            if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
                // We use a composite key [rideId, chunkIndex]
                db.createObjectStore(CHUNKS_STORE, { keyPath: ['rideId', 'chunkIndex'] });
            }
        };
    });
};

/**
 * Save or update a ride header
 */
export const saveRideHeader = async (ride: RideSession): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readwrite');
        const store = transaction.objectStore(RIDES_STORE);

        // Ensure we don't accidentally save large arrays in the header
        const header: RideSession = {
            ...ride,
            dataPoints: [], // Explicitly empty for header storage
            gpsUpdates: [], // Explicitly empty for header storage
        };

        const request = store.put(header);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

/**
 * Add a data chunk to the store
 */
export const addRideChunk = async (chunk: RideChunk): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
        const store = transaction.objectStore(CHUNKS_STORE);
        const request = store.add(chunk);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

/**
 * Get all chunks for a specific ride, ordered by chunkIndex
 */
export const getRideChunks = async (rideId: string): Promise<RideChunk[]> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readonly');
        const store = transaction.objectStore(CHUNKS_STORE);

        // Using a key range for the composite key [rideId, chunkIndex]
        const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);
        const request = store.getAll(range);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            // IndexedDB handles sorting of array keys automatically
            resolve(request.result);
        };
    });
};

/**
 * Get all ride headers
 */
export const getAllRides = async (): Promise<RideSession[]> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readonly');
        const store = transaction.objectStore(RIDES_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

/**
 * Get a single ride header
 */
export const getRideHeader = async (rideId: string): Promise<RideSession | null> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(RIDES_STORE, 'readonly');
        const store = transaction.objectStore(RIDES_STORE);
        const request = store.get(rideId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
    });
};

/**
 * Delete a ride and all its associated chunks
 */
export const deleteRideData = async (rideId: string): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([RIDES_STORE, CHUNKS_STORE], 'readwrite');

        // Delete header
        transaction.objectStore(RIDES_STORE).delete(rideId);

        // Delete chunks
        const chunksStore = transaction.objectStore(CHUNKS_STORE);
        const range = IDBKeyRange.bound([rideId, 0], [rideId, Infinity]);

        // Note: IDBObjectStore.delete(range) works in modern browsers
        chunksStore.delete(range);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

/**
 * Clear everything
 */
export const clearAllData = async (): Promise<void> => {
    const db = await openRideDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([RIDES_STORE, CHUNKS_STORE], 'readwrite');
        transaction.objectStore(RIDES_STORE).clear();
        transaction.objectStore(CHUNKS_STORE).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};
