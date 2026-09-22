import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const APP_URL = 'https://tennis.polidorionline.it';
const INVITE_REDIRECT_URL = `${APP_URL}/?tpos_invite=1`;

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

type InviteBody = {
  athleteId?: string;
  email?: string;
  displayName?: string;
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
  const byModule = new Map<string, { module_key: string; can_read: boolean; can_write: boolean }>();

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

  try {
    const body = await req.json() as InviteBody;
    const athleteId = String(body.athleteId ?? '').trim();
    const email = normalizeEmail(body.email);
    const displayName = String(body.displayName ?? '').trim();
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

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();

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
        { error: 'Solo il proprietario dell’atleta può gestire gli accessi.' },
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
    let invitationSent = false;
    let newlyInvitedUserId = '';

    if (!targetUser) {
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: INVITE_REDIRECT_URL,
          data: displayName ? { full_name: displayName } : {},
        });

      if (inviteError) throw inviteError;
      if (!inviteData.user) {
        throw new Error('Supabase non ha restituito l’utente invitato.');
      }

      targetUser = inviteData.user;
      newlyInvitedUserId = targetUser.id;
      invitationSent = true;
    } else if (displayName) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', targetUser.id);

      if (profileError) throw profileError;
    }

    try {
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
    } catch (error) {
      // If this request created a brand-new Auth account but failed before
      // granting the requested athlete access, remove that incomplete account.
      if (newlyInvitedUserId) {
        const { error: cleanupError } =
          await adminClient.auth.admin.deleteUser(newlyInvitedUserId);

        if (cleanupError) {
          console.error('Failed to clean up incomplete invited user:', cleanupError);
        }
      }

      throw error;
    }

    return json(
      {
        ok: true,
        userId: targetUser.id,
        email,
        role,
        invitationSent,
        permissionCount: role === 'member' ? permissions.length : 0,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('invite-user failed:', error);

    const message = error instanceof Error
      ? error.message
      : 'Errore sconosciuto durante la gestione dell’accesso.';

    return json({ error: message }, 500, origin);
  }
});
