import { supabase } from './supabaseClient.js';
import {
  emailFromLogin,
  isTechnicalLoginEmail,
  loginFromEmail,
} from './loginIdentity.js';

let authGate = null;

const RECOVERY_PARAM = 'tpos_recovery';
const INVITE_PARAM = 'tpos_invite';
const INVITE_EMAIL_PARAM = 'tpos_invite_email';

function ensureAuthGate() {
  if (authGate?.isConnected) return authGate;

  authGate = document.createElement('div');
  authGate.className = 'auth-gate';
  document.body.appendChild(authGate);
  return authGate;
}

function renderLoginGate() {
  const gate = ensureAuthGate();
  gate.innerHTML = `
    <section class="auth-card" aria-labelledby="auth-title">
      <div class="auth-brand-mark" aria-hidden="true">🎾</div>
      <div class="auth-kicker">Tennis Player OS</div>
      <h1 id="auth-title">Accesso</h1>
      <p class="auth-intro">
        Accedi con l'account autorizzato per entrare nello spazio dell'atleta.
      </p>

      <form id="auth-login-form" class="auth-form">
        <label>
          <span>Nome utente o email</span>
          <input
            id="auth-login"
            name="login"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            id="auth-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <div id="auth-message" class="auth-message" role="status" aria-live="polite"></div>

        <button id="auth-submit" class="auth-submit" type="submit">
          Accedi
        </button>

        <button id="auth-forgot" class="auth-text-button" type="button">
          Password dimenticata?
        </button>
      </form>

      <p class="auth-footnote">
        Gli account vengono abilitati dall'amministratore di Tennis Player OS.
        Per gli account con nome utente non è necessario fornire un indirizzo email personale.
      </p>
    </section>
  `;
  return gate;
}

function renderPasswordGate({
  mode = 'recovery',
} = {}) {
  const isInvite = mode === 'invite';
  const gate = ensureAuthGate();

  gate.innerHTML = `
    <section class="auth-card" aria-labelledby="auth-title">
      <div class="auth-brand-mark" aria-hidden="true">${isInvite ? '✓' : '🔐'}</div>
      <div class="auth-kicker">Tennis Player OS</div>
      <h1 id="auth-title">${isInvite ? 'Attiva il tuo account' : 'Nuova password'}</h1>
      <p class="auth-intro">
        ${isInvite
          ? 'Il tuo invito è stato verificato. Scegli una password per completare l’accesso.'
          : 'Il link di recupero è stato verificato. Scegli ora la nuova password.'}
      </p>

      <form id="auth-password-form" class="auth-form">
        <label>
          <span>${isInvite ? 'Scegli password' : 'Nuova password'}</span>
          <input
            id="auth-new-password"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <label>
          <span>Ripeti password</span>
          <input
            id="auth-new-password-confirm"
            name="passwordConfirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <div id="auth-message" class="auth-message" role="status" aria-live="polite"></div>

        <button id="auth-submit" class="auth-submit" type="submit">
          ${isInvite ? 'Attiva account' : 'Salva nuova password'}
        </button>
      </form>
    </section>
  `;

  return gate;
}

function setAuthMessage(message = '', kind = '') {
  const box = document.querySelector('#auth-message');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-message${kind ? ` ${kind}` : ''}`;
}

function setAuthBusy(isBusy, busyLabel = 'Operazione in corso…', idleLabel = 'Accedi') {
  const submit = document.querySelector('#auth-submit');
  const inputs = document.querySelectorAll('.auth-form input');
  const forgot = document.querySelector('#auth-forgot');

  if (submit) {
    submit.disabled = isBusy;
    submit.textContent = isBusy ? busyLabel : idleLabel;
  }
  inputs.forEach(input => { input.disabled = isBusy; });
  if (forgot) forgot.disabled = isBusy;
}

function hasReturnParam(param) {
  try {
    return new URL(window.location.href).searchParams.get(param) === '1';
  } catch {
    return false;
  }
}

function isRecoveryReturn() {
  return hasReturnParam(RECOVERY_PARAM);
}

function isInviteReturn() {
  return hasReturnParam(INVITE_PARAM);
}

function redirectUrlFor(param) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(param, '1');
  return url.toString();
}

function recoveryRedirectUrl() {
  return redirectUrlFor(RECOVERY_PARAM);
}

function cleanAuthActionUrl() {
  const url = new URL(window.location.href);

  url.searchParams.delete(RECOVERY_PARAM);
  url.searchParams.delete(INVITE_PARAM);
  url.searchParams.delete(INVITE_EMAIL_PARAM);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  url.hash = '';

  const query = url.searchParams.toString();
  const clean = `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState({}, document.title, clean);
}

