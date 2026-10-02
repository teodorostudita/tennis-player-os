import { STORAGE_KEY } from '../data/schema.js?v=1.2.4';

const RESCUE_MARKER = 'cacheRescueV124';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function athleteMatches(candidate = {}, current = {}, athleteId = '') {
  const candidateId = String(candidate?.athlete?.id || '');
  if (candidateId && athleteId && candidateId === athleteId) return true;

  const currentName = clean(`${current?.athlete?.firstName || ''} ${current?.athlete?.lastName || ''}`);
  const candidateName = clean(`${candidate?.athlete?.firstName || ''} ${candidate?.athlete?.lastName || ''}`);
  if (!currentName || !candidateName || currentName !== candidateName) return false;

  const currentBirth = String(current?.athlete?.birthDate || '');
  const candidateBirth = String(candidate?.athlete?.birthDate || '');
  if (currentBirth && candidateBirth && currentBirth !== candidateBirth) return false;

  return true;
}

function developmentScore(value = {}) {
  const source = object(value);
  return array(source.items).length * 10
    + array(source.workItems).length * 8
    + array(source.measurementRecords).length * 3;
}

function opponentsScore(value = {}) {
  const source = object(value);
  const rankings = object(source.rankings);
  return array(rankings.snapshots).length * 20 + array(source.profiles).length * 5;
}

function nutritionScore(value = {}) {
  const source = object(value);
  const guidance = object(source.guidance);
  return array(source.recoveryLogs).length * 10
    + array(source.sleepLogs).length * 10
    + array(source.trainingCheckouts).length * 8
    + array(source.templates).length * 5
    + array(object(source.planner).entries).length * 2
    + Object.values(guidance).filter(value => String(value || '').trim()).length;
}

function mergeByKey(sources, keyFn) {
  const map = new Map();
  for (const rows of sources) {
    for (const row of array(rows)) {
      const key = String(keyFn(row) || '').trim();
      if (!key) continue;
      map.set(key, clone(row));
    }
  }
  return [...map.values()];
}

function mergeDevelopment(current = {}, donors = []) {
  const base = object(current);
  const sources = donors.map(item => object(item?.development));
  return {
    ...clone(sources[0] || {}),
    ...clone(base),
    items: mergeByKey([...sources.map(x => x.items), base.items], row => row?.id || `${row?.type || ''}|${row?.title || ''}`),
    workItems: mergeByKey([...sources.map(x => x.workItems), base.workItems], row => row?.id || `${row?.type || ''}|${row?.title || ''}`),
    measurementRecords: mergeByKey([...sources.map(x => x.measurementRecords), base.measurementRecords], row => row?.id || `${row?.itemId || ''}|${row?.date || ''}`),
  };
}

function profileKey(row = {}) {
  return row?.id || row?.source?.externalId || clean(row?.name || '');
}

function snapshotKey(row = {}) {
  return row?.id || `${row?.date || ''}|${row?.category || ''}|${row?.gender || ''}|${row?.scope || ''}`;
}

function mergeOpponents(current = {}, donors = []) {
  const base = object(current);
  const sources = donors.map(item => object(item?.opponents));
  const rankingSources = sources.map(source => object(source.rankings));
  return {
    ...clone(sources[0] || {}),
    ...clone(base),
    rankings: {
      ...clone(rankingSources[0] || {}),
      ...clone(object(base.rankings)),
      snapshots: mergeByKey([...rankingSources.map(x => x.snapshots), object(base.rankings).snapshots], snapshotKey),
    },
    profiles: mergeByKey([...sources.map(x => x.profiles), base.profiles], profileKey),
  };
}

