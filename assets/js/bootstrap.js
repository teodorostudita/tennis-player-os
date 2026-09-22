import { requireAuthenticatedSession, mountAuthControls } from './cloud/auth.js';
import { syncCurrentAthleteToLocalStore } from './cloud/athlete.js';
import {
  cleanCalendarMigrationUrl,
  isCalendarMigrationRequested,
  migrateLocalCalendarToCloud,
} from './cloud/calendarMigration.js';
import {
  cleanCalendarVerificationUrl,
  isCalendarVerificationRequested,
  verifyLocalCalendarAgainstCloud,
} from './cloud/calendarCloud.js';
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

function showCalendarMigrationResult(result) {
  const local = result.localCounts || {};
  const cloud = result.cloudCounts || {};
  const cleanUrl = cleanCalendarMigrationUrl();

  document.body.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card" aria-labelledby="calendar-migration-title">
        <div class="auth-brand-mark" aria-hidden="true">☁️</div>
        <div class="auth-kicker">Tennis Player OS</div>
        <h1 id="calendar-migration-title">Calendar copiato nel cloud</h1>
        <p class="auth-intro">
          La copia è terminata. I dati locali non sono stati cancellati.
        </p>

        <div class="auth-message success">
          Persone: ${escapeHtml(cloud.people ?? local.people ?? 0)} ·
          Serie: ${escapeHtml(cloud.recurringSeries ?? local.recurringSeries ?? 0)} ·
          Attività: ${escapeHtml(cloud.events ?? local.events ?? 0)} ·
          Tornei: ${escapeHtml(cloud.tournaments ?? local.tournaments ?? 0)}
        </div>

        <p class="auth-footnote">
          Per ora l'app continua ancora a usare i dati locali. Nel prossimo passaggio
          confronteremo la copia cloud e solo dopo attiveremo il Calendar condiviso.
        </p>

        <a class="auth-submit" href="${escapeAttr(cleanUrl)}">Apri l'app locale</a>
      </section>
    </main>
  `;
}

function showCalendarVerificationResult(result) {
  const cleanUrl = cleanCalendarVerificationUrl();
  const rows = result.sections.map(section => `
    <div class="auth-message ${section.ok ? 'success' : 'error'}">
      <strong>${escapeHtml(section.label)}</strong>:
      ${escapeHtml(section.matched)}/${escapeHtml(section.local)} identici
      · cloud ${escapeHtml(section.cloud)}
    </div>
  `).join('');

  const mismatchDetails = result.mismatchPreview.length
    ? `
      <div class="auth-message error">
        <strong>Prime differenze rilevate</strong><br />
        ${result.mismatchPreview.map(item =>
          `${escapeHtml(item.section)} · ${escapeHtml(item.id)} · ${escapeHtml(item.reason)}`
        ).join('<br />')}
      </div>
    `
    : '';

  document.body.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card" aria-labelledby="calendar-verify-title">
        <div class="auth-brand-mark" aria-hidden="true">${result.ok ? '✓' : '⚠️'}</div>
        <div class="auth-kicker">Tennis Player OS</div>
        <h1 id="calendar-verify-title">
          ${result.ok ? 'Calendar cloud verificato' : 'Calendar: differenze da controllare'}
        </h1>
        <p class="auth-intro">
          ${result.ok
            ? 'La copia Supabase corrisponde ai dati locali, inclusi i payload completi delle attività.'
            : 'La verifica non modifica nulla. Alcuni dati locali e cloud non coincidono.'}
        </p>

        ${rows}
        ${mismatchDetails}

        <p class="auth-footnote">
          Nessun dato è stato modificato durante questa verifica.
        </p>

        <a class="auth-submit" href="${escapeAttr(cleanUrl)}">Apri l'app locale</a>
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

function escapeAttr(value = '') {
  return escapeHtml(value);
}

const session = await requireAuthenticatedSession();

if (session) {
  try {
    const cloudAthlete = await syncCurrentAthleteToLocalStore(store);

    if (isCalendarMigrationRequested()) {
      const result = await migrateLocalCalendarToCloud({
        store,
        athleteId: cloudAthlete.id,
      });
      showCalendarMigrationResult(result);
    } else if (isCalendarVerificationRequested()) {
      const result = await verifyLocalCalendarAgainstCloud({
        store,
        athleteId: cloudAthlete.id,
      });
      showCalendarVerificationResult(result);
    } else {
      await import('./app.js');
      mountAuthControls(session.user);

      const saveIndicator = document.querySelector('#save-indicator');
      if (saveIndicator) {
        saveIndicator.textContent = 'Identità cloud · dati locali';
        saveIndicator.title = 'Profilo atleta letto da Supabase; moduli ancora salvati in locale.';
      }
    }
  } catch (error) {
    console.error('Cloud startup failed:', error);
    showStartupError(error?.message || 'Errore sconosciuto durante l’avvio.');
  }
}
