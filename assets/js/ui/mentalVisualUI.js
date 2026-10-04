import '../bootstrap.js?v=1.2.6';

import { modules } from '../data/schema.js?v=1.2.6';
import { store } from '../data/store.js?v=1.2.6';
import { fileProvider } from '../data/providers/provider.js?v=1.2.6';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js?v=1.2.6';
import {
  DEFAULT_MENTAL_SKILLS,
  REFLEXION_PRESET,
  VISUAL_STARTER_PROTOCOLS,
  loadStructuredPerformanceModule,
  normalizeMentalPayload,
  normalizeVisualPayload,
  startStructuredPerformanceSync,
} from '../cloud/mentalVisualCloud.js?v=1.2.11';
import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js?v=1.2.6';

const MENTAL_CONTEXTS = [
  { id: '', label: 'Non specificato' },
  { id: 'off-court', label: 'Fuori campo' },
  { id: 'court', label: 'Campo' },
  { id: 'pre-match', label: 'Pre-match' },
  { id: 'between-points', label: 'Tra i punti' },
  { id: 'changeover', label: 'Cambio campo' },
  { id: 'post-match', label: 'Post-match' },
  { id: 'match-simulation', label: 'Match simulation' },
];

const VISUAL_DOMAINS = [
  {
    id: 'funzione-visiva',
    name: 'Funzione visiva',
    description: 'Acuità statica e dinamica, contrasto, motilità oculare, accomodazione, vergenza, profondità, periferica e figura-sfondo.',
    color: '#4f7fce',
    icon: '◉',
  },
  {
    id: 'percezione-anticipazione',
    name: 'Percezione e anticipazione',
    description: 'Lettura di profondità, traiettoria, lungo/corto, alto/basso, spin, attenzione visiva e anticipazione tennis-specifica.',
    color: '#8a63c7',
    icon: '↗',
  },
  {
    id: 'neurocognitivo',
    name: 'Neurocognitivo',
    description: 'Velocità di elaborazione, flessibilità mentale, inibizione reattiva e risposta a stimoli semplici o complessi.',
    color: '#d3833b',
    icon: '⚡',
  },
  {
    id: 'sensomotorio',
    name: 'Sensomotorio',
    description: 'Coordinazione occhio-mano, propriocezione, equilibrio, coordinazione bilaterale e integrazione tra percezione e movimento.',
    color: '#3e9b82',
    icon: '◎',
  },
];

let mentalSection = 'panoramica';
let visualSection = 'panoramica';
let cloudState = {
  mental: { athleteId: '', loaded: false, stop: null, error: '' },
  visual: { athleteId: '', loaded: false, stop: null, error: '' },
};
let enhancementQueued = false;
let mentalResourceCache = [];

function route() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function mentalSkills(mental = normalizeMentalPayload(store.getState().mental)) {
  return Array.isArray(mental.skillDefinitions) ? mental.skillDefinitions : [];
}

function skillById(id, mental = normalizeMentalPayload(store.getState().mental)) {
  return mentalSkills(mental).find(item => item.id === id);
}

function isDefaultMentalSkill(id) {
  return DEFAULT_MENTAL_SKILLS.some(item => item.id === id);
}

function mentalTools(mental = normalizeMentalPayload(store.getState().mental)) {
  return Array.isArray(mental.tools) ? mental.tools : [];
}


const MENTAL_TOOL_PALETTE = [
  '#5b7cfa',
  '#8b5cf6',
  '#0ea5a8',
  '#d97706',
  '#e0527d',
  '#3b82a0',
  '#4f9b62',
  '#9a6b42',
];

function mentalToolColor(index = 0) {
  return MENTAL_TOOL_PALETTE[Math.abs(Number(index || 0)) % MENTAL_TOOL_PALETTE.length];
}

