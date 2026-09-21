import { DataProvider } from './DataProvider.js';

/**
 * Current structured-data backend.
 * Keeps exactly the same localStorage key used by the legacy Store so existing
 * installations migrate transparently: no export/import is required.
 */
export class LocalStorageDataProvider extends DataProvider {
  constructor({ key }) {
    super({
      id: 'local-storage',
      label: 'Locale · localStorage',
      capabilities: { local: true, offline: true },
    });
    if (!key) throw new Error('LocalStorageDataProvider requires a storage key.');
    this.key = key;
  }

  loadState() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  saveState(state) {
    localStorage.setItem(this.key, JSON.stringify(state));
  }

  clearState() {
    localStorage.removeItem(this.key);
  }
}
