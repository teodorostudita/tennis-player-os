import { supabase } from './supabaseClient.js';

function mapCloudAthlete(row) {
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    birthDate: row.birth_date || '',
    cloudDisplayName: row.display_name || '',
    cloudMetadata: row.metadata || {},
  };
}

export async function loadCurrentAthlete() {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, first_name, last_name, display_name, birth_date, metadata, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(2);

  if (error) {
    throw new Error(`Impossibile leggere l'atleta da Supabase: ${error.message}`);
  }

  if (!data?.length) {
    throw new Error('Nessun atleta accessibile per questo account.');
  }

  if (data.length > 1) {
    throw new Error('Questo account vede più di un atleta. La selezione atleta verrà aggiunta nel prossimo step multi-atleta.');
  }

  return mapCloudAthlete(data[0]);
}

export async function syncCurrentAthleteToLocalStore(store) {
  const cloudAthlete = await loadCurrentAthlete();

  store.update(state => {
    state.athlete = {
      ...state.athlete,
      ...cloudAthlete,
    };
    state.meta.cloudAthleteSyncedAt = new Date().toISOString();
  });

  return cloudAthlete;
}
