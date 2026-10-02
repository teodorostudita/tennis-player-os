import { canReadModule } from '../cloud/access.js?v=1.2.4';
import { getCurrentUserDisplayName } from '../cloud/accountAccess.js?v=1.2.4';
import { MUSCULOSKELETAL_DISTRICTS } from '../data/healthBodyMapData.js?v=1.2.4';

let refreshTimer = null;

const BLOCK_LABELS = {
  warmup: 'Warm-up',
  strength: 'Forza',
  power: 'Potenza',
  speed: 'Velocità',
  agility: 'Agilità',
  conditioning: 'Conditioning',
  mobility: 'Mobilità',
  prevention: 'Prevenzione',
  recovery: 'Defaticamento',
  other: 'Altro',
};

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

function formatDate(value = '') {
  const date = parseDateOnly(value);
  if (!date) return value || '—';
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function greeting(hour) {
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function timeToMinutes(value = '') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMinutes(startTime = '', endTime = '') {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start != null && end != null && end > start ? end - start : 0;
}

function effectiveEndMinutes(event = {}) {
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);
  if (start == null) return null;
  return end != null && end > start ? end : Math.min(24 * 60, start + 60);
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

function formatClock(value = '') {
  return String(value || '').slice(0, 5) || '—';
}

function formatRange(event = {}) {
  return event.endTime
    ? `${formatClock(event.startTime)}–${formatClock(event.endTime)}`
    : formatClock(event.startTime);
}

function formatMinutes(total = 0) {
  const minutes = Math.max(0, Math.round(Number(total || 0)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function mondayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

function weekBounds(now = new Date()) {
  const day = mondayIndex(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 12, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12, 0, 0, 0);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function isProgramEffective(program = {}, today = '') {
  if (program.effectiveFrom && today < program.effectiveFrom) return false;
  if (program.effectiveTo && today > program.effectiveTo) return false;
  return true;
}

function weeklySessionsForDate(training = {}, dateValue = '') {
  const program = training.weeklyProgram || {};
  const date = parseDateOnly(dateValue);
  if (!date || !isProgramEffective(program, dateValue)) return [];
  const dayIndex = mondayIndex(date);
  return (Array.isArray(program.sessions) ? program.sessions : [])
    .filter(session => Number(session?.dayIndex) === dayIndex)
    .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
}

function todayWeeklySessions(training = {}, now = new Date()) {
  return weeklySessionsForDate(training, localDateKey(now));
}

function physicalCalendarEvents(planner = {}) {
  return (Array.isArray(planner.events) ? planner.events : [])
    .filter(event => event?.category === 'physical')
    .sort((a, b) => `${a.date || ''} ${a.startTime || ''}`.localeCompare(`${b.date || ''} ${b.startTime || ''}`));
}

function nextPhysicalEvent(planner = {}, now = new Date()) {
  const nowMs = now.getTime();
  const events = physicalCalendarEvents(planner).filter(event => event.attendanceStatus !== 'missed');
  const current = events.find(event => {
    const start = eventDateTime(event, 'start');
    const end = eventDateTime(event, 'end');
    return start && end && start.getTime() <= nowMs && end.getTime() > nowMs;
  });
  if (current) return { event: current, current: true };
  const following = events.find(event => {
    const start = eventDateTime(event, 'start');
    return start && start.getTime() > nowMs;
  });
  return following ? { event: following, current: false } : null;
}

function checkinForToday(nutrition = {}, today = '') {
  const recovery = Array.isArray(nutrition.recoveryLogs) ? nutrition.recoveryLogs : [];
  const sleep = Array.isArray(nutrition.sleepLogs) ? nutrition.sleepLogs : [];
  return recovery.find(row => row?.date === today)
    || sleep.find(row => row?.date === today)
    || null;
}

function districtLabel(key = '') {
  return MUSCULOSKELETAL_DISTRICTS.find(item => item.key === key)?.label || key;
}

function localizedSoreness(state, today) {
  const log = (Array.isArray(state.health?.sorenessLogs) ? state.health.sorenessLogs : [])
    .find(item => item?.date === today && item?.source === 'recovery-checkin' && item?.scope === 'localized');
  if (!log) return '';
  const seen = new Set();
  const labels = [];
  for (const location of (log.locations || [])) {
    const side = location.side === 'left' ? 'sx' : location.side === 'right' ? 'dx' : '';
    const label = `${districtLabel(location.districtKey)}${side ? ` ${side}` : ''}`;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(', ');
}

function metricTone(key, value) {
  const n = Number(value || 0);
  if (!n) return 'neutral';
  if (key === 'fatigue' || key === 'soreness') {
    if (n >= 4) return 'danger';
    if (n >= 3) return 'warning';
    return 'ok';
  }
  if (key === 'sleepQuality' || key === 'motivation' || key === 'concentration') {
    if (n <= 2) return 'danger';
    if (n === 3) return 'warning';
    return 'ok';
  }
  return 'neutral';
}

function renderReadiness(state, today) {
  if (!canReadModule('nutrition')) {
    return '<div class="trainer-home-empty">Recovery non disponibile con i privilegi attuali.</div>';
  }
  const checkin = checkinForToday(state.nutrition || {}, today);
  if (!checkin) {
    return `
      <div class="trainer-home-empty compact">
        <strong>Check-in di oggi non ancora disponibile</strong>
        <span>La Home si aggiornerà quando l’atleta registra il Recovery.</span>
      </div>`;
  }

  const metrics = [
    { key: 'sleepHours', label: 'Sonno', value: Number(checkin.sleepHours || 0), display: `${Number(checkin.sleepHours || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })} h`, tone: Number(checkin.sleepHours || 0) < 7 ? 'warning' : 'ok' },
    { key: 'sleepQuality', label: 'Qualità sonno', value: checkin.sleepQuality, display: `${checkin.sleepQuality || '—'}/5`, tone: metricTone('sleepQuality', checkin.sleepQuality) },
    { key: 'fatigue', label: 'Stanchezza', value: checkin.fatigue, display: `${checkin.fatigue || '—'}/5`, tone: metricTone('fatigue', checkin.fatigue) },
    { key: 'soreness', label: 'Indolenzimento', value: checkin.soreness, display: `${checkin.soreness || '—'}/5`, tone: metricTone('soreness', checkin.soreness) },
    { key: 'motivation', label: 'Voglia', value: checkin.motivation, display: `${checkin.motivation || '—'}/5`, tone: metricTone('motivation', checkin.motivation) },
    { key: 'concentration', label: 'Concentrazione', value: checkin.concentration, display: `${checkin.concentration || '—'}/5`, tone: metricTone('concentration', checkin.concentration) },
  ];
  const location = localizedSoreness(state, today);

  return `
    <div class="trainer-home-readiness-grid">
      ${metrics.map(item => `
        <div class="trainer-home-readiness-item tone-${escapeAttr(item.tone)}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.display)}</strong>
        </div>`).join('')}
    </div>
    ${location ? `<div class="trainer-home-soreness-note"><span>⚠</span><strong>Indolenzimento localizzato:</strong> ${escapeHtml(location)}</div>` : ''}
  `;
}

function healthAlerts(state) {
  if (!canReadModule('health')) return [];
  const health = state.health || {};
  const rows = [];
  const general = String(health.physio?.restrictions || '').trim();
  if (general) {
    rows.push({ title: 'Indicazioni fisioterapiche', detail: general });
  }
  for (const injury of (Array.isArray(health.injuries) ? health.injuries : [])) {
    if (injury?.status === 'resolved') continue;
    const restriction = String(injury?.restrictions || '').trim();
    if (!restriction && injury?.restrictionLevel === 'none') continue;
    rows.push({
      title: injury.diagnosis || injury.subdistrict || injury.bodyArea || 'Problema fisico attivo',
      detail: restriction || `Limitazione: ${injury.restrictionLevel || 'attiva'}`,
    });
  }
  return rows.slice(0, 3);
}

function renderHealthAlerts(rows) {
  if (!canReadModule('health')) {
    return '<div class="trainer-home-empty">Body & Health non disponibile.</div>';
  }
  if (!rows.length) {
    return '<div class="trainer-home-all-clear"><span>✓</span><strong>Nessuna restrizione attiva</strong></div>';
  }
  return rows.map(row => `
    <div class="trainer-home-health-row">
      <span>⚠</span>
      <div><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.detail)}</p></div>
    </div>`).join('');
}

function renderNextAthletics(nextAthletics, training) {
  if (!canReadModule('calendar')) {
    return `
      <section class="trainer-home-next clear">
        <div class="trainer-home-kicker">Athletics</div>
        <h2>Calendar non disponibile</h2>
        <p>Il profilo non può leggere la programmazione.</p>
      </section>`;
  }
  if (!nextAthletics) {
    return `
      <section class="trainer-home-next clear">
        <div class="trainer-home-kicker">Prossima sessione</div>
        <div class="trainer-home-next-main"><span>✓</span><div><h2>Nessuna sessione atletica imminente</h2><p>Non risultano attività di preparazione fisica future nel Calendar.</p></div></div>
      </section>`;
  }
  const event = nextAthletics.event;
  const session = weeklySessionsForDate(training || {}, event.date)[0] || null;
  return `
    <section class="trainer-home-next ${nextAthletics.current ? 'active' : ''}">
      <div class="trainer-home-kicker">${nextAthletics.current ? 'In corso' : 'Prossima sessione atletica'}</div>
      <div class="trainer-home-next-main">
        <span>🏋️</span>
        <div>
          <h2>${escapeHtml(event.title || 'Preparazione fisica')}</h2>
          <p>${escapeHtml(formatDate(event.date))} · ${escapeHtml(formatRange(event))}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</p>
          ${session?.focus ? `<strong>Focus: ${escapeHtml(session.focus)}</strong>` : ''}
        </div>
      </div>
    </section>`;
}

function renderTodayProgram(sessions) {
  if (!canReadModule('training') || !sessions.length) return '';
  return `
    <section class="trainer-home-section">
      <div class="trainer-home-section-head">
        <div><span>Athletics</span><h3>Sessione di oggi</h3></div>
        <button class="button button-ghost" type="button" data-trainer-route="training" data-training-section="weekly">Apri programma →</button>
      </div>
      <div class="trainer-home-program-list">
        ${sessions.map(session => {
          const blocks = Array.isArray(session.blocks) ? session.blocks : [];
          return `
            <article class="trainer-home-program-card">
              <div class="trainer-home-program-top">
                <div>
                  <strong>${escapeHtml(session.title || 'Sessione')}</strong>
                  <span>${escapeHtml(session.startTime || '')}${session.startTime && session.endTime ? '–' : ''}${escapeHtml(session.endTime || '')}${session.focus ? ` · ${escapeHtml(session.focus)}` : ''}</span>
                </div>
                ${session.startTime && session.endTime ? `<b>${escapeHtml(formatMinutes(durationMinutes(session.startTime, session.endTime)))}</b>` : ''}
              </div>
              ${blocks.length ? `<div class="trainer-home-blocks">${blocks.map(block => `<span><b>${escapeHtml(BLOCK_LABELS[block.type] || block.type || 'Blocco')}</b>${block.name ? ` · ${escapeHtml(block.name)}` : ''}${block.dose ? ` · ${escapeHtml(block.dose)}` : ''}</span>`).join('')}</div>` : ''}
            </article>`;
        }).join('')}
      </div>
    </section>`;
}

function weeklyLoad(state, now) {
  if (!canReadModule('calendar')) return null;
  const { start, end } = weekBounds(now);
  const today = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const events = physicalCalendarEvents(state.planner || {})
    .filter(event => event.date >= start && event.date <= end);
  const plannedMinutes = events.reduce((sum, event) => sum + durationMinutes(event.startTime, event.endTime), 0);
  let completed = 0;
  let missed = 0;
  let upcoming = 0;
  for (const event of events) {
    if (event.attendanceStatus === 'missed') {
      missed += 1;
      continue;
    }
    const endMinutes = effectiveEndMinutes(event);
    if (event.date < today || (event.date === today && endMinutes != null && nowMinutes >= endMinutes)) completed += 1;
    else upcoming += 1;
  }
  return { count: events.length, plannedMinutes, completed, missed, upcoming };
}

function renderWeeklyLoad(load) {
  if (!load) return '<div class="trainer-home-empty">Calendar non disponibile.</div>';
  return `
    <div class="trainer-home-load-grid">
      <div><span>Sessioni</span><strong>${load.count}</strong></div>
      <div><span>Volume previsto</span><strong>${escapeHtml(formatMinutes(load.plannedMinutes))}</strong></div>
      <div><span>Svolte</span><strong>${load.completed}</strong></div>
      <div class="${load.missed ? 'attention' : ''}"><span>Saltate</span><strong>${load.missed}</strong></div>
      <div><span>Da svolgere</span><strong>${load.upcoming}</strong></div>
    </div>`;
}

function addDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12, 0, 0, 0);
}

function buildUpcoming(state, now) {
  if (!canReadModule('calendar')) return [];
  const planner = state.planner || {};
  const today = localDateKey(now);
  const limit = localDateKey(addDays(now, 14));
  const rows = [];

  for (const event of (planner.events || [])) {
    if (event.attendanceStatus === 'missed') continue;
    if (!['tennis', 'tournament'].includes(event.category)) continue;
    if (!event.date || event.date < today || event.date > limit) continue;
    rows.push({
      date: event.date,
      time: event.startTime || '',
      icon: event.category === 'tennis' ? '🎾' : '🏆',
      title: event.title || (event.category === 'tennis' ? 'Tennis' : 'Torneo / Match'),
      detail: `${formatClock(event.startTime)}${event.location ? ` · ${event.location}` : ''}`,
    });
  }

  for (const tournament of (planner.tournaments || [])) {
    if (!tournament.startDate || tournament.startDate < today || tournament.startDate > limit) continue;
    rows.push({
      date: tournament.startDate,
      time: '',
      icon: '🏆',
      title: tournament.name || 'Torneo',
      detail: tournament.location || tournament.circuit || 'Competizione',
    });
  }

  const seen = new Set();
  return rows
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .filter(row => {
      const key = `${row.date}|${row.time}|${row.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function renderUpcoming(rows) {
  if (!rows.length) return '<div class="trainer-home-empty">Nessun torneo o sessione di tennis nei prossimi 14 giorni.</div>';
  return rows.map(row => `
    <div class="trainer-home-upcoming-row">
      <span class="trainer-home-upcoming-date">${escapeHtml(formatDate(row.date))}</span>
      <span class="trainer-home-upcoming-icon">${row.icon}</span>
      <div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.detail)}</small></div>
    </div>`).join('');
}

function quickLinks() {
  const candidates = [
    { module: 'training', label: 'Athletics', icon: '🏋️' },
    { module: 'training', label: 'Programma settimanale', icon: '▦', trainingSection: 'weekly' },
    { module: 'nutrition', label: 'Recovery', icon: '☾' },
    { module: 'health', label: 'Body & Health', icon: '♡' },
    { module: 'calendar', label: 'Calendar', icon: '▣' },
  ];
  return candidates
    .filter(item => canReadModule(item.module))
    .map(item => `
      <button class="trainer-home-quick-link" type="button" data-trainer-route="${escapeAttr(item.module)}" ${item.trainingSection ? `data-training-section="${escapeAttr(item.trainingSection)}"` : ''}>
        <span>${item.icon}</span><strong>${escapeHtml(item.label)}</strong>
      </button>`).join('');
}

function bindActions(main) {
  main.querySelectorAll('[data-trainer-route]').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.dataset.trainingSection || '';
      if (section) {
        try { sessionStorage.setItem('tpos.training.section', section); } catch (_) {}
      }
      location.hash = `#/${button.dataset.trainerRoute}`;
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
    renderTrainerHome({ main, title, store });
  }, delay);
}

export function renderTrainerHome({ main, title, store }) {
  const state = store.getState();
  const athlete = state.athlete || {};
  const now = new Date();
  const today = localDateKey(now);
  const userName = getCurrentUserDisplayName() || 'Preparatore';
  const athleteName = [athlete.firstName, athlete.lastName].filter(Boolean).join(' ') || 'Atleta';
  const athleteMeta = [athlete.ranking, athlete.club].filter(Boolean).join(' · ');
  const weeklySessions = canReadModule('training') ? todayWeeklySessions(state.training || {}, now) : [];
  const nextAthletics = nextPhysicalEvent(state.planner || {}, now);
  const restrictions = healthAlerts(state);
  const load = weeklyLoad(state, now);
  const upcoming = buildUpcoming(state, now);

  title.textContent = 'Home';

  main.innerHTML = `
    <section class="trainer-home">
      <header class="trainer-home-head">
        <div>
          <div class="trainer-home-date">${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now))}</div>
          <h2>${escapeHtml(greeting(now.getHours()))}, ${escapeHtml(userName)}</h2>
          <p><strong>${escapeHtml(athleteName)}</strong>${athleteMeta ? ` · ${escapeHtml(athleteMeta)}` : ''}</p>
        </div>
        <div class="trainer-home-role"><span>Profilo</span><strong>Preparatore atletico</strong></div>
      </header>

      ${renderNextAthletics(nextAthletics, state.training || {})}

      <section class="trainer-home-grid-two">
        <article class="panel trainer-home-panel">
          <div class="panel-header trainer-home-panel-head">
            <div><span>Recovery</span><h3>Readiness di oggi</h3></div>
            ${canReadModule('nutrition') ? '<button class="button button-ghost" type="button" data-trainer-route="nutrition">Apri Recovery →</button>' : ''}
          </div>
          <div class="panel-body">${renderReadiness(state, today)}</div>
        </article>

        <article class="panel trainer-home-panel ${restrictions.length ? 'has-attention' : ''}">
          <div class="panel-header trainer-home-panel-head">
            <div><span>Body & Health</span><h3>Indicazioni fisiche</h3></div>
            ${canReadModule('health') ? '<button class="button button-ghost" type="button" data-trainer-route="health">Apri Health →</button>' : ''}
          </div>
          <div class="panel-body trainer-home-health-list">${renderHealthAlerts(restrictions)}</div>
        </article>
      </section>

      ${renderTodayProgram(weeklySessions)}

      <section class="trainer-home-section">
        <div class="trainer-home-section-head">
          <div><span>Carico</span><h3>Settimana atletica</h3></div>
          ${canReadModule('calendar') ? '<button class="button button-ghost" type="button" data-trainer-route="calendar">Apri Calendar →</button>' : ''}
        </div>
        <div class="trainer-home-load">${renderWeeklyLoad(load)}</div>
      </section>

      <section class="trainer-home-section">
        <div class="trainer-home-section-head"><div><span>Prossimi 14 giorni</span><h3>Impegni rilevanti</h3></div></div>
        <div class="trainer-home-upcoming">${renderUpcoming(upcoming)}</div>
      </section>

      <section class="trainer-home-section">
        <div class="trainer-home-section-head"><div><span>Accesso rapido</span><h3>Strumenti</h3></div></div>
        <div class="trainer-home-quick-links">${quickLinks() || '<div class="trainer-home-empty">Nessun modulo disponibile.</div>'}</div>
      </section>
    </section>`;

  bindActions(main);
  scheduleRefresh({ main, title, store });
}
