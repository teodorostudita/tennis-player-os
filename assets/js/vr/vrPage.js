// VR Lab — pagina autonoma vr.html (aperta dal Meta Quest Browser o da desktop).
// Riusa sessione Supabase e atleta selezionato dell'app (stessa origine).
import { requireAuthenticatedSession } from '../cloud/auth.js?v=1.2.6';
import { loadCurrentAccountAccess } from '../cloud/accountAccess.js?v=1.2.6';
import { canReadModule, canWriteModule, loadCurrentAccess } from '../cloud/access.js?v=1.2.24';
import { getSelectedAthleteId, loadAccessibleAthletes } from '../cloud/athlete.js?v=1.2.6';
import { flushPendingVrSessions, saveVrDiagnostics, saveVrSession } from '../cloud/vrTrainingCloud.js?v=1.3.7';
import { moduleTitle } from '../data/schema.js?v=1.2.6';
import { DIFFICULTIES, SHOTS, SHOT_TYPES } from './physicsConfig.js?v=1.3.7';
import { DEFAULT_OCCLUSION_MODE, OCCLUSION_MODES, normalizeOcclusionMode } from './occlusion.js?v=1.3.7';
import { normalizeShotWeights } from './series.js?v=1.3.7';
import {
  createBounceTrainer,
  describeDepth,
  describeLateral,
  isImmersiveVrSupported,
} from './bounceTrainer.js?v=1.3.7';

const SETTINGS_KEY = 'tennisPlayerOS.vr.opponentSettings.v1';
const DIAGNOSTICS_KEY = 'tennisPlayerOS.vr.lastDiagnostics.v1';
const DEFAULT_SETTINGS = {
  trialCount: 10,
  difficulty: 'medium',
  occlusion: { mode: DEFAULT_OCCLUSION_MODE },
  shotWeights: normalizeShotWeights({}),
  ballShadow: false,
};

const root = document.querySelector('#vr-root');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!saved) return structuredClone(DEFAULT_SETTINGS);
    return {
      trialCount: [10, 15, 20].includes(saved.trialCount) ? saved.trialCount : DEFAULT_SETTINGS.trialCount,
      difficulty: DIFFICULTIES[saved.difficulty] ? saved.difficulty : DEFAULT_SETTINGS.difficulty,
      occlusion: { mode: normalizeOcclusionMode(saved.occlusion?.mode) },
      shotWeights: normalizeShotWeights(saved.shotWeights),
      ballShadow: Boolean(saved.ballShadow),
    };
  } catch (_) {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function readDiagnostics() {
  try { return JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY) || 'null'); } catch (_) { return null; }
}

function storeDiagnostics(diagnostics) {
  try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify({ ...diagnostics, savedAt: new Date().toISOString() })); } catch (_) {}
}

function renderDiagnostics(host, diagnostics) {
  if (!diagnostics) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const lines = [
    `Durata: ${diagnostics.durationS ?? diagnostics.elapsedS ?? '—'} s · frame VR disegnati: ${diagnostics.xrFrames}`,
    `Frame al secondo: ${(diagnostics.xrFramesPerSecond || []).join(' ') || '—'}`,
    diagnostics.errors?.length ? `Errori: ${diagnostics.errors.join(' | ')}` : 'Errori: nessuno',
    ...(diagnostics.events || []),
  ];
  host.querySelector('pre').textContent = lines.join('\n');
}

function storeSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

function weightsLabel(weights) {
  const total = SHOT_TYPES.reduce((sum, type) => sum + weights[type], 0);
  return SHOT_TYPES
    .map(type => `${SHOTS[type].label} ${Math.round((weights[type] / total) * 100)}%`)
    .join(' · ');
}

function athleteDisplayName(athlete) {
  return [athlete.firstName, athlete.lastName].filter(Boolean).join(' ')
    || athlete.cloudDisplayName || 'Atleta';
}

function deviceLabel() {
  return /OculusBrowser|Quest/i.test(navigator.userAgent) ? 'Meta Quest' : 'Browser desktop';
}

