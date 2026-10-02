import { canReadModule, canWriteModule } from '../cloud/access.js?v=1.2.4';
import { getCurrentUserDisplayName } from '../cloud/accountAccess.js?v=1.2.4';

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

const SPORT_CATEGORIES = new Set(['tennis', 'physical', 'tournament']);
const RECOVERY_FOCUS_KEY = 'tpos.recovery.focus';
let refreshTimer = null;

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  const value = which === 'end' ? event.endTime : event.startTime;
  const fallback = which === 'end' ? effectiveEndMinutes(event) : timeToMinutes(event.startTime);
  if (fallback == null) return null;
  const [year, month, day] = String(event.date).split('-').map(Number);
  const hours = Math.floor(fallback / 60);
  const minutes = fallback % 60;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function compareEvents(a, b) {
  return `${a.date || ''} ${a.startTime || ''}`.localeCompare(`${b.date || ''} ${b.startTime || ''}`);
}

function greeting(hour) {
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function formatClock(value = '') {
  return String(value || '').slice(0, 5) || '—';
}

function formatRange(event = {}) {
  const start = formatClock(event.startTime);
  const end = formatClock(event.endTime);
  return event.endTime ? `${start}–${end}` : start;
}

function formatDurationMinutes(total) {
  const minutes = Math.max(0, Math.round(total));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatRelative(target, now = new Date()) {
  if (!(target instanceof Date) || Number.isNaN(target.getTime())) return '';
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diff <= 0) return 'ora';
  if (diff < 60) return `tra ${diff} min`;
  if (diff < 24 * 60) return `tra ${formatDurationMinutes(diff)}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (localDateKey(target) === localDateKey(tomorrow)) {
    return `domani alle ${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
  }
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(target);
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

function activeTournament(planner, today) {
  return (planner.tournaments || []).find(tournament => {
    const start = tournament.startDate || '';
    const end = tournament.endDate || start;
    return start && today >= start && today <= end;
  }) || null;
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

function checkinForToday(nutrition, today) {
  const recoveryLogs = Array.isArray(nutrition?.recoveryLogs) ? nutrition.recoveryLogs : [];
  const sleepLogs = Array.isArray(nutrition?.sleepLogs) ? nutrition.sleepLogs : [];
  return recoveryLogs.find(item => item?.date === today)
    || sleepLogs.find(item => item?.date === today)
    || null;
}

function checkoutForToday(nutrition, today) {
  const checkouts = Array.isArray(nutrition?.trainingCheckouts)
    ? nutrition.trainingCheckouts
    : [];
  return checkouts.find(item => item?.date === today) || null;
}

function finalSportEvent(events) {
  return [...events]
    .filter(event => SPORT_CATEGORIES.has(event.category))
    .sort((a, b) => {
      const aEnd = effectiveEndMinutes(a) ?? -1;
      const bEnd = effectiveEndMinutes(b) ?? -1;
      return aEnd - bEnd;
    })
    .at(-1) || null;
}

function routeButton(label, route, extraClass = '') {
  return `<button type="button" class="button button-ghost ${extraClass}" data-home-route="${escapeAttr(route)}">${escapeHtml(label)}</button>`;
}

function recoveryButton(label, focus, primary = false) {
  return `<button type="button" class="button ${primary ? 'button-primary' : 'button-ghost'}" data-home-recovery-focus="${escapeAttr(focus)}">${escapeHtml(label)}</button>`;
}

function renderCurrentCard(current, following, now) {
  if (current.length) {
    const event = current[0];
    const end = eventDateTime(event, 'end');
    const remaining = end ? Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000)) : null;
    return `
      <section class="athlete-home-now athlete-home-now-active">
        <div class="athlete-home-kicker">Adesso</div>
        <div class="athlete-home-now-main">
          <span class="athlete-home-now-icon">${CATEGORY_ICONS[event.category] || '•'}</span>
          <div>
            <h2>${escapeHtml(event.title || CATEGORY_LABELS[event.category] || 'Attività')}</h2>
            <p>
              ${escapeHtml(formatRange(event))}
              ${event.location ? ` · ${escapeHtml(event.location)}` : ''}
            </p>
            ${remaining != null ? `<strong>Termina tra ${escapeHtml(formatDurationMinutes(remaining))}</strong>` : ''}
          </div>
        </div>
        ${current.length > 1 ? `<div class="athlete-home-overlap">+${current.length - 1} altra attività in corso</div>` : ''}
        ${following ? `
          <div class="athlete-home-next-inline">
            <span>Subito dopo</span>
            <strong>${escapeHtml(formatClock(following.startTime))} · ${escapeHtml(following.title || CATEGORY_LABELS[following.category] || 'Attività')}</strong>
          </div>
        ` : ''}
      </section>
    `;
  }

  if (following) {
    const start = eventDateTime(following, 'start');
    return `
      <section class="athlete-home-now">
        <div class="athlete-home-kicker">Prossimo</div>
        <div class="athlete-home-now-main">
          <span class="athlete-home-now-icon">${CATEGORY_ICONS[following.category] || '•'}</span>
          <div>
            <h2>${escapeHtml(following.title || CATEGORY_LABELS[following.category] || 'Attività')}</h2>
            <p>
              ${escapeHtml(formatRange(following))}
              ${following.location ? ` · ${escapeHtml(following.location)}` : ''}
            </p>
            <strong>${escapeHtml(formatRelative(start, now))}</strong>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="athlete-home-now athlete-home-now-clear">
      <div class="athlete-home-kicker">Adesso</div>
      <div class="athlete-home-now-main">
        <span class="athlete-home-now-icon">✓</span>
        <div>
          <h2>Nessun impegno in programma</h2>
          <p>Il planner non segnala altre attività imminenti.</p>
        </div>
      </div>
    </section>
  `;
}

function renderTaskCards({ nutrition, today, todayPlannerEvents, nowMinutes }) {
  const canReadRecovery = canReadModule('nutrition');
  const canWriteRecovery = canWriteModule('nutrition');

  if (!canReadRecovery) {
    return `
      <div class="athlete-home-task neutral">
        <div><span class="athlete-home-task-icon">☾</span></div>
        <div>
          <strong>Recovery</strong>
          <p>Non disponibile con i privilegi attuali.</p>
        </div>
      </div>
    `;
  }

  const checkin = checkinForToday(nutrition, today);
  const checkout = checkoutForToday(nutrition, today);
  const lastSport = finalSportEvent(todayPlannerEvents);
  const lastSportEnd = lastSport ? effectiveEndMinutes(lastSport) : null;
  const checkoutDue = !checkout && lastSportEnd != null && nowMinutes >= lastSportEnd;

  const checkinCard = checkin
    ? `
      <div class="athlete-home-task done">
        <div><span class="athlete-home-task-icon">✓</span></div>
        <div>
          <strong>Check-in completato</strong>
          <p>Le sensazioni di oggi sono già registrate.</p>
        </div>
        ${recoveryButton('Apri', 'daily-checkin')}
      </div>
    `
    : `
      <div class="athlete-home-task due">
        <div><span class="athlete-home-task-icon">○</span></div>
        <div>
          <strong>Check-in di oggi</strong>
          <p>Sonno, stanchezza, umore, voglia e concentrazione.</p>
        </div>
        ${canWriteRecovery ? recoveryButton('Fai check-in', 'daily-checkin', true) : recoveryButton('Apri', 'daily-checkin')}
      </div>
    `;

  let checkoutCard = '';
  if (checkout) {
    checkoutCard = `
      <div class="athlete-home-task done">
        <div><span class="athlete-home-task-icon">✓</span></div>
        <div>
          <strong>Training checkout completato</strong>
          <p>${checkout.trained === false ? 'Giornata senza allenamento registrata.' : `Qualità allenamento: ${escapeHtml(checkout.quality || '—')}/5.`}</p>
        </div>
        ${recoveryButton('Apri', 'training-checkout')}
      </div>
    `;
  } else if (checkoutDue) {
    checkoutCard = `
      <div class="athlete-home-task due">
        <div><span class="athlete-home-task-icon">○</span></div>
        <div>
          <strong>Training checkout</strong>
          <p>L’ultimo allenamento programmato è terminato: registra come è andato.</p>
        </div>
        ${canWriteRecovery ? recoveryButton('Fai checkout', 'training-checkout', true) : recoveryButton('Apri', 'training-checkout')}
      </div>
    `;
  } else if (lastSport) {
    checkoutCard = `
      <div class="athlete-home-task later">
        <div><span class="athlete-home-task-icon">↘</span></div>
        <div>
          <strong>Training checkout</strong>
          <p>Da compilare dopo l’ultimo allenamento di oggi (${escapeHtml(formatClock(lastSport.endTime || lastSport.startTime))}).</p>
        </div>
        ${recoveryButton('Apri', 'training-checkout')}
      </div>
    `;
  } else {
    checkoutCard = `
      <div class="athlete-home-task neutral">
        <div><span class="athlete-home-task-icon">—</span></div>
        <div>
          <strong>Training checkout</strong>
          <p>Nessun allenamento è programmato oggi nel Calendar.</p>
        </div>
        ${recoveryButton('Apri', 'training-checkout')}
      </div>
    `;
  }

  return checkinCard + checkoutCard;
}

function renderTimeline(events, nowMinutes) {
  if (!events.length) {
    return '<div class="athlete-home-empty">Nessuna attività nel planner di oggi.</div>';
  }

  return events.map(event => {
    const state = eventState(event, nowMinutes);
    return `
      <article class="athlete-home-timeline-row ${state}">
        <div class="athlete-home-time">${escapeHtml(formatClock(event.startTime))}</div>
        <div class="athlete-home-timeline-marker"></div>
        <div class="athlete-home-event">
          <strong>${escapeHtml(event.title || CATEGORY_LABELS[event.category] || 'Attività')}</strong>
          <span>
            ${escapeHtml(CATEGORY_LABELS[event.category] || 'Attività')}
            ${event.endTime ? ` · fino alle ${escapeHtml(formatClock(event.endTime))}` : ''}
            ${event.location ? ` · ${escapeHtml(event.location)}` : ''}
          </span>
        </div>
        ${state === 'current' ? '<span class="athlete-home-live">ORA</span>' : ''}
      </article>
    `;
  }).join('');
}

function quickLinks() {
  const candidates = [
    { module: 'nutrition', label: 'Recovery', icon: '☾' },
    { module: 'calendar', label: 'Calendar', icon: '▣' },
    { module: 'competition', label: 'Match', icon: '🏆' },
    { module: 'development', label: 'Development', icon: '🎯' },
  ];

  return candidates
    .filter(item => canReadModule(item.module))
    .map(item => `
      <button type="button" class="athlete-home-quick-link" data-home-route="${escapeAttr(item.module)}">
        <span>${item.icon}</span>
        <strong>${escapeHtml(item.label)}</strong>
      </button>
    `).join('');
}

function openRecoveryFocus(focus) {
  try {
    sessionStorage.setItem(RECOVERY_FOCUS_KEY, focus);
  } catch (_) {
    // Navigation still works even if sessionStorage is unavailable.
  }
  location.hash = '#/nutrition';
}

function bindHomeActions(main) {
  main.querySelectorAll('[data-home-recovery-focus]').forEach(button => {
    button.addEventListener('click', () => {
      openRecoveryFocus(button.dataset.homeRecoveryFocus);
    });
  });

  main.querySelectorAll('[data-home-route]').forEach(button => {
    button.addEventListener('click', () => {
      location.hash = `#/${button.dataset.homeRoute}`;
    });
  });
}

function scheduleRefresh({ main, title, store }) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const now = new Date();
  const delay = Math.max(1000, (60 - now.getSeconds()) * 1000 + 50);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const route = location.hash.replace(/^#\/?/, '') || 'home';
    if (route !== 'home') return;
    renderAthleteHome({ main, title, store });
  }, delay);
}

