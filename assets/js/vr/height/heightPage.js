// VR Lab · Altezza — pagina autonoma vr-altezza.html (Meta Quest Browser o desktop).
// Stessa architettura di vrPage.js: riusa sessione Supabase e atleta selezionato.
import { requireAuthenticatedSession } from '../../cloud/auth.js?v=1.2.6';
import { loadCurrentAccountAccess } from '../../cloud/accountAccess.js?v=1.2.6';
import { canReadModule, canWriteModule, loadCurrentAccess } from '../../cloud/access.js?v=1.2.24';
import { getSelectedAthleteId, loadAccessibleAthletes } from '../../cloud/athlete.js?v=1.2.6';
import { saveVrDiagnostics } from '../../cloud/vrTrainingCloud.js?v=1.3.7';
import { moduleTitle } from '../../data/schema.js?v=1.2.6';
import { ALTITUDES, createHeightTrainer, isImmersiveVrSupported } from './heightTrainer.js?v=1.3.10';

const SETTINGS_KEY = 'tennisPlayerOS.vr.heightSettings.v1';
const DIAGNOSTICS_KEY = 'tennisPlayerOS.vr.heightDiagnostics.v1';
const DEFAULT_SETTINGS = {
  scenario: 'beam',
  posture: 'seated',
  altitude: 'low',
  railings: true,
  beamWidthCm: 25,
  plankThicknessCm: 3,
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

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeSettings(raw = {}) {
  return {
    scenario: 'beam',
    posture: raw.posture === 'standing' ? 'standing' : 'seated',
    altitude: ALTITUDES[raw.altitude] ? raw.altitude : DEFAULT_SETTINGS.altitude,
    railings: raw.railings !== false,
    beamWidthCm: Math.round(clamp(raw.beamWidthCm, 10, 60, DEFAULT_SETTINGS.beamWidthCm)),
    plankThicknessCm: Math.round(clamp(raw.plankThicknessCm, 0, 10, DEFAULT_SETTINGS.plankThicknessCm)),
  };
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || DEFAULT_SETTINGS);
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function storeSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
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
    `Durata: ${diagnostics.durationS ?? diagnostics.elapsedS ?? '—'} s · frame VR disegnati: ${diagnostics.xrFrames} · obiettivo: ${diagnostics.targetHz ? `${diagnostics.targetHz} Hz` : 'predefinito'}`,
    `Frame al secondo: ${(diagnostics.xrFramesPerSecond || []).join(' ') || '—'}`,
    diagnostics.errors?.length ? `Errori: ${diagnostics.errors.join(' | ')}` : 'Errori: nessuno',
    ...(diagnostics.events || []),
  ];
  host.querySelector('pre').textContent = lines.join('\n');
}

function athleteDisplayName(athlete) {
  return [athlete.firstName, athlete.lastName].filter(Boolean).join(' ')
    || athlete.cloudDisplayName || 'Atleta';
}

