import '../bootstrap.js';

import { store } from '../data/store.js';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js';

const OUTBOX_PREFIX = 'tpos.calendar.outbox.v1';
const SAVE_LABEL = 'Calendar cloud ✓';

let lastPlannerSignature = '';
let recoveryInProgress = false;
let initialized = false;

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }

  return value;
}

function normalizePlanner(planner = {}) {
  return {
    people: Array.isArray(planner.people) ? planner.people : [],
    events: Array.isArray(planner.events) ? planner.events : [],
    tournaments: Array.isArray(planner.tournaments) ? planner.tournaments : [],
    recurringSeries: Array.isArray(planner.recurringSeries) ? planner.recurringSeries : [],
    locationDefaults:
      planner.locationDefaults && typeof planner.locationDefaults === 'object'
        ? planner.locationDefaults
        : {},
  };
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function shiftDateString(value, days) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return '';

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function recurrenceDates(series) {
  if (
    !series?.startDate
    || !series?.generatedThrough
    || series.active === false
  ) {
    return [];
  }

  const stepDays = Math.max(
    7,
    Math.min(364, Number(series.intervalWeeks || 1) * 7),
  );

  const dates = [];
  let value = series.startDate;
  let guard = 0;

  while (
    value
    && value <= series.generatedThrough
    && guard < 5000
  ) {
    dates.push(value);
    value = shiftDateString(value, stepDays);
    guard += 1;
  }

  return dates;
}

function exceptionKey(seriesId, date) {
  return `${seriesId}::${date}`;
}

function syntheticOccurrenceId(seriesId, date) {
  return `series-occ-${seriesId}-${date}`;
}

function isExpectedOccurrenceDate(series, date) {
  if (
    !series?.startDate
    || !series?.generatedThrough
    || series.active === false
    || !date
    || date < series.startDate
    || date > series.generatedThrough
  ) {
    return false;
  }

  const start = new Date(`${series.startDate}T00:00:00`);
  const current = new Date(`${date}T00:00:00`);
  const diffDays = Math.round((current - start) / 86400000);
  const stepDays = Math.max(
    7,
    Math.min(364, Number(series.intervalWeeks || 1) * 7),
  );

  return diffDays >= 0 && diffDays % stepDays === 0;
}

function recurringComparablePayload(event = {}) {
  const { id, seriesId, date, ...rest } = event;
  return rest;
}

function compactPlannerForOutbox(plannerInput = {}) {
  const planner = normalizePlanner(plannerInput);
  const seriesMap = new Map(
    planner.recurringSeries.map(series => [String(series.id), series]),
  );
  const expectedEventMap = new Map();
  const materializedEvents = [];

  planner.events.forEach(event => {
    if (!event?.seriesId) {
      materializedEvents.push(event);
      return;
    }

    const series = seriesMap.get(String(event.seriesId));
    if (!series || !isExpectedOccurrenceDate(series, event.date)) {
      materializedEvents.push(event);
      return;
    }

    expectedEventMap.set(exceptionKey(event.seriesId, event.date), event);
  });

  const exceptions = [];

  planner.recurringSeries.forEach(series => {
    recurrenceDates(series).forEach(date => {
      const key = exceptionKey(series.id, date);
      const event = expectedEventMap.get(key);

      if (!event) {
        exceptions.push({
          id: key,
          seriesId: String(series.id),
          date,
          kind: 'skip',
          payload: {},
        });
        return;
      }

      if (
        stableStringify(recurringComparablePayload(event))
        !== stableStringify(recurringComparablePayload(series.template || {}))
      ) {
        exceptions.push({
          id: key,
          seriesId: String(series.id),
          date,
          kind: 'override',
          payload: event,
        });
      }
    });
  });

  return {
    people: planner.people,
    recurringSeries: planner.recurringSeries,
    materializedEvents,
    tournaments: planner.tournaments,
    locationDefaults: planner.locationDefaults,
    exceptions,
  };
}

function reconstructPlannerFromOutbox(compact = {}) {
  const people = Array.isArray(compact.people) ? compact.people : [];
  const recurringSeries = Array.isArray(compact.recurringSeries)
    ? compact.recurringSeries
    : [];
  const materializedEvents = Array.isArray(compact.materializedEvents)
    ? compact.materializedEvents
    : [];
  const tournaments = Array.isArray(compact.tournaments)
    ? compact.tournaments
    : [];
  const locationDefaults = compact.locationDefaults
    && typeof compact.locationDefaults === 'object'
      ? compact.locationDefaults
      : {};
  const exceptions = Array.isArray(compact.exceptions) ? compact.exceptions : [];

  const exceptionMap = new Map(
    exceptions.map(item => [exceptionKey(item.seriesId, item.date), item]),
  );
  const generatedEvents = [];

  recurringSeries.forEach(series => {
    recurrenceDates(series).forEach(date => {
      const exception = exceptionMap.get(exceptionKey(series.id, date));
      if (exception?.kind === 'skip') return;

      if (exception?.kind === 'override') {
        const payload = exception.payload && typeof exception.payload === 'object'
          ? exception.payload
          : {};
        generatedEvents.push({
          ...(series.template || {}),
          ...payload,
          id: payload.id || syntheticOccurrenceId(series.id, date),
          seriesId: series.id,
          date,
        });
        return;
      }

      generatedEvents.push({
        ...(series.template || {}),
        id: syntheticOccurrenceId(series.id, date),
        seriesId: series.id,
        date,
      });
    });
  });

  return normalizePlanner({
    people,
    recurringSeries,
    events: [...materializedEvents, ...generatedEvents],
    tournaments,
    locationDefaults,
  });
}

function hashString(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function plannerSignature(planner = {}) {
  return hashString(stableStringify(compactPlannerForOutbox(planner)));
}

function outboxKey() {
  const access = getCurrentAccess();
  const athleteId = clean(access.athleteId);
  const userId = clean(access.userId) || 'account';

  return athleteId
    ? `${OUTBOX_PREFIX}.${userId}.${athleteId}`
    : '';
}

function readOutbox() {
  const key = outboxKey();
  if (!key) return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');

    const hasPayload = Boolean(
      parsed?.compactPlanner && typeof parsed.compactPlanner === 'object'
    ) || Boolean(
      parsed?.planner && typeof parsed.planner === 'object'
    );

    if (
      !parsed
      || !hasPayload
      || parsed.athleteId !== getCurrentAccess().athleteId
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeOutbox(planner) {
  const key = outboxKey();
  if (!key) return;

  const access = getCurrentAccess();
  const compactPlanner = compactPlannerForOutbox(planner);
  const signature = hashString(stableStringify(compactPlanner));

  try {
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 2,
      athleteId: access.athleteId,
      userId: access.userId || '',
      updatedAt: new Date().toISOString(),
      signature,
      compactPlanner,
    }));

    window.setTimeout(confirmOutboxIfSaved, 900);
    window.setTimeout(confirmOutboxIfSaved, 2500);
  } catch (error) {
    console.warn(
      'Calendar safety outbox unavailable even in compact mode.',
      error,
    );
  }
}

function clearOutbox() {
  const key = outboxKey();
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage cleanup is best-effort.
  }
}