async function requestPasswordReset(login) {
  const normalizedLogin = String(login || '').trim();

  if (!normalizedLogin) {
    setAuthMessage('Inserisci prima il tuo nome utente o indirizzo email.', 'error');
    document.querySelector('#auth-login')?.focus();
    return;
  }

  let resetEmail = '';

  try {
    resetEmail = emailFromLogin(normalizedLogin);
  } catch (error) {
    setAuthMessage(error?.message || 'Nome utente non valido.', 'error');
    return;
  }

  if (!normalizedLogin.includes('@') || isTechnicalLoginEmail(resetEmail)) {
    setAuthMessage(
      'Per gli account con nome utente, il recupero della password viene gestito dall’amministratore.',
      'error',
    );
    return;
  }

  setAuthBusy(true, 'Invio email…', 'Accedi');

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: recoveryRedirectUrl(),
    });

    if (error) {
      console.error('Password reset request failed:', error);
      setAuthMessage('Non è stato possibile inviare l’email di reset. Riprova.', 'error');
      return;
    }

    setAuthMessage(
      'Email inviata. Apri il link ricevuto: tornerai qui per scegliere la nuova password.',
      'success',
    );
  } catch (error) {
    console.error('Password reset request failed:', error);
    setAuthMessage('Non è stato possibile contattare il servizio di accesso.', 'error');
  } finally {
    setAuthBusy(false, 'Invio email…', 'Accedi');
  }
}

function normalizedEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function expectedInviteEmail() {
  try {
    return normalizedEmail(
      new URL(window.location.href).searchParams.get(INVITE_EMAIL_PARAM) || '',
    );
  } catch {
    return '';
  }
}

function sessionMatchesExpectedEmail(session, expectedEmail = '') {
  if (!session) return false;
  if (!expectedEmail) return true;
  return normalizedEmail(session.user?.email) === expectedEmail;
}

async function resolveSessionFromCurrentUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth code exchange failed:', error);
    } else if (data?.session) {
      return data.session;
    }
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error('Auth URL session failed:', error);
    } else if (data?.session) {
      return data.session;
    }
  }

  return null;
}

async function resolveAuthActionSession({
  expectedEmail = '',
} = {}) {
  try {
    const urlSession = await resolveSessionFromCurrentUrl();

    if (sessionMatchesExpectedEmail(urlSession, expectedEmail)) {
      return urlSession;
    }
  } catch (error) {
    console.error('Auth URL resolution failed:', error);
  }

  return new Promise(resolve => {
    let settled = false;

    const finish = (session) => {
      if (settled) return;
      if (!sessionMatchesExpectedEmail(session, expectedEmail)) return;

      settled = true;
      subscription?.unsubscribe();
      window.clearTimeout(timer);
      resolve(session || null);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (
          event === 'PASSWORD_RECOVERY'
          || event === 'SIGNED_IN'
          || event === 'INITIAL_SESSION'
        )
        && session
      ) {
        finish(session);
      }
    });

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth action getSession failed:', error);
        }

        if (sessionMatchesExpectedEmail(data?.session, expectedEmail)) {
          finish(data.session);
          return;
        }
      } catch (error) {
        console.error('Auth action getSession failed:', error);
      }

      if (!settled) {
        settled = true;
        subscription?.unsubscribe();
        resolve(null);
      }
    }, 5000);
  });
}

