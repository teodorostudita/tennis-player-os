/**
 * Persistence contract for Tennis Player OS structured data.
 *
 * UI modules never talk to localStorage, Supabase, Firebase, etc. directly.
 * They keep using the in-memory store; the store delegates persistence here.
 *
 * A future cloud/local-first provider can implement the same contract while
 * mapping the state to remote tables, queues or sync logic.
 */
export class DataProvider {
  constructor({ id = 'data-provider', label = 'Data provider', capabilities = {} } = {}) {
    this.id = id;
    this.label = label;
    this.capabilities = {
      local: false,
      cloud: false,
      sync: false,
      offline: false,
      ...capabilities,
    };
  }

  loadState() {
    throw new Error('DataProvider.loadState() must be implemented.');
  }

  saveState(_state) {
    throw new Error('DataProvider.saveState() must be implemented.');
  }

  clearState() {
    throw new Error('DataProvider.clearState() must be implemented.');
  }

  getInfo() {
    return {
      id: this.id,
      label: this.label,
      capabilities: { ...this.capabilities },
    };
  }
}
