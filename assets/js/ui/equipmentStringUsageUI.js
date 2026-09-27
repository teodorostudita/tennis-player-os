import { store } from '../data/store.js';

let pending = false;

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return NaN;

  const [hours, minutes] = String(value).split(':').map(Number);

  if (
    !Number.isFinite(hours)
    || !Number.isFinite(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return NaN;
  }

  return hours * 60 + minutes;
}

function completedEventMinutes(event, now = new Date()) {
  const start = timeToMinutes(event?.startTime);
  const end = timeToMinutes(event?.endTime);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  const today = dateKey(now);
  const eventDate = String(event?.date || '');

  if (!eventDate || eventDate > today) return 0;

  if (eventDate < today) {
    return end - start;
  }

  // Per la giornata corrente contiamo solo il tennis già effettivamente
  // trascorso al momento della consultazione, non le ore ancora future.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (nowMinutes <= start) return 0;
  if (nowMinutes >= end) return end - start;

  return nowMinutes - start;
}

function tennisMinutesSince(mountedDate, planner = {}, now = new Date()) {
  const startDate = String(mountedDate || '');
  if (!startDate) return null;

  const today = dateKey(now);
  if (startDate > today) return 0;

  const events = Array.isArray(planner.events)
    ? planner.events
    : [];

  return events
    .filter(event =>
      event?.category === 'tennis'
      && String(event.date || '') >= startDate
      && String(event.date || '') <= today
    )
    .reduce(
      (sum, event) => sum + completedEventMinutes(event, now),
      0,
    );
}

function formatHours(minutes) {
  if (!Number.isFinite(minutes)) return '—';

  const hours = Math.max(0, minutes) / 60;

  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours)} h`;
}

function formatDate(value) {
  if (!value) return '—';

  const [year, month, day] = String(value).split('-').map(Number);

  if (!year || !month || !day) return String(value);

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function getCurrentStringJob(racketId, jobs) {
  const installed = (Array.isArray(jobs) ? jobs : [])
    .filter(job =>
      job?.racketId === racketId
      && job?.status === 'installed'
    );

  if (!installed.length) return null;

  return [...installed]
    .sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    )[0];
}

function applyStringUsage() {
  pending = false;

  if (currentRoute() !== 'equipment') return;

  const state = store.getState();
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const jobs = Array.isArray(equipment.stringJobs)
    ? equipment.stringJobs
    : [];

  const now = new Date();

  document
    .querySelectorAll('.equipment-item-card')
    .forEach(card => {
      const editButton = card.querySelector('[data-edit-racket]');
      const stringRow = card.querySelector('.equipment-current-string-row');

      if (!editButton || !stringRow) return;

      const racketId = editButton.dataset.editRacket;
      const currentString = getCurrentStringJob(racketId, jobs);

      stringRow
        .querySelectorAll('.equipment-string-live-usage')
        .forEach(node => node.remove());

      if (!currentString) return;

      const tennisMinutes = tennisMinutesSince(
        currentString.date,
        planner,
        now,
      );

      const usage = document.createElement('div');
      usage.className = 'equipment-string-live-usage';
      usage.style.display = 'grid';
      usage.style.gap = '2px';
      usage.style.justifyItems = 'end';
      usage.style.marginTop = '3px';

      const mounted = document.createElement('span');
      mounted.className = 'table-sub';
      mounted.textContent = `Montata: ${formatDate(currentString.date)}`;

      const hours = document.createElement('span');
      hours.className = 'table-sub';
      hours.textContent = `Tennis dal montaggio: ${formatHours(tennisMinutes)}`;
      hours.title = [
        'Calcolo dinamico dalle attività di tipo Tennis presenti nel Planner',
        'dalla data di montaggio fino al momento della consultazione.',
        'Il Planner, al momento, non distingue quale telaio sia stato effettivamente usato.',
      ].join(' ');

      usage.append(mounted, hours);

      // Il primo <strong> della riga contiene corda + tensione.
      // Inseriamo data e ore immediatamente sotto, nello stesso blocco destro.
      const strong = stringRow.querySelector(':scope > strong');

      if (strong) {
        const wrapper = document.createElement('div');
        wrapper.className = 'equipment-string-live-summary';
        wrapper.style.display = 'grid';
        wrapper.style.gap = '2px';
        wrapper.style.justifyItems = 'end';
        wrapper.style.textAlign = 'right';

        strong.replaceWith(wrapper);
        wrapper.append(strong, usage);
      } else {
        stringRow.appendChild(usage);
      }
    });
}

function scheduleApply() {
  if (pending) return;

  pending = true;

  window.queueMicrotask(() => {
    applyStringUsage();
  });
}

document.addEventListener('click', event => {
  if (currentRoute() !== 'equipment') return;

  const relevant = event.target.closest?.(
    '[data-equipment-section], [data-module-workspace], [data-set-primary-racket], [data-edit-string], [data-edit-racket]',
  );

  if (relevant) scheduleApply();
});

window.addEventListener('hashchange', scheduleApply);
window.addEventListener('focus', scheduleApply);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleApply();
});

store.subscribe(scheduleApply);

scheduleApply();
