import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const SAVE_DELAY_MS = 350;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function score(value, fallback = '') {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(5, Math.round(number)));
}

function normalizeReview(review = {}) {
  const source = review && typeof review === 'object' && !Array.isArray(review)
    ? review
    : {};

  return {
    story: {
      summary: clean(source.story?.summary),
      worked: clean(source.story?.worked),
      notWorked: clean(source.story?.notWorked),
      keyMoment: clean(source.story?.keyMoment),
      why: clean(source.story?.why),
    },
    plan: {
      adherence: clean(source.plan?.adherence),
      worked: clean(source.plan?.worked),
      wrong: clean(source.plan?.wrong),
      nextTime: clean(source.plan?.nextTime),
    },
    technical: {
      serve: score(source.technical?.serve),
      return: score(source.technical?.return),
      forehand: score(source.technical?.forehand),
      backhand: score(source.technical?.backhand),
      rally: score(source.technical?.rally),
      tactical: score(source.technical?.tactical),
      pressure: score(source.technical?.pressure),
      depth: score(source.technical?.depth),
      aggression: score(source.technical?.aggression),
      defense: score(source.technical?.defense),
    },
    mental: {
      focus: score(source.mental?.focus),
      confidence: score(source.mental?.confidence),
      regulation: score(source.mental?.regulation),
      bodyLanguage: score(source.mental?.bodyLanguage),
      resilience: score(source.mental?.resilience),
    },
    physical: {
      energy: score(source.physical?.energy),
      legs: score(source.physical?.legs),
      recovery: score(source.physical?.recovery),
      pain: score(source.physical?.pain),
      notes: clean(source.physical?.notes),
    },
    takeaways: {
      confirm: clean(source.takeaways?.confirm),
      improve: clean(source.takeaways?.improve),
      nextPriority: clean(source.takeaways?.nextPriority),
    },
    reviewedAt: clean(source.reviewedAt),
  };
}

export function normalizeMatchRecord(match = {}) {
  const source = match && typeof match === 'object' && !Array.isArray(match)
    ? match
    : {};

  return {
    id: clean(source.id),
    date: clean(source.date),
    opponentName: clean(source.opponentName),
    opponentProfileId: clean(source.opponentProfileId),
    opponentExternalId: clean(source.opponentExternalId),
    opponentUrl: clean(source.opponentUrl),
    opponentFitpRanking: clean(source.opponentFitpRanking),
    opponentCategory: clean(source.opponentCategory),
    tournament: clean(source.tournament),
    round: clean(source.round),
    surface: clean(source.surface),
    environment: clean(source.environment),
    matchType: clean(source.matchType) || 'official',
    result: clean(source.result).toUpperCase(),
    score: clean(source.score),
    durationMin: source.durationMin === '' || source.durationMin == null
      ? ''
      : Math.max(0, Number(source.durationMin) || 0),
    notes: clean(source.notes),
    tags: Array.isArray(source.tags)
      ? [...new Set(source.tags.map(clean).filter(Boolean))]
      : [],
    source: {
      provider: clean(source.source?.provider) || 'Manual',
      externalKey: clean(source.source?.externalKey),
      profileExternalId: clean(source.source?.profileExternalId),
      sourceUrl: clean(source.source?.sourceUrl),
      raw: clean(source.source?.raw),
      importedAt: clean(source.source?.importedAt),
      lastCheckedAt: clean(source.source?.lastCheckedAt),
    },
    review: normalizeReview(source.review),
    createdAt: clean(source.createdAt),
    updatedAt: clean(source.updatedAt),
  };
}

export function normalizeMatchPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const seen = new Set();
  const matches = [];

  for (const raw of Array.isArray(source.matches) ? source.matches : []) {
    const match = normalizeMatchRecord(raw);
    if (!match.id || seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
  }

  matches.sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );

  return {
    matches,
    settings: {
      defaultSurface: clean(source.settings?.defaultSurface),
      defaultEnvironment: clean(source.settings?.defaultEnvironment),
    },
  };
}

function fingerprint(payload) {
  return JSON.stringify(normalizeMatchPayload(payload));
}

export async function loadMatchModule({
  store,
  athleteId,
}) {
  const localPayload = normalizeMatchPayload(store.getState().competition);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: 'competition',
    });

    const payload = cloudState
      ? normalizeMatchPayload(cloudState.payload)
      : localPayload;

    store.update(state => {
      state.competition = clone(payload);
      state.meta.matchCloudLoadedAt = new Date().toISOString();
    });

    return {
      source: cloudState ? 'cloud' : 'local',
      payload,
      cloudState,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Match cloud load failed; using local cache.', cloudError);

    store.update(state => {
      state.competition = clone(localPayload);
    });

    return {
      source: 'local-fallback',
      payload: localPayload,
      cloudState: null,
      cloudError,
    };
  }
}

export function startMatchSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().competition);
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
        moduleKey: 'competition',
        payload,
        schemaVersion: 1,
      });

      lastSavedFingerprint = nextFingerprint;
      status('synced');
    } catch (error) {
      console.warn('Match cloud save failed; local cache retained.', error);
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

    const normalized = normalizeMatchPayload(payload);
    const nextFingerprint = fingerprint(normalized);

    if (nextFingerprint === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.competition);
  });

  const retryOnline = () => {
    if (!queuedPayload) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 50);
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
