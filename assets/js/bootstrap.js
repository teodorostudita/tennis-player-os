import { requireAuthenticatedSession, mountAuthControls } from './cloud/auth.js?v=1.2.6';
import { canReadModule, canWriteModule, getCurrentAccess, loadCurrentAccess } from './cloud/access.js?v=1.2.6';
import { canCreateAthletes, getCurrentUserType, loadCurrentAccountAccess } from './cloud/accountAccess.js?v=1.2.6';
import { enforceInitialPasswordChange } from './cloud/initialPassword.js?v=1.2.6';
import { startPermissionGuard } from './cloud/permissionGuard.js?v=1.2.6';
import { mountAccessManagementControl } from './components/accessManagement.js?v=1.2.6';
import {
  loadAccessibleAthletes,
  mountAthleteControls,
  resolveSelectedAthlete,
  setSelectedAthleteId,
  showAthletePicker,
  syncSelectedAthleteToLocalStore,
  migrateAthleteProfileToCloudIfNeeded,
  startAthleteProfileCloudSync,
} from './cloud/athlete.js?v=1.2.6';
import {
  cleanCalendarMigrationUrl,
  isCalendarMigrationRequested,
  migrateLocalCalendarToCloud,
} from './cloud/calendarMigration.js?v=1.2.6';
import {
  cleanCalendarVerificationUrl,
  isCalendarVerificationRequested,
  loadCalendarIntoLocalStore,
  startCalendarCloudSync,
  verifyLocalCalendarAgainstCloud,
} from './cloud/calendarCloud.js?v=1.2.6';
import {
  loadTrainingIntoLocalStore,
  startTrainingCloudSync,
} from './cloud/trainingCloud.js?v=1.2.6';
import {
  loadEquipmentIntoLocalStore,
  startEquipmentCloudSync,
} from './cloud/equipmentCloud.js?v=1.2.6';
import {
  loadRecoveryDailyIntoStore,
  startRecoveryDailySync,
} from './cloud/recoveryDailyCloud.js?v=1.2.6';
import {
  loadCalendarMakeupsIntoStore,
  startCalendarMakeupsCloudSync,
} from './cloud/calendarMakeupsCloud.js?v=1.2.6';
import { loadHealthModule } from './cloud/healthCloud.js?v=1.2.6';
import { loadEconomicsIntoLocalStore } from './cloud/economicsCloud.js?v=1.2.6';
import { store } from './data/store.js?v=1.2.6';
import { rescueSameAthleteLocalCaches } from './cloud/localCacheRescue.js?v=1.2.6';

