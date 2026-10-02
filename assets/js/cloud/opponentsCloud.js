import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js?v=1.2.4';

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

function rowTime(row = {}) {
  const parsed = Date.parse(String(
    row.updatedAt
    || row.source?.lastCheckedAt
    || row.source?.importedAt
    || row.createdAt
    || '',
  ));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRows(localRows = [], cloudRows = [], keyFn) {
  const merged = new Map();
  for (const row of cloudRows || []) {
    const key = String(keyFn(row) || '').trim();
    if (key) merged.set(key, clone(row));
  }
  for (const row of localRows || []) {
    const key = String(keyFn(row) || '').trim();
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing || rowTime(row) >= rowTime(existing)) merged.set(key, clone(row));
  }
  return [...merged.values()];
}

function profileKey(row = {}) {
  return row?.id || row?.source?.externalId || String(row?.name || '').trim().toLowerCase();
}

function snapshotKey(row = {}) {
  return row?.id || `${row?.date || ''}|${row?.category || ''}|${row?.gender || ''}|${row?.scope || ''}`;
}

export function mergeOpponentsPayload(localPayload = {}, cloudPayload = {}) {
  const local = normalizeOpponentsPayload(localPayload);
  const cloud = normalizeOpponentsPayload(cloudPayload);
  return normalizeOpponentsPayload({
    ...local,
    ...cloud,
    rankings: {
      ...local.rankings,
      ...cloud.rankings,
      snapshots: mergeRows(
        local.rankings.snapshots,
        cloud.rankings.snapshots,
        snapshotKey,
      ),
    },
    profiles: mergeRows(local.profiles, cloud.profiles, profileKey),
  });
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
      const mergedOpponents = mergeOpponentsPayload(localOpponents, cloudOpponents);
      let resolvedCloudState = cloudState;

      if (
        allowWrite
        && fingerprint(mergedOpponents) !== fingerprint(cloudOpponents)
      ) {
        resolvedCloudState = await saveCloudModuleState({
          athleteId,
          moduleKey: MODULE_KEY,
          payload: mergedOpponents,
          schemaVersion: SCHEMA_VERSION,
        });
      }

      store.update(state => {
        state.opponents = clone(mergedOpponents);
        state.meta.opponentsCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: fingerprint(mergedOpponents) === fingerprint(cloudOpponents)
          ? 'cloud'
          : 'cloud-merged-local',
        opponents: mergedOpponents,
        cloudState: resolvedCloudState,
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
  let applyingMerged = false;

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
      let latest = await loadCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
      });
      let merged = mergeOpponentsPayload(payload, latest?.payload || {});
      let saved = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          saved = await saveCloudModuleState({
            athleteId,
            moduleKey: MODULE_KEY,
            payload: merged,
            schemaVersion: SCHEMA_VERSION,
            expectedRevision: latest?.revision || null,
          });
          break;
        } catch (error) {
          if (error?.code !== 'TPOS_MODULE_REVISION_CONFLICT' || attempt === 3) throw error;
          latest = await loadCloudModuleState({
            athleteId,
            moduleKey: MODULE_KEY,
          });
          merged = mergeOpponentsPayload(merged, latest?.payload || {});
        }
      }

      lastSavedFingerprint = fingerprint(saved?.payload || merged);

      const current = normalizeOpponentsPayload(store.getState().opponents);
      if (fingerprint(current) !== lastSavedFingerprint) {
        applyingMerged = true;
        store.update(state => {
          state.opponents = clone(saved?.payload || merged);
          state.meta.opponentsCloudReconciledAt = new Date().toISOString();
        });
        applyingMerged = false;
      }

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
    if (stopped || applyingMerged) return;

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