function currentPlanner() {
  return store.getState()?.planner || {};
}

function calendarWriteEnabled() {
  return canReadModule('calendar') && canWriteModule('calendar');
}

function restorePendingOutbox() {
  if (!calendarWriteEnabled()) return false;

  const pending = readOutbox();
  if (!pending) return false;

  const current = currentPlanner();
  const currentSignature = plannerSignature(current);
  const pendingPlanner = pending.compactPlanner
    ? reconstructPlannerFromOutbox(pending.compactPlanner)
    : pending.planner;
  const pendingSignature = pending.signature || plannerSignature(pendingPlanner);

  if (currentSignature === pendingSignature) {
    clearOutbox();
    return false;
  }

  recoveryInProgress = true;

  store.update(state => {
    state.planner = clone(pendingPlanner);
    state.meta.calendarRecoveredFromOutboxAt = new Date().toISOString();
  });

  recoveryInProgress = false;
  lastPlannerSignature = pendingSignature;

  const indicator = document.querySelector('#save-indicator');
  if (indicator) {
    indicator.textContent = 'Calendar → recupero modifiche…';
    indicator.title = 'Una modifica locale non confermata è stata recuperata e verrà risincronizzata.';
  }

  return true;
}

function installOutboxTracking() {
  lastPlannerSignature = plannerSignature(currentPlanner());

  store.subscribe(state => {
    if (!calendarWriteEnabled()) return;

    const nextSignature = plannerSignature(state?.planner || {});

    if (nextSignature === lastPlannerSignature) return;

    lastPlannerSignature = nextSignature;

    if (!recoveryInProgress) {
      writeOutbox(state?.planner || {});
    }
  });
}

