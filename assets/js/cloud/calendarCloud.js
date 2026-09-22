import { supabase } from './supabaseClient.js';

const VERIFY_PARAM = 'tpos_calendar_verify';
const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 400;
const SYNC_DEBOUNCE_MS = 250;

let syncStore = null;
let syncAthleteId = '';
let syncBaseline = null;
let syncBaselineSignature = '';
let syncPending = null;
let syncRunning = false;
let syncTimer = null;
let retryTimer = null;
let retryDelayMs = 5000;
let statusHandler = () => {};

function isLocalHost() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}

export function isCalendarVerificationRequested() {
  if (!isLocalHost()) return false;

  try {
    return new URL(window.location.href).searchParams.get(VERIFY_PARAM) === '1';
  } catch {
    return false;
  }
}

export function cleanCalendarVerificationUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(VERIFY_PARAM);
  return url.toString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePlanner(planner = {}) {
  return {
    people: Array.isArray(planner.people) ? planner.people : [],
    events: Array.isArray(planner.events) ? planner.events : [],
    tournaments: Array.isArray(planner.tournaments) ? planner.tournaments : [],
    recurringSeries: Array.isArray(planner.recurringSeries) ? planner.recurringSeries : [],
    locationDefaults:
      planner.locationDefaults && typeof planner.locationDefaults === 'object'
        ? planner.locationDefaults
        : {},
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sortById(items = []) {
  return [...items].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
}

function plannerSignature(planner) {
  return stableStringify(normalizePlanner(planner));
}

function shiftDateString(value, days) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return '';

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function recurrenceDates(series) {
  if (
    !series?.startDate
    || !series?.generatedThrough
    || series.active === false
  ) {
    return [];
  }

  const stepDays = Math.max(
    7,
    Math.min(364, Number(series.intervalWeeks || 1) * 7)
  );

  const dates = [];
  let value = series.startDate;
  let guard = 0;

  while (
    value
    && value <= series.generatedThrough
    && guard < 5000
  ) {
    dates.push(value);
    value = shiftDateString(value, stepDays);
    guard += 1;
  }

  return dates;
}

function exceptionKey(seriesId, date) {
  return `${seriesId}::${date}`;
}

function syntheticOccurrenceId(seriesId, date) {
  return `series-occ-${seriesId}-${date}`;
}

function reconstructPlanner({
  people,
  recurringSeries,
  materializedEvents,
  tournaments,
  locationDefaults,
  exceptions,
}) {
  const exceptionMap = new Map(
    exceptions.map(item => [
      exceptionKey(item.seriesId, item.date),
      item,
    ])
  );

  const generatedEvents = [];

  recurringSeries.forEach(series => {
    recurrenceDates(series).forEach(date => {
      const exception = exceptionMap.get(
        exceptionKey(series.id, date)
      );

      if (exception?.kind === 'skip') return;

      if (exception?.kind === 'override') {
        const payload =
          exception.payload && typeof exception.payload === 'object'
            ? exception.payload
            : {};

        generatedEvents.push({
          ...(series.template || {}),
          ...payload,
          id:
            payload.id
            || syntheticOccurrenceId(series.id, date),
          seriesId: series.id,
          date,
        });
        return;
      }

      generatedEvents.push({
        ...(series.template || {}),
        id: syntheticOccurrenceId(series.id, date),
        seriesId: series.id,
        date,
      });
    });
  });

  return normalizePlanner({
    people,
    recurringSeries,
    events: [
      ...materializedEvents,
      ...generatedEvents,
    ],
    tournaments,
    locationDefaults,
  });
}

function isExpectedOccurrenceDate(series, date) {
  if (
    !series?.startDate
    || !series?.generatedThrough
    || series.active === false
    || !date
    || date < series.startDate
    || date > series.generatedThrough
  ) {
    return false;
  }

  const start = new Date(`${series.startDate}T00:00:00`);
  const current = new Date(`${date}T00:00:00`);
  const diffDays = Math.round(
    (current - start) / 86400000
  );
  const stepDays = Math.max(
    7,
    Math.min(364, Number(series.intervalWeeks || 1) * 7)
  );

  return diffDays >= 0 && diffDays % stepDays === 0;
}

function recurringComparablePayload(event = {}) {
  const { id, seriesId, date, ...rest } = event;
  return rest;
}

function compactPlanner(plannerInput) {
  const planner = normalizePlanner(plannerInput);
  const seriesMap = new Map(
    planner.recurringSeries.map(series => [
      String(series.id),
      series,
    ])
  );

  const expectedEventMap = new Map();
  const materializedEvents = [];

  planner.events.forEach(event => {
    if (!event?.seriesId) {
      materializedEvents.push(event);
      return;
    }

    const series = seriesMap.get(String(event.seriesId));

    if (!series || !isExpectedOccurrenceDate(series, event.date)) {
      materializedEvents.push(event);
      return;
    }

    expectedEventMap.set(
      exceptionKey(event.seriesId, event.date),
      event
    );
  });

  const exceptions = [];

  planner.recurringSeries.forEach(series => {
    recurrenceDates(series).forEach(date => {
      const key = exceptionKey(series.id, date);
      const event = expectedEventMap.get(key);

      if (!event) {
        exceptions.push({
          id: key,
          seriesId: String(series.id),
          date,
          kind: 'skip',
          payload: {},
        });
        return;
      }

      if (
        stableStringify(recurringComparablePayload(event))
        !== stableStringify(
          recurringComparablePayload(series.template || {})
        )
      ) {
        exceptions.push({
          id: key,
          seriesId: String(series.id),
          date,
          kind: 'override',
          payload: event,
        });
      }
    });
  });

  return {
    people: planner.people,
    recurringSeries: planner.recurringSeries,
    materializedEvents,
    tournaments: planner.tournaments,
    locationDefaults: planner.locationDefaults,
    exceptions,
  };
}

function compactSignature(compact) {
  return stableStringify(compact);
}

function canonicalPeople(items = []) {
  return sortById(items).map(item => ({
    id: item?.id || '',
    name: item?.name || '',
    relationship: item?.relationship || '',
  }));
}

function canonicalSeries(items = []) {
  return sortById(items).map(item => ({
    id: item?.id || '',
    startDate: item?.startDate || '',
    intervalWeeks: Math.max(1, Math.min(52, Number(item?.intervalWeeks) || 1)),
    generatedThrough: item?.generatedThrough || '',
    active: item?.active !== false,
    template: item?.template && typeof item.template === 'object'
      ? item.template
      : {},
  }));
}

function eventSemanticKey(event = {}) {
  return event.seriesId
    ? `series:${event.seriesId}:${event.date || ''}`
    : `event:${event.id || ''}`;
}

function eventSemanticValue(event = {}) {
  if (!event.seriesId) return event;

  const { id, ...rest } = event;
  return rest;
}

function compareEvents(localItems = [], cloudItems = []) {
  const localMap = new Map(
    localItems.map(item => [eventSemanticKey(item), item])
  );
  const cloudMap = new Map(
    cloudItems.map(item => [eventSemanticKey(item), item])
  );

  const keys = [...new Set([...localMap.keys(), ...cloudMap.keys()])].sort();
  const mismatches = [];
  let matched = 0;

  keys.forEach(key => {
    const local = localMap.get(key);
    const cloud = cloudMap.get(key);

    if (!local || !cloud) {
      mismatches.push({
        id: key,
        reason: !local ? 'presente solo nel cloud' : 'presente solo in locale',
      });
      return;
    }

    if (
      stableStringify(eventSemanticValue(local))
      === stableStringify(eventSemanticValue(cloud))
    ) {
      matched += 1;
      return;
    }

    mismatches.push({ id: key, reason: 'contenuto differente' });
  });

  return {
    local: localMap.size,
    cloud: cloudMap.size,
    matched,
    mismatches,
    ok: mismatches.length === 0 && localMap.size === cloudMap.size,
  };
}

function compareById(localItems, cloudItems) {
  const localMap = new Map(
    (localItems || []).map(item => [String(item?.id || ''), item])
  );
  const cloudMap = new Map(
    (cloudItems || []).map(item => [String(item?.id || ''), item])
  );
  const ids = [...new Set([...localMap.keys(), ...cloudMap.keys()])].sort();

  const mismatches = [];
  let matched = 0;

  ids.forEach(id => {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);

    if (!local || !cloud) {
      mismatches.push({
        id,
        reason: !local ? 'presente solo nel cloud' : 'presente solo in locale',
      });
      return;
    }

    if (stableStringify(local) === stableStringify(cloud)) {
      matched += 1;
      return;
    }

    mismatches.push({ id, reason: 'contenuto differente' });
  });

  return {
    local: localMap.size,
    cloud: cloudMap.size,
    matched,
    mismatches,
    ok: mismatches.length === 0 && localMap.size === cloudMap.size,
  };
}

async function loadTable(table, columns, athleteId) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('athlete_id', athleteId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Impossibile leggere ${table} da Supabase: ${error.message}`);
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadExceptions(athleteId) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('calendar_series_exceptions')
      .select('athlete_id,series_id,occurrence_date,kind,payload')
      .eq('athlete_id', athleteId)
      .order('series_id', { ascending: true })
      .order('occurrence_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Impossibile leggere calendar_series_exceptions da Supabase: ${error.message}`
      );
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.map(row => ({
    id: exceptionKey(row.series_id, row.occurrence_date),
    seriesId: row.series_id,
    date: row.occurrence_date,
    kind: row.kind || 'skip',
    payload: row.payload || {},
  }));
}

