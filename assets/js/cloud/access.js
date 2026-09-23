import { supabase } from './supabaseClient.js';
import { loginFromEmail } from './loginIdentity.js';

const MODULE_KEYS = [
  'development',
  'training',
  'drills',
  'competition',
  'opponents',
  'equipment',
  'health',
  'nutrition',
  'mental',
  'visual',
  'economics',
  'calendar',
];

let currentAccess = {
  athleteId: '',
  userId: '',
  role: '',
  status: '',
  isOwner: false,
  isAdmin: false,
  modules: Object.fromEntries(
    MODULE_KEYS.map(key => [key, { canRead: false, canWrite: false }]),
  ),
};

export async function loadCurrentAccess(athleteId) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`Impossibile leggere l'account corrente: ${userError.message}`);
  }

  const user = userData?.user;
  if (!user) {
    throw new Error('Account autenticato non disponibile.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('athlete_members')
    .select('role, status')
    .eq('athlete_id', athleteId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Impossibile leggere il ruolo sull'atleta: ${membershipError.message}`);
  }

  if (!membership || membership.status !== 'active') {
    throw new Error('Questo account non ha un accesso attivo all’atleta selezionato.');
  }

  const { data: permissionRows, error: permissionError } = await supabase
    .from('module_permissions')
    .select('module_key, can_read, can_write')
    .eq('athlete_id', athleteId)
    .eq('user_id', user.id);

  if (permissionError) {
    throw new Error(`Impossibile leggere i permessi dei moduli: ${permissionError.message}`);
  }

  const isOwner = membership.role === 'owner';
  const isAdmin = isOwner || membership.role === 'admin';
  const modules = Object.fromEntries(
    MODULE_KEYS.map(key => [key, {
      canRead: isAdmin,
      canWrite: isAdmin,
    }]),
  );

  if (!isAdmin) {
    for (const row of permissionRows || []) {
      if (!modules[row.module_key]) continue;
      modules[row.module_key] = {
        canRead: Boolean(row.can_read),
        canWrite: Boolean(row.can_write),
      };
    }
  }

  currentAccess = {
    athleteId,
    userId: user.id,
    role: membership.role,
    status: membership.status,
    isOwner,
    isAdmin,
    modules,
  };

  return getCurrentAccess();
}

export function getCurrentAccess() {
  return structuredClone(currentAccess);
}

export function canReadModule(moduleKey) {
  return Boolean(currentAccess.modules?.[moduleKey]?.canRead);
}

export function canWriteModule(moduleKey) {
  return Boolean(currentAccess.modules?.[moduleKey]?.canWrite);
}

export async function loadAthleteAccessDirectory(athleteId) {
  if (!currentAccess.isOwner || currentAccess.athleteId !== athleteId) {
    throw new Error('Solo il proprietario dell’atleta può gestire gli accessi.');
  }

  const { data: members, error: membersError } = await supabase.rpc(
    'get_athlete_member_directory',
    { p_athlete_id: athleteId },
  );

  if (membersError) {
    throw new Error(`Impossibile leggere gli utenti dell’atleta: ${membersError.message}`);
  }

  const { data: permissions, error: permissionsError } = await supabase
    .from('module_permissions')
    .select('user_id, module_key, can_read, can_write')
    .eq('athlete_id', athleteId);

  if (permissionsError) {
    throw new Error(`Impossibile leggere i privilegi: ${permissionsError.message}`);
  }

  const byUser = new Map();

  for (const row of permissions || []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, {});
    byUser.get(row.user_id)[row.module_key] = {
      canRead: Boolean(row.can_read),
      canWrite: Boolean(row.can_write),
    };
  }

  return (members || []).map(member => ({
    userId: member.user_id,
    email: member.email || '',
    login: loginFromEmail(member.email || ''),
    displayName: member.display_name || '',
    role: member.role || 'member',
    status: member.status || 'active',
    createdAt: member.created_at || '',
    permissions: byUser.get(member.user_id) || {},
  }));
}

export async function loadUserAthleteAssignments(userId) {
  if (!currentAccess.isOwner) {
    throw new Error('Solo il proprietario può leggere le assegnazioni degli utenti.');
  }

  if (!userId) {
    throw new Error('Utente non specificato.');
  }

  const { data, error } = await supabase
    .from('athlete_members')
    .select('athlete_id, role, status')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Impossibile leggere gli atleti assegnati: ${error.message}`);
  }

  return (data || []).map(row => ({
    athleteId: row.athlete_id,
    role: row.role || 'member',
    status: row.status || 'active',
  }));
}

export async function createOrUpdateAthleteAccess({
  athleteId,
  athleteIds = [],
  managedAthleteIds = [],
  userId = '',
  syncAssignments = false,
  login = '',
  email = '',
  temporaryPassword = '',
  role = 'member',
  permissions = [],
}) {
  if (!currentAccess.isOwner || currentAccess.athleteId !== athleteId) {
    throw new Error('Solo il proprietario dell’atleta può gestire gli accessi.');
  }

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      athleteId,
      athleteIds,
      managedAthleteIds,
      userId,
      syncAssignments,
      login: login || email,
      temporaryPassword,
      role,
      permissions,
    },
  });

  if (error) {
    let message = error.message || 'Errore durante la gestione dell’utente.';

    try {
      const context = error.context;
      if (context && typeof context.json === 'function') {
        const payload = await context.json();
        if (payload?.error) message = payload.error;
      }
    } catch {
      // Keep the original message.
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function removeAthleteUser({
  athleteId,
  userId,
}) {
  if (!currentAccess.isOwner || currentAccess.athleteId !== athleteId) {
    throw new Error('Solo il proprietario dell’atleta può rimuovere utenti.');
  }

  if (!userId) {
    throw new Error('Utente non specificato.');
  }

  const { data, error } = await supabase.functions.invoke('remove-user', {
    body: {
      athleteId,
      userId,
    },
  });

  if (error) {
    let message = error.message || 'Errore durante la rimozione dell’utente.';

    try {
      const context = error.context;
      if (context && typeof context.json === 'function') {
        const payload = await context.json();
        if (payload?.error) message = payload.error;
      }
    } catch {
      // Keep the original message.
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

// Compatibility for any code still importing the old function name.
export const inviteOrUpdateAthleteAccess = createOrUpdateAthleteAccess;
