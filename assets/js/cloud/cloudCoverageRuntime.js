import '../bootstrap.js?v=1.2.6';

import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from './access.js?v=1.2.6';

import {
  loadCloudModuleState,
  saveCloudModuleState
} from './moduleStateCloud.js?v=1.2.6';

import { store } from '../data/store.js?v=1.2.6';
import { fileProvider } from '../data/providers/provider.js?v=1.2.6';

const SAVE_DELAY_MS = 350;
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 60000;
const REMOTE_REFRESH_MS = 3000;

const LIBRARY_MODULES = [
  'development',
  'training',
  'drills',
  'equipment',
  'health',
  'nutrition',
  'mental',
  'visual',
];

const MANAGED_SLICES = {
  drills: {
    schemaVersion: 1,
    normalize: normalizeDrills,
    meaningful: hasMeaningfulDrills,
    label: 'Drills',
  },
  nutrition: {
    schemaVersion: 4,
    normalize: normalizeNutritionCore,
    merge: mergeNutritionCore,
    meaningful: hasMeaningfulNutritionCore,
    applyState: applyNutritionCore,
    label: 'Nutrition',
  },
};

const BACKFILL_ONLY = {
  health: {
    schemaVersion: 3,
    meaningful: hasMeaningfulHealth,
  },
  mental: {
    schemaVersion: 4,
    meaningful: hasMeaningfulMental,
  },
  visual: {
    schemaVersion: 2,
    meaningful: hasMeaningfulVisual,
  },
  competition: {
    schemaVersion: 1,
    meaningful: hasMeaningfulCompetition,
  },
};

const statuses = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentRoute() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function mergeRows(localRows = [], cloudRows = [], keyForItem = item => item?.id || '') {
  const merged = [];
  const indexByKey = new Map();

  const addRows = rows => {
    for (const item of Array.isArray(rows) ? rows : []) {
      const key = String(keyForItem(item) ?? '').trim();

      if (!key) {
        merged.push(item);
        continue;
      }

      if (indexByKey.has(key)) {
        merged[indexByKey.get(key)] = item;
      } else {
        indexByKey.set(key, merged.length);
        merged.push(item);
      }
    }
  };

  addRows(localRows);
  addRows(cloudRows);
  return merged;
}

function normalizeDrills(payload = {}) {
  const source = normalizeObject(payload);
  const measurementSource = normalizeObject(source.measurements);

  return {
    ...source,
    library: Array.isArray(source.library) ? source.library : [],
    sessions: Array.isArray(source.sessions)
      ? source.sessions.map(session => ({
          ...session,
          items: Array.isArray(session?.items) ? session.items : [],
        }))
      : [],
    measurements: {
      ...measurementSource,
      protocols: Array.isArray(measurementSource.protocols)
        ? measurementSource.protocols
        : [],
      records: Array.isArray(measurementSource.records)
        ? measurementSource.records
        : [],
    },
  };
}

function hasMeaningfulDrills(payload = {}) {
  const drills = normalizeDrills(payload);

  return Boolean(
    drills.library.length
    || drills.sessions.length
    || drills.measurements.protocols.length
    || drills.measurements.records.length
  );
}

function normalizeNutritionCore(payload = {}) {
  const source = normalizeObject(payload);
  const planner = normalizeObject(source.planner);
  const guidance = normalizeObject(source.guidance);

  return {
    planner: {
      ...planner,
      entries: Array.isArray(planner.entries) ? planner.entries : [],
    },
    templates: Array.isArray(source.templates) ? source.templates : [],
    guidance: {
      general: String(guidance.general || ''),
      trainingDay: String(guidance.trainingDay || ''),
      matchDay: String(guidance.matchDay || ''),
      recoveryDay: String(guidance.recoveryDay || ''),
      hydration: String(guidance.hydration || ''),
    },
    checkinDefaults: normalizeObject(source.checkinDefaults),
  };
}

