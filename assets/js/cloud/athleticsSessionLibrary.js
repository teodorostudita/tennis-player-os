import { supabase } from './supabaseClient.js?v=1.2.4';
import { loadAccessibleAthletes } from './athlete.js?v=1.2.4';

function clean(value) {
  return String(value ?? '').trim();
}

function clampDay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(6, Math.round(number)));
}

function normalizeBlock(block = {}) {
  return {
    type: clean(block.type) || 'other',
    name: clean(block.name),
    dose: clean(block.dose),
    rest: clean(block.rest),
  };
}

export function athleticsSessionDefinition(session = {}) {
  return {
    dayIndex: clampDay(session.dayIndex),
    title: clean(session.title) || 'Sessione',
    startTime: clean(session.startTime),
    endTime: clean(session.endTime),
    focus: clean(session.focus),
    coach: clean(session.coach),
    notes: clean(session.notes),
    blocks: Array.isArray(session.blocks)
      ? session.blocks.map(normalizeBlock)
      : [],
  };
}

export function athleticsSessionSignature(session = {}) {
  const definition = athleticsSessionDefinition(session);

  return JSON.stringify([
    definition.dayIndex,
    definition.title.toLocaleLowerCase('it'),
    definition.startTime,
    definition.endTime,
    definition.focus.toLocaleLowerCase('it'),
    definition.coach.toLocaleLowerCase('it'),
    definition.notes.toLocaleLowerCase('it'),
    definition.blocks.map(block => [
      block.type,
      block.name.toLocaleLowerCase('it'),
      block.dose.toLocaleLowerCase('it'),
      block.rest.toLocaleLowerCase('it'),
    ]),
  ]);
}

function athleteName(athlete = {}) {
  return [
    athlete.firstName,
    athlete.lastName,
  ].filter(Boolean).join(' ')
    || athlete.cloudDisplayName
    || athlete.displayName
    || 'Atleta';
}

export async function loadReusableAthleticsSessions({
  currentAthleteId,
}) {
  const currentId = clean(currentAthleteId);
  if (!currentId) {
    throw new Error('Atleta corrente non disponibile.');
  }

  const athletes = await loadAccessibleAthletes();
  const sources = (athletes || [])
    .filter(athlete => clean(athlete.id) && clean(athlete.id) !== currentId);

  if (!sources.length) return [];

  const sourceIds = sources.map(athlete => athlete.id);
  const sourceNames = new Map(
    sources.map(athlete => [athlete.id, athleteName(athlete)]),
  );

  const { data, error } = await supabase
    .from('athletics_records')
    .select('athlete_id, client_id, payload, updated_at')
    .eq('record_type', 'session')
    .in('athlete_id', sourceIds)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Impossibile leggere le sessioni degli altri atleti: ${error.message}`);
  }

  const grouped = new Map();

  for (const row of data || []) {
    const definition = athleticsSessionDefinition(row.payload || {});
    if (!definition.title) continue;

    const signature = athleticsSessionSignature(definition);

    if (!grouped.has(signature)) {
      grouped.set(signature, {
        signature,
        definition,
        sources: [],
        updatedAt: row.updated_at || '',
      });
    }

    const entry = grouped.get(signature);
    const name = sourceNames.get(row.athlete_id) || 'Altro atleta';

    if (!entry.sources.includes(name)) {
      entry.sources.push(name);
    }

    if ((row.updated_at || '') > entry.updatedAt) {
      entry.updatedAt = row.updated_at || '';
    }
  }

  return [...grouped.values()]
    .sort((a, b) => {
      const byTitle = a.definition.title.localeCompare(
        b.definition.title,
        'it',
        { sensitivity: 'base' },
      );

      if (byTitle) return byTitle;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
