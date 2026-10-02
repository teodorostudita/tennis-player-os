import { canReadModule, canWriteModule } from '../cloud/access.js?v=1.2.4';
import { getCurrentUserDisplayName } from '../cloud/accountAccess.js?v=1.2.4';
import { showInAppConfirm } from '../ui/inAppMessages.js?v=1.2.4';

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

const CATEGORY_ICONS = {
  tennis: '🎾',
  physical: '🏋️',
  school: '📚',
  recovery: '◌',
  tournament: '🏆',
  travel: '↗',
  medical: '♡',
  personal: '•',
  nutrition: '🍏',
  mental: '🧠',
};

const LOGISTICS_CATEGORIES = new Set(['tennis', 'physical', 'tournament', 'travel', 'medical']);
const SPORT_CATEGORIES = new Set(['tennis', 'physical', 'tournament']);
const MISSED_ELIGIBLE_CATEGORIES = new Set(['tennis', 'physical']);
const SECTION_KEYS = {
  calendar: 'tpos.calendar.section',
  economics: 'tpos.economics.section',
  equipment: 'tpos.equipment.section',
};

let refreshTimer = null;

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

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateOnly(value = '') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function daysFrom(today, value) {
  const target = parseDateOnly(value);
  const base = parseDateOnly(today);
  if (!target || !base) return null;
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function formatDate(value = '', withYear = false) {
  const date = parseDateOnly(value);
  if (!date) return value || '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
}

function formatMoney(value, currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function timeToMinutes(value = '') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function effectiveEndMinutes(event = {}) {
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);
  if (end != null && start != null && end > start) return end;
  return start == null ? null : Math.min(24 * 60, start + 60);
}

function eventDateTime(event = {}, which = 'start') {
  if (!event.date) return null;
  const minutes = which === 'end'
    ? effectiveEndMinutes(event)
    : timeToMinutes(event.startTime);
  if (minutes == null) return null;
  const [year, month, day] = String(event.date).split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function compareEvents(a, b) {
  return `${a.date || ''} ${a.startTime || ''}`.localeCompare(`${b.date || ''} ${b.startTime || ''}`);
}

function formatClock(value = '') {
  return String(value || '').slice(0, 5) || '—';
}

function formatRange(event = {}) {
  return event.endTime
    ? `${formatClock(event.startTime)}–${formatClock(event.endTime)}`
    : formatClock(event.startTime);
}

function greeting(hour) {
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function todayEvents(planner, today) {
  return (planner.events || [])
    .filter(event => event?.date === today)
    .sort(compareEvents);
}

function currentEvents(events, nowMinutes) {
  return events.filter(event => {
    const start = timeToMinutes(event.startTime);
    const end = effectiveEndMinutes(event);
    return start != null && end != null && nowMinutes >= start && nowMinutes < end;
  });
}

function nextEvent(planner, now) {
  const nowMs = now.getTime();
  return [...(planner.events || [])]
    .sort(compareEvents)
    .find(event => {
      const start = eventDateTime(event, 'start');
      return start && start.getTime() > nowMs;
    }) || null;
}

function eventState(event, nowMinutes) {
  const start = timeToMinutes(event.startTime);
  const end = effectiveEndMinutes(event);
  if (start == null) return 'upcoming';
  if (end != null && nowMinutes >= end) return 'past';
  if (end != null && nowMinutes >= start && nowMinutes < end) return 'current';
  return 'upcoming';
}

function companionId(event = {}) {
  return event.companionId
    || event.responsibilities?.stay
    || event.responsibilities?.dropoff
    || event.responsibilities?.pickup
    || '';
}

function companionName(event, people = []) {
  const id = companionId(event);
  return people.find(person => person.id === id)?.name || '';
}

function hasExplicitNoCompanion(event = {}) {
  return event.companionMode === 'none';
}

function uid(prefix = 'id') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function checkinForToday(nutrition, today) {
  const recoveryLogs = Array.isArray(nutrition?.recoveryLogs) ? nutrition.recoveryLogs : [];
  const sleepLogs = Array.isArray(nutrition?.sleepLogs) ? nutrition.sleepLogs : [];
  return recoveryLogs.find(item => item?.date === today)
    || sleepLogs.find(item => item?.date === today)
    || null;
}

function checkoutForToday(nutrition, today) {
  const rows = Array.isArray(nutrition?.trainingCheckouts) ? nutrition.trainingCheckouts : [];
  return rows.find(item => item?.date === today) || null;
}

function finalSportEvent(events) {
  return [...events]
    .filter(event => SPORT_CATEGORIES.has(event.category) && event.attendanceStatus !== 'missed')
    .sort((a, b) => (effectiveEndMinutes(a) ?? -1) - (effectiveEndMinutes(b) ?? -1))
    .at(-1) || null;
}

function activeTournament(planner, today) {
  return (planner.tournaments || []).find(tournament => {
    const start = tournament.startDate || '';
    const end = tournament.endDate || start;
    return start && today >= start && today <= end;
  }) || null;
}

function completedEventMinutes(event, now = new Date()) {
  if (event?.attendanceStatus === 'missed') return 0;
  const start = timeToMinutes(event?.startTime);
  const end = timeToMinutes(event?.endTime);
  if (start == null || end == null || end <= start) return 0;

  const today = localDateKey(now);
  const eventDate = String(event?.date || '');
  if (!eventDate || eventDate > today) return 0;
  if (eventDate < today) return end - start;

  const current = minutesNow(now);
  if (current <= start) return 0;
  if (current >= end) return end - start;
  return current - start;
}

function normalizeSurface(value = '') {
  return String(value || '').trim().toLowerCase();
}

function plannedMinutesSince(startDate, planner, predicate, now) {
  const firstDate = String(startDate || '');
  if (!firstDate) return null;
  const today = localDateKey(now);
  if (firstDate > today) return 0;
  return (planner.events || [])
    .filter(event => String(event?.date || '') >= firstDate
      && String(event?.date || '') <= today
      && event?.attendanceStatus !== 'missed'
      && predicate(event))
    .reduce((sum, event) => sum + completedEventMinutes(event, now), 0);
}

function tennisMinutesSince(startDate, planner, now) {
  return plannedMinutesSince(startDate, planner, event => event?.category === 'tennis', now);
}

function shoeMinutes(shoe, planner, now) {
  const surface = normalizeSurface(shoe?.surface);
  if (surface === 'athletics') {
    return plannedMinutesSince(shoe.startDate, planner, event => event?.category === 'physical', now);
  }
  if (!surface || surface === 'all court') {
    return tennisMinutesSince(shoe.startDate, planner, now);
  }
  return plannedMinutesSince(
    shoe.startDate,
    planner,
    event => event?.category === 'tennis' && normalizeSurface(event.surface) === surface,
    now,
  );
}

function lifecycle(actualMinutes, plannedHours) {
  const planned = Number(plannedHours);
  if (!Number.isFinite(actualMinutes) || !Number.isFinite(planned) || planned <= 0) return null;
  const usedHours = Math.max(0, actualMinutes) / 60;
  const ratio = usedHours / planned;
  return {
    usedHours,
    plannedHours: planned,
    remainingHours: planned - usedHours,
    ratio,
    remainingPct: Math.max(0, (1 - ratio) * 100),
  };
}

function currentStringJob(equipment) {
  const racketId = equipment?.primaryRacketId || '';
  if (!racketId) return null;
  return [...(equipment?.stringJobs || [])]
    .filter(job => job?.racketId === racketId && job?.status === 'installed')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
}

function equipmentAttentionItems(state, now) {
  if (!canReadModule('equipment')) return [];
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const rows = [];

  const stringJob = currentStringJob(equipment);
  if (stringJob) {
    const life = lifecycle(tennisMinutesSince(stringJob.date, planner, now), stringJob.hoursUsed);
    if (life && life.ratio >= .75) {
      const overdue = life.ratio >= 1;
      rows.push({
        type: 'equipment',
        tone: overdue || life.ratio >= .9 ? 'danger' : 'warning',
        icon: '◌',
        title: overdue ? 'Corde oltre la vita prevista' : 'Corde vicine alla sostituzione',
        detail: `${stringJob.stringName || 'Incordatura corrente'} · ${overdue ? `${Math.abs(life.remainingHours).toFixed(1)} h oltre soglia` : `${Math.max(0, life.remainingHours).toFixed(1)} h residue`}`,
        route: 'equipment',
        section: 'strings',
        sort: overdue ? -30 : -5,
      });
    }
  }

  for (const shoe of (equipment.shoes || []).filter(item => item?.status === 'active')) {
    const life = lifecycle(shoeMinutes(shoe, planner, now), shoe.hoursUsed);
    if (!life || life.ratio < .75) continue;
    const overdue = life.ratio >= 1;
    rows.push({
      type: 'equipment',
      tone: overdue || life.ratio >= .9 ? 'danger' : 'warning',
      icon: '👟',
      title: overdue ? 'Scarpe oltre la vita prevista' : 'Scarpe vicine alla sostituzione',
      detail: `${[shoe.brand, shoe.model].filter(Boolean).join(' ') || 'Scarpe in uso'}${shoe.surface ? ` · ${shoe.surface}` : ''} · ${overdue ? `${Math.abs(life.remainingHours).toFixed(1)} h oltre soglia` : `${Math.max(0, life.remainingHours).toFixed(1)} h residue`}`,
      route: 'equipment',
      section: 'shoes',
      sort: overdue ? -29 : -4,
    });
  }

  return rows;
}

function paymentAttentionItems(state, today) {
  if (!canReadModule('economics')) return [];
  const economics = state.economics || {};
  const currency = economics.currency || 'EUR';
  return (Array.isArray(economics.entries) ? economics.entries : [])
    .filter(entry => entry?.direction !== 'income' && !['paid', 'cancelled'].includes(entry?.status))
    .map(entry => ({ entry, days: entry.dueDate ? daysFrom(today, entry.dueDate) : null }))
    .filter(({ entry, days }) => entry.status === 'due' || days == null || days <= 30)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 5)
    .map(({ entry, days }, index) => {
      const overdue = days != null && days < 0;
      const imminent = days != null && days <= 7;
      const dateCopy = days == null
        ? 'Scadenza non indicata'
        : overdue
          ? `Scaduto da ${Math.abs(days)} g`
          : days === 0
            ? 'Scade oggi'
            : `Scade tra ${days} g · ${formatDate(entry.dueDate)}`;
      return {
        type: 'payment',
        tone: overdue || imminent ? 'danger' : 'warning',
        icon: '€',
        title: entry.description || entry.payee || 'Pagamento da fare',
        detail: `${formatMoney(entry.amount, currency)}${entry.payee ? ` · ${entry.payee}` : ''} · ${dateCopy}`,
        route: 'economics',
        section: 'payments',
        sort: overdue ? -50 + index : -20 + index,
      };
    });
}

function certificateAttentionItems(state, today) {
  if (!canReadModule('health')) return [];
  const expiry = state.health?.certificate?.expiryDate || '';
  if (!expiry) return [];
  const days = daysFrom(today, expiry);
  if (days == null || days > 60) return [];
  const expired = days < 0;
  return [{
    type: 'health',
    tone: expired || days <= 14 ? 'danger' : days <= 30 ? 'warning' : 'info',
    icon: '♡',
    title: expired ? 'Certificato agonistico scaduto' : 'Certificato agonistico in scadenza',
    detail: expired
      ? `Scaduto il ${formatDate(expiry, true)} · ${Math.abs(days)} giorni fa`
      : `Scade il ${formatDate(expiry, true)} · tra ${days} giorni`,
    route: 'health',
    sort: expired ? -60 : -40 + Math.min(days, 39) / 100,
  }];
}

function healthRestrictionItems(state) {
  if (!canReadModule('health')) return [];
  const health = state.health || {};
  const rows = [];
  const physioRestrictions = String(health.physio?.restrictions || '').trim();
  if (physioRestrictions) {
    rows.push({
      type: 'health', tone: 'warning', icon: '♡', title: 'Restrizione attiva',
      detail: physioRestrictions, route: 'health', sort: -10,
    });
  }
  for (const injury of (Array.isArray(health.injuries) ? health.injuries : [])) {
    if (injury?.status === 'resolved' || injury?.restrictionLevel === 'none' || !String(injury?.restrictions || '').trim()) continue;
    rows.push({
      type: 'health', tone: 'warning', icon: '♡',
      title: injury.diagnosis || injury.subdistrict || 'Indicazione sanitaria attiva',
      detail: injury.restrictions,
      route: 'health', sort: -9,
    });
  }
  return rows.slice(0, 3);
}

function makeupAttentionItems(state, today) {
  if (!canReadModule('calendar')) return [];
  const rows = Array.isArray(state.planner?.makeups) ? state.planner.makeups : [];
  return rows
    .filter(item => ['pending', 'planned'].includes(item?.status))
    .sort((a, b) => String(a.originalDate || '').localeCompare(String(b.originalDate || '')))
    .map((item, index) => {
      if (item.status === 'planned') {
        const days = daysFrom(today, item.scheduledDate);
        return {
          type: 'makeup', tone: days != null && days <= 2 ? 'info' : 'neutral', icon: '↺',
          title: 'Recupero programmato',
          detail: `${item.originalTitle || 'Allenamento'} · ${item.scheduledDate ? `${formatDate(item.scheduledDate)} ${item.scheduledStartTime || ''}`.trim() : 'data da verificare'}`,
          route: 'calendar', section: 'makeups', sort: 20 + index,
        };
      }
      return {
        type: 'makeup', tone: 'warning', icon: '↺',
        title: 'Recupero da programmare',
        detail: `${item.originalTitle || 'Allenamento'} · saltato ${formatDate(item.originalDate)}`,
        route: 'calendar', section: 'makeups', sort: -25 + index,
      };
    });
}

function registrationDeadlineItems(state, today) {
  if (!canReadModule('calendar')) return [];
  return (state.planner?.tournaments || [])
    .filter(item => item?.registrationDeadline && !['played', 'skipped'].includes(item.status))
    .map(item => ({ item, days: daysFrom(today, item.registrationDeadline) }))
    .filter(({ days }) => days != null && days >= 0 && days <= 14)
    .sort((a, b) => a.days - b.days)
    .map(({ item, days }, index) => ({
      type: 'tournament', tone: days <= 3 ? 'danger' : 'warning', icon: '🏆',
      title: 'Deadline iscrizione torneo',
      detail: `${item.name || 'Torneo'} · ${days === 0 ? 'oggi' : `tra ${days} g`} · ${formatDate(item.registrationDeadline)}`,
      route: 'calendar', section: 'tournaments', sort: -15 + index,
    }));
}

function unassignedTodayItems(state, today) {
  if (!canReadModule('calendar')) return [];
  const people = state.planner?.people || [];
  return todayEvents(state.planner || {}, today)
    .filter(event => LOGISTICS_CATEGORIES.has(event.category)
      && event.attendanceStatus !== 'missed'
      && !hasExplicitNoCompanion(event)
      && !companionName(event, people))
    .map((event, index) => ({
      type: 'calendar', tone: 'warning', icon: '▣',
      title: 'Accompagnatore da assegnare',
      detail: `${formatClock(event.startTime)} · ${event.title || CATEGORY_LABELS[event.category] || 'Attività'}${event.location ? ` · ${event.location}` : ''}`,
      route: 'calendar', sort: -35 + index,
    }));
}

function buildAttentionItems(state, now) {
  const today = localDateKey(now);
  return [
    ...unassignedTodayItems(state, today),
    ...makeupAttentionItems(state, today),
    ...paymentAttentionItems(state, today),
    ...certificateAttentionItems(state, today),
    ...equipmentAttentionItems(state, now),
    ...registrationDeadlineItems(state, today),
    ...healthRestrictionItems(state),
  ].sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}

function renderNowCard(current, following, planner, now) {
  const event = current[0] || following;
  if (!event) {
    return `
      <section class="parent-home-now clear">
        <div class="parent-home-kicker">Adesso</div>
        <div class="parent-home-now-main">
          <span class="parent-home-now-icon">✓</span>
          <div><h2>Nessun impegno imminente</h2><p>Il planner non segnala altre attività nelle prossime ore.</p></div>
        </div>
      </section>`;
  }

  const live = current.length > 0;
  const name = companionName(event, planner.people || []);
  const explicitNoCompanion = hasExplicitNoCompanion(event);
  const needsCompanion = LOGISTICS_CATEGORIES.has(event.category) && !name && !explicitNoCompanion;
  return `
    <section class="parent-home-now ${live ? 'active' : ''}">
      <div class="parent-home-kicker">${live ? 'Adesso' : 'Prossimo'}</div>
      <div class="parent-home-now-main">
        <span class="parent-home-now-icon">${CATEGORY_ICONS[event.category] || '•'}</span>
        <div>
          <h2>${escapeHtml(event.title || CATEGORY_LABELS[event.category] || 'Attività')}</h2>
          <p>${escapeHtml(formatRange(event))}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</p>
          ${name
            ? `<strong>Accompagnatore: ${escapeHtml(name)}</strong>`
            : explicitNoCompanion
              ? '<strong>Nessun accompagnatore previsto</strong>'
              : needsCompanion
                ? '<strong class="needs-attention">Accompagnatore da assegnare</strong>'
                : ''}
        </div>
      </div>
      ${!live && eventDateTime(event, 'start') ? `<div class="parent-home-next-date">${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(eventDateTime(event, 'start')))}</div>` : ''}
    </section>`;
}

function renderDailyStatus(state, today, events, nowMinutes) {
  if (!canReadModule('nutrition')) {
    return '<div class="parent-home-empty">Stato Recovery non disponibile con i privilegi attuali.</div>';
  }
  const checkin = checkinForToday(state.nutrition || {}, today);
  const checkout = checkoutForToday(state.nutrition || {}, today);
  const lastSport = finalSportEvent(events);
  const checkoutDue = !checkout && lastSport && nowMinutes >= (effectiveEndMinutes(lastSport) ?? 1440);

  const checkinCopy = checkin
    ? { cls: 'done', icon: '✓', title: 'Check-in completato', text: 'Le sensazioni di oggi sono state registrate.' }
    : { cls: 'pending', icon: '○', title: 'Check-in non ancora fatto', text: 'In attesa del check-in giornaliero dell’atleta.' };

  let checkoutCopy;
  if (checkout) {
    checkoutCopy = { cls: 'done', icon: '✓', title: 'Checkout completato', text: checkout.trained === false ? 'Giornata senza allenamento registrata.' : `Qualità allenamento ${checkout.quality || '—'}/5.` };
  } else if (!lastSport) {
    checkoutCopy = { cls: 'neutral', icon: '—', title: 'Checkout', text: 'Nessun allenamento programmato oggi.' };
  } else if (checkoutDue) {
    checkoutCopy = { cls: 'pending', icon: '○', title: 'Checkout da fare', text: 'L’ultimo allenamento di oggi è terminato.' };
  } else {
    checkoutCopy = { cls: 'later', icon: '↘', title: 'Checkout più tardi', text: `Dopo l’ultimo allenamento (${formatClock(lastSport.endTime || lastSport.startTime)}).` };
  }

  return [checkinCopy, checkoutCopy].map(item => `
    <article class="parent-home-daily-card ${item.cls}">
      <span class="parent-home-daily-icon">${item.icon}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></div>
    </article>`).join('');
}

function renderAttentionList(items) {
  if (!items.length) {
    return `
      <div class="parent-home-all-clear">
        <span>✓</span>
        <div><strong>Nessuna attenzione aperta</strong><p>Recuperi, scadenze, pagamenti e materiali non richiedono interventi immediati.</p></div>
      </div>`;
  }

  return items.map(item => `
    <button class="parent-home-attention-row tone-${escapeAttr(item.tone || 'neutral')}" type="button"
      data-parent-route="${escapeAttr(item.route || '')}" ${item.section ? `data-parent-section="${escapeAttr(item.section)}"` : ''}>
      <span class="parent-home-attention-icon">${item.icon || '•'}</span>
      <span class="parent-home-attention-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.detail || '')}</small>
      </span>
      <span class="parent-home-attention-open">›</span>
    </button>`).join('');
}

function renderTimeline(events, planner, nowMinutes) {
  if (!events.length) return '<div class="parent-home-empty">Nessuna attività nel planner di oggi.</div>';
  const writable = canWriteModule('calendar');
  return events.map(event => {
    const state = eventState(event, nowMinutes);
    const companion = companionName(event, planner.people || []);
    const explicitNoCompanion = hasExplicitNoCompanion(event);
    const canMarkMissed = writable
      && MISSED_ELIGIBLE_CATEGORIES.has(event.category)
      && event.attendanceStatus !== 'missed';
    return `
      <article class="parent-home-timeline-row ${state} ${event.attendanceStatus === 'missed' ? 'missed' : ''}">
        <div class="parent-home-time">${escapeHtml(formatClock(event.startTime))}</div>
        <div class="parent-home-timeline-marker"></div>
        <div class="parent-home-event">
          <strong>${escapeHtml(event.title || CATEGORY_LABELS[event.category] || 'Attività')}</strong>
          <span>${escapeHtml(CATEGORY_LABELS[event.category] || 'Attività')}${event.endTime ? ` · fino alle ${escapeHtml(formatClock(event.endTime))}` : ''}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</span>
          ${companion
            ? `<small>Accompagnatore: ${escapeHtml(companion)}</small>`
            : explicitNoCompanion
              ? '<small>Nessun accompagnatore</small>'
              : ''}
        </div>
        <div class="parent-home-timeline-actions">
          ${state === 'current' ? '<span class="parent-home-live">ORA</span>' : ''}
          ${canMarkMissed ? `<button class="button button-ghost parent-home-missed-button" type="button" data-parent-mark-missed="${escapeAttr(event.id)}">Segna saltata</button>` : ''}
          ${event.attendanceStatus === 'missed' ? '<span class="parent-home-missed-chip">↺ Da recuperare</span>' : ''}
        </div>
      </article>`;
  }).join('');
}

function buildUpcoming(state, today) {
  if (!canReadModule('calendar') && !canReadModule('health')) return [];
  const rows = [];
  const planner = state.planner || {};

  if (canReadModule('calendar')) {
    for (const tournament of (planner.tournaments || [])) {
      const days = daysFrom(today, tournament.startDate);
      if (days != null && days >= 0 && days <= 14) {
        rows.push({ date: tournament.startDate, icon: '🏆', title: tournament.name || 'Torneo', detail: `${tournament.location || tournament.circuit || 'Torneo'}${days === 0 ? ' · oggi' : ` · tra ${days} g`}`, route: 'calendar', section: 'tournaments' });
      }
      const deadlineDays = daysFrom(today, tournament.registrationDeadline);
      if (deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 14 && !['played', 'skipped'].includes(tournament.status)) {
        rows.push({ date: tournament.registrationDeadline, icon: '⌁', title: `Iscrizione · ${tournament.name || 'Torneo'}`, detail: deadlineDays === 0 ? 'Deadline oggi' : `Deadline tra ${deadlineDays} g`, route: 'calendar', section: 'tournaments' });
      }
    }

    for (const event of (planner.events || [])) {
      if (!['medical', 'travel', 'tournament'].includes(event.category) || event.attendanceStatus === 'missed') continue;
      const days = daysFrom(today, event.date);
      if (days == null || days < 1 || days > 14) continue;
      rows.push({ date: event.date, icon: CATEGORY_ICONS[event.category] || '•', title: event.title || CATEGORY_LABELS[event.category], detail: `${formatDate(event.date)} · ${formatClock(event.startTime)}${event.location ? ` · ${event.location}` : ''}`, route: 'calendar' });
    }

    for (const item of (planner.makeups || []).filter(row => row.status === 'planned' && row.scheduledDate)) {
      const days = daysFrom(today, item.scheduledDate);
      if (days == null || days < 0 || days > 14) continue;
      rows.push({ date: item.scheduledDate, icon: '↺', title: `Recupero · ${item.originalTitle || 'Allenamento'}`, detail: `${formatDate(item.scheduledDate)} · ${item.scheduledStartTime || ''}`, route: 'calendar', section: 'makeups' });
    }
  }

  if (canReadModule('health')) {
    const nextReview = state.health?.physio?.nextReview || '';
    const days = daysFrom(today, nextReview);
    if (days != null && days >= 0 && days <= 14) {
      rows.push({ date: nextReview, icon: '♡', title: 'Controllo physio', detail: `${formatDate(nextReview)}${state.health?.physio?.name ? ` · ${state.health.physio.name}` : ''}`, route: 'health' });
    }
  }

  const seen = new Set();
  return rows
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .filter(item => {
      const key = `${item.date}|${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function renderUpcoming(items) {
  if (!items.length) return '<div class="parent-home-empty">Nessun appuntamento importante nei prossimi 14 giorni.</div>';
  return items.map(item => `
    <button class="parent-home-upcoming-row" type="button" data-parent-route="${escapeAttr(item.route || '')}" ${item.section ? `data-parent-section="${escapeAttr(item.section)}"` : ''}>
      <span class="parent-home-upcoming-date">${escapeHtml(formatDate(item.date))}</span>
      <span class="parent-home-upcoming-icon">${item.icon}</span>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}</small></span>
      <span>›</span>
    </button>`).join('');
}

function quickLinks() {
  const candidates = [
    { module: 'calendar', label: 'Calendar', icon: '▣' },
    { module: 'economics', label: 'Pagamenti', icon: '€', section: 'payments' },
    { module: 'health', label: 'Body & Health', icon: '♡' },
    { module: 'equipment', label: 'Equipment', icon: '🎾' },
  ];
  return candidates
    .filter(item => canReadModule(item.module))
    .map(item => `
      <button type="button" class="parent-home-quick-link" data-parent-route="${escapeAttr(item.module)}" ${item.section ? `data-parent-section="${escapeAttr(item.section)}"` : ''}>
        <span>${item.icon}</span><strong>${escapeHtml(item.label)}</strong>
      </button>`).join('');
}

function navigate(route, section = '') {
  if (!route) return;
  if (section && SECTION_KEYS[route]) {
    try { sessionStorage.setItem(SECTION_KEYS[route], section); } catch (_) {}
  }
  location.hash = `#/${route}`;
}

function markSessionMissed(store, eventId) {
  store.update(state => {
    if (!state.planner || typeof state.planner !== 'object') state.planner = {};
    if (!Array.isArray(state.planner.events)) state.planner.events = [];
    if (!Array.isArray(state.planner.makeups)) state.planner.makeups = [];

    const current = state.planner.events.find(item => item.id === eventId);
    if (!current || !MISSED_ELIGIBLE_CATEGORIES.has(current.category) || current.attendanceStatus === 'missed') return;

    const now = new Date().toISOString();
    current.attendanceStatus = 'missed';
    current.missedReason = current.missedReason || '';
    current.missedAt = now;

    if (current.makeupId) {
      const item = state.planner.makeups.find(row => row.id === current.makeupId);
      if (!item) return;
      item.status = 'pending';
      item.scheduledEventId = '';
      item.scheduledDate = '';
      item.scheduledStartTime = '';
      item.scheduledEndTime = '';
      item.recoveredAt = '';
      item.waivedAt = '';
      item.updatedAt = now;
      const attemptNote = 'Tentativo di recupero saltato dalla Home Genitore.';
      item.notes = item.notes ? `${item.notes}\n${attemptNote}` : attemptNote;
      return;
    }

    let item = state.planner.makeups.find(row => row.id === current.makeupRecordId || row.originalEventId === current.id);
    if (!item) {
      item = {
        id: uid('makeup'),
        originalEventId: current.id,
        originalSeriesId: current.seriesId || '',
        originalTitle: current.title || 'Allenamento',
        originalCategory: current.category || 'tennis',
        originalDate: current.date || '',
        originalStartTime: current.startTime || '',
        originalEndTime: current.endTime || '',
        originalLocation: current.location || '',
        originalSurface: current.surface || '',
        reason: '',
        notes: '',
        status: 'pending',
        scheduledEventId: '',
        scheduledDate: '',
        scheduledStartTime: '',
        scheduledEndTime: '',
        createdAt: now,
        updatedAt: now,
        recoveredAt: '',
        waivedAt: '',
      };
      state.planner.makeups.push(item);
    } else {
      item.status = 'pending';
      item.updatedAt = now;
      item.waivedAt = '';
    }
    current.makeupRecordId = item.id;
  });
}

function bindActions(main, store) {
  main.querySelectorAll('[data-parent-route]').forEach(button => {
    button.addEventListener('click', () => navigate(button.dataset.parentRoute, button.dataset.parentSection || ''));
  });

  main.querySelectorAll('[data-parent-mark-missed]').forEach(button => {
    button.addEventListener('click', async () => {
      const eventId = button.dataset.parentMarkMissed;
      const event = store.getState().planner?.events?.find(item => item.id === eventId);
      if (!event) return;
      const confirmed = await showInAppConfirm(
        `Segnare “${event.title || 'questa sessione'}” come saltata e da recuperare?`,
        {
          title: 'Lezione saltata',
          confirmLabel: 'Segna da recuperare',
        },
      );
      if (!confirmed) return;
      markSessionMissed(store, eventId);
    });
  });
}

function scheduleRefresh({ main, title, store }) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const now = new Date();
  const delay = Math.max(1000, (60 - now.getSeconds()) * 1000 + 75);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const route = location.hash.replace(/^#\/?/, '') || 'home';
    if (route !== 'home') return;
    renderParentHome({ main, title, store });
  }, delay);
}

