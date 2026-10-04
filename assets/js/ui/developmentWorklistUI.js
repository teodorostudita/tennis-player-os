import '../bootstrap.js?v=1.2.4';

import {
  canReadModule,
  canWriteModule,
} from '../cloud/access.js?v=1.2.4';

import {
  normalizeDevelopmentPayload,
} from '../cloud/developmentCloud.js?v=1.2.14';

import { store } from '../data/store.js?v=1.2.4';

import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js?v=1.2.4';

const STAGES = [
  ['learn', 'Imparare'],
  ['stabilize', 'Stabilizzare'],
  ['adapt', 'Variare / adattare'],
  ['match', 'Usare in partita'],
];

const STATUSES = [
  ['todo', 'To do'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['done', 'Done'],
];

const PRIORITIES = [
  ['high', 'Alta'],
  ['medium', 'Media'],
  ['low', 'Bassa'],
];

const TECHNIQUE_AREAS = [
  'Forehand',
  'Backhand',
  'Serve',
  'Return',
  'FH Volley',
  'BH Volley',
  'Smash',
  'BH slice',
  'FH slice',
  'Dropshot',
  'Drive Volley',
  'Footwork tecnico',
];

const ui = {
  active: false,
  view: 'open',
  type: 'all',
};

let ensureTimer = null;

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

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
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

function developmentState() {
  return normalizeDevelopmentPayload(store.getState().development);
}

function canWrite() {
  return canWriteModule('development');
}

function workItems() {
  return developmentState().workItems || [];
}

function stageLabel(value) {
  return STAGES.find(([id]) => id === value)?.[1] || 'Imparare';
}

function statusLabel(value) {
  return STATUSES.find(([id]) => id === value)?.[1] || 'To do';
}

function priorityLabel(value) {
  return PRIORITIES.find(([id]) => id === value)?.[1] || 'Media';
}

function typeLabel(value) {
  return value === 'tactics' ? 'Tattica' : 'Tecnica';
}

function selectOptions(options, selected) {
  return options.map(([value, label]) => `
    <option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>
      ${escapeHtml(label)}
    </option>
  `).join('');
}

function developmentRoot() {
  if (route() !== 'development') return null;
  if (!canReadModule('development')) return null;

  const main = document.querySelector('#main-content');
  if (!main) return null;

  const contentTab = main.querySelector(
    '[data-module-workspace="content"].active',
  );
  if (!contentTab) return null;

  return main.querySelector('[data-development-root]');
}

function areaSwitcher() {
  return developmentRoot()?.querySelector('.dev-area-switch') || null;
}

function openItems() {
  return workItems().filter(item => item.status !== 'done');
}

function lastWorked(item) {
  return [...(item.activityLog || [])]
    .filter(entry => entry.kind === 'work')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .at(0) || null;
}

function filteredItems() {
  const statusOrder = {
    active: 0,
    todo: 1,
    paused: 2,
    done: 3,
  };

  const priorityOrder = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return workItems()
    .filter(item => {
      if (ui.view === 'open' && item.status === 'done') return false;
      if (ui.view === 'done' && item.status !== 'done') return false;
      if (ui.type !== 'all' && item.type !== ui.type) return false;
      return true;
    })
    .sort((a, b) => {
      const byStatus =
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (byStatus) return byStatus;

      const byPriority =
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (byPriority) return byPriority;

      const areaA = clean(a.area);
      const areaB = clean(b.area);
      const byArea = areaA.localeCompare(areaB, 'it');
      if (byArea) return byArea;

      return clean(a.title).localeCompare(clean(b.title), 'it');
    });
}

function workCount(item) {
  return (item.activityLog || []).filter(entry => entry.kind === 'work').length;
}

function linkedDevelopmentTitle(item) {
  if (!item.linkedDevelopmentItemId) return '';

  const linked = developmentState().items.find(
    entry => entry.id === item.linkedDevelopmentItemId,
  );

  return linked?.title || '';
}

function injectWorklistTab() {
  const switcher = areaSwitcher();
  if (!switcher) return false;

  let button = switcher.querySelector('[data-development-worklist]');

  if (!button) {
    button = document.createElement('button');
    button.className = 'dev-area-button';
    button.type = 'button';
    button.dataset.developmentWorklist = 'true';
    switcher.appendChild(button);
  }

  button.innerHTML = `
    Worklist
    <span>${openItems().length}</span>
  `;

  if (ui.active) {
    switcher.querySelectorAll('.dev-area-button').forEach(item => {
      item.classList.toggle(
        'active',
        item === button,
      );
    });
  }

  return true;
}

function hideNativeRoadmap() {
  const root = developmentRoot();
  const switcher = areaSwitcher();
  if (!root || !switcher) return;

  let sibling = switcher.nextElementSibling;

  while (sibling) {
    const next = sibling.nextElementSibling;

    if (sibling.id !== 'development-worklist-host') {
      sibling.hidden = true;
      sibling.dataset.worklistNativeHidden = 'true';
    }

    sibling = next;
  }

  root.querySelector('.dev-stage-legend')?.setAttribute('hidden', '');
}

function renderWorklist() {
  if (!ui.active) return;

  const root = developmentRoot();
  const switcher = areaSwitcher();
  if (!root || !switcher) return;

  injectWorklistTab();
  hideNativeRoadmap();

  let host = root.querySelector('#development-worklist-host');

  if (!host) {
    host = document.createElement('section');
    host.id = 'development-worklist-host';
    switcher.insertAdjacentElement('afterend', host);
  }

  const items = filteredItems();
  const all = workItems();
  const activeCount = all.filter(item => item.status === 'active').length;
  const todoCount = all.filter(item => item.status === 'todo').length;
  const doneCount = all.filter(item => item.status === 'done').length;
  const last30Cutoff = new Date();
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);
  const cutoffKey = [
    last30Cutoff.getFullYear(),
    String(last30Cutoff.getMonth() + 1).padStart(2, '0'),
    String(last30Cutoff.getDate()).padStart(2, '0'),
  ].join('-');
  const recentWork = all.reduce(
    (sum, item) => sum + (item.activityLog || []).filter(
      entry => entry.kind === 'work' && entry.date >= cutoffKey,
    ).length,
    0,
  );

  host.innerHTML = `
    <section class="dev-worklist-head">
      <div>
        <div class="eyebrow">Development Worklist</div>
        <h2>Da fare · lavoro svolto · storico</h2>
        <p>
          Una lista operativa dei singoli focus tecnici e tattici. Ogni volta che ci lavori,
          registra la data e una nota: il punto resta tracciato anche quando viene completato.
        </p>
      </div>

      ${canWrite() ? `
        <button class="button button-primary" type="button" id="dev-worklist-add">
          + Nuovo focus
        </button>
      ` : ''}
    </section>

    <section class="dev-worklist-kpis">
      <div class="dev-kpi"><span>To do</span><strong>${todoCount}</strong></div>
      <div class="dev-kpi"><span>Active</span><strong>${activeCount}</strong></div>
      <div class="dev-kpi"><span>Done</span><strong>${doneCount}</strong></div>
      <div class="dev-kpi"><span>Lavori · 30 gg</span><strong>${recentWork}</strong></div>
    </section>

    <section class="panel dev-worklist-panel">
      <div class="dev-worklist-toolbar">
        <div class="dev-worklist-filter-group">
          ${[
            ['open', 'Aperti'],
            ['done', 'Completati'],
            ['all', 'Tutti'],
          ].map(([value, label]) => `
            <button
              class="dev-worklist-filter ${ui.view === value ? 'active' : ''}"
              type="button"
              data-worklist-view="${value}"
            >${escapeHtml(label)}</button>
          `).join('')}
        </div>

        <div class="dev-worklist-filter-group">
          ${[
            ['all', 'Tutto'],
            ['technique', 'Tecnica'],
            ['tactics', 'Tattica'],
          ].map(([value, label]) => `
            <button
              class="dev-worklist-filter ${ui.type === value ? 'active' : ''}"
              type="button"
              data-worklist-type="${value}"
            >${escapeHtml(label)}</button>
          `).join('')}
        </div>
      </div>

      ${items.length
        ? renderWorklistTable(items)
        : `
          <div class="dev-worklist-empty">
            <strong>Nessun focus in questa vista.</strong>
            <span>
              ${ui.view === 'done'
                ? 'Quando completi un focus, rimarrà qui con tutto il suo storico.'
                : 'Aggiungi il primo focus operativo da seguire nel tempo.'}
            </span>
          </div>
        `}
    </section>
  `;

  bindWorklistHost(host);
}

