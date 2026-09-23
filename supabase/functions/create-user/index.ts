import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const APP_URL = 'https://tennis.polidorionline.it';
const TECHNICAL_LOGIN_DOMAIN = 'users.tennis.polidorionline.it';
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_ORIGINS = new Set([
  APP_URL,
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]);

const MODULE_KEYS = new Set([
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
]);

type PermissionInput = {
  moduleKey?: string;
  canRead?: boolean;
  canWrite?: boolean;
};

type RequestBody = {
  athleteId?: string;
  athleteIds?: string[];
  managedAthleteIds?: string[];
  userId?: string;
  syncAssignments?: boolean;
  login?: string;
  email?: string;
  temporaryPassword?: string;
  role?: 'admin' | 'member';
  permissions?: PermissionInput[];
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : APP_URL;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(
  body: Record<string, unknown>,
  status = 200,
  origin: string | null = null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeUsername(value: unknown) {
  const username = String(value ?? '').trim().toLowerCase();

  if (!USERNAME_RE.test(username)) {
    throw new Error(
      'Il nome utente deve avere 3–40 caratteri e può contenere solo lettere, numeri, punto, trattino e underscore.',
    );
  }

  return username;
}

function resolveLogin(value: unknown) {
  const login = String(value ?? '').trim().toLowerCase();

  if (!login) {
    throw new Error('Nome utente non specificato.');
  }

  if (login.includes('@')) {
    const email = normalizeEmail(login);
    return {
      login: email,
      email,
      technical: false,
    };
  }

  const username = normalizeUsername(login);

  return {
    login: username,
    email: `${username}@${TECHNICAL_LOGIN_DOMAIN}`,
    technical: true,
  };
}

function normalizeIdList(
  values: unknown,
  fallback: unknown = '',
  label = 'atleta',
) {
  const source = Array.isArray(values) && values.length
    ? values
    : fallback
      ? [fallback]
      : [];

  const unique = [...new Set(
    source
      .map(value => String(value ?? '').trim())
      .filter(Boolean),
  )];

  for (const id of unique) {
    if (!UUID_RE.test(id)) {
      throw new Error(`Identificativo ${label} non valido.`);
    }
  }

  return unique;
}

function normalizePermissions(input: PermissionInput[] | undefined) {
  const byModule = new Map<string, {
    module_key: string;
    can_read: boolean;
    can_write: boolean;
  }>();

  for (const raw of input ?? []) {
    const moduleKey = String(raw?.moduleKey ?? '').trim();

    if (!MODULE_KEYS.has(moduleKey)) {
      throw new Error(`Modulo non valido: ${moduleKey || '(vuoto)'}.`);
    }

    const canWrite = Boolean(raw?.canWrite);
    const canRead = Boolean(raw?.canRead) || canWrite;

    if (!canRead) continue;

    byModule.set(moduleKey, {
      module_key: moduleKey,
      can_read: true,
      can_write: canWrite,
    });
  }

  return [...byModule.values()];
}

async function findUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  let page = 1;

  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const match = data.users.find(
      user => String(user.email ?? '').trim().toLowerCase() === email,
    );

    if (match) return match;
    if (data.users.length < 1000) return null;

    page += 1;
  }

  throw new Error('Troppi account da scandire: impossibile completare la ricerca del nome utente.');
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'Origin non autorizzata.' }, 403, origin);
    }

    return new Response('ok', {
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Metodo non consentito.' }, 405, origin);
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'Origin non autorizzata.' }, 403, origin);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase environment variables.');
    return json({ error: 'Configurazione server incompleta.' }, 500, origin);
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'Sessione non disponibile.' }, 401, origin);
  }

  let newlyCreatedUserId = '';

  try {
    const body = await req.json() as RequestBody;
    const sourceAthleteId = String(body.athleteId ?? '').trim();
    const athleteIds = normalizeIdList(
      body.athleteIds,
      sourceAthleteId,
      'atleta',
    );
    const managedAthleteIds = normalizeIdList(
      body.managedAthleteIds,
      '',
      'atleta',
    );
    const requestedUserId = String(body.userId ?? '').trim();
    const syncAssignments = Boolean(body.syncAssignments);
    const resolvedLogin = resolveLogin(body.login ?? body.email);
    const login = resolvedLogin.login;
    const email = resolvedLogin.email;
    const temporaryPassword = String(body.temporaryPassword ?? '');
    const role = body.role === 'admin' ? 'admin' : 'member';
    const permissions = normalizePermissions(body.permissions);

    if (!sourceAthleteId || !UUID_RE.test(sourceAthleteId)) {
      return json({ error: 'Atleta attivo non valido.' }, 400, origin);
    }

    if (!athleteIds.length) {
      return json({ error: 'Seleziona almeno un atleta.' }, 400, origin);
    }

    if (syncAssignments && !requestedUserId) {
      return json({ error: 'Utente da modificare non specificato.' }, 400, origin);
    }

    if (syncAssignments && !UUID_RE.test(requestedUserId)) {
      return json({ error: 'Identificativo utente non valido.' }, 400, origin);
    }

    const managedScope = syncAssignments
      ? [...new Set([
          ...managedAthleteIds,
          ...athleteIds,
          sourceAthleteId,
        ])]
      : athleteIds;

    if (syncAssignments && managedAthleteIds.length) {
      const managedSet = new Set(managedAthleteIds);
      const outsideManaged = athleteIds.some(id => !managedSet.has(id));

      if (outsideManaged) {
        return json(
          { error: 'La selezione contiene un atleta fuori dall’elenco gestibile.' },
          400,
          origin,
        );
      }
    }

    const callerClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: callerData, error: callerError } =
      await callerClient.auth.getUser();

    if (callerError || !callerData.user) {
      return json({ error: 'Sessione non valida.' }, 401, origin);
    }

    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: callerOwnerships, error: ownershipError } =
      await adminClient
        .from('athlete_members')
        .select('athlete_id')
        .eq('user_id', callerData.user.id)
        .eq('role', 'owner')
        .eq('status', 'active')
        .in('athlete_id', managedScope);

    if (ownershipError) throw ownershipError;

    const ownedIds = new Set(
      (callerOwnerships ?? []).map(row => String(row.athlete_id)),
    );

    if (managedScope.some(athleteId => !ownedIds.has(athleteId))) {
      return json(
        { error: 'Puoi gestire utenti solo per atleti di cui sei Owner.' },
        403,
        origin,
      );
    }

    let targetUser = null;
    let accountCreated = false;

    if (requestedUserId) {
      const { data: targetData, error: targetError } =
        await adminClient.auth.admin.getUserById(requestedUserId);

      if (targetError) throw targetError;
      if (!targetData.user) {
        return json({ error: 'Account da modificare non trovato.' }, 404, origin);
      }

      targetUser = targetData.user;

      if (normalizeEmail(targetUser.email) !== email) {
        return json(
          { error: 'Il nome utente non corrisponde all’account selezionato.' },
          400,
          origin,
        );
      }
    } else {
      targetUser = await findUserByEmail(adminClient, email);
      accountCreated = !targetUser;

      if (!targetUser) {
        if (temporaryPassword.length < 8) {
          return json(
            {
              error:
                'L’account non esiste ancora: inserisci una password temporanea di almeno 8 caratteri.',
            },
            400,
            origin,
          );
        }

        const { data: createdData, error: createError } =
          await adminClient.auth.admin.createUser({
            email,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: {
              full_name: login,
              ...(resolvedLogin.technical ? { tpos_username: login } : {}),
            },
          });

        if (createError) throw createError;
        if (!createdData.user) {
          throw new Error('Supabase non ha restituito l’utente creato.');
        }

        targetUser = createdData.user;
        newlyCreatedUserId = targetUser.id;
      }
    }

    const { data: existingMemberships, error: membershipReadError } =
      await adminClient
        .from('athlete_members')
        .select('athlete_id, role, status')
        .eq('user_id', targetUser.id)
        .in('athlete_id', managedScope);

    if (membershipReadError) throw membershipReadError;

    const existingByAthlete = new Map(
      (existingMemberships ?? []).map(item => [String(item.athlete_id), item]),
    );

    let finalAthleteIds = [...athleteIds];
    let applySettingsIds = [...athleteIds];
    let removeIds: string[] = [];

    if (syncAssignments) {
      const protectedOwnerIds = (existingMemberships ?? [])
        .filter(item => item.role === 'owner')
        .map(item => String(item.athlete_id));

      const currentMembership = existingByAthlete.get(sourceAthleteId);

      if (currentMembership?.role === 'owner') {
        return json(
          { error: 'L’Owner dell’atleta attivo è protetto e non può essere modificato da questo form.' },
          400,
          origin,
        );
      }

      finalAthleteIds = [...new Set([
        ...athleteIds,
        ...protectedOwnerIds,
      ])];

      const finalSet = new Set(finalAthleteIds);

      removeIds = (existingMemberships ?? [])
        .filter(item =>
          item.role !== 'owner'
          && !finalSet.has(String(item.athlete_id))
        )
        .map(item => String(item.athlete_id));

      const newIds = finalAthleteIds.filter(
        athleteId => !existingByAthlete.has(athleteId),
      );

      applySettingsIds = [...new Set([
        ...newIds,
        ...(finalSet.has(sourceAthleteId) ? [sourceAthleteId] : []),
      ])].filter(athleteId => {
        const existing = existingByAthlete.get(athleteId);
        return existing?.role !== 'owner';
      });
    } else {
      const protectedConflict = (existingMemberships ?? []).some(
        item => item.role === 'owner',
      );

      if (protectedConflict) {
        return json(
          { error: 'L’Owner di un atleta è protetto e non può essere modificato da questo form.' },
          400,
          origin,
        );
      }
    }

    if (removeIds.length) {
      const { error: permissionDeleteError } = await adminClient
        .from('module_permissions')
        .delete()
        .eq('user_id', targetUser.id)
        .in('athlete_id', removeIds);

      if (permissionDeleteError) throw permissionDeleteError;

      const { error: membershipDeleteError } = await adminClient
        .from('athlete_members')
        .delete()
        .eq('user_id', targetUser.id)
        .in('athlete_id', removeIds);

      if (membershipDeleteError) throw membershipDeleteError;
    }

    if (applySettingsIds.length) {
      const { error: membershipError } = await adminClient
        .from('athlete_members')
        .upsert(
          applySettingsIds.map(athleteId => ({
            athlete_id: athleteId,
            user_id: targetUser!.id,
            role,
            status: 'active',
            created_by: callerData.user.id,
          })),
          {
            onConflict: 'athlete_id,user_id',
          },
        );

      if (membershipError) throw membershipError;

      const { error: clearPermissionsError } = await adminClient
        .from('module_permissions')
        .delete()
        .eq('user_id', targetUser.id)
        .in('athlete_id', applySettingsIds);

      if (clearPermissionsError) throw clearPermissionsError;

      if (role === 'member' && permissions.length) {
        const permissionRows = applySettingsIds.flatMap(athleteId =>
          permissions.map(permission => ({
            athlete_id: athleteId,
            user_id: targetUser!.id,
            module_key: permission.module_key,
            can_read: permission.can_read,
            can_write: permission.can_write,
            created_by: callerData.user.id,
          }))
        );

        const { error: permissionError } = await adminClient
          .from('module_permissions')
          .insert(permissionRows);

        if (permissionError) throw permissionError;
      }
    }

    const { data: accountRoleRow, error: accountRoleReadError } =
      await adminClient
        .from('account_access')
        .select('role, must_change_password')
        .eq('user_id', targetUser.id)
        .maybeSingle();

    if (accountRoleReadError) throw accountRoleReadError;

    if (accountRoleRow?.role !== 'owner') {
      const { data: remainingMemberships, error: remainingMembershipsError } =
        await adminClient
          .from('athlete_members')
          .select('role, status')
          .eq('user_id', targetUser.id);

      if (remainingMembershipsError) throw remainingMembershipsError;

      const hasAdminAccess = (remainingMemberships ?? []).some(
        item =>
          item.status === 'active'
          && (item.role === 'admin' || item.role === 'owner'),
      );

      const accountPayload: {
        user_id: string;
        role: 'admin' | 'member';
        can_create_athletes: boolean;
        must_change_password?: boolean;
      } = {
        user_id: targetUser.id,
        role: hasAdminAccess ? 'admin' : 'member',
        can_create_athletes: hasAdminAccess,
      };

      if (accountCreated) {
        accountPayload.must_change_password = true;
      } else if (!accountRoleRow) {
        accountPayload.must_change_password = false;
      }

      const { error: accountRoleUpdateError } = await adminClient
        .from('account_access')
        .upsert(
          accountPayload,
          { onConflict: 'user_id' },
        );

      if (accountRoleUpdateError) throw accountRoleUpdateError;
    }

    return json(
      {
        ok: true,
        userId: targetUser.id,
        login,
        email,
        role,
        accountCreated,
        passwordChangeRequired: accountCreated,
        athleteCount: finalAthleteIds.length,
        athleteIds: finalAthleteIds,
        removedAthleteCount: removeIds.length,
        updatedAthleteCount: applySettingsIds.length,
        permissionCount: role === 'member' ? permissions.length : 0,
      },
      200,
      origin,
    );
  } catch (error) {
    if (newlyCreatedUserId) {
      try {
        const cleanupClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );

        const { error: cleanupError } =
          await cleanupClient.auth.admin.deleteUser(newlyCreatedUserId);

        if (cleanupError) {
          console.error('Failed to clean up incomplete created user:', cleanupError);
        }
      } catch (cleanupError) {
        console.error('Failed to clean up incomplete created user:', cleanupError);
      }
    }

    console.error('create-user failed:', error);

    const message = error instanceof Error
      ? error.message
      : 'Errore sconosciuto durante la gestione dell’utente.';

    return json({ error: message }, 500, origin);
  }
});