export function renderParentHome({ main, title, store }) {
  const state = store.getState();
  const athlete = state.athlete || {};
  const planner = state.planner || {};
  const now = new Date();
  const today = localDateKey(now);
  const nowMinutes = minutesNow(now);
  const calendarReadable = canReadModule('calendar');
  const events = calendarReadable ? todayEvents(planner, today) : [];
  const current = calendarReadable ? currentEvents(events, nowMinutes) : [];
  const next = calendarReadable ? nextEvent(planner, now) : null;
  const tournament = calendarReadable ? activeTournament(planner, today) : null;
  const attention = buildAttentionItems(state, now);
  const upcoming = buildUpcoming(state, today);
  const userName = getCurrentUserDisplayName() || 'Utente';

  title.textContent = 'Home';

  main.innerHTML = `
    <section class="parent-home">
      <header class="parent-home-head">
        <div>
          <div class="parent-home-date">${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now))}</div>
          <h2>${escapeHtml(greeting(now.getHours()))}, ${escapeHtml(userName)}</h2>
          <p>Agenda familiare, scadenze e cose che richiedono attenzione.</p>
        </div>
        ${tournament ? `<div class="parent-home-tournament"><span>🏆 Torneo in corso</span><strong>${escapeHtml(tournament.name || 'Torneo')}</strong></div>` : ''}
      </header>

      ${calendarReadable
        ? renderNowCard(current, next, planner, now)
        : '<section class="parent-home-now clear"><div class="parent-home-kicker">Adesso</div><div class="parent-home-now-main"><span class="parent-home-now-icon">▣</span><div><h2>Planner non disponibile</h2><p>Questo account non ha accesso al Calendar.</p></div></div></section>'}

      <section class="parent-home-section">
        <div class="parent-home-section-head">
          <div><span>Priorità</span><h3>Da fare</h3></div>
          ${attention.length ? `<span class="parent-home-count">${attention.length}</span>` : ''}
        </div>
        <div class="parent-home-attention-list">${renderAttentionList(attention)}</div>
      </section>

      <section class="parent-home-section">
        <div class="parent-home-section-head">
          <div><span>Planner</span><h3>Oggi</h3></div>
          ${calendarReadable ? '<button class="button button-ghost" type="button" data-parent-route="calendar">Apri Calendar →</button>' : ''}
        </div>
        <div class="parent-home-timeline">${calendarReadable ? renderTimeline(events, planner, nowMinutes) : '<div class="parent-home-empty">Calendar non disponibile con i privilegi attuali.</div>'}</div>
      </section>

      <section class="parent-home-section">
        <div class="parent-home-section-head"><div><span>Prossimi 14 giorni</span><h3>Prossimamente</h3></div></div>
        <div class="parent-home-upcoming">${renderUpcoming(upcoming)}</div>
      </section>

      <section class="parent-home-section">
        <div class="parent-home-section-head"><div><span>Accesso rapido</span><h3>Gestione</h3></div></div>
        <div class="parent-home-quick-links">${quickLinks() || '<div class="parent-home-empty">Nessun modulo disponibile.</div>'}</div>
      </section>
    </section>`;

  bindActions(main, store);
  scheduleRefresh({ main, title, store });
}