function renderWorklistTable(items) {
  return `
    <div class="dev-worklist-table-scroll">
      <table class="dev-worklist-table">
        <thead>
          <tr>
            <th>Area</th>
            <th>Focus</th>
            <th>Fase</th>
            <th>Priorità</th>
            <th>Ultimo lavoro</th>
            <th>Log</th>
            <th>Stato</th>
            ${canWrite() ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const last = lastWorked(item);
            return `
              <tr class="${item.status === 'done' ? 'is-done' : ''}">
                <td>
                  <span class="dev-worklist-type">${escapeHtml(typeLabel(item.type))}</span>
                  <strong>${escapeHtml(item.area || '—')}</strong>
                </td>
                <td>
                  <button
                    class="dev-worklist-title"
                    type="button"
                    data-worklist-open="${escapeAttr(item.id)}"
                  >${escapeHtml(item.title || 'Senza titolo')}</button>
                  ${linkedDevelopmentTitle(item)
                    ? `<small>↳ ${escapeHtml(linkedDevelopmentTitle(item))}</small>`
                    : ''}
                </td>
                <td>${escapeHtml(stageLabel(item.stage))}</td>
                <td>
                  <span class="dev-priority-badge priority-${escapeAttr(item.priority)}">
                    ${escapeHtml(priorityLabel(item.priority))}
                  </span>
                </td>
                <td>${last ? formatDate(last.date) : '—'}</td>
                <td>${workCount(item)}</td>
                <td>
                  <span class="dev-worklist-status status-${escapeAttr(item.status)}">
                    ${escapeHtml(statusLabel(item.status))}
                  </span>
                </td>
                ${canWrite() ? `
                  <td>
                    <div class="dev-worklist-row-actions">
                      ${item.status !== 'done'
                        ? `
                          <button
                            class="button button-ghost dev-small-button"
                            type="button"
                            data-worklist-log="${escapeAttr(item.id)}"
                          >Lavorato oggi</button>
                        `
                        : ''}
                      <button
                        class="dev-worklist-icon"
                        type="button"
                        data-worklist-toggle-done="${escapeAttr(item.id)}"
                        title="${item.status === 'done' ? 'Riapri' : 'Completa'}"
                      >${item.status === 'done' ? '↺' : '✓'}</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindWorklistHost(host) {
  host.querySelector('#dev-worklist-add')?.addEventListener('click', () => {
    openItemDialog();
  });

  host.querySelectorAll('[data-worklist-view]').forEach(button => {
    button.addEventListener('click', () => {
      ui.view = button.dataset.worklistView;
      renderWorklist();
    });
  });

  host.querySelectorAll('[data-worklist-type]').forEach(button => {
    button.addEventListener('click', () => {
      ui.type = button.dataset.worklistType;
      renderWorklist();
    });
  });

  host.querySelectorAll('[data-worklist-open]').forEach(button => {
    button.addEventListener('click', () => {
      openDetailDialog(button.dataset.worklistOpen);
    });
  });

  host.querySelectorAll('[data-worklist-log]').forEach(button => {
    button.addEventListener('click', () => {
      openWorkLogDialog(button.dataset.worklistLog);
    });
  });

  host.querySelectorAll('[data-worklist-toggle-done]').forEach(button => {
    button.addEventListener('click', () => {
      void toggleDone(button.dataset.worklistToggleDone);
    });
  });
}

function openDialog(markup, id, className = '') {
  document.querySelector(`#${id}`)?.remove();

  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = `planner-dialog dev-worklist-dialog ${className}`.trim();
  dialog.innerHTML = markup;
  document.body.appendChild(dialog);

  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
  }, { once: true });

  dialog.showModal();

  return dialog;
}

