import { modules } from './data/schema.js';
import { store } from './data/store.js';
import { renderSidebar } from './components/sidebar.js';
import { renderCalendar } from './components/calendar.js';
import { renderEquipment } from './components/equipment.js';
import { renderTraining } from './components/training.js';
import { renderDrills } from './components/drills.js';
import { renderEconomics } from './components/economics.js';
import { renderNutrition } from './components/nutrition.js';
import { renderResourceLibrary } from './components/resourceLibrary.js';
import { showInAppConfirm } from './ui/inAppMessages.js';

const sidebar = document.querySelector('#sidebar');
const main = document.querySelector('#main-content');
const title = document.querySelector('#page-title');
const saveIndicator = document.querySelector('#save-indicator');
const mobileMenuButton = document.querySelector('#mobile-menu-button');
const resetButton = document.querySelector('#reset-demo');

const LIBRARY_MODULES = new Set(['development', 'training', 'drills', 'equipment', 'health', 'nutrition', 'mental', 'visual']);
const moduleWorkspaceView = new Map();

function getRoute() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function setRoute(route) {
  location.hash = `#/${route}`;
}

function initials(athlete) {
  return `${athlete.firstName?.[0] || ''}${athlete.lastName?.[0] || ''}`.toUpperCase() || 'TP';
}

function dashboardModuleIcon(module) {
  if (module.id !== 'equipment') return module.icon;
  return `<svg viewBox="0 0 64 64" width="30" height="30" aria-label="Racchetta da tennis" role="img" style="display:block" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(-34 28 27)">
      <ellipse cx="28" cy="22" rx="13" ry="18"></ellipse>
      <path d="M28 40v10"></path>
      <path d="M23 50h10l-1 10h-8z"></path>
      <path d="M18 16h20M16 22h24M18 28h20M22 7v30M28 4v36M34 7v30" stroke-width="1.5" opacity=".72"></path>
    </g>
  </svg>`;
}

function renderDashboard() {
  const { athlete } = store.getState();
  const fullName = [athlete.firstName, athlete.lastName].filter(Boolean).join(' ') || 'Nuovo atleta';
  title.textContent = 'Dashboard';

  main.innerHTML = `
    <section class="hero">
      <div>
        <div class="hero-kicker">Athlete at the center</div>
        <h2>${fullName}</h2>
        <p>Un unico record collega sviluppo tecnico-tattico, atletica, lavoro in campo, mental, visual, salute, nutrizione e recupero, materiali, costi e calendario.</p>
      </div>
      <div class="hero-badge">🎾</div>
    </section>

    <section class="status-strip">
      <div class="status-card"><div class="label">Ranking</div><div class="value">${athlete.ranking || '—'}</div></div>
      <div class="status-card"><div class="label">Club</div><div class="value">${athlete.club || '—'}</div></div>
      <div class="status-card"><div class="label">Coach</div><div class="value">${athlete.coach || '—'}</div></div>
      <div class="status-card"><div class="label">Obiettivo stagione</div><div class="value">${athlete.seasonGoal || '—'}</div></div>
    </section>

    <div class="section-head">
      <div><h3>Player Journey</h3><p>I dodici domini del sistema operativo dell’atleta.</p></div>
    </div>

    <section class="module-grid">
      ${modules.map(m => `
        <article class="module-card" style="background:${m.color}">
          <div>
            <div class="module-top">
              <div class="module-icon">${dashboardModuleIcon(m)}</div>
              <div>
                <div class="module-number">${String(m.number).padStart(2,'0')}</div>
                <h4>${m.name}</h4>
                <p><strong>${m.subtitle}</strong></p>
              </div>
            </div>
            <p style="margin-top:12px">${m.description}</p>
          </div>
          <button class="module-link" data-route="${m.id}">Apri modulo →</button>
        </article>
      `).join('')}
    </section>
  `;
}

