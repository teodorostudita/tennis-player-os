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

type RequestBody = {
  athleteId?: string;
  userId?: string;
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
    return json({ error: 'Configurazione server incompleta.' }, 500, origin);
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'Sessione non disponibile.' }, 401, origin);
  }

  try {
    const body = await req.json() as RequestBody;
    const athleteId = String(body.athleteId ?? '').trim();
    const targetUserId = String(body.userId ?? '').trim();

    if (!athleteId || !targetUserId) {
      return json({ error: 'Atleta o utente non specificato.' }, 400, origin);
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
        { error: 'Solo il proprietario dell’atleta può rimuovere utenti.' },
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

    const { data: membership, error: membershipError } =
      await adminClient
        .from('athlete_members')
        .select('role')
        .eq('athlete_id', athleteId)
        .eq('user_id', targetUserId)
        .maybeSingle();

    if (membershipError) throw membershipError;

    if (!membership) {
      return json({ error: 'L’utente non è associato a questo atleta.' }, 404, origin);
    }

    if (membership.role === 'owner') {
      return json(
        { error: 'L’owner dell’atleta è protetto e non può essere rimosso.' },
        400,
        origin,
      );
    }

    const { error: permissionDeleteError } = await adminClient
      .from('module_permissions')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('user_id', targetUserId);

    if (permissionDeleteError) throw permissionDeleteError;

    const { error: membershipDeleteError } = await adminClient
      .from('athlete_members')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('user_id', targetUserId);

    if (membershipDeleteError) throw membershipDeleteError;

    const { data: remainingMemberships, error: remainingError } =
      await adminClient
        .from('athlete_members')
        .select('role, status')
        .eq('user_id', targetUserId);

    if (remainingError) throw remainingError;

    const remaining = remainingMemberships ?? [];
    const accountDeleted = remaining.length === 0;

    if (accountDeleted) {
      const { data: accountAccess, error: accountAccessError } =
        await adminClient
          .from('account_access')
          .select('role')
          .eq('user_id', targetUserId)
          .maybeSingle();

      if (accountAccessError) throw accountAccessError;

      if (accountAccess?.role === 'owner') {
        throw new Error('L’owner globale non può essere eliminato.');
      }

      const { error: deleteUserError } =
        await adminClient.auth.admin.deleteUser(targetUserId);

      if (deleteUserError) throw deleteUserError;
    } else {
      const hasActiveAdmin = remaining.some(
        item => item.status === 'active' && item.role === 'admin',
      );

      const { data: accountAccess, error: accountAccessError } =
        await adminClient
          .from('account_access')
          .select('role')
          .eq('user_id', targetUserId)
          .maybeSingle();

      if (accountAccessError) throw accountAccessError;

      if (accountAccess?.role !== 'owner') {
        const { error: accountUpdateError } = await adminClient
          .from('account_access')
          .upsert(
            {
              user_id: targetUserId,
              role: hasActiveAdmin ? 'admin' : 'member',
              can_create_athletes: hasActiveAdmin,
            },
            {
              onConflict: 'user_id',
            },
          );

        if (accountUpdateError) throw accountUpdateError;
      }
    }

    return json(
      {
        ok: true,
        userId: targetUserId,
        accountDeleted,
        remainingAthleteCount: remaining.length,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('remove-user failed:', error);

    const message = error instanceof Error
      ? error.message
      : 'Errore sconosciuto durante la rimozione dell’utente.';

    return json({ error: message }, 500, origin);
  }
});
