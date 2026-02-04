import { GeneratedImage } from '../types';

const DB_NAME = 'catches-db';
const DB_VERSION = 1;
const STORE_NAME = 'generated-images';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

  return dbPromise;
};

export const saveImagesToCache = async (images: GeneratedImage[]): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing entries and add new ones
    store.clear();
    
    // Only cache successful or error images (not loading)
    const imagesToCache = images.filter(img => img.status === 'success' || img.status === 'error');
    
    for (const image of imagesToCache) {
      store.put(image);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.error('Failed to save images to cache:', e);
  }
};

export const loadImagesFromCache = async (): Promise<GeneratedImage[]> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const images = request.result as GeneratedImage[];
        // Sort by timestamp descending (newest first)
        images.sort((a, b) => b.timestamp - a.timestamp);
        resolve(images);
      };
      request.onerror = () => {
        console.error('Failed to load from cache:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('Failed to load images from cache:', e);
    return [];
  }
};

export const clearImageCache = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.error('Failed to clear cache:', e);
  }
};

