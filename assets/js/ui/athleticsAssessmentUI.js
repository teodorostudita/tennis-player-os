import '../bootstrap.js?v=1.2.4';

import { canReadModule, canWriteModule, getCurrentAccess } from '../cloud/access.js?v=1.2.4';
import {
  currentAthleticsEvaluatorName,
  deleteAthleticsAssessmentEntry,
  loadAthleticsAssessmentEntries,
  saveAthleticsAssessmentEntry,
} from '../cloud/athleticsAssessmentCloud.js?v=1.2.4';
import { showInAppAlert, showInAppConfirm } from './inAppMessages.js?v=1.2.4';

const GROUPS = [
  {
    id: 'physical',
    title: 'Qualità fisiche',
    subtitle: 'Fotografia sintetica delle capacità fisiche generali.',
    metrics: [
      { key: 'endurance', label: 'Resistenza' },
      { key: 'elasticity-prevention', label: 'Elasticità' },
      {
        key: 'power',
        label: 'Potenza',
        legacyComponents: [{ key: 'lower', label: 'L' }, { key: 'upper', label: 'U' }],
      },
      {
        key: 'explosiveness',
        label: 'Esplosività',
        legacyComponents: [{ key: 'lower', label: 'L' }, { key: 'upper', label: 'U' }],
      },
      { key: 'sprint-speed', label: 'Velocità di scatto' },
      { key: 'core-stability', label: 'Core Stability' },
    ],
  },
  {
    id: 'coordination',
    title: 'Coordinazione & Movimento',
    subtitle: 'Controllo motorio, qualità degli spostamenti e reattività dinamica.',
    metrics: [
      { key: 'balance-proprioception', label: 'Equilibrio' },
      { key: 'footwork', label: 'Footwork' },
      { key: 'static-dynamic-coordination', label: 'Coordinazione' },
      { key: 'reactivity', label: 'Reattività in movimento' },
    ],
  },
];

const METRICS = GROUPS.flatMap(group => group.metrics.map(metric => ({
  ...metric,
  groupId: group.id,
  groupTitle: group.title,
  components: metric.components || [{ key: 'main', label: '' }],
})));

