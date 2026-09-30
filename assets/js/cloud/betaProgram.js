import { supabase } from './supabaseClient.js';

function normalizeStatus(value = {}) {
  const capacity = Math.max(0, Number(value?.capacity ?? 30));
  const active = Math.max(0, Number(value?.active ?? 0));
  const remaining = Math.max(0, Number(value?.remaining ?? (capacity - active)));

  return {
    ok: value?.ok !== false,
    capacity,
    active,
    remaining,
    full: Boolean(value?.full) || remaining <= 0,
    status: String(value?.status || 'active'),
  };
}

export async function loadFoundingBetaStatus() {
  const { data, error } = await supabase.rpc('get_founding_beta_status');
  if (error) {
    throw new Error(`Impossibile leggere lo stato Founding Beta: ${error.message}`);
  }
  return normalizeStatus(data);
}

export async function createFoundingBetaOwner({ email, displayName = '' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(displayName || '').trim();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Inserisci un indirizzo email valido.');
  }

  const { data, error } = await supabase.functions.invoke('create-beta-owner', {
    body: {
      email: normalizedEmail,
      displayName: normalizedName,
    },
  });

  if (error) {
    let message = error.message || 'Impossibile creare l’account Founding Beta.';
    try {
      const context = await error.context?.json?.();
      if (context?.error) message = context.error;
    } catch (_) {
      // Keep the Supabase error message.
    }
    throw new Error(message);
  }

  if (data?.error) throw new Error(data.error);

  return {
    ...data,
    beta: normalizeStatus(data?.beta || {}),
  };
}
