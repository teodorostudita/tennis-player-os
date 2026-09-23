import {
  deleteCloudModuleState,
  loadCloudModuleState,
  saveCloudModuleState,
} from '../../cloud/moduleStateCloud.js';

/**
 * Generic local-first bridge for a single evolving module.
 *
 * v0.23.0 intentionally does not connect this provider to any production
 * module yet. v0.23.1 can inject module-specific local readers/writers without
 * changing the cloud schema.
 */
export class HybridModuleStateProvider {
  constructor({
    readLocal = null,
    writeLocal = null,
    clearLocal = null,
  } = {}) {
    this.readLocal = typeof readLocal === 'function' ? readLocal : null;
    this.writeLocal = typeof writeLocal === 'function' ? writeLocal : null;
    this.clearLocal = typeof clearLocal === 'function' ? clearLocal : null;
  }

  async load({
    athleteId,
    moduleKey,
    fallbackPayload = null,
  }) {
    try {
      const cloudState = await loadCloudModuleState({
        athleteId,
        moduleKey,
      });

      if (cloudState) {
        if (this.writeLocal) {
          this.writeLocal({
            athleteId,
            moduleKey,
            payload: cloudState.payload,
          });
        }

        return {
          source: 'cloud',
          payload: cloudState.payload,
          cloudState,
          cloudError: null,
        };
      }
    } catch (cloudError) {
      const localPayload = this.readLocal
        ? this.readLocal({ athleteId, moduleKey })
        : fallbackPayload;

      return {
        source: 'local-fallback',
        payload: localPayload ?? fallbackPayload,
        cloudState: null,
        cloudError,
      };
    }

    const localPayload = this.readLocal
      ? this.readLocal({ athleteId, moduleKey })
      : fallbackPayload;

    return {
      source: 'local',
      payload: localPayload ?? fallbackPayload,
      cloudState: null,
      cloudError: null,
    };
  }

  async save({
    athleteId,
    moduleKey,
    payload,
    schemaVersion = 1,
    expectedRevision = null,
  }) {
    if (this.writeLocal) {
      this.writeLocal({
        athleteId,
        moduleKey,
        payload,
      });
    }

    try {
      const cloudState = await saveCloudModuleState({
        athleteId,
        moduleKey,
        payload,
        schemaVersion,
        expectedRevision,
      });

      return {
        savedTo: 'cloud-and-local',
        cloudState,
        cloudError: null,
      };
    } catch (cloudError) {
      return {
        savedTo: 'local-only',
        cloudState: null,
        cloudError,
      };
    }
  }

  async clear({
    athleteId,
    moduleKey,
  }) {
    if (this.clearLocal) {
      this.clearLocal({ athleteId, moduleKey });
    }

    try {
      await deleteCloudModuleState({
        athleteId,
        moduleKey,
      });

      return {
        clearedFrom: 'cloud-and-local',
        cloudError: null,
      };
    } catch (cloudError) {
      return {
        clearedFrom: 'local-only',
        cloudError,
      };
    }
  }
}
