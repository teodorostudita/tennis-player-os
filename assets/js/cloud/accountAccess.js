import { supabase } from './supabaseClient.js';

let currentAccountAccess = {
  role: 'member',
  canCreateAthletes: false,
};

export async function loadCurrentAccountAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    throw userError || new Error('Account autenticato non disponibile.');
  }

  const { data, error } = await supabase
    .from('account_access')
    .select('role, can_create_athletes')
    .eq('user_id', userData.user.id)
    .single();

  if (error) {
    throw new Error(`Impossibile leggere il ruolo account: ${error.message}`);
  }

  currentAccountAccess = {
    role: data?.role || 'member',
    canCreateAthletes: Boolean(data?.can_create_athletes),
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
