import { supabase } from './supabaseClient.js';

const POLL_MS = 5000;
const SYNC_DEBOUNCE_MS = 250;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMakeup(item = {}) {
  const status = ['pending', 'planned', 'recovered', 'waived'].includes(item.status)
    ? item.status
    : 'pending';

  return {
    id: String(item.id || ''),
    originalEventId: String(item.originalEventId || ''),
    originalSeriesId: String(item.originalSeriesId || ''),
    originalTitle: String(item.originalTitle || 'Allenamento'),
    originalCategory: String(item.originalCategory || 'tennis'),
    originalDate: String(item.originalDate || ''),
    originalStartTime: String(item.originalStartTime || ''),
    originalEndTime: String(item.originalEndTime || ''),
    originalLocation: String(item.originalLocation || ''),
    originalSurface: String(item.originalSurface || ''),
    reason: String(item.reason || ''),
    notes: String(item.notes || ''),
    status,
    scheduledEventId: String(item.scheduledEventId || ''),
    scheduledDate: String(item.scheduledDate || ''),
    scheduledStartTime: String(item.scheduledStartTime || ''),
    scheduledEndTime: String(item.scheduledEndTime || ''),
    createdAt: String(item.createdAt || ''),
    updatedAt: String(item.updatedAt || ''),
    recoveredAt: String(item.recoveredAt || ''),
    waivedAt: String(item.waivedAt || ''),
  };
}

function normalizeMakeups(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeMakeup)
    .filter(item => item.id && item.originalDate)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function stableStringify(items) {
  return JSON.stringify(normalizeMakeups(items));
}

function rowToMakeup(row = {}) {
  const snapshot = row.original_snapshot && typeof row.original_snapshot === 'object'
    ? row.original_snapshot
    : {};

  return normalizeMakeup({
    id: row.id,
    originalEventId: row.original_event_id,
    originalSeriesId: row.original_series_id,
    originalTitle: snapshot.title,
    originalCategory: snapshot.category,
    originalDate: row.original_date,
    originalStartTime: snapshot.startTime,
    originalEndTime: snapshot.endTime,
    originalLocation: snapshot.location,
    originalSurface: snapshot.surface,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    scheduledEventId: row.scheduled_event_id,
    scheduledDate: row.scheduled_date,
    scheduledStartTime: row.scheduled_start_time ? String(row.scheduled_start_time).slice(0, 5) : '',
    scheduledEndTime: row.scheduled_end_time ? String(row.scheduled_end_time).slice(0, 5) : '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recoveredAt: row.recovered_at,
    waivedAt: row.waived_at,
  });
}

function makeupToRow(athleteId, item) {
  const makeup = normalizeMakeup(item);
  return {
    athlete_id: athleteId,
    id: makeup.id,
    original_event_id: makeup.originalEventId || null,
    original_series_id: makeup.originalSeriesId || null,
    original_date: makeup.originalDate,
    original_snapshot: {
      title: makeup.originalTitle,
      category: makeup.originalCategory,
      startTime: makeup.originalStartTime,
      endTime: makeup.originalEndTime,
      location: makeup.originalLocation,
      surface: makeup.originalSurface,
    },
    reason: makeup.reason || null,
    notes: makeup.notes || null,
    status: makeup.status,
    scheduled_event_id: makeup.scheduledEventId || null,
    scheduled_date: makeup.scheduledDate || null,
    scheduled_start_time: makeup.scheduledStartTime || null,
    scheduled_end_time: makeup.scheduledEndTime || null,
    recovered_at: makeup.recoveredAt || null,
    waived_at: makeup.waivedAt || null,
  };
}

async function fetchMakeups(athleteId) {
  const { data, error } = await supabase
    .from('calendar_makeups')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('original_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Impossibile leggere i recuperi dal cloud: ${error.message}`);
  }

  return normalizeMakeups((data || []).map(rowToMakeup));
}

async function upsertRows(athleteId, rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('calendar_makeups')
    .upsert(rows.map(item => makeupToRow(athleteId, item)), {
      onConflict: 'athlete_id,id',
    });

  if (error) {
    throw new Error(`Impossibile salvare i recuperi nel cloud: ${error.message}`);
  }
}

