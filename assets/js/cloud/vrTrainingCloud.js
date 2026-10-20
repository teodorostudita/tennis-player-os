import { supabase } from './supabaseClient.js?v=1.2.5';
import { APP_VERSION } from '../version.js?v=1.2.4';

// VR Lab (modulo `vr`): una riga di public.vr_training_sessions per serie completata.
// Se il salvataggio fallisce (rete assente sul visore), la sessione resta in coda
// locale e viene ritentata al successivo salvataggio o all'apertura del modulo.

export const BOUNCE_DRILL_KEY = 'bounce_prediction';

const TABLE = 'vr_training_sessions';
const PENDING_KEY = 'tennisPlayerOS.vr.pendingSessions.v1';

function readPending() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writePending(items) {
  try {
    if (items.length) localStorage.setItem(PENDING_KEY, JSON.stringify(items));
    else localStorage.removeItem(PENDING_KEY);
  } catch (_) {}
}

function toRow(session, userId) {
  return {
    id: session.id,
    athlete_id: session.athleteId,
    recorded_by: userId,
    drill_key: session.drillKey || BOUNCE_DRILL_KEY,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    trial_count: session.trials.length,
    mean_error_cm: session.summary.meanErrorCm,
    median_error_cm: session.summary.medianErrorCm,
    settings: session.settings || {},
    summary: session.summary || {},
    trials: session.trials,
    device: session.device || '',
    app_version: APP_VERSION,
  };
}

// getSession legge la sessione locale: funziona anche offline, così la serie va in coda.
async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (error || !user) {
    throw new Error('Sessione di accesso scaduta: rientra nell’app e riprova.');
  }
  return user.id;
}

async function insertSession(session, userId) {
  // upsert con ignoreDuplicates: un nuovo tentativo dalla coda non duplica la riga.
  const { error } = await supabase
    .from(TABLE)
    .upsert(toRow(session, userId), { onConflict: 'id', ignoreDuplicates: true });

  if (error) throw new Error(`Salvataggio VR non riuscito: ${error.message}`);
}

export function pendingVrSessionCount(athleteId) {
  return readPending().filter(item => item.athleteId === athleteId).length;
}

// Ritenta solo le sessioni registrate dall'account corrente.
export async function flushPendingVrSessions() {
  const pending = readPending();
  if (!pending.length) return { saved: 0, remaining: 0 };

  let userId = '';
  try {
    userId = await currentUserId();
  } catch (_) {
    return { saved: 0, remaining: pending.length };
  }

  const remaining = [];
  let saved = 0;
  for (const session of pending) {
    if (session.recordedBy !== userId) {
      remaining.push(session);
      continue;
    }
    try {
      await insertSession(session, userId);
      saved += 1;
    } catch (_) {
      remaining.push(session);
    }
  }
  writePending(remaining);
  return { saved, remaining: remaining.length };
}

// Restituisce { saved: true } oppure { saved: false, queued, error }.
export async function saveVrSession(session) {
  const record = { ...session, id: session.id || crypto.randomUUID() };
  try {
    record.recordedBy = await currentUserId();
    await insertSession(record, record.recordedBy);
    void flushPendingVrSessions();
    return { saved: true, id: record.id };
  } catch (error) {
    const queued = Boolean(record.recordedBy);
    if (queued) writePending([...readPending().filter(item => item.id !== record.id), record]);
    return { saved: false, queued, id: record.id, error: error?.message || String(error) };
  }
}

export async function loadVrSessions(athleteId, { drillKey = BOUNCE_DRILL_KEY, limit = 50 } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, recorded_by, drill_key, started_at, completed_at, trial_count, mean_error_cm, median_error_cm, settings, summary, device')
    .eq('athlete_id', athleteId)
    .eq('drill_key', drillKey)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Impossibile leggere le sessioni VR: ${error.message}`);
  return data || [];
}

export async function deleteVrSession(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Impossibile eliminare la sessione VR: ${error.message}`);
}
