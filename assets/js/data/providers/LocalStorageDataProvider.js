import { DataProvider } from './DataProvider.js';

/**
 * Local structured-data backend.
 * The provider starts on the legacy key and can switch to an athlete-specific
 * key once the authenticated athlete has been selected.
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

  setKey(key) {
    if (!key) throw new Error('LocalStorageDataProvider requires a storage key.');
    this.key = key;
  }

  hasState(key = this.key) {
    return localStorage.getItem(key) != null;
  }

  loadStateFromKey(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  saveStateToKey(key, state) {
    localStorage.setItem(key, JSON.stringify(state));
  }

  loadState() {
    return this.loadStateFromKey(this.key);
  }

  saveState(state) {
    this.saveStateToKey(this.key, state);
  }

  clearState() {
    localStorage.removeItem(this.key);
  }
}
