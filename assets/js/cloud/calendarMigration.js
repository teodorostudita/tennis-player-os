import { supabase } from './supabaseClient.js';

const MIGRATION_PARAM = 'tpos_calendar_migrate';

function isLocalHost() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}

export function isCalendarMigrationRequested() {
  if (!isLocalHost()) return false;

  try {
    return new URL(window.location.href).searchParams.get(MIGRATION_PARAM) === '1';
  } catch {
    return false;
  }
}

export function cleanCalendarMigrationUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(MIGRATION_PARAM);
  return url.toString();
}

function normalizePlannerSnapshot(planner = {}) {
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

export async function migrateLocalCalendarToCloud({ store, athleteId }) {
  if (!isLocalHost()) {
    throw new Error('La migrazione Calendar può essere eseguita solo dall’app locale.');
  }

  if (!athleteId) {
    throw new Error('Profilo atleta cloud non disponibile.');
  }

  const snapshot = normalizePlannerSnapshot(store.getState()?.planner);

  const localCounts = {
    people: snapshot.people.length,
    recurringSeries: snapshot.recurringSeries.length,
    events: snapshot.events.length,
    tournaments: snapshot.tournaments.length,
    settings: 1,
  };

  const { data, error } = await supabase.rpc('import_calendar_snapshot', {
    p_athlete_id: athleteId,
    p_snapshot: snapshot,
  });

  if (error) {
    throw new Error(`Import Calendar non riuscito: ${error.message}`);
  }

  return {
    athleteId,
    localCounts,
    cloudCounts: data || {},
  };
}
