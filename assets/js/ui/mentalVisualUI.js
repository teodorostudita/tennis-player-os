import '../bootstrap.js';

import { modules } from '../data/schema.js';
import { store } from '../data/store.js';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  REFLEXION_METRICS,
  loadStructuredPerformanceModule,
  normalizeMentalPayload,
  normalizeVisualPayload,
  startStructuredPerformanceSync,
} from '../cloud/mentalVisualCloud.js';
import {
  showInAppConfirm,
} from './inAppMessages.js';

const MENTAL_SKILLS = [
  {
    id: 'motivazione',
    name: 'Motivazione e coinvolgimento',
    short: 'Motivazione',
    description: 'Motivazione intrinseca ed estrinseca, piacere nel giocare, perseveranza e orientamento verso obiettivi controllabili.',
    indicators: ['piacere', 'impegno', 'sacrificio', 'intensità', 'voglia di competere'],
  },
  {
    id: 'fiducia',
    name: 'Fiducia',
    short: 'Fiducia',
    description: 'Costruire fiducia attraverso risultati reali, memoria selettiva, richiamo dei successi e dialogo interno positivo.',
    indicators: ['sicurezza', 'linguaggio del corpo', 'memoria dei successi'],
  },
  {
    id: 'concentrazione',
    name: 'Concentrazione e controllo attentivo',
    short: 'Concentrazione',
    description: 'Creare, mantenere e ritrovare il focus, restare nel presente e usare ancoraggi sensoriali o parole chiave.',
    indicators: ['presente', 'bolla attentiva', 'parola chiave', 'recupero del focus'],
  },
  {
    id: 'regolazione',
    name: 'Regolazione emotiva e dell’attivazione',
    short: 'Regolazione',
    description: 'Riconoscere e regolare ansia, intensità e attivazione con respirazione, linguaggio del corpo e consapevolezza.',
    indicators: ['ansia', 'intensità', 'respirazione', 'linguaggio del corpo'],
  },
  {
    id: 'resilienza',
    name: 'Resilienza e gestione delle avversità',
    short: 'Resilienza',
    description: 'Prevenire, gestire e recuperare dalla frustrazione, elevare la soglia di tolleranza e sviluppare antifragilità.',
    indicators: ['reset', 'frustrazione', 'tenuta mentale', 'antifragilità'],
  },
  {
    id: 'immaginazione',
    name: 'Immaginazione mentale e prova mentale',
    short: 'Immaginazione',
    description: 'Visualizzazione multisensoriale ed emotiva del gesto, della prestazione e delle situazioni competitive.',
    indicators: ['gesto perfetto', 'successo', 'sensi', 'emozioni'],
  },
];

const MENTAL_TOOLS = [
  { id: 'visualizzazione', name: 'Visualizzazione', skills: ['immaginazione', 'fiducia', 'concentrazione'] },
  { id: 'dialogo-interno', name: 'Dialogo interno', skills: ['fiducia', 'concentrazione', 'resilienza'] },
  { id: 'respirazione-521', name: 'Respirazione 5-2-1', skills: ['regolazione', 'resilienza', 'concentrazione'] },
  { id: 'linguaggio-corpo', name: 'Linguaggio del corpo', skills: ['fiducia', 'regolazione', 'resilienza'] },
  { id: 'affermazioni', name: 'Affermazioni', skills: ['fiducia', 'resilienza'] },
  { id: 'consapevolezza-lampo', name: 'Consapevolezza lampo', skills: ['concentrazione', 'regolazione', 'resilienza'] },
  { id: 'memoria-selettiva', name: 'Memoria selettiva', skills: ['fiducia', 'resilienza'] },
  { id: 'richiamo-successi', name: 'Richiamo dei successi', skills: ['fiducia', 'motivazione'] },
  { id: 'definizione-obiettivi', name: 'Definizione degli obiettivi', skills: ['motivazione', 'concentrazione'] },
  { id: 'meditazione', name: 'Meditazione pre-partita', skills: ['concentrazione', 'regolazione'] },
  { id: 'routine-reset', name: 'Routine di reset', skills: ['resilienza', 'concentrazione', 'regolazione'] },
  { id: 'ancoraggio-sensoriale', name: 'Ancoraggio sensoriale', skills: ['concentrazione', 'regolazione'] },
];