function mergeNutritionCore(localPayload = {}, cloudPayload = {}) {
  const local = normalizeNutritionCore(localPayload);
  const cloud = normalizeNutritionCore(cloudPayload);

  return normalizeNutritionCore({
    ...local,
    ...cloud,
    planner: {
      ...local.planner,
      ...cloud.planner,
      entries: mergeRows(
        local.planner.entries,
        cloud.planner.entries,
        item => item?.id || `${item?.date || ''}|${item?.time || ''}|${item?.title || ''}`,
      ),
    },
    templates: mergeRows(
      local.templates,
      cloud.templates,
      item => item?.id || item?.name || '',
    ),
    guidance: {
      ...local.guidance,
      ...cloud.guidance,
    },
    checkinDefaults: {
      ...local.checkinDefaults,
      ...cloud.checkinDefaults,
    },
  });
}

function hasMeaningfulNutritionCore(payload = {}) {
  const nutrition = normalizeNutritionCore(payload);

  return Boolean(
    nutrition.planner.entries.length
    || nutrition.templates.length
    || Object.keys(nutrition.checkinDefaults).length
    || Object.values(nutrition.guidance).some(value => String(value || '').trim())
  );
}

function applyNutritionCore(state, payload) {
  const current = normalizeObject(state.nutrition);
  const core = normalizeNutritionCore(payload);
  state.nutrition = {
    ...current,
    ...clone(core),
    recoveryLogs: Array.isArray(current.recoveryLogs) ? current.recoveryLogs : [],
    sleepLogs: Array.isArray(current.sleepLogs) ? current.sleepLogs : [],
    trainingCheckouts: Array.isArray(current.trainingCheckouts) ? current.trainingCheckouts : [],
  };
}

function applyModulePayload(state, moduleKey, payload, config) {
  if (typeof config?.applyState === 'function') {
    config.applyState(state, payload);
    return;
  }
  state[moduleKey] = clone(payload);
}

function hasMeaningfulHealth(payload = {}) {
  const health = normalizeObject(payload);
  const certificate = normalizeObject(health.certificate);
  const physio = normalizeObject(health.physio);
  const screening = normalizeObject(health.screening);
  const monitoring = normalizeObject(health.monitoring);

  const certificateFilled = Object.values(certificate)
    .some(value => String(value ?? '').trim());

  const physioFilled = Object.entries(physio)
    .some(([key, value]) => {
      if (key === 'sessions') return Array.isArray(value) && value.length > 0;
      if (typeof value === 'boolean') return value;
      return String(value ?? '').trim();
    });

  const screeningMeasurements = Object.values(
    normalizeObject(screening.measurements),
  ).some(protocol =>
    Object.values(normalizeObject(protocol))
      .some(series => Array.isArray(series) && series.length > 0)
  );

  return Boolean(
    certificateFilled
    || physioFilled
    || (Array.isArray(health.injuries) && health.injuries.length)
    || (Array.isArray(health.sorenessLogs) && health.sorenessLogs.length)
    || screeningMeasurements
    || (Array.isArray(monitoring.observations) && monitoring.observations.length)
  );
}

function hasMeaningfulMental(payload = {}) {
  const mental = normalizeObject(payload);
  const goals = normalizeObject(mental.goals);
  const skills = normalizeObject(mental.skills);

  const nonDefaultSkill = Object.values(skills).some(skill => {
    const normalized = normalizeObject(skill);
    const score = Number.isFinite(Number(normalized.scorePct))
      ? Number(normalized.scorePct)
      : Number(normalized.level || 3) * 20;
    return score !== 60
      || String(normalized.notes || '').trim();
  });

  return Boolean(
    nonDefaultSkill
    || Object.values(goals).some(value => String(value || '').trim())
    || (Array.isArray(mental.exercises) && mental.exercises.length)
    || (Array.isArray(mental.trainingSessions) && mental.trainingSessions.length)
    || (Array.isArray(mental.matchReviews) && mental.matchReviews.length)
  );
}

