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

export const VISUAL_STARTER_PROTOCOLS = [
  {
    id: 'protocol-giocoleria-propriocezione',
    name: 'Giocoleria + propriocezione',
    domains: ['sensomotorio'],
    description: 'Giocoleria combinata con compiti propriocettivi, equilibrio e variazioni della base di appoggio.',
    metrics: [],
  },
  {
    id: 'protocol-inseguimento-palla',
    name: 'Inseguimento oculare su palla appesa',
    domains: ['funzione-visiva'],
    description: 'Seguire con lo sguardo una palla oscillante senza muovere la testa.',
    metrics: [],
  },
  {
    id: 'protocol-fuoco-distanze',
    name: 'Fuoco a distanze diverse',
    domains: ['funzione-visiva'],
    description: 'Alternare il fuoco tra oggetti vicini e lontani mantenendo nitidezza e controllo.',
    metrics: [],
  },
  {
    id: 'protocol-matita',
    name: 'Matita: accomodazione e convergenza',
    domains: ['funzione-visiva'],
    description: 'Avvicinare e allontanare una matita mantenendo il fuoco e controllando la convergenza.',
    metrics: [],
  },
  {
    id: 'protocol-periferica-pollici',
    name: 'Visione periferica con i pollici',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Mantenere il punto di fissazione mentre si rilevano stimoli progressivamente più periferici.',
    metrics: [],
  },
  {
    id: 'protocol-otto-orizzontale',
    name: 'Tracciamento a otto orizzontale',
    domains: ['funzione-visiva'],
    description: 'Seguire con lo sguardo una matita colorata che descrive un otto orizzontale.',
    metrics: [],
  },
  {
    id: 'protocol-vr-fissazione',
    name: 'VR · Fissazione',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per stabilità della fissazione.',
    metrics: [],
  },
  {
    id: 'protocol-vr-accomodazione',
    name: 'VR · Accomodazione',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per il cambio di fuoco e accomodazione.',
    metrics: [],
  },
  {
    id: 'protocol-vr-inseguimento',
    name: 'VR · Inseguimento visivo',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Protocollo in realtà virtuale per inseguimento e continuità visiva.',
    metrics: [],
  },
  {
    id: 'protocol-vr-convergenza',
    name: 'VR · Convergenza',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per la convergenza.',
    metrics: [],
  },
  {
    id: 'protocol-vr-stereoacuita',
    name: 'VR · Stereoacuità',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Protocollo in realtà virtuale per percezione stereoscopica della profondità.',
    metrics: [],
  },
];

export const REFLEXION_PRESET = {
  id: 'protocol-reflexion-go',
  name: 'Reflexion Go',
  domains: ['neurocognitivo', 'sensomotorio', 'percezione-anticipazione'],
  description: 'Protocollo neurocognitivo e visuomotorio. Le cinque misurazioni sono espresse in percentuale.',
  metrics: [
    { id: 'anticipation', name: 'Anticipation', unit: '%' },
    { id: 'eye-hand-coordination', name: 'Eye-hand Coordination', unit: '%' },
    { id: 'mental-flexibility', name: 'Mental Flexibility', unit: '%' },
    { id: 'reactive-inhibition', name: 'Reactive Inhibition', unit: '%' },
    { id: 'simple-reaction-time', name: 'Simple reaction time', unit: '%' },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeMetricId(name, index = 0) {
  const base = String(name || 'misurazione')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'misurazione';

  return `${base}${index ? `-${index + 1}` : ''}`;
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
      : defaultMentalSkill();

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

function normalizeProtocol(protocol, index = 0) {
  const source = protocol && typeof protocol === 'object'
    ? protocol
    : {};

  const metrics = Array.isArray(source.metrics)
    ? source.metrics
        .map((metric, metricIndex) => {
          const name = String(metric?.name || '').trim();
          if (!name) return null;

          return {
            id: String(metric?.id || makeMetricId(name, metricIndex)),
            name,
            unit: String(metric?.unit || '').trim(),
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: String(source.id || `protocol-${Date.now()}-${index}`),
    name: String(source.name || 'Protocollo').trim(),
    domains: Array.isArray(source.domains)
      ? [...new Set(source.domains.map(String))]
      : [],
    description: String(source.description || '').trim(),
    metrics,
  };
}

function normalizeMeasurementSeries(rows) {
  if (!Array.isArray(rows)) return [];

  const byDate = new Map();

  for (const row of rows) {
    const date = String(row?.date || '');
    if (!date) continue;

    const value = Number(row?.value);
    if (!Number.isFinite(value)) continue;

    byDate.set(date, { date, value });
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date));
}

function migrateLegacyReflexion(source, protocols, measurements) {
  const legacy = source.reflexion
    && typeof source.reflexion === 'object'
    && !Array.isArray(source.reflexion)
      ? source.reflexion
      : null;

  if (!legacy) return;

  const legacyNames = [
    'Anticipation',
    'Eye-hand Coordination',
    'Mental Flexibility',
    'Reactive Inhibition',
    'Simple reaction time',
  ];

  const hasAnyData = legacyNames.some(name =>
    Array.isArray(legacy[name]) && legacy[name].length,
  );

  if (!hasAnyData) return;

  let protocol = protocols.find(item =>
    item.id === REFLEXION_PRESET.id
    || item.name.toLowerCase() === REFLEXION_PRESET.name.toLowerCase(),
  );

  if (!protocol) {
    protocol = clone(REFLEXION_PRESET);
    protocols.push(protocol);
  }

  if (!measurements[protocol.id]) measurements[protocol.id] = {};

  for (const metric of REFLEXION_PRESET.metrics) {
    const rows = legacy[metric.name];

    if (!Array.isArray(rows) || !rows.length) continue;

    measurements[protocol.id][metric.id] = normalizeMeasurementSeries(rows);
  }
}

export function normalizeVisualPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const hasExplicitProtocols = Array.isArray(source.protocols);

  const protocols = hasExplicitProtocols
    ? source.protocols.map(normalizeProtocol)
    : VISUAL_STARTER_PROTOCOLS.map(item => clone(item));

  const measurements = {};

  if (
    source.measurements
    && typeof source.measurements === 'object'
    && !Array.isArray(source.measurements)
  ) {
    for (const protocol of protocols) {
      const protocolSource = source.measurements[protocol.id];

      if (
        !protocolSource
        || typeof protocolSource !== 'object'
        || Array.isArray(protocolSource)
      ) continue;

      measurements[protocol.id] = {};

      for (const metric of protocol.metrics) {
        measurements[protocol.id][metric.id] =
          normalizeMeasurementSeries(protocolSource[metric.id]);
      }
    }
  }

  migrateLegacyReflexion(source, protocols, measurements);

  return {
    protocols,
    trainingSessions: Array.isArray(source.trainingSessions)
      ? source.trainingSessions
      : [],
    measurements,
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
        schemaVersion: moduleKey === 'visual' ? 2 : 1,
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
