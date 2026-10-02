import { supabase } from './supabaseClient.js?v=1.2.4';
import { loadCloudModuleState } from './moduleStateCloud.js?v=1.2.4';

const POLL_MS = 3000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dateKey(value = '') {
  return String(value || '').trim();
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalHoursFromTimes(bedtime, wakeTime) {
  const toMinutes = value => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  let start = toMinutes(bedtime);
  let end = toMinutes(wakeTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}

function combinedLocalCheckins(nutrition = {}) {
  const recoveryLogs = Array.isArray(nutrition.recoveryLogs) ? nutrition.recoveryLogs : [];
  const sleepLogs = Array.isArray(nutrition.sleepLogs) ? nutrition.sleepLogs : [];
  const dates = new Set([
    ...recoveryLogs.map(item => item?.date).filter(Boolean),
    ...sleepLogs.map(item => item?.date).filter(Boolean),
  ]);

  return [...dates].map(date => {
    const recovery = recoveryLogs.find(item => item?.date === date) || {};
    const sleep = sleepLogs.find(item => item?.date === date) || {};
    return {
      id: recovery.id || `recovery-${date}`,
      date,
      sleepHours: Number(recovery.sleepHours ?? sleep.sleepHours ?? decimalHoursFromTimes(sleep.bedtime, sleep.wakeTime) ?? 0),
      sleepQuality: Number(recovery.sleepQuality ?? sleep.quality ?? 0),
      fatigue: Number(recovery.fatigue || 0),
      soreness: Number(recovery.soreness || 0),
      sorenessScope: recovery.sorenessScope === 'localized' ? 'localized' : 'general',
      mood: Number(recovery.mood || 0),
      motivation: Number(recovery.motivation || 0),
      concentration: Number(recovery.concentration || 0),
      notes: String(recovery.notes || sleep.notes || '').trim(),
      updatedAt: recovery.updatedAt || sleep.updatedAt || '',
      deletedAt: '',
    };
  });
}

function localCheckouts(nutrition = {}) {
  return (Array.isArray(nutrition.trainingCheckouts) ? nutrition.trainingCheckouts : [])
    .filter(item => item?.date)
    .map(item => ({
      id: item.id || `checkout-${item.date}`,
      date: item.date,
      trained: item.trained !== false,
      quality: Number(item.quality || 0),
      notes: String(item.notes || '').trim(),
      updatedAt: item.updatedAt || '',
      deletedAt: '',
    }));
}

function mapCheckinRow(row) {
  return {
    id: `recovery-${row.log_date}`,
    date: row.log_date,
    sleepHours: Number(row.sleep_hours || 0),
    sleepQuality: Number(row.sleep_quality || 0),
    fatigue: Number(row.fatigue || 0),
    soreness: Number(row.soreness || 0),
    sorenessScope: row.soreness_scope === 'localized' ? 'localized' : 'general',
    mood: Number(row.mood || 0),
    motivation: Number(row.motivation || 0),
    concentration: Number(row.concentration || 0),
    notes: String(row.notes || ''),
    updatedAt: row.client_updated_at || row.updated_at || '',
    deletedAt: row.deleted_at || '',
    _cloudUpdatedAt: row.updated_at || '',
    _source: 'dedicated',
  };
}

function mapCheckoutRow(row) {
  return {
    id: `checkout-${row.log_date}`,
    date: row.log_date,
    trained: row.trained !== false,
    quality: Number(row.quality || 0),
    notes: String(row.notes || ''),
    updatedAt: row.client_updated_at || row.updated_at || '',
    deletedAt: row.deleted_at || '',
    _cloudUpdatedAt: row.updated_at || '',
    _source: 'dedicated',
  };
}

function eventTime(item = {}) {
  return Math.max(timestamp(item.deletedAt), timestamp(item.updatedAt), timestamp(item._cloudUpdatedAt));
}

function mergeEvents(sources = []) {
  const merged = new Map();
  sources.forEach((rows, sourceIndex) => {
    (rows || []).forEach(item => {
      const key = dateKey(item?.date);
      if (!key) return;
      const candidate = { ...clone(item), _rank: sourceIndex };
      const current = merged.get(key);
      if (!current) {
        merged.set(key, candidate);
        return;
      }
      const a = eventTime(candidate);
      const b = eventTime(current);
      if (a > b || (a === b && candidate._rank >= current._rank)) {
        merged.set(key, candidate);
      }
    });
  });
  return [...merged.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function cleanClientRows(events) {
  return events
    .filter(item => !item.deletedAt)
    .map(item => {
      const clean = { ...item };
      delete clean._rank;
      delete clean._source;
      delete clean._cloudUpdatedAt;
      delete clean.deletedAt;
      return clean;
    });
}


function semanticCheckinRows(rows = []) {
  return [...rows]
    .filter(item => item?.date)
    .map(item => ({
      date: String(item.date),
      sleepHours: Number(item.sleepHours || 0),
      sleepQuality: Number(item.sleepQuality || 0),
      fatigue: Number(item.fatigue || 0),
      soreness: Number(item.soreness || 0),
      sorenessScope: item.sorenessScope === 'localized' ? 'localized' : 'general',
      mood: Number(item.mood || 0),
      motivation: Number(item.motivation || 0),
      concentration: Number(item.concentration || 0),
      notes: String(item.notes || '').trim(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function semanticCheckoutRows(rows = []) {
  return [...rows]
    .filter(item => item?.date)
    .map(item => ({
      date: String(item.date),
      trained: item.trained !== false,
      quality: Number(item.quality || 0),
      notes: String(item.notes || '').trim(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function checkinToRow(athleteId, item) {
  return {
    athlete_id: athleteId,
    log_date: item.date,
    sleep_hours: Number(item.sleepHours || 0) || null,
    sleep_quality: Number(item.sleepQuality || 0) || null,
    fatigue: Number(item.fatigue || 0) || null,
    soreness: Number(item.soreness || 0) || null,
    soreness_scope: item.sorenessScope === 'localized' ? 'localized' : 'general',
    mood: Number(item.mood || 0) || null,
    motivation: Number(item.motivation || 0) || null,
    concentration: Number(item.concentration || 0) || null,
    notes: String(item.notes || '').trim(),
    client_updated_at: item.updatedAt || new Date().toISOString(),
    deleted_at: null,
  };
}

function checkoutToRow(athleteId, item) {
  return {
    athlete_id: athleteId,
    log_date: item.date,
    trained: item.trained !== false,
    quality: item.trained === false ? null : (Number(item.quality || 0) || null),
    notes: String(item.notes || '').trim(),
    client_updated_at: item.updatedAt || new Date().toISOString(),
    deleted_at: null,
  };
}

async function fetchDedicated(athleteId) {
  const [checkinsResult, checkoutsResult] = await Promise.all([
    supabase
      .from('athlete_recovery_checkins')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('log_date', { ascending: true }),
    supabase
      .from('athlete_training_checkouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('log_date', { ascending: true }),
  ]);

  if (checkinsResult.error) throw new Error(`Recovery cloud: ${checkinsResult.error.message}`);
  if (checkoutsResult.error) throw new Error(`Checkout cloud: ${checkoutsResult.error.message}`);

  return {
    checkins: (checkinsResult.data || []).map(mapCheckinRow),
    checkouts: (checkoutsResult.data || []).map(mapCheckoutRow),
  };
}

async function upsertCheckins(athleteId, rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('athlete_recovery_checkins')
    .upsert(rows.map(item => checkinToRow(athleteId, item)), { onConflict: 'athlete_id,log_date' });
  if (error) throw new Error(`Recovery cloud: ${error.message}`);
}

async function upsertCheckouts(athleteId, rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('athlete_training_checkouts')
    .upsert(rows.map(item => checkoutToRow(athleteId, item)), { onConflict: 'athlete_id,log_date' });
  if (error) throw new Error(`Checkout cloud: ${error.message}`);
}

function applyRowsToStore(store, checkins, checkouts, source = 'cloud') {
  const current = store.getState().nutrition || {};
  const currentCheckins = combinedLocalCheckins(current);
  const currentCheckouts = localCheckouts(current);
  const nextCheckins = cleanClientRows(checkins);
  const nextCheckouts = cleanClientRows(checkouts);

  // Compare only user-visible Recovery data. Transport metadata such as IDs,
  // deletedAt and cloud timestamps must not trigger a store update every poll.
  const before = JSON.stringify({
    checkins: semanticCheckinRows(currentCheckins),
    checkouts: semanticCheckoutRows(currentCheckouts),
  });
  const after = JSON.stringify({
    checkins: semanticCheckinRows(nextCheckins),
    checkouts: semanticCheckoutRows(nextCheckouts),
  });
  if (before === after && !(current.sleepLogs || []).length) return false;

  store.update(state => {
    if (!state.nutrition || Array.isArray(state.nutrition)) state.nutrition = {};
    state.nutrition.recoveryLogs = clone(nextCheckins);
    state.nutrition.trainingCheckouts = clone(nextCheckouts);
    // v1.1.7 canonicalizes historical sleep-only rows into recoveryLogs.
    state.nutrition.sleepLogs = [];
    state.meta.recoveryDailyCloudReceivedAt = new Date().toISOString();
    state.meta.recoveryDailyCloudSource = source;
  });

  window.dispatchEvent(new CustomEvent('tpos:module-cloud-updated', {
    detail: { moduleKey: 'nutrition', source: `recovery-daily-${source}` },
  }));
  return true;
}

async function legacyNutritionCloud(athleteId) {
  try {
    const state = await loadCloudModuleState({ athleteId, moduleKey: 'nutrition' });
    return state?.payload || {};
  } catch (error) {
    console.warn('Legacy Nutrition cloud read failed during recovery migration.', error);
    return {};
  }
}

export async function loadRecoveryDailyIntoStore({ store, athleteId, allowWrite = false }) {
  const localNutrition = store.getState().nutrition || {};
  const [dedicated, legacy] = await Promise.all([
    fetchDedicated(athleteId),
    legacyNutritionCloud(athleteId),
  ]);

  const localCheckinRows = combinedLocalCheckins(localNutrition).map(item => ({ ...item, _source: 'local' }));
  const legacyCheckinRows = combinedLocalCheckins(legacy).map(item => ({ ...item, _source: 'legacy' }));
  const localCheckoutRows = localCheckouts(localNutrition).map(item => ({ ...item, _source: 'local' }));
  const legacyCheckoutRows = localCheckouts(legacy).map(item => ({ ...item, _source: 'legacy' }));

  let mergedCheckins = mergeEvents([legacyCheckinRows, localCheckinRows, dedicated.checkins]);
  let mergedCheckouts = mergeEvents([legacyCheckoutRows, localCheckoutRows, dedicated.checkouts]);

  if (allowWrite) {
    await upsertCheckins(athleteId, mergedCheckins.filter(item => !item.deletedAt));
    await upsertCheckouts(athleteId, mergedCheckouts.filter(item => !item.deletedAt));
    const canonical = await fetchDedicated(athleteId);
    mergedCheckins = mergeEvents([mergedCheckins, canonical.checkins]);
    mergedCheckouts = mergeEvents([mergedCheckouts, canonical.checkouts]);
  }

  applyRowsToStore(store, mergedCheckins, mergedCheckouts, 'startup');
  return { checkins: cleanClientRows(mergedCheckins), checkouts: cleanClientRows(mergedCheckouts) };
}

export async function saveRecoveryCheckinCloud({ athleteId, row }) {
  await upsertCheckins(athleteId, [{ ...row, deletedAt: '' }]);
}

export async function deleteRecoveryCheckinCloud({ athleteId, date }) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('athlete_recovery_checkins')
    .upsert({
      athlete_id: athleteId,
      log_date: date,
      soreness_scope: 'general',
      client_updated_at: now,
      deleted_at: now,
    }, { onConflict: 'athlete_id,log_date' });
  if (error) throw new Error(`Recovery cloud: ${error.message}`);
}

export async function saveTrainingCheckoutCloud({ athleteId, row }) {
  await upsertCheckouts(athleteId, [{ ...row, deletedAt: '' }]);
}

export async function deleteTrainingCheckoutCloud({ athleteId, date }) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('athlete_training_checkouts')
    .upsert({
      athlete_id: athleteId,
      log_date: date,
      trained: false,
      client_updated_at: now,
      deleted_at: now,
    }, { onConflict: 'athlete_id,log_date' });
  if (error) throw new Error(`Checkout cloud: ${error.message}`);
}

export function startRecoveryDailySync({ store, athleteId, allowWrite = false, onStatus = null } = {}) {
  let stopped = false;
  let refreshing = false;
  let lastStatusKey = '';

  const status = (value, message = '') => {
    const key = `${value}|${message}`;
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    onStatus?.({ status: value, message });
  };

  const refresh = async () => {
    if (stopped || refreshing || document.visibilityState === 'hidden') return;
    refreshing = true;
    try {
      const dedicated = await fetchDedicated(athleteId);
      let checkins = dedicated.checkins;
      let checkouts = dedicated.checkouts;

      const localNutrition = store.getState().nutrition || {};
      const localCheckinRows = combinedLocalCheckins(localNutrition).map(item => ({ ...item, _source: 'local' }));
      const localCheckoutRows = localCheckouts(localNutrition).map(item => ({ ...item, _source: 'local' }));
      const mergedCheckins = mergeEvents([localCheckinRows, dedicated.checkins]);
      const mergedCheckouts = mergeEvents([localCheckoutRows, dedicated.checkouts]);

      if (allowWrite) {
        const localWinsCheckins = mergedCheckins.filter(item => item._source === 'local' && !item.deletedAt);
        const localWinsCheckouts = mergedCheckouts.filter(item => item._source === 'local' && !item.deletedAt);
        if (localWinsCheckins.length) await upsertCheckins(athleteId, localWinsCheckins);
        if (localWinsCheckouts.length) await upsertCheckouts(athleteId, localWinsCheckouts);

        if (localWinsCheckins.length || localWinsCheckouts.length) {
          const canonical = await fetchDedicated(athleteId);
          checkins = canonical.checkins;
          checkouts = canonical.checkouts;
        } else {
          checkins = mergedCheckins;
          checkouts = mergedCheckouts;
        }
      } else {
        // Read-only staff accounts must not lose rescued/local history simply
        // because the dedicated cloud table is incomplete. Keep the visible
        // union locally; a writer account can materialise it later.
        checkins = mergedCheckins;
        checkouts = mergedCheckouts;
      }

      applyRowsToStore(store, checkins, checkouts, 'poll');
      status(allowWrite ? 'synced' : 'readonly');
    } catch (error) {
      console.warn('Recovery daily cloud refresh failed.', error);
      status('error', error?.message || 'Sincronizzazione Recovery non riuscita.');
    } finally {
      refreshing = false;
    }
  };

  const onFocus = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  const timer = window.setInterval(() => void refresh(), POLL_MS);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  window.addEventListener('online', onFocus);
  status(allowWrite ? 'synced' : 'readonly');

  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
    window.removeEventListener('online', onFocus);
  };
}