function blankItem() {
  const now = new Date().toISOString();

  return {
    id: makeId('dev-work'),
    type: 'technique',
    area: '',
    title: '',
    description: '',
    stage: 'learn',
    status: 'todo',
    priority: 'medium',
    linkedDevelopmentItemId: '',
    activityLog: [],
    createdAt: now,
    updatedAt: now,
    completedAt: '',
  };
}

function developmentLinkOptions(item) {
  const current = developmentState().items
    .filter(entry => !item.type || entry.type === item.type)
    .sort((a, b) => clean(a.title).localeCompare(clean(b.title), 'it'));

  return `
    <option value="">Nessun collegamento</option>
    ${current.map(entry => `
      <option
        value="${escapeAttr(entry.id)}"
        ${entry.id === item.linkedDevelopmentItemId ? 'selected' : ''}
      >${escapeHtml(
        [entry.area, entry.title].filter(Boolean).join(' · ')
      )}</option>
    `).join('')}
  `;
}

function openItemDialog(itemId = '') {
  if (!canWrite()) return;

  const existing = itemId
    ? workItems().find(entry => entry.id === itemId)
    : null;

  const value = clone(existing || blankItem());

  const dialog = openDialog(`
    <form method="dialog" id="dev-worklist-item-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Development Worklist</div>
          <h3>${existing ? 'Modifica focus' : 'Nuovo focus'}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body dev-form-body">
        <div class="form-grid">
          <div class="field">
            <label>Area</label>
            <input
              name="area"
              list="dev-worklist-area-options"
              value="${escapeAttr(value.area)}"
              placeholder="es. Serve"
              required
            />
            <datalist id="dev-worklist-area-options">
              ${TECHNIQUE_AREAS.map(area => `
                <option value="${escapeAttr(area)}"></option>
              `).join('')}
            </datalist>
          </div>

          <div class="field">
            <label>Tipo</label>
            <select name="type">
              ${selectOptions([
                ['technique', 'Tecnica'],
                ['tactics', 'Tattica'],
              ], value.type)}
            </select>
          </div>

          <div class="field full">
            <label>Focus</label>
            <input
              name="title"
              value="${escapeAttr(value.title)}"
              placeholder="es. Hip first"
              required
            />
          </div>

          <div class="field full">
            <label>Descrizione / cue</label>
            <textarea
              name="description"
              placeholder="Cosa vogliamo correggere o consolidare?"
            >${escapeHtml(value.description)}</textarea>
          </div>

          <div class="field">
            <label>Fase</label>
            <select name="stage">${selectOptions(STAGES, value.stage)}</select>
          </div>

          <div class="field">
            <label>Stato</label>
            <select name="status">${selectOptions(STATUSES, value.status)}</select>
          </div>

          <div class="field">
            <label>Priorità</label>
            <select name="priority">${selectOptions(PRIORITIES, value.priority)}</select>
          </div>

          <div class="field">
            <label>Tema Development collegato</label>
            <select name="linkedDevelopmentItemId">
              ${developmentLinkOptions(value)}
            </select>
          </div>
        </div>

        <p class="dev-form-hint">
          Il collegamento al quadro Development è opzionale: la Worklist può contenere
          anche micro-focus indipendenti, come un singolo cue tecnico.
        </p>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger-ghost" id="dev-worklist-delete" type="button">Elimina</button>'
            : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `, 'dev-worklist-item-dialog');

  const form = dialog.querySelector('form');
  const typeSelect = form.elements.type;
  const linkedSelect = form.elements.linkedDevelopmentItemId;

  typeSelect.addEventListener('change', () => {
    const temp = {
      ...value,
      type: typeSelect.value,
      linkedDevelopmentItemId: linkedSelect.value,
    };

    linkedSelect.innerHTML = developmentLinkOptions(temp);

    if (
      temp.linkedDevelopmentItemId
      && ![...linkedSelect.options].some(
        option => option.value === temp.linkedDevelopmentItemId,
      )
    ) {
      linkedSelect.value = '';
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const now = new Date().toISOString();
    const previousStatus = value.status;
    const previousStage = value.stage;

    const next = {
      ...value,
      type: String(data.get('type') || 'technique'),
      area: clean(data.get('area')),
      title: clean(data.get('title')),
      description: clean(data.get('description')),
      stage: String(data.get('stage') || 'learn'),
      status: String(data.get('status') || 'todo'),
      priority: String(data.get('priority') || 'medium'),
      linkedDevelopmentItemId: String(
        data.get('linkedDevelopmentItemId') || '',
      ),
      activityLog: Array.isArray(value.activityLog)
        ? value.activityLog
        : [],
      updatedAt: now,
    };

    if (!existing) {
      next.activityLog.push({
        id: makeId('dev-log'),
        kind: 'created',
        date: todayKey(),
        note: 'Focus creato',
        stage: next.stage,
        status: next.status,
        createdAt: now,
      });
    }

    if (existing && next.stage !== previousStage) {
      next.activityLog.push({
        id: makeId('dev-log'),
        kind: 'stage',
        date: todayKey(),
        note: `${stageLabel(previousStage)} → ${stageLabel(next.stage)}`,
        stage: next.stage,
        status: next.status,
        createdAt: now,
      });
    }

    if (existing && next.status !== previousStatus) {
      next.activityLog.push({
        id: makeId('dev-log'),
        kind: 'status',
        date: todayKey(),
        note: `${statusLabel(previousStatus)} → ${statusLabel(next.status)}`,
        stage: next.stage,
        status: next.status,
        createdAt: now,
      });
    }

    if (next.status === 'done' && previousStatus !== 'done') {
      next.completedAt = now;
    } else if (next.status !== 'done') {
      next.completedAt = '';
    }

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      const index = development.workItems.findIndex(
        entry => entry.id === next.id,
      );

      if (index >= 0) development.workItems[index] = next;
      else development.workItems.push(next);

      state.development = development;
    });

    dialog.close();
    renderWorklist();
  });

  dialog.querySelector('#dev-worklist-delete')?.addEventListener(
    'click',
    async () => {
      const confirmed = await showInAppConfirm(
        `Eliminare “${value.title}” e tutto il suo storico?`,
        {
          title: 'Elimina focus',
          confirmLabel: 'Elimina',
          danger: true,
        },
      );

      if (!confirmed) return;

      store.update(state => {
        const development = normalizeDevelopmentPayload(state.development);
        development.workItems = development.workItems.filter(
          entry => entry.id !== value.id,
        );
        state.development = development;
      });

      dialog.close();
      renderWorklist();
    },
  );
}

