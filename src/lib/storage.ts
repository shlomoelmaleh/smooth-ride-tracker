import { RideSession } from '../types';

const DB_NAME = 'SmoothRideDB';
const DB_VERSION = 1;
const STORE_NAME = 'rides';

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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

/**
 * Save a ride to IndexedDB
 */
export const saveRideToDB = async (ride: RideSession): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(ride);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

/**
 * Get all rides from IndexedDB
 */
export const getAllRidesFromDB = async (): Promise<RideSession[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

/**
 * Delete a ride from IndexedDB
 */
export const deleteRideFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

/**
 * Clear all rides from IndexedDB
 */
export const clearAllRidesFromDB = async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

/**
 * Migration helper: Move data from localStorage to IndexedDB
 */
export const migrateFromLocalStorage = async (): Promise<boolean> => {
    try {
        const storedData = localStorage.getItem('smartRideData');
        if (!storedData) return false;

        const legacyRides: RideSession[] = JSON.parse(storedData);
        if (!Array.isArray(legacyRides) || legacyRides.length === 0) return false;

        console.log(`Migrating ${legacyRides.length} rides from localStorage to IndexedDB...`);

        for (const ride of legacyRides) {
            await saveRideToDB(ride);
        }

        // After successful migration, we don't clear localStorage immediately 
        // to be safe, but we mark it as migrated.
        localStorage.setItem('smartRideData_migrated', 'true');
        // localStorage.removeItem('smartRideData'); // Optional: clear it

        return true;
    } catch (error) {
        console.error('Migration error:', error);
        return false;
    }
};