async function loadSettings(athleteId) {
  const { data, error } = await supabase
    .from('calendar_settings')
    .select('athlete_id,location_defaults')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile leggere calendar_settings da Supabase: ${error.message}`
    );
  }

  return data || null;
}

function eventFromRow(row) {
  if (row?.extra && typeof row.extra === 'object' && row.extra.id) {
    return row.extra;
  }

  return {
    id: row.id,
    seriesId: row.series_id || '',
    title: row.title || '',
    date: row.event_date || '',
    category: row.category || 'personal',
    startTime: String(row.start_time || '').slice(0, 5),
    endTime: String(row.end_time || '').slice(0, 5),
    location: row.location || '',
    notes: row.notes || '',
    companionId: row.companion_id || '',
    responsibilities: { stay: row.companion_id || '' },
    nutritionTemplateId: row.nutrition_template_id || '',
    mealType: row.meal_type || '',
    mealDetails: row.meal_details || '',
  };
}

function tournamentFromRow(row) {
  if (row?.extra && typeof row.extra === 'object' && row.extra.id) {
    return row.extra;
  }

  return {
    id: row.id,
    name: row.name || '',
    circuit: row.circuit || '',
    ageCategory: row.age_category || '',
    startDate: row.start_date || '',
    endDate: row.end_date || row.start_date || '',
    location: row.location || '',
    surface: row.surface || '',
    priority: row.priority || '',
    status: row.status || '',
    registrationDeadline: row.registration_deadline || '',
    supportPersonId: row.support_person_id || '',
    notes: row.notes || '',
  };
}

async function loadCompactCalendarFromCloud(athleteId) {
  if (!athleteId) {
    throw new Error('Profilo atleta cloud non disponibile.');
  }

  const [
    peopleRows,
    seriesRows,
    eventRows,
    tournamentRows,
    settingsRow,
    exceptions,
  ] = await Promise.all([
    loadTable(
      'calendar_people',
      'athlete_id,id,name,relationship',
      athleteId
    ),
    loadTable(
      'calendar_recurring_series',
      'athlete_id,id,start_date,interval_weeks,generated_through,active,template',
      athleteId
    ),
    loadTable(
      'calendar_events',
      'athlete_id,id,series_id,title,event_date,category,start_time,end_time,location,notes,companion_id,nutrition_template_id,meal_type,meal_details,extra',
      athleteId
    ),
    loadTable(
      'calendar_tournaments',
      'athlete_id,id,name,circuit,age_category,start_date,end_date,location,surface,priority,status,registration_deadline,support_person_id,notes,extra',
      athleteId
    ),
    loadSettings(athleteId),
    loadExceptions(athleteId),
  ]);

  return {
    people: peopleRows.map(row => ({
      id: row.id,
      name: row.name || '',
      relationship: row.relationship || '',
    })),
    recurringSeries: seriesRows.map(row => ({
      id: row.id,
      startDate: row.start_date || '',
      intervalWeeks: row.interval_weeks,
      generatedThrough: row.generated_through || '',
      active: row.active !== false,
      template: row.template || {},
    })),
    materializedEvents: eventRows.map(eventFromRow),
    tournaments: tournamentRows.map(tournamentFromRow),
    locationDefaults: settingsRow?.location_defaults || {},
    exceptions,
  };
}

export async function loadCalendarFromCloud(athleteId) {
  const compact = await loadCompactCalendarFromCloud(athleteId);
  return reconstructPlanner(compact);
}

export async function loadCalendarIntoLocalStore({ store, athleteId }) {
  const planner = await loadCalendarFromCloud(athleteId);

  store.update(state => {
    state.planner = clone(planner);
    state.meta.calendarCloudLoadedAt = new Date().toISOString();
  });

  return planner;
}

function getCompanionId(event = {}) {
  return event.companionId
    || event.responsibilities?.stay
    || event.responsibilities?.dropoff
    || event.responsibilities?.pickup
    || '';
}

function rowForPerson(athleteId, person) {
  return {
    athlete_id: athleteId,
    id: String(person.id),
    name: person.name || '',
    relationship: person.relationship || null,
  };
}

function rowForSeries(athleteId, series) {
  return {
    athlete_id: athleteId,
    id: String(series.id),
    start_date: series.startDate,
    interval_weeks: Math.max(
      1,
      Math.min(52, Number(series.intervalWeeks) || 1)
    ),
    generated_through: series.generatedThrough || null,
    active: series.active !== false,
    template:
      series.template && typeof series.template === 'object'
        ? series.template
        : {},
  };
}

function rowForEvent(athleteId, event) {
  return {
    athlete_id: athleteId,
    id: String(event.id),
    series_id: event.seriesId || null,
    title: event.title || 'Attività',
    event_date: event.date,
    category: event.category || 'personal',
    start_time: event.startTime,
    end_time: event.endTime,
    location: event.location || null,
    notes: event.notes || null,
    companion_id: getCompanionId(event) || null,
    nutrition_template_id: event.nutritionTemplateId || null,
    meal_type: event.mealType || null,
    meal_details: event.mealDetails || null,
    extra: event,
  };
}

function rowForTournament(athleteId, tournament) {
  return {
    athlete_id: athleteId,
    id: String(tournament.id),
    name: tournament.name || 'Torneo',
    circuit: tournament.circuit || null,
    age_category: tournament.ageCategory || null,
    start_date: tournament.startDate,
    end_date: tournament.endDate || tournament.startDate,
    location: tournament.location || null,
    surface: tournament.surface || null,
    priority: tournament.priority || null,
    status: tournament.status || null,
    registration_deadline: tournament.registrationDeadline || null,
    support_person_id: tournament.supportPersonId || null,
    notes: tournament.notes || null,
    extra: tournament,
  };
}

function rowForException(athleteId, exception) {
  return {
    athlete_id: athleteId,
    series_id: exception.seriesId,
    occurrence_date: exception.date,
    kind: exception.kind || 'skip',
    payload: exception.payload || {},
  };
}

function changedAndRemoved(previousItems = [], nextItems = []) {
  const previous = new Map(
    previousItems.map(item => [String(item.id), item])
  );
  const next = new Map(
    nextItems.map(item => [String(item.id), item])
  );

  const changed = [];
  const removed = [];

  next.forEach((item, id) => {
    const old = previous.get(id);
    if (!old || stableStringify(old) !== stableStringify(item)) {
      changed.push(item);
    }
  });

  previous.forEach((_item, id) => {
    if (!next.has(id)) removed.push(id);
  });

  return { changed, removed };
}

function chunks(items, size = WRITE_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function upsertRows(table, rows, onConflict = 'athlete_id,id') {
  for (const batch of chunks(rows)) {
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict });

    if (error) {
      throw new Error(`Errore di salvataggio ${table}: ${error.message}`);
    }
  }
}

async function deleteRows(table, athleteId, ids) {
  for (const batch of chunks(ids)) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('athlete_id', athleteId)
      .in('id', batch);

    if (error) {
      throw new Error(`Errore di eliminazione ${table}: ${error.message}`);
    }
  }
}

async function syncCollection({
  table,
  athleteId,
  previousItems,
  nextItems,
  mapper,
}) {
  const { changed, removed } = changedAndRemoved(
    previousItems,
    nextItems
  );

  if (changed.length) {
    await upsertRows(
      table,
      changed.map(item => mapper(athleteId, item))
    );
  }

  if (removed.length) {
    await deleteRows(table, athleteId, removed);
  }
}

async function syncExceptions(
  athleteId,
  previousItems,
  nextItems
) {
  const { changed, removed } = changedAndRemoved(
    previousItems,
    nextItems
  );

  if (changed.length) {
    await upsertRows(
      'calendar_series_exceptions',
      changed.map(item => rowForException(athleteId, item)),
      'athlete_id,series_id,occurrence_date'
    );
  }

  for (const batch of chunks(removed)) {
    const parsed = batch.map(id => {
      const separator = id.indexOf('::');
      return {
        seriesId: id.slice(0, separator),
        date: id.slice(separator + 2),
      };
    });

    for (const item of parsed) {
      const { error } = await supabase
        .from('calendar_series_exceptions')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('series_id', item.seriesId)
        .eq('occurrence_date', item.date);

      if (error) {
        throw new Error(
          `Errore di eliminazione calendar_series_exceptions: ${error.message}`
        );
      }
    }
  }
}

async function syncPlannerDiff(
  previousPlanner,
  nextPlanner,
  athleteId
) {
  const previous = compactPlanner(previousPlanner);
  const next = compactPlanner(nextPlanner);

  await syncCollection({
    table: 'calendar_people',
    athleteId,
    previousItems: previous.people,
    nextItems: next.people,
    mapper: rowForPerson,
  });

  await syncCollection({
    table: 'calendar_recurring_series',
    athleteId,
    previousItems: previous.recurringSeries,
    nextItems: next.recurringSeries,
    mapper: rowForSeries,
  });

  await syncCollection({
    table: 'calendar_events',
    athleteId,
    previousItems: previous.materializedEvents,
    nextItems: next.materializedEvents,
    mapper: rowForEvent,
  });

  await syncCollection({
    table: 'calendar_tournaments',
    athleteId,
    previousItems: previous.tournaments,
    nextItems: next.tournaments,
    mapper: rowForTournament,
  });

  await syncExceptions(
    athleteId,
    previous.exceptions,
    next.exceptions
  );

  if (
    stableStringify(previous.locationDefaults)
    !== stableStringify(next.locationDefaults)
  ) {
    const { error } = await supabase
      .from('calendar_settings')
      .upsert(
        {
          athlete_id: athleteId,
          location_defaults: next.locationDefaults,
        },
        { onConflict: 'athlete_id' }
      );

    if (error) {
      throw new Error(
        `Errore di salvataggio calendar_settings: ${error.message}`
      );
    }
  }
}

function reportStatus(status, message = '') {
  try {
    statusHandler({ status, message });
  } catch (error) {
    console.warn('Calendar status handler failed:', error);
  }
}

function scheduleRetry() {
  if (retryTimer) return;

  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (syncPending) void runSyncLoop();
  }, retryDelayMs);

  retryDelayMs = Math.min(60000, retryDelayMs * 2);
}

async function runSyncLoop() {
  if (syncRunning || !syncPending || !syncAthleteId) return;
  syncRunning = true;

  try {
    while (syncPending) {
      const target = syncPending;
      syncPending = null;

      reportStatus('syncing');

      await syncPlannerDiff(
        syncBaseline,
        target,
        syncAthleteId
      );

      syncBaseline = clone(target);
      syncBaselineSignature = plannerSignature(syncBaseline);
      retryDelayMs = 5000;
      reportStatus('saved');
    }
  } catch (error) {
    console.error('Calendar cloud sync failed:', error);

    if (syncStore) {
      syncPending = clone(
        normalizePlanner(syncStore.getState()?.planner)
      );
    }

    reportStatus(
      'error',
      error?.message || 'Errore di sincronizzazione Calendar.'
    );
    scheduleRetry();
  } finally {
    syncRunning = false;
  }
}

function queuePlannerSnapshot(planner) {
  const next = clone(normalizePlanner(planner));
  const signature = plannerSignature(next);

  if (
    signature === syncBaselineSignature
    && !syncPending
  ) {
    return;
  }

  syncPending = next;
  void runSyncLoop();
}

export function startCalendarCloudSync({
  store,
  athleteId,
  initialPlanner,
  onStatus,
}) {
  syncStore = store;
  syncAthleteId = athleteId;
  syncBaseline = clone(normalizePlanner(initialPlanner));
  syncBaselineSignature = plannerSignature(syncBaseline);
  statusHandler =
    typeof onStatus === 'function' ? onStatus : () => {};

  if (syncTimer) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  if (retryTimer) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  store.subscribe(state => {
    if (syncTimer) window.clearTimeout(syncTimer);

    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      queuePlannerSnapshot(state?.planner);
    }, SYNC_DEBOUNCE_MS);
  });

  reportStatus('ready');
}

export async function verifyLocalCalendarAgainstCloud({
  store,
  athleteId,
}) {
  if (!isLocalHost()) {
    throw new Error(
      'La verifica Calendar può essere eseguita solo dall’app locale.'
    );
  }

  if (!athleteId) {
    throw new Error('Profilo atleta cloud non disponibile.');
  }

  const local = normalizePlanner(store.getState()?.planner);
  const cloud = await loadCalendarFromCloud(athleteId);

  const people = {
    ...compareById(
      canonicalPeople(local.people),
      canonicalPeople(cloud.people)
    ),
    label: 'Persone',
  };

  const recurringSeries = {
    ...compareById(
      canonicalSeries(local.recurringSeries),
      canonicalSeries(cloud.recurringSeries)
    ),
    label: 'Serie',
  };

  const events = {
    ...compareEvents(local.events, cloud.events),
    label: 'Attività',
  };

  const tournaments = {
    ...compareById(
      local.tournaments,
      cloud.tournaments
    ),
    label: 'Tornei',
  };

  const settingsOk =
    stableStringify(local.locationDefaults)
    === stableStringify(cloud.locationDefaults);

  const settings = {
    label: 'Impostazioni',
    local: 1,
    cloud: 1,
    matched: settingsOk ? 1 : 0,
    mismatches: settingsOk
      ? []
      : [{
          id: 'locationDefaults',
          reason: 'contenuto differente',
        }],
    ok: settingsOk,
  };

  const sections = [
    people,
    recurringSeries,
    events,
    tournaments,
    settings,
  ];

  const ok = sections.every(section => section.ok);

  return {
    ok,
    athleteId,
    sections,
    mismatchPreview: sections
      .flatMap(section =>
        section.mismatches
          .slice(0, 5)
          .map(item => ({
            section: section.label,
            ...item,
          }))
      )
      .slice(0, 12),
  };
}