let cache = { athleteId: '', entries: [], evaluatorName: '', loading: false, error: '' };
let queuePending = false;
let testBridgePending = false;
let pendingAssessmentMetricKey = '';
let pendingTestId = '';
let lastTestLinkFingerprint = '';

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value = '') {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function formatChartDate(value = '') {
  if (!value) return '';
  const [y, m] = String(value).split('-').map(Number);
  if (!y || !m) return value;
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace('.', ',');
}

function metricByKey(metricKey) {
  return METRICS.find(metric => metric.key === metricKey) || null;
}

function trainingTests() {
  const tests = store.getState().training?.tests;
  return Array.isArray(tests) ? tests : [];
}

function linkedTestForMetric(metricKey) {
  return trainingTests().find(test => clean(test.assessmentMetricKey) === metricKey) || null;
}

function linkedMetricForTest(test) {
  return metricByKey(clean(test?.assessmentMetricKey));
}

function testLinkFingerprint(state = store.getState()) {
  const tests = Array.isArray(state.training?.tests) ? state.training.tests : [];
  return JSON.stringify(tests.map(test => [
    clean(test.id),
    clean(test.assessmentMetricKey),
    clean(test.name),
  ]));
}

function setMetricTestLink(metricKey, testId = '') {
  const normalizedMetricKey = metricByKey(metricKey)?.key || '';
  const normalizedTestId = clean(testId);

  store.update(state => {
    const tests = Array.isArray(state.training?.tests) ? state.training.tests : [];

    for (const test of tests) {
      if (clean(test.assessmentMetricKey) === normalizedMetricKey) {
        test.assessmentMetricKey = '';
      }
    }

    if (!normalizedMetricKey || !normalizedTestId) return;

    const selected = tests.find(test => clean(test.id) === normalizedTestId);
    if (selected) selected.assessmentMetricKey = normalizedMetricKey;
  });
}

function setTestMetricLink(testId, metricKey = '') {
  const normalizedTestId = clean(testId);
  const normalizedMetricKey = metricByKey(metricKey)?.key || '';

  store.update(state => {
    const tests = Array.isArray(state.training?.tests) ? state.training.tests : [];
    const selected = tests.find(test => clean(test.id) === normalizedTestId);
    if (!selected) return;

    if (normalizedMetricKey) {
      for (const test of tests) {
        if (
          test !== selected
          && clean(test.assessmentMetricKey) === normalizedMetricKey
        ) {
          test.assessmentMetricKey = '';
        }
      }
    }

    selected.assessmentMetricKey = normalizedMetricKey;
  });
}

function entriesFor(metricKey, componentKey = '') {
  return cache.entries
    .filter(entry => entry.metricKey === metricKey && (!componentKey || entry.componentKey === componentKey))
    .sort((a, b) => String(a.assessedOn).localeCompare(String(b.assessedOn)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function latestEntry(metricKey, componentKey = 'main') { return entriesFor(metricKey, componentKey).at(-1) || null; }
function previousEntry(metricKey, componentKey = 'main') { return entriesFor(metricKey, componentKey).at(-2) || null; }

function componentTrend(metricKey, componentKey) {
  const latest = latestEntry(metricKey, componentKey);
  const previous = previousEntry(metricKey, componentKey);
  if (!latest || !previous) return { symbol: '•', className: 'neutral' };
  const delta = Number(latest.value) - Number(previous.value);
  if (Math.abs(delta) < 0.001) return { symbol: '→', className: 'neutral' };
  return delta > 0 ? { symbol: '↑', className: 'positive' } : { symbol: '↓', className: 'negative' };
}

function metricCurrent(metric) {
  const components = Array.isArray(metric?.components) && metric.components.length
    ? metric.components
    : [{ key: 'main', label: '' }];

  return components.map(component => ({
    component,
    latest: latestEntry(metric.key, component.key),
    trend: componentTrend(metric.key, component.key),
  }));
}

function latestMetricDate(metric) {
  return metricCurrent(metric).map(item => item.latest?.assessedOn || '').sort().at(-1) || '';
}

async function ensureData() {
  const access = getCurrentAccess();
  const athleteId = clean(access.athleteId);
  if (!athleteId || !canReadModule('training') || cache.loading || (cache.athleteId === athleteId && !cache.error)) return;

  cache.loading = true;
  cache.error = '';
  try {
    const [entries, evaluatorName] = await Promise.all([
      loadAthleticsAssessmentEntries(athleteId),
      currentAthleticsEvaluatorName(athleteId),
    ]);
    cache = { athleteId, entries, evaluatorName, loading: false, error: '' };
  } catch (error) {
    console.warn('Athletics assessment unavailable.', error);
    cache = { athleteId, entries: [], evaluatorName: '', loading: false, error: error?.message || 'Valutazione Athletics non disponibile.' };
  }
}

function goalsSurface() {
  if (route() !== 'training') return null;
  const content = document.querySelector('#training-section-content');
  return content?.querySelector('.training-goal-columns') ? content : null;
}

async function ensureAssessmentSurface() {
  queuePending = false;
  const content = goalsSurface();
  if (!content) return;

  await ensureData();
  content.querySelector('#athletics-current-assessment')?.remove();

  const section = document.createElement('section');
  section.id = 'athletics-current-assessment';
  section.className = 'athletics-assessment-section';
  section.innerHTML = renderAssessment();

  const goalDialog = content.querySelector('#training-goal-dialog');
  if (goalDialog) content.insertBefore(section, goalDialog);
  else content.appendChild(section);

  bindAssessment(section);

  if (pendingAssessmentMetricKey) {
    const metricKey = pendingAssessmentMetricKey;
    pendingAssessmentMetricKey = '';
    window.setTimeout(() => openDetail(metricKey), 0);
  }
}

function queueEnsure() {
  if (queuePending) return;
  queuePending = true;
  queueMicrotask(() => window.setTimeout(() => void ensureAssessmentSurface(), 0));
}

function renderAssessment() {
  return `
    <div class="athletics-assessment-head">
      <div>
        <div class="eyebrow">Current Athletic Assessment</div>
        <h2>Valutazione attuale</h2>
        <p>Giudizio sintetico del preparatore, separato dai Test e dagli Obiettivi. Ogni capacità può essere collegata a un solo test Athletics: il link è bidirezionale, ma valori e scale restano indipendenti.</p>
      </div>
      <span class="athletics-assessment-scale">Scala 1–10</span>
    </div>
    ${cache.error ? `<div class="access-info athletics-assessment-error">${escapeHtml(cache.error)}</div>` : ''}
    <div class="athletics-assessment-grid">${GROUPS.map(renderGroup).join('')}</div>
    <p class="athletics-assessment-footnote">Il valore corrente è sempre l'ultima valutazione disponibile. Il test collegato è solo un riferimento: nessun valore viene importato o convertito tra la scala 1–10 e la scala del test.</p>
    <dialog class="planner-dialog athletics-assessment-dialog" id="athletics-assessment-entry-dialog"></dialog>
    <dialog class="planner-dialog athletics-assessment-dialog athletics-assessment-detail-dialog" id="athletics-assessment-detail-dialog"></dialog>
  `;
}

function renderGroup(group) {
  return `
    <article class="panel athletics-assessment-card">
      <div class="panel-header"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.subtitle)}</p></div>
      <div class="athletics-assessment-table">
        <div class="athletics-assessment-table-head"><span>Capacità</span><span>Attuale</span><span>Trend</span><span>Test collegato</span><span>Agg.</span><span></span></div>
        ${group.metrics.map(renderMetricRow).join('')}
      </div>
    </article>`;
}

function linkedTestMarkup(metric) {
  const test = linkedTestForMetric(metric.key);

  if (test) {
    return `
      <span class="athletics-assessment-test-cell linked">
        <button
          type="button"
          class="athletics-assessment-test-chip"
          data-assessment-test-open="${escapeAttr(test.id)}"
          title="Apri ${escapeAttr(test.name || 'test')}"
        >
          ${escapeHtml(test.name || 'Test')}
        </button>
        ${canWriteModule('training') ? `
          <button
            type="button"
            class="athletics-assessment-test-edit"
            data-assessment-link="${escapeAttr(metric.key)}"
            title="Cambia test collegato"
            aria-label="Cambia test collegato"
          >↔</button>
        ` : ''}
      </span>`;
  }

  return canWriteModule('training')
    ? `<button type="button" class="athletics-assessment-test-empty" data-assessment-link="${escapeAttr(metric.key)}">+ collega test</button>`
    : '<span class="athletics-assessment-test-none">—</span>';
}

function renderMetricRow(metric) {
  const current = metricCurrent(metric);
  const hasAny = current.some(item => item.latest);
  const currentText = hasAny
    ? current.map(item => item.component.label ? `${item.component.label}: ${item.latest ? formatValue(item.latest.value) : '—'}` : formatValue(item.latest?.value)).join(' · ')
    : '—';
  const trendText = hasAny
    ? current.map(item => `<span class="${item.trend.className}">${escapeHtml(item.component.label ? `${item.component.label} ` : '')}${item.trend.symbol}</span>`).join(' ')
    : '<span class="neutral">—</span>';

  return `
    <div class="athletics-assessment-row" role="button" tabindex="0" data-assessment-detail="${escapeAttr(metric.key)}">
      <span class="athletics-assessment-metric">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(currentText)}</strong>
      <span class="athletics-assessment-trend">${trendText}</span>
      <span>${linkedTestMarkup(metric)}</span>
      <time>${escapeHtml(formatDate(latestMetricDate(metric)))}</time>
      <span class="athletics-assessment-row-action">
        ${canWriteModule('training')
          ? `<button type="button" class="button button-ghost athletics-assessment-rate" data-assessment-rate="${escapeAttr(metric.key)}">Valuta</button>`
          : '<span>Dettaglio →</span>'}
      </span>
    </div>`;
}

function bindAssessment(section) {
  section.querySelectorAll('[data-assessment-detail]').forEach(row => {
    const open = event => {
      if (event?.target?.closest?.('[data-assessment-rate], [data-assessment-link], [data-assessment-test-open]')) return;
      openDetail(row.dataset.assessmentDetail);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); }
    });
  });

  section.querySelectorAll('[data-assessment-rate]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openEntryDialog(button.dataset.assessmentRate);
    });
  });

  section.querySelectorAll('[data-assessment-link]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openMetricTestLinkDialog(button.dataset.assessmentLink);
    });
  });

  section.querySelectorAll('[data-assessment-test-open]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openLinkedTest(button.dataset.assessmentTestOpen);
    });
  });
}

