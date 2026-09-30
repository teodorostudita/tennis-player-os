import { supabase } from './supabaseClient.js';

let currentAccountAccess = {
  role: 'member',
  canCreateAthletes: false,
  athleteCreationLimit: null,
};

export async function loadCurrentAccountAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    throw userError || new Error('Account autenticato non disponibile.');
  }

  const [{ data, error }, { data: effectiveCreate, error: createError }] = await Promise.all([
    supabase
      .from('account_access')
      .select('role, can_create_athletes, athlete_creation_limit')
      .eq('user_id', userData.user.id)
      .single(),
    supabase.rpc('can_create_athletes'),
  ]);

  if (error) {
    throw new Error(`Impossibile leggere il ruolo account: ${error.message}`);
  }

  if (createError) {
    throw new Error(`Impossibile leggere il limite creazione atleta: ${createError.message}`);
  }

  currentAccountAccess = {
    role: data?.role || 'member',
    canCreateAthletes: Boolean(effectiveCreate),
    athleteCreationLimit: data?.athlete_creation_limit == null
      ? null
      : Number(data.athlete_creation_limit),
  };

  return { ...currentAccountAccess };
}

export function getCurrentAccountAccess() {
  return { ...currentAccountAccess };
}

export function canCreateAthletes() {
  return Boolean(currentAccountAccess.canCreateAthletes);
}

export function isAppOwner() {
  return currentAccountAccess.role === 'owner';
}
