import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js';

const CATEGORY_LABELS = {
  tennis: 'Tennis',
  physical: 'Preparazione fisica',
  school: 'Scuola',
  recovery: 'Recupero',
  tournament: 'Torneo / Match',
  travel: 'Spostamento / Viaggio',
  medical: 'Salute / Visita',
  personal: 'Personale',
  nutrition: 'Alimentazione',
  mental: 'Mental',
};

const MEAL_TYPE_LABELS = {
  breakfast: 'Colazione',
  snack: 'Spuntino',
  lunch: 'Pranzo',
  pre: 'Pre-allenamento',
  during: 'Durante allenamento',
  post: 'Post-allenamento',
  dinner: 'Cena',
  hydration: 'Idratazione',
  other: 'Altro',
};

const RECURRENCE_INITIAL_HORIZON_WEEKS = 104;
const RECURRENCE_EXTENSION_WEEKS = 52;
const TIMELINE_PX_PER_MINUTE = 2.2;
const TIMELINE_SNAP_MINUTES = 15;
const TIMELINE_DEFAULT_EVENT_MINUTES = 30;

const TOURNAMENT_CIRCUITS = ['FITP', 'Junior', 'Open', 'Macroarea', 'Tennis Europe'];
const TOURNAMENT_SURFACES = ['Terra', 'Cemento', 'Erba', 'Indoor', 'Altro'];
const TOURNAMENT_STATUSES = {
  candidate: 'Da valutare',
  target: 'Obiettivo',
  planned: 'In programma',
  registered: 'Iscritta',
  played: 'Giocato',
  skipped: 'Saltato',
};
const TOURNAMENT_PRIORITIES = {
  A: 'A · Priorità alta',
  B: 'B · Priorità media',
  C: 'C · Priorità bassa',
};

let weekAnchor = startOfWeek(new Date());
let plannerView = 'combined';
let calendarSection = 'planner';
let tournamentYear = new Date().getFullYear();
let tournamentCircuitFilter = 'all';
let tournamentStatusFilter = 'all';
let calendarClipboard = null;
let suppressTimelineEventClickUntil = 0;

export function renderCalendar({ main, title, store }) {
  title.textContent = '12. Calendar';
  ensureRecurringCoverage(store, dateKey(addDays(weekAnchor, RECURRENCE_EXTENSION_WEEKS * 7)));
  const state = store.getState();
  const planner = normalizePlanner(state.planner);
  const nutritionTemplates = Array.isArray(state.nutrition?.templates) ? state.nutrition.templates : [];

  main.innerHTML = `
    <section class="calendar-module-head">
      <div>
        <div class="eyebrow">Calendar</div>
        <h2>Programmazione</h2>
        <p>Programmazione settimanale, logistica familiare e pianificazione della stagione agonistica.</p>
      </div>
      <div class="calendar-section-switch" role="tablist" aria-label="Sezione calendario">
        ${calendarSectionButton('planner', 'Planner settimanale')}
        ${calendarSectionButton('tournaments', 'Tornei · Stagione')}
      </div>
    </section>

    <div id="calendar-section-content">
      ${calendarSection === 'tournaments' ? renderTournamentPlanning(planner) : renderWeeklyPlanner(planner, nutritionTemplates)}
    </div>
  `;

  bindSectionSwitch({ main, store });
  if (calendarSection === 'tournaments') bindTournamentPlanning({ main, store, planner });
  else bindWeeklyPlanner({ main, store, planner, nutritionTemplates });
}

function normalizePlanner(planner = {}) {
  return {
    people: Array.isArray(planner.people) ? planner.people : [],
    events: Array.isArray(planner.events) ? planner.events : [],
    tournaments: Array.isArray(planner.tournaments) ? planner.tournaments : [],
    recurringSeries: Array.isArray(planner.recurringSeries) ? planner.recurringSeries : [],
    locationDefaults: planner.locationDefaults && typeof planner.locationDefaults === 'object' ? planner.locationDefaults : {},
  };
}

function renderWeeklyPlanner(planner, nutritionTemplates = []) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i));
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[6]);
  const weekEvents = planner.events
    .filter(event => event.date >= startKey && event.date <= endKey)
    .sort(compareEvents);
  const weekTournaments = planner.tournaments
    .filter(tournament => dateRangesOverlap(tournament.startDate, tournament.endDate || tournament.startDate, startKey, endKey))
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const assignments = weekEvents.filter(event => getCompanionId(event)).length
    + weekTournaments.filter(tournament => tournament.supportPersonId).length;

  const unassigned = weekEvents.filter(event => {
    if (event.category === 'school' || event.category === 'recovery' || event.category === 'personal' || event.category === 'nutrition' || event.category === 'mental') return false;
    return !getCompanionId(event);
  }).length;
  const scheduledMinutes = weekEvents.reduce((sum, event) => sum + durationMinutes(event), 0);

  return `
    <section class="planner-head calendar-subhead">
      <div>
        <div class="eyebrow">Weekly planner</div>
        <h2>${escapeHtml(formatWeekRange(days[0], days[6]))}</h2>
        <p>Programma dell’atleta e logistica familiare nello stesso calendario.</p>
      </div>
      <div class="planner-head-actions">
        <button class="button button-ghost" id="print-planner" type="button">Stampa planner</button>
        <button class="button button-ghost" id="manage-people" type="button">Persone</button>
        <button class="button button-primary" id="new-calendar-event" type="button">+ Nuova attività</button>
      </div>
    </section>

    <section class="planner-kpis" aria-label="Riepilogo settimana">
      <div class="planner-kpi"><span>Attività</span><strong>${weekEvents.length}</strong></div>
      <div class="planner-kpi"><span>Ore pianificate</span><strong>${formatDuration(scheduledMinutes)}</strong></div>
      <div class="planner-kpi"><span>Tornei</span><strong>${weekTournaments.length}</strong></div>
      <div class="planner-kpi ${unassigned ? 'attention' : ''}"><span>Da assegnare</span><strong>${unassigned}</strong></div>
    </section>

    <section class="planner-toolbar panel">
      <div class="planner-navigation">
        <button class="icon-button" id="prev-week" type="button" aria-label="Settimana precedente">←</button>
        <button class="button button-ghost" id="today-week" type="button">Questa settimana</button>
        <button class="icon-button" id="next-week" type="button" aria-label="Settimana successiva">→</button>
      </div>
      <div class="planner-view-switch" role="group" aria-label="Vista planner">
        ${viewButton('athlete', 'Atleta')}
        ${viewButton('logistics', 'Logistica')}
        ${viewButton('combined', 'Combinato')}
      </div>
    </section>

    ${calendarClipboard ? `
      <section class="calendar-clipboard-banner" aria-live="polite">
        <div><strong>Copiato:</strong> ${escapeHtml(calendarClipboard.title || 'Attività')} <span>· clicca in uno spazio vuoto per incollare mantenendo la durata.</span></div>
        <button class="button button-ghost" id="clear-calendar-clipboard" type="button">Annulla copia</button>
      </section>` : ''}

    ${renderWeeklyTimeline(days, weekEvents, weekTournaments, planner.people)}

    ${renderPrintPlanner(days, weekEvents, weekTournaments, planner.people)}

    <section class="planner-week-summary-panels">
      <section class="panel planner-family-panel planner-summary-panel">
        <div class="panel-header planner-summary-header">
          <div>
            <h3>Carico logistico</h3>
            <p>Incarichi della settimana.</p>
          </div>
          <span class="planner-summary-total">${assignments} incarichi</span>
        </div>
        <div class="panel-body people-summary people-summary-compact">
          ${planner.people.length ? planner.people.map(person => renderPersonSummary(person, weekEvents, weekTournaments)).join('') : '<p class="empty-copy">Nessuna persona ancora inserita.</p>'}
        </div>
      </section>

      ${renderAthleteLoadSummary(weekEvents)}
    </section>

    ${renderEventDialog(planner.people, nutritionTemplates)}
    ${renderPeopleDialog(planner.people)}
    ${renderTournamentDialog(planner.people)}
  `;
}

