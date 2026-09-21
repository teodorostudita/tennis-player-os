import { STORAGE_KEY } from '../schema.js';
import { LocalStorageDataProvider } from './LocalStorageDataProvider.js';
import { IndexedDBFileProvider } from './IndexedDBFileProvider.js';

/**
 * Single composition point for persistence.
 *
 * Future cloud migration happens here: swap these adapters for a
 * SupabaseDataProvider / SupabaseFileProvider or a HybridDataProvider without
 * changing Calendar, Athletics, Drills, Nutrition, Equipment, etc.
 */
export const dataProvider = new LocalStorageDataProvider({
  key: STORAGE_KEY,
});

export const fileProvider = new IndexedDBFileProvider({
  dbName: 'tennisPlayerOS.resources.v1',
  dbVersion: 1,
  storeName: 'resources',
});