function confirmOutboxIfSaved() {
  const indicator = document.querySelector('#save-indicator');
  if (!indicator || clean(indicator.textContent) !== SAVE_LABEL) return;

  const pending = readOutbox();
  if (!pending) return;

  const currentSignature = plannerSignature(currentPlanner());
  const pendingPlanner = pending.compactPlanner
    ? reconstructPlannerFromOutbox(pending.compactPlanner)
    : pending.planner;
  const pendingSignature = pending.signature || plannerSignature(pendingPlanner);

  if (currentSignature === pendingSignature) {
    clearOutbox();
  }
}


function nudgeCalendarSync() {
  if (!calendarWriteEnabled() || !readOutbox()) return;

  store.update(state => {
    // The planner payload remains identical. The emit is intentional:
    // calendarCloud.js receives the current snapshot and retries the diff.
    state.planner = clone(state.planner);
    state.meta.calendarSyncNudgedAt = new Date().toISOString();
  });
}

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function findEventById(id) {
  return currentPlanner().events?.find(event => event.id === id) || null;
}

function linkedSeries(event) {
  if (!event?.seriesId) return null;

  return currentPlanner().recurringSeries?.find(
    series => series.id === event.seriesId,
  ) || null;
}

function getCompanionId(event = {}) {
  return (
    event.companionId
    || event.responsibilities?.stay
    || event.responsibilities?.dropoff
    || event.responsibilities?.pickup
    || ''
  );
}

function isRecurringEvent(event) {
  return Boolean(event?.seriesId && linkedSeries(event));
}

function enhanceEventDialog() {
  const form = document.querySelector('#event-form');
  if (!form) return;

  const id = clean(form.elements.id?.value);
  const event = id ? findEventById(id) : null;
  const series = linkedSeries(event);
  const recurrenceBox = document.querySelector('#recurrence-box');
  const oldNote = document.querySelector('#series-edit-note');

  document.querySelector('#calendar-single-occurrence-scope')?.remove();

  if (!event || !series) {
    if (oldNote) oldNote.hidden = true;
    if (recurrenceBox) recurrenceBox.hidden = false;
    return;
  }

  if (oldNote) {
    oldNote.hidden = false;
    oldNote.innerHTML = `
      <strong>Eccezione della serie.</strong>
      Di default <strong>Salva</strong> ed <strong>Elimina</strong> agiscono solo su questa data.
      Le settimane successive restano identiche alla serie originale.
    `;
  }

  const scope = document.createElement('div');
  scope.id = 'calendar-single-occurrence-scope';
  scope.className = 'field full calendar-series-scope';
  scope.innerHTML = `
    <label>Ambito della modifica</label>
    <div class="calendar-series-scope-options">
      <label>
        <input type="radio" name="calendarEditScope" value="single" checked />
        <span>
          <strong>Solo questa attività</strong>
          <small>La settimana successiva torna alla programmazione normale.</small>
        </span>
      </label>
      <label>
        <input type="radio" name="calendarEditScope" value="future" />
        <span>
          <strong>Questa e le successive</strong>
          <small>Modifica intenzionalmente la serie da questa data in poi.</small>
        </span>
      </label>
    </div>
  `;

  recurrenceBox?.insertAdjacentElement('beforebegin', scope);

  const applyScopeVisibility = () => {
    const selected = form.elements.calendarEditScope?.value || 'single';

    if (recurrenceBox) {
      recurrenceBox.hidden = selected !== 'future';
    }
  };

  scope.querySelectorAll('input[name="calendarEditScope"]').forEach(input => {
    input.addEventListener('change', applyScopeVisibility);
  });

  applyScopeVisibility();
}

function buildBaseFromForm(form) {
  const category = clean(form.elements.category?.value) || 'personal';
  const companionId = clean(form.elements.companionId?.value);

  return {
    title: clean(form.elements.title?.value),
    date: clean(form.elements.date?.value),
    category,
    startTime: clean(form.elements.startTime?.value),
    endTime: clean(form.elements.endTime?.value),
    location: clean(form.elements.location?.value),
    notes: clean(form.elements.notes?.value),
    nutritionTemplateId:
      category === 'nutrition'
        ? clean(form.elements.nutritionTemplateId?.value)
        : '',
    mealType:
      category === 'nutrition'
        ? clean(form.elements.mealType?.value) || 'other'
        : '',
    mealDetails:
      category === 'nutrition'
        ? clean(form.elements.mealDetails?.value)
        : '',
    athleteId: store.getState().athlete.id,
    companionId,
    responsibilities: { stay: companionId },
  };
}

function sameSeriesDateCollision(event, nextDate) {
  if (!event?.seriesId || !nextDate || nextDate === event.date) return false;

  return Boolean(
    currentPlanner().events?.some(other =>
      other.id !== event.id
      && other.seriesId === event.seriesId
      && other.date === nextDate
    )
  );
}