function openWorkLogDialog(itemId) {
  if (!canWrite()) return;

  const item = workItems().find(entry => entry.id === itemId);
  if (!item) return;

  const dialog = openDialog(`
    <form method="dialog" id="dev-worklist-log-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">${escapeHtml(item.area || typeLabel(item.type))}</div>
          <h3>Lavorato su: ${escapeHtml(item.title)}</h3>
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
            <label>Fase dopo il lavoro</label>
            <select name="stage">${selectOptions(STAGES, item.stage)}</select>
          </div>

          <div class="field">
            <label>Stato dopo il lavoro</label>
            <select name="status">${selectOptions(STATUSES, item.status)}</select>
          </div>

          <div class="field full">
            <label>Cosa abbiamo fatto / osservato</label>
            <textarea
              name="note"
              placeholder="es. lavoro specifico 20 min; stabile in esercizio ma intermittente nei punti…"
              required
            ></textarea>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Registra lavoro</button>
        </div>
      </div>
    </form>
  `, 'dev-worklist-log-dialog');

  const form = dialog.querySelector('form');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const now = new Date().toISOString();
    const nextStage = String(data.get('stage') || item.stage);
    const nextStatus = String(data.get('status') || item.status);

    store.update(state => {
      const development = normalizeDevelopmentPayload(state.development);
      const target = development.workItems.find(entry => entry.id === item.id);
      if (!target) return;

      target.activityLog = Array.isArray(target.activityLog)
        ? target.activityLog
        : [];

      target.activityLog.push({
        id: makeId('dev-log'),
        kind: 'work',
        date: String(data.get('date') || todayKey()),
        note: clean(data.get('note')),
        stage: nextStage,
        status: nextStatus,
        createdAt: now,
      });

      target.stage = nextStage;
      target.status = nextStatus;
      target.updatedAt = now;

      if (nextStatus === 'done') {
        target.completedAt = target.completedAt || now;
      } else {
        target.completedAt = '';
      }

      state.development = development;
    });

    dialog.close();
    renderWorklist();
  });
}