function showMessage(title, message, { retry = false } = {}) {
  root.innerHTML = `
    <main class="auth-gate">
      <section class="auth-card">
        <div class="auth-brand-mark" aria-hidden="true">◭</div>
        <div class="auth-kicker">Tennis Player OS · VR Lab · Altezza</div>
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

async function start() {
  try {
    await requireAuthenticatedSession();
    await loadCurrentAccountAccess();
    const athletes = await loadAccessibleAthletes();
    const athlete = resolveAthlete(athletes);
    if (!athlete) {
      showMessage('Atleta non selezionato', 'Apri l’app, scegli l’atleta e avvia Altezza dal modulo 13.');
      return;
    }
    await loadCurrentAccess(athlete.id);
    if (!canReadModule('vr') || !canWriteModule('vr')) {
      showMessage('Modulo non autorizzato', 'Per usare Altezza serve il permesso di scrittura sul modulo VR Lab per l’atleta selezionato.');
      return;
    }
    await renderPage(athlete);
  } catch (error) {
    console.error('VR Altezza startup failed:', error);
    const message = String(error?.message || 'Errore sconosciuto.');
    const network = /Failed to fetch|NetworkError|Load failed|network/i.test(message);
    showMessage(
      'Impossibile aprire Altezza',
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
        <div class="vr-kicker">${escapeHtml(moduleTitle('vr'))} · Altezza</div>
        <h1>${escapeHtml(athleteDisplayName(athlete))}</h1>
      </div>
    </header>

    <main class="vr-layout">
      <section class="vr-stage-card">
        <div id="vr-stage" class="vr-stage" aria-label="Anteprima della trave"></div>
        <p class="vr-muted vr-stage-hint">
          Anteprima su schermo: trascina per guardarti intorno · frecce/WASD spostano la testa · C si accovaccia (prova la pausa) · G = grip (torna a terra) · spazio = grilletto.
        </p>
      </section>

      <section class="vr-card">
        <h2>Esposizione</h2>
        <form id="vr-height-settings" class="vr-form">
          <label>Scenario
            <select name="scenario">
              <option value="beam" selected>Trave tra due grattacieli</option>
              <option value="cliff" disabled>Scogliera sul mare (in arrivo)</option>
            </select>
          </label>
          <label>Posizione
            <select name="posture">
              <option value="seated" ${settings.posture === 'seated' ? 'selected' : ''}>Da seduti (prime esposizioni)</option>
              <option value="standing" ${settings.posture === 'standing' ? 'selected' : ''}>In piedi sull’asse</option>
            </select>
          </label>
          <label>Quota
            <select name="altitude">
              ${Object.entries(ALTITUDES).map(([key, item]) => `
                <option value="${key}" ${settings.altitude === key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
            </select>
          </label>
          <label>Larghezza della trave = larghezza dell’asse reale (cm)
            <input type="number" name="beamWidthCm" min="10" max="60" step="1" inputmode="numeric" value="${settings.beamWidthCm}" />
          </label>
          <label>Spessore dell’asse reale (cm)
            <input type="number" name="plankThicknessCm" min="0" max="10" step="1" inputmode="numeric" value="${settings.plankThicknessCm}" />
          </label>
          <label class="vr-check">
            <input type="checkbox" name="railings" ${settings.railings ? 'checked' : ''} />
            Ringhiere ai lati della trave
          </label>
        </form>
      </section>

      <section class="vr-card">
        <h2>Prima di entrare</h2>
        <form id="vr-height-safety" class="vr-form">
          <label class="vr-check"><input type="checkbox" required /> Area libera di almeno 2 m × (lunghezza dell’asse + 2 m), confine Guardian attivo</label>
          <label class="vr-check"><input type="checkbox" required /> Una persona presente accanto, pronta a sostenermi</label>
          <label class="vr-check"><input type="checkbox" required /> Asse stabile e piatto sul pavimento, niente ostacoli, scarpe chiuse o piedi nudi</label>
        </form>
        <div class="vr-actions">
          ${vrSupported
            ? '<button id="vr-enter" class="vr-button vr-button-primary" type="button" disabled>Entra in VR</button>'
            : `<p class="vr-notice">WebXR immersivo non disponibile su questo browser. Apri questa pagina dal <strong>Meta Quest Browser</strong> con lo stesso account: <code>${escapeHtml(location.origin + location.pathname)}</code></p>`}
        </div>
        <p class="vr-muted"><strong>In VR:</strong> grilletto = avanti · <strong>grip (tasto laterale) in qualsiasi momento = torna subito a terra</strong> in un ambiente neutro.
          Se la testa scende di colpo o esci dall’area dell’asse, la scena si oscura e va in pausa.
          Per uscire: tasto <strong>Meta</strong> → <strong>Esci</strong>.</p>
        <p class="vr-muted"><strong>Calibrazione in piedi:</strong> appoggia la punta del controller (la sfera gialla) sul pavimento al centro dell’estremità da cui parti, grilletto; poi all’estremità opposta, grilletto. La trave virtuale coincide con l’asse.
          <strong>Da seduti:</strong> guarda avanti e premi il grilletto.</p>
      </section>

      <section class="vr-card" id="vr-diagnostics" hidden>
        <h2>Diagnostica ultima sessione VR</h2>
        <pre class="vr-diagnostics"></pre>
      </section>
    </main>
  `;

  const form = root.querySelector('#vr-height-settings');
  const safetyForm = root.querySelector('#vr-height-safety');
  const enterButton = root.querySelector('#vr-enter');
  const diagnosticsHost = root.querySelector('#vr-diagnostics');
  renderDiagnostics(diagnosticsHost, readDiagnostics());

  let diagnosticsUpload = null;
  const trainer = createHeightTrainer({
    host: root.querySelector('#vr-stage'),
    settings,
    onDiagnostics: snapshot => {
      storeDiagnostics(snapshot);
      if (!diagnosticsUpload) {
        diagnosticsUpload = saveVrDiagnostics(snapshot).finally(() => { diagnosticsUpload = null; });
      }
    },
    onEnd: ({ diagnostics } = {}) => {
      if (diagnostics) {
        storeDiagnostics(diagnostics);
        renderDiagnostics(diagnosticsHost, diagnostics);
      }
    },
  });

  window.addEventListener('error', event => trainer.logEvent(`errore pagina: ${event.message}`));
  window.addEventListener('unhandledrejection', event => trainer.logEvent(`promise rifiutata: ${event.reason?.message || event.reason}`));
  document.addEventListener('visibilitychange', () => trainer.logEvent(`pagina: ${document.visibilityState}`));
  window.addEventListener('pagehide', () => trainer.logEvent('pagehide'));

  function readForm() {
    const data = new FormData(form);
    return normalizeSettings({
      posture: String(data.get('posture')),
      altitude: String(data.get('altitude')),
      railings: data.get('railings') === 'on',
      beamWidthCm: data.get('beamWidthCm'),
      plankThicknessCm: data.get('plankThicknessCm'),
    });
  }

  form.addEventListener('change', () => {
    const next = readForm();
    storeSettings(next);
    trainer.configure(next);
  });

  // La checklist non viene ricordata: va confermata a ogni apertura della pagina.
  safetyForm.addEventListener('change', () => {
    if (enterButton) enterButton.disabled = !safetyForm.checkValidity();
  });

  enterButton?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      trainer.configure(readForm());
      await trainer.enterVR();
    } catch (error) {
      console.error('WebXR session failed:', error);
      button.insertAdjacentHTML('afterend', `<p class="vr-notice">Impossibile avviare la sessione VR: ${escapeHtml(error?.message || error)}</p>`);
    } finally {
      button.disabled = !safetyForm.checkValidity();
    }
  });
}

void start();
