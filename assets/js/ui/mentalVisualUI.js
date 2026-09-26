import '../bootstrap.js';

import { modules } from '../data/schema.js';
import { store } from '../data/store.js';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  REFLEXION_PRESET,
  VISUAL_STARTER_PROTOCOLS,
  loadStructuredPerformanceModule,
  normalizeMentalPayload,
  normalizeVisualPayload,
  startStructuredPerformanceSync,
} from '../cloud/mentalVisualCloud.js';
import {
  showInAppAlert,
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

function protocolById(id, visual = normalizeVisualPayload(store.getState().visual)) {
  return visual.protocols.find(item => item.id === id);
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
          <article class="panel mv-domain-card">
            <div class="panel-body">
              <div class="mv-domain-card-top">
                <h3>${escapeHtml(domain.name)}</h3>
                <span>${count} ${count === 1 ? 'protocollo' : 'protocolli'}</span>
              </div>
              <p>${escapeHtml(domain.description)}</p>
            </div>
          </article>
        `;
      }).join('')}
    </section>

    ${activeMeasuredProtocols.length ? `
      <section class="panel mv-measured-overview">
        <div class="panel-header">
          <h3>Misurazioni attive</h3>
          <p>Compaiono qui soltanto i protocolli che hanno metriche definite e almeno un valore registrato.</p>
        </div>

        <div class="panel-body mv-measured-protocol-list">
          ${activeMeasuredProtocols.map(protocol => measuredProtocolOverview(protocol, visual)).join('')}
        </div>
      </section>
    ` : ''}

    <section class="panel">
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
    <article class="mv-measured-protocol">
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
    <section class="mv-subhead">
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
    <section class="mv-subhead">
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
    <article class="panel mv-measure-card">
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

        ${sparkline(rows)}

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

function sparkline(rows) {
  const sorted = [...rows]
    .filter(row => Number.isFinite(Number(row.value)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  if (sorted.length < 2) {
    return '<div class="mv-sparkline-empty">Servono almeno due valori per visualizzare il trend.</div>';
  }

  const width = 360;
  const height = 92;
  const pad = 10;

  const values = sorted.map(row => Number(row.value));
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const spread = Math.max(1, Math.abs(min) * 0.05);
    min -= spread;
    max += spread;
  } else {
    const spread = (max - min) * 0.08;
    min -= spread;
    max += spread;
  }

  const points = sorted.map((row, index) => {
    const x = pad + (index / (sorted.length - 1)) * (width - pad * 2);
    const ratio = (Number(row.value) - min) / (max - min);
    const y = height - pad - ratio * (height - pad * 2);

    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <svg class="mv-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend della misurazione">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="mv-spark-grid"></line>
      <line x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}" class="mv-spark-grid"></line>
      <polyline points="${points}" class="mv-spark-line"></polyline>
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
    <section class="mv-subhead">
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
    <article class="panel mv-protocol-card">
      <div class="panel-body">
        <div class="mv-protocol-card-head">
          <div>
            <h3>${escapeHtml(protocol.name)}</h3>
            <span>
              ${protocol.metrics.length
                ? `${protocol.metrics.length} ${protocol.metrics.length === 1 ? 'misurazione' : 'misurazioni'}`
                : 'Nessuna misurazione'}
            </span>
          </div>

          ${canWriteModule('visual')
            ? `<button class="icon-button mv-edit-button" type="button" data-edit-protocol="${protocol.id}" aria-label="Modifica protocollo">✎</button>`
            : ''}
        </div>

        <p>${escapeHtml(protocol.description || 'Nessuna descrizione.')}</p>

        <div class="mv-tags">
          ${protocol.domains.length
            ? protocol.domains.map(id => `<span>${escapeHtml(domainById(id)?.name || id)}</span>`).join('')
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