const PEAK_STATES = [
  {
    name: 'Zona',
    description: 'Prestazione automatica con interferenza cosciente minima e attenzione pienamente immersa nel compito.',
  },
  {
    name: 'Flusso',
    description: 'Assorbimento completo nell’azione, continuità attentiva e percezione di controllo durante la prestazione.',
  },
  {
    name: 'Prestazione decisiva',
    description: 'Capacità di concentrare l’attenzione e produrre una risposta efficace nei momenti ad alta pressione.',
  },
];

const VISUAL_DOMAINS = [
  {
    id: 'funzione-visiva',
    name: 'Funzione visiva',
    description: 'Acuità statica e dinamica, contrasto, motilità oculare, accomodazione, vergenza, profondità, periferica e figura-sfondo.',
  },
  {
    id: 'percezione-anticipazione',
    name: 'Percezione e anticipazione',
    description: 'Lettura di profondità, traiettoria, lungo/corto, alto/basso, spin, attenzione visiva e anticipazione tennis-specifica.',
  },
  {
    id: 'neurocognitivo',
    name: 'Neurocognitivo',
    description: 'Velocità di elaborazione, flessibilità mentale, inibizione reattiva e risposta a stimoli semplici o complessi.',
  },
  {
    id: 'sensomotorio',
    name: 'Sensomotorio',
    description: 'Coordinazione occhio-mano, propriocezione, equilibrio, coordinazione bilaterale e integrazione tra percezione e movimento.',
  },
];

const VISUAL_PROTOCOLS = [
  {
    id: 'reflexion-go',
    name: 'Reflexion Go',
    domains: ['neurocognitivo', 'sensomotorio', 'percezione-anticipazione'],
    description: 'Sessioni neurocognitive e visuomotorie con misurazioni separate nella sezione Misurazioni.',
  },
  {
    id: 'giocoleria-propriocezione',
    name: 'Giocoleria + propriocezione',
    domains: ['sensomotorio'],
    description: 'Giocoleria combinata con compiti propriocettivi, equilibrio e variazioni della base di appoggio.',
  },
  {
    id: 'inseguimento-palla',
    name: 'Inseguimento oculare su palla appesa',
    domains: ['funzione-visiva'],
    description: 'Seguire con lo sguardo una palla oscillante senza muovere la testa.',
  },
  {
    id: 'fuoco-distanze',
    name: 'Fuoco a distanze diverse',
    domains: ['funzione-visiva'],
    description: 'Alternare il fuoco tra oggetti vicini e lontani mantenendo nitidezza e controllo.',
  },
  {
    id: 'matita',
    name: 'Matita: accomodazione e convergenza',
    domains: ['funzione-visiva'],
    description: 'Avvicinare e allontanare una matita mantenendo il fuoco e controllando la convergenza.',
  },
  {
    id: 'periferica-pollici',
    name: 'Visione periferica con i pollici',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Mantenere il punto di fissazione mentre si rilevano stimoli progressivamente più periferici.',
  },
  {
    id: 'otto-orizzontale',
    name: 'Tracciamento a otto orizzontale',
    domains: ['funzione-visiva'],
    description: 'Seguire con lo sguardo una matita colorata che descrive un otto orizzontale.',
  },
  {
    id: 'vr-fissazione',
    name: 'VR · Fissazione',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per stabilità della fissazione.',
  },
  {
    id: 'vr-accomodazione',
    name: 'VR · Accomodazione',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per il cambio di fuoco e accomodazione.',
  },
  {
    id: 'vr-inseguimento',
    name: 'VR · Inseguimento visivo',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Protocollo in realtà virtuale per inseguimento e continuità visiva.',
  },
  {
    id: 'vr-convergenza',
    name: 'VR · Convergenza',
    domains: ['funzione-visiva'],
    description: 'Protocollo in realtà virtuale per la convergenza.',
  },
  {
    id: 'vr-stereoacuita',
    name: 'VR · Stereoacuità',
    domains: ['funzione-visiva', 'percezione-anticipazione'],
    description: 'Protocollo in realtà virtuale per percezione stereoscopica della profondità.',
  },
];

