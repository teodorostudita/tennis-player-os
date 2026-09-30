import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const APP_URL = 'https://tennis.polidorionline.it';
const BETA_OWNER_MAIL_URL = 'https://www.polidorionline.it/TennisPlayerOS/beta-owner-invite.php';
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]);

type RequestBody = {
  email?: string;
  displayName?: string;
};

type AccountAccessSnapshot = {
  role: string;
  can_create_athletes: boolean;
} | null;

function inviteRedirectUrl(email: string) {
  const url = new URL(APP_URL);
  url.searchParams.set('tpos_invite', '1');
  url.searchParams.set('tpos_invite_email', email);
  return url.toString();
}

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: Record<string, unknown>, status = 200, origin: string | null = null) {
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

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find(user => normalizeEmail(user.email) === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  throw new Error('Impossibile completare la ricerca dell’account.');
}

async function readAccountAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<AccountAccessSnapshot> {
  const { data, error } = await adminClient
    .from('account_access')
    .select('role, can_create_athletes')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return data
    ? {
        role: String(data.role || ''),
        can_create_athletes: Boolean(data.can_create_athletes),
      }
    : null;
}

async function sendBetaOwnerMail({
  authorization,
  email,
  displayName,
  inviteUrl,
  existingAccount,
}: {
  authorization: string;
  email: string;
  displayName: string;
  inviteUrl: string;
  existingAccount: boolean;
}) {
  const response = await fetch(BETA_OWNER_MAIL_URL, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      email,
      displayName,
      inviteUrl,
      existingAccount,
    }),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch (_) {
    // HTTP status below will provide the useful failure if response is not JSON.
  }

  if (!response.ok || payload?.ok !== true) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : `Invio email Founding Beta non riuscito (${response.status}).`;
    throw new Error(message);
  }
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'Origin non autorizzata.' }, 403, origin);
    }
    return new Response('ok', { headers: corsHeaders(origin) });
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

  let newlyCreatedUserId = '';
  let reservedUserId = '';
  let previousAccess: AccountAccessSnapshot = null;
  let accessChanged = false;

  try {
    const body = await req.json() as RequestBody;
    const email = normalizeEmail(body.email);
    const displayName = String(body.displayName ?? '').trim();

    if (!email || !email.includes('@')) {
      return json({ error: 'Indirizzo email non valido.' }, 400, origin);
    }

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
      return json({ error: 'Sessione non valida.' }, 401, origin);
    }

    const { data: ownerAllowed, error: ownerError } = await callerClient.rpc('is_app_owner');
    if (ownerError) throw ownerError;
    if (!ownerAllowed) {
      return json({ error: 'Solo l’Owner globale può creare account Founding Beta.' }, 403, origin);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: initialStatus, error: statusError } = await adminClient.rpc('get_founding_beta_status');
    if (statusError) throw statusError;
    if (initialStatus?.full || Number(initialStatus?.remaining ?? 0) <= 0) {
      return json({ error: 'Tutti i 30 posti Founding Beta sono già stati assegnati.' }, 409, origin);
    }

    let targetUser = await findUserByEmail(adminClient, email);
    let invitationSent = false;
    let inviteUrl = '';

    if (targetUser) {
      previousAccess = await readAccountAccess(adminClient, targetUser.id);

      // The global application owner is infrastructure, not one of the 30 Beta Owners.
      if (previousAccess?.role === 'owner') {
        return json({
          error: 'Questo indirizzo appartiene già all’Owner globale e non può occupare un posto Founding Beta.',
        }, 409, origin);
      }

      if (displayName) {
        const { error: profileError } = await adminClient
          .from('profiles')
          .update({ display_name: displayName })
          .eq('id', targetUser.id);
        if (profileError) throw profileError;
      }
    } else {
      // Generate the Supabase invite link, but do not ask Supabase to deliver the email.
      // TPOS delivers it through the same iCloud SMTP channel already used by the public Beta site.
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: inviteRedirectUrl(email),
          data: {
            ...(displayName ? { full_name: displayName } : {}),
            tpos_beta: 'founding_beta',
          },
        },
      });

      if (linkError) throw linkError;
      if (!linkData?.user) throw new Error('Supabase non ha restituito l’utente invitato.');

      const properties = linkData.properties as Record<string, unknown> | undefined;
      inviteUrl = String(properties?.action_link ?? properties?.actionLink ?? '').trim();
      if (!inviteUrl) throw new Error('Supabase non ha restituito il link di attivazione.');

      targetUser = linkData.user;
      newlyCreatedUserId = targetUser.id;
      invitationSent = true;
      previousAccess = await readAccountAccess(adminClient, targetUser.id);
    }

    const { data: betaStatus, error: reserveError } = await adminClient.rpc(
      'reserve_founding_beta_slot',
      {
        p_user_id: targetUser.id,
        p_email: email,
        p_display_name: displayName || null,
        p_created_by: callerData.user.id,
      },
    );

    if (reserveError) throw reserveError;
    reservedUserId = targetUser.id;

    if (previousAccess?.role !== 'owner') {
      const { error: accessError } = await adminClient
        .from('account_access')
        .upsert(
          {
            user_id: targetUser.id,
            role: 'admin',
            can_create_athletes: true,
          },
          { onConflict: 'user_id' },
        );
      if (accessError) throw accessError;
      accessChanged = true;
    }

    await sendBetaOwnerMail({
      authorization,
      email,
      displayName,
      inviteUrl,
      existingAccount: !invitationSent,
    });

    return json({
      ok: true,
      userId: targetUser.id,
      email,
      displayName,
      invitationSent,
      emailDelivery: 'tpos_smtp',
      accountRole: 'admin',
      beta: betaStatus,
    }, 200, origin);
  } catch (error) {
    console.error('create-beta-owner failed:', error);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (reservedUserId) {
      try {
        await adminClient
          .from('beta_accounts')
          .delete()
          .eq('user_id', reservedUserId)
          .eq('program_code', 'founding_beta');
      } catch (cleanupError) {
        console.error('Failed to release beta slot:', cleanupError);
      }
    }

    if (accessChanged && reservedUserId && !newlyCreatedUserId) {
      try {
        if (previousAccess) {
          await adminClient
            .from('account_access')
            .upsert(
              {
                user_id: reservedUserId,
                role: previousAccess.role,
                can_create_athletes: previousAccess.can_create_athletes,
              },
              { onConflict: 'user_id' },
            );
        } else {
          await adminClient
            .from('account_access')
            .delete()
            .eq('user_id', reservedUserId);
        }
      } catch (cleanupError) {
        console.error('Failed to restore previous account access:', cleanupError);
      }
    }

    if (newlyCreatedUserId) {
      try {
        await adminClient
          .from('account_access')
          .delete()
          .eq('user_id', newlyCreatedUserId);
      } catch (cleanupError) {
        console.error('Failed to clean up account access:', cleanupError);
      }

      try {
        const { error: cleanupError } = await adminClient.auth.admin.deleteUser(newlyCreatedUserId);
        if (cleanupError) console.error('Failed to clean up invited user:', cleanupError);
      } catch (cleanupError) {
        console.error('Failed to clean up invited user:', cleanupError);
      }
    }

    const message = error instanceof Error
      ? error.message
      : 'Errore durante la creazione dell’account Founding Beta.';

    return json({ error: message }, 500, origin);
  }
});
