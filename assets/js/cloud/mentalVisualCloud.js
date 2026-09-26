import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const SAVE_DELAY_MS = 350;

const MENTAL_SKILL_IDS = [
  'motivazione',
  'fiducia',
  'concentrazione',
  'regolazione',
  'resilienza',
  'immaginazione',
];

const REFLEXION_METRICS = [
  'Anticipation',
  'Eye-hand Coordination',
  'Mental Flexibility',
  'Reactive Inhibition',
  'Simple reaction time',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultMentalSkill() {
  return { level: 3, notes: '' };
}

export function normalizeMentalPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const sourceSkills = source.skills && typeof source.skills === 'object'
    ? source.skills
    : {};

  const skills = {};
  for (const id of MENTAL_SKILL_IDS) {
    const skill = sourceSkills[id] && typeof sourceSkills[id] === 'object'
      ? sourceSkills[id]
      : {};
    skills[id] = {
      level: Math.max(1, Math.min(5, Number(skill.level || 3))),
      notes: String(skill.notes || ''),
    };
  }

  return {
    skills,
    goals: {
      bronze: String(source.goals?.bronze || ''),
      silver: String(source.goals?.silver || ''),
      gold: String(source.goals?.gold || ''),
    },
    trainingSessions: Array.isArray(source.trainingSessions)
      ? source.trainingSessions
      : [],
    matchReviews: Array.isArray(source.matchReviews)
      ? source.matchReviews
      : [],
  };
}

export function normalizeVisualPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const sourceReflexion = source.reflexion
    && typeof source.reflexion === 'object'
    && !Array.isArray(source.reflexion)
      ? source.reflexion
      : {};

  const reflexion = {};

  for (const metric of REFLEXION_METRICS) {
    const rows = Array.isArray(sourceReflexion[metric])
      ? sourceReflexion[metric]
      : [];

    reflexion[metric] = rows
      .map(row => ({
        date: String(row?.date || ''),
        value: Math.max(0, Math.min(100, Number(row?.value || 0))),
      }))
      .filter(row => row.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    trainingSessions: Array.isArray(source.trainingSessions)
      ? source.trainingSessions
      : [],
    reflexion,
  };
}

function normalizeByModule(moduleKey, payload) {
  if (moduleKey === 'mental') return normalizeMentalPayload(payload);
  if (moduleKey === 'visual') return normalizeVisualPayload(payload);
  throw new Error(`Modulo non supportato: ${moduleKey}`);
}

function fingerprint(moduleKey, payload) {
  return JSON.stringify(normalizeByModule(moduleKey, payload));
}

export async function loadStructuredPerformanceModule({
  store,
  athleteId,
  moduleKey,
}) {
  const localPayload = normalizeByModule(
    moduleKey,
    store.getState()[moduleKey],
  );

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey,
    });

    const payload = cloudState
      ? normalizeByModule(moduleKey, cloudState.payload)
      : localPayload;

    store.update(state => {
      state[moduleKey] = clone(payload);
      state.meta[`${moduleKey}CloudLoadedAt`] = new Date().toISOString();
    });

    return {
      source: cloudState ? 'cloud' : 'local',
      payload,
      cloudState,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn(`${moduleKey} cloud load failed; using local cache.`, cloudError);

    store.update(state => {
      state[moduleKey] = clone(localPayload);
    });

    return {
      source: 'local-fallback',
      payload: localPayload,
      cloudState: null,
      cloudError,
    };
  }
}

export function startStructuredPerformanceSync({
  store,
  athleteId,
  moduleKey,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(
    moduleKey,
    store.getState()[moduleKey],
  );
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

    const nextFingerprint = fingerprint(moduleKey, payload);

    if (nextFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    status('syncing');

    try {
      await saveCloudModuleState({
        athleteId,
        moduleKey,
        payload,
        schemaVersion: 1,
      });

      lastSavedFingerprint = nextFingerprint;
      status('synced');
    } catch (error) {
      console.warn(`${moduleKey} cloud save failed; local cache retained.`, error);
      queuedPayload = payload;
      status('error', error?.message || 'Salvataggio cloud non riuscito.');
    } finally {
      inFlight = false;

      if (
        queuedPayload
        && fingerprint(moduleKey, queuedPayload) !== lastSavedFingerprint
      ) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY_MS);
      }
    }
  };

  const queue = payload => {
    if (stopped) return;

    const normalized = normalizeByModule(moduleKey, payload);

    if (fingerprint(moduleKey, normalized) === lastSavedFingerprint) {
      return;
    }

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state[moduleKey]);
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

export { REFLEXION_METRICS };
