import { FileProvider } from './FileProvider.js';

/**
 * Current binary-resource backend.
 * Uses the same database/store names as the pre-provider implementation so
 * already uploaded files and links remain available.
 */
export class IndexedDBFileProvider extends FileProvider {
  constructor({ dbName, dbVersion = 1, storeName }) {
    super({
      id: 'indexed-db',
      label: 'Locale · IndexedDB',
      capabilities: { local: true, offline: true },
    });
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this.storeName = storeName;
  }

  openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('moduleId', 'moduleId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async listResources(moduleId) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const index = tx.objectStore(this.storeName).index('moduleId');
      const request = index.getAll(moduleId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  }

  async getResource(id) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  }

  async putResource(resource) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(resource);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  async deleteResource(id) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
}
