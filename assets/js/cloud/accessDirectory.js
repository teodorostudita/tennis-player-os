import { supabase } from './supabaseClient.js';

function normalizePermission(permission = {}) {
  return {
    moduleKey: String(permission.moduleKey || permission.module_key || '').trim(),
    canRead: Boolean(permission.canRead ?? permission.can_read),
    canWrite: Boolean(permission.canWrite ?? permission.can_write),
  };
}

function normalizeAssignment(assignment = {}) {
  return {
    athleteId: String(assignment.athleteId || assignment.athlete_id || '').trim(),
    role: String(assignment.role || 'member'),
    status: String(assignment.status || 'active'),
    permissions: Array.isArray(assignment.permissions)
      ? assignment.permissions.map(normalizePermission).filter(item => item.moduleKey)
      : [],
  };
}

function normalizeWorkspace(payload = {}) {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  return {
    athletes: Array.isArray(root.athletes)
      ? root.athletes.map(athlete => ({
          id: String(athlete.id || '').trim(),
          firstName: String(athlete.firstName || ''),
          lastName: String(athlete.lastName || ''),
          displayName: String(athlete.displayName || ''),
          createdAt: String(athlete.createdAt || ''),
        })).filter(athlete => athlete.id)
      : [],
    users: Array.isArray(root.users)
      ? root.users.map(user => ({
          userId: String(user.userId || '').trim(),
          email: String(user.email || ''),
          displayName: String(user.displayName || ''),
          accountRole: String(user.accountRole || 'member'),
          strongestRole: String(user.strongestRole || 'member'),
          hasOwnerRole: Boolean(user.hasOwnerRole),
          firstCreatedAt: String(user.firstCreatedAt || ''),
          assignments: Array.isArray(user.assignments)
            ? user.assignments.map(normalizeAssignment).filter(item => item.athleteId)
            : [],
        })).filter(user => user.userId)
      : [],
  };
}

export async function loadOwnerAccessWorkspace() {
  const { data, error } = await supabase.rpc('get_owner_access_workspace');

  if (error) {
    throw new Error(`Impossibile leggere utenti e privilegi: ${error.message}`);
  }

  return normalizeWorkspace(data);
}

export async function replaceOwnerUserAccess({
  userId,
  assignments = [],
  removeMissing = true,
} = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('Utente non specificato.');
  }

  const payload = assignments.map(assignment => ({
    athleteId: String(assignment.athleteId || '').trim(),
    role: assignment.role === 'admin' ? 'admin' : 'member',
    permissions: Array.isArray(assignment.permissions)
      ? assignment.permissions.map(normalizePermission).filter(permission => permission.moduleKey)
      : [],
  }));

  if (!payload.length) {
    throw new Error('Seleziona almeno un atleta.');
  }

  const { data, error } = await supabase.rpc('replace_owner_user_access', {
    p_user_id: normalizedUserId,
    p_assignments: payload,
    p_remove_missing: Boolean(removeMissing),
  });

  if (error) {
    throw new Error(`Impossibile salvare i privilegi: ${error.message}`);
  }

  return data || { ok: true };
}
