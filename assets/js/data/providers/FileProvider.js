/**
 * Persistence contract for binary resources and library links.
 * Implementations may use IndexedDB today and cloud object storage tomorrow.
 */
export class FileProvider {
  constructor({ id = 'file-provider', label = 'File provider', capabilities = {} } = {}) {
    this.id = id;
    this.label = label;
    this.capabilities = {
      local: false,
      cloud: false,
      offline: false,
      ...capabilities,
    };
  }

  async listResources(_moduleId) {
    throw new Error('FileProvider.listResources() must be implemented.');
  }

  async getResource(_id) {
    throw new Error('FileProvider.getResource() must be implemented.');
  }

  async putResource(_resource) {
    throw new Error('FileProvider.putResource() must be implemented.');
  }

  async deleteResource(_id) {
    throw new Error('FileProvider.deleteResource() must be implemented.');
  }

  getInfo() {
    return {
      id: this.id,
      label: this.label,
      capabilities: { ...this.capabilities },
    };
  }
}
