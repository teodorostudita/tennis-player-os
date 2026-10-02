import { supabase } from './supabaseClient.js';
import { normalizeUserType } from '../data/userTypes.js';
import { loginFromEmail } from './loginIdentity.js';

let currentAccountAccess = {
  role: 'member',
  canCreateAthletes: false,
  athleteCreationLimit: null,
  userType: 'custom',
  displayName: '',
  username: '',
};

export async function loadCurrentAccountAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    throw userError || new Error('Account autenticato non disponibile.');
  }

  const [
    { data, error },
    { data: effectiveCreate, error: createError },
    { data: profileData, error: profileError },
  ] = await Promise.all([
    supabase
      .from('account_access')
      .select('role, can_create_athletes, athlete_creation_limit')
      .eq('user_id', userData.user.id)
      .single(),
    supabase.rpc('can_create_athletes'),
    supabase
      .from('profiles')
      .select('user_type, display_name')
      .eq('id', userData.user.id)
      .maybeSingle(),
  ]);

  if (error) {
    throw new Error(`Impossibile leggere il ruolo account: ${error.message}`);
  }

  if (createError) {
    throw new Error(`Impossibile leggere il limite creazione atleta: ${createError.message}`);
  }

  if (profileError) {
    throw new Error(`Impossibile leggere il profilo utente: ${profileError.message}`);
  }

  currentAccountAccess = {
    role: data?.role || 'member',
    canCreateAthletes: Boolean(effectiveCreate),
    athleteCreationLimit: data?.athlete_creation_limit == null
      ? null
      : Number(data.athlete_creation_limit),
    userType: normalizeUserType(profileData?.user_type),
    displayName: String(profileData?.display_name || '').trim(),
    username: loginFromEmail(userData.user.email || ''),
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

export function getCurrentUserType() {
  return currentAccountAccess.userType;
}

export function getCurrentUserDisplayName() {
  return currentAccountAccess.displayName || currentAccountAccess.username || 'Utente';
}