function renderAthleteProfile() {
  const { athlete } = store.getState();
  title.textContent = 'Athlete profile';

  main.innerHTML = `
    <section class="profile-layout">
      <div class="panel">
        <div class="panel-header">
          <h3>Record centrale dell’atleta</h3>
          <p>Questi dati saranno condivisi da tutti i moduli.</p>
        </div>
        <div class="panel-body">
          <form id="athlete-form" class="form-grid">
            <div class="field"><label>Nome</label><input name="firstName" value="${escapeAttr(athlete.firstName)}" /></div>
            <div class="field"><label>Cognome</label><input name="lastName" value="${escapeAttr(athlete.lastName)}" /></div>
            <div class="field"><label>Data di nascita</label><input name="birthDate" type="date" value="${escapeAttr(athlete.birthDate)}" /></div>
            <div class="field"><label>Nazionalità</label><input name="nationality" value="${escapeAttr(athlete.nationality)}" /></div>
            <div class="field"><label>Mano dominante</label>
              <select name="handedness">
                <option ${athlete.handedness === 'Destra' ? 'selected' : ''}>Destra</option>
                <option ${athlete.handedness === 'Sinistra' ? 'selected' : ''}>Sinistra</option>
              </select>
            </div>
            <div class="field"><label>Rovescio</label>
              <select name="backhand">
                <option ${athlete.backhand === 'Due mani' ? 'selected' : ''}>Due mani</option>
                <option ${athlete.backhand === 'Una mano' ? 'selected' : ''}>Una mano</option>
              </select>
            </div>
            <div class="field"><label>Ranking / classifica</label><input name="ranking" value="${escapeAttr(athlete.ranking)}" placeholder="es. FITP 3.5" /></div>
            <div class="field"><label>Club</label><input name="club" value="${escapeAttr(athlete.club)}" /></div>
            <div class="field"><label>Coach principale</label><input name="coach" value="${escapeAttr(athlete.coach)}" /></div>
            <div class="field"><label>Obiettivo stagione</label><input name="seasonGoal" value="${escapeAttr(athlete.seasonGoal)}" /></div>
            <div class="field full"><label>Note generali</label><textarea name="notes">${escapeHtml(athlete.notes)}</textarea></div>
          </form>
        </div>
      </div>

      <aside class="panel">
        <div class="panel-header"><h3>Anteprima profilo</h3><p>Identità usata in tutta l’app.</p></div>
        <div class="panel-body profile-summary">
          <div class="avatar">${initials(athlete)}</div>
          <h3>${escapeHtml([athlete.firstName, athlete.lastName].filter(Boolean).join(' ') || 'Nuovo atleta')}</h3>
          <p>${escapeHtml(athlete.ranking || 'Ranking non inserito')}</p>
          <div class="summary-list">
            <div class="summary-row"><span>Mano</span><span>${escapeHtml(athlete.handedness)}</span></div>
            <div class="summary-row"><span>Rovescio</span><span>${escapeHtml(athlete.backhand)}</span></div>
            <div class="summary-row"><span>Club</span><span>${escapeHtml(athlete.club || '—')}</span></div>
            <div class="summary-row"><span>Coach</span><span>${escapeHtml(athlete.coach || '—')}</span></div>
          </div>
        </div>
      </aside>
    </section>
  `;

  const form = document.querySelector('#athlete-form');
  form.addEventListener('input', () => {
    const data = Object.fromEntries(new FormData(form).entries());
    store.update(state => Object.assign(state.athlete, data));
    saveIndicator.textContent = 'Salvato';
  });
}

function renderModule(module, target = main) {
  title.textContent = `${module.number}. ${module.name}`;
  target.innerHTML = `
    <section class="panel placeholder">
      <div class="placeholder-inner">
        <div class="placeholder-icon" style="background:${module.color}">${module.icon}</div>
        <div class="eyebrow">Modulo ${String(module.number).padStart(2,'0')}</div>
        <h2>${module.name}</h2>
        <p><strong>${module.subtitle}</strong></p>
        <p style="margin-top:10px">${module.description}</p>
        ${module.id === 'development' ? `
          <p class="placeholder-note"><strong>Confine del modulo:</strong> Development segue l’evoluzione tecnica e tattica del gioco. Mental training e gestione della pressione vivono nel modulo Mental; gli esercizi operativi restano in Drills.</p>
          <button class="button button-ghost" data-route="drills" style="margin-top:14px">Apri Drills →</button>
        ` : module.id === 'training' ? `
          <p class="placeholder-note"><strong>Ambito:</strong> Athletics è riservato alla preparazione atletica: forza, potenza, velocità, agilità, conditioning, mobilità, prevenzione, test fisici e carico di lavoro.</p>
          <button class="button button-ghost" data-route="drills" style="margin-top:14px">Vai agli esercizi tennis →</button>
        ` : module.id === 'mental' ? `
          <p class="placeholder-note"><strong>Ambito:</strong> routine, respirazione, focus, self-talk, visualizzazione mentale, journaling e strategie per allenamento e gara.</p>
        ` : module.id === 'visual' ? `
          <p class="placeholder-note"><strong>Ambito:</strong> percezione della profondità e della traiettoria, lettura di altezza e spin, anticipazione, tracking e protocolli visivi/VR.</p>
        ` : module.id === 'competition' ? `
          <p class="placeholder-note"><strong>Confine del modulo:</strong> la scelta e la programmazione futura dei tornei resta nel Calendar. Competition raccoglierà match, risultati e analisi, collegandosi agli stessi tornei senza duplicarli.</p>
          <button class="button button-ghost" data-route="calendar" style="margin-top:14px">Apri programmazione tornei →</button>
        ` : `<p class="placeholder-note">La navigazione e il contenitore dati esistono già; costruiremo questo modulo in uno dei prossimi step senza cambiare l’architettura di base.</p>`}
      </div>
    </section>
  `;
}

