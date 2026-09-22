import { supabase } from './supabaseClient.js';

function setMessage(gate, message = '', kind = '') {
  const box = gate.querySelector('#initial-password-message');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-message${kind ? ` ${kind}` : ''}`;
}

async function requiresPasswordChange(userId) {
  const { data, error } = await supabase
    .from('account_access')
    .select('must_change_password')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile verificare la password iniziale: ${error.message}`);
  }

  return Boolean(data?.must_change_password);
}

function renderGate() {
  const gate = document.createElement('div');
  gate.className = 'auth-gate';
  gate.innerHTML = `
    <section class="auth-card" aria-labelledby="initial-password-title">
      <div class="auth-brand-mark" aria-hidden="true">🔐</div>
      <div class="auth-kicker">Tennis Player OS</div>
      <h1 id="initial-password-title">Cambia la password temporanea</h1>
      <p class="auth-intro">
        L’amministratore ha creato il tuo account con una password temporanea.
        Scegli ora una password personale prima di entrare nell’app.
      </p>

      <form id="initial-password-form" class="auth-form">
        <label>
          <span>Nuova password</span>
          <input
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
            name="passwordConfirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <div
          id="initial-password-message"
          class="auth-message"
          role="status"
          aria-live="polite"
        ></div>

        <button class="auth-submit" type="submit">
          Salva nuova password
        </button>
      </form>

      <p class="auth-footnote">
        La password temporanea non sarà più valida dopo il salvataggio.
      </p>
    </section>
  `;

  document.body.appendChild(gate);
  return gate;
}

export async function enforceInitialPasswordChange(session) {
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Account autenticato non disponibile.');
  }

  if (!await requiresPasswordChange(userId)) {
    return;
  }

  const gate = renderGate();
  const form = gate.querySelector('#initial-password-form');
  const submit = form.querySelector('button[type="submit"]');
  const firstInput = form.elements.password;

  requestAnimationFrame(() => firstInput?.focus());

  await new Promise(resolve => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      setMessage(gate, '');

      const data = new FormData(form);
      const password = String(data.get('password') || '');
      const passwordConfirm = String(data.get('passwordConfirm') || '');

      if (password.length < 8) {
        setMessage(gate, 'La password deve contenere almeno 8 caratteri.', 'error');
        return;
      }

      if (password !== passwordConfirm) {
        setMessage(gate, 'Le due password non coincidono.', 'error');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Salvataggio…';
      form.querySelectorAll('input').forEach(input => {
        input.disabled = true;
      });

      try {
        const { error: passwordError } = await supabase.auth.updateUser({
          password,
        });

        if (passwordError) {
          throw passwordError;
        }

        const { error: completionError } = await supabase.rpc(
          'complete_initial_password_change',
        );

        if (completionError) {
          throw completionError;
        }

        setMessage(gate, 'Password aggiornata correttamente.', 'success');

        window.setTimeout(() => {
          gate.remove();
          resolve();
        }, 350);
      } catch (error) {
        console.error('Initial password change failed:', error);
        setMessage(
          gate,
          error?.message || 'Non è stato possibile aggiornare la password.',
          'error',
        );

        submit.disabled = false;
        submit.textContent = 'Salva nuova password';
        form.querySelectorAll('input').forEach(input => {
          input.disabled = false;
        });
      }
    });
  });
}