async function deleteRows(athleteId, ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('calendar_makeups')
    .delete()
    .eq('athlete_id', athleteId)
    .in('id', ids);

  if (error) {
    throw new Error(`Impossibile eliminare i recuperi dal cloud: ${error.message}`);
  }
}

function diffRows(previousItems = [], nextItems = []) {
  const previous = new Map(normalizeMakeups(previousItems).map(item => [item.id, item]));
  const next = new Map(normalizeMakeups(nextItems).map(item => [item.id, item]));
  const changed = [];
  const removed = [];

  next.forEach((item, id) => {
    const old = previous.get(id);
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) changed.push(item);
  });
  previous.forEach((_item, id) => {
    if (!next.has(id)) removed.push(id);
  });
  return { changed, removed };
}

function applyRemote(store, items, source = 'cloud') {
  const normalized = normalizeMakeups(items);
  const current = normalizeMakeups(store.getState().planner?.makeups || []);
  if (JSON.stringify(current) === JSON.stringify(normalized)) return false;

  store.update(state => {
    if (!state.planner || typeof state.planner !== 'object') state.planner = {};
    state.planner.makeups = clone(normalized);
    state.meta.calendarMakeupsCloudReceivedAt = new Date().toISOString();
    state.meta.calendarMakeupsCloudSource = source;
  });
  return true;
}

export async function loadCalendarMakeupsIntoStore({ store, athleteId }) {
  if (!athleteId) return [];
  const makeups = await fetchMakeups(athleteId);
  applyRemote(store, makeups, 'startup');
  return makeups;
}

export function startCalendarMakeupsCloudSync({
  store,
  athleteId,
  allowWrite = false,
} = {}) {
  if (!athleteId) return () => {};

  let baseline = normalizeMakeups(store.getState().planner?.makeups || []);
  let baselineSignature = stableStringify(baseline);
  let writeTimer = null;
  let running = false;
  let pending = null;
  let applyingRemote = false;
  let stopped = false;

  const flush = async () => {
    if (!allowWrite || stopped || running || !pending) return;
    running = true;
    const target = pending;
    pending = null;

    try {
      const { changed, removed } = diffRows(baseline, target);
      await upsertRows(athleteId, changed);
      await deleteRows(athleteId, removed);
      baseline = normalizeMakeups(target);
      baselineSignature = stableStringify(baseline);
    } catch (error) {
      console.warn('Calendar recoveries cloud sync failed.', error);
      pending = normalizeMakeups(store.getState().planner?.makeups || []);
    } finally {
      running = false;
      if (pending && !stopped) {
        window.clearTimeout(writeTimer);
        writeTimer = window.setTimeout(() => {
          writeTimer = null;
          void flush();
        }, 1500);
      }
    }
  };

  const queueLocal = items => {
    if (!allowWrite || stopped || applyingRemote) return;
    const next = normalizeMakeups(items);
    const signature = stableStringify(next);
    if (signature === baselineSignature && !pending) return;
    pending = next;
    window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => {
      writeTimer = null;
      void flush();
    }, SYNC_DEBOUNCE_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queueLocal(state.planner?.makeups || []);
  });

  const refresh = async () => {
    if (stopped || running || pending || document.visibilityState === 'hidden') return;
    try {
      const remote = await fetchMakeups(athleteId);
      const signature = stableStringify(remote);
      if (signature === baselineSignature) return;
      baseline = normalizeMakeups(remote);
      baselineSignature = signature;
      applyingRemote = true;
      applyRemote(store, remote, 'poll');
      applyingRemote = false;
    } catch (error) {
      console.warn('Calendar recoveries cloud refresh failed.', error);
    }
  };

  const onFocus = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  const pollTimer = window.setInterval(() => void refresh(), POLL_MS);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onFocus);
  document.addEventListener('visibilitychange', onFocus);

  return () => {
    stopped = true;
    window.clearTimeout(writeTimer);
    window.clearInterval(pollTimer);
    unsubscribe();
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  };
}