function hasMeaningfulVisual(payload = {}) {
  const visual = normalizeObject(payload);
  const measurements = normalizeObject(visual.measurements);

  const hasMeasurements = Object.values(measurements).some(protocol =>
    Object.values(normalizeObject(protocol))
      .some(series => Array.isArray(series) && series.length > 0)
  );

  return Boolean(
    hasMeasurements
    || (Array.isArray(visual.trainingSessions) && visual.trainingSessions.length)
  );
}

function hasMeaningfulCompetition(payload = {}) {
  const competition = normalizeObject(payload);
  const settings = normalizeObject(competition.settings);

  return Boolean(
    (Array.isArray(competition.matches) && competition.matches.length)
    || Object.values(settings).some(value => String(value || '').trim())
  );
}

function fingerprint(normalize, payload) {
  return JSON.stringify(normalize(payload));
}

function paintStatus(moduleKey, nextStatus) {
  statuses.set(moduleKey, nextStatus);

  if (currentRoute() !== moduleKey) return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  const config = MANAGED_SLICES[moduleKey];
  const label = config?.label || moduleKey;

  // The Recovery daily cloud owns the normal status while on Nutrition.
  // Suppress the generic Nutrition core success/readonly repaint so the
  // top-right indicator does not alternate every polling cycle.
  if (moduleKey === 'nutrition' && ['synced', 'readonly'].includes(nextStatus.status)) {
    return;
  }

  if (nextStatus.status === 'syncing') {
    indicator.textContent = `${label} → cloud…`;
    indicator.title = `Sincronizzazione ${label} con Supabase in corso.`;
    return;
  }

  if (nextStatus.status === 'error') {
    indicator.textContent = `${label} · cache locale`;
    indicator.title = nextStatus.message
      || `Il cloud ${label} non è raggiungibile; la copia locale resta disponibile.`;
    return;
  }

  if (nextStatus.status === 'readonly') {
    indicator.textContent = `${label} cloud · sola lettura`;
    indicator.title = `Questo account può leggere ${label} ma non modificarlo.`;
    return;
  }

  indicator.textContent = `${label} cloud ✓`;
  indicator.title = `${label} letto e salvato su Supabase; la copia locale resta come cache.`;
}

function dispatchCloudUpdate(moduleKey, source = 'remote') {
  window.dispatchEvent(new CustomEvent('tpos:module-cloud-updated', {
    detail: { moduleKey, source },
  }));
}

async function saveReconciledModuleState({
  athleteId,
  moduleKey,
  config,
  localPayload,
  cloudState = null,
  maxAttempts = 4,
}) {
  let candidate = config.normalize(localPayload);
  let latestCloudState = cloudState;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!latestCloudState) {
      latestCloudState = await loadCloudModuleState({ athleteId, moduleKey });
    }

    if (latestCloudState && config.merge) {
      candidate = config.merge(candidate, latestCloudState.payload);
    }

    try {
      const savedState = await saveCloudModuleState({
        athleteId,
        moduleKey,
        payload: candidate,
        schemaVersion: config.schemaVersion,
        expectedRevision: latestCloudState?.revision || null,
      });

      return {
        savedState,
        payload: config.normalize(savedState?.payload || candidate),
      };
    } catch (error) {
      if (error?.code !== 'TPOS_MODULE_REVISION_CONFLICT' || attempt === maxAttempts - 1) {
        throw error;
      }

      // Another device wrote the module after our last read. Reload the
      // newest row, merge again at record level, and retry instead of
      // overwriting that device's data with a whole-payload last-write-wins.
      latestCloudState = await loadCloudModuleState({ athleteId, moduleKey });
    }
  }

  throw new Error(`Impossibile riconciliare ${moduleKey} con il cloud.`);
}

