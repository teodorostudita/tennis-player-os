import { store } from '../data/store.js';

const TENNIS_SURFACES = ['Terra', 'Cemento', 'Indoor', 'Erba', 'Altro'];
let pendingCommit = null;
let pendingApply = false;

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureSurfaceField() {
  if (currentRoute() !== 'calendar') return;

  const form = document.querySelector('#event-form');
  if (!form) return;

  let field = form.querySelector('#calendar-tennis-surface-field');
  if (!field) {
    field = document.createElement('div');
    field.className = 'field calendar-tennis-surface-field';
    field.id = 'calendar-tennis-surface-field';
    field.innerHTML = `
      <label>Superficie</label>
      <select name="surface">
        <option value="">— Seleziona —</option>
        ${TENNIS_SURFACES.map(surface => `<option value="${escapeHtml(surface)}">${escapeHtml(surface)}</option>`).join('')}
      </select>
    `;

    const categoryField = form.elements.category?.closest('.field');
    if (categoryField) categoryField.insertAdjacentElement('afterend', field);
    else form.querySelector('.dialog-body')?.prepend(field);
  }

  const sync = () => {
    const tennis = form.elements.category?.value === 'tennis';
    field.hidden = !tennis;
    if (form.elements.surface) form.elements.surface.required = tennis;
  };

  if (!form.dataset.surfaceUiBound) {
    form.dataset.surfaceUiBound = 'true';
    form.elements.category?.addEventListener('change', sync);
    form.addEventListener('submit', captureSurfaceSubmit, true);
  }

  sync();
}

function fillSurfaceFromOpenDialog() {
  const form = document.querySelector('#event-form');
  const dialog = document.querySelector('#event-dialog');
  if (!form || !dialog?.open || !form.elements.surface) return;

  const id = form.elements.id?.value || '';
  const current = id
    ? (store.getState().planner?.events || []).find(event => event.id === id)
    : null;

  form.elements.surface.value = current?.surface || '';
  const field = form.querySelector('#calendar-tennis-surface-field');
  const tennis = form.elements.category?.value === 'tennis';
  if (field) field.hidden = !tennis;
  form.elements.surface.required = tennis;
}

function captureSurfaceSubmit(event) {
  const form = event.currentTarget;
  if (!form?.elements?.category) return;

  const state = store.getState();
  const planner = state.planner || {};
  const data = Object.fromEntries(new FormData(form).entries());
  const edited = data.id
    ? (planner.events || []).find(item => item.id === data.id)
    : null;

  pendingCommit = {
    capturedAt: Date.now(),
    surface: data.category === 'tennis' ? (data.surface || '') : '',
    category: data.category,
    id: data.id || '',
    title: String(data.title || '').trim(),
    date: data.date || '',
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    recurrenceMode: data.recurrenceMode || 'none',
    oldSeriesId: edited?.seriesId || '',
    beforeEventIds: new Set((planner.events || []).map(item => item.id)),
    beforeSeriesIds: new Set((planner.recurringSeries || []).map(item => item.id)),
  };

  window.setTimeout(commitPendingSurface, 0);
}

function sameTemplate(item, pending) {
  return item
    && item.category === pending.category
    && String(item.title || '') === pending.title
    && String(item.startTime || '') === pending.startTime
    && String(item.endTime || '') === pending.endTime;
}

function commitPendingSurface() {
  const pending = pendingCommit;
  pendingCommit = null;
  if (!pending) return;

  store.update(state => {
    const planner = state.planner;
    if (!planner) return;
    const events = Array.isArray(planner.events) ? planner.events : [];
    const series = Array.isArray(planner.recurringSeries) ? planner.recurringSeries : [];

    const applySeries = seriesId => {
      if (!seriesId) return false;
      const seriesRecord = series.find(item => item.id === seriesId);
      if (seriesRecord?.template) seriesRecord.template.surface = pending.surface;
      events.forEach(item => {
        if (item.seriesId === seriesId && (!pending.date || item.date >= pending.date)) {
          item.surface = pending.surface;
        }
      });
      return Boolean(seriesRecord);
    };

    if (pending.id) {
      const event = events.find(item => item.id === pending.id);
      if (event) {
        event.surface = pending.surface;
        if (event.seriesId) applySeries(event.seriesId);
        return;
      }

      const newSeries = series.find(item =>
        !pending.beforeSeriesIds.has(item.id)
        && sameTemplate(item.template, pending)
      );
      if (newSeries) {
        applySeries(newSeries.id);
        return;
      }
    }

    if (pending.recurrenceMode !== 'none') {
      const newSeries = series.find(item =>
        !pending.beforeSeriesIds.has(item.id)
        && sameTemplate(item.template, pending)
      );
      if (newSeries) {
        applySeries(newSeries.id);
        return;
      }
    }

    const newEvent = events.find(item =>
      !pending.beforeEventIds.has(item.id)
      && sameTemplate(item, pending)
      && item.date === pending.date
    );
    if (newEvent) newEvent.surface = pending.surface;
  });
}

function decoratePlannerEvents() {
  if (currentRoute() !== 'calendar') return;

  const events = store.getState().planner?.events || [];
  document.querySelectorAll('[data-event-id]').forEach(button => {
    button.querySelectorAll('.event-surface-chip').forEach(node => node.remove());
    const event = events.find(item => item.id === button.dataset.eventId);
    if (!event || event.category !== 'tennis' || !event.surface) return;

    const chip = document.createElement('span');
    chip.className = 'event-surface-chip';
    chip.textContent = `◌ ${event.surface}`;
    const time = button.querySelector('.event-time');
    if (time) time.insertAdjacentElement('afterend', chip);
    else button.prepend(chip);
  });
}

function applyPlannerSurfaceUi() {
  pendingApply = false;
  if (currentRoute() !== 'calendar') return;
  ensureSurfaceField();
  decoratePlannerEvents();
}

function scheduleApply() {
  if (pendingApply) return;
  pendingApply = true;
  window.queueMicrotask(applyPlannerSurfaceUi);
}

document.addEventListener('click', event => {
  if (currentRoute() !== 'calendar') return;
  const trigger = event.target.closest?.(
    '#new-calendar-event, [data-add-date], [data-event-id], [data-calendar-section]'
  );
  if (!trigger) return;
  window.queueMicrotask(() => {
    applyPlannerSurfaceUi();
    fillSurfaceFromOpenDialog();
  });
});

window.addEventListener('hashchange', scheduleApply);
store.subscribe(scheduleApply);
scheduleApply();
