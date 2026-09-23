import { supabase } from './supabaseClient.js';
import { loadAccessibleAthletes } from './athlete.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function athleticsTestDefinition(test = {}) {
  return {
    name: normalizeText(test.name),
    area: normalizeText(test.area) || 'general',
    bilateral: Boolean(test.bilateral),
    unit: normalizeText(test.unit),
    direction: normalizeText(test.direction) || 'higher',
    description: normalizeText(test.description),
  };
}

export function athleticsTestDefinitionSignature(test = {}) {
  const definition = athleticsTestDefinition(test);

  return JSON.stringify([
    definition.name.toLocaleLowerCase('it'),
    definition.area,
    definition.bilateral,
    definition.unit.toLocaleLowerCase('it'),
    definition.direction,
    definition.description.toLocaleLowerCase('it'),
  ]);
}

function assertAthleteId(value) {
  const athleteId = normalizeText(value);
  if (!athleteId) throw new Error('Atleta non specificato.');
  return athleteId;
}

export async function syncAthleticsTestTemplates({
  athleteId,
  tests = [],
}) {
  const sourceAthleteId = assertAthleteId(athleteId);
  const validTests = (Array.isArray(tests) ? tests : [])
    .filter(test => normalizeText(test?.id) && normalizeText(test?.name));

  const desiredIds = validTests.map(test => String(test.id));

  const { data: existing, error: existingError } = await supabase
    .from('athletics_test_templates')
    .select('source_test_id')
    .eq('source_athlete_id', sourceAthleteId);

  if (existingError) {
    throw new Error(`Impossibile leggere la libreria test: ${existingError.message}`);
  }

  if (validTests.length) {
    const rows = validTests.map(test => ({
      source_athlete_id: sourceAthleteId,
      source_test_id: String(test.id),
      definition: athleticsTestDefinition(test),
    }));

    const { error: upsertError } = await supabase
      .from('athletics_test_templates')
      .upsert(rows, {
        onConflict: 'source_athlete_id,source_test_id',
      });

    if (upsertError) {
      throw new Error(`Impossibile aggiornare la libreria test: ${upsertError.message}`);
    }
  }

  const staleIds = (existing || [])
    .map(row => String(row.source_test_id || ''))
    .filter(id => id && !desiredIds.includes(id));

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('athletics_test_templates')
      .delete()
      .eq('source_athlete_id', sourceAthleteId)
      .in('source_test_id', staleIds);

    if (deleteError) {
      throw new Error(`Impossibile ripulire la libreria test: ${deleteError.message}`);
    }
  }

  return {
    published: validTests.length,
    removed: staleIds.length,
  };
}

export async function loadReusableAthleticsTests({
  currentAthleteId,
  currentTests = [],
}) {
  const athleteId = assertAthleteId(currentAthleteId);
  const currentSignatures = new Set(
    (Array.isArray(currentTests) ? currentTests : [])
      .map(athleticsTestDefinitionSignature),
  );

  const [{ data: rows, error }, athletes] = await Promise.all([
    supabase
      .from('athletics_test_templates')
      .select('id, source_athlete_id, source_test_id, definition, updated_at')
      .neq('source_athlete_id', athleteId)
      .order('updated_at', { ascending: false }),
    loadAccessibleAthletes(),
  ]);

  if (error) {
    throw new Error(`Impossibile leggere i test riutilizzabili: ${error.message}`);
  }

  const athleteNames = new Map(
    (athletes || []).map(athlete => [
      athlete.id,
      [athlete.firstName, athlete.lastName].filter(Boolean).join(' ')
        || athlete.cloudDisplayName
        || 'Atleta',
    ]),
  );

  const grouped = new Map();

  for (const row of rows || []) {
    const definition = athleticsTestDefinition(row.definition || {});
    if (!definition.name) continue;

    const signature = athleticsTestDefinitionSignature(definition);
    if (currentSignatures.has(signature)) continue;

    if (!grouped.has(signature)) {
      grouped.set(signature, {
        signature,
        definition,
        sources: [],
        updatedAt: row.updated_at || '',
      });
    }

    const entry = grouped.get(signature);
    const sourceName = athleteNames.get(row.source_athlete_id) || 'Altro atleta';

    if (!entry.sources.includes(sourceName)) {
      entry.sources.push(sourceName);
    }

    if ((row.updated_at || '') > entry.updatedAt) {
      entry.updatedAt = row.updated_at || '';
    }
  }

  return [...grouped.values()]
    .sort((a, b) => {
      const byName = a.definition.name.localeCompare(
        b.definition.name,
        'it',
        { sensitivity: 'base' },
      );
      if (byName) return byName;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