function renderValueInputs(metric, values = {}) {
  return metric.components.map(component => `
    <div class="field">
      <label>${escapeHtml(component.label ? `${metric.label} · ${component.label}` : metric.label)}</label>
      <input type="number" min="1" max="10" step="0.5" name="value-${escapeAttr(component.key)}" value="${escapeAttr(values[component.key] ?? '')}" required />
    </div>`).join('');
}

function openEntryDialog(metricKey, date = todayKey()) {
  if (!canWriteModule('training')) return;
  const metric = metricByKey(metricKey);
  const dialog = document.querySelector('#athletics-assessment-entry-dialog');
  if (!metric || !dialog) return;

  const existingEntries = metric.components
    .map(component => entriesFor(metric.key, component.key).find(entry => entry.assessedOn === date))
    .filter(Boolean);
  const values = Object.fromEntries(metric.components.map(component => [
    component.key,
    entriesFor(metric.key, component.key).find(entry => entry.assessedOn === date)?.value ?? '',
  ]));
  const existingNote = existingEntries[0]?.note || '';

  dialog.innerHTML = `
    <form method="dialog" id="athletics-assessment-entry-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Valutazione Athletics</div><h3>${escapeHtml(metric.label)}</h3></div>
        <button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button>
      </div>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="assessedOn" value="${escapeAttr(date)}" required /></div>
          <div class="field"><label>Valutatore</label><input value="${escapeAttr(cache.evaluatorName || 'Preparatore')}" readonly /></div>
          ${renderValueInputs(metric, values)}
          <div class="field full"><label>Nota</label><textarea name="note" placeholder="Contesto, osservazioni, cosa è cambiato…">${escapeHtml(existingNote)}</textarea></div>
        </div>
        <div class="athletics-assessment-dialog-note">Salvando una data già presente, la valutazione di quel giorno viene aggiornata. Le altre date restano nello storico.</div>
      </div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-close>Annulla</button><button class="button button-primary" type="submit">Salva valutazione</button></div></div>
    </form>`;

  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.querySelector('#athletics-assessment-entry-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const access = getCurrentAccess();
    try {
      for (const component of metric.components) {
        await saveAthleticsAssessmentEntry({
          athleteId: access.athleteId,
          metricKey: metric.key,
          componentKey: component.key,
          assessedOn: form.elements.assessedOn.value,
          value: form.elements[`value-${component.key}`].value,
          evaluatorName: cache.evaluatorName || 'Preparatore',
          note: clean(form.elements.note.value),
        });
      }
      cache.entries = await loadAthleticsAssessmentEntries(access.athleteId);
      dialog.close();
      await ensureAssessmentSurface();
    } catch (error) {
      await showInAppAlert(error?.message || 'Salvataggio non riuscito.', { title: 'Valutazione Athletics' });
    }
  });
  dialog.showModal();
}