function activityLabel(kind) {
  const labels = {
    created: 'Creato',
    work: 'Lavoro',
    stage: 'Fase',
    status: 'Stato',
    note: 'Nota',
  };

  return labels[kind] || 'Aggiornamento';
}

function openDetailDialog(itemId) {
  const item = workItems().find(entry => entry.id === itemId);
  if (!item) return;

  const log = [...(item.activityLog || [])]
    .sort((a, b) => (
      String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    ));

  const linkedTitle = linkedDevelopmentTitle(item);
  const last = lastWorked(item);

  const dialog = openDialog(`
    <div class="dialog-head">
      <div>
        <div class="eyebrow">${escapeHtml(
          [typeLabel(item.type), item.area].filter(Boolean).join(' · ')
        )}</div>
        <h3>${escapeHtml(item.title || 'Focus')}</h3>
      </div>
      <button class="dialog-close" type="button" data-dialog-close>×</button>
    </div>

    <div class="dialog-body dev-worklist-detail">
      <section class="dev-worklist-detail-summary">
        <div>
          <span>Stato</span>
          <strong>${escapeHtml(statusLabel(item.status))}</strong>
        </div>
        <div>
          <span>Fase</span>
          <strong>${escapeHtml(stageLabel(item.stage))}</strong>
        </div>
        <div>
          <span>Priorità</span>
          <strong>${escapeHtml(priorityLabel(item.priority))}</strong>
        </div>
        <div>
          <span>Ultimo lavoro</span>
          <strong>${last ? formatDate(last.date) : '—'}</strong>
        </div>
      </section>

      ${item.description ? `
        <section class="dev-worklist-description">
          <strong>Focus / cue</strong>
          <p>${escapeHtml(item.description)}</p>
        </section>
      ` : ''}

      ${linkedTitle ? `
        <section class="dev-worklist-linked">
          <span>Quadro Development collegato</span>
          <strong>${escapeHtml(linkedTitle)}</strong>
        </section>
      ` : ''}

      <section class="dev-worklist-history-head">
        <div>
          <h4>Timeline</h4>
          <p>Lo storico resta disponibile anche dopo il completamento.</p>
        </div>
        ${canWrite() && item.status !== 'done'
          ? `
            <button
              class="button button-primary"
              type="button"
              data-detail-log="${escapeAttr(item.id)}"
            >+ Lavorato oggi</button>
          `
          : ''}
      </section>

      ${log.length ? `
        <div class="dev-worklist-timeline">
          ${log.map(entry => `
            <article class="dev-worklist-log-entry kind-${escapeAttr(entry.kind)}">
              <time>${formatDate(entry.date)}</time>
              <div>
                <div class="dev-worklist-log-meta">
                  <strong>${escapeHtml(activityLabel(entry.kind))}</strong>
                  ${entry.stage
                    ? `<span>${escapeHtml(stageLabel(entry.stage))}</span>`
                    : ''}
                  ${entry.status
                    ? `<span>${escapeHtml(statusLabel(entry.status))}</span>`
                    : ''}
                </div>
                <p>${escapeHtml(entry.note || '—')}</p>
              </div>
            </article>
          `).join('')}
        </div>
      ` : `
        <div class="dev-worklist-empty">
          <strong>Nessuno storico.</strong>
          <span>Registra il primo lavoro svolto su questo focus.</span>
        </div>
      `}
    </div>

    <div class="dialog-actions">
      <div>
        ${canWrite() ? `
          <button
            class="button button-ghost"
            type="button"
            data-detail-toggle="${escapeAttr(item.id)}"
          >${item.status === 'done' ? 'Riapri focus' : 'Segna Done'}</button>
        ` : ''}
      </div>
      <div class="dialog-save-actions">
        ${canWrite() ? `
          <button
            class="button button-ghost"
            type="button"
            data-detail-edit="${escapeAttr(item.id)}"
          >Modifica</button>
        ` : ''}
        <button class="button button-primary" type="button" data-dialog-close>Chiudi</button>
      </div>
    </div>
  `, 'dev-worklist-detail-dialog', 'dev-worklist-detail-dialog');

  dialog.querySelector('[data-detail-log]')?.addEventListener('click', () => {
    dialog.close();
    openWorkLogDialog(item.id);
  });

  dialog.querySelector('[data-detail-edit]')?.addEventListener('click', () => {
    dialog.close();
    openItemDialog(item.id);
  });

  dialog.querySelector('[data-detail-toggle]')?.addEventListener('click', () => {
    dialog.close();
    void toggleDone(item.id);
  });
}

