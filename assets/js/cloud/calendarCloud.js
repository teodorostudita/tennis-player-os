import { supabase } from './supabaseClient.js';

const VERIFY_PARAM = 'tpos_calendar_verify';
const PAGE_SIZE = 1000;

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

function sortById(items = []) {
  return [...items].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
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
    template: item?.template && typeof item.template === 'object' ? item.template : {},
  }));
}

function compareById(localItems, cloudItems, localProject = value => value, cloudProject = value => value) {
  const localMap = new Map((localItems || []).map(item => [String(item?.id || ''), item]));
  const cloudMap = new Map((cloudItems || []).map(item => [String(item?.id || ''), item]));
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

    if (stableStringify(localProject(local)) === stableStringify(cloudProject(cloud))) {
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

async function loadSettings(athleteId) {
  const { data, error } = await supabase
    .from('calendar_settings')
    .select('athlete_id,location_defaults')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile leggere calendar_settings da Supabase: ${error.message}`);
  }

  return data || null;
}

export async function verifyLocalCalendarAgainstCloud({ store, athleteId }) {
  if (!isLocalHost()) {
    throw new Error('La verifica Calendar può essere eseguita solo dall’app locale.');
  }

  if (!athleteId) {
    throw new Error('Profilo atleta cloud non disponibile.');
  }

  const local = normalizePlanner(store.getState()?.planner);

  const [
    peopleRows,
    seriesRows,
    eventRows,
    tournamentRows,
    cloudSettings,
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
      'athlete_id,id,extra',
      athleteId
    ),
    loadTable(
      'calendar_tournaments',
      'athlete_id,id,extra',
      athleteId
    ),
    loadSettings(athleteId),
  ]);

  const cloudPeople = peopleRows.map(row => ({
    id: row.id,
    name: row.name || '',
    relationship: row.relationship || '',
  }));

  const cloudSeries = seriesRows.map(row => ({
    id: row.id,
    startDate: row.start_date || '',
    intervalWeeks: row.interval_weeks,
    generatedThrough: row.generated_through || '',
    active: row.active !== false,
    template: row.template || {},
  }));

  const cloudEvents = eventRows.map(row => row.extra || { id: row.id });
  const cloudTournaments = tournamentRows.map(row => row.extra || { id: row.id });
  const cloudLocationDefaults = cloudSettings?.location_defaults || {};

  const people = {
    ...compareById(
      canonicalPeople(local.people),
      canonicalPeople(cloudPeople)
    ),
    label: 'Persone',
  };

  const recurringSeries = {
    ...compareById(
      canonicalSeries(local.recurringSeries),
      canonicalSeries(cloudSeries)
    ),
    label: 'Serie',
  };

  const events = {
    ...compareById(local.events, cloudEvents),
    label: 'Attività',
  };

  const tournaments = {
    ...compareById(local.tournaments, cloudTournaments),
    label: 'Tornei',
  };

  const settingsOk =
    stableStringify(local.locationDefaults) === stableStringify(cloudLocationDefaults);

  const settings = {
    label: 'Impostazioni',
    local: 1,
    cloud: cloudSettings ? 1 : 0,
    matched: settingsOk && cloudSettings ? 1 : 0,
    mismatches: settingsOk && cloudSettings
      ? []
      : [{ id: 'locationDefaults', reason: cloudSettings ? 'contenuto differente' : 'mancante nel cloud' }],
    ok: Boolean(settingsOk && cloudSettings),
  };

  const sections = [people, recurringSeries, events, tournaments, settings];
  const ok = sections.every(section => section.ok);

  return {
    ok,
    athleteId,
    sections,
    mismatchPreview: sections.flatMap(section =>
      section.mismatches.slice(0, 5).map(item => ({
        section: section.label,
        ...item,
      }))
    ).slice(0, 12),
  };
}
