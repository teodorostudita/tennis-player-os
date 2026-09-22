import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const APP_URL = 'https://tennis.polidorionline.it';

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
  email?: string;
  displayName?: string;
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

  throw new Error('Troppi account da scandire: impossibile completare la ricerca email.');
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
    const athleteId = String(body.athleteId ?? '').trim();
    const email = normalizeEmail(body.email);
    const displayName = String(body.displayName ?? '').trim();
    const temporaryPassword = String(body.temporaryPassword ?? '');
    const role = body.role === 'admin' ? 'admin' : 'member';
    const permissions = normalizePermissions(body.permissions);

    if (!athleteId) {
      return json({ error: 'Atleta non specificato.' }, 400, origin);
    }

    if (!email || !email.includes('@')) {
      return json({ error: 'Indirizzo email non valido.' }, 400, origin);
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

    const { data: isOwner, error: ownerError } = await callerClient.rpc(
      'is_athlete_owner',
      { p_athlete_id: athleteId },
    );

    if (ownerError) throw ownerError;

    if (!isOwner) {
      return json(
        { error: 'Solo il proprietario dell’atleta può gestire gli utenti.' },
        403,
        origin,
      );
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

    let targetUser = await findUserByEmail(adminClient, email);
    const accountCreated = !targetUser;

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
          user_metadata: displayName
            ? { full_name: displayName }
            : {},
        });

      if (createError) throw createError;
      if (!createdData.user) {
        throw new Error('Supabase non ha restituito l’utente creato.');
      }

      targetUser = createdData.user;
      newlyCreatedUserId = targetUser.id;
    }

    const { data: existingMembership, error: membershipReadError } =
      await adminClient
        .from('athlete_members')
        .select('role')
        .eq('athlete_id', athleteId)
        .eq('user_id', targetUser.id)
        .maybeSingle();

    if (membershipReadError) throw membershipReadError;

    if (existingMembership?.role === 'owner') {
      return json(
        { error: 'L’owner dell’atleta è protetto e non può essere modificato da questo form.' },
        400,
        origin,
      );
    }

    if (displayName) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', targetUser.id);

      if (profileError) throw profileError;
    }

    const { data: accountRoleRow, error: accountRoleReadError } =
      await adminClient
        .from('account_access')
        .select('role, can_create_athletes, must_change_password')
        .eq('user_id', targetUser.id)
        .maybeSingle();

    if (accountRoleReadError) throw accountRoleReadError;

    if (accountCreated) {
      const { error: accountRoleUpdateError } = await adminClient
        .from('account_access')
        .upsert(
          {
            user_id: targetUser.id,
            role: role === 'admin' ? 'admin' : 'member',
            can_create_athletes: role === 'admin',
            must_change_password: true,
          },
          {
            onConflict: 'user_id',
          },
        );

      if (accountRoleUpdateError) throw accountRoleUpdateError;
    } else if (role === 'admin' && accountRoleRow?.role !== 'owner') {
      const { error: accountRoleUpdateError } = await adminClient
        .from('account_access')
        .upsert(
          {
            user_id: targetUser.id,
            role: 'admin',
            can_create_athletes: true,
          },
          {
            onConflict: 'user_id',
          },
        );

      if (accountRoleUpdateError) throw accountRoleUpdateError;
    } else if (!accountRoleRow) {
      const { error: accountRoleInsertError } = await adminClient
        .from('account_access')
        .insert({
          user_id: targetUser.id,
          role: 'member',
          can_create_athletes: false,
          must_change_password: false,
        });

      if (accountRoleInsertError) throw accountRoleInsertError;
    }

    const { error: membershipError } = await adminClient
      .from('athlete_members')
      .upsert(
        {
          athlete_id: athleteId,
          user_id: targetUser.id,
          role,
          status: 'active',
          created_by: callerData.user.id,
        },
        {
          onConflict: 'athlete_id,user_id',
        },
      );

    if (membershipError) throw membershipError;

    const { error: clearPermissionsError } = await adminClient
      .from('module_permissions')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('user_id', targetUser.id);

    if (clearPermissionsError) throw clearPermissionsError;

    if (role === 'member' && permissions.length) {
      const { error: permissionError } = await adminClient
        .from('module_permissions')
        .insert(
          permissions.map(permission => ({
            athlete_id: athleteId,
            user_id: targetUser!.id,
            module_key: permission.module_key,
            can_read: permission.can_read,
            can_write: permission.can_write,
            created_by: callerData.user.id,
          })),
        );

      if (permissionError) throw permissionError;
    }

    return json(
      {
        ok: true,
        userId: targetUser.id,
        email,
        role,
        accountCreated,
        passwordChangeRequired: accountCreated,
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
