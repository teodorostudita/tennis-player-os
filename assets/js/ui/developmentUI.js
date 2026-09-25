import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  loadDevelopmentIntoLocalStore,
  normalizeDevelopmentPayload,
  startDevelopmentCloudSync,
} from '../cloud/developmentCloud.js';
import { store } from '../data/store.js';
import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js';

const STAGES = [
  {
    id: 'learn',
    short: 'Imparare',
    label: 'Imparare',
    description: 'La competenza è in costruzione e compare in condizioni semplificate.',
  },
  {
    id: 'stabilize',
    short: 'Stabilizzare',
    label: 'Rendere stabile',
    description: 'La competenza viene ripetuta con continuità in situazioni controllate.',
  },
  {
    id: 'adapt',
    short: 'Adattare',
    label: 'Variare e adattare',
    description: 'La competenza resiste a variazioni di palla, spazio, tempo e situazione.',
  },
  {
    id: 'match',
    short: 'In partita',
    label: 'Usare in partita',
    description: 'La competenza viene riconosciuta e utilizzata autonomamente in competizione.',
  },
];

const TYPE_COPY = {
  technique: {
    tab: 'Tecnica',
    singular: 'tema tecnico',
    title: 'Sviluppo tecnico',
    eyebrow: 'Costruzione dei colpi',
    description: 'Costruisci e consolida i singoli colpi, misurandone la progressione fino al trasferimento in partita.',
    itemLabel: 'Colpo / competenza',
    areaLabel: 'Area tecnica',
    examples: 'Es. Kick serve, dritto su palla alta, risposta aggressiva sulla seconda',
  },
  tactics: {
    tab: 'Tattica',
    singular: 'tema tattico',
    title: 'Sviluppo tattico',
    eyebrow: 'Decisione e comportamento di gioco',
    description: 'Definisci temi tattici liberamente, collegali ai drills e misura se le decisioni stanno entrando nel tennis reale.',
    itemLabel: 'Tema tattico',
    areaLabel: 'Contesto / tag',
    examples: 'Es. Decision making sulla verticalizzazione, gestione della palla corta',
  },
};

const STATUS_OPTIONS = [
  ['planned', 'In programma'],
  ['active', 'Attivo'],
  ['consolidated', 'Consolidato'],
];

const PRIORITY_OPTIONS = [
  ['high', 'Alta'],
  ['medium', 'Media'],
  ['low', 'Bassa'],
];

const ui = {
  type: 'technique',
  selectedItemId: '',
};

let cloudReady = false;
let cloudSyncStarted = false;

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value = '') {
  if (!value) return '—';

  const key = String(value).slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return escapeHtml(value);

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function stageIndex(stageId) {
  const index = STAGES.findIndex(stage => stage.id === stageId);
  return index >= 0 ? index : 0;
}

function stageById(stageId) {
  return STAGES.find(stage => stage.id === stageId) || STAGES[0];
}

function statusLabel(status) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] || 'Attivo';
}

function priorityLabel(priority) {
  return PRIORITY_OPTIONS.find(([value]) => value === priority)?.[1] || 'Media';
}

function canWrite() {
  return canWriteModule('development');
}

function developmentState() {
  return normalizeDevelopmentPayload(store.getState().development);
}

function drillLibrary() {
  const library = store.getState().drills?.library;
  return Array.isArray(library) ? library : [];
}