async function saveSingleOccurrence(form, event) {
  const base = buildBaseFromForm(form);

  if (
    !base.title
    || !base.date
    || !base.startTime
    || !base.endTime
  ) {
    return;
  }

  if (base.endTime <= base.startTime) {
    await showInAppAlert(
      'L’orario di fine deve essere successivo a quello di inizio.',
      { title: 'Orario non valido' },
    );
    return;
  }

  if (sameSeriesDateCollision(event, base.date)) {
    await showInAppAlert(
      'Su quella data esiste già un’altra occorrenza della stessa serie. '
      + 'Per evitare duplicazioni, scegli una data diversa oppure modifica direttamente quella occorrenza.',
      { title: 'Data già occupata dalla serie' },
    );
    return;
  }

  store.update(state => {
    const index = state.planner.events.findIndex(item => item.id === event.id);
    if (index < 0) return;

    const current = state.planner.events[index];

    state.planner.events[index] = {
      ...current,
      ...base,
      id: current.id,
      seriesId: current.seriesId,
    };

    if (base.location) {
      state.planner.locationDefaults[base.date] = base.location;
    }

    state.meta.calendarSingleOccurrenceEditedAt = new Date().toISOString();
  });

  form.closest('dialog')?.close();
}

async function deleteSingleOccurrence(event) {
  const confirmed = await showInAppConfirm(
    'Eliminare solo questa attività? La serie continuerà normalmente nelle settimane successive.',
    {
      title: 'Elimina questa occorrenza',
      confirmLabel: 'Elimina solo questa',
      danger: true,
    },
  );

  if (!confirmed) return;

  store.update(state => {
    state.planner.events = state.planner.events.filter(
      item => item.id !== event.id,
    );
    state.meta.calendarSingleOccurrenceDeletedAt = new Date().toISOString();
  });

  document.querySelector('#event-dialog')?.close();
}

function installRecurringSafety() {
  document.addEventListener('submit', event => {
    if (event.target?.id !== 'event-form') return;

    const form = event.target;
    const id = clean(form.elements.id?.value);
    if (!id) return;

    const current = findEventById(id);
    if (!isRecurringEvent(current)) return;

    const scope = form.elements.calendarEditScope?.value || 'single';

    if (scope !== 'single') {
      // Explicit opt-in: let the original Calendar handler update the series.
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    void saveSingleOccurrence(form, current);
  }, true);

  document.addEventListener('click', event => {
    const deleteButton = event.target?.closest?.('#delete-event');

    if (deleteButton) {
      const form = document.querySelector('#event-form');
      const id = clean(form?.elements.id?.value);
      const current = id ? findEventById(id) : null;

      if (isRecurringEvent(current)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void deleteSingleOccurrence(current);
        return;
      }
    }

    if (
      event.target?.closest?.('[data-event-id]')
      || event.target?.closest?.('#new-calendar-event')
      || event.target?.closest?.('[data-add-date]')
    ) {
      window.setTimeout(enhanceEventDialog, 0);
    }
  }, true);

  // The legacy direct drag/resize handler changes an entire series from the
  // dragged occurrence onward. Disable that gesture only for recurring events:
  // opening the activity still works and now defaults to "Solo questa attività".
  document.addEventListener('pointerdown', event => {
    const eventElement = event.target?.closest?.('.planner-timeline-event[data-event-id]');
    if (!eventElement) return;

    const current = findEventById(eventElement.dataset.eventId);
    if (!isRecurringEvent(current)) return;

    event.stopPropagation();
  }, true);
}

function installLifecycleSafety() {
  window.addEventListener('online', () => {
    nudgeCalendarSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      nudgeCalendarSync();
    }
  });

  window.addEventListener('pageshow', () => {
    nudgeCalendarSync();
  });

  window.addEventListener('hashchange', () => {
    window.setTimeout(enhanceEventDialog, 0);
  });
}

function initialize() {
  if (initialized) return;
  initialized = true;

  if (!canReadModule('calendar')) return;

  restorePendingOutbox();
  installOutboxTracking();
  installRecurringSafety();
  installLifecycleSafety();
  confirmOutboxIfSaved();

  // A pending outbox should retry immediately on launch instead of waiting
  // for the next Calendar edit.
  if (readOutbox()) {
    nudgeCalendarSync();
  }

  if (route() === 'calendar') {
    window.setTimeout(enhanceEventDialog, 0);
  }
}

initialize();
