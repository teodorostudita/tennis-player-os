import { supabase } from './supabaseClient.js?v=1.2.4';
import { getCurrentAccess } from './access.js?v=1.2.4';
import { loadAthleticsStaffDirectory } from './trainingCloud.js?v=1.2.4';

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeEntry(row = {}) {
  return {
    id: clean(row.id),
    athleteId: clean(row.athlete_id ?? row.athleteId),
    metricKey: clean(row.metric_key ?? row.metricKey),
    componentKey: clean(row.component_key ?? row.componentKey) || 'main',
    assessedOn: clean(row.assessed_on ?? row.assessedOn),
    value: Number(row.value),
    evaluatorUserId: clean(row.evaluator_user_id ?? row.evaluatorUserId),
    evaluatorName: clean(row.evaluator_name ?? row.evaluatorName),
    note: clean(row.note),
    createdAt: clean(row.created_at ?? row.createdAt),
    updatedAt: clean(row.updated_at ?? row.updatedAt),
  };
}

export async function loadAthleticsAssessmentEntries(athleteId) {
  const { data, error } = await supabase
    .from('athletics_assessment_entries')
    .select('id, athlete_id, metric_key, component_key, assessed_on, value, evaluator_user_id, evaluator_name, note, created_at, updated_at')
    .eq('athlete_id', athleteId)
    .order('assessed_on', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Impossibile leggere la valutazione Athletics: ${error.message}`);
  return (data || []).map(normalizeEntry);
}

export async function currentAthleticsEvaluatorName(athleteId) {
  const access = getCurrentAccess();
  const fallback = access.isOwner ? 'Owner' : access.isAdmin ? 'Admin' : 'Preparatore';

  try {
    const staff = await loadAthleticsStaffDirectory(athleteId);
    const current = staff.find(member => member.userId === access.userId);
    return clean(current?.displayName) || fallback;
  } catch {
    return fallback;
  }
}

export async function saveAthleticsAssessmentEntry({
  athleteId,
  metricKey,
  componentKey = 'main',
  assessedOn,
  value,
  evaluatorName = '',
  note = '',
}) {
  const access = getCurrentAccess();
  const numericValue = Number(value);

  if (!athleteId || !metricKey || !assessedOn) throw new Error('Valutazione incompleta.');
  if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 10) {
    throw new Error('Il valore deve essere compreso tra 1 e 10.');
  }

  const payload = {
    athlete_id: athleteId,
    metric_key: clean(metricKey),
    component_key: clean(componentKey) || 'main',
    assessed_on: assessedOn,
    value: numericValue,
    evaluator_user_id: access.userId,
    evaluator_name: clean(evaluatorName),
    note: clean(note),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('athletics_assessment_entries')
    .upsert(payload, { onConflict: 'athlete_id,metric_key,component_key,assessed_on' })
    .select('id, athlete_id, metric_key, component_key, assessed_on, value, evaluator_user_id, evaluator_name, note, created_at, updated_at')
    .single();

  if (error) throw new Error(`Impossibile salvare la valutazione Athletics: ${error.message}`);
  return normalizeEntry(data);
}

export async function deleteAthleticsAssessmentEntry({ athleteId, id }) {
  const { error } = await supabase
    .from('athletics_assessment_entries')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('id', id);

  if (error) throw new Error(`Impossibile eliminare la valutazione Athletics: ${error.message}`);
}