async function completePasswordAction(session, {
  mode = 'recovery',
} = {}) {
  const isInvite = mode === 'invite';
  const gate = renderPasswordGate({ mode });
  const form = gate.querySelector('#auth-password-form');
  const firstPassword = gate.querySelector('#auth-new-password');
  const idleLabel = isInvite ? 'Attiva account' : 'Salva nuova password';

  requestAnimationFrame(() => firstPassword?.focus());

  return new Promise(resolve => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      setAuthMessage('');

      const formData = new FormData(form);
      const password = String(formData.get('password') || '');
      const passwordConfirm = String(formData.get('passwordConfirm') || '');

      if (password.length < 8) {
        setAuthMessage('La password deve contenere almeno 8 caratteri.', 'error');
        return;
      }

      if (password !== passwordConfirm) {
        setAuthMessage('Le due password non coincidono.', 'error');
        return;
      }

      setAuthBusy(
        true,
        isInvite ? 'Attivazione…' : 'Salvataggio…',
        idleLabel,
      );

      try {
        const { data, error } = await supabase.auth.updateUser({ password });

        if (error) {
          console.error('Password update failed:', error);
          setAuthMessage(
            isInvite
              ? 'Non è stato possibile attivare l’account.'
              : 'Non è stato possibile aggiornare la password.',
            'error',
          );
          return;
        }

        setAuthMessage(
          isInvite
            ? 'Account attivato correttamente.'
            : 'Password aggiornata correttamente.',
          'success',
        );

        cleanAuthActionUrl();

        window.setTimeout(() => {
          gate.remove();
          authGate = null;
          resolve(data?.user ? session : session);
        }, 500);
      } catch (error) {
        console.error('Password update failed:', error);
        setAuthMessage(
          isInvite
            ? 'Non è stato possibile attivare l’account.'
            : 'Non è stato possibile aggiornare la password.',
          'error',
        );
      } finally {
        setAuthBusy(
          false,
          isInvite ? 'Attivazione…' : 'Salvataggio…',
          idleLabel,
        );
      }
    });
  });
}

async function waitForLogin(initialMessage = '') {
  const gate = renderLoginGate();
  const form = gate.querySelector('#auth-login-form');
  const loginInput = gate.querySelector('#auth-login');
  const forgotButton = gate.querySelector('#auth-forgot');

  if (initialMessage) {
    setAuthMessage(initialMessage, 'error');
  }

  requestAnimationFrame(() => loginInput?.focus());

  forgotButton.addEventListener('click', () => {
    void requestPasswordReset(loginInput.value);
  });

  return new Promise(resolve => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      setAuthMessage('');

      // IMPORTANT: read form values BEFORE disabling the inputs.
      // Disabled controls are excluded from FormData.
      const formData = new FormData(form);
      const login = String(formData.get('login') || '').trim();
      const password = String(formData.get('password') || '');
      let email = '';

      try {
        email = emailFromLogin(login);
      } catch (error) {
        setAuthMessage(error?.message || 'Nome utente non valido.', 'error');
        return;
      }

      setAuthBusy(true, 'Accesso in corso…', 'Accedi');

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('Supabase login failed:', error);
          setAuthMessage('Nome utente/email o password non corretti.', 'error');
          return;
        }

        if (!data.session) {
          setAuthMessage('Accesso non completato. Riprova.', 'error');
          return;
        }

        gate.remove();
        authGate = null;
        resolve(data.session);
      } catch (error) {
        console.error('Supabase login failed:', error);
        setAuthMessage(
          'Impossibile contattare il servizio di accesso. Controlla la connessione e riprova.',
          'error',
        );
      } finally {
        setAuthBusy(false, 'Accesso in corso…', 'Accedi');
      }
    });
  });
}

export async function requireAuthenticatedSession() {
  if (isInviteReturn()) {
    const inviteSession = await resolveAuthActionSession({
      expectedEmail: expectedInviteEmail(),
    });

    if (inviteSession) {
      return completePasswordAction(inviteSession, { mode: 'invite' });
    }

    cleanAuthActionUrl();
    return waitForLogin(
      'Il link di invito non è più valido o è scaduto. Chiedi un nuovo invito.',
    );
  }

  if (isRecoveryReturn()) {
    const recoverySession = await resolveAuthActionSession();

    if (recoverySession) {
      return completePasswordAction(recoverySession, { mode: 'recovery' });
    }

    cleanAuthActionUrl();
    return waitForLogin(
      'Il link di recupero non è più valido o è scaduto. Richiedi una nuova email.',
    );
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Supabase getSession failed:', error);
    }

    if (data?.session) {
      return data.session;
    }
  } catch (error) {
    console.error('Supabase session check failed:', error);
  }

  return waitForLogin();
}

export function mountAuthControls(user) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || actions.querySelector('[data-auth-controls]')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-controls';
  wrapper.dataset.authControls = 'true';

  const label = document.createElement('span');
  label.className = 'auth-user';
  const loginLabel = loginFromEmail(user?.email || '');
  label.title = loginLabel || 'Utente autenticato';
  label.textContent = loginLabel || 'Account';

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'button button-ghost auth-logout';
  logout.textContent = 'Esci';

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    logout.textContent = 'Uscita…';

    try {
      await supabase.auth.signOut();
    } finally {
      window.location.reload();
    }
  });

  wrapper.append(label, logout);
  actions.prepend(wrapper);
}

export async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