let mentalSection = 'panoramica';
let visualSection = 'panoramica';
let cloudState = {
  mental: { athleteId: '', loaded: false, stop: null, error: '' },
  visual: { athleteId: '', loaded: false, stop: null, error: '' },
};
let enhancementQueued = false;

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

function skillById(id) {
  return MENTAL_SKILLS.find(item => item.id === id);
}

function toolById(id) {
  return MENTAL_TOOLS.find(item => item.id === id);
}

function protocolById(id) {
  return VISUAL_PROTOCOLS.find(item => item.id === id);
}

function domainById(id) {
  return VISUAL_DOMAINS.find(item => item.id === id);
}

function applyModuleMetadata() {
  const mental = modules.find(item => item.id === 'mental');
  const visual = modules.find(item => item.id === 'visual');

  if (mental) {
    mental.name = 'Mental';
    mental.subtitle = 'Motivazione · Fiducia · Concentrazione · Regolazione';
    mental.description = 'Allenamento mentale della prestazione: motivazione, fiducia, concentrazione, regolazione emotiva, resilienza, immaginazione mentale e strumenti operativi.';
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
    <section class="mv-module-head">
      <div>
        <div class="eyebrow">Mental</div>
        <h2>Prestazione mentale</h2>
        <p>Abilità, strumenti e routine organizzati senza confondere cause, tecniche di allenamento e stati di prestazione.</p>
      </div>
    </section>

    ${readOnlyNote('mental')}

    ${internalTabs(mentalSection, [
      { id: 'panoramica', label: 'Panoramica' },
      { id: 'abilita', label: 'Abilità' },
      { id: 'strumenti', label: 'Strumenti' },
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
    renderMentalSkills(sectionHost, mental);
  } else if (mentalSection === 'strumenti') {
    renderMentalTools(sectionHost);
  } else if (mentalSection === 'allenamento') {
    renderMentalTraining(sectionHost, mental, host);
  } else if (mentalSection === 'review') {
    renderMentalReview(sectionHost, mental, host);
  } else {
    renderMentalOverview(sectionHost, mental, host);
  }
}

function renderMentalOverview(container, mental, host) {
  const sessions = [...mental.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const reviews = [...mental.matchReviews]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const levelAverage = MENTAL_SKILLS.reduce(
    (sum, skill) => sum + Number(mental.skills[skill.id]?.level || 3),
    0,
  ) / MENTAL_SKILLS.length;

  container.innerHTML = `
    <section class="mv-kpis">
      <article class="mv-kpi"><span>Abilità mappate</span><strong>${MENTAL_SKILLS.length}</strong></article>
      <article class="mv-kpi"><span>Valutazione media</span><strong>${levelAverage.toFixed(1)}/5</strong></article>
      <article class="mv-kpi"><span>Sessioni registrate</span><strong>${mental.trainingSessions.length}</strong></article>
      <article class="mv-kpi"><span>Review partita</span><strong>${mental.matchReviews.length}</strong></article>
    </section>

    <section class="mv-grid-2">
      <article class="panel">
        <div class="panel-header">
          <h3>Obiettivi mentali</h3>
          <p>Tre livelli progressivi: Bronzo, Argento e Oro.</p>
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

      <article class="panel">
        <div class="panel-header">
          <h3>Stati di prestazione</h3>
          <p>Non sono abilità isolate: emergono dalla combinazione di più capacità.</p>
        </div>
        <div class="panel-body mv-peak-list">
          ${PEAK_STATES.map(state => `
            <div class="mv-peak-row">
              <strong>${escapeHtml(state.name)}</strong>
              <span>${escapeHtml(state.description)}</span>
            </div>
          `).join('')}
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
    <label>
      <span>${label}</span>
      <textarea name="${name}" placeholder="Obiettivo ${label.toLowerCase()}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function goalReadOnly(label, value) {
  return `
    <div>
      <span>${label}</span>
      <strong>${escapeHtml(value || '—')}</strong>
    </div>
  `;
}

function renderMentalSkills(container, mental) {
  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Abilità mentali</div>
        <h2>Sei aree di lavoro</h2>
        <p>La scala 1–5 è una valutazione interna di lavoro, non un test clinico.</p>
      </div>
    </section>

    <div class="mv-skill-grid">
      ${MENTAL_SKILLS.map(skill => {
        const value = mental.skills[skill.id] || { level: 3, notes: '' };

        return `
          <article class="panel mv-skill-card">
            <div class="panel-body">
              <div class="mv-skill-card-head">
                <div>
                  <div class="eyebrow">${escapeHtml(skill.short)}</div>
                  <h3>${escapeHtml(skill.name)}</h3>
                </div>
                <strong class="mv-level-badge">${value.level}/5</strong>
              </div>

              <p>${escapeHtml(skill.description)}</p>

              <div class="mv-tags">
                ${skill.indicators.map(item => `<span>${escapeHtml(item)}</span>`).join('')}
              </div>

              ${canWriteModule('mental') ? `
                <form data-mental-skill-form="${skill.id}" class="mv-skill-form">
                  <label>
                    <span>Valutazione attuale</span>
                    <select name="level">
                      ${[1,2,3,4,5].map(level => `
                        <option value="${level}" ${Number(value.level) === level ? 'selected' : ''}>${level}</option>
                      `).join('')}
                    </select>
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
  `;

  container.querySelectorAll('[data-mental-skill-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();

      const id = form.dataset.mentalSkillForm;
      const data = Object.fromEntries(new FormData(form).entries());

      store.update(state => {
        const next = normalizeMentalPayload(state.mental);
        next.skills[id] = {
          level: Math.max(1, Math.min(5, Number(data.level || 3))),
          notes: String(data.notes || '').trim(),
        };
        state.mental = next;
      });

      renderMentalSkills(container, normalizeMentalPayload(store.getState().mental));
    });
  });
}

function renderMentalTools(container) {
  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Strumenti</div>
        <h2>Cassetta degli attrezzi mentale</h2>
        <p>Uno strumento può servire contemporaneamente più abilità; non viene duplicato nelle diverse aree.</p>
      </div>
    </section>

    <div class="mv-tool-grid">
      ${MENTAL_TOOLS.map(tool => `
        <article class="panel mv-tool-card">
          <div class="panel-body">
            <h3>${escapeHtml(tool.name)}</h3>
            <div class="mv-tags">
              ${tool.skills.map(id => `<span>${escapeHtml(skillById(id)?.short || id)}</span>`).join('')}
            </div>
          </div>
        </article>
      `).join('')}
    </div>

    <section class="panel mv-frustration-panel">
      <div class="panel-header">
        <h3>Gestione della frustrazione</h3>
        <p>Il lavoro viene organizzato in tre momenti distinti.</p>
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
}

function renderMentalTraining(container, mental, host) {
  const sessions = [...mental.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Allenamento mentale</div>
        <h2>Sessioni e lavoro quotidiano</h2>
        <p>Registra quale abilità e quale strumento sono stati allenati.</p>
      </div>
      ${canWriteModule('mental')
        ? '<button class="button button-primary" id="mental-add-session" type="button">+ Nuova sessione</button>'
        : ''}
    </section>

    <section class="panel">
      <div class="panel-body mv-table-wrap">
        <table class="mv-table">
          <thead>
            <tr><th>Data</th><th>Abilità</th><th>Strumento</th><th>Durata</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            ${sessions.length
              ? sessions.map(session => `
                <tr>
                  <td>${formatDate(session.date)}</td>
                  <td>${escapeHtml(skillById(session.skillId)?.short || '—')}</td>
                  <td>${escapeHtml(toolById(session.toolId)?.name || '—')}</td>
                  <td>${Number(session.durationMin || 0) ? `${Number(session.durationMin)} min` : '—'}</td>
                  <td>${escapeHtml(session.notes || '')}</td>
                  <td>
                    ${canWriteModule('mental')
                      ? `<button class="resource-delete" type="button" data-delete-mental-session="${session.id}">Elimina</button>`
                      : ''}
                  </td>
                </tr>
              `).join('')
              : `<tr><td colspan="6">${emptyCopy('Nessuna sessione registrata.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#mental-add-session')?.addEventListener('click', () => {
    openMentalSessionDialog(host);
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
        <div class="field"><label>Durata (min)</label><input type="number" min="0" step="5" name="durationMin" /></div>

        <div class="field">
          <label>Abilità principale</label>
          <select name="skillId">
            ${MENTAL_SKILLS.map(skill => `<option value="${skill.id}">${escapeHtml(skill.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Strumento principale</label>
          <select name="toolId">
            ${MENTAL_TOOLS.map(tool => `<option value="${tool.id}">${escapeHtml(tool.name)}</option>`).join('')}
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

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeMentalPayload(state.mental);
      next.trainingSessions.push({
        id: uid('mental-session'),
        date: data.date,
        skillId: data.skillId,
        toolId: data.toolId,
        durationMin: Number(data.durationMin || 0),
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
                ${reviewScore('Resilienza', review.resilience)}
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
        ${scoreInput('Resilienza / tenuta mentale', 'resilience')}

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
  return `
    <div class="mv-simple-row">
      <div>
        <strong>${escapeHtml(skillById(session.skillId)?.short || 'Sessione mentale')}</strong>
        <span>${formatDate(session.date)} · ${escapeHtml(toolById(session.toolId)?.name || '—')}</span>
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
        <p>Separiamo allenamento e misurazione: le sessioni descrivono il lavoro svolto; Reflexion Go mantiene serie longitudinali data + valore percentuale.</p>
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
    renderVisualProtocols(sectionHost, host);
  } else {
    renderVisualOverview(sectionHost, visual);
  }
}

function renderVisualOverview(container, visual) {
  const latestMetrics = REFLEXION_METRICS.map(metric => ({
    metric,
    summary: metricSummary(visual.reflexion[metric] || []),
  }));

  const recentSessions = [...visual.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5);

  container.innerHTML = `
    <section class="mv-domain-grid">
      ${VISUAL_DOMAINS.map(domain => `
        <article class="panel mv-domain-card">
          <div class="panel-body">
            <h3>${escapeHtml(domain.name)}</h3>
            <p>${escapeHtml(domain.description)}</p>
          </div>
        </article>
      `).join('')}
    </section>

    <section class="panel mv-reflexion-overview">
      <div class="panel-header">
        <h3>Reflexion Go · ultimo valore</h3>
        <p>Le denominazioni delle cinque misurazioni restano quelle originali.</p>
      </div>
      <div class="panel-body mv-reflexion-latest-grid">
        ${latestMetrics.map(({ metric, summary }) => `
          <div class="mv-reflexion-latest">
            <span>${escapeHtml(metric)}</span>
            <strong>${summary.latest ? `${summary.latest.value}%` : '—'}</strong>
            <small>${summary.latest ? formatDate(summary.latest.date) : 'Nessun dato'}</small>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Allenamento recente</h3>
        <p>Ultime sessioni visive, neurocognitive e sensomotorie.</p>
      </div>
      <div class="panel-body mv-simple-list">
        ${recentSessions.length
          ? recentSessions.map(visualSessionRow).join('')
          : emptyCopy('Nessuna sessione registrata.')}
      </div>
    </section>
  `;
}

function renderVisualTraining(container, visual, host) {
  const sessions = [...visual.trainingSessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Allenamento</div>
        <h2>Sessioni percettive e neuro</h2>
        <p>Registra il lavoro svolto senza confonderlo con le misurazioni Reflexion Go.</p>
      </div>
      ${canWriteModule('visual')
        ? '<button class="button button-primary" id="visual-add-session" type="button">+ Nuova sessione</button>'
        : ''}
    </section>

    <section class="panel">
      <div class="panel-body mv-table-wrap">
        <table class="mv-table">
          <thead>
            <tr><th>Data</th><th>Protocollo</th><th>Domini</th><th>Durata</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            ${sessions.length
              ? sessions.map(session => {
                const protocol = protocolById(session.protocolId);

                return `
                  <tr>
                    <td>${formatDate(session.date)}</td>
                    <td>${escapeHtml(protocol?.name || session.protocolName || 'Sessione')}</td>
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
  `;

  container.querySelector('#visual-add-session')?.addEventListener('click', () => {
    openVisualSessionDialog(host);
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

function openVisualSessionDialog(host, presetProtocolId = '') {
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
            ${VISUAL_PROTOCOLS.map(protocol => `
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

function renderVisualMeasurements(container, visual, host) {
  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Reflexion Go</div>
        <h2>Misurazioni longitudinali</h2>
        <p>Per ogni metrica conserviamo soltanto data e valore percentuale.</p>
      </div>
      ${canWriteModule('visual')
        ? '<button class="button button-primary" id="visual-add-measurement" type="button">+ Nuova misurazione</button>'
        : ''}
    </section>

    <div class="mv-measure-grid">
      ${REFLEXION_METRICS.map(metric => metricCard(metric, visual.reflexion[metric] || [])).join('')}
    </div>

    <section class="panel mv-measure-history">
      <div class="panel-header">
        <h3>Storico completo</h3>
        <p>Valori percentuali ordinati per data.</p>
      </div>
      <div class="panel-body mv-table-wrap">
        <table class="mv-table">
          <thead><tr><th>Data</th><th>Misurazione</th><th>Valore</th><th></th></tr></thead>
          <tbody>
            ${measurementHistoryRows(visual)}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#visual-add-measurement')?.addEventListener('click', () => {
    openMeasurementDialog(host);
  });

  container.querySelectorAll('[data-add-metric]').forEach(button => {
    button.addEventListener('click', () => {
      openMeasurementDialog(host, button.dataset.addMetric);
    });
  });

  container.querySelectorAll('[data-delete-measurement]').forEach(button => {
    button.addEventListener('click', async () => {
      const metric = button.dataset.metric;
      const date = button.dataset.deleteMeasurement;

      const ok = await showInAppConfirm(
        `Eliminare ${metric} del ${formatDate(date)}?`,
        { title: 'Elimina misurazione', confirmLabel: 'Elimina', danger: true },
      );

      if (!ok) return;

      store.update(state => {
        const next = normalizeVisualPayload(state.visual);
        next.reflexion[metric] = next.reflexion[metric]
          .filter(row => row.date !== date);
        state.visual = next;
      });

      renderVisual(host);
    });
  });
}

function metricCard(metric, rows) {
  const summary = metricSummary(rows);

  return `
    <article class="panel mv-measure-card">
      <div class="panel-body">
        <div class="mv-measure-head">
          <div>
            <div class="eyebrow">Reflexion Go</div>
            <h3>${escapeHtml(metric)}</h3>
          </div>
          ${canWriteModule('visual')
            ? `<button class="button button-ghost mv-small-button" data-add-metric="${escapeAttr(metric)}" type="button">+ Valore</button>`
            : ''}
        </div>

        <div class="mv-measure-stats">
          ${metricStat('Ultimo', summary.latest ? `${summary.latest.value}%` : '—')}
          ${metricStat('Baseline', summary.baseline ? `${summary.baseline.value}%` : '—')}
          ${metricStat('Migliore', summary.best !== null ? `${summary.best}%` : '—')}
          ${metricStat('Media ultime 5', summary.mean5 !== null ? `${summary.mean5.toFixed(1)}%` : '—')}
        </div>

        ${sparkline(rows)}

        <div class="mv-measure-foot">
          <span>${rows.length} ${rows.length === 1 ? 'misurazione' : 'misurazioni'}</span>
          <strong>${summary.delta !== null ? `${summary.delta >= 0 ? '+' : ''}${summary.delta.toFixed(1)} pt vs baseline` : '—'}</strong>
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
    .filter(row => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!sorted.length) {
    return {
      latest: null,
      baseline: null,
      best: null,
      mean5: null,
      delta: null,
    };
  }

  const latest = sorted[sorted.length - 1];
  const baseline = sorted[0];
  const best = Math.max(...sorted.map(row => Number(row.value || 0)));
  const last5 = sorted.slice(-5);
  const mean5 = last5.reduce((sum, row) => sum + Number(row.value || 0), 0) / last5.length;

  return {
    latest,
    baseline,
    best,
    mean5,
    delta: Number(latest.value || 0) - Number(baseline.value || 0),
  };
}

function sparkline(rows) {
  const sorted = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  if (sorted.length < 2) {
    return '<div class="mv-sparkline-empty">Servono almeno due valori per visualizzare il trend.</div>';
  }

  const width = 360;
  const height = 92;
  const pad = 10;

  const points = sorted.map((row, index) => {
    const x = pad + (index / (sorted.length - 1)) * (width - pad * 2);
    const y = height - pad - (Number(row.value || 0) / 100) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <svg class="mv-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend percentuale">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="mv-spark-grid"></line>
      <line x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}" class="mv-spark-grid"></line>
      <polyline points="${points}" class="mv-spark-line"></polyline>
    </svg>
  `;
}

function measurementHistoryRows(visual) {
  const rows = [];

  for (const metric of REFLEXION_METRICS) {
    for (const row of visual.reflexion[metric] || []) {
      rows.push({ metric, ...row });
    }
  }

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!rows.length) {
    return `<tr><td colspan="4">${emptyCopy('Nessuna misurazione Reflexion Go registrata.')}</td></tr>`;
  }

  return rows.map(row => `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.metric)}</td>
      <td><strong>${Number(row.value).toFixed(Number(row.value) % 1 ? 1 : 0)}%</strong></td>
      <td>
        ${canWriteModule('visual')
          ? `<button
               class="resource-delete"
               type="button"
               data-delete-measurement="${escapeAttr(row.date)}"
               data-metric="${escapeAttr(row.metric)}"
             >Elimina</button>`
          : ''}
      </td>
    </tr>
  `).join('');
}

function openMeasurementDialog(host, presetMetric = '') {
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog mv-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="visual-measurement-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Reflexion Go</div><h3>Nuova misurazione</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Misurazione</label>
          <select name="metric">
            ${REFLEXION_METRICS.map(metric => `
              <option value="${escapeAttr(metric)}" ${presetMetric === metric ? 'selected' : ''}>${escapeHtml(metric)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>Data</label>
          <input type="date" name="date" value="${todayKey()}" required />
        </div>

        <div class="field">
          <label>Valore (%)</label>
          <input type="number" name="value" min="0" max="100" step="0.1" required />
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

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#visual-measurement-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const value = Math.max(0, Math.min(100, Number(data.value || 0)));

    store.update(state => {
      const next = normalizeVisualPayload(state.visual);
      const series = next.reflexion[data.metric] || [];

      const existing = series.find(row => row.date === data.date);

      if (existing) {
        existing.value = value;
      } else {
        series.push({ date: data.date, value });
      }

      series.sort((a, b) => a.date.localeCompare(b.date));
      next.reflexion[data.metric] = series;
      state.visual = next;
    });

    dialog.close();
    renderVisual(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderVisualProtocols(container, host) {
  container.innerHTML = `
    <section class="mv-subhead">
      <div>
        <div class="eyebrow">Protocolli</div>
        <h2>Libreria operativa</h2>
        <p>Protocolli visivi, neurocognitivi e sensomotori. La propriocezione viene trattata nel dominio sensomotorio.</p>
      </div>
    </section>

    <div class="mv-protocol-grid">
      ${VISUAL_PROTOCOLS.map(protocol => `
        <article class="panel mv-protocol-card">
          <div class="panel-body">
            <h3>${escapeHtml(protocol.name)}</h3>
            <p>${escapeHtml(protocol.description)}</p>

            <div class="mv-tags">
              ${protocol.domains.map(id => `<span>${escapeHtml(domainById(id)?.name || id)}</span>`).join('')}
            </div>

            ${canWriteModule('visual')
              ? `<button class="button button-ghost" type="button" data-use-protocol="${protocol.id}">Registra sessione</button>`
              : ''}
          </div>
        </article>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('[data-use-protocol]').forEach(button => {
    button.addEventListener('click', () => {
      openVisualSessionDialog(host, button.dataset.useProtocol);
    });
  });
}

function visualSessionRow(session) {
  const protocol = protocolById(session.protocolId);

  return `
    <div class="mv-simple-row">
      <div>
        <strong>${escapeHtml(protocol?.name || 'Sessione')}</strong>
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

applyModuleMetadata();
patchVisibleMetadata();
queueEnhancement();