export function renderAthleteHome({ main, title, store }) {
  const state = store.getState();
  const athlete = state.athlete || {};
  const planner = state.planner || {};
  const nutrition = state.nutrition || {};
  const now = new Date();
  const today = localDateKey(now);
  const nowMinutes = minutesNow(now);
  const calendarReadable = canReadModule('calendar');
  const events = calendarReadable ? todayEvents(planner, today) : [];
  const current = calendarReadable ? currentEvents(events, nowMinutes) : [];
  const next = calendarReadable ? nextEvent(planner, now) : null;
  const tournament = calendarReadable ? activeTournament(planner, today) : null;
  const userName = getCurrentUserDisplayName() || athlete.firstName || 'Atleta';

  title.textContent = 'Home';

  main.innerHTML = `
    <section class="athlete-home">
      <header class="athlete-home-head">
        <div>
          <div class="athlete-home-date">${escapeHtml(new Intl.DateTimeFormat('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(now))}</div>
          <h2>${escapeHtml(greeting(now.getHours()))}, ${escapeHtml(userName)}</h2>
          <p>Quello che conta adesso e nelle prossime ore.</p>
        </div>
        ${tournament ? `
          <div class="athlete-home-tournament">
            <span>🏆 Torneo in corso</span>
            <strong>${escapeHtml(tournament.name || 'Torneo')}</strong>
          </div>
        ` : ''}
      </header>

      ${calendarReadable
        ? renderCurrentCard(current, next, now)
        : `
          <section class="athlete-home-now athlete-home-now-clear">
            <div class="athlete-home-kicker">Adesso</div>
            <div class="athlete-home-now-main">
              <span class="athlete-home-now-icon">▣</span>
              <div>
                <h2>Planner non disponibile</h2>
                <p>Questo account non ha accesso al Calendar.</p>
              </div>
            </div>
          </section>
        `}

      <section class="athlete-home-section">
        <div class="athlete-home-section-head">
          <div>
            <span>Da fare oggi</span>
            <h3>Azioni rapide</h3>
          </div>
        </div>
        <div class="athlete-home-tasks">
          ${renderTaskCards({
            nutrition,
            today,
            todayPlannerEvents: events,
            nowMinutes,
          })}
        </div>
      </section>

      <section class="athlete-home-section">
        <div class="athlete-home-section-head">
          <div>
            <span>Planner</span>
            <h3>Oggi</h3>
          </div>
          ${canReadModule('calendar') ? routeButton('Apri Calendar →', 'calendar') : ''}
        </div>
        <div class="athlete-home-timeline">
          ${calendarReadable
            ? renderTimeline(events, nowMinutes)
            : '<div class="athlete-home-empty">Calendar non disponibile con i privilegi attuali.</div>'}
        </div>
      </section>

      <section class="athlete-home-section">
        <div class="athlete-home-section-head">
          <div>
            <span>Accesso rapido</span>
            <h3>I tuoi strumenti</h3>
          </div>
        </div>
        <div class="athlete-home-quick-links">
          ${quickLinks() || '<div class="athlete-home-empty">Nessun modulo disponibile.</div>'}
        </div>
      </section>
    </section>
  `;

  bindHomeActions(main);
  scheduleRefresh({ main, title, store });
}
