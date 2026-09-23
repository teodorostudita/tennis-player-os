import { supabase } from './supabaseClient.js';
import { getCurrentAccess } from './access.js';
import { loadCloudModuleState } from './moduleStateCloud.js';

const LEGACY_MODULE_KEY = 'training';
const SAVE_DELAY_MS = 300;
const WEEKLY_CLIENT_ID = 'weekly-program';

let baselineAthleteId = '';
let baselineRecords = new Map();
let staffDirectoryCache = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recordKey(recordType, clientId) {
  return `${recordType}:${clientId}`;
}

function stripOwnership(record = {}) {
  const { __ownership, ...payload } = record || {};
  return payload;
}

function ownershipFromRow(row = {}) {
  return {
    recordId: row.id || '',
    ownerUserId: row.owner_user_id || '',
    createdBy: row.created_by || '',
    updatedBy: row.updated_by || '',
    revision: Number(row.revision || 1),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function canonicalFromRow(row = {}) {
  return {
    id: row.id || '',
    athleteId: row.athlete_id || '',
    recordType: row.record_type || '',
    clientId: row.client_id || '',
    ownerUserId: row.owner_user_id || '',
    createdBy: row.created_by || '',
    updatedBy: row.updated_by || '',
    revision: Number(row.revision || 1),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    payload: clone(row.payload || {}),
  };
}

function baselineFromRows(rows = []) {
  return new Map(
    (rows || []).map(row => {
      const canonical = canonicalFromRow(row);
      return [recordKey(canonical.recordType, canonical.clientId), canonical];
    }),
  );
}

function meaningfulWeeklyProgram(program = {}) {
  return Boolean(
    String(program.effectiveFrom || '').trim()
    || String(program.effectiveTo || '').trim()
    || String(program.notes || '').trim()
    || (
      String(program.title || '').trim()
      && String(program.title || '').trim() !== 'Programma settimanale'
    )
  );
}

export function normalizeTrainingPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const weeklyProgram = source.weeklyProgram
    && typeof source.weeklyProgram === 'object'
    && !Array.isArray(source.weeklyProgram)
      ? source.weeklyProgram
      : {};

  const sessions = Array.isArray(weeklyProgram.sessions)
    ? weeklyProgram.sessions.map(session => ({
        ...session,
        blocks: Array.isArray(session?.blocks) ? session.blocks : [],
      }))
    : [];

  return {
    ...source,
    tests: Array.isArray(source.tests) ? source.tests : [],
    testResults: Array.isArray(source.testResults) ? source.testResults : [],
    weeklyProgram: {
      title: 'Programma settimanale',
      effectiveFrom: '',
      effectiveTo: '',
      notes: '',
      ...weeklyProgram,
      sessions,
    },
    goals: Array.isArray(source.goals) ? source.goals : [],
  };
}

export function hasMeaningfulTrainingData(payload = {}) {
  const training = normalizeTrainingPayload(payload);

  return Boolean(
    training.tests.length
    || training.testResults.length
    || training.goals.length
    || training.weeklyProgram.sessions.length
    || meaningfulWeeklyProgram(training.weeklyProgram)
  );
}

function trainingFromRows(rows = []) {
  const training = normalizeTrainingPayload({});

  for (const row of rows || []) {
    const payload = clone(row.payload || {});
    const ownership = ownershipFromRow(row);

    if (row.record_type === 'weekly_program') {
      training.weeklyProgram = {
        ...training.weeklyProgram,
        ...payload,
        sessions: training.weeklyProgram.sessions,
        __ownership: ownership,
      };
      continue;
    }

    const record = {
      ...payload,
      __ownership: ownership,
    };

    if (row.record_type === 'test') training.tests.push(record);
    else if (row.record_type === 'test_result') training.testResults.push(record);
    else if (row.record_type === 'session') training.weeklyProgram.sessions.push({
      ...record,
      blocks: Array.isArray(record.blocks) ? record.blocks : [],
    });
    else if (row.record_type === 'goal') training.goals.push(record);
  }

  return normalizeTrainingPayload(training);
}

function ownerForRecord(record, type, clientId, access) {
  const existing = baselineRecords.get(recordKey(type, clientId));
  return String(
    record?.__ownership?.ownerUserId
    || existing?.ownerUserId
    || access.userId
    || '',
  );
}

function canonicalRecord(type, record, access) {
  const clientId = String(record?.id || '').trim();
  if (!clientId) return null;

  const existing = baselineRecords.get(recordKey(type, clientId));

  return {
    id: existing?.id || '',
    athleteId: access.athleteId,
    recordType: type,
    clientId,
    ownerUserId: ownerForRecord(record, type, clientId, access),
    createdBy: existing?.createdBy || record?.__ownership?.createdBy || '',
    updatedBy: existing?.updatedBy || record?.__ownership?.updatedBy || '',
    revision: existing?.revision || Number(record?.__ownership?.revision || 1),
    createdAt: existing?.createdAt || record?.__ownership?.createdAt || '',
    updatedAt: existing?.updatedAt || record?.__ownership?.updatedAt || '',
    payload: stripOwnership(clone(record || {})),
  };
}

function recordsFromTraining(payload, access) {
  const training = normalizeTrainingPayload(payload);
  const records = new Map();

  const weeklyKey = recordKey('weekly_program', WEEKLY_CLIENT_ID);
  const existingWeekly = baselineRecords.get(weeklyKey);

  if (existingWeekly || (access.isAdmin && meaningfulWeeklyProgram(training.weeklyProgram))) {
    const weekly = {
      title: String(training.weeklyProgram.title || 'Programma settimanale'),
      effectiveFrom: String(training.weeklyProgram.effectiveFrom || ''),
      effectiveTo: String(training.weeklyProgram.effectiveTo || ''),
      notes: String(training.weeklyProgram.notes || ''),
      __ownership: training.weeklyProgram.__ownership,
      id: WEEKLY_CLIENT_ID,
    };
    const canonical = canonicalRecord('weekly_program', weekly, access);
    if (canonical) records.set(weeklyKey, canonical);
  }

  const groups = [
    ['test', training.tests],
    ['test_result', training.testResults],
    ['session', training.weeklyProgram.sessions],
    ['goal', training.goals],
  ];

  for (const [type, items] of groups) {
    for (const item of items || []) {
      const canonical = canonicalRecord(type, item, access);
      if (!canonical) continue;
      records.set(recordKey(type, canonical.clientId), canonical);
    }
  }

  return records;
}

function comparable(record = {}) {
  return JSON.stringify({
    ownerUserId: record.ownerUserId || '',
    payload: record.payload || {},
  });
}

async function loadRows(athleteId) {
  const { data, error } = await supabase
    .from('athletics_records')
    .select('id, athlete_id, record_type, client_id, owner_user_id, payload, revision, created_by, updated_by, created_at, updated_at')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Impossibile leggere Athletics da Supabase: ${error.message}`);
  }

  return data || [];
}

async function insertRecord(record) {
  const { data, error } = await supabase
    .from('athletics_records')
    .insert({
      athlete_id: record.athleteId,
      record_type: record.recordType,
      client_id: record.clientId,
      owner_user_id: record.ownerUserId,
      payload: record.payload,
    })
    .select('id, athlete_id, record_type, client_id, owner_user_id, payload, revision, created_by, updated_by, created_at, updated_at')
    .single();

  if (error) throw error;
  return canonicalFromRow(data);
}

async function updateRecord(record) {
  const { data, error } = await supabase
    .from('athletics_records')
    .update({
      owner_user_id: record.ownerUserId,
      payload: record.payload,
    })
    .eq('athlete_id', record.athleteId)
    .eq('record_type', record.recordType)
    .eq('client_id', record.clientId)
    .select('id, athlete_id, record_type, client_id, owner_user_id, payload, revision, created_by, updated_by, created_at, updated_at')
    .single();

  if (error) throw error;
  return canonicalFromRow(data);
}

async function deleteRecord(record) {
  const { data, error } = await supabase
    .from('athletics_records')
    .delete()
    .eq('athlete_id', record.athleteId)
    .eq('record_type', record.recordType)
    .eq('client_id', record.clientId)
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

async function applyRecordDiff(nextRecords) {
  const access = getCurrentAccess();

  for (const [key, next] of nextRecords) {
    const previous = baselineRecords.get(key);
    if (previous && comparable(previous) === comparable(next)) continue;

    const saved = previous
      ? await updateRecord(next)
      : await insertRecord(next);

    baselineRecords.set(key, saved);
  }

  for (const [key, previous] of [...baselineRecords]) {
    if (nextRecords.has(key)) continue;

    // A non-admin can never delete the administrative weekly-program record.
    if (previous.recordType === 'weekly_program' && !access.isAdmin) continue;

    await deleteRecord(previous);
    baselineRecords.delete(key);
  }
}

function isPermissionError(error) {
  return ['42501', 'PGRST301'].includes(String(error?.code || ''))
    || /permission|policy|row-level security|not allowed/i.test(String(error?.message || ''));
}

/**
 * Load Athletics before the UI mounts.
 *
 * New record storage is authoritative. The old athlete_module_state/training
 * blob is read only as a compatibility fallback and is never overwritten by
 * v0.25.5+.
 */
export async function loadTrainingIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localTraining = normalizeTrainingPayload(store.getState().training);

  try {
    const rows = await loadRows(athleteId);
    baselineAthleteId = athleteId;
    baselineRecords = baselineFromRows(rows);

    if (rows.length) {
      const cloudTraining = trainingFromRows(rows);

      store.update(state => {
        state.training = clone(cloudTraining);
        state.meta.trainingCloudLoadedAt = new Date().toISOString();
        state.meta.trainingStorageMode = 'records-v1';
      });

      return {
        source: 'records-cloud',
        training: cloudTraining,
        cloudError: null,
      };
    }

    // Compatibility fallback for installations where the new migration has
    // not materialised records yet. The legacy blob remains read-only.
    const legacyState = await loadCloudModuleState({
      athleteId,
      moduleKey: LEGACY_MODULE_KEY,
    });

    if (legacyState) {
      const legacyTraining = normalizeTrainingPayload(legacyState.payload);

      store.update(state => {
        state.training = clone(legacyTraining);
        state.meta.trainingLegacyFallbackAt = new Date().toISOString();
      });

      return {
        source: 'legacy-cloud-fallback',
        training: legacyTraining,
        cloudError: null,
      };
    }

    return {
      source: allowWrite && hasMeaningfulTrainingData(localTraining)
        ? 'local-awaiting-record-sync'
        : 'local',
      training: localTraining,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Athletics record load failed; using local cache.', cloudError);

    return {
      source: 'local-fallback',
      training: localTraining,
      cloudError,
    };
  }
}

/**
 * Synchronise only changed Athletics records. This prevents two trainers from
 * overwriting one another simply because their browsers hold different module
 * snapshots. RLS remains the final authority for ownership.
 */
export function startTrainingCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let timer = null;
  let inFlight = false;
  let queuedPayload = null;
  let stopped = false;

  if (baselineAthleteId !== athleteId) {
    baselineAthleteId = athleteId;
    baselineRecords = new Map();
  }

  const status = (value, message = '') => {
    onStatus?.({ status: value, message });
  };

  const flush = async () => {
    if (stopped || inFlight || !queuedPayload) return;

    const payload = queuedPayload;
    queuedPayload = null;
    const access = getCurrentAccess();
    const nextRecords = recordsFromTraining(payload, access);

    inFlight = true;
    status('syncing');

    try {
      await applyRecordDiff(nextRecords);
      status('synced');
    } catch (error) {
      console.warn('Athletics record save failed; local cache retained.', error);

      if (!isPermissionError(error)) {
        queuedPayload = payload;
      }

      status(
        'error',
        isPermissionError(error)
          ? 'Questo contenuto Athletics appartiene a un altro membro dello staff.'
          : (error?.message || 'Salvataggio Athletics cloud non riuscito.'),
      );
    } finally {
      inFlight = false;

      if (queuedPayload) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY_MS);
      }
    }
  };

  const queue = training => {
    if (stopped) return;
    queuedPayload = clone(normalizeTrainingPayload(training));
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.training);
  });

  const retryOnline = () => {
    if (!queuedPayload) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, 50);
  };

  window.addEventListener('online', retryOnline);

  // If there is meaningful local data but no materialised cloud record yet,
  // the first sync creates individual records under the current writer.
  if (!baselineRecords.size && hasMeaningfulTrainingData(store.getState().training)) {
    queue(store.getState().training);
  }

  status('synced');

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribe();
    window.removeEventListener('online', retryOnline);
  };
}

export function getAthleticsRecordOwner(record = {}) {
  return String(record?.__ownership?.ownerUserId || '');
}

export function canEditAthleticsRecord(record = {}) {
  const access = getCurrentAccess();
  if (!access.modules?.training?.canWrite) return false;
  if (access.isAdmin) return true;

  const ownerUserId = getAthleticsRecordOwner(record);
  // Records just created locally do not yet have cloud ownership metadata and
  // belong to the current writer by default.
  return !ownerUserId || ownerUserId === access.userId;
}

export async function loadAthleticsStaffDirectory(athleteId) {
  const { data, error } = await supabase.rpc(
    'get_athletics_staff_directory',
    { p_athlete_id: athleteId },
  );

  if (error) {
    console.warn('Athletics staff directory unavailable.', error);
    staffDirectoryCache = [];
    return [];
  }

  staffDirectoryCache = (data || []).map(row => ({
    userId: row.user_id,
    displayName: row.display_name || 'Membro staff',
    role: row.role || 'member',
    canWriteTraining: Boolean(row.can_write_training),
  }));

  return clone(staffDirectoryCache);
}

export function getCachedAthleticsStaffDirectory() {
  return clone(staffDirectoryCache);
}

export async function reassignAthleticsRecordOwner({
  athleteId,
  recordType,
  clientId,
  ownerUserId,
}) {
  const access = getCurrentAccess();
  if (!access.isAdmin) {
    throw new Error('Solo Owner/Admin può cambiare il responsabile.');
  }

  const { data, error } = await supabase
    .from('athletics_records')
    .update({ owner_user_id: ownerUserId })
    .eq('athlete_id', athleteId)
    .eq('record_type', recordType)
    .eq('client_id', clientId)
    .select('id, athlete_id, record_type, client_id, owner_user_id, payload, revision, created_by, updated_by, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Impossibile cambiare responsabile: ${error.message}`);
  }

  const saved = canonicalFromRow(data);
  baselineRecords.set(recordKey(recordType, clientId), saved);
  return saved;
}