function mentalToolInitials(name = '') {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'M';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function toolById(id, mental = normalizeMentalPayload(store.getState().mental)) {
  return mentalTools(mental).find(item => item.id === id);
}

function mentalResourceById(id) {
  return mentalResourceCache.find(item => item.id === id);
}

async function refreshMentalResourceCache() {
  try {
    mentalResourceCache = await fileProvider.listResources('mental');
  } catch (error) {
    console.warn('Mental resource library unavailable.', error);
    mentalResourceCache = [];
  }
  return mentalResourceCache;
}

function openMentalResource(resourceId) {
  const resource = mentalResourceById(resourceId);
  if (!resource) return;

  try {
    sessionStorage.setItem(
      'tpos.resource-library.focus.v1',
      JSON.stringify({ moduleId: 'mental', resourceId }),
    );
  } catch {}

  document
    .querySelector('.module-workspace-button[data-module-workspace="library"]')
    ?.click();
}

function mentalContextLabel(id) {
  return MENTAL_CONTEXTS.find(item => item.id === id)?.label || '';
}

function mentalExercises(mental = normalizeMentalPayload(store.getState().mental)) {
  return Array.isArray(mental.exercises) ? mental.exercises : [];
}

function exercisesForSkill(mental, skillId) {
  return mentalExercises(mental).filter(exercise =>
    Array.isArray(exercise.skillIds) && exercise.skillIds.includes(skillId)
  );
}

function exercisesForTool(mental, toolId) {
  return mentalExercises(mental).filter(exercise =>
    Array.isArray(exercise.toolIds) && exercise.toolIds.includes(toolId)
  );
}

function exerciseById(id, mental = normalizeMentalPayload(store.getState().mental)) {
  return mentalExercises(mental).find(exercise => exercise.id === id);
}


function localDateFromKey(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMentalDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  if (!total) return '0 min';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${total} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function mentalSessionTopic(session, mental) {
  const linkedExercises = (session.exerciseIds || [])
    .map(id => exerciseById(id, mental))
    .filter(Boolean);

  if (linkedExercises.length) {
    return linkedExercises.map(exercise => exercise.title).join(' · ');
  }

  return skillById(session.skillId, mental)?.short
    || session.skillNameSnapshot
    || 'Sessione libera';
}

function summarizeMentalSessions(mental, days = 30) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));

  const sessions = [...mental.trainingSessions]
    .filter(session => {
      const date = localDateFromKey(session.date);
      return date && date >= cutoff && date <= today;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const totalMinutes = sessions.reduce(
    (sum, session) => sum + Math.max(0, Number(session.durationMin || 0)),
    0,
  );

  const focusMinutes = new Map();

  const addFocusMinutes = (skillId, minutes) => {
    if (!skillById(skillId, mental) || minutes <= 0) return;
    focusMinutes.set(skillId, (focusMinutes.get(skillId) || 0) + minutes);
  };

  sessions.forEach(session => {
    const duration = Math.max(0, Number(session.durationMin || 0));
    if (!duration) return;

    const linkedExercises = (session.exerciseIds || [])
      .map(id => exerciseById(id, mental))
      .filter(Boolean);

    if (linkedExercises.length) {
      const perExercise = duration / linkedExercises.length;

      linkedExercises.forEach(exercise => {
        const activeSkillIds = [...new Set(exercise.skillIds || [])]
          .filter(id => skillById(id, mental));

        if (!activeSkillIds.length) return;
        const perSkill = perExercise / activeSkillIds.length;
        activeSkillIds.forEach(id => addFocusMinutes(id, perSkill));
      });

      return;
    }

    if (session.skillId) addFocusMinutes(session.skillId, duration);
  });

  const focus = [...focusMinutes.entries()]
    .map(([skillId, minutes]) => ({
      skill: skillById(skillId, mental),
      minutes,
    }))
    .filter(item => item.skill)
    .sort((a, b) => b.minutes - a.minutes);

  return {
    days,
    sessions,
    totalMinutes,
    lastSession: sessions[0] || null,
    focus,
  };
}

function openMentalExercise(host, exerciseId) {
  mentalSection = 'esercizi';
  renderMental(host);

  requestAnimationFrame(() => {
    const card = [...host.querySelectorAll('[data-mental-exercise-card]')]
      .find(node => node.dataset.mentalExerciseCard === exerciseId);

    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('mv-exercise-highlight');
    window.setTimeout(() => card.classList.remove('mv-exercise-highlight'), 1400);
  });
}

function protocolById(id, visual = normalizeVisualPayload(store.getState().visual)) {
  return visual.protocols.find(item => item.id === id);
}

function domainById(id) {
  return VISUAL_DOMAINS.find(item => item.id === id);
}


function visualDomainColor(id) {
  return domainById(id)?.color || '#637aa0';
}

function visualProtocolColor(protocol) {
  return visualDomainColor(protocol?.domains?.[0] || '');
}

function visualProtocolIcon(protocol) {
  return domainById(protocol?.domains?.[0] || '')?.icon || '◌';
}

function applyModuleMetadata() {
  const mental = modules.find(item => item.id === 'mental');
  const visual = modules.find(item => item.id === 'visual');

  if (mental) {
    mental.name = 'Mental';
    mental.subtitle = 'Motivazione · Fiducia · Concentrazione · Regolazione';
    mental.description = 'Allenamento mentale della prestazione: motivazione, fiducia, concentrazione, regolazione emotiva, mental resilience, mental toughness, mental imagery e strumenti operativi.';
  }

  if (visual) {
    visual.name = 'Perception & Neuro';
    visual.subtitle = 'Visione · Neurocognizione · Coordinazione · Propriocezione';
    visual.description = 'Allenamento visivo, percettivo, neurocognitivo e sensomotorio con protocolli, sessioni e misurazioni longitudinali Reflexion Go.';
  }
}

function patchVisibleMetadata() {
  const meta = {
    mental: modules.find(item => item.id === 'mental'),
    visual: modules.find(item => item.id === 'visual'),
  };

  for (const [id, module] of Object.entries(meta)) {
    if (!module) continue;

    document.querySelectorAll(`[data-route="${id}"] .nav-label`).forEach(node => {
      node.textContent = `${module.number}. ${module.name}`;
    });

    const dashboardButton = document.querySelector(`.module-card [data-route="${id}"]`);
    const card = dashboardButton?.closest('.module-card');

    if (card) {
      const h4 = card.querySelector('h4');
      const subtitle = card.querySelector('.module-top p strong');
      const paragraphs = card.querySelectorAll(':scope > div > p');

      if (h4) h4.textContent = module.name;
      if (subtitle) subtitle.textContent = module.subtitle;
      if (paragraphs.length) {
        paragraphs[paragraphs.length - 1].textContent = module.description;
      }
    }
  }
}

function setCloudIndicator(moduleKey, status, message = '') {
  if (route() !== moduleKey) return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  const label = moduleKey === 'mental' ? 'Mental' : 'Perception & Neuro';

  if (status === 'syncing') {
    indicator.textContent = `${label} → cloud…`;
    indicator.title = `Sincronizzazione ${label} con Supabase in corso.`;
  } else if (status === 'error') {
    indicator.textContent = `${label} · cache locale`;
    indicator.title = message || 'Sincronizzazione cloud non disponibile.';
  } else if (status === 'readonly') {
    indicator.textContent = `${label} cloud · sola lettura`;
    indicator.title = 'Questo account può leggere il modulo ma non modificarlo.';
  } else {
    indicator.textContent = `${label} cloud ✓`;
    indicator.title = `${label} sincronizzato con Supabase.`;
  }
}

async function ensureCloud(moduleKey) {
  const access = getCurrentAccess();
  const athleteId = String(access.athleteId || '');

  if (!athleteId || !canReadModule(moduleKey)) return;

  const slot = cloudState[moduleKey];

  if (slot.loaded && slot.athleteId === athleteId) {
    setCloudIndicator(
      moduleKey,
      canWriteModule(moduleKey) ? 'synced' : 'readonly',
    );
    return;
  }

  slot.stop?.();
  slot.stop = null;
  slot.loaded = false;
  slot.athleteId = athleteId;

  const result = await loadStructuredPerformanceModule({
    store,
    athleteId,
    moduleKey,
  });

  slot.loaded = true;
  slot.error = result.cloudError?.message || '';

  if (canWriteModule(moduleKey)) {
    slot.stop = startStructuredPerformanceSync({
      store,
      athleteId,
      moduleKey,
      onStatus: ({ status, message }) => {
        setCloudIndicator(moduleKey, status, message);
      },
    });

    setCloudIndicator(
      moduleKey,
      result.cloudError ? 'error' : 'synced',
      slot.error,
    );
  } else {
    setCloudIndicator(moduleKey, 'readonly');
  }
}

function activeContentHost() {
  const contentButton = document.querySelector(
    '.module-workspace-button[data-module-workspace="content"].active',
  );

  if (!contentButton) return null;
  return document.querySelector('#module-workspace-host');
}

function internalTabs(active, items, attr) {
  return `
    <div class="mv-section-switch" role="tablist">
      ${items.map(item => `
        <button
          class="mv-section-button ${active === item.id ? 'active' : ''}"
          type="button"
          ${attr}="${item.id}"
        >${escapeHtml(item.label)}</button>
      `).join('')}
    </div>
  `;
}

function readOnlyNote(moduleKey) {
  if (canWriteModule(moduleKey)) return '';

  return `
    <div class="access-info mv-readonly">
      Questo modulo è disponibile in sola lettura per questo account.
    </div>
  `;
}

function renderMental(host) {
  const mental = normalizeMentalPayload(store.getState().mental);

  host.innerHTML = `
    <section class="mv-module-head mv-visual-module-head">
      <div>
        <div class="eyebrow">Mental</div>
        <h2>Prestazione mentale</h2>
        <p>Abilità, strumenti e routine organizzati senza confondere cause, tecniche di allenamento e stati di prestazione.</p>
      </div>
    </section>

    ${readOnlyNote('mental')}

    ${internalTabs(mentalSection, [
      { id: 'panoramica', label: 'Overview' },
      { id: 'abilita', label: 'Abilità' },
      { id: 'strumenti', label: 'Strumenti' },
      { id: 'esercizi', label: 'Esercizi' },
      { id: 'allenamento', label: 'Allenamento' },
      { id: 'review', label: 'Review partita' },
    ], 'data-mental-section')}

    <div id="mental-section-host"></div>
  `;

  host.querySelectorAll('[data-mental-section]').forEach(button => {
    button.addEventListener('click', () => {
      mentalSection = button.dataset.mentalSection;
      renderMental(host);
    });
  });

  const sectionHost = host.querySelector('#mental-section-host');

  if (mentalSection === 'abilita') {
    renderMentalSkills(sectionHost, mental, host);
  } else if (mentalSection === 'strumenti') {
    renderMentalTools(sectionHost, mental, host);
  } else if (mentalSection === 'esercizi') {
    renderMentalExercises(sectionHost, mental, host);
  } else if (mentalSection === 'allenamento') {
    renderMentalTraining(sectionHost, mental, host);
  } else if (mentalSection === 'review') {
    renderMentalReview(sectionHost, mental, host);
  } else {
    renderMentalOverview(sectionHost, mental, host);
  }
}

function renderMentalOverview(container, mental, host) {
  const skills = mentalSkills(mental);
  const sessions = [...mental.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const reviews = [...mental.matchReviews]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const levelAverage = skills.length
    ? skills.reduce(
        (sum, skill) => sum + Number(mental.skills[skill.id]?.scorePct ?? 60),
        0,
      ) / skills.length
    : 0;

  const activity = summarizeMentalSessions(mental, 30);
  const maxFocusMinutes = Math.max(
    1,
    ...activity.focus.map(item => item.minutes),
  );

  container.innerHTML = `
    <section class="mv-kpis mv-overview-kpis">
      <article class="mv-kpi mv-kpi-card mv-kpi-areas">
        <div class="mv-kpi-icon" aria-hidden="true">◆</div>
        <div class="mv-kpi-copy">
          <span>Aree di lavoro</span>
          <strong>${skills.length}</strong>
          <small>profilo attivo</small>
        </div>
      </article>

      <article class="mv-kpi mv-kpi-card mv-kpi-average">
        <div
          class="mv-average-gauge"
          style="--mv-gauge-angle:${Math.max(0, Math.min(100, Math.round(levelAverage))) * 3.6}deg"
          aria-label="Valutazione media ${Math.round(levelAverage)}%"
        >
          <div class="mv-average-gauge-inner">
            <strong>${Math.round(levelAverage)}%</strong>
            <span>media</span>
          </div>
        </div>
        <div class="mv-kpi-copy">
          <span>Valutazione media</span>
          <strong class="mv-kpi-average-label">Profilo complessivo</strong>
          <small>media delle aree attive</small>
        </div>
      </article>

      <article class="mv-kpi mv-kpi-card mv-kpi-sessions">
        <div class="mv-kpi-icon" aria-hidden="true">◷</div>
        <div class="mv-kpi-copy">
          <span>Sessioni registrate</span>
          <strong>${mental.trainingSessions.length}</strong>
          <small>${activity.sessions.length} negli ultimi 30 giorni</small>
        </div>
      </article>

      <article class="mv-kpi mv-kpi-card mv-kpi-reviews">
        <div class="mv-kpi-icon" aria-hidden="true">✓</div>
        <div class="mv-kpi-copy">
          <span>Review partita</span>
          <strong>${mental.matchReviews.length}</strong>
          <small>feedback competitivo</small>
        </div>
      </article>
    </section>

    <section class="mv-grid-2">
      <article class="panel mv-overview-goals-panel">
        <div class="panel-header">
          <div class="mv-panel-title-with-icon">
            <span class="mv-panel-icon" aria-hidden="true">◎</span>
            <div>
              <h3>Obiettivi mentali</h3>
              <p>Tre livelli progressivi: Bronzo, Argento e Oro.</p>
            </div>
          </div>
        </div>
        <div class="panel-body">
          ${canWriteModule('mental') ? `
            <form id="mental-goals-form" class="mv-goals-grid">
              ${goalField('Bronzo', 'bronze', mental.goals.bronze)}
              ${goalField('Argento', 'silver', mental.goals.silver)}
              ${goalField('Oro', 'gold', mental.goals.gold)}
              <button class="button button-primary" type="submit">Salva obiettivi</button>
            </form>
          ` : `
            <div class="mv-goals-readonly">
              ${goalReadOnly('Bronzo', mental.goals.bronze)}
              ${goalReadOnly('Argento', mental.goals.silver)}
              ${goalReadOnly('Oro', mental.goals.gold)}
            </div>
          `}
        </div>
      </article>

      <article class="panel mv-mental-window-panel">
        <div class="panel-header">
          <div class="mv-panel-title-with-icon">
            <span class="mv-panel-icon mv-panel-icon-activity" aria-hidden="true">↗</span>
            <div>
              <h3>Allenamento mentale · ultimi 30 giorni</h3>
              <p>Quanto, quando e su quali aree è stato distribuito il lavoro.</p>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <div class="mv-window-kpis">
            <div>
              <span>Tempo totale</span>
              <strong>${formatMentalDuration(activity.totalMinutes)}</strong>
            </div>
            <div>
              <span>Sessioni</span>
              <strong>${activity.sessions.length}</strong>
            </div>
            <div>
              <span>Ultima</span>
              <strong>${activity.lastSession ? formatDate(activity.lastSession.date) : '—'}</strong>
            </div>
          </div>

          ${activity.focus.length ? `
            <div class="mv-focus-summary">
              <div class="mv-summary-label">Focus per tempo stimato</div>
              ${activity.focus.slice(0, 6).map(item => {
                const width = Math.max(4, Math.round((item.minutes / maxFocusMinutes) * 100));
                return `
                  <div class="mv-focus-row" style="--mv-focus-color:${item.skill.color}">
                    <div class="mv-focus-row-head">
                      <span>${escapeHtml(item.skill.short || item.skill.name)}</span>
                      <strong>${formatMentalDuration(item.minutes)}</strong>
                    </div>
                    <div class="mv-focus-track">
                      <div class="mv-focus-fill" style="width:${width}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="mv-window-empty">Nessun focus quantificabile negli ultimi 30 giorni.</div>'}

          ${activity.sessions.length ? `
            <div class="mv-window-recent">
              <div class="mv-summary-label">Sessioni più recenti</div>
              ${activity.sessions.slice(0, 4).map(session => `
                <div class="mv-window-session-row">
                  <span>${formatDate(session.date)}</span>
                  <strong>${escapeHtml(mentalSessionTopic(session, mental))}</strong>
                  <em>${formatMentalDuration(session.durationMin)}</em>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </article>
    </section>

    <section class="mv-grid-2">
      <article class="panel">
        <div class="panel-header">
          <h3>Ultime sessioni</h3>
          <p>Allenamento mentale recente.</p>
        </div>
        <div class="panel-body mv-simple-list">
          ${sessions.length
            ? sessions.slice(0, 5).map(mentalSessionRow).join('')
            : emptyCopy('Nessuna sessione mentale registrata.')}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <h3>Ultime review partita</h3>
          <p>Valutazione post-partita.</p>
        </div>
        <div class="panel-body mv-simple-list">
          ${reviews.length
            ? reviews.slice(0, 5).map(reviewRow).join('')
            : emptyCopy('Nessuna review partita registrata.')}
        </div>
      </article>
    </section>
  `;

  container.querySelector('#mental-goals-form')?.addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      next.goals = {
        bronze: String(data.bronze || '').trim(),
        silver: String(data.silver || '').trim(),
        gold: String(data.gold || '').trim(),
      };
      state.mental = next;
    });

    renderMental(host);
  });
}

function goalField(label, name, value) {
  return `
    <label class="mv-goal-field mv-goal-${name}">
      <span>${label}</span>
      <textarea name="${name}" placeholder="Obiettivo ${label.toLowerCase()}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function goalReadOnly(label, value) {
  const key = label.toLowerCase() === 'bronzo'
    ? 'bronze'
    : label.toLowerCase() === 'argento'
      ? 'silver'
      : 'gold';

  return `
    <div class="mv-goal-readonly mv-goal-${key}">
      <span>${label}</span>
      <strong>${escapeHtml(value || '—')}</strong>
    </div>
  `;
}

function renderMentalSkills(container, mental, host) {
  const skills = mentalSkills(mental);
  const missingDefaults = DEFAULT_MENTAL_SKILLS.filter(
    defaultSkill => !skills.some(skill => skill.id === defaultSkill.id),
  );

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Abilità mentali</div>
        <h2>Aree di lavoro</h2>
        <p>Le sei aree predefinite sono il punto di partenza, ma la mappa può essere adattata al singolo atleta. La valutazione resta una misura interna di lavoro.</p>
      </div>
      ${canWriteModule('mental') ? `
        <div class="mv-subhead-actions">
          <button class="button button-ghost" id="mental-restore-default-skills" type="button" ${missingDefaults.length ? '' : 'disabled'}>
            Ripristina aree predefinite${missingDefaults.length ? ` (${missingDefaults.length})` : ''}
          </button>
          <button class="button button-primary" id="mental-add-skill" type="button">+ Nuova area</button>
        </div>
      ` : ''}
    </section>

    ${skills.length ? `
      <div class="mv-skill-grid">
        ${skills.map(skill => {
          const value = mental.skills[skill.id] || { scorePct: 60, notes: '' };
          const score = Math.max(0, Math.min(100, Math.round(Number(value.scorePct ?? 60))));
          const linked = exercisesForSkill(mental, skill.id);

          return `
            <article class="panel mv-skill-card" data-mental-skill-card="${skill.id}" style="--mv-skill-color:${skill.color}">
              <div class="panel-body">
                <div class="mv-skill-card-head">
                  <div>
                    <div class="eyebrow">${escapeHtml(skill.short)}</div>
                    <h3>${escapeHtml(skill.name)}</h3>
                  </div>
                  <div class="mv-skill-head-actions">
                    <strong class="mv-level-badge" data-mental-score-badge="${skill.id}">${score}%</strong>
                    ${canWriteModule('mental') ? `
                      <div class="mv-exercise-actions">
                        <button class="button button-ghost mv-small-button" type="button" data-edit-mental-skill="${escapeAttr(skill.id)}">Modifica</button>
                        <button class="resource-delete" type="button" data-delete-mental-skill="${escapeAttr(skill.id)}">Elimina</button>
                      </div>
                    ` : ''}
                  </div>
                </div>

                <div class="mv-skill-meter" aria-label="${escapeAttr(skill.name)} ${score}%">
                  <div class="mv-skill-meter-fill" data-mental-score-fill="${skill.id}" style="width:${score}%"></div>
                </div>

                ${skill.description ? `<p>${escapeHtml(skill.description)}</p>` : ''}

                ${(skill.indicators || []).length ? `
                  <div class="mv-tags">
                    ${skill.indicators.map(item => `<span>${escapeHtml(item)}</span>`).join('')}
                  </div>
                ` : ''}

                <div class="mv-linked-exercises">
                  <div class="mv-linked-head">
                    <strong>Esercizi collegati</strong>
                    <span>${linked.length}</span>
                  </div>
                  ${linked.length
                    ? `<div class="mv-linked-list">
                        ${linked.map(exercise => `
                          <button class="mv-link-chip" type="button" data-open-mental-exercise="${escapeAttr(exercise.id)}">
                            ${escapeHtml(exercise.title)}
                          </button>
                        `).join('')}
                      </div>`
                    : '<span class="mv-linked-empty">Nessun esercizio collegato.</span>'}
                </div>

                ${canWriteModule('mental') ? `
                  <form data-mental-skill-form="${skill.id}" class="mv-skill-form">
                    <label class="mv-score-control">
                      <span>Valutazione attuale</span>
                      <div>
                        <input
                          type="range"
                          name="scorePct"
                          min="0"
                          max="100"
                          step="5"
                          value="${score}"
                          data-mental-score-input="${skill.id}"
                        />
                        <output data-mental-score-output="${skill.id}">${score}%</output>
                      </div>
                    </label>

                    <label>
                      <span>Nota di lavoro</span>
                      <textarea name="notes" placeholder="Cosa stiamo allenando?">${escapeHtml(value.notes)}</textarea>
                    </label>

                    <button class="button button-ghost" type="submit">Salva</button>
                  </form>
                ` : value.notes
                  ? `<div class="mv-note">${escapeHtml(value.notes)}</div>`
                  : ''}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <section class="panel">
        <div class="panel-body mv-empty-state-actions">
          ${emptyCopy('Nessuna area mentale attiva.')}
          ${canWriteModule('mental')
            ? '<button class="button button-primary" id="mental-restore-default-skills-empty" type="button">Ripristina le sei aree predefinite</button>'
            : ''}
        </div>
      </section>
    `}

    <section class="panel mv-frustration-panel mv-resilience-framework">
      <div class="panel-header">
        <div>
          <div class="eyebrow">Framework · Mental resilience & Mental toughness</div>
          <h3>Gestione della frustrazione</h3>
          <p>Un modello trasversale di prevenzione, gestione e recupero da applicare negli esercizi e nelle situazioni competitive.</p>
        </div>
      </div>
      <div class="panel-body mv-three-columns">
        <div>
          <strong>Prevenzione</strong>
          <span>Preparazione, obiettivi realistici e controllabili, memoria selettiva, aumento della soglia di tolleranza.</span>
        </div>
        <div>
          <strong>Gestione</strong>
          <span>Autodiagnosi, respirazione, linguaggio del corpo, dialogo interno, reset e consapevolezza breve.</span>
        </div>
        <div>
          <strong>Recupero</strong>
          <span>Capire senza giudicare, individuare la correzione, lasciare andare l’errore e tornare al punto successivo.</span>
        </div>
      </div>
    </section>
  `;

  const restoreDefaults = () => {
    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      const existingById = new Map(
        next.skillDefinitions.map(skill => [skill.id, skill]),
      );
      const defaultIds = new Set(DEFAULT_MENTAL_SKILLS.map(skill => skill.id));

      const restoredDefaults = DEFAULT_MENTAL_SKILLS.map(defaultSkill => {
        const existing = existingById.get(defaultSkill.id);
        return existing || {
          ...defaultSkill,
          indicators: [...defaultSkill.indicators],
        };
      });

      const customSkills = next.skillDefinitions.filter(
        skill => !defaultIds.has(skill.id),
      );

      next.skillDefinitions = [...restoredDefaults, ...customSkills];
      state.mental = next;
    });

    renderMental(host);
  };

  container.querySelector('#mental-add-skill')?.addEventListener('click', () => {
    openMentalSkillDialog(host);
  });

  container.querySelector('#mental-restore-default-skills')?.addEventListener('click', restoreDefaults);
  container.querySelector('#mental-restore-default-skills-empty')?.addEventListener('click', restoreDefaults);

  container.querySelectorAll('[data-edit-mental-skill]').forEach(button => {
    button.addEventListener('click', () => {
      const current = normalizeMentalPayload(store.getState().mental);
      const skill = skillById(button.dataset.editMentalSkill, current);
      if (skill) openMentalSkillDialog(host, skill);
    });
  });

  container.querySelectorAll('[data-delete-mental-skill]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deleteMentalSkill;
      const current = normalizeMentalPayload(store.getState().mental);
      const skill = skillById(id, current);
      if (!skill) return;

      const linkedTools = mentalTools(current).filter(
        tool => (tool.skillIds || []).includes(id),
      ).length;
      const linkedExercises = exercisesForSkill(current, id).length;
      const isDefault = isDefaultMentalSkill(id);

      const message = isDefault
        ? `Eliminare “${skill.name}” dalle aree attive? I collegamenti esistenti vengono conservati e torneranno visibili se ripristini le aree predefinite.`
        : `Eliminare “${skill.name}”? Verrà rimossa anche dai ${linkedTools} strumenti e ${linkedExercises} esercizi collegati. Le sessioni storiche manterranno il nome dell’area.`;

      const ok = await showInAppConfirm(
        message,
        { title: 'Elimina area mentale', confirmLabel: 'Elimina', danger: true },
      );
      if (!ok) return;

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.skillDefinitions = next.skillDefinitions.filter(item => item.id !== id);

        next.trainingSessions = next.trainingSessions.map(session => (
          session.skillId === id
            ? {
                ...session,
                skillNameSnapshot: session.skillNameSnapshot || skill.short || skill.name,
                skillId: isDefault ? session.skillId : '',
              }
            : session
        ));

        if (!isDefault) {
          delete next.skills[id];
          next.tools = next.tools.map(tool => ({
            ...tool,
            skillIds: (tool.skillIds || []).filter(skillId => skillId !== id),
          }));
          next.exercises = next.exercises.map(exercise => ({
            ...exercise,
            skillIds: (exercise.skillIds || []).filter(skillId => skillId !== id),
          }));
        }

        state.mental = next;
      });

      renderMental(host);
    });
  });

  container.querySelectorAll('[data-open-mental-exercise]').forEach(button => {
    button.addEventListener('click', () => {
      openMentalExercise(host, button.dataset.openMentalExercise);
    });
  });

  container.querySelectorAll('[data-mental-score-input]').forEach(input => {
    input.addEventListener('input', () => {
      const id = input.dataset.mentalScoreInput;
      const score = Math.max(0, Math.min(100, Number(input.value || 0)));
      const output = container.querySelector(`[data-mental-score-output="${id}"]`);
      const badge = container.querySelector(`[data-mental-score-badge="${id}"]`);
      const fill = container.querySelector(`[data-mental-score-fill="${id}"]`);
      if (output) output.textContent = `${score}%`;
      if (badge) badge.textContent = `${score}%`;
      if (fill) fill.style.width = `${score}%`;
    });
  });

  container.querySelectorAll('[data-mental-skill-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();

      const id = form.dataset.mentalSkillForm;
      const data = Object.fromEntries(new FormData(form).entries());
      const scorePct = Math.max(0, Math.min(100, Number(data.scorePct ?? 60)));

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.skills[id] = {
          scorePct,
          level: scorePct / 20,
          notes: String(data.notes || '').trim(),
        };
        state.mental = next;
      });

      renderMentalSkills(
        container,
        normalizeMentalPayload(store.getState().mental),
        host,
      );
    });
  });
}

function openMentalSkillDialog(host, skill = null) {
  const current = skill || {
    name: '',
    short: '',
    description: '',
    indicators: [],
    color: '#637aa0',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="mental-skill-definition-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Mental · Aree di lavoro</div>
          <h3>${skill ? 'Modifica area' : 'Nuova area'}</h3>
        </div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Nome area</label>
          <input name="name" value="${escapeAttr(current.name)}" placeholder="Es. Decision making sotto pressione" required />
        </div>

        <div class="field">
          <label>Etichetta breve</label>
          <input name="short" value="${escapeAttr(current.short)}" placeholder="Es. Decision making" />
        </div>

        <div class="field">
          <label>Colore barra</label>
          <input name="color" type="color" value="${escapeAttr(current.color || '#637aa0')}" />
        </div>

        <div class="field full">
          <label>Descrizione</label>
          <textarea name="description" placeholder="Che cosa misura e allena quest’area?">${escapeHtml(current.description || '')}</textarea>
        </div>

        <div class="field full">
          <label>Indicatori <span class="field-optional">separati da virgola</span></label>
          <input name="indicators" value="${escapeAttr((current.indicators || []).join(', '))}" placeholder="es. reset, pressione, lucidità" />
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">${skill ? 'Salva modifiche' : 'Crea area'}</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#mental-skill-definition-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    if (!name) return;

    const currentMental = normalizeMentalPayload(store.getState().mental);
    const duplicate = mentalSkills(currentMental).find(item =>
      item.id !== skill?.id
      && item.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      await showInAppAlert(
        'Esiste già un’area mentale con questo nome.',
        { title: 'Area duplicata' },
      );
      return;
    }

    const now = new Date().toISOString();
    const record = {
      id: skill?.id || uid('mental-skill'),
      name,
      short: String(formData.get('short') || '').trim() || name,
      description: String(formData.get('description') || '').trim(),
      indicators: String(formData.get('indicators') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
      color: String(formData.get('color') || '#637aa0'),
      createdAt: skill?.createdAt || now,
      updatedAt: now,
    };

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      const index = next.skillDefinitions.findIndex(item => item.id === record.id);

      if (index >= 0) next.skillDefinitions[index] = record;
      else next.skillDefinitions.push(record);

      if (!next.skills[record.id]) {
        next.skills[record.id] = { scorePct: 60, level: 3, notes: '' };
      }

      state.mental = next;
    });

    dialog.close();
    mentalSection = 'abilita';
    renderMental(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderMentalTools(container, mental, host) {
  const tools = mentalTools(mental);

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Strumenti</div>
        <h2>Cassetta degli attrezzi mentale</h2>
        <p>La toolbox è personale: puoi aggiungere, modificare o rimuovere strumenti e collegarli alle abilità su cui lavorano.</p>
      </div>
      ${canWriteModule('mental')
        ? '<button class="button button-primary" id="mental-add-tool" type="button">+ Nuovo strumento</button>'
        : ''}
    </section>

    ${tools.length
      ? `<div class="mv-tool-grid">
          ${tools.map((tool, toolIndex) => {
            const linked = exercisesForTool(mental, tool.id);
            const linkedSkills = (tool.skillIds || [])
              .map(id => skillById(id, mental))
              .filter(Boolean);

            const toolColor = mentalToolColor(toolIndex);
            const initials = mentalToolInitials(tool.name);

            return `
              <article class="panel mv-tool-card mv-tool-card-polished" style="--mv-tool-color:${toolColor}">
                <div class="panel-body">
                  <div class="mv-tool-card-head">
                    <div class="mv-tool-identity">
                      <span class="mv-tool-monogram" aria-hidden="true">${escapeHtml(initials)}</span>
                      <div>
                        <h3>${escapeHtml(tool.name)}</h3>
                        ${tool.description ? `<p>${escapeHtml(tool.description)}</p>` : ''}
                      </div>
                    </div>
                    ${canWriteModule('mental') ? `
                      <div class="mv-exercise-actions">
                        <button class="button button-ghost mv-small-button" type="button" data-edit-mental-tool="${escapeAttr(tool.id)}">Modifica</button>
                        <button class="resource-delete" type="button" data-delete-mental-tool="${escapeAttr(tool.id)}">Elimina</button>
                      </div>
                    ` : ''}
                  </div>

                  <div class="mv-tool-meta-row">
                    <div class="mv-tags mv-tool-skill-tags">
                      ${linkedSkills.length
                        ? linkedSkills.map(skill => `
                            <span class="mv-tool-skill-chip" style="--mv-tool-skill-color:${skill.color || toolColor}">
                              ${escapeHtml(skill.short || skill.name)}
                            </span>
                          `).join('')
                        : '<span>Nessuna abilità collegata</span>'}
                    </div>
                    <div class="mv-tool-count" title="Esercizi collegati">
                      <strong>${linked.length}</strong>
                      <span>esercizi</span>
                    </div>
                  </div>

                  <div class="mv-linked-exercises mv-tool-linked-exercises">
                    <div class="mv-linked-head">
                      <strong>Esercizi collegati</strong>
                      <span>${linked.length}</span>
                    </div>
                    ${linked.length
                      ? `<div class="mv-linked-list">
                          ${linked.map(exercise => `
                            <button class="mv-link-chip" type="button" data-open-mental-exercise="${escapeAttr(exercise.id)}">
                              ${escapeHtml(exercise.title)}
                            </button>
                          `).join('')}
                        </div>`
                      : '<span class="mv-linked-empty">Nessun esercizio collegato.</span>'}
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>`
      : `<section class="panel">
          <div class="panel-body mv-empty-state-actions">
            ${emptyCopy('La cassetta degli attrezzi è vuota.')}
            ${canWriteModule('mental')
              ? '<button class="button button-primary" id="mental-add-tool-empty" type="button">Crea il primo strumento</button>'
              : ''}
          </div>
        </section>`}

  `;

  const add = () => openMentalToolDialog(host);
  container.querySelector('#mental-add-tool')?.addEventListener('click', add);
  container.querySelector('#mental-add-tool-empty')?.addEventListener('click', add);

  container.querySelectorAll('[data-edit-mental-tool]').forEach(button => {
    button.addEventListener('click', () => {
      const current = normalizeMentalPayload(store.getState().mental);
      const tool = mentalTools(current).find(item => item.id === button.dataset.editMentalTool);
      if (tool) openMentalToolDialog(host, tool);
    });
  });

  container.querySelectorAll('[data-delete-mental-tool]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deleteMentalTool;
      const current = normalizeMentalPayload(store.getState().mental);
      const tool = mentalTools(current).find(item => item.id === id);
      if (!tool) return;

      const linkedCount = exercisesForTool(current, id).length;
      const ok = await showInAppConfirm(
        linkedCount
          ? `Eliminare “${tool.name}”? Verrà rimosso anche dai ${linkedCount} esercizi collegati; le sessioni storiche conserveranno il nome dello strumento.`
          : `Eliminare “${tool.name}” dalla cassetta degli attrezzi?`,
        { title: 'Elimina strumento', confirmLabel: 'Elimina', danger: true },
      );
      if (!ok) return;

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.tools = next.tools.filter(item => item.id !== id);
        next.exercises = next.exercises.map(exercise => ({
          ...exercise,
          toolIds: (exercise.toolIds || []).filter(toolId => toolId !== id),
        }));
        next.trainingSessions = next.trainingSessions.map(session => (
          session.toolId === id
            ? { ...session, toolNameSnapshot: session.toolNameSnapshot || tool.name, toolId: '' }
            : session
        ));
        state.mental = next;
      });

      renderMental(host);
    });
  });

  container.querySelectorAll('[data-open-mental-exercise]').forEach(button => {
    button.addEventListener('click', () => {
      openMentalExercise(host, button.dataset.openMentalExercise);
    });
  });
}

function openMentalToolDialog(host, tool = null) {
  const currentMental = normalizeMentalPayload(store.getState().mental);
  const skills = mentalSkills(currentMental);

  const current = tool || {
    name: '',
    skillIds: [],
    description: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="mental-tool-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Mental · Strumenti</div>
          <h3>${tool ? 'Modifica strumento' : 'Nuovo strumento'}</h3>
        </div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Nome</label>
          <input name="name" value="${escapeAttr(current.name)}" placeholder="Es. Cue word" required />
        </div>

        <div class="field full">
          <label>Descrizione</label>
          <textarea name="description" placeholder="Quando e perché usare questo strumento">${escapeHtml(current.description || '')}</textarea>
        </div>

        <fieldset class="mv-link-fieldset full">
          <legend>Abilità collegate</legend>
          <div class="mv-check-grid">
            ${skills.map(skill => `
              <label>
                <input type="checkbox" name="skillIds" value="${escapeAttr(skill.id)}" ${(current.skillIds || []).includes(skill.id) ? 'checked' : ''} />
                <span>${escapeHtml(skill.name)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">${tool ? 'Salva modifiche' : 'Crea strumento'}</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#mental-tool-form').addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const now = new Date().toISOString();

    const visibleSkillIds = new Set(skills.map(skill => skill.id));
    const hiddenSkillIds = (current.skillIds || []).filter(id => !visibleSkillIds.has(id));

    const record = {
      id: tool?.id || uid('mental-tool'),
      name: String(formData.get('name') || '').trim(),
      skillIds: [...new Set([
        ...formData.getAll('skillIds').map(String),
        ...hiddenSkillIds,
      ])],
      description: String(formData.get('description') || '').trim(),
      createdAt: tool?.createdAt || now,
      updatedAt: now,
    };
    if (!record.name) return;

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      const index = next.tools.findIndex(item => item.id === record.id);
      if (index >= 0) next.tools[index] = record;
      else next.tools.push(record);
      state.mental = next;
    });

    dialog.close();
    mentalSection = 'strumenti';
    renderMental(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderMentalExercises(container, mental, host) {
  const exercises = [...mentalExercises(mental)]
    .sort((a, b) => {
      const favoriteDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favoriteDiff) return favoriteDiff;
      return String(a.title || '').localeCompare(String(b.title || ''), 'it');
    });

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Esercizi mentali</div>
        <h2>Dall’abilità al lavoro concreto</h2>
        <p>Ogni esercizio può collegare più abilità e più strumenti. I collegamenti inversi nelle altre sezioni vengono calcolati automaticamente.</p>
      </div>
      ${canWriteModule('mental')
        ? '<button class="button button-primary" id="mental-add-exercise" type="button">+ Nuovo esercizio</button>'
        : ''}
    </section>

    ${exercises.length
      ? `<div class="mv-exercise-grid">
          ${exercises.map(exercise => {
            const context = mentalContextLabel(exercise.context);
            const activeSkills = (exercise.skillIds || [])
              .map(id => skillById(id, mental))
              .filter(Boolean);
            const linkedResources = (exercise.resourceIds || [])
              .map(mentalResourceById)
              .filter(Boolean);

            return `
              <article class="panel mv-exercise-card" data-mental-exercise-card="${escapeAttr(exercise.id)}">
                <div class="panel-body">
                  <div class="mv-exercise-card-head">
                    <div>
                      <div class="eyebrow">${exercise.favorite ? '★ Preferito' : 'Esercizio'}</div>
                      <h3>${escapeHtml(exercise.title)}</h3>
                    </div>
                    ${canWriteModule('mental') ? `
                      <div class="mv-exercise-actions">
                        <button class="button button-ghost mv-small-button" type="button" data-edit-mental-exercise="${escapeAttr(exercise.id)}">Modifica</button>
                        <button class="resource-delete" type="button" data-delete-mental-exercise="${escapeAttr(exercise.id)}">Elimina</button>
                      </div>
                    ` : ''}
                  </div>

                  ${exercise.objective
                    ? `<p class="mv-exercise-objective">${escapeHtml(exercise.objective)}</p>`
                    : ''}

                  ${(context || Number(exercise.durationMin || 0)) ? `
                    <div class="mv-exercise-meta">
                      ${context ? `<span>${escapeHtml(context)}</span>` : ''}
                      ${Number(exercise.durationMin || 0)
                        ? `<span>${Number(exercise.durationMin)} min</span>`
                        : ''}
                    </div>
                  ` : ''}

                  <div class="mv-exercise-links">
                    <div>
                      <strong>Abilità</strong>
                      <div class="mv-tags">
                        ${activeSkills.length
                          ? activeSkills.map(skill => `<span>${escapeHtml(skill.short || skill.name)}</span>`).join('')
                          : '<span>Non assegnata</span>'}
                      </div>
                    </div>
                    <div>
                      <strong>Strumenti</strong>
                      <div class="mv-tags">
                        ${exercise.toolIds.length
                          ? exercise.toolIds.map(id => `<span>${escapeHtml(toolById(id, mental)?.name || id)}</span>`).join('')
                          : '<span>Non assegnato</span>'}
                      </div>
                    </div>
                  </div>

                  ${linkedResources.length ? `
                    <div class="mv-exercise-section mv-exercise-resources">
                      <strong>Risorse di libreria</strong>
                      <div class="mv-linked-list">
                        ${linkedResources.map(resource => `
                          <button class="mv-link-chip mv-resource-chip" type="button" data-open-mental-resource="${escapeAttr(resource.id)}">
                            ↗ ${escapeHtml(resource.title || resource.fileName || 'Risorsa')}
                          </button>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}

                  ${exercise.instructions ? `
                    <div class="mv-exercise-section">
                      <strong>Protocollo</strong>
                      <p>${escapeHtml(exercise.instructions)}</p>
                    </div>
                  ` : ''}

                  ${exercise.progression ? `
                    <div class="mv-exercise-section">
                      <strong>Progressione</strong>
                      <p>${escapeHtml(exercise.progression)}</p>
                    </div>
                  ` : ''}

                  ${exercise.notes ? `
                    <div class="mv-exercise-section mv-exercise-notes">
                      <strong>Note</strong>
                      <p>${escapeHtml(exercise.notes)}</p>
                    </div>
                  ` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>`
      : `<section class="panel">
          <div class="panel-body mv-empty-state-actions">
            ${emptyCopy('Nessun esercizio mentale ancora creato.')}
            ${canWriteModule('mental')
              ? '<button class="button button-primary" id="mental-add-exercise-empty" type="button">Crea il primo esercizio</button>'
              : ''}
          </div>
        </section>`}
  `;

  const add = () => { void openMentalExerciseDialog(host); };

  container.querySelector('#mental-add-exercise')?.addEventListener('click', add);
  container.querySelector('#mental-add-exercise-empty')?.addEventListener('click', add);

  container.querySelectorAll('[data-edit-mental-exercise]').forEach(button => {
    button.addEventListener('click', () => {
      const exercise = exerciseById(
        button.dataset.editMentalExercise,
        normalizeMentalPayload(store.getState().mental),
      );
      if (exercise) void openMentalExerciseDialog(host, exercise);
    });
  });

  container.querySelectorAll('[data-open-mental-resource]').forEach(button => {
    button.addEventListener('click', () => {
      openMentalResource(button.dataset.openMentalResource);
    });
  });

  container.querySelectorAll('[data-delete-mental-exercise]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deleteMentalExercise;
      const exercise = exerciseById(id, normalizeMentalPayload(store.getState().mental));

      const ok = await showInAppConfirm(
        `Eliminare l’esercizio “${exercise?.title || 'selezionato'}”? Le sessioni già registrate restano, ma il collegamento all’esercizio viene rimosso.`,
        { title: 'Elimina esercizio', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.exercises = next.exercises.filter(item => item.id !== id);
        next.trainingSessions = next.trainingSessions.map(session => ({
          ...session,
          exerciseIds: (session.exerciseIds || []).filter(exerciseId => exerciseId !== id),
        }));
        state.mental = next;
      });

      renderMental(host);
    });
  });
}

async function openMentalExerciseDialog(host, exercise = null) {
  const currentMental = normalizeMentalPayload(store.getState().mental);
  const skills = mentalSkills(currentMental);
  const tools = mentalTools(currentMental);
  await refreshMentalResourceCache();
  const resources = [...mentalResourceCache].sort((a, b) => String(a.title || a.fileName || '').localeCompare(String(b.title || b.fileName || ''), 'it'));

  const current = exercise || {
    title: '',
    objective: '',
    skillIds: [],
    toolIds: [],
    resourceIds: [],
    context: '',
    durationMin: 0,
    instructions: '',
    progression: '',
    notes: '',
    favorite: false,
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog mv-exercise-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="mental-exercise-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Mental · Esercizi</div>
          <h3>${exercise ? 'Modifica esercizio' : 'Nuovo esercizio'}</h3>
        </div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Nome esercizio</label>
          <input name="title" value="${escapeAttr(current.title)}" placeholder="Es. Reset 10 secondi dopo errore" required />
        </div>

        <div class="field full">
          <label>Obiettivo</label>
          <textarea name="objective" placeholder="Che cosa deve allenare concretamente?">${escapeHtml(current.objective)}</textarea>
        </div>

        <div class="field">
          <label>Contesto</label>
          <select name="context">
            ${MENTAL_CONTEXTS.map(item => `
              <option value="${escapeAttr(item.id)}" ${current.context === item.id ? 'selected' : ''}>
                ${escapeHtml(item.label)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>Durata indicativa (min)</label>
          <input type="number" min="0" step="1" name="durationMin" value="${Number(current.durationMin || 0) || ''}" />
        </div>

        <fieldset class="mv-link-fieldset full">
          <legend>Abilità collegate</legend>
          <div class="mv-check-grid">
            ${skills.map(skill => `
              <label>
                <input type="checkbox" name="skillIds" value="${escapeAttr(skill.id)}" ${current.skillIds.includes(skill.id) ? 'checked' : ''} />
                <span>${escapeHtml(skill.name)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <fieldset class="mv-link-fieldset full">
          <legend>Strumenti utilizzati</legend>
          <div class="mv-check-grid">
            ${tools.map(tool => `
              <label>
                <input type="checkbox" name="toolIds" value="${escapeAttr(tool.id)}" ${current.toolIds.includes(tool.id) ? 'checked' : ''} />
                <span>${escapeHtml(tool.name)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <fieldset class="mv-link-fieldset full">
          <legend>Risorse di libreria collegate</legend>
          ${resources.length
            ? `<div class="mv-check-grid mv-resource-check-grid">
                ${resources.map(resource => `
                  <label>
                    <input type="checkbox" name="resourceIds" value="${escapeAttr(resource.id)}" ${(current.resourceIds || []).includes(resource.id) ? 'checked' : ''} />
                    <span>
                      <strong>${escapeHtml(resource.title || resource.fileName || 'Risorsa')}</strong>
                      <small>${escapeHtml(resource.kind === 'file' ? (resource.fileName || 'File') : (resource.linkType === 'youtube' ? 'YouTube' : 'Link'))}</small>
                    </span>
                  </label>
                `).join('')}
              </div>`
            : '<div class="mv-linked-empty">Nessuna risorsa disponibile nella Libreria Mental. Aggiungila dalla tab Libreria e poi riapri questo esercizio.</div>'}
        </fieldset>

        <div class="field full">
          <label>Protocollo / istruzioni</label>
          <textarea name="instructions" placeholder="Passaggi operativi dell’esercizio">${escapeHtml(current.instructions)}</textarea>
        </div>

        <div class="field full">
          <label>Progressione</label>
          <textarea name="progression" placeholder="Come aumentare gradualmente difficoltà o pressione">${escapeHtml(current.progression)}</textarea>
        </div>

        <div class="field full">
          <label>Note</label>
          <textarea name="notes">${escapeHtml(current.notes)}</textarea>
        </div>

        <label class="mv-favorite-check full">
          <input type="checkbox" name="favorite" ${current.favorite ? 'checked' : ''} />
          <span>Segna come preferito</span>
        </label>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">${exercise ? 'Salva modifiche' : 'Crea esercizio'}</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#mental-exercise-form').addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const now = new Date().toISOString();

    const visibleSkillIds = new Set(skills.map(skill => skill.id));
    const hiddenSkillIds = (current.skillIds || []).filter(id => !visibleSkillIds.has(id));

    const record = {
      id: exercise?.id || uid('mental-exercise'),
      title: String(formData.get('title') || '').trim(),
      objective: String(formData.get('objective') || '').trim(),
      skillIds: [...new Set([
        ...formData.getAll('skillIds').map(String),
        ...hiddenSkillIds,
      ])],
      toolIds: formData.getAll('toolIds').map(String),
      resourceIds: formData.getAll('resourceIds').map(String),
      context: String(formData.get('context') || ''),
      durationMin: Math.max(0, Number(formData.get('durationMin') || 0)),
      instructions: String(formData.get('instructions') || '').trim(),
      progression: String(formData.get('progression') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      favorite: formData.get('favorite') === 'on',
      createdAt: exercise?.createdAt || now,
      updatedAt: now,
    };

    if (!record.title) return;

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      const index = next.exercises.findIndex(item => item.id === record.id);

      if (index >= 0) {
        next.exercises[index] = record;
      } else {
        next.exercises.push(record);
      }

      state.mental = next;
    });

    dialog.close();
    mentalSection = 'esercizi';
    renderMental(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderMentalTraining(container, mental, host) {
  const sessions = [...mental.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Allenamento mentale</div>
        <h2>Sessioni e lavoro quotidiano</h2>
        <p>Le sessioni possono richiamare uno o più esercizi. Abilità e strumenti vengono ricavati automaticamente dagli esercizi selezionati.</p>
      </div>
      ${canWriteModule('mental')
        ? '<button class="button button-primary" id="mental-add-session" type="button">+ Nuova sessione</button>'
        : ''}
    </section>

    <section class="panel">
      <div class="panel-body mv-table-wrap">
        <table class="mv-table mv-mental-session-table">
          <thead>
            <tr><th>Data</th><th>Esercizi</th><th>Focus</th><th>Contesto</th><th>Durata</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            ${sessions.length
              ? sessions.map(session => {
                  const linkedExercises = (session.exerciseIds || [])
                    .map(id => exerciseById(id, mental))
                    .filter(Boolean);

                  const skillIds = linkedExercises.length
                    ? [...new Set(linkedExercises.flatMap(exercise => exercise.skillIds || []))]
                        .filter(id => skillById(id, mental))
                    : (session.skillId && skillById(session.skillId, mental) ? [session.skillId] : []);

                  const toolIds = linkedExercises.length
                    ? [...new Set(linkedExercises.flatMap(exercise => exercise.toolIds || []))]
                    : (session.toolId ? [session.toolId] : []);

                  return `
                    <tr>
                      <td>${formatDate(session.date)}</td>
                      <td>
                        ${linkedExercises.length
                          ? `<div class="mv-session-exercises">
                              ${linkedExercises.map(exercise => `
                                <button type="button" class="mv-link-chip" data-open-mental-exercise="${escapeAttr(exercise.id)}">
                                  ${escapeHtml(exercise.title)}
                                </button>
                              `).join('')}
                            </div>`
                          : '<span class="mv-linked-empty">Sessione libera</span>'}
                      </td>
                      <td>
                        <div class="mv-session-focus">
                          <strong>${skillIds.length
                            ? skillIds.map(id => escapeHtml(skillById(id, mental)?.short || id)).join(' · ')
                            : escapeHtml(session.skillNameSnapshot || '—')}</strong>
                          <span>${toolIds.length
                            ? toolIds.map(id => escapeHtml(toolById(id, mental)?.name || id)).join(' · ')
                            : '—'}</span>
                        </div>
                      </td>
                      <td>${escapeHtml(mentalContextLabel(session.context) || '—')}</td>
                      <td>${Number(session.durationMin || 0) ? `${Number(session.durationMin)} min` : '—'}</td>
                      <td>${escapeHtml(session.notes || '')}</td>
                      <td>
                        ${canWriteModule('mental')
                          ? `<button class="resource-delete" type="button" data-delete-mental-session="${session.id}">Elimina</button>`
                          : ''}
                      </td>
                    </tr>
                  `;
                }).join('')
              : `<tr><td colspan="7">${emptyCopy('Nessuna sessione registrata.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#mental-add-session')?.addEventListener('click', () => {
    openMentalSessionDialog(host);
  });

  container.querySelectorAll('[data-open-mental-exercise]').forEach(button => {
    button.addEventListener('click', () => {
      openMentalExercise(host, button.dataset.openMentalExercise);
    });
  });

  container.querySelectorAll('[data-delete-mental-session]').forEach(button => {
    button.addEventListener('click', async () => {
      const ok = await showInAppConfirm(
        'Eliminare questa sessione mentale?',
        { title: 'Elimina sessione', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.trainingSessions = next.trainingSessions.filter(
          item => item.id !== button.dataset.deleteMentalSession,
        );
        state.mental = next;
      });

      renderMental(host);
    });
  });
}

function openMentalSessionDialog(host) {
  const mental = normalizeMentalPayload(store.getState().mental);
  const skills = mentalSkills(mental);
  const tools = mentalTools(mental);
  const exercises = [...mentalExercises(mental)]
    .sort((a, b) => {
      const favoriteDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favoriteDiff) return favoriteDiff;
      return String(a.title || '').localeCompare(String(b.title || ''), 'it');
    });

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="mental-session-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Mental</div><h3>Nuova sessione</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayKey()}" required /></div>
        <div class="field"><label>Durata (min)</label><input type="number" min="0" step="1" name="durationMin" /></div>

        <div class="field full">
          <label>Contesto</label>
          <select name="context">
            ${MENTAL_CONTEXTS.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </div>

        <fieldset class="mv-link-fieldset full">
          <legend>Esercizi svolti</legend>
          ${exercises.length
            ? `<div class="mv-check-grid mv-session-exercise-checks">
                ${exercises.map(exercise => `
                  <label>
                    <input type="checkbox" name="exerciseIds" value="${escapeAttr(exercise.id)}" />
                    <span>
                      <strong>${escapeHtml(exercise.title)}</strong>
                      <small>${[
                        mentalContextLabel(exercise.context),
                        Number(exercise.durationMin || 0) ? `${Number(exercise.durationMin)} min` : '',
                      ].filter(Boolean).map(escapeHtml).join(' · ')}</small>
                    </span>
                  </label>
                `).join('')}
              </div>`
            : '<div class="mv-linked-empty">La libreria esercizi è vuota. Puoi comunque registrare una sessione libera.</div>'}
        </fieldset>

        <div class="field">
          <label>Abilità principale <small>solo sessione libera</small></label>
          <select name="skillId">
            <option value="">—</option>
            ${skills.map(skill => `<option value="${skill.id}">${escapeHtml(skill.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Strumento principale <small>solo sessione libera</small></label>
          <select name="toolId">
            <option value="">—</option>
            ${tools.map(tool => `<option value="${tool.id}">${escapeHtml(tool.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#mental-session-form').addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const exerciseIds = formData.getAll('exerciseIds').map(String);
    const selectedExercises = exerciseIds
      .map(id => exerciseById(id, mental))
      .filter(Boolean);

    const derivedSkillId = selectedExercises
      .flatMap(exercise => exercise.skillIds || [])
      .find(Boolean) || String(formData.get('skillId') || '');

    const derivedToolId = selectedExercises
      .flatMap(exercise => exercise.toolIds || [])
      .find(Boolean) || String(formData.get('toolId') || '');

    const enteredDuration = Math.max(0, Number(formData.get('durationMin') || 0));
    const derivedDuration = selectedExercises.reduce(
      (sum, exercise) => sum + Math.max(0, Number(exercise.durationMin || 0)),
      0,
    );

    const selectedContexts = [...new Set(
      selectedExercises.map(exercise => exercise.context).filter(Boolean),
    )];

    const context = String(formData.get('context') || '')
      || (selectedContexts.length === 1 ? selectedContexts[0] : '');

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      next.trainingSessions.push({
        id: uid('mental-session'),
        date: String(formData.get('date') || ''),
        exerciseIds,
        skillId: derivedSkillId,
        toolId: derivedToolId,
        context,
        durationMin: enteredDuration || derivedDuration,
        notes: String(formData.get('notes') || '').trim(),
      });
      state.mental = next;
    });

    dialog.close();
    renderMental(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderMentalReview(container, mental, host) {
  const reviews = [...mental.matchReviews]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Review partita</div>
        <h2>Valutazione post-partita</h2>
        <p>Scala interna 1–100 su quattro dimensioni strettamente mentali.</p>
      </div>
      ${canWriteModule('mental')
        ? '<button class="button button-primary" id="mental-add-review" type="button">+ Nuova review</button>'
        : ''}
    </section>

    <div class="mv-review-grid">
      ${reviews.length
        ? reviews.map(review => `
          <article class="panel mv-review-card">
            <div class="panel-body">
              <div class="mv-card-top">
                <div>
                  <strong>${formatDate(review.date)}</strong>
                  <span>${escapeHtml(review.opponent || 'Partita')}</span>
                </div>
                ${canWriteModule('mental')
                  ? `<button class="resource-delete" data-delete-review="${review.id}" type="button">Elimina</button>`
                  : ''}
              </div>

              <div class="mv-review-scores">
                ${reviewScore('Fiducia', review.confidence)}
                ${reviewScore('Concentrazione', review.focus)}
                ${reviewScore('Regolazione', review.regulation)}
                ${reviewScore('Mental resilience', review.resilience)}
              </div>

              ${review.notes ? `<div class="mv-note">${escapeHtml(review.notes)}</div>` : ''}
            </div>
          </article>
        `).join('')
        : emptyPanel('Nessuna review partita registrata.')}
    </div>
  `;

  container.querySelector('#mental-add-review')?.addEventListener('click', () => {
    openMentalReviewDialog(host);
  });

  container.querySelectorAll('[data-delete-review]').forEach(button => {
    button.addEventListener('click', async () => {
      const ok = await showInAppConfirm(
        'Eliminare questa review partita?',
        { title: 'Elimina review', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.matchReviews = next.matchReviews.filter(
          item => item.id !== button.dataset.deleteReview,
        );
        state.mental = next;
      });

      renderMental(host);
    });
  });
}

function reviewScore(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${Number(value || 0) || '—'}</strong>
    </div>
  `;
}

function openMentalReviewDialog(host) {
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="mental-review-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Mental</div><h3>Review post-partita</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayKey()}" required /></div>
        <div class="field"><label>Avversario / partita</label><input name="opponent" /></div>

        ${scoreInput('Fiducia', 'confidence')}
        ${scoreInput('Concentrazione', 'focus')}
        ${scoreInput('Regolazione emotiva', 'regulation')}
        ${scoreInput('Mental resilience / toughness', 'resilience')}

        <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#mental-review-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      next.matchReviews.push({
        id: uid('mental-review'),
        date: data.date,
        opponent: String(data.opponent || '').trim(),
        confidence: clampScore(data.confidence),
        focus: clampScore(data.focus),
        regulation: clampScore(data.regulation),
        resilience: clampScore(data.resilience),
        notes: String(data.notes || '').trim(),
      });
      state.mental = next;
    });

    dialog.close();
    renderMental(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function scoreInput(label, name) {
  return `
    <div class="field">
      <label>${label} · 1–100</label>
      <input type="number" name="${name}" min="1" max="100" step="1" required />
    </div>
  `;
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Number(value || 1)));
}

function mentalSessionRow(session) {
  const mental = normalizeMentalPayload(store.getState().mental);
  const linkedExercises = (session.exerciseIds || [])
    .map(id => exerciseById(id, mental))
    .filter(Boolean);

  const primary = linkedExercises.length
    ? linkedExercises.map(exercise => exercise.title).join(' · ')
    : (skillById(session.skillId, mental)?.short || session.skillNameSnapshot || 'Sessione mentale');

  const secondary = [
    formatDate(session.date),
    mentalContextLabel(session.context),
    linkedExercises.length
      ? `${linkedExercises.length} esercizi${linkedExercises.length === 1 ? 'o' : ''}`
      : (toolById(session.toolId, mental)?.name || session.toolNameSnapshot),
  ].filter(Boolean).join(' · ');

  return `
    <div class="mv-simple-row">
      <div>
        <strong>${escapeHtml(primary)}</strong>
        <span>${escapeHtml(secondary)}</span>
      </div>
      <strong>${Number(session.durationMin || 0) ? `${Number(session.durationMin)} min` : '—'}</strong>
    </div>
  `;
}

function reviewRow(review) {
  const values = [
    Number(review.confidence || 0),
    Number(review.focus || 0),
    Number(review.regulation || 0),
    Number(review.resilience || 0),
  ].filter(Boolean);

  const average = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0;

  return `
    <div class="mv-simple-row">
      <div>
        <strong>${escapeHtml(review.opponent || 'Partita')}</strong>
        <span>${formatDate(review.date)}</span>
      </div>
      <strong>${average ? `${average}/100` : '—'}</strong>
    </div>
  `;
}


function renderVisual(host) {
  const visual = normalizeVisualPayload(store.getState().visual);

  host.innerHTML = `
    <section class="mv-module-head">
      <div>
        <div class="eyebrow">Perception & Neuro</div>
        <h2>Visione, neurocognizione e sensomotorio</h2>
        <p>I protocolli sono configurabili. Le misurazioni compaiono solo quando un protocollo definisce una o più metriche.</p>
      </div>
    </section>

    ${readOnlyNote('visual')}

    ${internalTabs(visualSection, [
      { id: 'panoramica', label: 'Panoramica' },
      { id: 'allenamento', label: 'Allenamento' },
      { id: 'misurazioni', label: 'Misurazioni' },
      { id: 'protocolli', label: 'Protocolli' },
    ], 'data-visual-section')}

    <div id="visual-section-host"></div>
  `;

  host.querySelectorAll('[data-visual-section]').forEach(button => {
    button.addEventListener('click', () => {
      visualSection = button.dataset.visualSection;
      renderVisual(host);
    });
  });

  const sectionHost = host.querySelector('#visual-section-host');

  if (visualSection === 'allenamento') {
    renderVisualTraining(sectionHost, visual, host);
  } else if (visualSection === 'misurazioni') {
    renderVisualMeasurements(sectionHost, visual, host);
  } else if (visualSection === 'protocolli') {
    renderVisualProtocols(sectionHost, visual, host);
  } else {
    renderVisualOverview(sectionHost, visual);
  }
}

function protocolMeasurementCount(protocol, visual) {
  const source = visual.measurements?.[protocol.id] || {};

  return protocol.metrics.reduce(
    (total, metric) => total + (Array.isArray(source[metric.id]) ? source[metric.id].length : 0),
    0,
  );
}

function measuredProtocols(visual) {
  return visual.protocols
    .filter(protocol =>
      protocol.metrics.length
      && protocolMeasurementCount(protocol, visual) > 0
    );
}

function renderVisualOverview(container, visual) {
  const recentSessions = [...visual.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5);

  const activeMeasuredProtocols = measuredProtocols(visual);

  container.innerHTML = `
    <section class="mv-domain-grid">
      ${VISUAL_DOMAINS.map(domain => {
        const count = visual.protocols.filter(
          protocol => protocol.domains.includes(domain.id),
        ).length;

        return `
          <article class="panel mv-domain-card mv-visual-domain-card" style="--mv-visual-color:${domain.color}">
            <div class="panel-body">
              <div class="mv-domain-card-top">
                <div class="mv-visual-domain-title">
                  <span class="mv-visual-domain-icon" aria-hidden="true">${escapeHtml(domain.icon)}</span>
                  <h3>${escapeHtml(domain.name)}</h3>
                </div>
                <span>${count} ${count === 1 ? 'protocollo' : 'protocolli'}</span>
              </div>
              <p>${escapeHtml(domain.description)}</p>
            </div>
          </article>
        `;
      }).join('')}
    </section>

    ${activeMeasuredProtocols.length ? `
      <section class="panel mv-measured-overview mv-visual-measured-overview">
        <div class="panel-header">
          <h3>Misurazioni attive</h3>
          <p>Compaiono qui soltanto i protocolli che hanno metriche definite e almeno un valore registrato.</p>
        </div>

        <div class="panel-body mv-measured-protocol-list">
          ${activeMeasuredProtocols.map(protocol => measuredProtocolOverview(protocol, visual)).join('')}
        </div>
      </section>
    ` : ''}

    <section class="panel mv-visual-recent-panel">
      <div class="panel-header">
        <h3>Allenamento recente</h3>
        <p>Ultime sessioni visive, neurocognitive e sensomotorie.</p>
      </div>

      <div class="panel-body mv-simple-list">
        ${recentSessions.length
          ? recentSessions.map(session => visualSessionRow(session, visual)).join('')
          : emptyCopy('Nessuna sessione registrata.')}
      </div>
    </section>
  `;
}

function measuredProtocolOverview(protocol, visual) {
  const protocolMeasurements = visual.measurements?.[protocol.id] || {};

  const metricRows = protocol.metrics
    .map(metric => {
      const summary = metricSummary(protocolMeasurements[metric.id] || []);
      return { metric, summary };
    })
    .filter(item => item.summary.latest);

  if (!metricRows.length) return '';

  return `
    <article class="mv-measured-protocol mv-visual-measured-protocol" style="--mv-visual-color:${visualProtocolColor(protocol)}">
      <div class="mv-measured-protocol-head">
        <div>
          <strong>${escapeHtml(protocol.name)}</strong>
          <span>${metricRows.length} ${metricRows.length === 1 ? 'misurazione attiva' : 'misurazioni attive'}</span>
        </div>
      </div>

      <div class="mv-measured-protocol-metrics">
        ${metricRows.map(({ metric, summary }) => `
          <div>
            <span>${escapeHtml(metric.name)}</span>
            <strong>${formatMeasuredValue(summary.latest.value, metric.unit)}</strong>
            <small>${formatDate(summary.latest.date)}</small>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function renderVisualTraining(container, visual, host) {
  const sessions = [...visual.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="mv-subhead mv-visual-subhead">
      <div>
        <div class="eyebrow">Allenamento</div>
        <h2>Sessioni percettive e neuro</h2>
        <p>Ogni sessione è collegata a un protocollo configurabile.</p>
      </div>

      ${canWriteModule('visual') && visual.protocols.length
        ? '<button class="button button-primary" id="visual-add-session" type="button">+ Nuova sessione</button>'
        : ''}
    </section>

    ${!visual.protocols.length ? `
      <section class="panel">
        <div class="panel-body">
          <div class="mv-empty">
            Prima crea almeno un protocollo nella sezione Protocolli.
          </div>
        </div>
      </section>
    ` : `
      <section class="panel">
        <div class="panel-body mv-table-wrap">
          <table class="mv-table">
            <thead>
              <tr><th>Data</th><th>Protocollo</th><th>Domini</th><th>Durata</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              ${sessions.length
                ? sessions.map(session => {
                  const protocol = protocolById(session.protocolId, visual);

                  return `
                    <tr>
                      <td>${formatDate(session.date)}</td>
                      <td>${escapeHtml(protocol?.name || session.protocolName || 'Protocollo non disponibile')}</td>
                      <td>${protocol
                        ? protocol.domains.map(id => escapeHtml(domainById(id)?.name || id)).join(' · ')
                        : '—'}</td>
                      <td>${Number(session.durationMin || 0) ? `${Number(session.durationMin)} min` : '—'}</td>
                      <td>${escapeHtml(session.notes || '')}</td>
                      <td>
                        ${canWriteModule('visual')
                          ? `<button class="resource-delete" type="button" data-delete-visual-session="${session.id}">Elimina</button>`
                          : ''}
                      </td>
                    </tr>
                  `;
                }).join('')
                : `<tr><td colspan="6">${emptyCopy('Nessuna sessione registrata.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `}
  `;

  container.querySelector('#visual-add-session')?.addEventListener('click', () => {
    openVisualSessionDialog(host, visual);
  });

  container.querySelectorAll('[data-delete-visual-session]').forEach(button => {
    button.addEventListener('click', async () => {
      const ok = await showInAppConfirm(
        'Eliminare questa sessione?',
        { title: 'Elimina sessione', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeVisualPayload(state.visual);
        next.trainingSessions = next.trainingSessions.filter(
          item => item.id !== button.dataset.deleteVisualSession,
        );
        state.visual = next;
      });

      renderVisual(host);
    });
  });
}

function openVisualSessionDialog(host, visual, presetProtocolId = '') {
  if (!visual.protocols.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="visual-session-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Perception & Neuro</div><h3>Nuova sessione</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayKey()}" required /></div>
        <div class="field"><label>Durata (min)</label><input type="number" min="0" step="5" name="durationMin" /></div>

        <div class="field full">
          <label>Protocollo</label>
          <select name="protocolId">
            ${visual.protocols.map(protocol => `
              <option value="${protocol.id}" ${presetProtocolId === protocol.id ? 'selected' : ''}>${escapeHtml(protocol.name)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#visual-session-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);

      next.trainingSessions.push({
        id: uid('visual-session'),
        date: data.date,
        protocolId: data.protocolId,
        durationMin: Number(data.durationMin || 0),
        notes: String(data.notes || '').trim(),
      });

      state.visual = next;
    });

    dialog.close();
    renderVisual(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function protocolsWithMetrics(visual) {
  return visual.protocols.filter(protocol => protocol.metrics.length);
}

function renderVisualMeasurements(container, visual, host) {
  const metricProtocols = protocolsWithMetrics(visual);

  container.innerHTML = `
    <section class="mv-subhead mv-visual-subhead">
      <div>
        <div class="eyebrow">Misurazioni</div>
        <h2>Serie longitudinali</h2>
        <p>Le metriche vengono definite nel protocollo. Ogni rilevazione conserva soltanto data e valore.</p>
      </div>

      ${canWriteModule('visual') && metricProtocols.length
        ? '<button class="button button-primary" id="visual-add-measurement" type="button">+ Nuova misurazione</button>'
        : ''}
    </section>

    ${!metricProtocols.length ? `
      <section class="panel">
        <div class="panel-body mv-empty-state-actions">
          <div class="mv-empty">
            Nessun protocollo contiene ancora misurazioni.
          </div>
          <button class="button button-ghost" id="visual-go-protocols" type="button">
            Vai ai protocolli
          </button>
        </div>
      </section>
    ` : `
      <div class="mv-measure-grid">
        ${metricProtocols.flatMap(protocol =>
          protocol.metrics.map(metric =>
            genericMetricCard(
              protocol,
              metric,
              visual.measurements?.[protocol.id]?.[metric.id] || [],
            )
          )
        ).join('')}
      </div>

      <section class="panel mv-measure-history">
        <div class="panel-header">
          <h3>Storico completo</h3>
          <p>Tutte le misurazioni ordinate per data.</p>
        </div>

        <div class="panel-body mv-table-wrap">
          <table class="mv-table">
            <thead>
              <tr><th>Data</th><th>Protocollo</th><th>Misurazione</th><th>Valore</th><th></th></tr>
            </thead>
            <tbody>
              ${genericMeasurementHistoryRows(visual)}
            </tbody>
          </table>
        </div>
      </section>
    `}
  `;

  container.querySelector('#visual-go-protocols')?.addEventListener('click', () => {
    visualSection = 'protocolli';
    renderVisual(host);
  });

  container.querySelector('#visual-add-measurement')?.addEventListener('click', () => {
    openGenericMeasurementDialog(host, visual);
  });

  container.querySelectorAll('[data-add-generic-metric]').forEach(button => {
    button.addEventListener('click', () => {
      openGenericMeasurementDialog(
        host,
        visual,
        button.dataset.protocolId,
        button.dataset.metricId,
      );
    });
  });

  container.querySelectorAll('[data-delete-generic-measurement]').forEach(button => {
    button.addEventListener('click', async () => {
      const protocolId = button.dataset.protocolId;
      const metricId = button.dataset.metricId;
      const date = button.dataset.deleteGenericMeasurement;

      const protocol = visual.protocols.find(item => item.id === protocolId);
      const metric = protocol?.metrics.find(item => item.id === metricId);

      const ok = await showInAppConfirm(
        `Eliminare ${metric?.name || 'questa misurazione'} del ${formatDate(date)}?`,
        { title: 'Elimina misurazione', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeVisualPayload(state.visual);
        const series = next.measurements?.[protocolId]?.[metricId];

        if (Array.isArray(series)) {
          next.measurements[protocolId][metricId] =
            series.filter(row => row.date !== date);
        }

        state.visual = next;
      });

      renderVisual(host);
    });
  });
}

function genericMetricCard(protocol, metric, rows) {
  const summary = metricSummary(rows);

  return `
    <article class="panel mv-measure-card mv-visual-measure-card" style="--mv-visual-color:${visualProtocolColor(protocol)}">
      <div class="panel-body">
        <div class="mv-measure-head">
          <div>
            <div class="eyebrow">${escapeHtml(protocol.name)}</div>
            <h3>${escapeHtml(metric.name)}</h3>
          </div>

          ${canWriteModule('visual')
            ? `<button
                 class="button button-ghost mv-small-button"
                 data-add-generic-metric
                 data-protocol-id="${protocol.id}"
                 data-metric-id="${metric.id}"
                 type="button"
               >+ Valore</button>`
            : ''}
        </div>

        <div class="mv-measure-stats">
          ${metricStat('Ultimo', summary.latest ? formatMeasuredValue(summary.latest.value, metric.unit) : '—')}
          ${metricStat('Baseline', summary.baseline ? formatMeasuredValue(summary.baseline.value, metric.unit) : '—')}
          ${metricStat('Media ultime 5', summary.mean5 !== null ? formatMeasuredValue(summary.mean5, metric.unit) : '—')}
          ${metricStat('Variazione', summary.delta !== null ? formatSignedDelta(summary.delta, metric.unit) : '—')}
        </div>

        ${sparkline(rows, metric.unit)}

        <div class="mv-measure-foot">
          <span>${rows.length} ${rows.length === 1 ? 'rilevazione' : 'rilevazioni'}</span>
          <strong>${metric.unit ? `Unità: ${escapeHtml(metric.unit)}` : 'Unità non specificata'}</strong>
        </div>
      </div>
    </article>
  `;
}

function metricStat(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function metricSummary(rows) {
  const sorted = [...rows]
    .filter(row => row.date && Number.isFinite(Number(row.value)))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!sorted.length) {
    return {
      latest: null,
      baseline: null,
      mean5: null,
      delta: null,
    };
  }

  const latest = sorted[sorted.length - 1];
  const baseline = sorted[0];
  const last5 = sorted.slice(-5);
  const mean5 = last5.reduce(
    (sum, row) => sum + Number(row.value),
    0,
  ) / last5.length;

  return {
    latest,
    baseline,
    mean5,
    delta: Number(latest.value) - Number(baseline.value),
  };
}

function formatAxisMonthYear(value) {
  if (!value) return '';

  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return String(value);

  const label = new Intl.DateTimeFormat('it-IT', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month - 1, 1));

  return label.replace('.', '');
}

function formatAxisNumber(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';

  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(number);

  if (unit === '%') return `${formatted}%`;
  return formatted;
}

function sparkline(rows, unit = '') {
  const sorted = [...rows]
    .filter(row => Number.isFinite(Number(row.value)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  if (sorted.length < 2) {
    return '<div class="mv-sparkline-empty">Servono almeno due valori per visualizzare il trend.</div>';
  }

  const width = 430;
  const height = 154;
  const left = 46;
  const right = 12;
  const top = 10;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const values = sorted.map(row => Number(row.value));

  let min;
  let max;
  let yTicks;

  if (unit === '%') {
    min = 0;
    max = 100;
    yTicks = [0, 25, 50, 75, 100];
  } else {
    min = Math.min(...values);
    max = Math.max(...values);

    if (min === max) {
      const spread = Math.max(1, Math.abs(min) * 0.05);
      min -= spread;
      max += spread;
    } else {
      const spread = (max - min) * 0.08;
      min -= spread;
      max += spread;
    }

    const step = (max - min) / 4;
    yTicks = [0, 1, 2, 3, 4].map(index => min + step * index);
  }

  const xForIndex = index => (
    left + (index / (sorted.length - 1)) * plotWidth
  );

  const yForValue = value => {
    const ratio = (Number(value) - min) / (max - min);
    return top + plotHeight - ratio * plotHeight;
  };

  const points = sorted.map((row, index) =>
    `${xForIndex(index).toFixed(1)},${yForValue(row.value).toFixed(1)}`
  ).join(' ');

  // Keep the date axis readable on dense series: show all labels up to six
  // points, otherwise distribute about six labels and always include the last.
  const maxXTicks = 6;
  const xStep = sorted.length <= maxXTicks
    ? 1
    : Math.ceil((sorted.length - 1) / (maxXTicks - 1));

  const xTickIndexes = [];
  for (let index = 0; index < sorted.length; index += xStep) {
    xTickIndexes.push(index);
  }
  if (xTickIndexes[xTickIndexes.length - 1] !== sorted.length - 1) {
    xTickIndexes.push(sorted.length - 1);
  }

  return `
    <svg
      class="mv-sparkline mv-axis-chart"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Andamento della misurazione nel tempo"
    >
      ${yTicks.map(tick => {
        const y = yForValue(tick);
        return `
          <line
            x1="${left}"
            y1="${y.toFixed(1)}"
            x2="${width - right}"
            y2="${y.toFixed(1)}"
            class="mv-spark-grid"
          ></line>
          <text
            x="${left - 7}"
            y="${(y + 3).toFixed(1)}"
            text-anchor="end"
            class="mv-spark-axis-label"
          >${escapeHtml(formatAxisNumber(tick, unit))}</text>
        `;
      }).join('')}

      <line
        x1="${left}"
        y1="${top}"
        x2="${left}"
        y2="${top + plotHeight}"
        class="mv-spark-axis"
      ></line>
      <line
        x1="${left}"
        y1="${top + plotHeight}"
        x2="${width - right}"
        y2="${top + plotHeight}"
        class="mv-spark-axis"
      ></line>

      ${xTickIndexes.map(index => {
        const x = xForIndex(index);
        const y = top + plotHeight;

        return `
          <line
            x1="${x.toFixed(1)}"
            y1="${y.toFixed(1)}"
            x2="${x.toFixed(1)}"
            y2="${(y + 4).toFixed(1)}"
            class="mv-spark-axis"
          ></line>
          <text
            x="${x.toFixed(1)}"
            y="${height - 8}"
            text-anchor="middle"
            class="mv-spark-axis-label"
          >${escapeHtml(formatAxisMonthYear(sorted[index].date))}</text>
        `;
      }).join('')}

      <polyline points="${points}" class="mv-spark-line"></polyline>

      ${sorted.map((row, index) => `
        <circle
          cx="${xForIndex(index).toFixed(1)}"
          cy="${yForValue(row.value).toFixed(1)}"
          r="2.7"
          class="mv-spark-point"
        >
          <title>${escapeHtml(formatDate(row.date))}: ${escapeHtml(formatMeasuredValue(row.value, unit))}</title>
        </circle>
      `).join('')}
    </svg>
  `;
}

function formatMeasuredValue(value, unit = '') {
  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number);

  if (!unit) return formatted;
  if (unit === '%') return `${formatted}%`;

  return `${formatted} ${unit}`;
}

function formatSignedDelta(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const prefix = number > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number);

  if (!unit) return `${prefix}${formatted}`;
  if (unit === '%') return `${prefix}${formatted} pt`;

  return `${prefix}${formatted} ${unit}`;
}

function genericMeasurementHistoryRows(visual) {
  const rows = [];

  for (const protocol of visual.protocols) {
    const protocolSource = visual.measurements?.[protocol.id] || {};

    for (const metric of protocol.metrics) {
      const series = Array.isArray(protocolSource[metric.id])
        ? protocolSource[metric.id]
        : [];

      for (const row of series) {
        rows.push({
          protocol,
          metric,
          date: row.date,
          value: row.value,
        });
      }
    }
  }

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!rows.length) {
    return `<tr><td colspan="5">${emptyCopy('Nessuna misurazione registrata.')}</td></tr>`;
  }

  return rows.map(row => `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.protocol.name)}</td>
      <td>${escapeHtml(row.metric.name)}</td>
      <td><strong>${formatMeasuredValue(row.value, row.metric.unit)}</strong></td>
      <td>
        ${canWriteModule('visual')
          ? `<button
               class="resource-delete"
               type="button"
               data-delete-generic-measurement="${escapeAttr(row.date)}"
               data-protocol-id="${escapeAttr(row.protocol.id)}"
               data-metric-id="${escapeAttr(row.metric.id)}"
             >Elimina</button>`
          : ''}
      </td>
    </tr>
  `).join('');
}

function openGenericMeasurementDialog(
  host,
  visual,
  presetProtocolId = '',
  presetMetricId = '',
) {
  const metricProtocols = protocolsWithMetrics(visual);
  if (!metricProtocols.length) return;

  const defaultProtocolId = presetProtocolId || metricProtocols[0].id;
  const defaultProtocol = metricProtocols.find(item => item.id === defaultProtocolId)
    || metricProtocols[0];
  const defaultMetricId = presetMetricId || defaultProtocol.metrics[0]?.id || '';

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="visual-generic-measurement-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Misurazioni</div><h3>Nuova misurazione</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Protocollo</label>
          <select name="protocolId" id="measurement-protocol">
            ${metricProtocols.map(protocol => `
              <option value="${protocol.id}" ${protocol.id === defaultProtocol.id ? 'selected' : ''}>
                ${escapeHtml(protocol.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field full">
          <label>Misurazione</label>
          <select name="metricId" id="measurement-metric"></select>
        </div>

        <div class="field">
          <label>Data</label>
          <input type="date" name="date" value="${todayKey()}" required />
        </div>

        <div class="field">
          <label id="measurement-value-label">Valore</label>
          <input type="number" name="value" step="0.01" required />
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  const form = dialog.querySelector('#visual-generic-measurement-form');
  const protocolSelect = form.elements.protocolId;
  const metricSelect = form.elements.metricId;
  const valueLabel = dialog.querySelector('#measurement-value-label');

  const rebuildMetrics = preferredMetricId => {
    const protocol = visual.protocols.find(
      item => item.id === protocolSelect.value,
    );

    metricSelect.innerHTML = (protocol?.metrics || [])
      .map(metric => `
        <option value="${metric.id}" ${metric.id === preferredMetricId ? 'selected' : ''}>
          ${escapeHtml(metric.name)}
        </option>
      `)
      .join('');

    const metric = protocol?.metrics.find(
      item => item.id === metricSelect.value,
    );

    valueLabel.textContent = metric?.unit
      ? `Valore (${metric.unit})`
      : 'Valore';
  };

  rebuildMetrics(defaultMetricId);

  protocolSelect.addEventListener('change', () => {
    rebuildMetrics('');
  });

  metricSelect.addEventListener('change', () => {
    rebuildMetrics(metricSelect.value);
  });

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const value = Number(data.value);

    if (!Number.isFinite(value)) return;

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);

      if (!next.measurements[data.protocolId]) {
        next.measurements[data.protocolId] = {};
      }

      if (!Array.isArray(next.measurements[data.protocolId][data.metricId])) {
        next.measurements[data.protocolId][data.metricId] = [];
      }

      const series = next.measurements[data.protocolId][data.metricId];
      const existing = series.find(row => row.date === data.date);

      if (existing) {
        existing.value = value;
      } else {
        series.push({ date: data.date, value });
      }

      series.sort((a, b) => a.date.localeCompare(b.date));
      state.visual = next;
    });

    dialog.close();
    renderVisual(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderVisualProtocols(container, visual, host) {
  container.innerHTML = `
    <section class="mv-subhead mv-visual-subhead">
      <div>
        <div class="eyebrow">Protocolli</div>
        <h2>Libreria operativa</h2>
        <p>Ogni protocollo può appartenere a più domini e può avere zero, una o più misurazioni associate.</p>
      </div>

      ${canWriteModule('visual') ? `
        <div class="mv-subhead-actions">
          <button class="button button-ghost" id="visual-add-reflexion-preset" type="button">
            + Reflexion Go
          </button>
          <button class="button button-primary" id="visual-add-protocol" type="button">
            + Nuovo protocollo
          </button>
        </div>
      ` : ''}
    </section>

    <div class="mv-protocol-grid">
      ${visual.protocols.length
        ? visual.protocols.map(protocol => protocolCard(protocol, visual)).join('')
        : emptyPanel('Nessun protocollo configurato.')}
    </div>
  `;

  container.querySelector('#visual-add-protocol')?.addEventListener('click', () => {
    openProtocolDialog(host, visual);
  });

  container.querySelector('#visual-add-reflexion-preset')?.addEventListener('click', async () => {
    const exists = visual.protocols.some(protocol =>
      protocol.id === REFLEXION_PRESET.id
      || protocol.name.trim().toLowerCase() === REFLEXION_PRESET.name.toLowerCase(),
    );

    if (exists) {
      await showInAppAlert(
        'Reflexion Go è già presente nei protocolli.',
        { title: 'Protocollo già presente' },
      );
      return;
    }

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);
      next.protocols.push(JSON.parse(JSON.stringify(REFLEXION_PRESET)));
      state.visual = next;
    });

    renderVisual(host);
  });

  container.querySelectorAll('[data-edit-protocol]').forEach(button => {
    button.addEventListener('click', () => {
      openProtocolDialog(host, visual, button.dataset.editProtocol);
    });
  });

  container.querySelectorAll('[data-use-protocol]').forEach(button => {
    button.addEventListener('click', () => {
      openVisualSessionDialog(
        host,
        visual,
        button.dataset.useProtocol,
      );
    });
  });
}

function protocolCard(protocol, visual) {
  const measurementCount = protocolMeasurementCount(protocol, visual);

  return `
    <article class="panel mv-protocol-card mv-visual-protocol-card" style="--mv-visual-color:${visualProtocolColor(protocol)}">
      <div class="panel-body">
        <div class="mv-protocol-card-head">
          <div class="mv-visual-protocol-identity">
            <span class="mv-visual-protocol-icon" aria-hidden="true">${escapeHtml(visualProtocolIcon(protocol))}</span>
            <div>
              <h3>${escapeHtml(protocol.name)}</h3>
              <span>
                ${protocol.metrics.length
                  ? `${protocol.metrics.length} ${protocol.metrics.length === 1 ? 'misurazione' : 'misurazioni'}`
                  : 'Nessuna misurazione'}
              </span>
            </div>
          </div>

          ${canWriteModule('visual')
            ? `<button class="icon-button mv-edit-button" type="button" data-edit-protocol="${protocol.id}" aria-label="Modifica protocollo">✎</button>`
            : ''}
        </div>

        <p>${escapeHtml(protocol.description || 'Nessuna descrizione.')}</p>

        <div class="mv-tags">
          ${protocol.domains.length
            ? protocol.domains.map(id => `<span style="--mv-domain-chip:${visualDomainColor(id)}">${escapeHtml(domainById(id)?.name || id)}</span>`).join('')
            : '<span>Nessun dominio</span>'}
        </div>

        ${protocol.metrics.length ? `
          <div class="mv-protocol-metrics">
            ${protocol.metrics.map(metric => `
              <span>
                ${escapeHtml(metric.name)}
                ${metric.unit ? `<b>${escapeHtml(metric.unit)}</b>` : ''}
              </span>
            `).join('')}
          </div>
        ` : ''}

        <div class="mv-protocol-foot">
          <span>
            ${measurementCount
              ? `${measurementCount} ${measurementCount === 1 ? 'valore registrato' : 'valori registrati'}`
              : 'Nessun valore registrato'}
          </span>

          ${canWriteModule('visual')
            ? `<button class="button button-ghost" type="button" data-use-protocol="${protocol.id}">Registra sessione</button>`
            : ''}
        </div>
      </div>
    </article>
  `;
}

function makeLocalId(prefix = 'item') {
  return `${prefix}-${globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function metricRowHtml(metric = null) {
  return `
    <div class="mv-metric-definition-row" data-metric-row>
      <input type="hidden" name="metricId" value="${escapeAttr(metric?.id || makeLocalId('metric'))}" />

      <label>
        <span>Nome misurazione</span>
        <input name="metricName" value="${escapeAttr(metric?.name || '')}" placeholder="es. Tempo di reazione" required />
      </label>

      <label>
        <span>Unità</span>
        <input name="metricUnit" value="${escapeAttr(metric?.unit || '')}" placeholder="%, ms, cm…" />
      </label>

      <button class="icon-button mv-remove-metric" type="button" data-remove-metric aria-label="Rimuovi misurazione">×</button>
    </div>
  `;
}

function openProtocolDialog(host, visual, protocolId = '') {
  const existing = protocolId
    ? visual.protocols.find(item => item.id === protocolId)
    : null;

  const protocol = existing || {
    id: makeLocalId('protocol'),
    name: '',
    domains: [],
    description: '',
    metrics: [],
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog mv-protocol-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="visual-protocol-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Perception & Neuro</div>
          <h3>${existing ? 'Modifica protocollo' : 'Nuovo protocollo'}</h3>
        </div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field full">
            <label>Nome protocollo</label>
            <input name="name" value="${escapeAttr(protocol.name)}" required />
          </div>

          <div class="field full">
            <label>Descrizione</label>
            <textarea name="description">${escapeHtml(protocol.description)}</textarea>
          </div>
        </div>

        <fieldset class="mv-domain-fieldset">
          <legend>Domini</legend>
          <div class="mv-domain-checks">
            ${VISUAL_DOMAINS.map(domain => `
              <label>
                <input
                  type="checkbox"
                  name="domain"
                  value="${domain.id}"
                  ${protocol.domains.includes(domain.id) ? 'checked' : ''}
                />
                <span>${escapeHtml(domain.name)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <section class="mv-metric-definition">
          <div class="mv-metric-definition-head">
            <div>
              <strong>Misurazioni associate</strong>
              <span>Opzionali. I singoli valori conserveranno soltanto data e valore.</span>
            </div>
            <button class="button button-ghost" id="visual-add-metric-definition" type="button">
              + Misurazione
            </button>
          </div>

          <div id="visual-metric-definition-list" class="mv-metric-definition-list">
            ${protocol.metrics.map(metricRowHtml).join('')}
          </div>
        </section>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger-ghost" id="visual-delete-protocol" type="button">Elimina protocollo</button>'
            : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  const form = dialog.querySelector('#visual-protocol-form');
  const metricList = dialog.querySelector('#visual-metric-definition-list');

  const bindRemoveMetricButtons = () => {
    metricList.querySelectorAll('[data-remove-metric]').forEach(button => {
      button.onclick = () => {
        button.closest('[data-metric-row]')?.remove();
      };
    });
  };

  bindRemoveMetricButtons();

  dialog.querySelector('#visual-add-metric-definition')?.addEventListener('click', () => {
    metricList.insertAdjacentHTML('beforeend', metricRowHtml());
    bindRemoveMetricButtons();
  });

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const name = String(form.elements.name.value || '').trim();
    if (!name) return;

    const domainIds = [...form.querySelectorAll('input[name="domain"]:checked')]
      .map(input => input.value);

    const metrics = [...metricList.querySelectorAll('[data-metric-row]')]
      .map(row => ({
        id: row.querySelector('[name="metricId"]').value,
        name: String(row.querySelector('[name="metricName"]').value || '').trim(),
        unit: String(row.querySelector('[name="metricUnit"]').value || '').trim(),
      }))
      .filter(metric => metric.name);

    const duplicateMetricNames = metrics
      .map(metric => metric.name.toLowerCase())
      .filter((nameValue, index, all) => all.indexOf(nameValue) !== index);

    if (duplicateMetricNames.length) {
      await showInAppAlert(
        'All’interno dello stesso protocollo ogni misurazione deve avere un nome distinto.',
        { title: 'Misurazioni duplicate' },
      );
      return;
    }

    if (existing) {
      const removedMetricIds = existing.metrics
        .map(metric => metric.id)
        .filter(id => !metrics.some(metric => metric.id === id));

      const hasMeasuredRemovedMetric = removedMetricIds.some(id =>
        Array.isArray(visual.measurements?.[existing.id]?.[id])
        && visual.measurements[existing.id][id].length
      );

      if (hasMeasuredRemovedMetric) {
        await showInAppAlert(
          'Non puoi rimuovere una misurazione che possiede già valori registrati. Elimina prima i valori dalla sezione Misurazioni.',
          { title: 'Misurazione in uso' },
        );
        return;
      }
    }

    const duplicateProtocol = visual.protocols.find(item =>
      item.id !== protocol.id
      && item.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicateProtocol) {
      await showInAppAlert(
        'Esiste già un protocollo con questo nome.',
        { title: 'Protocollo duplicato' },
      );
      return;
    }

    const normalizedProtocol = {
      id: protocol.id,
      name,
      domains: domainIds,
      description: String(form.elements.description.value || '').trim(),
      metrics,
    };

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);
      const index = next.protocols.findIndex(item => item.id === normalizedProtocol.id);

      if (index >= 0) {
        next.protocols[index] = normalizedProtocol;
      } else {
        next.protocols.push(normalizedProtocol);
      }

      if (!next.measurements[normalizedProtocol.id]) {
        next.measurements[normalizedProtocol.id] = {};
      }

      for (const metric of normalizedProtocol.metrics) {
        if (!Array.isArray(next.measurements[normalizedProtocol.id][metric.id])) {
          next.measurements[normalizedProtocol.id][metric.id] = [];
        }
      }

      state.visual = next;
    });

    dialog.close();
    renderVisual(host);
  });

  dialog.querySelector('#visual-delete-protocol')?.addEventListener('click', async () => {
    const current = normalizeVisualPayload(store.getState().visual);

    const usedBySession = current.trainingSessions.some(
      session => session.protocolId === existing.id,
    );

    const usedByMeasurements = protocolMeasurementCount(existing, current) > 0;

    if (usedBySession || usedByMeasurements) {
      await showInAppAlert(
        'Questo protocollo è già utilizzato da sessioni o misurazioni e non può essere eliminato.',
        { title: 'Protocollo in uso' },
      );
      return;
    }

    const ok = await showInAppConfirm(
      `Eliminare il protocollo “${existing.name}”?`,
      { title: 'Elimina protocollo', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);
      next.protocols = next.protocols.filter(item => item.id !== existing.id);
      delete next.measurements[existing.id];
      state.visual = next;
    });

    dialog.close();
    renderVisual(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function visualSessionRow(session, visual) {
  const protocol = protocolById(session.protocolId, visual);

  return `
    <div class="mv-simple-row">
      <div>
        <strong>${escapeHtml(protocol?.name || 'Protocollo non disponibile')}</strong>
        <span>${formatDate(session.date)}</span>
      </div>
      <strong>${Number(session.durationMin || 0) ? `${Number(session.durationMin)} min` : '—'}</strong>
    </div>
  `;
}

function emptyCopy(text) {
  return `<div class="mv-empty">${escapeHtml(text)}</div>`;
}

function emptyPanel(text) {
  return `<article class="panel mv-empty-panel">${emptyCopy(text)}</article>`;
}

async function enhanceCurrentRoute() {
  enhancementQueued = false;

  applyModuleMetadata();
  patchVisibleMetadata();

  const current = route();

  if (!['mental', 'visual'].includes(current)) return;

  const host = activeContentHost();
  if (!host) return;

  try {
    await ensureCloud(current);
  } catch (error) {
    console.warn(`${current} initialization failed.`, error);
    setCloudIndicator(current, 'error', error?.message || '');
  }

  if (current === 'mental') {
    await refreshMentalResourceCache();
    renderMental(host);
  } else {
    renderVisual(host);
  }
}

function queueEnhancement() {
  if (enhancementQueued) return;

  enhancementQueued = true;
  queueMicrotask(() => {
    void enhanceCurrentRoute();
  });
}

document.addEventListener('click', event => {
  const workspaceButton = event.target.closest?.('[data-module-workspace]');
  if (workspaceButton && ['mental', 'visual'].includes(route())) {
    queueEnhancement();
  }
});

window.addEventListener('hashchange', queueEnhancement);
window.addEventListener('tpos:route-rendered', queueEnhancement);

applyModuleMetadata();
patchVisibleMetadata();
queueEnhancement();
