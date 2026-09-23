import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const MODULE_KEY = 'training';
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeTrainingPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const weeklyProgram = source.weeklyProgram
    && typeof source.weeklyProgram === 'object'
    && !Array.isArray(source.weeklyProgram)
      ? source.weeklyProgram
      : {};

  const sessions = Array.isArray(weeklyProgram.sessions)
    ? weeklyProgram.sessions.map(session => ({
        ...session,
        blocks: Array.isArray(session?.blocks) ? session.blocks : [],
      }))
    : [];

  return {
    ...source,
    tests: Array.isArray(source.tests) ? source.tests : [],
    testResults: Array.isArray(source.testResults) ? source.testResults : [],
    weeklyProgram: {
      title: 'Programma settimanale',
      effectiveFrom: '',
      effectiveTo: '',
      notes: '',
      ...weeklyProgram,
      sessions,
    },
    goals: Array.isArray(source.goals) ? source.goals : [],
  };
}

export function hasMeaningfulTrainingData(payload = {}) {
  const training = normalizeTrainingPayload(payload);

  return Boolean(
    training.tests.length
    || training.testResults.length
    || training.goals.length
    || training.weeklyProgram.sessions.length
    || String(training.weeklyProgram.effectiveFrom || '').trim()
    || String(training.weeklyProgram.effectiveTo || '').trim()
    || String(training.weeklyProgram.notes || '').trim()
    || (
      String(training.weeklyProgram.title || '').trim()
      && String(training.weeklyProgram.title || '').trim() !== 'Programma settimanale'
    )
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeTrainingPayload(payload));
}

/**
 * Load Athletics from Supabase before the UI mounts.
 *
 * Migration rule:
 * - if a cloud row exists, cloud is authoritative and refreshes the local cache;
 * - if no cloud row exists and this browser has meaningful legacy local data,
 *   upload that data once;
 * - if Supabase is temporarily unavailable, keep the local cache so the app
 *   remains usable.
 */
export async function loadTrainingIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localTraining = normalizeTrainingPayload(store.getState().training);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: MODULE_KEY,
    });

    if (cloudState) {
      const cloudTraining = normalizeTrainingPayload(cloudState.payload);

      store.update(state => {
        state.training = clone(cloudTraining);
        state.meta.trainingCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: 'cloud',
        training: cloudTraining,
        cloudState,
        cloudError: null,
      };
    }

    if (allowWrite && hasMeaningfulTrainingData(localTraining)) {
      const saved = await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload: localTraining,
        schemaVersion: SCHEMA_VERSION,
      });

      store.update(state => {
        state.meta.trainingCloudMigratedAt = new Date().toISOString();
      });

      return {
        source: 'local-migrated',
        training: localTraining,
        cloudState: saved,
        cloudError: null,
      };
    }

    return {
      source: 'local',
      training: localTraining,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Athletics cloud load failed; using local cache.', cloudError);

    return {
      source: 'local-fallback',
      training: localTraining,
      cloudState: null,
      cloudError,
    };
  }
}

/**
 * Continuously mirrors the complete structured Athletics state to Supabase.
 * The localStorage copy remains a cache/fallback, not the source of truth.
 *
 * Payload includes tests, measurements, weekly programme (sessions + exercise
 * blocks), goals and any future fields added under state.training.
 */
export function startTrainingCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().training);
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
      console.warn('Athletics cloud save failed; local cache retained.', error);
      queuedPayload = payload;
      status('error', error?.message || 'Salvataggio Athletics cloud non riuscito.');
    } finally {
      inFlight = false;

      if (queuedPayload && fingerprint(queuedPayload) !== lastSavedFingerprint) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY_MS);
      }
    }
  };

  const queue = training => {
    if (stopped) return;

    const normalized = normalizeTrainingPayload(training);
    if (fingerprint(normalized) === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.training);
  });

  const retryOnline = () => {
    if (queuedPayload) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void flush();
      }, 50);
    }
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