function mergeNutrition(current = {}, donors = []) {
  const base = object(current);
  const sources = donors.map(item => object(item?.nutrition));
  const plannerSources = sources.map(source => object(source.planner));
  const currentPlanner = object(base.planner);
  const guidance = {};

  for (const source of [...sources, base]) {
    for (const [key, value] of Object.entries(object(source.guidance))) {
      if (String(value || '').trim()) guidance[key] = value;
    }
  }

  return {
    ...clone(sources[0] || {}),
    ...clone(base),
    planner: {
      ...clone(plannerSources[0] || {}),
      ...clone(currentPlanner),
      entries: mergeByKey([...plannerSources.map(x => x.entries), currentPlanner.entries], row => row?.id || `${row?.date || ''}|${row?.time || ''}|${row?.title || ''}`),
    },
    templates: mergeByKey([...sources.map(x => x.templates), base.templates], row => row?.id || clean(row?.name || row?.title || '')),
    guidance,
    checkinDefaults: {
      ...sources.reduce((acc, source) => ({ ...acc, ...object(source.checkinDefaults) }), {}),
      ...object(base.checkinDefaults),
    },
    sleepLogs: mergeByKey([...sources.map(x => x.sleepLogs), base.sleepLogs], row => row?.date || row?.id),
    recoveryLogs: mergeByKey([...sources.map(x => x.recoveryLogs), base.recoveryLogs], row => row?.date || row?.id),
    trainingCheckouts: mergeByKey([...sources.map(x => x.trainingCheckouts), base.trainingCheckouts], row => row?.date || row?.id),
  };
}

function candidateStates(currentState, athleteId) {
  const candidates = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}.`))) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!athleteMatches(parsed, currentState, athleteId)) continue;
      candidates.push({ key, state: parsed });
    }
  } catch (error) {
    console.warn('TPOS cache rescue scan unavailable.', error);
  }
  return candidates;
}

export function rescueSameAthleteLocalCaches({ store, athleteId } = {}) {
  if (!store || !athleteId) return null;
  const current = store.getState();
  if (current?.meta?.[RESCUE_MARKER]) return current.meta[RESCUE_MARKER];

  const candidates = candidateStates(current, athleteId);
  if (!candidates.length) {
    const result = { at: new Date().toISOString(), candidates: 0, changed: false };
    store.update(state => { state.meta[RESCUE_MARKER] = result; });
    return result;
  }

  const donors = candidates.map(item => item.state);
  const currentDevelopmentScore = developmentScore(current.development);
  const donorDevelopmentScore = Math.max(0, ...donors.map(state => developmentScore(state.development)));
  const currentOpponentsScore = opponentsScore(current.opponents);
  const donorOpponentsScore = Math.max(0, ...donors.map(state => opponentsScore(state.opponents)));
  const currentNutritionScore = nutritionScore(current.nutrition);
  const donorNutritionScore = Math.max(0, ...donors.map(state => nutritionScore(state.nutrition)));

  const shouldDevelopment = donorDevelopmentScore > currentDevelopmentScore;
  const shouldOpponents = donorOpponentsScore > currentOpponentsScore;
  const shouldNutrition = donorNutritionScore > currentNutritionScore;

  const result = {
    at: new Date().toISOString(),
    candidates: candidates.length,
    changed: shouldDevelopment || shouldOpponents || shouldNutrition,
    development: { before: currentDevelopmentScore, donor: donorDevelopmentScore, rescued: shouldDevelopment },
    opponents: { before: currentOpponentsScore, donor: donorOpponentsScore, rescued: shouldOpponents },
    nutrition: { before: currentNutritionScore, donor: donorNutritionScore, rescued: shouldNutrition },
  };

  store.update(state => {
    if (shouldDevelopment) state.development = mergeDevelopment(state.development, donors);
    if (shouldOpponents) state.opponents = mergeOpponents(state.opponents, donors);
    if (shouldNutrition) state.nutrition = mergeNutrition(state.nutrition, donors);
    state.meta[RESCUE_MARKER] = result;
  });

  if (result.changed) {
    console.info('TPOS local cache rescue restored richer same-athlete data.', result);
  }
  return result;
}
