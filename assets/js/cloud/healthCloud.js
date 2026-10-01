import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const SAVE_DELAY_MS = 350;

export const SCREENING_STARTER_PROTOCOLS = [
  {
    id: 'screening-antropometria',
    name: 'Crescita e antropometria',
    description: 'Misure longitudinali semplici per seguire crescita e cambiamenti corporei.',
    metrics: [
      { id: 'altezza', name: 'Altezza', unit: 'cm' },
      { id: 'peso', name: 'Peso', unit: 'kg' },
    ],
  },
];

export const MONITORING_STARTER_METRICS = [
  { id: 'resting-heart-rate', name: 'Resting Heart Rate', unit: 'bpm' },
  { id: 'hrv', name: 'HRV', unit: 'ms' },
  { id: 'sleep-duration', name: 'Sleep Duration', unit: 'h' },
  { id: 'weight', name: 'Weight', unit: 'kg' },
];

const RTP_CHECKLIST = [
  { id: 'pain-free-rest', label: 'Assenza di dolore a riposo' },
  { id: 'full-rom', label: 'ROM funzionale adeguato' },
  { id: 'functional-test', label: 'Test funzionale completato' },
  { id: 'tennis-load', label: 'Carico tennis specifico tollerato' },
  { id: 'serve', label: 'Servizio / overhead tollerato se pertinente' },
  { id: 'match', label: 'Match / competizione tollerati' },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function numberOrBlank(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function normalizeMetric(metric, index = 0) {
  const name = text(metric?.name);
  if (!name) return null;

  return {
    id: text(metric?.id) || `metric-${index + 1}`,
    name,
    unit: text(metric?.unit),
  };
}

function normalizeProtocol(protocol, index = 0) {
  const metrics = Array.isArray(protocol?.metrics)
    ? protocol.metrics.map(normalizeMetric).filter(Boolean)
    : [];

  return {
    id: text(protocol?.id) || uid(`screening-${index + 1}`),
    name: text(protocol?.name) || 'Protocollo',
    description: text(protocol?.description),
    metrics,
  };
}

function normalizeSeries(rows) {
  if (!Array.isArray(rows)) return [];

  const byDate = new Map();

  for (const row of rows) {
    const date = text(row?.date);
    const value = Number(row?.value);

    if (!date || !Number.isFinite(value)) continue;

    byDate.set(date, { date, value });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeInjury(injury, index = 0) {
  const checklistSource = injury?.rtpChecklist && typeof injury.rtpChecklist === 'object'
    ? injury.rtpChecklist
    : {};

  const rtpChecklist = Object.fromEntries(
    RTP_CHECKLIST.map(item => [item.id, Boolean(checklistSource[item.id])]),
  );

  const timeline = Array.isArray(injury?.timeline)
    ? injury.timeline
        .map((item, itemIndex) => ({
          id: text(item?.id) || `update-${index + 1}-${itemIndex + 1}`,
          date: text(item?.date),
          title: text(item?.title),
          notes: text(item?.notes),
        }))
        .filter(item => item.date || item.title || item.notes)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    : [];

  return {
    id: text(injury?.id) || uid('injury'),
    onsetDate: text(injury?.onsetDate),
    bodyArea: text(injury?.bodyArea),
    mapArea: text(injury?.mapArea),
    districtKey: text(injury?.districtKey),
    view: text(injury?.view),
    customDistrict: text(injury?.customDistrict),
    subdistrict: text(injury?.subdistrict),
    tissueType: text(injury?.tissueType),
    side: text(injury?.side) || 'none',
    diagnosis: text(injury?.diagnosis),
    onsetType: text(injury?.onsetType) || 'progressive',
    status: text(injury?.status) || 'active',
    pain: Math.max(0, Math.min(10, Number(injury?.pain || 0))),
    restrictionLevel: text(injury?.restrictionLevel) || 'none',
    restrictions: text(injury?.restrictions),
    professional: text(injury?.professional),
    notes: text(injury?.notes),
    rtpStage: text(injury?.rtpStage) || 'protection',
    rtpChecklist,
    timeline,
    resolvedDate: text(injury?.resolvedDate),
  };
}

function normalizePhysioSession(session, index = 0) {
  return {
    id: text(session?.id) || `physio-${index + 1}`,
    date: text(session?.date),
    injuryId: text(session?.injuryId),
    summary: text(session?.summary),
    treatment: text(session?.treatment),
    recommendations: text(session?.recommendations),
  };
}

function normalizeMonitoringMetric(metric, index = 0) {
  const normalized = normalizeMetric(metric, index);
  if (!normalized) return null;

  return normalized;
}

function normalizeObservation(observation, index = 0) {
  return {
    id: text(observation?.id) || `observation-${index + 1}`,
    date: text(observation?.date),
    metricId: text(observation?.metricId),
    value: numberOrBlank(observation?.value),
    source: text(observation?.source) || 'Manual',
    notes: text(observation?.notes),
  };
}

function normalizeSorenessLocation(location = {}) {
  return {
    districtKey: text(location?.districtKey),
    view: text(location?.view),
    side: text(location?.side) || 'center',
  };
}

function normalizeSorenessLog(log, index = 0) {
  const locations = Array.isArray(log?.locations)
    ? log.locations
        .map(normalizeSorenessLocation)
        .filter(item => item.districtKey && item.view && item.side)
    : [];

  return {
    id: text(log?.id) || `soreness-${index + 1}`,
    date: text(log?.date),
    severity: Math.max(1, Math.min(5, Number(log?.severity || 1))),
    scope: text(log?.scope) === 'localized' ? 'localized' : 'general',
    locations,
    source: text(log?.source) || 'recovery-checkin',
    notes: text(log?.notes),
  };
}

export function normalizeHealthPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const certificate = source.certificate && typeof source.certificate === 'object'
    ? source.certificate
    : {};

  const physio = source.physio && typeof source.physio === 'object'
    ? source.physio
    : {};

  const screeningSource = source.screening && typeof source.screening === 'object'
    ? source.screening
    : {};

  const monitoringSource = source.monitoring && typeof source.monitoring === 'object'
    ? source.monitoring
    : {};

  const protocols = Array.isArray(screeningSource.protocols)
    ? screeningSource.protocols.map(normalizeProtocol)
    : SCREENING_STARTER_PROTOCOLS.map(clone);

  const measurements = {};

  if (
    screeningSource.measurements
    && typeof screeningSource.measurements === 'object'
    && !Array.isArray(screeningSource.measurements)
  ) {
    for (const protocol of protocols) {
      const protocolRows = screeningSource.measurements[protocol.id];

      if (!protocolRows || typeof protocolRows !== 'object' || Array.isArray(protocolRows)) {
        continue;
      }

      measurements[protocol.id] = {};

      for (const metric of protocol.metrics) {
        measurements[protocol.id][metric.id] = normalizeSeries(protocolRows[metric.id]);
      }
    }
  }

  const monitoringMetrics = Array.isArray(monitoringSource.metrics)
    ? monitoringSource.metrics.map(normalizeMonitoringMetric).filter(Boolean)
    : MONITORING_STARTER_METRICS.map(clone);

  const validMetricIds = new Set(monitoringMetrics.map(metric => metric.id));

  const observations = Array.isArray(monitoringSource.observations)
    ? monitoringSource.observations
        .map(normalizeObservation)
        .filter(item => item.date && item.metricId && item.value !== '' && validMetricIds.has(item.metricId))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    : [];

  return {
    certificate: {
      issueDate: text(certificate.issueDate),
      expiryDate: text(certificate.expiryDate),
      doctor: text(certificate.doctor),
      facility: text(certificate.facility),
      notes: text(certificate.notes),
    },
    physio: {
      name: text(physio.name),
      clinic: text(physio.clinic),
      contact: text(physio.contact),
      currentPlan: text(physio.currentPlan),
      restrictions: text(physio.restrictions),
      nextReview: text(physio.nextReview),
      notes: text(physio.notes),
      sessionLogEnabled: Boolean(physio.sessionLogEnabled),
      sessions: Array.isArray(physio.sessions)
        ? physio.sessions.map(normalizePhysioSession)
        : [],
    },
    injuries: Array.isArray(source.injuries)
      ? source.injuries.map(normalizeInjury)
      : [],
    sorenessLogs: Array.isArray(source.sorenessLogs)
      ? source.sorenessLogs
          .map(normalizeSorenessLog)
          .filter(item => item.date)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      : [],
    screening: {
      protocols,
      measurements,
    },
    monitoring: {
      metrics: monitoringMetrics,
      observations,
    },
  };
}

function fingerprint(payload) {
  return JSON.stringify(normalizeHealthPayload(payload));
}

export async function loadHealthModule({
  store,
  athleteId,
}) {
  const localPayload = normalizeHealthPayload(store.getState().health);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: 'health',
    });

    const payload = cloudState
      ? normalizeHealthPayload(cloudState.payload)
      : localPayload;

    store.update(state => {
      state.health = clone(payload);
      state.meta.healthCloudLoadedAt = new Date().toISOString();
    });

    return {
      source: cloudState ? 'cloud' : 'local',
      payload,
      cloudState,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('health cloud load failed; using local cache.', cloudError);

    store.update(state => {
      state.health = clone(localPayload);
    });

    return {
      source: 'local-fallback',
      payload: localPayload,
      cloudState: null,
      cloudError,
    };
  }
}

export function startHealthSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().health);
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
        moduleKey: 'health',
        payload,
        schemaVersion: 2,
      });

      lastSavedFingerprint = nextFingerprint;
      status('synced');
    } catch (error) {
      console.warn('health cloud save failed; local cache retained.', error);
      queuedPayload = payload;
      status('error', error?.message || 'Salvataggio cloud non riuscito.');
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

  const queue = payload => {
    if (stopped) return;

    const normalized = normalizeHealthPayload(payload);
    const nextFingerprint = fingerprint(normalized);

    if (nextFingerprint === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);

    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.health);
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

export { RTP_CHECKLIST };