async function loadManagedSlice(moduleKey) {
  const config = MANAGED_SLICES[moduleKey];
  if (!config || !canReadModule(moduleKey)) return null;

  const athleteId = getCurrentAccess().athleteId;
  const writable = canWriteModule(moduleKey);
  const localPayload = config.normalize(store.getState()[moduleKey]);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey,
    });

    if (cloudState) {
      const cloudPayload = config.normalize(cloudState.payload);
      let payload = writable && config.merge
        ? config.merge(localPayload, cloudPayload)
        : cloudPayload;
      let finalCloudState = cloudState;
      let source = 'cloud';

      const cloudFingerprint = fingerprint(config.normalize, cloudPayload);
      const mergedFingerprint = fingerprint(config.normalize, payload);

      if (writable && config.merge && mergedFingerprint !== cloudFingerprint) {
        const reconciled = await saveReconciledModuleState({
          athleteId,
          moduleKey,
          config,
          localPayload: payload,
          cloudState,
        });
        payload = reconciled.payload;
        finalCloudState = reconciled.savedState;
        source = 'cloud-merged-local';
        console.info(`TPOS ${config.label}: cronologia locale riconciliata con il cloud.`);
      }

      store.update(state => {
        applyModulePayload(state, moduleKey, payload, config);
        state.meta[`${moduleKey}CloudLoadedAt`] = new Date().toISOString();
        if (source === 'cloud-merged-local') {
          state.meta[`${moduleKey}CloudRecoveredAt`] = new Date().toISOString();
        }
      });

      paintStatus(
        moduleKey,
        writable
          ? { status: 'synced', message: '' }
          : { status: 'readonly', message: '' },
      );

      return {
        source,
        payload,
        cloudState: finalCloudState,
        cloudError: null,
      };
    }

    if (writable && config.meaningful(localPayload)) {
      const reconciled = await saveReconciledModuleState({
        athleteId,
        moduleKey,
        config,
        localPayload,
      });

      store.update(state => {
        applyModulePayload(state, moduleKey, reconciled.payload, config);
        state.meta[`${moduleKey}CloudMigratedAt`] = new Date().toISOString();
      });

      paintStatus(moduleKey, { status: 'synced', message: '' });

      return {
        source: 'local-migrated',
        payload: reconciled.payload,
        cloudState: reconciled.savedState,
        cloudError: null,
      };
    }

    paintStatus(
      moduleKey,
      writable
        ? { status: 'synced', message: '' }
        : { status: 'readonly', message: '' },
    );

    return {
      source: 'local',
      payload: localPayload,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn(`${config.label} cloud load failed; using local cache.`, cloudError);

    paintStatus(moduleKey, {
      status: 'error',
      message: cloudError?.message || '',
    });

    return {
      source: 'local-fallback',
      payload: localPayload,
      cloudState: null,
      cloudError,
    };
  }
}

