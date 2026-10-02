import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js?v=1.2.4';

const MODULE_KEY = 'development';
const SCHEMA_VERSION = 2;
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

function normalizeWorkItem(item = {}) {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? item
    : {};

  return {
    ...source,
    type: source.type === 'tactics' ? 'tactics' : 'technique',
    status: ['todo', 'active', 'paused', 'done'].includes(source.status)
      ? source.status
      : 'todo',
    priority: ['high', 'medium', 'low'].includes(source.priority)
      ? source.priority
      : 'medium',
    stage: ['learn', 'stabilize', 'adapt', 'match'].includes(source.stage)
      ? source.stage
      : 'learn',
    activityLog: Array.isArray(source.activityLog)
      ? source.activityLog.filter(entry => entry && typeof entry === 'object')
      : [],
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
    workItems: Array.isArray(source.workItems)
      ? source.workItems.map(normalizeWorkItem)
      : [],
  };
}

export function hasMeaningfulDevelopmentData(payload = {}) {
  const development = normalizeDevelopmentPayload(payload);

  return Boolean(
    development.items.length
    || development.measurementRecords.length
    || development.workItems.length
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeDevelopmentPayload(payload));
}

function rowTime(row = {}) {
  const parsed = Date.parse(String(row.updatedAt || row.createdAt || ''));
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

export function mergeDevelopmentPayload(localPayload = {}, cloudPayload = {}) {
  const local = normalizeDevelopmentPayload(localPayload);
  const cloud = normalizeDevelopmentPayload(cloudPayload);
  return normalizeDevelopmentPayload({
    ...local,
    ...cloud,
    items: mergeRows(
      local.items,
      cloud.items,
      row => row?.id || `${row?.type || ''}|${row?.title || ''}`,
    ),
    measurementRecords: mergeRows(
      local.measurementRecords,
      cloud.measurementRecords,
      row => row?.id || `${row?.itemId || ''}|${row?.date || ''}`,
    ),
    workItems: mergeRows(
      local.workItems,
      cloud.workItems,
      row => row?.id || `${row?.type || ''}|${row?.title || ''}`,
    ),
  });
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
      const mergedDevelopment = mergeDevelopmentPayload(
        localDevelopment,
        cloudDevelopment,
      );
      let resolvedCloudState = cloudState;

      // Never let an empty/older cloud blob erase richer local Development.
      // When this account can write, materialise the recovered union back to
      // Supabase so every account sees the same canonical dataset.
      if (
        allowWrite
        && fingerprint(mergedDevelopment) !== fingerprint(cloudDevelopment)
      ) {
        resolvedCloudState = await saveCloudModuleState({
          athleteId,
          moduleKey: MODULE_KEY,
          payload: mergedDevelopment,
          schemaVersion: SCHEMA_VERSION,
        });
      }

      store.update(state => {
        state.development = clone(mergedDevelopment);
        state.meta.developmentCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: fingerprint(mergedDevelopment) === fingerprint(cloudDevelopment)
          ? 'cloud'
          : 'cloud-merged-local',
        development: mergedDevelopment,
        cloudState: resolvedCloudState,
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
      let merged = mergeDevelopmentPayload(payload, latest?.payload || {});
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
          merged = mergeDevelopmentPayload(merged, latest?.payload || {});
        }
      }

      lastSavedFingerprint = fingerprint(saved?.payload || merged);

      const current = normalizeDevelopmentPayload(store.getState().development);
      if (fingerprint(current) !== lastSavedFingerprint) {
        applyingMerged = true;
        store.update(state => {
          state.development = clone(saved?.payload || merged);
          state.meta.developmentCloudReconciledAt = new Date().toISOString();
        });
        applyingMerged = false;
      }

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
    if (stopped || applyingMerged) return;

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