function itemMeasurements(itemId) {
  return developmentState().measurementRecords
    .filter(record => record.itemId === itemId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function nextRoadmapOrder(type) {
  const orders = developmentState().items
    .filter(item => item.type === type)
    .map(item => Number(item.roadmapOrder || 0))
    .filter(value => Number.isFinite(value) && value > 0);

  return orders.length ? Math.max(...orders) + 1 : 1;
}

function defaultItem(type = ui.type) {
  const now = new Date().toISOString();

  return {
    id: makeId('development'),
    type,
    title: '',
    area: '',
    description: '',
    focus: '',
    stage: 'learn',
    status: 'active',
    priority: 'medium',
    roadmapOrder: nextRoadmapOrder(type),
    dueDate: '',
    linkedDrillIds: [],
    metrics: [],
    assessments: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

function developmentContentHost() {
  if (route() !== 'development') return null;

  const main = document.querySelector('#main-content');
  if (!main) return null;

  const contentButton = main.querySelector(
    '[data-module-workspace="content"].active',
  );
  if (!contentButton) return null;

  return main.querySelector('#module-workspace-host');
}

function setCloudStatus({ status, message = '' }) {
  if (route() !== 'development') return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Development → cloud…';
    indicator.title = 'Sincronizzazione Development in corso.';
  } else if (status === 'error') {
    indicator.textContent = 'Development · cache locale';
    indicator.title = message || 'Sincronizzazione Development non riuscita.';
  } else if (status === 'readonly') {
    indicator.textContent = 'Development cloud · sola lettura';
    indicator.title = 'Questo account può consultare Development ma non modificarlo.';
  } else {
    indicator.textContent = 'Development cloud ✓';
    indicator.title = 'Development sincronizzato con Supabase.';
  }
}

async function waitForAccess() {
  for (let i = 0; i < 80; i += 1) {
    if (getCurrentAccess().athleteId) return getCurrentAccess();
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }

  return getCurrentAccess();
}

async function setupCloud() {
  const access = await waitForAccess();
  if (!access.athleteId || !canReadModule('development')) return;

  const result = await loadDevelopmentIntoLocalStore({
    store,
    athleteId: access.athleteId,
    allowWrite: canWriteModule('development'),
  });

  cloudReady = true;

  if (
    canWriteModule('development')
    && !result?.cloudError
    && !cloudSyncStarted
  ) {
    cloudSyncStarted = true;
    startDevelopmentCloudSync({
      store,
      athleteId: access.athleteId,
      onStatus: setCloudStatus,
    });
  } else if (!canWriteModule('development')) {
    setCloudStatus({ status: 'readonly' });
  }
}

function sortedItems(type) {
  const statusOrder = {
    active: 0,
    planned: 1,
    consolidated: 2,
  };

  return developmentState().items
    .filter(item => item.type === type)
    .sort((a, b) => {
      const byStatus = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (byStatus) return byStatus;

      const byOrder = Number(a.roadmapOrder || 9999) - Number(b.roadmapOrder || 9999);
      if (byOrder) return byOrder;

      const dueA = a.dueDate || '9999-12-31';
      const dueB = b.dueDate || '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);

      return String(a.title || '').localeCompare(String(b.title || ''), 'it');
    });
}

function upcomingDueCount(items) {
  const today = todayKey();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 45);
  const thresholdKey = `${threshold.getFullYear()}-${String(threshold.getMonth() + 1).padStart(2, '0')}-${String(threshold.getDate()).padStart(2, '0')}`;

  return items.filter(item => (
    item.status !== 'consolidated'
    && item.dueDate
    && item.dueDate >= today
    && item.dueDate <= thresholdKey
  )).length;
}

function stageProgressMarkup(stageId, compact = false) {
  const currentIndex = stageIndex(stageId);

  return `
    <div class="dev-stage-progress ${compact ? 'compact' : ''}" aria-label="Progressione: ${escapeAttr(stageById(stageId).label)}">
      ${STAGES.map((stage, index) => `
        <div class="dev-stage-step ${index < currentIndex ? 'done' : ''} ${index === currentIndex ? 'current' : ''}">
          <span class="dev-stage-dot" aria-hidden="true"></span>
          <small>${escapeHtml(stage.short)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function stageLegendMarkup() {
  return `
    <section class="dev-stage-legend panel">
      <div class="dev-stage-legend-copy">
        <div class="eyebrow">Progressione comune</div>
        <strong>Ogni competenza punta naturalmente all’uso autonomo in partita.</strong>
      </div>
      <div class="dev-stage-legend-track">
        ${STAGES.map((stage, index) => `
          <div class="dev-stage-legend-item">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(stage.label)}</strong>
              <small>${escapeHtml(stage.description)}</small>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function cardFocus(item) {
  const focus = String(item.focus || '').trim();
  if (!focus) return '';
  const firstLine = focus.split(/\n+/).find(Boolean) || '';
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

function roadmapCard(item) {
  const records = itemMeasurements(item.id);
  const linkedCount = (item.linkedDrillIds || []).length;
  const stage = stageById(item.stage);

  return `
    <article class="panel dev-item-card" data-open-development-item="${escapeAttr(item.id)}">
      <button class="dev-item-card-main" type="button" data-open-development-item="${escapeAttr(item.id)}">
        <div class="dev-item-card-top">
          <span class="dev-order-badge">#${escapeHtml(item.roadmapOrder || '—')}</span>
          <span class="dev-status-badge status-${escapeAttr(item.status || 'active')}">${escapeHtml(statusLabel(item.status))}</span>
          <span class="dev-priority-badge priority-${escapeAttr(item.priority || 'medium')}">${escapeHtml(priorityLabel(item.priority))}</span>
        </div>
        <div class="dev-item-card-copy">
          ${item.area ? `<div class="eyebrow">${escapeHtml(item.area)}</div>` : ''}
          <h3>${escapeHtml(item.title || 'Senza titolo')}</h3>
          ${cardFocus(item) ? `<p>${escapeHtml(cardFocus(item))}</p>` : ''}
        </div>
        ${stageProgressMarkup(item.stage, true)}
        <div class="dev-item-card-footer">
          <span><strong>${escapeHtml(stage.short)}</strong></span>
          <span>${item.dueDate ? `Entro ${formatDate(item.dueDate)}` : 'Nessuna scadenza'}</span>
          <span>${linkedCount} drill</span>
          <span>${records.length} rilevaz.</span>
        </div>
      </button>
    </article>
  `;
}

function emptyState(type) {
  const copy = TYPE_COPY[type];

  return `
    <section class="panel dev-empty">
      <div class="dev-empty-icon">${type === 'technique' ? '◎' : '↗'}</div>
      <h3>Nessun ${escapeHtml(copy.singular)} ancora inserito</h3>
      <p>
        Crea un elemento Development, assegnagli un ordine di lavoro e segui la progressione
        da Imparare fino all’uso in partita.
      </p>
      ${canWrite() ? `
        <button class="button button-primary" type="button" id="dev-empty-add">
          + Nuovo ${escapeHtml(copy.singular)}
        </button>
      ` : ''}
    </section>
  `;
}

function renderRoadmap(type) {
  const copy = TYPE_COPY[type];
  const items = sortedItems(type);
  const active = items.filter(item => item.status === 'active').length;
  const matchReady = items.filter(item => item.stage === 'match').length;
  const measurements = items.reduce(
    (sum, item) => sum + itemMeasurements(item.id).length,
    0,
  );

  return `
    <section class="dev-area-head">
      <div>
        <div class="eyebrow">${escapeHtml(copy.eyebrow)}</div>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.description)}</p>
      </div>
      ${canWrite() ? `
        <button class="button button-primary" id="dev-add-item" type="button">
          + Nuovo ${escapeHtml(copy.singular)}
        </button>
      ` : ''}
    </section>

    <section class="dev-kpis">
      <div class="dev-kpi"><span>Totale</span><strong>${items.length}</strong></div>
      <div class="dev-kpi"><span>Attivi</span><strong>${active}</strong></div>
      <div class="dev-kpi"><span>In partita</span><strong>${matchReady}</strong></div>
      <div class="dev-kpi"><span>Entro 45 giorni</span><strong>${upcomingDueCount(items)}</strong></div>
      <div class="dev-kpi"><span>Rilevazioni</span><strong>${measurements}</strong></div>
    </section>

    ${items.length ? `
      <section class="dev-roadmap">
        <div class="dev-roadmap-head">
          <div>
            <h3>Roadmap</h3>
            <p>L’ordine indica cosa viene prima; la data, quando presente, indica entro quando vuoi portarlo avanti.</p>
          </div>
        </div>
        <div class="dev-roadmap-grid">
          ${items.map(roadmapCard).join('')}
        </div>
      </section>
    ` : emptyState(type)}
  `;
}

function linkedDrillsMarkup(item) {
  const byId = new Map(drillLibrary().map(drill => [drill.id, drill]));
  const linked = (item.linkedDrillIds || [])
    .map(id => byId.get(id))
    .filter(Boolean);

  if (!linked.length) {
    return '<div class="dev-inline-empty">Nessun drill collegato.</div>';
  }

  return `
    <div class="dev-linked-drills">
      ${linked.map(drill => `
        <div class="dev-linked-drill">
          <div>
            <strong>${escapeHtml(drill.title || 'Drill')}</strong>
            <span>${escapeHtml([drill.category, drill.focus].filter(Boolean).join(' · '))}</span>
          </div>
          <button class="button button-ghost dev-small-button" type="button" data-go-drills>Apri Drills</button>
        </div>
      `).join('')}
    </div>
  `;
}

function metricTarget(metric) {
  if (metric.target === '' || metric.target == null) return '—';

  const direction = metric.direction || '≥';
  return `${escapeHtml(direction)} ${escapeHtml(metric.target)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ''}`;
}

function latestMetricValue(item, metric) {
  const record = itemMeasurements(item.id)
    .find(entry => entry.values && entry.values[metric.id] !== '' && entry.values[metric.id] != null);

  if (!record) return '—';

  const value = record.values[metric.id];
  return `${escapeHtml(value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ''}`;
}

function metricsMarkup(item) {
  if (!(item.metrics || []).length) {
    return `
      <div class="dev-inline-empty padded">
        Nessun indicatore definito. Gli indicatori sono specifici di questo tema:
        per esempio “decisioni corrette %”, “target centrati %” o “errori forzati”.
      </div>
    `;
  }

  return `
    <div class="dev-metric-grid">
      ${(item.metrics || []).map(metric => `
        <div class="dev-metric-card">
          <div class="dev-metric-card-head">
            <div>
              <span>${escapeHtml(metric.name)}</span>
              <strong>${latestMetricValue(item, metric)}</strong>
            </div>
            ${canWrite() ? `
              <button class="dev-icon-action" type="button" data-delete-metric="${escapeAttr(metric.id)}" title="Elimina indicatore">×</button>
            ` : ''}
          </div>
          <small>Target ${metricTarget(metric)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function measurementHistoryMarkup(item) {
  const records = itemMeasurements(item.id);
  const metrics = item.metrics || [];

  if (!records.length) {
    return '<div class="dev-inline-empty padded">Nessuna rilevazione registrata.</div>';
  }

  return `
    <div class="dev-table-scroll">
      <table class="dev-table">
        <thead>
          <tr>
            <th>Data</th>
            ${metrics.map(metric => `<th>${escapeHtml(metric.name)}</th>`).join('')}
            <th>Note</th>
            ${canWrite() ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${records.map(record => `
            <tr>
              <td>${formatDate(record.date)}</td>
              ${metrics.map(metric => {
                const value = record.values?.[metric.id];
                return `<td>${value === '' || value == null ? '—' : `${escapeHtml(value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ''}`}</td>`;
              }).join('')}
              <td>${escapeHtml(record.note || '—')}</td>
              ${canWrite() ? `
                <td><button class="dev-delete-link" type="button" data-delete-measurement="${escapeAttr(record.id)}">Elimina</button></td>
              ` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function assessmentHistoryMarkup(item) {
  const assessments = [...(item.assessments || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  if (!assessments.length) {
    return '<div class="dev-inline-empty padded">Nessuna valutazione storica registrata.</div>';
  }

  return `
    <div class="dev-assessment-list">
      ${assessments.map(assessment => `
        <div class="dev-assessment-row">
          <div class="dev-assessment-date">${formatDate(assessment.date)}</div>
          <div>
            <strong>${escapeHtml(stageById(assessment.stage).label)}</strong>
            ${assessment.note ? `<p>${escapeHtml(assessment.note)}</p>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderItemDetail(item) {
  const copy = TYPE_COPY[item.type] || TYPE_COPY.technique;

  return `
    <section class="dev-detail" data-development-detail="${escapeAttr(item.id)}">
      <div class="dev-detail-top">
        <button class="button button-ghost" id="dev-back" type="button">← ${escapeHtml(copy.tab)}</button>
        <div class="dev-detail-actions">
          ${canWrite() ? `
            <button class="button button-ghost" id="dev-assess-item" type="button">Valuta progresso</button>
            <button class="button button-primary" id="dev-edit-item" type="button">Modifica</button>
          ` : ''}
        </div>
      </div>

      <section class="panel dev-detail-hero">
        <div class="dev-detail-hero-copy">
          <div class="dev-detail-badges">
            <span>${escapeHtml(copy.tab)}</span>
            <span class="status-${escapeAttr(item.status || 'active')}">${escapeHtml(statusLabel(item.status))}</span>
            <span class="priority-${escapeAttr(item.priority || 'medium')}">Priorità ${escapeHtml(priorityLabel(item.priority))}</span>
          </div>
          <h2>${escapeHtml(item.title || 'Senza titolo')}</h2>
          <p>${escapeHtml(item.description || 'Nessuna descrizione.')}</p>
          ${item.area ? `<small>${escapeHtml(item.area)}</small>` : ''}
        </div>
        <div class="dev-detail-stage">
          <span>Stadio attuale</span>
          <strong>${escapeHtml(stageById(item.stage).label)}</strong>
        </div>
      </section>

      <section class="panel dev-progress-panel">
        <div class="panel-header">
          <h3>Progressione</h3>
          <p>Il quarto stadio è sempre il trasferimento autonomo in partita.</p>
        </div>
        <div class="panel-body">
          ${stageProgressMarkup(item.stage)}
        </div>
      </section>

      <section class="dev-detail-columns">
        <article class="panel">
          <div class="panel-header">
            <h3>Roadmap</h3>
            <p>Dove si colloca questo lavoro nell’economia dello sviluppo.</p>
          </div>
          <div class="panel-body dev-roadmap-summary">
            <div><span>Ordine</span><strong>#${escapeHtml(item.roadmapOrder || '—')}</strong></div>
            <div><span>Scadenza</span><strong>${item.dueDate ? formatDate(item.dueDate) : 'Nessuna'}</strong></div>
            <div><span>Stato</span><strong>${escapeHtml(statusLabel(item.status))}</strong></div>
            <div><span>Priorità</span><strong>${escapeHtml(priorityLabel(item.priority))}</strong></div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h3>Focus attuale</h3>
            <p>Cosa stiamo cercando di costruire adesso.</p>
          </div>
          <div class="panel-body dev-free-text">
            ${item.focus
              ? `<p>${escapeHtml(item.focus).replace(/\n/g, '<br>')}</p>`
              : '<div class="dev-inline-empty">Focus non ancora definito.</div>'}
            ${item.notes
              ? `<div class="dev-note-block"><span>Note</span><p>${escapeHtml(item.notes).replace(/\n/g, '<br>')}</p></div>`
              : ''}
          </div>
        </article>
      </section>

      <section class="panel dev-drills-panel">
        <div class="panel-header dev-panel-header-row">
          <div>
            <h3>Drills collegati</h3>
            <p>Gli esercizi restano nella sezione Drills; Development conserva soltanto il collegamento.</p>
          </div>
          <button class="button button-ghost" type="button" data-go-drills>Apri Drills →</button>
        </div>
        <div class="panel-body">
          ${linkedDrillsMarkup(item)}
        </div>
      </section>

      <section class="panel dev-measurement-panel">
        <div class="panel-header dev-panel-header-row">
          <div>
            <h3>Misurazioni</h3>
            <p>Indicatori costruiti sul tema, con target e serie storica delle rilevazioni.</p>
          </div>
          ${canWrite() ? `
            <div class="dev-inline-actions">
              <button class="button button-ghost" id="dev-add-metric" type="button">+ Indicatore</button>
              <button class="button button-primary" id="dev-add-measurement" type="button" ${(item.metrics || []).length ? '' : 'disabled'}>+ Rilevazione</button>
            </div>
          ` : ''}
        </div>
        <div class="panel-body">
          ${metricsMarkup(item)}
          <div class="dev-measurement-history">
            <h4>Storico rilevazioni</h4>
            ${measurementHistoryMarkup(item)}
          </div>
        </div>
      </section>

      <section class="panel dev-assessment-panel">
        <div class="panel-header dev-panel-header-row">
          <div>
            <h3>Valutazioni di sviluppo</h3>
            <p>Quando cambia il giudizio sullo stadio, registriamo data e ragione.</p>
          </div>
          ${canWrite() ? '<button class="button button-primary" id="dev-assess-item-2" type="button">+ Valutazione</button>' : ''}
        </div>
        <div class="panel-body">
          ${assessmentHistoryMarkup(item)}
        </div>
      </section>
    </section>
  `;
}

function renderDevelopment() {
  const host = developmentContentHost();
  if (!host) return;

  const state = developmentState();
  const selected = ui.selectedItemId
    ? state.items.find(item => item.id === ui.selectedItemId)
    : null;

  host.innerHTML = `
    <div data-development-root>
      ${selected ? renderItemDetail(selected) : `
        <section class="dev-head">
          <div>
            <div class="eyebrow">Tecnica · Tattica · Progressione</div>
            <h2>Development</h2>
            <p>
              Una roadmap di ciò che stiamo costruendo: ordine di lavoro, stadio attuale,
              drills collegati, misurazioni e trasferimento in partita.
            </p>
          </div>
        </section>

        ${stageLegendMarkup()}

        <div class="dev-area-switch" role="tablist" aria-label="Area Development">
          ${Object.entries(TYPE_COPY).map(([type, copy]) => {
            const count = state.items.filter(item => item.type === type).length;
            return `
              <button
                class="dev-area-button ${ui.type === type ? 'active' : ''}"
                type="button"
                data-development-type="${type}"
              >
                ${escapeHtml(copy.tab)}
                <span>${count}</span>
              </button>
            `;
          }).join('')}
        </div>

        ${renderRoadmap(ui.type)}
      `}
    </div>
  `;

  if (selected) bindDetailEvents(selected);
  else bindRoadmapEvents();
}

function bindRoadmapEvents() {
  document.querySelectorAll('[data-development-type]').forEach(button => {
    button.addEventListener('click', () => {
      ui.type = button.dataset.developmentType;
      ui.selectedItemId = '';
      renderDevelopment();
    });
  });

  document.querySelector('#dev-add-item')?.addEventListener('click', () => {
    openItemDialog(null, ui.type);
  });

  document.querySelector('#dev-empty-add')?.addEventListener('click', () => {
    openItemDialog(null, ui.type);
  });

  document.querySelectorAll('[data-open-development-item]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      ui.selectedItemId = button.dataset.openDevelopmentItem;
      renderDevelopment();
    });
  });
}

function bindDetailEvents(item) {
  document.querySelector('#dev-back')?.addEventListener('click', () => {
    ui.selectedItemId = '';
    ui.type = item.type || 'technique';
    renderDevelopment();
  });

  document.querySelector('#dev-edit-item')?.addEventListener('click', () => {
    openItemDialog(item, item.type);
  });

  const assess = () => openAssessmentDialog(item);
  document.querySelector('#dev-assess-item')?.addEventListener('click', assess);
  document.querySelector('#dev-assess-item-2')?.addEventListener('click', assess);

  document.querySelector('#dev-add-metric')?.addEventListener('click', () => {
    openMetricDialog(item);
  });

  document.querySelector('#dev-add-measurement')?.addEventListener('click', () => {
    openMeasurementDialog(item);
  });

  document.querySelectorAll('[data-go-drills]').forEach(button => {
    button.addEventListener('click', () => {
      location.hash = '#/drills';
    });
  });

  document.querySelectorAll('[data-delete-metric]').forEach(button => {
    button.addEventListener('click', async () => {
      const metric = (item.metrics || []).find(entry => entry.id === button.dataset.deleteMetric);
      if (!metric) return;

      const confirmed = await showInAppConfirm(
        `Eliminare l’indicatore “${metric.name}”? Le vecchie rilevazioni resteranno archiviate ma il valore non sarà più mostrato.`,
        {
          title: 'Elimina indicatore',
          confirmLabel: 'Elimina',
          danger: true,
        },
      );

      if (!confirmed) return;

      store.update(state => {
        const development = normalizeDevelopmentPayload(state.development);
        const target = development.items.find(entry => entry.id === item.id);
        if (!target) return;
        target.metrics = (target.metrics || []).filter(entry => entry.id !== metric.id);
        target.updatedAt = new Date().toISOString();
        state.development = development;
      });

      renderDevelopment();
    });
  });

  document.querySelectorAll('[data-delete-measurement]').forEach(button => {
    button.addEventListener('click', async () => {
      const confirmed = await showInAppConfirm(
        'Eliminare questa rilevazione?',
        {
          title: 'Elimina rilevazione',
          confirmLabel: 'Elimina',
          danger: true,
        },
      );

      if (!confirmed) return;

      store.update(state => {
        const development = normalizeDevelopmentPayload(state.development);
        development.measurementRecords = development.measurementRecords.filter(
          record => record.id !== button.dataset.deleteMeasurement,
        );
        state.development = development;
      });

      renderDevelopment();
    });
  });
}

function openDialog(markup, id) {
  document.querySelector(`#${id}`)?.remove();

  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'planner-dialog dev-dialog';
  dialog.innerHTML = markup;
  document.body.appendChild(dialog);

  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();

  return dialog;
}

function selectOptions(options, selected) {
  return options.map(([value, label]) => `
    <option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>
  `).join('');
}

function stageOptions(selected) {
  return STAGES.map(stage => `
    <option value="${escapeAttr(stage.id)}" ${stage.id === selected ? 'selected' : ''}>${escapeHtml(stage.label)}</option>
  `).join('');
}

function drillChecklist(selectedIds = []) {
  const selected = new Set(selectedIds);
  const drills = [...drillLibrary()].sort((a, b) => {
    const fav = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (fav) return fav;
    return String(a.title || '').localeCompare(String(b.title || ''), 'it');
  });

  if (!drills.length) {
    return '<div class="dev-inline-empty">La libreria Drills è ancora vuota.</div>';
  }

  return `
    <div class="dev-drill-picker">
      ${drills.map(drill => `
        <label>
          <input
            type="checkbox"
            name="linkedDrills"
            value="${escapeAttr(drill.id)}"
            ${selected.has(drill.id) ? 'checked' : ''}
          />
          <span>
            <strong>${escapeHtml(drill.title || 'Drill')}</strong>
            <small>${escapeHtml([drill.category, drill.focus].filter(Boolean).join(' · '))}</small>
          </span>
        </label>
      `).join('')}
    </div>
  `;
}

function openItemDialog(item = null, type = ui.type) {
  if (!canWrite()) return;

  const value = item ? clone(item) : defaultItem(type);
  const copy = TYPE_COPY[value.type] || TYPE_COPY.technique;

  const dialog = openDialog(`
    <form method="dialog" id="dev-item-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">${escapeHtml(copy.tab)}</div>
          <h3>${item ? 'Modifica' : 'Nuovo'} ${escapeHtml(copy.singular)}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body dev-form-body">
        <div class="dev-form-section">
          <h4>Competenza</h4>
          <div class="form-grid">
            <div class="field full">
              <label>${escapeHtml(copy.itemLabel)}</label>
              <input
                name="title"
                value="${escapeAttr(value.title)}"
                placeholder="${escapeAttr(copy.examples)}"
                required
              />
            </div>
            <div class="field">
              <label>${escapeHtml(copy.areaLabel)}</label>
              <input name="area" value="${escapeAttr(value.area)}" placeholder="${value.type === 'technique' ? 'Servizio, dritto, risposta…' : 'Fondo, transizione, rete…'}" />
            </div>
            ${item ? `
              <div class="field">
                <label>Stadio attuale</label>
                <div class="dev-readonly-field">${escapeHtml(stageById(value.stage).label)} <small>Modifica con “Valuta progresso”</small></div>
              </div>
            ` : `
              <div class="field">
                <label>Stadio iniziale</label>
                <select name="stage">${stageOptions(value.stage)}</select>
              </div>
            `}
            <div class="field full">
              <label>Descrizione</label>
              <textarea name="description" placeholder="Che cosa vogliamo costruire e perché?">${escapeHtml(value.description)}</textarea>
            </div>
            <div class="field full">
              <label>Focus attuale</label>
              <textarea name="focus" placeholder="Uno o pochi punti concreti su cui si sta lavorando adesso.">${escapeHtml(value.focus)}</textarea>
            </div>
          </div>
        </div>

        <div class="dev-form-section">
          <h4>Roadmap</h4>
          <div class="form-grid">
            <div class="field">
              <label>Ordine di lavoro</label>
              <input name="roadmapOrder" type="number" min="1" step="1" value="${escapeAttr(value.roadmapOrder || 1)}" />
            </div>
            <div class="field">
              <label>Entro il</label>
              <input name="dueDate" type="date" value="${escapeAttr(value.dueDate)}" />
            </div>
            <div class="field">
              <label>Stato</label>
              <select name="status">${selectOptions(STATUS_OPTIONS, value.status || 'active')}</select>
            </div>
            <div class="field">
              <label>Priorità</label>
              <select name="priority">${selectOptions(PRIORITY_OPTIONS, value.priority || 'medium')}</select>
            </div>
          </div>
          <p class="dev-form-hint">
            Non esiste un “target stage”: il punto di arrivo naturale è sempre l’uso in partita.
            Ordine e data servono invece a pianificare quando affrontare questa competenza.
          </p>
        </div>

        <div class="dev-form-section">
          <h4>Drills collegati</h4>
          ${drillChecklist(value.linkedDrillIds)}
        </div>

        <div class="dev-form-section">
          <h4>Note</h4>
          <div class="field">
            <textarea name="notes" placeholder="Note libere per lo staff.">${escapeHtml(value.notes)}</textarea>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <div>
          ${item ? '<button class="button button-danger-ghost" id="dev-delete-item" type="button">Elimina</button>' : ''}
        </div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `, 'dev-item-dialog');

  const form = dialog.querySelector('form');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const now = new Date().toISOString();
    const isNew = !item;
    const stage = isNew ? String(data.get('stage') || 'learn') : value.stage;

    const record = {
      ...value,
      title: String(data.get('title') || '').trim(),
      area: String(data.get('area') || '').trim(),
      description: String(data.get('description') || '').trim(),
      focus: String(data.get('focus') || '').trim(),
      stage,
      status: String(data.get('status') || 'active'),
      priority: String(data.get('priority') || 'medium'),
      roadmapOrder: Math.max(1, Number(data.get('roadmapOrder') || 1)),
      dueDate: String(data.get('dueDate') || ''),
      linkedDrillIds: data.getAll('linkedDrills').map(String),
      notes: String(data.get('notes') || '').trim(),
      updatedAt: now,
    };

    if (isNew) {
      record.assessments = [{
        id: makeId('assessment'),
        date: todayKey(),
        stage,
        note: 'Valutazione iniziale',
        createdAt: now,
      }];
    }

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      const index = development.items.findIndex(entry => entry.id === record.id);

      if (index >= 0) development.items[index] = record;
      else development.items.push(record);

      state.development = development;
    });

    ui.type = record.type;
    ui.selectedItemId = record.id;
    dialog.close();
    renderDevelopment();
  });

  dialog.querySelector('#dev-delete-item')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm(
      `Eliminare “${item.title}” da Development? Verranno eliminate anche le rilevazioni collegate.`,
      {
        title: 'Elimina elemento Development',
        confirmLabel: 'Elimina',
        danger: true,
      },
    );

    if (!confirmed) return;

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      development.items = development.items.filter(entry => entry.id !== item.id);
      development.measurementRecords = development.measurementRecords.filter(
        record => record.itemId !== item.id,
      );
      state.development = development;
    });

    ui.selectedItemId = '';
    ui.type = item.type || ui.type;
    dialog.close();
    renderDevelopment();
  });
}

function openAssessmentDialog(item) {
  if (!canWrite()) return;

  const dialog = openDialog(`
    <form method="dialog" id="dev-assessment-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Valutazione di sviluppo</div>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label>Data</label>
            <input name="date" type="date" value="${todayKey()}" required />
          </div>
          <div class="field">
            <label>Stadio</label>
            <select name="stage">${stageOptions(item.stage)}</select>
          </div>
          <div class="field full">
            <label>Giudizio / evidenza</label>
            <textarea name="note" placeholder="Perché collochiamo oggi questa competenza a questo stadio?"></textarea>
          </div>
        </div>
        <div class="dev-stage-dialog-help">
          ${STAGES.map(stage => `
            <div class="${stage.id === item.stage ? 'current' : ''}">
              <strong>${escapeHtml(stage.label)}</strong>
              <span>${escapeHtml(stage.description)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Registra valutazione</button>
        </div>
      </div>
    </form>
  `, 'dev-assessment-dialog');

  const form = dialog.querySelector('form');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();
    const assessment = {
      id: makeId('assessment'),
      date: data.date,
      stage: data.stage,
      note: String(data.note || '').trim(),
      createdAt: now,
    };

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      const target = development.items.find(entry => entry.id === item.id);
      if (!target) return;

      target.stage = assessment.stage;
      target.assessments = Array.isArray(target.assessments)
        ? target.assessments
        : [];
      target.assessments.push(assessment);
      target.updatedAt = now;
      state.development = development;
    });

    dialog.close();
    renderDevelopment();
  });
}

function openMetricDialog(item) {
  if (!canWrite()) return;

  const dialog = openDialog(`
    <form method="dialog" id="dev-metric-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Misurazioni</div>
          <h3>Nuovo indicatore</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field full">
            <label>Nome indicatore</label>
            <input name="name" placeholder="Es. Decisioni corrette" required />
          </div>
          <div class="field">
            <label>Unità</label>
            <input name="unit" placeholder="%, n., km/h…" />
          </div>
          <div class="field">
            <label>Direzione target</label>
            <select name="direction">
              <option value="≥">≥ almeno</option>
              <option value="≤">≤ al massimo</option>
              <option value="=">= valore di riferimento</option>
            </select>
          </div>
          <div class="field">
            <label>Target</label>
            <input name="target" type="number" step="any" placeholder="facoltativo" />
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Aggiungi</button>
        </div>
      </div>
    </form>
  `, 'dev-metric-dialog');

  const form = dialog.querySelector('form');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    const metric = {
      id: makeId('metric'),
      name: String(data.name || '').trim(),
      unit: String(data.unit || '').trim(),
      direction: String(data.direction || '≥'),
      target: data.target === '' ? '' : Number(data.target),
    };

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      const target = development.items.find(entry => entry.id === item.id);
      if (!target) return;

      target.metrics = Array.isArray(target.metrics) ? target.metrics : [];
      target.metrics.push(metric);
      target.updatedAt = new Date().toISOString();
      state.development = development;
    });

    dialog.close();
    renderDevelopment();
  });
}

function openMeasurementDialog(item) {
  if (!canWrite()) return;

  const metrics = item.metrics || [];
  if (!metrics.length) {
    void showInAppAlert(
      'Definisci almeno un indicatore prima di registrare una rilevazione.',
      { title: 'Misurazioni Development' },
    );
    return;
  }

  const dialog = openDialog(`
    <form method="dialog" id="dev-measurement-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Rilevazione</div>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label>Data</label>
            <input name="date" type="date" value="${todayKey()}" required />
          </div>
          <div class="field full dev-metric-inputs">
            ${metrics.map(metric => `
              <label>
                <span>${escapeHtml(metric.name)}${metric.unit ? ` (${escapeHtml(metric.unit)})` : ''}</span>
                <input
                  name="metric_${escapeAttr(metric.id)}"
                  type="number"
                  step="any"
                  placeholder="—"
                />
                ${metric.target === '' || metric.target == null
                  ? ''
                  : `<small>Target ${metricTarget(metric)}</small>`}
              </label>
            `).join('')}
          </div>
          <div class="field full">
            <label>Note</label>
            <textarea name="note" placeholder="Condizioni, drill, osservazioni…"></textarea>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva rilevazione</button>
        </div>
      </div>
    </form>
  `, 'dev-measurement-dialog');

  const form = dialog.querySelector('form');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const values = {};

    metrics.forEach(metric => {
      const raw = String(data.get(`metric_${metric.id}`) ?? '').trim();
      values[metric.id] = raw === '' ? '' : Number(raw);
    });

    const record = {
      id: makeId('measurement'),
      itemId: item.id,
      date: String(data.get('date') || todayKey()),
      values,
      note: String(data.get('note') || '').trim(),
      createdAt: new Date().toISOString(),
    };

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      development.measurementRecords.push(record);
      const target = development.items.find(entry => entry.id === item.id);
      if (target) target.updatedAt = new Date().toISOString();
      state.development = development;
    });

    dialog.close();
    renderDevelopment();
  });
}

await setupCloud();

const main = document.querySelector('#main-content');

if (main) {
  const observer = new MutationObserver(() => {
    const host = developmentContentHost();
    if (
      host
      && !host.querySelector('[data-development-root]')
    ) {
      window.queueMicrotask(renderDevelopment);
    }
  });

  observer.observe(main, {
    childList: true,
    subtree: true,
  });
}

window.addEventListener('hashchange', () => {
  if (route() === 'development') {
    ui.selectedItemId = '';

    if (cloudReady) {
      setCloudStatus({
        status: canWrite() ? 'synced' : 'readonly',
      });
    }

    window.queueMicrotask(renderDevelopment);
  }
});

if (route() === 'development') {
  renderDevelopment();
}