function showMessage(title, message, { retry = false } = {}) {
  root.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card">
        <div class="auth-brand-mark" aria-hidden="true">◭</div>
        <div class="auth-kicker">Tennis Player OS · VR Lab</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="auth-intro">${escapeHtml(message)}</p>
        ${retry ? '<button class="auth-submit" type="button" data-vr-retry>Riprova</button>' : ''}
        <a class="auth-submit" href="./index.html">Torna all'app</a>
      </section>
    </main>
  `;
  root.querySelector('[data-vr-retry]')?.addEventListener('click', () => window.location.reload());
}

function resolveAthlete(athletes) {
  const requested = new URLSearchParams(location.search).get('athlete') || getSelectedAthleteId();
  return athletes.find(item => item.id === requested)
    || (athletes.length === 1 ? athletes[0] : null);
}

function byShotTypeMarkup(byShotType = {}) {
  const types = SHOT_TYPES.filter(type => byShotType[type]);
  if (!types.length) return '';
  return `
    <div class="vr-stats">
      ${types.map(type => `
        <div><span>${escapeHtml(SHOTS[type].label)} · ${byShotType[type].count}</span><strong>${Math.round(byShotType[type].meanErrorCm)} cm</strong></div>
      `).join('')}
    </div>
  `;
}

function renderSummary(host, summary, saveText = '') {
  if (!summary) {
    host.innerHTML = '<p class="vr-muted">Nessuna serie completata in questa sessione.</p>';
    return;
  }
  host.innerHTML = `
    <div class="vr-stats">
      <div><span>Errore medio</span><strong>${Math.round(summary.meanErrorCm)} cm</strong></div>
      <div><span>Mediano</span><strong>${Math.round(summary.medianErrorCm)} cm</strong></div>
      <div><span>Migliore</span><strong>${Math.round(summary.bestErrorCm)} cm</strong></div>
      <div><span>Colpi</span><strong>${summary.trialCount}</strong></div>
    </div>
    ${byShotTypeMarkup(summary.byShotType)}
    <p class="vr-muted">Tendenza: ${escapeHtml(describeDepth(summary.meanDepthBiasCm))} · ${escapeHtml(describeLateral(summary.meanLateralBiasCm))}</p>
    ${saveText ? `<p class="vr-save">${escapeHtml(saveText)}</p>` : ''}
  `;
}

async function start() {
  try {
    await requireAuthenticatedSession();
    await loadCurrentAccountAccess();
    const athletes = await loadAccessibleAthletes();
    const athlete = resolveAthlete(athletes);
    if (!athlete) {
      showMessage('Atleta non selezionato', 'Apri l’app, scegli l’atleta e avvia VR Lab dal modulo 13.');
      return;
    }
    await loadCurrentAccess(athlete.id);
    if (!canReadModule('vr')) {
      showMessage('Modulo non autorizzato', 'Questo account non ha accesso al modulo VR Lab per l’atleta selezionato.');
      return;
    }
    if (!canWriteModule('vr')) {
      showMessage('Accesso in sola lettura', 'Per avviare una serie serve il permesso di scrittura sul modulo VR Lab.');
      return;
    }
    void flushPendingVrSessions();
    await renderPage(athlete);
  } catch (error) {
    console.error('VR Lab startup failed:', error);
    const message = String(error?.message || 'Errore sconosciuto.');
    const network = /Failed to fetch|NetworkError|Load failed|network/i.test(message);
    showMessage(
      'Impossibile aprire VR Lab',
      network ? `${message}. La connessione del visore non sembra ancora pronta.` : message,
      { retry: true },
    );
  }
}

async function renderPage(athlete) {
  const settings = loadSettings();
  const vrSupported = await isImmersiveVrSupported();

  root.innerHTML = `
    <header class="vr-topbar">
      <a class="vr-back" href="./index.html#/vr">← App</a>
      <div>
        <div class="vr-kicker">${escapeHtml(moduleTitle('vr'))} · Lettura del colpo</div>
        <h1>${escapeHtml(athleteDisplayName(athlete))}</h1>
      </div>
    </header>

    <main class="vr-layout">
      <section class="vr-stage-card">
        <div id="vr-stage" class="vr-stage" aria-label="Anteprima del campo"></div>
        <p class="vr-muted vr-stage-hint">
          Anteprima su schermo: muovi il mouse sul campo e clicca (o premi spazio) al posto del grilletto; Esc interrompe la serie.
        </p>
      </section>

      <section class="vr-card">
        <h2>Serie</h2>
        <form id="vr-settings" class="vr-form">
          <label>Colpi
            <select name="trialCount">
              ${[10, 15, 20].map(n => `<option value="${n}" ${settings.trialCount === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
          <label>Difficoltà (velocità)
            <select name="difficulty">
              ${Object.entries(DIFFICULTIES).map(([key, preset]) => `
                <option value="${key}" ${settings.difficulty === key ? 'selected' : ''}>${preset.label}</option>`).join('')}
            </select>
          </label>
          <label>Punto di scomparsa
            <select name="occlusionMode">
              ${Object.entries(OCCLUSION_MODES).map(([key, mode]) => `
                <option value="${key}" ${settings.occlusion.mode === key ? 'selected' : ''}>${escapeHtml(mode.label)}</option>`).join('')}
            </select>
          </label>
          <fieldset class="vr-weights">
            <legend>Frequenza dei colpi (pesi)</legend>
            ${SHOT_TYPES.map(type => `
              <label>${escapeHtml(SHOTS[type].label)}
                <input type="number" name="weight_${type}" min="0" max="100" step="5" inputmode="numeric" value="${settings.shotWeights[type]}" />
              </label>`).join('')}
            <p class="vr-muted" id="vr-weights-label">${escapeHtml(weightsLabel(settings.shotWeights))}</p>
          </fieldset>
          <label class="vr-check">
            <input type="checkbox" name="ballShadow" ${settings.ballShadow ? 'checked' : ''} />
            Ombra della palla sotto la verticale
          </label>
        </form>

        <div class="vr-actions">
          ${vrSupported
            ? '<button id="vr-enter" class="vr-button vr-button-primary" type="button">Entra in VR</button>'
            : `<p class="vr-notice">WebXR immersivo non disponibile su questo browser. Apri questa pagina dal <strong>Meta Quest Browser</strong> con lo stesso account: <code>${escapeHtml(location.origin + location.pathname)}</code></p>`}
          <button id="vr-restart" class="vr-button" type="button">Ricomincia la serie</button>
        </div>
        <p class="vr-muted">Mettiti in piedi guardando verso la rete prima di entrare in VR: nel campo virtuale ti troverai 2 m dietro il centro della linea di fondo.</p>
        <p class="vr-muted">Nei modi «150 ms prima» e «all’impatto» spariscono avversario e palla: il rimbalzo si predice solo dal gesto. Il tipo di colpo compare nel feedback.</p>
        <p class="vr-muted"><strong>In VR:</strong> grilletto = avvia il colpo / conferma il punto · grip tenuto premuto = interrompi la serie · grip nel riepilogo = esci.
          Per uscire in qualsiasi momento: premi il <strong>tasto Meta</strong> e scegli <strong>Esci</strong>.</p>
      </section>

      <section class="vr-card">
        <h2>Ultima serie</h2>
        <div id="vr-last-result"></div>
      </section>

      <section class="vr-card" id="vr-diagnostics" hidden>
        <h2>Diagnostica ultima sessione VR</h2>
        <pre class="vr-diagnostics"></pre>
      </section>
    </main>
  `;

  const form = root.querySelector('#vr-settings');
  const lastResult = root.querySelector('#vr-last-result');
  let lastSummary = null;
  let lastSaveText = '';
  renderSummary(lastResult, null);
  const diagnosticsHost = root.querySelector('#vr-diagnostics');
  renderDiagnostics(diagnosticsHost, readDiagnostics());

  let diagnosticsUpload = null;
  const trainer = createBounceTrainer({
    host: root.querySelector('#vr-stage'),
    settings,
    onSeriesComplete: async session => {
      const outcome = await saveVrSession({ ...session, athleteId: athlete.id, device: deviceLabel() });
      lastSummary = session.summary;
      lastSaveText = outcome.saved
        ? 'Sessione salvata nel cloud.'
        : outcome.queued
          ? `Non salvata (${outcome.error}). È in coda su questo dispositivo e verrà ritentata.`
          : `Non salvata: ${outcome.error}`;
      renderSummary(lastResult, lastSummary, lastSaveText);
      return outcome;
    },
    onDiagnostics: snapshot => {
      storeDiagnostics(snapshot);
      if (!diagnosticsUpload) {
        diagnosticsUpload = saveVrDiagnostics(snapshot).finally(() => { diagnosticsUpload = null; });
      }
    },
    onEnd: ({ diagnostics } = {}) => {
      renderSummary(lastResult, lastSummary, lastSaveText);
      if (diagnostics) {
        storeDiagnostics(diagnostics);
        renderDiagnostics(diagnosticsHost, diagnostics);
      }
    },
  });

  // Eventi della pagina utili a capire perché la scena VR scompare.
  window.addEventListener('error', event => trainer.logEvent(`errore pagina: ${event.message}`));
  window.addEventListener('unhandledrejection', event => trainer.logEvent(`promise rifiutata: ${event.reason?.message || event.reason}`));
  document.addEventListener('visibilitychange', () => trainer.logEvent(`pagina: ${document.visibilityState}`));
  window.addEventListener('pagehide', () => trainer.logEvent('pagehide'));

  function readForm() {
    const data = new FormData(form);
    return {
      trialCount: Number(data.get('trialCount')),
      difficulty: String(data.get('difficulty')),
      occlusion: { mode: normalizeOcclusionMode(String(data.get('occlusionMode'))) },
      shotWeights: normalizeShotWeights(Object.fromEntries(
        SHOT_TYPES.map(type => [type, Math.min(100, Number(data.get(`weight_${type}`)) || 0)]),
      )),
      ballShadow: data.get('ballShadow') === 'on',
    };
  }

  form.addEventListener('input', () => {
    const next = readForm();
    root.querySelector('#vr-weights-label').textContent = weightsLabel(next.shotWeights);
    storeSettings(next);
    trainer.restart(next);
  });

  root.querySelector('#vr-restart').addEventListener('click', () => trainer.restart(readForm()));

  root.querySelector('#vr-enter')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      trainer.restart(readForm());
      await trainer.enterVR();
    } catch (error) {
      console.error('WebXR session failed:', error);
      button.insertAdjacentHTML('afterend', `<p class="vr-notice">Impossibile avviare la sessione VR: ${escapeHtml(error?.message || error)}</p>`);
    } finally {
      button.disabled = false;
    }
  });
}

void start();
