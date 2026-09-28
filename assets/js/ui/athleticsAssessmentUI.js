import '../bootstrap.js';

import { canReadModule, canWriteModule, getCurrentAccess } from '../cloud/access.js';
import {
  currentAthleticsEvaluatorName,
  deleteAthleticsAssessmentEntry,
  loadAthleticsAssessmentEntries,
  saveAthleticsAssessmentEntry,
} from '../cloud/athleticsAssessmentCloud.js';
import { showInAppAlert, showInAppConfirm } from './inAppMessages.js';

const GROUPS = [
  {
    id: 'physical',
    title: 'Qualità fisiche',
    subtitle: 'Fotografia sintetica delle capacità fisiche generali.',
    metrics: [
      { key: 'endurance', label: 'Resistenza / Fondo' },
      { key: 'elasticity-prevention', label: 'Elasticità / injury prevention' },
      { key: 'power', label: 'Potenza', components: [{ key: 'lower', label: 'L' }, { key: 'upper', label: 'U' }] },
      { key: 'explosiveness', label: 'Esplosività', components: [{ key: 'lower', label: 'L' }, { key: 'upper', label: 'U' }] },
      { key: 'sprint-speed', label: 'Velocità di scatto' },
      { key: 'core-stability', label: 'Core stability' },
    ],
  },
  {
    id: 'coordination',
    title: 'Coordinazione & movimento',
    subtitle: 'Controllo motorio, reattività e qualità degli spostamenti.',
    metrics: [
      { key: 'balance-proprioception', label: 'Equilibrio / Propriocezione' },
      { key: 'reactivity', label: 'Reattività' },
      { key: 'eye-motor-coordination', label: 'Coordinazione oculo-motoria' },
      { key: 'footwork', label: 'Footwork' },
      { key: 'static-dynamic-coordination', label: 'Coordinazione statica / dinamica' },
      { key: 'basic-movements', label: 'Spostamenti base', components: [{ key: 'ns', label: 'N/S' }, { key: 'ew', label: 'E/W' }] },
      { key: 'advanced-recovery-crossover', label: 'Spost. avanzati · Recovery / Crossover' },
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
        <p>Giudizio sintetico del preparatore, separato sia dai Test sia dagli Obiettivi. Ogni nuova valutazione entra nello storico e alimenta il grafico della singola capacità.</p>
      </div>
      <span class="athletics-assessment-scale">Scala 1–10</span>
    </div>
    ${cache.error ? `<div class="access-info athletics-assessment-error">${escapeHtml(cache.error)}</div>` : ''}
    <div class="athletics-assessment-grid">${GROUPS.map(renderGroup).join('')}</div>
    <p class="athletics-assessment-footnote">Il valore corrente è sempre l'ultima valutazione disponibile. Le valutazioni precedenti non vengono perse.</p>
    <dialog class="planner-dialog athletics-assessment-dialog" id="athletics-assessment-entry-dialog"></dialog>
    <dialog class="planner-dialog athletics-assessment-dialog athletics-assessment-detail-dialog" id="athletics-assessment-detail-dialog"></dialog>
  `;
}

function renderGroup(group) {
  return `
    <article class="panel athletics-assessment-card">
      <div class="panel-header"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.subtitle)}</p></div>
      <div class="athletics-assessment-table">
        <div class="athletics-assessment-table-head"><span>Capacità</span><span>Attuale</span><span>Trend</span><span>Agg.</span><span></span></div>
        ${group.metrics.map(renderMetricRow).join('')}
      </div>
    </article>`;
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
      if (event?.target?.closest?.('[data-assessment-rate]')) return;
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

function openDetail(metricKey) {
  const metric = metricByKey(metricKey);
  const dialog = document.querySelector('#athletics-assessment-detail-dialog');
  if (!metric || !dialog) return;
  const rows = historyRows(metric);

  dialog.innerHTML = `
    <div class="dialog-head"><div><div class="eyebrow">${escapeHtml(metric.groupTitle)}</div><h3>${escapeHtml(metric.label)}</h3></div><button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button></div>
    <div class="dialog-body athletics-assessment-detail-body">
      ${renderMetricChart(metric)}
      <div class="athletics-assessment-detail-actions"><span>${rows.length} ${rows.length === 1 ? 'data valutata' : 'date valutate'}</span>${canWriteModule('training') ? `<button class="button button-primary" type="button" data-new-assessment="${escapeAttr(metric.key)}">+ Nuova valutazione</button>` : ''}</div>
      <div class="athletics-assessment-history">
        ${rows.length ? `<table class="training-table"><thead><tr><th>Data</th>${metric.components.map(component => `<th>${escapeHtml(component.label || 'Valore')}</th>`).join('')}<th>Valutatore</th><th>Nota</th>${canWriteModule('training') ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(row => {
          const firstEntry = row.entries[0];
          return `<tr><td>${escapeHtml(formatDate(row.date))}</td>${metric.components.map(component => `<td><strong>${escapeHtml(formatValue(row.values[component.key]))}</strong></td>`).join('')}<td>${escapeHtml(firstEntry?.evaluatorName || '—')}</td><td>${escapeHtml(firstEntry?.note || '—')}</td>${canWriteModule('training') ? `<td class="athletics-assessment-history-actions"><button class="icon-button" type="button" data-edit-assessment="${escapeAttr(metric.key)}" data-assessment-date="${escapeAttr(row.date)}" aria-label="Modifica valutazione">✎</button><button class="training-icon-danger" type="button" data-delete-assessment="${escapeAttr(metric.key)}" data-assessment-date="${escapeAttr(row.date)}" aria-label="Elimina valutazione">×</button></td>` : ''}</tr>`;
        }).join('')}</tbody></table>` : '<div class="athletics-assessment-empty"><strong>Nessuna valutazione registrata</strong><span>La prima valutazione diventerà il punto iniziale del grafico.</span></div>'}
      </div>
    </div>`;

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-new-assessment]')?.addEventListener('click', () => { dialog.close(); openEntryDialog(metric.key); });
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

document.addEventListener('click', event => {
  const target = event.target;
  if (target.closest('[data-training-section="goals"]') || target.closest('[data-route="training"]') || target.closest('[data-edit-goal]') || target.closest('#add-training-goal')) queueEnsure();
});

document.addEventListener('submit', event => {
  if (event.target?.id === 'training-goal-form') queueEnsure();
});

window.addEventListener('hashchange', queueEnsure);
queueEnsure();
