import '../bootstrap.js';

import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from './access.js';

import {
  loadCloudModuleState,
  saveCloudModuleState
} from './moduleStateCloud.js';

import { store } from '../data/store.js';
import { fileProvider } from '../data/providers/provider.js';

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
    schemaVersion: 3,
    normalize: normalizeNutrition,
    merge: mergeNutrition,
    meaningful: hasMeaningfulNutrition,
    label: 'Nutrition & Recovery',
  },
};

const BACKFILL_ONLY = {
  health: {
    schemaVersion: 3,
    meaningful: hasMeaningfulHealth,
  },
  mental: {
    schemaVersion: 1,
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

function normalizeNutrition(payload = {}) {
  const source = normalizeObject(payload);
  const planner = normalizeObject(source.planner);
  const guidance = normalizeObject(source.guidance);

  return {
    ...source,
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
    sleepLogs: Array.isArray(source.sleepLogs) ? source.sleepLogs : [],
    recoveryLogs: Array.isArray(source.recoveryLogs) ? source.recoveryLogs : [],
    trainingCheckouts: Array.isArray(source.trainingCheckouts) ? source.trainingCheckouts : [],
    checkinDefaults: normalizeObject(source.checkinDefaults),
  };
}

function rowTimestamp(row = {}) {
  const value = row.updatedAt || row.updated_at || row.createdAt || row.created_at || '';
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRows(localRows = [], cloudRows = [], keyOf = item => item?.id || '') {
  const merged = new Map();

  for (const row of cloudRows) {
    const key = String(keyOf(row) || '');
    if (!key) continue;
    merged.set(key, clone(row));
  }

  for (const row of localRows) {
    const key = String(keyOf(row) || '');
    if (!key) continue;

    const cloudRow = merged.get(key);
    if (!cloudRow) {
      merged.set(key, clone(row));
      continue;
    }

    const localTime = rowTimestamp(row);
    const cloudTime = rowTimestamp(cloudRow);

    // If both copies carry timestamps, the newest edit wins. Legacy rows often
    // have no timestamp; in a same-key tie the cloud copy remains canonical.
    if (localTime > cloudTime) merged.set(key, clone(row));
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
}

function mergeNutrition(localPayload = {}, cloudPayload = {}) {
  const local = normalizeNutrition(localPayload);
  const cloud = normalizeNutrition(cloudPayload);

  return normalizeNutrition({
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
    sleepLogs: mergeRows(local.sleepLogs, cloud.sleepLogs, item => item?.date || item?.id || ''),
    recoveryLogs: mergeRows(local.recoveryLogs, cloud.recoveryLogs, item => item?.date || item?.id || ''),
    trainingCheckouts: mergeRows(
      local.trainingCheckouts,
      cloud.trainingCheckouts,
      item => item?.date || item?.id || '',
    ),
    checkinDefaults: {
      ...local.checkinDefaults,
      ...cloud.checkinDefaults,
    },
  });
}

function hasMeaningfulNutrition(payload = {}) {
  const nutrition = normalizeNutrition(payload);

  return Boolean(
    nutrition.planner.entries.length
    || nutrition.templates.length
    || nutrition.sleepLogs.length
    || nutrition.recoveryLogs.length
    || nutrition.trainingCheckouts.length
    || Object.keys(nutrition.checkinDefaults).length
    || Object.values(nutrition.guidance).some(value => String(value || '').trim())
  );
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
    return Number(normalized.level || 3) !== 3
      || String(normalized.notes || '').trim();
  });

  return Boolean(
    nonDefaultSkill
    || Object.values(goals).some(value => String(value || '').trim())
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
      const payload = writable && config.merge
        ? config.merge(localPayload, cloudPayload)
        : cloudPayload;
      const cloudFingerprint = fingerprint(config.normalize, cloudPayload);
      const mergedFingerprint = fingerprint(config.normalize, payload);
      let source = 'cloud';
      let finalCloudState = cloudState;

      // Recovery used to be partly local-only. Before replacing the local
      // cache, merge unique local records into the cloud once. This is the
      // recovery path for historical check-ins already present on a device.
      if (writable && mergedFingerprint !== cloudFingerprint) {
        finalCloudState = await saveCloudModuleState({
          athleteId,
          moduleKey,
          payload,
          schemaVersion: config.schemaVersion,
        });
        source = 'cloud-merged-local';
        console.info(`TPOS ${config.label}: local history merged into cloud.`);
      }

      store.update(state => {
        state[moduleKey] = clone(payload);
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
      const savedState = await saveCloudModuleState({
        athleteId,
        moduleKey,
        payload: localPayload,
        schemaVersion: config.schemaVersion,
      });

      store.update(state => {
        state.meta[`${moduleKey}CloudMigratedAt`] = new Date().toISOString();
      });

      paintStatus(moduleKey, { status: 'synced', message: '' });

      return {
        source: 'local-migrated',
        payload: localPayload,
        cloudState: savedState,
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

    const payload = queuedPayload;
    queuedPayload = null;

    const nextFingerprint = fingerprint(config.normalize, payload);
    if (nextFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    paintStatus(moduleKey, { status: 'syncing', message: '' });

    try {
      const savedState = await saveCloudModuleState({
        athleteId,
        moduleKey,
        payload,
        schemaVersion: config.schemaVersion,
      });

      lastSavedFingerprint = fingerprint(config.normalize, savedState?.payload || payload);
      lastRemoteRevision = Math.max(lastRemoteRevision, Number(savedState?.revision || 0));
      retryDelayMs = RETRY_MIN_MS;
      paintStatus(moduleKey, { status: 'synced', message: '' });
    } catch (error) {
      console.warn(`${config.label} cloud save failed; local cache retained.`, error);

      queuedPayload = payload;
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
    if (revision && lastRemoteRevision && revision <= lastRemoteRevision) return;

    const remotePayload = config.normalize(cloudState.payload);
    const currentPayload = config.normalize(store.getState()[moduleKey]);
    const hasPendingLocal = Boolean(queuedPayload) || inFlight;
    const nextPayload = hasPendingLocal && writable && config.merge
      ? config.merge(currentPayload, remotePayload)
      : remotePayload;

    const remoteFingerprint = fingerprint(config.normalize, remotePayload);
    const currentFingerprint = fingerprint(config.normalize, currentPayload);
    const nextFingerprint = fingerprint(config.normalize, nextPayload);

    lastRemoteRevision = Math.max(lastRemoteRevision, revision);
    lastSavedFingerprint = remoteFingerprint;

    let changed = false;
    if (nextFingerprint !== currentFingerprint) {
      changed = true;
      applyingRemote = true;
      store.update(state => {
        state[moduleKey] = clone(nextPayload);
        state.meta[`${moduleKey}CloudReceivedAt`] = new Date().toISOString();
      });
      applyingRemote = false;
    }

    if (hasPendingLocal && writable && nextFingerprint !== remoteFingerprint) {
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
