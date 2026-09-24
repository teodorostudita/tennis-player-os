import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const MODULE_KEY = 'opponents';
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeOpponentsPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const rankings = source.rankings
    && typeof source.rankings === 'object'
    && !Array.isArray(source.rankings)
      ? source.rankings
      : {};

  return {
    ...source,
    rankings: {
      ...rankings,
      snapshots: Array.isArray(rankings.snapshots) ? rankings.snapshots : [],
    },
    profiles: Array.isArray(source.profiles) ? source.profiles : [],
  };
}

export function hasMeaningfulOpponentsData(payload = {}) {
  const opponents = normalizeOpponentsPayload(payload);
  return Boolean(
    opponents.rankings.snapshots.length
    || opponents.profiles.length
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeOpponentsPayload(payload));
}

export async function loadOpponentsIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localOpponents = normalizeOpponentsPayload(store.getState().opponents);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: MODULE_KEY,
    });

    if (cloudState) {
      const cloudOpponents = normalizeOpponentsPayload(cloudState.payload);

      store.update(state => {
        state.opponents = clone(cloudOpponents);
        state.meta.opponentsCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: 'cloud',
        opponents: cloudOpponents,
        cloudState,
        cloudError: null,
      };
    }

    if (allowWrite && hasMeaningfulOpponentsData(localOpponents)) {
      const saved = await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload: localOpponents,
        schemaVersion: SCHEMA_VERSION,
      });

      store.update(state => {
        state.meta.opponentsCloudMigratedAt = new Date().toISOString();
      });

      return {
        source: 'local-migrated',
        opponents: localOpponents,
        cloudState: saved,
        cloudError: null,
      };
    }

    store.update(state => {
      state.opponents = clone(localOpponents);
    });

    return {
      source: 'local',
      opponents: localOpponents,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Opponents cloud load failed; using local cache.', cloudError);

    store.update(state => {
      state.opponents = clone(localOpponents);
    });

    return {
      source: 'local-fallback',
      opponents: localOpponents,
      cloudState: null,
      cloudError,
    };
  }
}

export function startOpponentsCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().opponents);
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
      console.warn('Opponents cloud save failed; local cache retained.', error);
      queuedPayload = payload;
      status(
        'error',
        error?.message || 'Salvataggio Opponents cloud non riuscito.',
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

  const queue = opponents => {
    if (stopped) return;

    const normalized = normalizeOpponentsPayload(opponents);
    if (fingerprint(normalized) === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.opponents);
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
