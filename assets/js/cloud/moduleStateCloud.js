import { supabase } from './supabaseClient.js?v=1.2.4';

const RESERVED_MODULE_KEYS = new Set(['calendar']);

function assertId(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} non specificato.`);
  }
  return normalized;
}

function assertModuleKey(value) {
  const moduleKey = assertId(value, 'Modulo');

  if (RESERVED_MODULE_KEYS.has(moduleKey)) {
    throw new Error(
      'Calendar usa il proprio schema cloud dedicato e non può essere salvato nel contenitore generico.',
    );
  }

  return moduleKey;
}

function normalizeSchemaVersion(value) {
  const version = Number(value || 1);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Versione schema modulo non valida.');
  }
  return version;
}

function mapRow(row) {
  if (!row) return null;

  return {
    athleteId: row.athlete_id,
    moduleKey: row.module_key,
    payload: row.payload ?? {},
    schemaVersion: Number(row.schema_version || 1),
    revision: Number(row.revision || 1),
    updatedBy: row.updated_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Impossibile leggere l'account corrente: ${error.message}`);
  }

  const userId = data?.user?.id;
  if (!userId) {
    throw new Error('Account autenticato non disponibile.');
  }

  return userId;
}

export async function loadCloudModuleState({
  athleteId,
  moduleKey,
}) {
  const normalizedAthleteId = assertId(athleteId, 'Atleta');
  const normalizedModuleKey = assertModuleKey(moduleKey);

  const { data, error } = await supabase
    .from('athlete_module_state')
    .select(
      'athlete_id, module_key, payload, schema_version, revision, updated_by, created_at, updated_at',
    )
    .eq('athlete_id', normalizedAthleteId)
    .eq('module_key', normalizedModuleKey)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile leggere ${normalizedModuleKey} dal cloud: ${error.message}`,
    );
  }

  return mapRow(data);
}

export async function listCloudModuleStates(athleteId) {
  const normalizedAthleteId = assertId(athleteId, 'Atleta');

  const { data, error } = await supabase
    .from('athlete_module_state')
    .select(
      'athlete_id, module_key, payload, schema_version, revision, updated_by, created_at, updated_at',
    )
    .eq('athlete_id', normalizedAthleteId)
    .order('module_key', { ascending: true });

  if (error) {
    throw new Error(`Impossibile leggere i moduli dal cloud: ${error.message}`);
  }

  return (data || []).map(mapRow);
}

export async function saveCloudModuleState({
  athleteId,
  moduleKey,
  payload,
  schemaVersion = 1,
  expectedRevision = null,
}) {
  const normalizedAthleteId = assertId(athleteId, 'Atleta');
  const normalizedModuleKey = assertModuleKey(moduleKey);
  const normalizedSchemaVersion = normalizeSchemaVersion(schemaVersion);
  const updatedBy = await currentUserId();

  if (expectedRevision != null) {
    const revision = Number(expectedRevision);

    if (!Number.isInteger(revision) || revision < 1) {
      throw new Error('Revisione cloud attesa non valida.');
    }

    const { data, error } = await supabase
      .from('athlete_module_state')
      .update({
        payload: payload ?? {},
        schema_version: normalizedSchemaVersion,
        updated_by: updatedBy,
      })
      .eq('athlete_id', normalizedAthleteId)
      .eq('module_key', normalizedModuleKey)
      .eq('revision', revision)
      .select(
        'athlete_id, module_key, payload, schema_version, revision, updated_by, created_at, updated_at',
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `Impossibile salvare ${normalizedModuleKey} nel cloud: ${error.message}`,
      );
    }

    if (!data) {
      const conflict = new Error(
        'Il modulo è stato modificato nel cloud dopo l’ultima lettura. Ricarica i dati prima di salvare.',
      );
      conflict.code = 'TPOS_MODULE_REVISION_CONFLICT';
      throw conflict;
    }

    return mapRow(data);
  }

  const { data, error } = await supabase
    .from('athlete_module_state')
    .upsert(
      {
        athlete_id: normalizedAthleteId,
        module_key: normalizedModuleKey,
        payload: payload ?? {},
        schema_version: normalizedSchemaVersion,
        updated_by: updatedBy,
      },
      {
        onConflict: 'athlete_id,module_key',
      },
    )
    .select(
      'athlete_id, module_key, payload, schema_version, revision, updated_by, created_at, updated_at',
    )
    .single();

  if (error) {
    throw new Error(
      `Impossibile salvare ${normalizedModuleKey} nel cloud: ${error.message}`,
    );
  }

  return mapRow(data);
}

export function subscribeCloudModuleState({
  athleteId,
  moduleKey,
  onChange,
  onStatus = null,
} = {}) {
  const normalizedAthleteId = assertId(athleteId, 'Atleta');
  const normalizedModuleKey = assertModuleKey(moduleKey);
  const channelName = `tpos-module-${normalizedAthleteId}-${normalizedModuleKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'athlete_module_state',
        filter: `athlete_id=eq.${normalizedAthleteId}`,
      },
      payload => {
        const row = payload?.new && Object.keys(payload.new).length
          ? payload.new
          : payload?.old;

        if (!row || row.module_key !== normalizedModuleKey) return;

        onChange?.({
          eventType: payload.eventType || payload.event || '',
          state: mapRow(row),
        });
      },
    )
    .subscribe(status => {
      onStatus?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function deleteCloudModuleState({
  athleteId,
  moduleKey,
}) {
  const normalizedAthleteId = assertId(athleteId, 'Atleta');
  const normalizedModuleKey = assertModuleKey(moduleKey);

  const { error } = await supabase
    .from('athlete_module_state')
    .delete()
    .eq('athlete_id', normalizedAthleteId)
    .eq('module_key', normalizedModuleKey);

  if (error) {
    throw new Error(
      `Impossibile eliminare ${normalizedModuleKey} dal cloud: ${error.message}`,
    );
  }
}