function startManagedSliceSync(moduleKey, initialCloudState = null) {
  const config = MANAGED_SLICES[moduleKey];

  if (!config || !canReadModule(moduleKey)) return () => {};

  const athleteId = getCurrentAccess().athleteId;
  const writable = canWriteModule(moduleKey);
  let lastRemoteRevision = Number(initialCloudState?.revision || 0);
  let lastSavedFingerprint = initialCloudState
    ? fingerprint(config.normalize, initialCloudState.payload)
    : fingerprint(config.normalize, store.getState()[moduleKey]);
  let queuedPayload = null;
  let inFlight = false;
  let applyingRemote = false;
  let timer = null;
  let retryDelayMs = RETRY_MIN_MS;
  let stopped = false;

  const scheduleFlush = delay => {
    if (!writable) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  const flush = async () => {
    if (!writable || stopped || inFlight || !queuedPayload) return;

    const localPayload = queuedPayload;
    queuedPayload = null;

    const localFingerprint = fingerprint(config.normalize, localPayload);
    if (!config.merge && localFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    paintStatus(moduleKey, { status: 'syncing', message: '' });

    try {
      let savedState;
      let savedPayload;

      if (config.merge) {
        // Nutrition & Recovery is edited from multiple devices. Always read
        // the latest server row immediately before saving, merge by record,
        // then update with optimistic concurrency. This prevents the iPhone
        // and Mac from alternately replacing each other's whole history.
        const reconciled = await saveReconciledModuleState({
          athleteId,
          moduleKey,
          config,
          localPayload,
        });
        savedState = reconciled.savedState;
        savedPayload = reconciled.payload;
      } else {
        savedState = await saveCloudModuleState({
          athleteId,
          moduleKey,
          payload: localPayload,
          schemaVersion: config.schemaVersion,
        });
        savedPayload = config.normalize(savedState?.payload || localPayload);
      }

      lastSavedFingerprint = fingerprint(config.normalize, savedPayload);
      lastRemoteRevision = Math.max(lastRemoteRevision, Number(savedState?.revision || 0));
      retryDelayMs = RETRY_MIN_MS;

      const currentPayload = config.normalize(store.getState()[moduleKey]);
      const currentFingerprint = fingerprint(config.normalize, currentPayload);
      if (currentFingerprint !== lastSavedFingerprint) {
        applyingRemote = true;
        store.update(state => {
          applyModulePayload(state, moduleKey, savedPayload, config);
          state.meta[`${moduleKey}CloudReceivedAt`] = new Date().toISOString();
        });
        applyingRemote = false;
        dispatchCloudUpdate(moduleKey, 'save-reconcile');
      }

      paintStatus(moduleKey, { status: 'synced', message: '' });
    } catch (error) {
      console.warn(`${config.label} cloud save failed; local cache retained.`, error);

      queuedPayload = localPayload;
      paintStatus(moduleKey, {
        status: 'error',
        message: error?.message || 'Salvataggio cloud non riuscito.',
      });

      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(RETRY_MAX_MS, retryDelayMs * 2);
    } finally {
      inFlight = false;

      if (
        queuedPayload
        && fingerprint(config.normalize, queuedPayload) !== lastSavedFingerprint
        && !timer
      ) {
        scheduleFlush(SAVE_DELAY_MS);
      }
    }
  };

  const queue = payload => {
    if (!writable || stopped || applyingRemote) return;

    const normalized = config.normalize(payload);
    const nextFingerprint = fingerprint(config.normalize, normalized);

    if (nextFingerprint === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    scheduleFlush(SAVE_DELAY_MS);
  };

  const applyRemote = cloudState => {
    if (stopped || !cloudState) return;

    const revision = Number(cloudState.revision || 0);
    const remotePayload = config.normalize(cloudState.payload);
    const currentPayload = config.normalize(store.getState()[moduleKey]);
    const remoteFingerprint = fingerprint(config.normalize, remotePayload);
    const currentFingerprint = fingerprint(config.normalize, currentPayload);

    if (!config.merge && revision && lastRemoteRevision && revision <= lastRemoteRevision) {
      return;
    }

    // For merge-aware modules we must compare content even when the revision
    // has already been seen: this is what lets a device contribute older
    // local-only records without discarding a newer record from another device.
    const nextPayload = config.merge
      ? config.merge(currentPayload, remotePayload)
      : remotePayload;
    const nextFingerprint = fingerprint(config.normalize, nextPayload);

    lastRemoteRevision = Math.max(lastRemoteRevision, revision);
    lastSavedFingerprint = remoteFingerprint;

    let changed = false;
    if (nextFingerprint !== currentFingerprint) {
      changed = true;
      applyingRemote = true;
      store.update(state => {
        applyModulePayload(state, moduleKey, nextPayload, config);
        state.meta[`${moduleKey}CloudReceivedAt`] = new Date().toISOString();
      });
      applyingRemote = false;
    }

    if (writable && config.merge && nextFingerprint !== remoteFingerprint) {
      queuedPayload = clone(nextPayload);
      scheduleFlush(50);
    }

    paintStatus(
      moduleKey,
      writable
        ? { status: 'synced', message: '' }
        : { status: 'readonly', message: '' },
    );

    if (changed) dispatchCloudUpdate(moduleKey, 'poll');
  };

  const refreshFromCloud = async () => {
    if (stopped || document.visibilityState === 'hidden') return;

    try {
      const cloudState = await loadCloudModuleState({ athleteId, moduleKey });
      if (cloudState) applyRemote(cloudState);
    } catch (error) {
      console.warn(`${config.label} cloud refresh failed.`, error);
    }
  };

  const unsubscribeStore = writable
    ? store.subscribe(state => queue(state[moduleKey]))
    : () => {};

  const retryOnline = () => {
    retryDelayMs = RETRY_MIN_MS;
    if (queuedPayload) scheduleFlush(50);
    void refreshFromCloud();
  };

  const refreshOnFocus = () => {
    if (document.visibilityState === 'visible') void refreshFromCloud();
  };

  const pollingTimer = window.setInterval(() => {
    void refreshFromCloud();
  }, REMOTE_REFRESH_MS);

  window.addEventListener('online', retryOnline);
  window.addEventListener('focus', refreshOnFocus);
  document.addEventListener('visibilitychange', refreshOnFocus);

  paintStatus(
    moduleKey,
    writable
      ? { status: 'synced', message: '' }
      : { status: 'readonly', message: '' },
  );

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearInterval(pollingTimer);
    unsubscribeStore();
    window.removeEventListener('online', retryOnline);
    window.removeEventListener('focus', refreshOnFocus);
    document.removeEventListener('visibilitychange', refreshOnFocus);
  };
}

async function backfillExistingGenericModule(moduleKey, config) {
  if (
    !canReadModule(moduleKey)
    || !canWriteModule(moduleKey)
    || !config?.meaningful(store.getState()[moduleKey])
  ) {
    return;
  }

  try {
    const existing = await loadCloudModuleState({
      athleteId: getCurrentAccess().athleteId,
      moduleKey,
    });

    if (existing) return;

    await saveCloudModuleState({
      athleteId: getCurrentAccess().athleteId,
      moduleKey,
      payload: clone(store.getState()[moduleKey] || {}),
      schemaVersion: config.schemaVersion,
    });

    console.info(`TPOS cloud backfill completed: ${moduleKey}`);
  } catch (error) {
    console.warn(`TPOS cloud backfill failed: ${moduleKey}`, error);
  }
}

async function migrateLocalLibrariesInBackground() {
  if (typeof fileProvider?.migrateAllResources !== 'function') return;

  try {
    const result = await fileProvider.migrateAllResources(LIBRARY_MODULES);

    if (result?.migrated) {
      console.info(
        `TPOS resource library cloud migration: ${result.migrated} resource(s) migrated.`,
      );
    }

    if (result?.failed) {
      console.warn(
        `TPOS resource library cloud migration: ${result.failed} resource(s) still local.`,
      );
    }
  } catch (error) {
    console.warn('TPOS resource library background migration failed.', error);
  }
}

async function start() {
  const access = getCurrentAccess();
  if (!access.athleteId) return;

  for (const moduleKey of Object.keys(MANAGED_SLICES)) {
    const result = await loadManagedSlice(moduleKey);

    if (!result?.cloudError) {
      startManagedSliceSync(moduleKey, result.cloudState);
    }
  }

  for (const [moduleKey, config] of Object.entries(BACKFILL_ONLY)) {
    await backfillExistingGenericModule(moduleKey, config);
  }

  if (['drills', 'nutrition'].includes(currentRoute())) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  window.setTimeout(() => {
    void migrateLocalLibrariesInBackground();
  }, 1200);
}

window.addEventListener('hashchange', () => {
  const status = statuses.get(currentRoute());
  if (status) paintStatus(currentRoute(), status);
});

try {
  await start();
} catch (error) {
  console.warn('TPOS full cloud coverage runtime failed.', error);
}
