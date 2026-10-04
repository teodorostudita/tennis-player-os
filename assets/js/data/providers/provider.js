import { STORAGE_KEY } from '../schema.js?v=1.2.4';
import { LocalStorageDataProvider } from './LocalStorageDataProvider.js?v=1.2.4';
import { IndexedDBFileProvider } from './IndexedDBFileProvider.js?v=1.2.4';
import { SupabaseFileProvider } from './SupabaseFileProvider.js?v=1.2.15';

/**
 * Structured state keeps a local cache. Module-specific cloud synchronizers
 * remain authoritative for athlete data.
 */
export const dataProvider = new LocalStorageDataProvider({
  key: STORAGE_KEY,
});

const localResourceCache = new IndexedDBFileProvider({
  dbName: 'tennisPlayerOS.resources.v1',
  dbVersion: 1,
  storeName: 'resources',
});

/**
 * Resource libraries are cloud-first from v1.0.10.
 *
 * Existing IndexedDB resources are used as an offline queue/cache and are
 * migrated to Supabase Storage automatically once an authenticated writer
 * opens the app.
 */
export const fileProvider = new SupabaseFileProvider({
  bucket: 'tpos-resources',
  localFallback: localResourceCache,
});
