import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const MODULE_KEY = 'development';
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeItem(item = {}) {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? item
    : {};

  return {
    ...source,
    linkedDrillIds: Array.isArray(source.linkedDrillIds)
      ? source.linkedDrillIds.filter(Boolean)
      : [],
    metrics: Array.isArray(source.metrics) ? source.metrics : [],
    assessments: Array.isArray(source.assessments) ? source.assessments : [],
  };
}

export function normalizeDevelopmentPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  return {
    ...source,
    items: Array.isArray(source.items)
      ? source.items.map(normalizeItem)
      : [],
    measurementRecords: Array.isArray(source.measurementRecords)
      ? source.measurementRecords
      : [],
  };
}

export function hasMeaningfulDevelopmentData(payload = {}) {
  const development = normalizeDevelopmentPayload(payload);

  return Boolean(
    development.items.length
    || development.measurementRecords.length
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeDevelopmentPayload(payload));
}

export async function loadDevelopmentIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localDevelopment = normalizeDevelopmentPayload(
    store.getState().development,
  );

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: MODULE_KEY,
    });

    if (cloudState) {
      const cloudDevelopment = normalizeDevelopmentPayload(cloudState.payload);

      store.update(state => {
        state.development = clone(cloudDevelopment);
        state.meta.developmentCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: 'cloud',
        development: cloudDevelopment,
        cloudState,
        cloudError: null,
      };
    }

    if (allowWrite && hasMeaningfulDevelopmentData(localDevelopment)) {
      const saved = await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload: localDevelopment,
        schemaVersion: SCHEMA_VERSION,
      });

      store.update(state => {
        state.meta.developmentCloudMigratedAt = new Date().toISOString();
      });

      return {
        source: 'local-migrated',
        development: localDevelopment,
        cloudState: saved,
        cloudError: null,
      };
    }

    store.update(state => {
      state.development = clone(localDevelopment);
    });

    return {
      source: 'local',
      development: localDevelopment,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn(
      'Development cloud load failed; using local cache.',
      cloudError,
    );

    store.update(state => {
      state.development = clone(localDevelopment);
    });

    return {
      source: 'local-fallback',
      development: localDevelopment,
      cloudState: null,
      cloudError,
    };
  }
}

export function startDevelopmentCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().development);
  let timer = null;
  let inFlight = false;
  let queuedPayload = null;
  let stopped = false;

  const status = (value, message = '') => {
    onStatus?.({ status: value, message });
  };

  const flush = async () => {
    if (stopped || inFlight || !queuedPayload) return;

    const payload = queuedPayload;
    queuedPayload = null;

    const nextFingerprint = fingerprint(payload);
    if (nextFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    status('syncing');

    try {
      await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload,
        schemaVersion: SCHEMA_VERSION,
      });

      lastSavedFingerprint = nextFingerprint;
      status('synced');
    } catch (error) {
      console.warn(
        'Development cloud save failed; local cache retained.',
        error,
      );

      queuedPayload = payload;
      status(
        'error',
        error?.message || 'Salvataggio Development cloud non riuscito.',
      );
    } finally {
      inFlight = false;

      if (
        queuedPayload
        && fingerprint(queuedPayload) !== lastSavedFingerprint
      ) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY_MS);
      }
    }
  };

  const queue = development => {
    if (stopped) return;

    const normalized = normalizeDevelopmentPayload(development);
    if (fingerprint(normalized) === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.development);
  });

  const retryOnline = () => {
    if (!queuedPayload) return;

    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, 50);
  };

  window.addEventListener('online', retryOnline);
  status('synced');

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribe();
    window.removeEventListener('online', retryOnline);
  };
}
