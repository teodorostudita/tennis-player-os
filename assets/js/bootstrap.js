import { requireAuthenticatedSession, mountAuthControls } from './cloud/auth.js';
import { syncCurrentAthleteToLocalStore } from './cloud/athlete.js';
import { store } from './data/store.js';

function showStartupError(message) {
  document.body.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card" aria-labelledby="startup-error-title">
        <div class="auth-brand-mark" aria-hidden="true">⚠️</div>
        <div class="auth-kicker">Tennis Player OS</div>
        <h1 id="startup-error-title">Impossibile aprire l'atleta</h1>
        <p class="auth-intro">${escapeHtml(message)}</p>
        <p class="auth-footnote">
          L'accesso è riuscito, ma il profilo atleta non è disponibile dal database.
        </p>
      </section>
    </main>
  `;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const session = await requireAuthenticatedSession();

if (session) {
  try {
    await syncCurrentAthleteToLocalStore(store);
    await import('./app.js');
    mountAuthControls(session.user);

    const saveIndicator = document.querySelector('#save-indicator');
    if (saveIndicator) {
      saveIndicator.textContent = 'Identità cloud · dati locali';
      saveIndicator.title = 'Profilo atleta letto da Supabase; moduli ancora salvati in locale.';
    }
  } catch (error) {
    console.error('Cloud athlete startup failed:', error);
    showStartupError(error?.message || 'Errore sconosciuto durante il caricamento dell’atleta.');
  }
}