function renderModuleWorkspace(module, contentRenderer) {
  const view = moduleWorkspaceView.get(module.id) || 'content';
  title.textContent = `${module.number}. ${module.name}`;
  main.innerHTML = `
    <div class="module-workspace-switch" role="tablist" aria-label="${escapeAttr(module.name)}">
      <button class="module-workspace-button ${view === 'content' ? 'active' : ''}" type="button" data-module-workspace="content">Modulo</button>
      <button class="module-workspace-button ${view === 'library' ? 'active' : ''}" type="button" data-module-workspace="library">Libreria</button>
    </div>
    <div id="module-workspace-host"></div>
  `;
  const host = main.querySelector('#module-workspace-host');
  if (view === 'library') {
    void renderResourceLibrary({
      main: host,
      title,
      moduleId: module.id,
      moduleName: module.name,
      athleteId: store.getState().athlete.id,
    });
  } else if (contentRenderer) {
    contentRenderer({ main: host, title, store });
  } else {
    renderModule(module, host);
  }
  main.querySelectorAll('[data-module-workspace]').forEach(button => {
    button.addEventListener('click', () => {
      moduleWorkspaceView.set(module.id, button.dataset.moduleWorkspace);
      render();
    });
  });
}

function render() {
  let route = getRoute();
  if (route === 'recovery') {
    setRoute('nutrition');
    return;
  }
  sidebar.innerHTML = renderSidebar(route);
  sidebar.classList.remove('open');

  if (route === 'dashboard') renderDashboard();
  else if (route === 'athlete') renderAthleteProfile();
  else if (route === 'calendar') renderCalendar({ main, title, store });
  else if (route === 'economics') renderEconomics({ main, title, store });
  else {
    const module = modules.find(m => m.id === route);
    if (!module) {
      setRoute('dashboard');
      return;
    }
    const renderer = route === 'training' ? renderTraining
      : route === 'drills' ? renderDrills
      : route === 'equipment' ? renderEquipment
      : route === 'nutrition' ? renderNutrition
      : null;
    if (LIBRARY_MODULES.has(route)) renderModuleWorkspace(module, renderer);
    else if (renderer) renderer({ main, title, store });
    else renderModule(module);
  }

  bindRouteButtons();
  main.focus({ preventScroll: true });
}

function bindRouteButtons() {
  document.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => setRoute(el.dataset.route));
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function escapeAttr(value = '') { return escapeHtml(value); }

window.addEventListener('hashchange', render);
mobileMenuButton.addEventListener('click', () => sidebar.classList.toggle('open'));
resetButton.addEventListener('click', async () => {
  const confirmed = await showInAppConfirm('Ripristinare i dati demo locali?', {
    title: 'Ripristina dati demo', confirmLabel: 'Ripristina', danger: true,
  });
  if (!confirmed) return;
  store.reset();
  render();
});
store.subscribe(() => {
  saveIndicator.textContent = 'Salvato in locale';
  const route = getRoute();
  if (route === 'dashboard') renderDashboard();
  else if (route === 'calendar' || route === 'training') queueMicrotask(render);
});

if (!location.hash) setRoute('dashboard');
else render();