function renderWeeklyTimeline(days, weekEvents, weekTournaments, people) {
  const visibleWeekEvents = filterEventsForPlannerView(weekEvents);
  const bounds = getTimelineBounds(visibleWeekEvents);
  const totalMinutes = bounds.end - bounds.start;
  const timelineHeight = Math.round(totalMinutes * TIMELINE_PX_PER_MINUTE);
  const hourHeight = Math.round(60 * TIMELINE_PX_PER_MINUTE);
  const hourMarks = [];
  for (let minute = bounds.start; minute <= bounds.end; minute += 60) hourMarks.push(minute);
  const hasTournaments = weekTournaments.length > 0;

  return `
    <section class="planner-timeline-scroll" aria-label="Calendario settimanale a orari">
      <div class="planner-timeline-shell" style="--timeline-height:${timelineHeight}px; --hour-height:${hourHeight}px;">
        <div class="planner-timeline-header">
          <div class="planner-time-corner">Ora</div>
          ${days.map(day => {
            const key = dateKey(day);
            const isToday = key === dateKey(new Date());
            return `
              <div class="planner-timeline-day-head ${isToday ? 'today' : ''}">
                <span>${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(day))}</span>
                <strong>${day.getDate()}</strong>
                <button class="planner-add-inline" type="button" data-add-date="${key}" aria-label="Aggiungi attività">＋</button>
              </div>`;
          }).join('')}
        </div>

        ${hasTournaments ? `
          <div class="planner-all-day-row">
            <div class="planner-all-day-label">Tornei</div>
            ${days.map(day => {
              const key = dateKey(day);
              const items = weekTournaments.filter(tournament => dateWithinRange(key, tournament.startDate, tournament.endDate || tournament.startDate));
              return `<div class="planner-all-day-cell">${items.map(tournament => renderTournamentWeekEvent(tournament, key, people)).join('')}</div>`;
            }).join('')}
          </div>` : ''}

        <div class="planner-timeline-body" data-timeline-start="${bounds.start}" data-timeline-end="${bounds.end}">
          <div class="planner-time-axis" aria-hidden="true">
            ${hourMarks.map(minute => {
              const top = Math.round((minute - bounds.start) * TIMELINE_PX_PER_MINUTE);
              return `<span style="top:${top}px">${formatMinutesAsTime(minute)}</span>`;
            }).join('')}
          </div>
          ${days.map(day => renderTimelineDay(day, weekEvents, people, bounds)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTimelineDay(day, weekEvents, people, bounds) {
  const key = dateKey(day);
  const events = filterEventsForPlannerView(weekEvents.filter(event => event.date === key));

  const isToday = key === dateKey(new Date());
  const laidOut = layoutTimelineEvents(events);
  return `
    <div class="planner-timeline-day ${isToday ? 'today' : ''}" data-date="${key}">
      ${laidOut.map(item => renderTimelineEvent(item.event, people, bounds, item.lane, item.laneCount)).join('')}
      ${events.length ? '' : '<span class="planner-timeline-empty">Nessuna attività</span>'}
    </div>
  `;
}


function renderPrintPlanner(days, weekEvents, weekTournaments, people) {
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[6]);
  const bounds = getTimelineBounds(weekEvents);
  const totalMinutes = Math.max(60, bounds.end - bounds.start);
  const hourMarks = [];
  for (let minute = bounds.start; minute <= bounds.end; minute += 60) hourMarks.push(minute);
  const hasTournaments = weekTournaments.length > 0;
  const timelineHeightMm = hasTournaments ? 156 : 168;

  const loadRows = [
    ['tennis', 'Tennis'],
    ['physical', 'Atletica'],
    ['mental', 'Mental'],
    ['school', 'Scuola'],
  ].map(([key, label]) => {
    const minutes = weekEvents
      .filter(event => event.category === key)
      .reduce((sum, event) => sum + durationMinutes(event), 0);
    return { key, label, minutes };
  }).filter(row => row.minutes > 0);

  return `
    <section class="planner-print-sheet" aria-hidden="true" style="--print-timeline-height:${timelineHeightMm}mm;">
      <header class="planner-print-header">
        <div>
          <div class="planner-print-eyebrow">Weekly planner</div>
          <h1>${escapeHtml(formatWeekRange(days[0], days[6]))}</h1>
        </div>
        ${loadRows.length ? `<div class="planner-print-load">${loadRows.map(row => `<span><b>${escapeHtml(row.label)}</b> ${formatDuration(row.minutes)}</span>`).join('')}</div>` : ''}
      </header>

      <div class="planner-print-week">
        <div class="planner-print-day-head-row">
          <div class="planner-print-time-head">Ora</div>
          ${days.map(day => `
            <div class="planner-print-day-head">
              <span>${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(day))}</span>
              <strong>${day.getDate()}</strong>
            </div>`).join('')}
        </div>

        ${hasTournaments ? `
          <div class="planner-print-all-day-row">
            <div class="planner-print-all-day-label">Tornei</div>
            ${days.map(day => {
              const key = dateKey(day);
              const items = weekTournaments.filter(tournament => dateWithinRange(key, tournament.startDate, tournament.endDate || tournament.startDate));
              return `<div class="planner-print-all-day-cell">${items.map(tournament => renderPrintTournament(tournament, key)).join('')}</div>`;
            }).join('')}
          </div>` : ''}

        <div class="planner-print-timeline">
          <div class="planner-print-time-axis">
            ${hourMarks.map(minute => {
              const top = ((minute - bounds.start) / totalMinutes) * 100;
              return `<span style="top:${top.toFixed(4)}%">${formatMinutesAsTime(minute)}</span>`;
            }).join('')}
          </div>

          <div class="planner-print-days-canvas">
            ${hourMarks.map(minute => {
              const top = ((minute - bounds.start) / totalMinutes) * 100;
              return `<span class="planner-print-hour-line" style="top:${top.toFixed(4)}%"></span>`;
            }).join('')}
            ${days.map(day => renderPrintTimelineDay(day, weekEvents, people, bounds, totalMinutes)).join('')}
          </div>
        </div>
      </div>

      <footer class="planner-print-footer">${escapeHtml(formatMinutesAsTime(bounds.start))}–${escapeHtml(formatMinutesAsTime(bounds.end))} · ${escapeHtml(startKey)} — ${escapeHtml(endKey)}</footer>
    </section>`;
}

function renderPrintTimelineDay(day, weekEvents, people, bounds, totalMinutes) {
  const key = dateKey(day);
  const events = weekEvents.filter(event => event.date === key);
  const laidOut = layoutTimelineEvents(events);
  return `
    <div class="planner-print-day-canvas">
      ${laidOut.map(item => renderPrintTimelineEvent(item.event, people, bounds, totalMinutes, item.lane, item.laneCount)).join('')}
    </div>`;
}

function renderPrintTimelineEvent(event, people, bounds, totalMinutes, lane = 0, laneCount = 1) {
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';

  const duration = end - start;
  const top = ((start - bounds.start) / totalMinutes) * 100;
  const height = (duration / totalMinutes) * 100;
  const width = 100 / Math.max(1, laneCount);
  const left = lane * width;
  const companion = people.find(person => person.id === getCompanionId(event));
  const categoryLabel = CATEGORY_LABELS[event.category] || 'Attività';
  const sizeClass = duration < 30 ? 'tiny' : duration < 60 ? 'compact' : 'regular';

  return `
    <article class="planner-print-event planner-print-timeline-event category-${escapeAttr(event.category)} ${sizeClass}"
      style="top:${top.toFixed(4)}%; height:${height.toFixed(4)}%; left:calc(${left}% + .28mm); width:calc(${width}% - .56mm);">
      ${duration < 30 ? `
        <div class="planner-print-tiny-line"><b>${escapeHtml(event.startTime || '')}</b> ${escapeHtml(event.title || 'Attività')}</div>
      ` : `
        <div class="planner-print-event-top">
          <span>${escapeHtml(event.startTime || '—')}–${escapeHtml(event.endTime || '—')}</span>
          ${duration >= 60 ? `<small>${escapeHtml(categoryLabel)}</small>` : ''}
        </div>
        <strong>${escapeHtml(event.title || 'Attività')}</strong>
        ${duration >= 45 && event.location ? `<span class="planner-print-meta">${escapeHtml(event.location)}</span>` : ''}
        ${duration >= 75 && companion ? `<span class="planner-print-companion">${escapeHtml(companion.name)}</span>` : ''}
      `}
    </article>`;
}

function renderPrintTournament(tournament, currentDate) {
  const dayInfo = tournamentDayInfo(tournament, currentDate);
  return `
    <article class="planner-print-tournament">
      <strong>${escapeHtml(tournament.name || 'Torneo')}</strong>
      <span>${escapeHtml(tournament.circuit || 'Torneo')}${dayInfo ? ` · ${escapeHtml(dayInfo)}` : ''}</span>
    </article>`;
}

function filterEventsForPlannerView(events) {
  if (plannerView !== 'logistics') return events;
  const logisticsCategories = new Set(['tennis', 'physical', 'tournament', 'travel', 'medical']);
  return events.filter(event => getCompanionId(event) || logisticsCategories.has(event.category));
}

function renderTimelineEvent(event, people, bounds, lane = 0, laneCount = 1) {
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const top = Math.max(0, Math.round((start - bounds.start) * TIMELINE_PX_PER_MINUTE));
  const duration = end - start;
  const height = Math.max(30, Math.round(duration * TIMELINE_PX_PER_MINUTE) - 2);
  const width = 100 / Math.max(1, laneCount);
  const left = lane * width;
  const companionId = getCompanionId(event);
  const companion = people.find(person => person.id === companionId);
  const companionChip = companion
    ? `<span class="responsibility-chip"><b>Accompagnatore:</b> ${escapeHtml(companion.name)}</span>`
    : '';
  const sizeClass = duration < 25 ? 'tiny' : duration < 55 ? 'compact' : '';
  const logisticsOnly = plannerView === 'logistics';
  const titleText = `${event.startTime || ''}–${event.endTime || ''} · ${event.title || ''}${event.location ? ` · ${event.location}` : ''}`;

  return `
    <button class="planner-event planner-timeline-event category-${escapeAttr(event.category)} ${sizeClass} ${logisticsOnly ? 'logistics-focus' : ''}"
      type="button" data-event-id="${escapeAttr(event.id)}"
      title="${escapeAttr(titleText)}"
      style="top:${top}px; height:${height}px; left:calc(${left}% + 2px); width:calc(${width}% - 4px);">
      <span class="event-time">${escapeHtml(event.startTime || '—')}–${escapeHtml(event.endTime || '—')}</span>
      ${event.category === 'nutrition' ? `<span class="event-meal-type">🍏 ${escapeHtml(MEAL_TYPE_LABELS[event.mealType] || MEAL_TYPE_LABELS.other)}</span>` : ''}
      <strong>${escapeHtml(event.title)}</strong>
      ${event.category === 'nutrition' && event.mealDetails ? `<span class="event-meal-details">${escapeHtml(event.mealDetails)}</span>` : ''}
      ${event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : ''}
      ${plannerView !== 'athlete' && companionChip ? `<span class="event-responsibilities">${companionChip}</span>` : ''}
      ${plannerView === 'logistics' && !companionChip ? '<span class="event-unassigned">Nessun accompagnatore</span>' : ''}
      <span class="planner-resize-handle" data-resize-event aria-hidden="true"></span>
    </button>
  `;
}

function layoutTimelineEvents(events) {
  const sorted = [...events].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const lanes = [];
  const placed = sorted.map(event => {
    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);
    let lane = lanes.findIndex(lastEnd => lastEnd <= start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = end;
    return { event, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  return placed.map(item => ({ ...item, laneCount }));
}

function getTimelineBounds(events) {
  const validStarts = events.map(event => timeToMinutes(event.startTime)).filter(Number.isFinite);
  const validEnds = events.map(event => timeToMinutes(event.endTime)).filter(Number.isFinite);
  if (!validStarts.length || !validEnds.length) return { start: 8 * 60, end: 9 * 60 };

  const earliest = Math.min(...validStarts);
  const latest = Math.max(...validEnds);
  const start = Math.max(0, Math.floor(earliest / 60) * 60);
  let end = Math.min(24 * 60, Math.ceil(latest / 60) * 60);
  if (end <= start) end = Math.min(24 * 60, start + 60);
  return { start, end };
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return NaN;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

function formatMinutesAsTime(minutes) {
  const safe = Math.max(0, Math.min(24 * 60, minutes));
  if (safe === 24 * 60) return '24:00';
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function renderEvent(event, people) {
  const companionId = getCompanionId(event);
  const companion = people.find(person => person.id === companionId);
  const companionChip = companion
    ? `<span class="responsibility-chip"><b>Accompagnatore:</b> ${escapeHtml(companion.name)}</span>`
    : '';

  const logisticsOnly = plannerView === 'logistics';
  return `
    <button class="planner-event category-${escapeAttr(event.category)} ${logisticsOnly ? 'logistics-focus' : ''}" type="button" data-event-id="${escapeAttr(event.id)}">
      <span class="event-time">${escapeHtml(event.startTime || '—')}–${escapeHtml(event.endTime || '—')}</span>
      ${event.category === 'nutrition' ? `<span class="event-meal-type">🍏 ${escapeHtml(MEAL_TYPE_LABELS[event.mealType] || MEAL_TYPE_LABELS.other)}</span>` : ''}
      <strong>${escapeHtml(event.title)}</strong>
      ${event.category === 'nutrition' && event.mealDetails ? `<span class="event-meal-details">${escapeHtml(event.mealDetails)}</span>` : ''}
      ${event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : ''}
      ${plannerView !== 'athlete' && companionChip ? `<span class="event-responsibilities">${companionChip}</span>` : ''}
      ${plannerView === 'logistics' && !companionChip ? '<span class="event-unassigned">Nessun accompagnatore</span>' : ''}
    </button>
  `;
}

function renderTournamentWeekEvent(tournament, currentDate, people) {
  const support = people.find(person => person.id === tournament.supportPersonId);
  const dayInfo = tournamentDayInfo(tournament, currentDate);
  return `
    <button class="planner-event planner-tournament-event" type="button" data-week-tournament-id="${escapeAttr(tournament.id)}">
      <span class="event-time tournament-mini-meta">🏆 ${escapeHtml(tournament.circuit || 'Torneo')} ${dayInfo ? `· ${dayInfo}` : ''}</span>
      <strong>${escapeHtml(tournament.name || 'Torneo')}</strong>
      ${tournament.location ? `<span class="event-location">${escapeHtml(tournament.location)}</span>` : ''}
      ${plannerView !== 'athlete' && support ? `<span class="event-responsibilities"><span class="responsibility-chip"><b>Accompagnatore:</b> ${escapeHtml(support.name)}</span></span>` : ''}
    </button>
  `;
}

function renderPersonSummary(person, events, tournaments = []) {
  const duties = [];
  events.forEach(event => {
    if (getCompanionId(event) === person.id) duties.push({ role: 'companion', event });
  });
  tournaments.forEach(tournament => {
    if (tournament.supportPersonId === person.id) duties.push({ role: 'tournament', tournament });
  });
  return `
    <article class="person-summary-card">
      <div class="person-avatar">${escapeHtml(initials(person.name))}</div>
      <div class="person-summary-copy">
        <strong>${escapeHtml(person.name)}</strong>
        <span>${escapeHtml(person.relationship || 'Persona')}</span>
      </div>
      <div class="person-duty-count"><strong>${duties.length}</strong><span>incarichi</span></div>
    </article>
  `;
}

function renderAthleteLoadSummary(events) {
  const loadCategories = [
    { key: 'tennis', label: 'Tennis', marker: 'T' },
    { key: 'physical', label: 'Atletica', marker: 'A' },
    { key: 'mental', label: 'Mental', marker: 'M' },
    { key: 'school', label: 'Scuola', marker: 'S' },
  ];

  const rows = loadCategories.map(category => {
    const categoryEvents = events.filter(event => event.category === category.key);
    const minutes = categoryEvents.reduce((sum, event) => sum + durationMinutes(event), 0);
    return { ...category, minutes, sessions: categoryEvents.length };
  });
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const maxMinutes = Math.max(1, ...rows.map(row => row.minutes));

  return `
    <section class="panel planner-athlete-load-panel planner-summary-panel">
      <div class="panel-header planner-summary-header">
        <div>
          <h3>Carico atleta</h3>
          <p>Tennis, preparazione atletica, mental e scuola.</p>
        </div>
        <span class="planner-summary-total">${formatDuration(totalMinutes)}</span>
      </div>
      <div class="panel-body athlete-load-summary">
        ${rows.map(row => {
          const width = row.minutes ? Math.max(6, Math.round((row.minutes / maxMinutes) * 100)) : 0;
          return `
            <article class="athlete-load-row load-${row.key}">
              <span class="athlete-load-marker" aria-hidden="true">${row.marker}</span>
              <div class="athlete-load-main">
                <div class="athlete-load-copy">
                  <strong>${row.label}</strong>
                  <span>${row.sessions} ${row.sessions === 1 ? 'sessione' : 'sessioni'}</span>
                </div>
                <div class="athlete-load-track" aria-hidden="true"><span style="width:${width}%"></span></div>
              </div>
              <strong class="athlete-load-value">${formatDuration(row.minutes)}</strong>
            </article>`;
        }).join('')}
      </div>
    </section>
  `;
}

function renderTournamentPlanning(planner) {
  const allYearTournaments = planner.tournaments
    .filter(tournament => tournamentYearFor(tournament) === tournamentYear)
    .sort(compareTournaments);
  const filtered = allYearTournaments.filter(tournament => {
    const circuitMatch = tournamentCircuitFilter === 'all' || tournament.circuit === tournamentCircuitFilter;
    const statusMatch = tournamentStatusFilter === 'all' || tournament.status === tournamentStatusFilter;
    return circuitMatch && statusMatch;
  });

  const selectedCount = allYearTournaments.filter(tournament => ['target', 'planned', 'registered'].includes(tournament.status)).length;
  const registeredCount = allYearTournaments.filter(tournament => tournament.status === 'registered').length;
  const priorityACount = allYearTournaments.filter(tournament => tournament.priority === 'A' && !['skipped', 'played'].includes(tournament.status)).length;

  return `
    <section class="planner-head calendar-subhead tournament-season-head">
      <div>
        <div class="eyebrow">Tournament planning</div>
        <h2>Stagione ${tournamentYear}</h2>
        <p>Costruisci il calendario agonistico annuale prima di trasformarlo in logistica, match e costi.</p>
      </div>
      <div class="planner-head-actions">
        <button class="button button-primary" id="new-tournament" type="button">+ Aggiungi torneo</button>
      </div>
    </section>

    <section class="planner-kpis tournament-kpis" aria-label="Riepilogo stagione tornei">
      <div class="planner-kpi"><span>Tornei inseriti</span><strong>${allYearTournaments.length}</strong></div>
      <div class="planner-kpi"><span>Nel piano</span><strong>${selectedCount}</strong></div>
      <div class="planner-kpi"><span>Iscrizioni</span><strong>${registeredCount}</strong></div>
      <div class="planner-kpi ${priorityACount ? 'attention' : ''}"><span>Priorità A aperte</span><strong>${priorityACount}</strong></div>
    </section>

    <section class="panel tournament-toolbar">
      <div class="planner-navigation">
        <button class="icon-button" id="prev-tournament-year" type="button" aria-label="Anno precedente">←</button>
        <button class="button button-ghost" id="current-tournament-year" type="button">Anno corrente</button>
        <button class="icon-button" id="next-tournament-year" type="button" aria-label="Anno successivo">→</button>
      </div>
      <div class="tournament-filters">
        <label>
          <span>Circuito / tipo</span>
          <select id="tournament-circuit-filter">
            <option value="all">Tutti</option>
            ${TOURNAMENT_CIRCUITS.map(circuit => `<option value="${escapeAttr(circuit)}" ${tournamentCircuitFilter === circuit ? 'selected' : ''}>${escapeHtml(circuit)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Stato</span>
          <select id="tournament-status-filter">
            <option value="all">Tutti</option>
            ${Object.entries(TOURNAMENT_STATUSES).map(([value, label]) => `<option value="${value}" ${tournamentStatusFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
    </section>

    <section class="tournament-year-grid" aria-label="Planner tornei annuale">
      ${Array.from({ length: 12 }, (_, month) => renderTournamentMonth(month, filtered, planner.people)).join('')}
    </section>

    <section class="panel tournament-legend-panel">
      <div class="panel-header">
        <h3>Flusso di selezione</h3>
        <p>Lo stato serve a distinguere i tornei che stai ancora valutando da quelli già entrati nel piano reale.</p>
      </div>
      <div class="panel-body tournament-status-legend">
        ${Object.entries(TOURNAMENT_STATUSES).map(([value, label]) => `<span class="tournament-status status-${value}">${escapeHtml(label)}</span>`).join('')}
      </div>
    </section>

    ${renderTournamentDialog(planner.people)}
  `;
}

function renderTournamentMonth(monthIndex, tournaments, people) {
  const monthTournaments = tournaments.filter(tournament => {
    const start = parseDateOnly(tournament.startDate);
    return start && start.getFullYear() === tournamentYear && start.getMonth() === monthIndex;
  });
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date(tournamentYear, monthIndex, 1));
  return `
    <article class="tournament-month">
      <header class="tournament-month-header">
        <h3>${escapeHtml(capitalize(monthName))}</h3>
        <span>${monthTournaments.length}</span>
      </header>
      <div class="tournament-month-body">
        ${monthTournaments.length ? monthTournaments.map(tournament => renderTournamentCard(tournament, people)).join('') : '<p class="tournament-month-empty">Nessun torneo</p>'}
      </div>
      <button type="button" class="tournament-month-add" data-add-tournament-month="${monthIndex}" aria-label="Aggiungi torneo a ${escapeAttr(monthName)}">＋</button>
    </article>
  `;
}

function renderTournamentCard(tournament, people) {
  const support = people.find(person => person.id === tournament.supportPersonId);
  return `
    <button class="tournament-card priority-${escapeAttr(tournament.priority || 'B')}" type="button" data-tournament-id="${escapeAttr(tournament.id)}">
      <span class="tournament-card-topline">
        <span class="tournament-circuit">${escapeHtml(tournament.circuit || 'Torneo')}</span>
        <span class="tournament-priority">${escapeHtml(tournament.priority || 'B')}</span>
      </span>
      <strong>${escapeHtml(tournament.name || 'Torneo senza nome')}</strong>
      <span class="tournament-dates">${escapeHtml(formatTournamentDates(tournament.startDate, tournament.endDate))}</span>
      ${tournament.location ? `<span class="tournament-location">${escapeHtml(tournament.location)}</span>` : ''}
      <span class="tournament-card-meta">
        ${tournament.ageCategory ? `<span>${escapeHtml(tournament.ageCategory)}</span>` : ''}
        ${tournament.surface ? `<span>${escapeHtml(tournament.surface)}</span>` : ''}
      </span>
      <span class="tournament-status status-${escapeAttr(tournament.status || 'candidate')}">${escapeHtml(TOURNAMENT_STATUSES[tournament.status] || TOURNAMENT_STATUSES.candidate)}</span>
      ${support ? `<span class="tournament-support">Con ${escapeHtml(support.name)}</span>` : ''}
    </button>
  `;
}

function renderTournamentDialog(people) {
  const personOptions = `<option value="">— Da definire —</option>${people.map(person => `<option value="${escapeAttr(person.id)}">${escapeHtml(person.name)}</option>`).join('')}`;
  return `
    <dialog id="tournament-dialog" class="planner-dialog tournament-dialog">
      <form id="tournament-form" method="dialog">
        <input type="hidden" name="id" />
        <div class="dialog-head">
          <div><div class="eyebrow">Tournament planning</div><h3 id="tournament-dialog-title">Nuovo torneo</h3></div>
          <button type="button" class="dialog-close" data-close-tournament aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field full"><label>Nome torneo</label><input name="name" required placeholder="es. Tennis Europe U12 Bari" /></div>
          <div class="field"><label>Circuito / tipo</label><select name="circuit">${TOURNAMENT_CIRCUITS.map(circuit => `<option>${escapeHtml(circuit)}</option>`).join('')}</select></div>
          <div class="field"><label>Categoria</label><input name="ageCategory" placeholder="es. U12, U14, Assoluto" /></div>
          <div class="field"><label>Data inizio</label><input name="startDate" type="date" required /></div>
          <div class="field"><label>Data fine</label><input name="endDate" type="date" required /></div>
          <div class="field full"><label>Luogo / circolo</label><input name="location" placeholder="Città, circolo" /></div>
          <div class="field"><label>Superficie</label><select name="surface">${TOURNAMENT_SURFACES.map(surface => `<option>${surface}</option>`).join('')}</select></div>
          <div class="field"><label>Priorità</label><select name="priority">${Object.entries(TOURNAMENT_PRIORITIES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
          <div class="field"><label>Stato</label><select name="status">${Object.entries(TOURNAMENT_STATUSES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
          <div class="field"><label>Deadline iscrizione</label><input name="registrationDeadline" type="date" /></div>
          <div class="field full"><label>Accompagnatore / referente</label><select name="supportPersonId">${personOptions}</select></div>
          <div class="field full"><label>Note strategiche / logistiche</label><textarea name="notes" placeholder="Obiettivo del torneo, eventuale viaggio, criteri di scelta, note iscrizione..."></textarea></div>
          <div class="field full tournament-link-note">
            <strong>Collegamento automatico</strong>
            <span>Il torneo apparirà nelle settimane comprese fra data di inizio e data di fine. Non serve creare una seconda attività nel planner.</span>
          </div>
        </div>
        <div class="dialog-actions">
          <div class="dialog-delete-actions"><button type="button" class="button button-danger" id="delete-tournament" hidden>Elimina</button></div>
          <div class="dialog-save-actions">
            <button type="button" class="button button-ghost" data-close-tournament>Annulla</button>
            <button type="submit" class="button button-primary">Salva torneo</button>
          </div>
        </div>
      </form>
    </dialog>
  `;
}

function renderEventDialog(people, nutritionTemplates = []) {
  const personOptions = `<option value="">— Nessuno —</option>${people.map(person => `<option value="${escapeAttr(person.id)}">${escapeHtml(person.name)}</option>`).join('')}`;
  const mealTemplateOptions = `<option value="">— Personalizzato —</option>${nutritionTemplates.map(template => `<option value="${escapeAttr(template.id)}">${escapeHtml(template.title)}</option>`).join('')}`;
  const mealTypeOptions = Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return `
    <dialog id="event-dialog" class="planner-dialog">
      <form id="event-form" method="dialog">
        <input type="hidden" name="id" />
        <div class="dialog-head">
          <div><div class="eyebrow">Calendar</div><h3 id="event-dialog-title">Nuova attività</h3></div>
          <button type="button" class="dialog-close" data-close-dialog aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field full"><label>Titolo</label><input name="title" required placeholder="es. Tennis – privata" /></div>
          <div class="field"><label>Data</label><input name="date" type="date" required /></div>
          <div class="field"><label>Tipo</label><select name="category">${Object.entries(CATEGORY_LABELS).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>

          <div class="field full calendar-nutrition-fields" id="calendar-nutrition-fields" hidden>
            <label>Alimentazione</label>
            <div class="calendar-nutrition-grid">
              <div><span>Pasto salvato</span><select name="nutritionTemplateId">${mealTemplateOptions}</select></div>
              <div><span>Tipo pasto</span><select name="mealType">${mealTypeOptions}</select></div>
            </div>
            <div class="field calendar-meal-details-field"><label>Composizione / dettagli</label><textarea name="mealDetails" placeholder="Quantità, composizione o alternative"></textarea></div>
            <small>Seleziona un pasto salvato da Nutrition & Recovery oppure lascia “Personalizzato” e compila liberamente il titolo.</small>
          </div>

          <div class="field"><label>Inizio</label><input name="startTime" type="time" required /></div>
          <div class="field"><label>Fine</label><input name="endTime" type="time" required /></div>
          <div class="field full"><label>Luogo</label><input name="location" placeholder="es. MD Vita" /></div>

          <div class="field full assignment-section">
            <label>Logistica</label>
            <div class="assignment-grid assignment-grid-single">
              <div><span>Accompagnatore</span><select name="companionId">${personOptions}</select></div>
            </div>
          </div>

          <div class="field full"><label>Note</label><textarea name="notes" placeholder="Dettagli utili, materiale da portare, indicazioni..."></textarea></div>

          <div class="field full series-edit-note" id="series-edit-note" hidden>
            Questa attività fa parte di una serie ricorrente. Salvando, le modifiche verranno applicate a questa occorrenza e a tutte quelle successive della serie.
          </div>

          <div class="field full recurrence-box" id="recurrence-box">
            <div class="recurrence-options">
              <label class="recurrence-option">
                <input name="recurrenceMode" type="radio" value="none" />
                <span><strong>Non ripetere</strong></span>
              </label>
              <label class="recurrence-option">
                <input name="recurrenceMode" type="radio" value="weekly" checked />
                <span><strong>Ripeti ogni settimana</strong><small>Senza scadenza</small></span>
              </label>
              <label class="recurrence-option recurrence-option-interval">
                <input name="recurrenceMode" type="radio" value="interval" />
                <span class="recurrence-inline"><strong>Ripeti ogni</strong> <input id="repeat-interval-weeks" name="repeatIntervalWeeks" type="number" min="2" max="52" value="2" inputmode="numeric" disabled /> <strong>settimane</strong></span>
                <small>Senza scadenza</small>
              </label>
            </div>
            <p class="recurrence-note">Le ricorrenze sovrascrivono automaticamente qualsiasi attività già presente nello stesso intervallo orario, anche se la sovrapposizione è solo parziale.</p>
          </div>
        </div>
        <div class="dialog-actions">
          <div class="dialog-delete-actions">
            <button type="button" class="button button-ghost" id="copy-event" hidden>Copia</button>
            <button type="button" class="button button-danger" id="delete-event" hidden>Elimina</button>
            <button type="button" class="button button-danger-ghost" id="delete-series" hidden>Elimina serie</button>
          </div>
          <div class="dialog-save-actions">
            <button type="button" class="button button-ghost" data-close-dialog>Annulla</button>
            <button type="submit" class="button button-primary">Salva attività</button>
          </div>
        </div>
      </form>
    </dialog>
  `;
}

function renderPeopleDialog(people) {
  return `
    <dialog id="people-dialog" class="planner-dialog people-dialog">
      <div class="dialog-head">
        <div><div class="eyebrow">Family & support</div><h3>Persone e accompagnatori</h3></div>
        <button type="button" class="dialog-close" data-close-people aria-label="Chiudi">×</button>
      </div>
      <div class="dialog-body">
        <div class="people-list">
          ${people.map(person => `
            <form class="person-row" data-person-id="${escapeAttr(person.id)}">
              <input name="name" value="${escapeAttr(person.name)}" required aria-label="Nome" />
              <select name="relationship" aria-label="Ruolo">
                ${['Genitore','Familiare','Accompagnatore','Altro'].map(role => `<option ${person.relationship === role ? 'selected' : ''}>${role}</option>`).join('')}
              </select>
              <button type="submit" class="button button-ghost">Salva</button>
              <button type="button" class="button button-icon-danger" data-remove-person="${escapeAttr(person.id)}" aria-label="Rimuovi ${escapeAttr(person.name)}">×</button>
            </form>
          `).join('')}
        </div>
        <form id="add-person-form" class="add-person-form">
          <input name="name" placeholder="Nuova persona" required />
          <select name="relationship"><option>Genitore</option><option>Familiare</option><option>Accompagnatore</option><option>Altro</option></select>
          <button type="submit" class="button button-primary">+ Aggiungi</button>
        </form>
      </div>
      <div class="dialog-actions"><span></span><button type="button" class="button button-primary" data-close-people>Fine</button></div>
    </dialog>
  `;
}

function bindSectionSwitch({ main, store }) {
  main.querySelectorAll('[data-calendar-section]').forEach(button => {
    button.addEventListener('click', () => {
      calendarSection = button.dataset.calendarSection;
      renderCalendar({ main, title: document.querySelector('#page-title'), store });
    });
  });
}

function bindWeeklyPlanner({ main, store, planner, nutritionTemplates = [] }) {
  main.querySelector('#prev-week').addEventListener('click', () => { weekAnchor = addDays(weekAnchor, -7); rerender(main, store); });
  main.querySelector('#next-week').addEventListener('click', () => { weekAnchor = addDays(weekAnchor, 7); rerender(main, store); });
  main.querySelector('#today-week').addEventListener('click', () => { weekAnchor = startOfWeek(new Date()); rerender(main, store); });
  main.querySelector('#print-planner').addEventListener('click', () => window.print());

  main.querySelectorAll('[data-planner-view]').forEach(button => {
    button.addEventListener('click', () => {
      plannerView = button.dataset.plannerView;
      rerender(main, store);
    });
  });

  const eventDialog = main.querySelector('#event-dialog');
  const eventForm = main.querySelector('#event-form');
  const intervalInput = eventForm.elements.repeatIntervalWeeks;
  const nutritionFields = main.querySelector('#calendar-nutrition-fields');
  const mealTemplateSelect = eventForm.elements.nutritionTemplateId;
  let locationTouched = false;

  const syncNutritionControls = () => {
    const active = eventForm.elements.category.value === 'nutrition';
    nutritionFields.hidden = !active;
    if (active && !eventForm.elements.mealType.value) eventForm.elements.mealType.value = 'other';
  };

  const syncRecurrenceControls = () => {
    const mode = eventForm.elements.recurrenceMode.value || 'none';
    intervalInput.disabled = mode !== 'interval';
  };
  eventForm.querySelectorAll('input[name="recurrenceMode"]').forEach(input => {
    input.addEventListener('change', syncRecurrenceControls);
  });
  eventForm.elements.category.addEventListener('change', syncNutritionControls);
  mealTemplateSelect.addEventListener('change', () => {
    const template = nutritionTemplates.find(item => item.id === mealTemplateSelect.value);
    if (!template) return;
    eventForm.elements.mealType.value = template.type || 'other';
    eventForm.elements.title.value = template.title || '';
    eventForm.elements.mealDetails.value = template.details || '';
    if (!eventForm.elements.notes.value && template.notes) eventForm.elements.notes.value = template.notes;
  });

  eventForm.elements.location.addEventListener('input', () => { locationTouched = true; });
  eventForm.elements.date.addEventListener('change', () => {
    if (eventForm.elements.id.value || locationTouched) return;
    eventForm.elements.location.value = getLocationDefault(planner, eventForm.elements.date.value);
  });

  const openEvent = (event = null, date = null, prefill = {}) => {
    eventForm.reset();
    locationTouched = false;
    const selectedDate = event?.date || date || dateKey(new Date());
    eventForm.elements.id.value = event?.id || '';
    eventForm.elements.title.value = event?.title || '';
    eventForm.elements.date.value = selectedDate;
    eventForm.elements.category.value = event?.category || 'tennis';
    eventForm.elements.nutritionTemplateId.value = event?.nutritionTemplateId || '';
    eventForm.elements.mealType.value = event?.mealType || 'other';
    eventForm.elements.mealDetails.value = event?.mealDetails || '';
    eventForm.elements.startTime.value = event?.startTime || prefill.startTime || '16:00';
    eventForm.elements.endTime.value = event?.endTime || prefill.endTime || '17:30';
    eventForm.elements.location.value = event?.location ?? getLocationDefault(planner, selectedDate);
    eventForm.elements.companionId.value = getCompanionId(event);
    eventForm.elements.notes.value = event?.notes || '';
    const eventSeries = event?.seriesId
      ? (planner.recurringSeries || []).find(series => series.id === event.seriesId)
      : null;
    const recurrenceWeeks = Math.max(1, Math.min(52, Number(eventSeries?.intervalWeeks) || 1));
    eventForm.elements.recurrenceMode.value = eventSeries
      ? (recurrenceWeeks === 1 ? 'weekly' : 'interval')
      : (event ? 'none' : 'weekly');
    eventForm.elements.repeatIntervalWeeks.value = String(recurrenceWeeks === 1 ? 2 : recurrenceWeeks);
    syncRecurrenceControls();
    syncNutritionControls();
    main.querySelector('#event-dialog-title').textContent = event ? 'Modifica attività' : 'Nuova attività';
    main.querySelector('#recurrence-box').hidden = false;
    main.querySelector('#series-edit-note').hidden = !event?.seriesId;
    const copyButton = main.querySelector('#copy-event');
    const deleteButton = main.querySelector('#delete-event');
    const deleteSeriesButton = main.querySelector('#delete-series');
    copyButton.hidden = !event;
    deleteButton.hidden = !event;
    deleteSeriesButton.hidden = !event?.seriesId;
    eventDialog.showModal();
  };

  main.querySelector('#new-calendar-event').addEventListener('click', () => openEvent());
  main.querySelectorAll('[data-add-date]').forEach(button => button.addEventListener('click', () => openEvent(null, button.dataset.addDate)));
  main.querySelectorAll('[data-event-id]').forEach(button => button.addEventListener('click', () => {
    if (Date.now() < suppressTimelineEventClickUntil) return;
    openEvent(planner.events.find(event => event.id === button.dataset.eventId));
  }));
  main.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => eventDialog.close()));

  const clearClipboardButton = main.querySelector('#clear-calendar-clipboard');
  if (clearClipboardButton) {
    clearClipboardButton.addEventListener('click', () => {
      calendarClipboard = null;
      rerender(main, store);
    });
  }

  main.querySelector('#copy-event').addEventListener('click', () => {
    const id = eventForm.elements.id.value;
    const source = planner.events.find(item => item.id === id);
    if (!source) return;
    calendarClipboard = {
      title: source.title || 'Attività',
      durationMinutes: Math.max(TIMELINE_SNAP_MINUTES, durationMinutes(source) || TIMELINE_DEFAULT_EVENT_MINUTES),
      event: makeStandaloneCopyTemplate(source),
    };
    eventDialog.close();
    rerender(main, store);
  });

  bindTimelineDirectManipulation({ main, store, planner, openEvent });

  eventForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(eventForm).entries());
    if (!data.title.trim() || !data.date || !data.startTime || !data.endTime) return;
    if (data.endTime <= data.startTime) {
      await showInAppAlert('L’orario di fine deve essere successivo a quello di inizio.', { title: 'Orario non valido' });
      return;
    }
    const companionId = data.companionId || '';
    const base = {
      title: data.title.trim(), date: data.date, category: data.category,
      startTime: data.startTime, endTime: data.endTime, location: data.location.trim(), notes: data.notes.trim(),
      nutritionTemplateId: data.category === 'nutrition' ? (data.nutritionTemplateId || '') : '',
      mealType: data.category === 'nutrition' ? (data.mealType || 'other') : '',
      mealDetails: data.category === 'nutrition' ? (data.mealDetails || '').trim() : '',
      athleteId: store.getState().athlete.id,
      companionId,
      // Manteniamo un singolo campo legacy per compatibilità con eventuali moduli meno recenti.
      responsibilities: { stay: companionId },
    };
    store.update(state => {
      ensurePlannerShape(state);
      if (base.location || locationTouched) state.planner.locationDefaults[base.date] = base.location;

      const recurrenceMode = data.recurrenceMode || 'none';
      const intervalWeeks = recurrenceMode === 'weekly'
        ? 1
        : Math.max(2, Math.min(52, Number(data.repeatIntervalWeeks) || 2));

      if (data.id) {
        const index = state.planner.events.findIndex(item => item.id === data.id);
        if (index < 0) return;
        const current = state.planner.events[index];

        const linkedSeries = current.seriesId
          ? (state.planner.recurringSeries || []).find(series => series.id === current.seriesId)
          : null;

        // Un seriesId senza la relativa serie può restare da dati creati con versioni
        // precedenti. In quel caso l'attività va trattata come singola, non come serie.
        if (current.seriesId && !linkedSeries) current.seriesId = '';

        if (linkedSeries) {
          if (recurrenceMode === 'none') {
            stopRecurringSeriesFromOccurrence(state.planner, current, base);
          } else {
            updateRecurringSeriesFromOccurrence(state.planner, current, base, intervalWeeks);
          }
          return;
        }

        if (recurrenceMode === 'none') {
          state.planner.events[index] = { ...current, ...base, seriesId: '' };
        } else {
          // Conversione affidabile attività singola → serie: eliminiamo la vecchia
          // occorrenza e costruiamo subito l'intera serie, applicando la stessa
          // regola di overwrite usata per una serie creata da zero.
          state.planner.events.splice(index, 1);
          createRecurringSeries(state.planner, { ...base, seriesId: '' }, intervalWeeks);
        }
        return;
      }

      if (recurrenceMode === 'none') {
        state.planner.events.push({ ...base, id: uid('event'), seriesId: '' });
        return;
      }

      createRecurringSeries(state.planner, base, intervalWeeks);
    });
    eventDialog.close();
  });

  main.querySelector('#delete-event').addEventListener('click', async () => {
    const id = eventForm.elements.id.value;
    if (!id) return;
    const confirmed = await showInAppConfirm('Eliminare questa attività?', {
      title: 'Elimina attività', confirmLabel: 'Elimina', danger: true,
    });
    if (!confirmed) return;
    store.update(state => { state.planner.events = state.planner.events.filter(event => event.id !== id); });
    eventDialog.close();
  });

  main.querySelector('#delete-series').addEventListener('click', async () => {
    const id = eventForm.elements.id.value;
    const current = planner.events.find(event => event.id === id);
    if (!current?.seriesId) return;
    const confirmed = await showInAppConfirm('Eliminare tutte le attività di questa serie ricorrente?', {
      title: 'Elimina serie', confirmLabel: 'Elimina serie', danger: true,
    });
    if (!confirmed) return;
    store.update(state => {
      state.planner.events = state.planner.events.filter(event => event.seriesId !== current.seriesId);
      state.planner.recurringSeries = (state.planner.recurringSeries || []).filter(series => series.id !== current.seriesId);
    });
    eventDialog.close();
  });

  bindTournamentDialog({ main, store, planner, triggerSelector: '[data-week-tournament-id]' });

  const peopleDialog = main.querySelector('#people-dialog');
  main.querySelector('#manage-people').addEventListener('click', () => peopleDialog.showModal());
  main.querySelectorAll('[data-close-people]').forEach(button => button.addEventListener('click', () => peopleDialog.close()));
  main.querySelectorAll('.person-row').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      store.update(state => {
        const person = state.planner.people.find(item => item.id === form.dataset.personId);
        if (person) { person.name = data.name.trim(); person.relationship = data.relationship; }
      });
      peopleDialog.close();
    });
  });
  main.querySelectorAll('[data-remove-person]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.removePerson;
      const person = planner.people.find(item => item.id === id);
      const confirmed = await showInAppConfirm(`Rimuovere ${person?.name || 'questa persona'}? Gli incarichi già assegnati verranno liberati.`, {
        title: 'Rimuovi persona', confirmLabel: 'Rimuovi', danger: true,
      });
      if (!confirmed) return;
      store.update(state => {
        state.planner.people = state.planner.people.filter(item => item.id !== id);
        state.planner.events.forEach(event => {
          if (getCompanionId(event) === id) {
            event.companionId = '';
            event.responsibilities = { stay: '' };
          }
        });
        (state.planner.recurringSeries || []).forEach(series => {
          if (getCompanionId(series.template) === id) {
            series.template.companionId = '';
            series.template.responsibilities = { stay: '' };
          }
        });
        state.planner.tournaments.forEach(tournament => {
          if (tournament.supportPersonId === id) tournament.supportPersonId = '';
        });
      });
      peopleDialog.close();
    });
  });
  main.querySelector('#add-person-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    store.update(state => state.planner.people.push({ id: uid('person'), name: data.name.trim(), relationship: data.relationship }));
    peopleDialog.close();
  });
}

function bindTournamentPlanning({ main, store, planner }) {
  main.querySelector('#prev-tournament-year').addEventListener('click', () => { tournamentYear -= 1; rerender(main, store); });
  main.querySelector('#next-tournament-year').addEventListener('click', () => { tournamentYear += 1; rerender(main, store); });
  main.querySelector('#current-tournament-year').addEventListener('click', () => { tournamentYear = new Date().getFullYear(); rerender(main, store); });
  main.querySelector('#tournament-circuit-filter').addEventListener('change', event => { tournamentCircuitFilter = event.target.value; rerender(main, store); });
  main.querySelector('#tournament-status-filter').addEventListener('change', event => { tournamentStatusFilter = event.target.value; rerender(main, store); });

  const openForMonth = monthIndex => {
    const month = Number(monthIndex);
    const defaultDate = dateKey(new Date(tournamentYear, month, 1));
    openTournamentDialog({ main, planner, tournament: null, defaultDate });
  };

  main.querySelector('#new-tournament').addEventListener('click', () => {
    const defaultDate = tournamentYear === new Date().getFullYear() ? dateKey(new Date()) : `${tournamentYear}-01-01`;
    openTournamentDialog({ main, planner, tournament: null, defaultDate });
  });
  main.querySelectorAll('[data-add-tournament-month]').forEach(button => button.addEventListener('click', () => openForMonth(button.dataset.addTournamentMonth)));

  bindTournamentDialog({ main, store, planner, triggerSelector: '[data-tournament-id]' });
}

function bindTournamentDialog({ main, store, planner, triggerSelector }) {
  const dialog = main.querySelector('#tournament-dialog');
  const form = main.querySelector('#tournament-form');
  if (!dialog || !form) return;

  main.querySelectorAll(triggerSelector).forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.tournamentId || button.dataset.weekTournamentId;
      const tournament = planner.tournaments.find(item => item.id === id);
      if (tournament) openTournamentDialog({ main, planner, tournament });
    });
  });

  main.querySelectorAll('[data-close-tournament]').forEach(button => button.addEventListener('click', () => dialog.close()));

  if (!form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name.trim() || !data.startDate || !data.endDate) return;
      if (data.endDate < data.startDate) {
        await showInAppAlert('La data di fine non può precedere la data di inizio.', { title: 'Date non valide' });
        return;
      }
      const record = {
        name: data.name.trim(),
        circuit: data.circuit,
        ageCategory: data.ageCategory.trim(),
        startDate: data.startDate,
        endDate: data.endDate,
        location: data.location.trim(),
        surface: data.surface,
        priority: data.priority,
        status: data.status,
        registrationDeadline: data.registrationDeadline || '',
        supportPersonId: data.supportPersonId || '',
        notes: data.notes.trim(),
        athleteId: store.getState().athlete.id,
      };
      store.update(state => {
        if (!state.planner) state.planner = { people: [], events: [], tournaments: [] };
        if (!Array.isArray(state.planner.tournaments)) state.planner.tournaments = [];
        if (data.id) {
          const index = state.planner.tournaments.findIndex(item => item.id === data.id);
          if (index >= 0) state.planner.tournaments[index] = { ...state.planner.tournaments[index], ...record };
        } else {
          state.planner.tournaments.push({ id: uid('tournament'), ...record });
        }
      });
      dialog.close();
    });

    main.querySelector('#delete-tournament')?.addEventListener('click', async () => {
      const id = form.elements.id.value;
      if (!id) return;
      const confirmed = await showInAppConfirm('Eliminare questo torneo dalla programmazione annuale?', {
        title: 'Elimina torneo', confirmLabel: 'Elimina', danger: true,
      });
      if (!confirmed) return;
      store.update(state => { state.planner.tournaments = state.planner.tournaments.filter(tournament => tournament.id !== id); });
      dialog.close();
    });
  }
}

function openTournamentDialog({ main, planner, tournament = null, defaultDate = null }) {
  const dialog = main.querySelector('#tournament-dialog');
  const form = main.querySelector('#tournament-form');
  if (!dialog || !form) return;
  form.reset();
  const start = tournament?.startDate || defaultDate || dateKey(new Date());
  form.elements.id.value = tournament?.id || '';
  form.elements.name.value = tournament?.name || '';
  form.elements.circuit.value = tournament?.circuit || 'FITP';
  form.elements.ageCategory.value = tournament?.ageCategory || '';
  form.elements.startDate.value = start;
  form.elements.endDate.value = tournament?.endDate || start;
  form.elements.location.value = tournament?.location || '';
  form.elements.surface.value = tournament?.surface || 'Terra';
  form.elements.priority.value = tournament?.priority || 'B';
  form.elements.status.value = tournament?.status || 'candidate';
  form.elements.registrationDeadline.value = tournament?.registrationDeadline || '';
  form.elements.supportPersonId.value = tournament?.supportPersonId || '';
  form.elements.notes.value = tournament?.notes || '';
  main.querySelector('#tournament-dialog-title').textContent = tournament ? 'Modifica torneo' : 'Nuovo torneo';
  main.querySelector('#delete-tournament').hidden = !tournament;
  dialog.showModal();
}


function getCompanionId(event) {
  if (!event) return '';
  return event.companionId
    || event.responsibilities?.stay
    || event.responsibilities?.dropoff
    || event.responsibilities?.pickup
    || '';
}

function ensurePlannerShape(state) {
  if (!state.planner || typeof state.planner !== 'object') state.planner = {};
  if (!Array.isArray(state.planner.people)) state.planner.people = [];
  if (!Array.isArray(state.planner.events)) state.planner.events = [];
  if (!Array.isArray(state.planner.tournaments)) state.planner.tournaments = [];
  if (!Array.isArray(state.planner.recurringSeries)) state.planner.recurringSeries = [];
  if (!state.planner.locationDefaults || typeof state.planner.locationDefaults !== 'object') state.planner.locationDefaults = {};
}

function getLocationDefault(planner, date) {
  if (!date) return '';
  if (Object.prototype.hasOwnProperty.call(planner.locationDefaults || {}, date)) {
    return planner.locationDefaults[date] || '';
  }
  for (let i = planner.events.length - 1; i >= 0; i -= 1) {
    const event = planner.events[i];
    if (event.date === date && event.location) return event.location;
  }
  return '';
}

function updateRecurringSeriesFromOccurrence(planner, occurrence, base, intervalWeeks = null) {
  if (!occurrence?.seriesId) return;
  const series = (planner.recurringSeries || []).find(item => item.id === occurrence.seriesId);
  if (!series) {
    // Riferimento orfano: ricreiamo una serie valida invece di limitare
    // la modifica alla sola occorrenza corrente.
    planner.events = planner.events.filter(item => item.id !== occurrence.id);
    createRecurringSeries(planner, { ...base, seriesId: '' }, intervalWeeks || 1);
    return;
  }

  const originalDate = occurrence.date;
  const nextStartDate = base.date || originalDate;
  const cutoffDate = nextStartDate < originalDate ? nextStartDate : originalDate;
  const oldGeneratedThrough = series.generatedThrough || originalDate;
  const minimumHorizon = shiftDateString(nextStartDate, RECURRENCE_INITIAL_HORIZON_WEEKS * 7);
  const regenerateThrough = oldGeneratedThrough > minimumHorizon ? oldGeneratedThrough : minimumHorizon;

  // Manteniamo intatte le occorrenze storiche e riscriviamo questa e tutte le successive.
  planner.events = planner.events.filter(event => !(event.seriesId === series.id && event.date >= cutoffDate));

  series.startDate = nextStartDate;
  if (intervalWeeks != null) series.intervalWeeks = Math.max(1, Math.min(52, Number(intervalWeeks) || 1));
  series.template = { ...series.template, ...base, date: nextStartDate };
  series.generatedThrough = '';
  generateSeriesOccurrences(planner, series, regenerateThrough);
}


function stopRecurringSeriesFromOccurrence(planner, occurrence, base) {
  if (!occurrence?.seriesId) return;
  const seriesId = occurrence.seriesId;
  const cutoffDate = occurrence.date;

  // Le occorrenze precedenti restano nello storico ma non appartengono più
  // a una serie attiva. Da questa data in poi resta solo l'attività modificata.
  planner.events = planner.events
    .filter(event => !(event.seriesId === seriesId && event.date >= cutoffDate))
    .map(event => event.seriesId === seriesId ? { ...event, seriesId: '' } : event);
  planner.recurringSeries = (planner.recurringSeries || []).filter(series => series.id !== seriesId);

  const standalone = { ...occurrence, ...base, id: occurrence.id || uid('event'), seriesId: '' };
  overwriteOverlappingEvents(planner, standalone);
  planner.events.push(standalone);
}

function createRecurringSeries(planner, base, intervalWeeks) {
  if (!Array.isArray(planner.recurringSeries)) planner.recurringSeries = [];
  if (!Array.isArray(planner.events)) planner.events = [];
  const series = {
    id: uid('series'),
    startDate: base.date,
    intervalWeeks,
    generatedThrough: '',
    template: { ...base },
  };
  planner.recurringSeries.push(series);
  const initialThrough = shiftDateString(base.date, RECURRENCE_INITIAL_HORIZON_WEEKS * 7);
  generateSeriesOccurrences(planner, series, initialThrough);
}

function ensureRecurringCoverage(store, throughDate) {
  const state = store.getState();
  const seriesList = state.planner?.recurringSeries;
  if (!Array.isArray(seriesList) || !seriesList.length) return;
  const needsExtension = seriesList.some(series => {
    if (!series?.startDate || series.active === false) return false;
    return !series.generatedThrough || series.generatedThrough < throughDate;
  });
  if (!needsExtension) return;

  store.update(next => {
    ensurePlannerShape(next);
    next.planner.recurringSeries.forEach(series => {
      if (!series?.startDate || series.active === false) return;
      if (!series.generatedThrough || series.generatedThrough < throughDate) {
        generateSeriesOccurrences(next.planner, series, throughDate);
      }
    });
  });
}

function generateSeriesOccurrences(planner, series, throughDate) {
  const intervalWeeks = Math.max(1, Math.min(52, Number(series.intervalWeeks) || 1));
  let occurrenceDate = series.startDate;
  const previousThrough = series.generatedThrough || '';

  while (occurrenceDate <= throughDate) {
    if (!previousThrough || occurrenceDate > previousThrough) {
      const alreadyExists = planner.events.some(event => event.seriesId === series.id && event.date === occurrenceDate);
      if (!alreadyExists) {
        const candidate = {
          ...series.template,
          id: uid('event'),
          seriesId: series.id,
          date: occurrenceDate,
        };
        overwriteOverlappingEvents(planner, candidate);
        planner.events.push(candidate);
      }
    }
    occurrenceDate = shiftDateString(occurrenceDate, intervalWeeks * 7);
  }
  if (!series.generatedThrough || series.generatedThrough < throughDate) series.generatedThrough = throughDate;
}

function overwriteOverlappingEvents(planner, candidate) {
  planner.events = planner.events.filter(existing => {
    if (existing.date !== candidate.date) return true;
    if (existing.seriesId === candidate.seriesId) return true;
    return !timeRangesOverlap(existing.startTime, existing.endTime, candidate.startTime, candidate.endTime);
  });
}

function timeRangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA < endB && endA > startB;
}

function bindTimelineDirectManipulation({ main, store, planner, openEvent }) {
  const timelineBody = main.querySelector('.planner-timeline-body');
  if (!timelineBody) return;
  const bounds = {
    start: Number(timelineBody.dataset.timelineStart),
    end: Number(timelineBody.dataset.timelineEnd),
  };
  if (!Number.isFinite(bounds.start) || !Number.isFinite(bounds.end)) return;

  const dayElements = [...main.querySelectorAll('.planner-timeline-day')];

  dayElements.forEach(day => {
    day.addEventListener('click', event => {
      if (Date.now() < suppressTimelineEventClickUntil) return;
      if (event.target.closest('.planner-timeline-event')) return;
      const startMinutes = pointToTimelineMinutes(day, event.clientY, bounds, TIMELINE_SNAP_MINUTES);
      const endMinutes = Math.min(24 * 60, startMinutes + TIMELINE_DEFAULT_EVENT_MINUTES);
      const date = day.dataset.date;
      if (!date) return;

      if (calendarClipboard?.event) {
        const duration = Math.max(TIMELINE_SNAP_MINUTES, Number(calendarClipboard.durationMinutes) || TIMELINE_DEFAULT_EVENT_MINUTES);
        const copyEnd = Math.min(24 * 60, startMinutes + duration);
        const copied = {
          ...calendarClipboard.event,
          id: uid('event'),
          seriesId: '',
          date,
          startTime: formatMinutesAsTime(startMinutes),
          endTime: formatMinutesAsTime(copyEnd),
        };
        store.update(state => {
          ensurePlannerShape(state);
          state.planner.events.push(copied);
        });
        calendarClipboard = null;
        rerender(main, store);
        return;
      }

      openEvent(null, date, {
        startTime: formatMinutesAsTime(startMinutes),
        endTime: formatMinutesAsTime(endMinutes),
      });
    });
  });

  main.querySelectorAll('.planner-timeline-event[data-event-id]').forEach(element => {
    element.addEventListener('pointerdown', pointerDownEvent => {
      if (pointerDownEvent.button !== 0) return;
      const eventId = element.dataset.eventId;
      const source = planner.events.find(item => item.id === eventId);
      if (!source) return;

      const resizing = Boolean(pointerDownEvent.target.closest('[data-resize-event]'));
      const sourceStart = timeToMinutes(source.startTime);
      const sourceEnd = timeToMinutes(source.endTime);
      if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) return;

      const startX = pointerDownEvent.clientX;
      const startY = pointerDownEvent.clientY;
      const originalRect = element.getBoundingClientRect();
      const duration = sourceEnd - sourceStart;
      const pointerOffsetMinutes = Math.max(0, Math.min(duration, Math.round(((startY - originalRect.top) / Math.max(1, originalRect.height)) * duration)));
      let active = false;
      let preview = null;
      let candidate = null;

      const makeGhost = () => {
        const ghost = element.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.classList.add('planner-drag-ghost');
        ghost.querySelector('.planner-resize-handle')?.remove();
        document.body.appendChild(ghost);
        return ghost;
      };

      const onMove = moveEvent => {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!active && distance < 5) return;
        if (!active) {
          active = true;
          suppressTimelineEventClickUntil = Date.now() + 500;
          element.classList.add(resizing ? 'is-resizing' : 'is-dragging');
          if (!resizing) preview = makeGhost();
        }
        moveEvent.preventDefault();

        if (resizing) {
          const day = element.closest('.planner-timeline-day');
          if (!day) return;
          let newEnd = pointToTimelineMinutes(day, moveEvent.clientY, bounds, TIMELINE_SNAP_MINUTES);
          newEnd = Math.max(sourceStart + TIMELINE_SNAP_MINUTES, newEnd);
          newEnd = Math.min(24 * 60, newEnd);
          candidate = { date: source.date, startTime: source.startTime, endTime: formatMinutesAsTime(newEnd) };
          element.style.height = `${Math.max(30, Math.round((newEnd - sourceStart) * TIMELINE_PX_PER_MINUTE) - 2)}px`;
          return;
        }

        const targetDay = dayAtClientX(dayElements, moveEvent.clientX) || element.closest('.planner-timeline-day');
        if (!targetDay) return;
        const pointerMinute = pointToTimelineMinutes(targetDay, moveEvent.clientY, bounds, TIMELINE_SNAP_MINUTES);
        let newStart = snapMinutes(pointerMinute - pointerOffsetMinutes, TIMELINE_SNAP_MINUTES);
        const latestVisibleStart = Math.max(bounds.start, bounds.end - duration);
        newStart = Math.max(bounds.start, Math.min(latestVisibleStart, newStart));
        const newEnd = newStart + duration;
        candidate = {
          date: targetDay.dataset.date,
          startTime: formatMinutesAsTime(newStart),
          endTime: formatMinutesAsTime(newEnd),
        };

        if (preview) {
          const targetRect = targetDay.getBoundingClientRect();
          const top = targetRect.top + ((newStart - bounds.start) / Math.max(1, bounds.end - bounds.start)) * targetRect.height;
          preview.style.left = `${targetRect.left + 2}px`;
          preview.style.top = `${top}px`;
          preview.style.width = `${Math.max(30, targetRect.width - 4)}px`;
          preview.style.height = `${Math.max(30, ((duration) / Math.max(1, bounds.end - bounds.start)) * targetRect.height - 2)}px`;
          const timeNode = preview.querySelector('.event-time');
          if (timeNode) timeNode.textContent = `${candidate.startTime}–${candidate.endTime}`;
        }
      };

      const finish = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        preview?.remove();
        element.classList.remove('is-dragging', 'is-resizing');
        element.style.height = '';
      };

      const onCancel = () => finish();
      const onUp = upEvent => {
        if (active) {
          upEvent.preventDefault();
          suppressTimelineEventClickUntil = Date.now() + 500;
          if (candidate) applyDirectCalendarChange(store, source, candidate);
          finish();
          rerender(main, store);
          return;
        }
        finish();
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    });
  });
}

function pointToTimelineMinutes(dayElement, clientY, bounds, snap = 15) {
  const rect = dayElement.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
  const raw = bounds.start + ratio * (bounds.end - bounds.start);
  return Math.max(0, Math.min(24 * 60, snapMinutes(raw, snap)));
}

function dayAtClientX(dayElements, clientX) {
  let nearest = null;
  let nearestDistance = Infinity;
  dayElements.forEach(day => {
    const rect = day.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) {
      nearest = day;
      nearestDistance = 0;
      return;
    }
    const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right;
    if (distance < nearestDistance) {
      nearest = day;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function snapMinutes(value, snap = 15) {
  return Math.round(Number(value || 0) / snap) * snap;
}

function makeStandaloneCopyTemplate(event) {
  const { id, seriesId, date, startTime, endTime, ...rest } = event || {};
  return { ...rest };
}

function makeRecurringBaseFromEvent(event, patch = {}) {
  const { id, seriesId, ...rest } = event || {};
  return { ...rest, ...patch };
}

function applyDirectCalendarChange(store, sourceEvent, patch) {
  store.update(state => {
    ensurePlannerShape(state);
    const index = state.planner.events.findIndex(item => item.id === sourceEvent.id);
    if (index < 0) return;
    const current = state.planner.events[index];
    const linkedSeries = current.seriesId
      ? (state.planner.recurringSeries || []).find(series => series.id === current.seriesId)
      : null;

    if (linkedSeries) {
      const base = makeRecurringBaseFromEvent(current, patch);
      updateRecurringSeriesFromOccurrence(state.planner, current, base, linkedSeries.intervalWeeks || 1);
      return;
    }

    state.planner.events[index] = { ...current, ...patch };
  });
}

function calendarSectionButton(value, label) {
  return `<button type="button" role="tab" aria-selected="${calendarSection === value}" class="calendar-section-button ${calendarSection === value ? 'active' : ''}" data-calendar-section="${value}">${label}</button>`;
}

function viewButton(value, label) {
  return `<button type="button" class="planner-view-button ${plannerView === value ? 'active' : ''}" data-planner-view="${value}">${label}</button>`;
}

function rerender(main, store) {
  renderCalendar({ main, title: document.querySelector('#page-title'), store });
}

function durationMinutes(event) {
  if (!event.startTime || !event.endTime) return 0;
  const [sh, sm] = event.startTime.split(':').map(Number);
  const [eh, em] = event.endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function compareEvents(a, b) { return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`); }
function compareTournaments(a, b) { return `${a.startDate || ''} ${a.name || ''}`.localeCompare(`${b.startDate || ''} ${b.name || ''}`); }
function startOfWeek(input) { const date = new Date(input.getFullYear(), input.getMonth(), input.getDate()); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date; }
function addDays(input, days) { const date = new Date(input.getFullYear(), input.getMonth(), input.getDate()); date.setDate(date.getDate() + days); return date; }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function shiftDateString(value, days) { const [y,m,d] = value.split('-').map(Number); return dateKey(addDays(new Date(y, m - 1, d), days)); }
function parseDateOnly(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y,m,d] = value.split('-').map(Number); return new Date(y, m - 1, d); }
function dateWithinRange(value, start, end) { return Boolean(value && start && end && value >= start && value <= end); }
function dateRangesOverlap(aStart, aEnd, bStart, bEnd) { return Boolean(aStart && aEnd && bStart && bEnd && aStart <= bEnd && aEnd >= bStart); }
function tournamentYearFor(tournament) { return parseDateOnly(tournament.startDate)?.getFullYear() || 0; }
function formatWeekRange(start, end) {
  const fmtDay = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });
  const fmtEnd = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${fmtEnd.format(end)}`;
  return `${fmtDay.format(start)} – ${fmtEnd.format(end)}`;
}
function formatTournamentDates(startValue, endValue) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue || startValue);
  if (!start || !end) return 'Date da definire';
  const sameDay = startValue === (endValue || startValue);
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const short = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
  if (sameDay) return short.format(start);
  if (sameMonth) return `${start.getDate()}–${short.format(end)}`;
  return `${short.format(start)} – ${short.format(end)}`;
}
function tournamentDayInfo(tournament, currentDate) {
  const start = parseDateOnly(tournament.startDate);
  const end = parseDateOnly(tournament.endDate || tournament.startDate);
  const current = parseDateOnly(currentDate);
  if (!start || !end || !current) return '';
  const total = Math.round((end - start) / 86400000) + 1;
  if (total <= 1) return '';
  const day = Math.round((current - start) / 86400000) + 1;
  return `giorno ${day}/${total}`;
}
function capitalize(value='') { return value ? value[0].toUpperCase() + value.slice(1) : value; }
function initials(name='') { return name.trim().split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase() || '?'; }
function uid(prefix='id') { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function escapeHtml(value='') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function escapeAttr(value='') { return escapeHtml(value); }