async function toggleDone(itemId) {
  if (!canWrite()) return;

  const item = workItems().find(entry => entry.id === itemId);
  if (!item) return;

  const reopening = item.status === 'done';

  if (!reopening) {
    const confirmed = await showInAppConfirm(
      `Segnare “${item.title}” come completato? Lo storico resterà consultabile.`,
      {
        title: 'Completa focus',
        confirmLabel: 'Segna Done',
      },
    );

    if (!confirmed) return;
  }

  const now = new Date().toISOString();
  const nextStatus = reopening ? 'active' : 'done';

  store.update(state => {
    const development = normalizeDevelopmentPayload(state.development);
    const target = development.workItems.find(entry => entry.id === item.id);
    if (!target) return;

    target.activityLog = Array.isArray(target.activityLog)
      ? target.activityLog
      : [];

    target.activityLog.push({
      id: makeId('dev-log'),
      kind: 'status',
      date: todayKey(),
      note: reopening
        ? 'Focus riaperto'
        : 'Focus completato',
      stage: target.stage,
      status: nextStatus,
      createdAt: now,
    });

    target.status = nextStatus;
    target.completedAt = reopening ? '' : now;
    target.updatedAt = now;
    state.development = development;
  });

  if (!reopening && ui.view === 'open') {
    renderWorklist();
  } else {
    renderWorklist();
  }
}