function showStartupError(message) {
  document.body.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card" aria-labelledby="startup-error-title">
        <div class="auth-brand-mark" aria-hidden="true">⚠️</div>
        <div class="auth-kicker">Tennis Player OS</div>
        <h1 id="startup-error-title">Impossibile aprire l'atleta</h1>
        <p class="auth-intro">${escapeHtml(message)}</p>
        <p class="auth-footnote">
          L'accesso è riuscito, ma i dati cloud necessari non sono disponibili.
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
          I dati locali restano disponibili come copia di sicurezza sul dispositivo.
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
            ? 'La copia Supabase corrisponde ai dati locali.'
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

function setCalendarCloudStatus({ status, message = '' }) {
  const saveIndicator = document.querySelector('#save-indicator');
  if (!saveIndicator) return;

  if (status === 'syncing') {
    saveIndicator.textContent = 'Calendar → cloud…';
    saveIndicator.title = 'Sincronizzazione del Calendar con Supabase in corso.';
    return;
  }

  if (status === 'error') {
    saveIndicator.textContent = 'Errore Calendar cloud';
    saveIndicator.title = message || 'Il Calendar locale non è sincronizzato con Supabase.';
    return;
  }

  if (status === 'readonly') {
    saveIndicator.textContent = 'Calendar cloud · sola lettura';
    saveIndicator.title = 'Questo account può leggere il Calendar ma non modificarlo.';
    return;
  }

  if (status === 'unavailable') {
    saveIndicator.textContent = 'Calendar non autorizzato';
    saveIndicator.title = 'Questo account non ha accesso al modulo Calendar.';
    return;
  }

  saveIndicator.textContent = 'Calendar cloud ✓';
  saveIndicator.title = 'Calendar letto e salvato su Supabase.';
}

function setTrainingCloudStatus({ status, message = '' }) {
  const saveIndicator = document.querySelector('#save-indicator');
  if (!saveIndicator) return;

  const route = location.hash.replace(/^#\/?/, '') || 'dashboard';
  if (route !== 'training') return;

  if (status === 'syncing') {
    saveIndicator.textContent = 'Athletics → cloud…';
    saveIndicator.title = 'Sincronizzazione di Athletics con Supabase in corso.';
    return;
  }

  if (status === 'error') {
    saveIndicator.textContent = 'Athletics · cache locale';
    saveIndicator.title = message || 'I dati restano nella cache locale e verranno risincronizzati.';
    return;
  }

  if (status === 'readonly') {
    saveIndicator.textContent = 'Athletics cloud · sola lettura';
    saveIndicator.title = 'Questo account può leggere Athletics ma non modificarlo.';
    return;
  }

  if (status === 'unavailable') {
    saveIndicator.textContent = 'Athletics non autorizzato';
    saveIndicator.title = 'Questo account non ha accesso al modulo Athletics.';
    return;
  }

  saveIndicator.textContent = 'Athletics cloud ✓';
  saveIndicator.title = 'Athletics letto e salvato su Supabase; la copia locale resta come cache.';
}

let recoveryDailyStatusSnapshot = { status: 'synced', message: '' };

function setRecoveryDailyCloudStatus({ status, message = '' }) {
  recoveryDailyStatusSnapshot = { status, message };
  const saveIndicator = document.querySelector('#save-indicator');
  if (!saveIndicator) return;
  const route = location.hash.replace(/^#\/?/, '') || 'dashboard';
  if (route !== 'nutrition') return;

  let text = 'Recovery cloud ✓';
  let title = 'Check-in e checkout sono sincronizzati nel cloud dedicato.';

  if (status === 'error') {
    text = 'Recovery · cache locale';
    title = message || 'I dati Recovery restano locali finché il cloud non torna disponibile.';
  } else if (status === 'readonly') {
    text = 'Recovery cloud · sola lettura';
    title = 'Questo account può leggere Recovery ma non modificarlo.';
  }

  if (saveIndicator.textContent !== text) saveIndicator.textContent = text;
  if (saveIndicator.title !== title) saveIndicator.title = title;
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
    await enforceInitialPasswordChange(session);
    await loadCurrentAccountAccess();

    let athletes = await loadAccessibleAthletes();

    if (!athletes.length && !canCreateAthletes()) {
      showStartupError(
        'Nessun atleta è attualmente assegnato a questo account.',
      );
    } else {
      let cloudAthlete = resolveSelectedAthlete(athletes);

      if (!cloudAthlete) {
        cloudAthlete = await showAthletePicker({
          athletes,
          currentAthleteId: '',
          canCreateAthletes: canCreateAthletes(),
        });

        if (!cloudAthlete) {
          throw new Error('Nessun atleta selezionato.');
        }

        setSelectedAthleteId(cloudAthlete.id);
        athletes = await loadAccessibleAthletes();
      }

      await loadCurrentAccess(cloudAthlete.id);

      await syncSelectedAthleteToLocalStore(
        store,
        cloudAthlete,
        session.user.id,
      );

      // v1.2.4: before cloud-first modules load, inspect surviving local caches
      // for the same athlete. Older account-scoped caches can contain richer
      // Development/Opponents/Nutrition history that was never materialised in
      // Supabase. The rescue is additive and never deletes donor caches.
      rescueSameAthleteLocalCaches({
        store,
        athleteId: cloudAthlete.id,
      });

      cloudAthlete = await migrateAthleteProfileToCloudIfNeeded({
        store,
        cloudAthlete,
        allowWrite: getCurrentAccess().isAdmin,
      });

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
        let cloudPlanner = store.getState().planner;

        if (canReadModule('calendar')) {
          cloudPlanner = await loadCalendarIntoLocalStore({
            store,
            athleteId: cloudAthlete.id,
          });
          await loadCalendarMakeupsIntoStore({
            store,
            athleteId: cloudAthlete.id,
          });
          cloudPlanner = store.getState().planner;
        }

        if (canReadModule('training')) {
          await loadTrainingIntoLocalStore({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: canWriteModule('training'),
          });
        }

        let equipmentLoadResult = null;

        if (canReadModule('equipment')) {
          equipmentLoadResult = await loadEquipmentIntoLocalStore({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: canWriteModule('equipment'),
          });
        }

        if (canReadModule('nutrition')) {
          await loadRecoveryDailyIntoStore({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: canWriteModule('nutrition'),
          });
        }

        // Contextual Homes aggregate the data they need before the first render.
        // Parent requires Health + Economics; Trainer requires Health.
        // Dedicated module runtimes remain authoritative for subsequent edits.
        if (['parent', 'trainer'].includes(getCurrentUserType()) && canReadModule('health')) {
          await loadHealthModule({
            store,
            athleteId: cloudAthlete.id,
          });
        }
        if (getCurrentUserType() === 'parent' && canReadModule('economics')) {
          await loadEconomicsIntoLocalStore({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: canWriteModule('economics'),
          });
        }

        await import('./app.js?v=1.2.10');
        mountAuthControls(session.user);
        mountAthleteControls({
          currentAthlete: cloudAthlete,
          athleteCount: athletes.length,
          canCreateAthletes: canCreateAthletes(),
        });
        mountAccessManagementControl({
          athleteId: cloudAthlete.id,
        });
        startPermissionGuard();

        if (getCurrentAccess().isAdmin) {
          startAthleteProfileCloudSync({
            store,
            athleteId: cloudAthlete.id,
          });
        }

        if (
          canReadModule('equipment')
          && canWriteModule('equipment')
          && !equipmentLoadResult?.cloudError
        ) {
          startEquipmentCloudSync({
            store,
            athleteId: cloudAthlete.id,
          });
        }

        if (canReadModule('calendar') && canWriteModule('calendar')) {
          startCalendarCloudSync({
            store,
            athleteId: cloudAthlete.id,
            initialPlanner: cloudPlanner,
            onStatus: setCalendarCloudStatus,
          });
          startCalendarMakeupsCloudSync({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: true,
          });
        } else if (canReadModule('calendar')) {
          setCalendarCloudStatus({ status: 'readonly' });
          startCalendarMakeupsCloudSync({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: false,
          });
        } else {
          setCalendarCloudStatus({ status: 'unavailable' });
        }

        if (canReadModule('training') && canWriteModule('training')) {
          startTrainingCloudSync({
            store,
            athleteId: cloudAthlete.id,
            onStatus: setTrainingCloudStatus,
          });
        } else if (canReadModule('training')) {
          setTrainingCloudStatus({ status: 'readonly' });
        } else {
          setTrainingCloudStatus({ status: 'unavailable' });
        }

        if (canReadModule('nutrition')) {
          startRecoveryDailySync({
            store,
            athleteId: cloudAthlete.id,
            allowWrite: canWriteModule('nutrition'),
            onStatus: setRecoveryDailyCloudStatus,
          });
        }

        window.addEventListener('hashchange', () => {
          const route = location.hash.replace(/^#\/?/, '') || 'dashboard';
          if (route === 'training') {
            if (canReadModule('training') && canWriteModule('training')) {
              setTrainingCloudStatus({ status: 'synced' });
            } else if (canReadModule('training')) {
              setTrainingCloudStatus({ status: 'readonly' });
            } else {
              setTrainingCloudStatus({ status: 'unavailable' });
            }
          } else if (route === 'nutrition' && canReadModule('nutrition')) {
            setRecoveryDailyCloudStatus(recoveryDailyStatusSnapshot);
          }
        });
      }
    }
  } catch (error) {
    console.error('Cloud startup failed:', error);
    showStartupError(error?.message || 'Errore sconosciuto durante l’avvio.');
  }
}