function renderMetricChart(metric) {
  const width = 760, height = 280, left = 48, right = 18, top = 18, bottom = 46;
  const plotW = width - left - right, plotH = height - top - bottom;
  const dates = [...new Set(metric.components.flatMap(component => entriesFor(metric.key, component.key).map(entry => entry.assessedOn)))].sort();

  if (!dates.length) return '<div class="athletics-assessment-empty"><strong>Nessuna valutazione</strong><span>Registra il primo giudizio per iniziare il tracking.</span></div>';

  const x = index => dates.length === 1 ? left + plotW / 2 : left + (index / (dates.length - 1)) * plotW;
  const y = value => top + ((10 - Number(value)) / 9) * plotH;
  const grid = [10, 8, 6, 4, 2, 1].map(value => `
    <line x1="${left}" y1="${y(value).toFixed(1)}" x2="${width-right}" y2="${y(value).toFixed(1)}" class="athletics-assessment-chart-grid" />
    <text x="${left-8}" y="${(y(value)+4).toFixed(1)}" text-anchor="end" class="athletics-assessment-chart-label">${value}</text>`).join('');
  const xLabels = dates.map((date, index) => `<text x="${x(index).toFixed(1)}" y="${height-15}" text-anchor="middle" class="athletics-assessment-chart-label">${escapeHtml(formatChartDate(date))}</text>`).join('');

  const series = metric.components.map((component, index) => {
    const byDate = new Map(entriesFor(metric.key, component.key).map(entry => [entry.assessedOn, entry]));
    const points = dates.map((date, dateIndex) => {
      const entry = byDate.get(date);
      return entry ? { x: x(dateIndex), y: y(entry.value), value: entry.value, date } : null;
    }).filter(Boolean);
    const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const className = index % 2 === 0 ? 'series-a' : 'series-b';
    return `${points.length > 1 ? `<path d="${path}" class="athletics-assessment-chart-line ${className}" />` : ''}${points.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="athletics-assessment-chart-dot ${className}"><title>${escapeHtml(`${component.label || metric.label}: ${formatValue(point.value)} · ${formatDate(point.date)}`)}</title></circle>`).join('')}`;
  }).join('');

  const legend = metric.components.length > 1 ? `<div class="athletics-assessment-chart-legend">${metric.components.map((component, index) => `<span><i class="${index % 2 === 0 ? 'series-a' : 'series-b'}"></i>${escapeHtml(component.label)}</span>`).join('')}</div>` : '';

  return `
    <div class="athletics-assessment-chart-head"><div><strong>Andamento nel tempo</strong><span>Valutazione del preparatore · scala 1–10</span></div>${legend}</div>
    <div class="athletics-assessment-chart-scroll"><svg class="athletics-assessment-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento ${escapeAttr(metric.label)}">${grid}${series}${xLabels}</svg></div>`;
}

function historyRows(metric) {
  const grouped = new Map();
  for (const component of metric.components) {
    for (const entry of entriesFor(metric.key, component.key)) {
      if (!grouped.has(entry.assessedOn)) grouped.set(entry.assessedOn, { date: entry.assessedOn, values: {}, entries: [] });
      const row = grouped.get(entry.assessedOn);
      row.values[component.key] = entry.value;
      row.entries.push(entry);
    }
  }
  return [...grouped.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function legacyHistoryRows(metric) {
  const legacy = Array.isArray(metric.legacyComponents)
    ? metric.legacyComponents
    : [];
  if (!legacy.length) return [];

  const grouped = new Map();
  for (const component of legacy) {
    for (const entry of entriesFor(metric.key, component.key)) {
      if (!grouped.has(entry.assessedOn)) {
        grouped.set(entry.assessedOn, {
          date: entry.assessedOn,
          values: {},
          entries: [],
        });
      }
      const row = grouped.get(entry.assessedOn);
      row.values[component.key] = entry.value;
      row.entries.push(entry);
    }
  }

  return [...grouped.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function legacyHistoryMarkup(metric) {
  const components = Array.isArray(metric.legacyComponents)
    ? metric.legacyComponents
    : [];
  const rows = legacyHistoryRows(metric);
  if (!components.length || !rows.length) return '';

  return `
    <section class="athletics-assessment-legacy">
      <div>
        <strong>Storico precedente alla semplificazione</strong>
        <span>Le vecchie valutazioni L/U restano archiviate e consultabili, ma non vengono aggregate né convertite nel nuovo valore unico.</span>
      </div>
      <div class="athletics-assessment-history">
        <table class="training-table">
          <thead><tr><th>Data</th>${components.map(component => `<th>${escapeHtml(component.label)}</th>`).join('')}<th>Valutatore</th><th>Nota</th></tr></thead>
          <tbody>${rows.map(row => {
            const firstEntry = row.entries[0];
            return `<tr><td>${escapeHtml(formatDate(row.date))}</td>${components.map(component => `<td><strong>${escapeHtml(formatValue(row.values[component.key]))}</strong></td>`).join('')}<td>${escapeHtml(firstEntry?.evaluatorName || '—')}</td><td>${escapeHtml(firstEntry?.note || '—')}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

function openDetail(metricKey) {
  const metric = metricByKey(metricKey);
  const dialog = document.querySelector('#athletics-assessment-detail-dialog');
  if (!metric || !dialog) return;
  const rows = historyRows(metric);

  dialog.innerHTML = `
    <div class="dialog-head"><div><div class="eyebrow">${escapeHtml(metric.groupTitle)}</div><h3>${escapeHtml(metric.label)}</h3></div><button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button></div>
    <div class="dialog-body athletics-assessment-detail-body">
      ${renderAssessmentTestBridge(metric)}
      ${renderMetricChart(metric)}
      <div class="athletics-assessment-detail-actions"><span>${rows.length} ${rows.length === 1 ? 'data valutata' : 'date valutate'}</span>${canWriteModule('training') ? `<button class="button button-primary" type="button" data-new-assessment="${escapeAttr(metric.key)}">+ Nuova valutazione</button>` : ''}</div>
      <div class="athletics-assessment-history">
        ${rows.length ? `<table class="training-table"><thead><tr><th>Data</th>${metric.components.map(component => `<th>${escapeHtml(component.label || 'Valore')}</th>`).join('')}<th>Valutatore</th><th>Nota</th>${canWriteModule('training') ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(row => {
          const firstEntry = row.entries[0];
          return `<tr><td>${escapeHtml(formatDate(row.date))}</td>${metric.components.map(component => `<td><strong>${escapeHtml(formatValue(row.values[component.key]))}</strong></td>`).join('')}<td>${escapeHtml(firstEntry?.evaluatorName || '—')}</td><td>${escapeHtml(firstEntry?.note || '—')}</td>${canWriteModule('training') ? `<td class="athletics-assessment-history-actions"><button class="icon-button" type="button" data-edit-assessment="${escapeAttr(metric.key)}" data-assessment-date="${escapeAttr(row.date)}" aria-label="Modifica valutazione">✎</button><button class="training-icon-danger" type="button" data-delete-assessment="${escapeAttr(metric.key)}" data-assessment-date="${escapeAttr(row.date)}" aria-label="Elimina valutazione">×</button></td>` : ''}</tr>`;
        }).join('')}</tbody></table>` : '<div class="athletics-assessment-empty"><strong>Nessuna valutazione registrata</strong><span>La prima valutazione diventerà il punto iniziale del grafico.</span></div>'}
      </div>
      ${legacyHistoryMarkup(metric)}
    </div>`;

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-new-assessment]')?.addEventListener('click', () => { dialog.close(); openEntryDialog(metric.key); });
  dialog.querySelector('[data-detail-link-test]')?.addEventListener('click', () => {
    dialog.close();
    openMetricTestLinkDialog(metric.key);
  });
  dialog.querySelector('[data-detail-open-test]')?.addEventListener('click', () => {
    dialog.close();
    openLinkedTest(dialog.querySelector('[data-detail-open-test]').dataset.detailOpenTest);
  });
  dialog.querySelectorAll('[data-edit-assessment]').forEach(button => button.addEventListener('click', () => { dialog.close(); openEntryDialog(metric.key, button.dataset.assessmentDate); }));
  dialog.querySelectorAll('[data-delete-assessment]').forEach(button => button.addEventListener('click', async () => {
    const date = button.dataset.assessmentDate;
    const entries = metric.components.map(component => entriesFor(metric.key, component.key).find(entry => entry.assessedOn === date)).filter(Boolean);
    const confirmed = await showInAppConfirm(`Eliminare la valutazione del ${formatDate(date)}?`, { title: 'Elimina valutazione', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    try {
      for (const entry of entries) await deleteAthleticsAssessmentEntry({ athleteId: cache.athleteId, id: entry.id });
      cache.entries = await loadAthleticsAssessmentEntries(cache.athleteId);
      dialog.close();
      await ensureAssessmentSurface();
      openDetail(metric.key);
    } catch (error) {
      await showInAppAlert(error?.message || 'Eliminazione non riuscita.', { title: 'Valutazione Athletics' });
    }
  }));
  dialog.showModal();
}

function renderAssessmentTestBridge(metric) {
  const test = linkedTestForMetric(metric.key);

  return `
    <section class="athletics-assessment-test-bridge">
      <div>
        <span>Test Athletics collegato</span>
        <strong>${escapeHtml(test?.name || 'Nessun test collegato')}</strong>
        <small>Il collegamento è descrittivo: valutazione 1–10 e risultato del test restano su scale indipendenti.</small>
      </div>
      <div>
        ${test ? `<button class="button button-ghost" type="button" data-detail-open-test="${escapeAttr(test.id)}">Apri test</button>` : ''}
        ${canWriteModule('training') ? `<button class="button button-ghost" type="button" data-detail-link-test="${escapeAttr(metric.key)}">${test ? 'Cambia' : 'Collega test'}</button>` : ''}
      </div>
    </section>`;
}

function createLinkDialog() {
  document.querySelector('#athletics-assessment-link-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'athletics-assessment-link-dialog';
  dialog.className = 'planner-dialog athletics-assessment-link-dialog';
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  return dialog;
}

function openMetricTestLinkDialog(metricKey) {
  if (!canWriteModule('training')) return;
  const metric = metricByKey(metricKey);
  if (!metric) return;

  const tests = [...trainingTests()].sort((a, b) => clean(a.name).localeCompare(clean(b.name), 'it'));
  const current = linkedTestForMetric(metric.key);
  const dialog = createLinkDialog();

  dialog.innerHTML = `
    <form method="dialog" id="athletics-assessment-link-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Assessment ↔ Test</div>
          <h3>${escapeHtml(metric.label)}</h3>
          <p>Scegli un solo test Athletics. Il collegamento non trasferisce né converte i valori.</p>
        </div>
        <button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button>
      </div>
      <div class="dialog-body">
        <div class="field">
          <label>Test collegato</label>
          <select name="testId">
            <option value="">Nessun test</option>
            ${tests.map(test => {
              const otherMetric = linkedMetricForTest(test);
              const suffix = otherMetric && otherMetric.key !== metric.key
                ? ` · ora collegato a ${otherMetric.label}`
                : '';
              return `<option value="${escapeAttr(test.id)}" ${current?.id === test.id ? 'selected' : ''}>${escapeHtml(`${test.name || 'Test'}${suffix}`)}</option>`;
            }).join('')}
          </select>
          <span class="training-field-hint">Se scegli un test già collegato a un’altra capacità, il collegamento viene spostato.</span>
        </div>
        ${tests.length ? '' : '<div class="training-inline-note">Non hai ancora definito test in Athletics.</div>'}
      </div>
      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit" ${tests.length || current ? '' : 'disabled'}>Salva collegamento</button>
        </div>
      </div>
    </form>`;

  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const testId = clean(new FormData(event.currentTarget).get('testId'));
    setMetricTestLink(metric.key, testId);
    dialog.close();
    queueEnsure();
    queueTestBridge();
  });
  dialog.showModal();
}

function openTestMetricLinkDialog(testId) {
  if (!canWriteModule('training')) return;
  const test = trainingTests().find(item => clean(item.id) === clean(testId));
  if (!test) return;

  const currentMetric = linkedMetricForTest(test);
  const dialog = createLinkDialog();

  dialog.innerHTML = `
    <form method="dialog" id="athletics-test-assessment-link-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Test ↔ Assessment</div>
          <h3>${escapeHtml(test.name || 'Test')}</h3>
          <p>Collega il test a una sola capacità della Valutazione attuale. Le due scale restano separate.</p>
        </div>
        <button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button>
      </div>
      <div class="dialog-body">
        <div class="field">
          <label>Capacità collegata</label>
          <select name="metricKey">
            <option value="">Nessuna capacità</option>
            ${GROUPS.map(group => `
              <optgroup label="${escapeAttr(group.title)}">
                ${group.metrics.map(metric => {
                  const occupied = linkedTestForMetric(metric.key);
                  const suffix = occupied && occupied.id !== test.id
                    ? ` · ora: ${occupied.name || 'altro test'}`
                    : '';
                  return `<option value="${escapeAttr(metric.key)}" ${currentMetric?.key === metric.key ? 'selected' : ''}>${escapeHtml(`${metric.label}${suffix}`)}</option>`;
                }).join('')}
              </optgroup>`).join('')}
          </select>
          <span class="training-field-hint">Scegliendo una capacità già collegata a un altro test, il collegamento precedente viene sostituito.</span>
        </div>
      </div>
      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva collegamento</button>
        </div>
      </div>
    </form>`;

  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const metricKey = clean(new FormData(event.currentTarget).get('metricKey'));
    setTestMetricLink(test.id, metricKey);
    dialog.close();
    queueEnsure();
    queueTestBridge();
  });
  dialog.showModal();
}

function testsSurface() {
  if (route() !== 'training') return null;
  const content = document.querySelector('#training-section-content');
  return content?.querySelector('.training-tests-layout') ? content : null;
}

function selectedTrainingTest(content = testsSurface()) {
  const testId = clean(content?.querySelector('[data-test-id].active')?.dataset.testId);
  return trainingTests().find(test => clean(test.id) === testId) || null;
}

function enhanceTestListLinks(content) {
  content?.querySelectorAll('[data-test-id]').forEach(button => {
    button.querySelector('.athletics-test-list-link')?.remove();
    const test = trainingTests().find(item => clean(item.id) === clean(button.dataset.testId));
    const metric = linkedMetricForTest(test);
    if (!metric) return;

    const copy = button.querySelector('div');
    if (!copy) return;
    const badge = document.createElement('span');
    badge.className = 'athletics-test-list-link';
    badge.textContent = `↔ ${metric.label}`;
    copy.appendChild(badge);
  });
}

function ensureTestBridgeSurface() {
  testBridgePending = false;
  const content = testsSurface();
  if (!content) return;

  enhanceTestListLinks(content);

  const test = selectedTrainingTest(content);
  const detail = content.querySelector('.training-test-detail');
  if (!test || !detail) return;

  detail.querySelector('.athletics-test-assessment-bridge')?.remove();
  const metric = linkedMetricForTest(test);
  const bridge = document.createElement('section');
  bridge.className = 'athletics-test-assessment-bridge';
  bridge.innerHTML = `
    <div>
      <span>Current Athletic Assessment</span>
      <strong>${escapeHtml(metric?.label || 'Nessuna capacità collegata')}</strong>
      <small>Collegamento descrittivo: il risultato del test non modifica la valutazione 1–10.</small>
    </div>
    <div>
      ${metric ? `<button class="button button-ghost" type="button" data-open-assessment-metric="${escapeAttr(metric.key)}">Apri valutazione</button>` : ''}
      ${canWriteModule('training') ? `<button class="button button-ghost" type="button" data-test-assessment-link="${escapeAttr(test.id)}">${metric ? 'Cambia' : 'Collega valutazione'}</button>` : ''}
    </div>`;

  detail.querySelector('.training-test-detail-head')?.insertAdjacentElement('afterend', bridge);
  focusPendingTest();
}

function queueTestBridge() {
  if (testBridgePending) return;
  testBridgePending = true;
  queueMicrotask(() => window.setTimeout(ensureTestBridgeSurface, 0));
}

function openLinkedTest(testId) {
  pendingTestId = clean(testId);
  const button = document.querySelector('[data-training-section="tests"]');
  if (button && !button.classList.contains('active')) button.click();
  queueTestBridge();
}

function focusPendingTest() {
  if (!pendingTestId || route() !== 'training') return;
  const content = testsSurface();
  if (!content) return;

  const button = content.querySelector(`[data-test-id="${CSS.escape(pendingTestId)}"]`);
  if (!button) return;

  if (!button.classList.contains('active')) {
    button.click();
    queueTestBridge();
    return;
  }

  pendingTestId = '';
  content.querySelector('.training-test-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openAssessmentMetric(metricKey) {
  if (!metricByKey(metricKey)) return;
  pendingAssessmentMetricKey = metricKey;
  const goals = document.querySelector('[data-training-section="goals"]');
  if (goals && !goals.classList.contains('active')) goals.click();
  queueEnsure();
}

document.addEventListener('click', event => {
  const target = event.target;

  if (target.closest('[data-test-assessment-link]')) {
    openTestMetricLinkDialog(target.closest('[data-test-assessment-link]').dataset.testAssessmentLink);
    return;
  }

  if (target.closest('[data-open-assessment-metric]')) {
    openAssessmentMetric(target.closest('[data-open-assessment-metric]').dataset.openAssessmentMetric);
    return;
  }

  if (
    target.closest('[data-training-section="goals"]')
    || target.closest('[data-route="training"]')
    || target.closest('[data-edit-goal]')
    || target.closest('#add-training-goal')
  ) queueEnsure();

  if (
    target.closest('[data-training-section="tests"]')
    || target.closest('[data-test-id]')
    || target.closest('#add-training-test')
    || target.closest('#empty-add-training-test')
    || target.closest('#edit-training-test')
    || target.closest('#add-test-result')
  ) queueTestBridge();
});

document.addEventListener('submit', event => {
  if (event.target?.id === 'training-goal-form') queueEnsure();
  if (event.target?.id === 'training-test-form' || event.target?.id === 'training-result-form') queueTestBridge();
});

// training.js reconstructs a test object when it is edited. Preserve the
// athlete-specific Assessment link across that edit without modifying the
// reusable test definition or importing any numeric value.
document.addEventListener('submit', event => {
  if (event.target?.id !== 'training-test-form') return;

  const testId = clean(event.target.elements?.id?.value);
  if (!testId) return;

  const before = trainingTests().find(test => clean(test.id) === testId);
  const metricKey = clean(before?.assessmentMetricKey);
  if (!metricKey) return;

  window.setTimeout(() => {
    const current = trainingTests().find(test => clean(test.id) === testId);
    if (!current || clean(current.assessmentMetricKey) === metricKey) return;

    store.update(state => {
      const test = state.training?.tests?.find(item => clean(item.id) === testId);
      if (test) test.assessmentMetricKey = metricKey;
    });

    queueTestBridge();
  }, 0);
}, true);

store.subscribe(state => {
  const fingerprint = testLinkFingerprint(state);
  if (fingerprint === lastTestLinkFingerprint) return;
  lastTestLinkFingerprint = fingerprint;

  if (route() === 'training') {
    queueEnsure();
    queueTestBridge();
  }
});

window.addEventListener('hashchange', () => {
  queueEnsure();
  queueTestBridge();
});

lastTestLinkFingerprint = testLinkFingerprint();
queueEnsure();
queueTestBridge();
