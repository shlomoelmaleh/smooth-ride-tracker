import { RideSession } from '../types';

const DB_NAME = 'SmoothRideDB_v2';
const DB_VERSION = 1;
const STORE_INDEX = 'rides';
const STORE_DATA = 'ride_details';

/**
 * Open the IndexedDB database
 */
const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Lightweight Index Store
            if (!db.objectStoreNames.contains(STORE_INDEX)) {
                db.createObjectStore(STORE_INDEX, { keyPath: 'id' });
            }
            // Heavy Raw Data Store
            if (!db.objectStoreNames.contains(STORE_DATA)) {
                db.createObjectStore(STORE_DATA, { keyPath: 'id' });
            }
        };
    });
};

/**
 * Strips heavy data from a ride session to create a lightweight index entry.
 */
const stripToindex = (ride: RideSession): RideSession => {
    const { dataPoints, gpsUpdates, ...index } = ride;
    return {
        ...index,
        dataPoints: [], // Explicitly empty
        gpsUpdates: []   // Explicitly empty
    } as RideSession;
};

/**
 * Save a ride to IndexedDB - Dual Store Approach
 */
export const saveRideToDB = async (ride: RideSession): Promise<void> => {
    const db = await openDB();
    const indexRecord = stripToindex(ride);
    const dataRecord = {
        id: ride.id,
        dataPoints: ride.dataPoints || [],
        gpsUpdates: ride.gpsUpdates || []
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_INDEX, STORE_DATA], 'readwrite');

        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        const indexStore = transaction.objectStore(STORE_INDEX);
        const dataStore = transaction.objectStore(STORE_DATA);

        indexStore.put(indexRecord);
        dataStore.put(dataRecord);
    });
};

/**
 * Get all rides (lightweight indices) from IndexedDB
 */
export const getAllRidesFromDB = async (): Promise<RideSession[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_INDEX, 'readonly');
        const store = transaction.objectStore(STORE_INDEX);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

/**
 * Get full raw data for a specific ride
 */
export const getRideDataFromDB = async (id: string): Promise<{ dataPoints: any[], gpsUpdates: any[] } | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_DATA, 'readonly');
        const store = transaction.objectStore(STORE_DATA);
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
    });
};

/**
 * Delete a ride from both stores
 */
export const deleteRideFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_INDEX, STORE_DATA], 'readwrite');
        const indexStore = transaction.objectStore(STORE_INDEX);
        const dataStore = transaction.objectStore(STORE_DATA);

        indexStore.delete(id);
        dataStore.delete(id);

        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
    });
};

/**
 * Clear all records
 */
export const clearAllRidesFromDB = async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_INDEX, STORE_DATA], 'readwrite');
        const indexStore = transaction.objectStore(STORE_INDEX);
        const dataStore = transaction.objectStore(STORE_DATA);

        indexStore.clear();
        dataStore.clear();

        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
    });
};

/**
 * Migration helper: Move data from legacy stores to v2 dual-store
 */
export const migrateFromLocalStorage = async (): Promise<boolean> => {
    try {
        const storedData = localStorage.getItem('smartRideData');
        if (!storedData) return false;

        const legacyRides: RideSession[] = JSON.parse(storedData);
        if (!Array.isArray(legacyRides) || legacyRides.length === 0) return false;

        console.log(`Migrating ${legacyRides.length} rides from localStorage to IndexedDB v2...`);

        for (const ride of legacyRides) {
            await saveRideToDB(ride);
        }

        localStorage.setItem('smartRideData_migrated', 'true');
        return true;
    } catch (error) {
        console.error('Migration error:', error);
        return false;
    }
};