function activateWorklist() {
  ui.active = true;
  renderWorklist();
}

function deactivateWorklist() {
  ui.active = false;
}

function scheduleEnsure(attempts = 40) {
  window.clearTimeout(ensureTimer);

  const tryEnsure = remaining => {
    if (route() !== 'development') return;

    if (injectWorklistTab()) {
      if (ui.active) renderWorklist();
      return;
    }

    if (remaining <= 0) return;

    ensureTimer = window.setTimeout(
      () => tryEnsure(remaining - 1),
      100,
    );
  };

  ensureTimer = window.setTimeout(() => tryEnsure(attempts), 0);
}

document.addEventListener('click', event => {
  const worklistButton = event.target?.closest?.('[data-development-worklist]');
  if (worklistButton) {
    event.preventDefault();
    activateWorklist();
    return;
  }

  if (event.target?.closest?.('[data-development-type]')) {
    deactivateWorklist();
    window.setTimeout(() => scheduleEnsure(8), 0);
    return;
  }

  if (
    event.target?.closest?.('[data-module-workspace="content"]')
    || event.target?.closest?.('[data-route="development"]')
  ) {
    window.setTimeout(() => scheduleEnsure(20), 0);
  }
}, true);

window.addEventListener('hashchange', () => {
  if (route() !== 'development') {
    deactivateWorklist();
    return;
  }

  scheduleEnsure(40);
});

store.subscribe(() => {
  if (route() !== 'development') return;

  if (ui.active) {
    window.queueMicrotask(renderWorklist);
  } else {
    window.setTimeout(() => scheduleEnsure(6), 0);
  }
});

scheduleEnsure(60);
