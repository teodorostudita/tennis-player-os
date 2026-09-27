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

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (nowMinutes <= start) return 0;
  if (nowMinutes >= end) return end - start;

  return nowMinutes - start;
}

function tennisMinutesSince(startDate, planner = {}, now = new Date()) {
  const firstDate = String(startDate || '');
  if (!firstDate) return null;

  const today = dateKey(now);
  if (firstDate > today) return 0;

  const events = Array.isArray(planner.events)
    ? planner.events
    : [];

  return events
    .filter(event =>
      event?.category === 'tennis'
      && String(event.date || '') >= firstDate
      && String(event.date || '') <= today
    )
    .reduce(
      (sum, event) => sum + completedEventMinutes(event, now),
      0,
    );
}

function formatHoursFromMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';

  return `${formatNumber(Math.max(0, minutes) / 60)} h`;
}

function formatHoursValue(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return '—';
  return `${formatNumber(hours)} h`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
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

function lifecycleInfo(actualMinutes, plannedHours, noun) {
  const planned = Number(plannedHours);

  if (
    !Number.isFinite(actualMinutes)
    || !Number.isFinite(planned)
    || planned <= 0
  ) {
    return null;
  }

  const actualHours = Math.max(0, actualMinutes) / 60;
  const remaining = planned - actualHours;
  const ratio = actualHours / planned;

  let tone = 'ok';
  let text = `${noun}: circa ${formatNumber(remaining)} h residue`;

  if (remaining <= 0) {
    tone = 'overdue';
    text = `${noun}: soglia superata di ${formatNumber(Math.abs(remaining))} h`;
  } else if (ratio >= 0.75) {
    tone = 'warning';
    text = `${noun}: sostituzione tra circa ${formatNumber(remaining)} h`;
  } else {
    text = `${noun}: sostituzione tra circa ${formatNumber(remaining)} h`;
  }

  return {
    actualHours,
    plannedHours: planned,
    remainingHours: remaining,
    ratio,
    tone,
    text,
  };
}

function createSpec(label, value) {
  const item = document.createElement('div');
  item.className = 'equipment-spec equipment-dynamic-spec';

  const span = document.createElement('span');
  span.textContent = label;

  const strong = document.createElement('strong');
  strong.textContent = value;

  item.append(span, strong);
  return item;
}

function createLifecycleBlock({ actualMinutes, plannedHours, noun, compact = false }) {
  const info = lifecycleInfo(actualMinutes, plannedHours, noun);
  if (!info) return null;

  const block = document.createElement('div');
  block.className = `equipment-lifecycle-block tone-${info.tone}${compact ? ' compact' : ''}`;

  const top = document.createElement('div');
  top.className = 'equipment-lifecycle-top';

  const label = document.createElement('span');
  label.textContent = info.text;

  const value = document.createElement('strong');
  value.textContent = `${formatNumber(info.actualHours)} / ${formatNumber(info.plannedHours)} h`;

  top.append(label, value);

  const track = document.createElement('div');
  track.className = 'equipment-lifecycle-track';

  const fill = document.createElement('span');
  fill.style.width = `${Math.max(0, Math.min(100, info.ratio * 100))}%`;

  track.append(fill);
  block.append(top, track);

  return block;
}

function cleanupDynamic(card) {
  card
    .querySelectorAll(
      '.equipment-dynamic-spec, .equipment-lifecycle-block, .equipment-string-live-usage'
    )
    .forEach(node => node.remove());
}

function unwrapOldStringSummary(stringRow) {
  const oldWrapper = stringRow.querySelector('.equipment-string-live-summary');
  if (!oldWrapper) return;

  const strong = oldWrapper.querySelector('strong');

  if (strong) {
    oldWrapper.replaceWith(strong);
  } else {
    oldWrapper.remove();
  }
}

function normalizeRacketCard(card, racket, primaryId) {
  const isCurrent = racket.id === primaryId;

  card.classList.toggle('is-current-equipment', isCurrent);
  card.classList.toggle('is-emergency-equipment', !isCurrent && racket.status === 'test');
  card.classList.toggle('is-reserve-equipment', !isCurrent && racket.status !== 'test' && racket.status !== 'retired');

  const status = card.querySelector('.equipment-status');
  const primaryChip = card.querySelector('.equipment-primary-chip');

  if (primaryChip) {
    primaryChip.textContent = 'IN USO';
  }

  if (status) {
    if (isCurrent) {
      status.textContent = 'In uso';
      status.className = 'equipment-status status-active';
    } else if (racket.status === 'test') {
      status.textContent = 'Muletto / emergenza';
      status.className = 'equipment-status status-test';
    } else if (racket.status === 'retired') {
      status.textContent = 'Dismessa';
      status.className = 'equipment-status status-retired';
    } else {
      status.textContent = 'Riserva';
      status.className = 'equipment-status status-spare';
    }
  }

  const setCurrent = card.querySelector('[data-set-primary-racket]');
  if (setCurrent) {
    setCurrent.textContent = 'Metti in uso';
  }
}

function setupIconSvg(kind) {
  if (kind === 'racket') {
    return `
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="26" cy="23" rx="16" ry="20" fill="none" stroke="currentColor" stroke-width="4"></ellipse>
        <path d="M18 14h16M14 22h24M14 30h24M18 38h16" stroke="currentColor" stroke-width="2.2" opacity=".55"></path>
        <path d="M18 8v30M26 4v38M34 4v38" stroke="currentColor" stroke-width="2" opacity=".45"></path>
        <path d="M38 40l10 10" stroke="currentColor" stroke-width="5" stroke-linecap="round"></path>
        <rect x="46" y="48" width="10" height="6" rx="3" transform="rotate(45 46 48)" fill="currentColor" opacity=".9"></rect>
      </svg>`;
  }

  if (kind === 'strings') {
    return `
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="10" y="10" width="44" height="44" rx="10" fill="none" stroke="currentColor" stroke-width="4"></rect>
        <path d="M20 14v36M30 14v36M40 14v36M50 18H14M50 28H14M50 38H14M46 48H18" stroke="currentColor" stroke-width="2.4" opacity=".7"></path>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 39c6 0 9-3 14-9 3-4 7-6 11-6 5 0 8 2 12 5l6 5c2 2 2 5 0 7s-5 3-8 3H34c-4 0-7 2-10 5-3 4-6 6-10 6-4 0-7-2-8-5-2-4 1-11 5-11z" fill="currentColor"></path>
      <path d="M23 28l6-8m5 10l5-7m6 10l4-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".85"></path>
    </svg>`;
}

function ensureSetupCardDecoration(card, kind) {
  card.classList.add('equipment-setup-card', `setup-kind-${kind}`);

  const existing = card.querySelector('.equipment-setup-hero');
  if (existing) existing.remove();

  const hero = document.createElement('div');
  hero.className = `equipment-setup-hero icon-${kind}`;
  hero.innerHTML = `
    <div class="equipment-setup-icon">${setupIconSvg(kind)}</div>
    <div class="equipment-setup-glow"></div>
  `;

  card.prepend(hero);
}

function removeModulePrinciplePanel() {
  const candidates = [...document.querySelectorAll('h1,h2,h3,h4,.panel-title,.panel-header h3,.equipment-card-kicker')];

  candidates.forEach(node => {
    const text = (node.textContent || '').trim().toLowerCase();
    if (text !== 'principio del modulo') return;

    const block = node.closest('.panel') || node.closest('section') || node.closest('article');
    if (block) {
      block.remove();
    }
  });
}

function enhanceRacketCards(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const rackets = Array.isArray(equipment.rackets) ? equipment.rackets : [];
  const jobs = Array.isArray(equipment.stringJobs) ? equipment.stringJobs : [];

  document
    .querySelectorAll('.equipment-item-card [data-edit-racket]')
    .forEach(editButton => {
      const card = editButton.closest('.equipment-item-card');
      if (!card) return;

      const racket = rackets.find(item => item.id === editButton.dataset.editRacket);
      if (!racket) return;

      cleanupDynamic(card);
      normalizeRacketCard(card, racket, equipment.primaryRacketId);

      const stringRow = card.querySelector('.equipment-current-string-row');
      if (!stringRow) return;

      unwrapOldStringSummary(stringRow);

      const currentString = getCurrentStringJob(racket.id, jobs);
      if (!currentString) return;

      const actualMinutes = tennisMinutesSince(currentString.date, planner, now);
      const strong = stringRow.querySelector(':scope > strong');
      if (!strong) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'equipment-string-live-summary';

      strong.replaceWith(wrapper);
      wrapper.appendChild(strong);

      const details = document.createElement('div');
      details.className = 'equipment-string-live-usage';

      const mounted = document.createElement('span');
      mounted.textContent = `Montata: ${formatDate(currentString.date)}`;

      const actual = document.createElement('span');
      actual.textContent = `Tennis dal montaggio: ${formatHoursFromMinutes(actualMinutes)}`;
      actual.title = 'Stima dinamica dalle attività Tennis del Planner. Il Planner non distingue ancora il telaio realmente usato.';

      const planned = document.createElement('span');
      planned.textContent = `Ore previste: ${formatHoursValue(currentString.hoursUsed)}`;

      details.append(mounted, actual, planned);
      wrapper.append(details);

      const lifecycle = createLifecycleBlock({ actualMinutes, plannedHours: currentString.hoursUsed, noun: 'Corde', compact: true });
      if (lifecycle) stringRow.insertAdjacentElement('afterend', lifecycle);
    });
}

function enhanceCurrentSetup(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const jobs = Array.isArray(equipment.stringJobs) ? equipment.stringJobs : [];
  const shoes = Array.isArray(equipment.shoes) ? equipment.shoes : [];

  document.querySelectorAll('.equipment-current-card').forEach(card => {
    cleanupDynamic(card);

    const kicker = card.querySelector('.equipment-card-kicker');
    if (!kicker) return;

    const originalTitle = kicker.textContent.trim();

    if (originalTitle === 'Racchetta principale') kicker.textContent = 'Racchetta in uso';
    if (originalTitle === 'Scarpe principali') kicker.textContent = 'Scarpe in uso';

    const title = kicker.textContent.trim();

    if (title === 'Racchetta in uso') {
      ensureSetupCardDecoration(card, 'racket');
    } else if (title === 'Incordatura corrente') {
      ensureSetupCardDecoration(card, 'strings');
    } else if (title === 'Scarpe in uso') {
      ensureSetupCardDecoration(card, 'shoes');
    }

    if (title === 'Incordatura corrente') {
      const job = getCurrentStringJob(equipment.primaryRacketId, jobs);
      if (!job) return;

      const specs = card.querySelector('.equipment-spec-grid');
      if (!specs) return;

      card.querySelectorAll('.equipment-spec > span').forEach(label => {
        if (['Ore uso', 'Ore previste'].includes(label.textContent.trim())) {
          label.textContent = 'Ore previste';
        }
      });

      const actualMinutes = tennisMinutesSince(job.date, planner, now);
      specs.append(createSpec('Tennis dal montaggio', formatHoursFromMinutes(actualMinutes)));

      const lifecycle = createLifecycleBlock({ actualMinutes, plannedHours: job.hoursUsed, noun: 'Corde' });
      if (lifecycle) {
        const action = card.querySelector('.equipment-inline-action');
        if (action) action.before(lifecycle); else card.append(lifecycle);
      }
    }

    if (title === 'Scarpe in uso') {
      const shoe = shoes.find(item => item.id === equipment.primaryShoeId);
      if (!shoe) return;

      const specs = card.querySelector('.equipment-spec-grid');
      if (!specs) return;

      const actualMinutes = tennisMinutesSince(shoe.startDate, planner, now);

      specs.append(
        createSpec('Tennis dal primo uso', formatHoursFromMinutes(actualMinutes)),
        createSpec('Ore previste', formatHoursValue(shoe.hoursUsed)),
      );

      const lifecycle = createLifecycleBlock({ actualMinutes, plannedHours: shoe.hoursUsed, noun: 'Scarpe' });
      if (lifecycle) {
        const action = card.querySelector('.equipment-inline-action');
        if (action) action.before(lifecycle); else card.append(lifecycle);
      }
    }
  });
}

function enhanceShoeCards(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const shoes = Array.isArray(equipment.shoes) ? equipment.shoes : [];

  document
    .querySelectorAll('.equipment-item-card [data-edit-shoe]')
    .forEach(editButton => {
      const card = editButton.closest('.equipment-item-card');
      if (!card) return;

      const shoe = shoes.find(item => item.id === editButton.dataset.editShoe);
      if (!shoe) return;

      cleanupDynamic(card);

      const isCurrent = shoe.id === equipment.primaryShoeId;
      card.classList.toggle('is-current-equipment', isCurrent);

      const primaryChip = card.querySelector('.equipment-primary-chip');
      if (primaryChip) primaryChip.textContent = 'IN USO';

      const setCurrent = card.querySelector('[data-set-primary-shoe]');
      if (setCurrent) setCurrent.textContent = 'Metti in uso';

      const specs = card.querySelector('.equipment-spec-grid');
      if (!specs) return;

      card.querySelectorAll('.equipment-spec > span').forEach(label => {
        if (label.textContent.trim() === 'Ore uso') label.textContent = 'Ore previste';
      });

      const actualMinutes = tennisMinutesSince(shoe.startDate, planner, now);
      specs.append(createSpec('Tennis dal primo uso', formatHoursFromMinutes(actualMinutes)));

      const lifecycle = createLifecycleBlock({ actualMinutes, plannedHours: shoe.hoursUsed, noun: 'Scarpe' });
      if (lifecycle) {
        const note = card.querySelector('.equipment-note');
        if (note) note.before(lifecycle); else card.append(lifecycle);
      }
    });
}

function enhanceForms() {
  const racketForm = document.querySelector('#racket-form');
  const stringForm = document.querySelector('#string-form');
  const shoeForm = document.querySelector('#shoe-form');

  if (racketForm) {
    const select = racketForm.elements.status;
    if (select) {
      for (const option of select.options) {
        if (option.value === 'active') option.textContent = 'In uso';
        if (option.value === 'spare') option.textContent = 'Riserva';
        if (option.value === 'test') option.textContent = 'Muletto / emergenza';
        if (option.value === 'retired') option.textContent = 'Dismessa';
      }
    }

    const primary = racketForm.elements.makePrimary;
    const label = primary?.closest('label');
    if (label && label.lastChild) label.lastChild.textContent = ' Metti questa racchetta in uso';
  }

  if (stringForm) {
    const input = stringForm.elements.hoursUsed;
    const label = input?.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Ore di utilizzo previste';
  }

  if (shoeForm) {
    const input = shoeForm.elements.hoursUsed;
    const label = input?.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Ore di utilizzo previste';

    const primary = shoeForm.elements.makePrimary;
    const currentLabel = primary?.closest('label');
    if (currentLabel && currentLabel.lastChild) currentLabel.lastChild.textContent = ' Metti queste scarpe in uso';
  }
}

function applyEquipmentLifecycle() {
  pending = false;
  if (currentRoute() !== 'equipment') return;

  const state = store.getState();
  const now = new Date();

  removeModulePrinciplePanel();
  enhanceForms();
  enhanceCurrentSetup(state, now);
  enhanceRacketCards(state, now);
  enhanceShoeCards(state, now);
}

function scheduleApply() {
  if (pending) return;
  pending = true;
  window.queueMicrotask(() => { applyEquipmentLifecycle(); });
}

document.addEventListener('click', event => {
  if (currentRoute() !== 'equipment') return;

  const target = event.target.closest?.(
    '[data-equipment-section], [data-module-workspace], [data-set-primary-racket], [data-set-primary-shoe], [data-edit-string], [data-edit-racket], [data-edit-shoe], #new-racket, #new-racket-empty, #new-string, #new-string-empty, #new-shoe, #new-shoe-empty'
  );
  if (!target) return;

  window.queueMicrotask(() => {
    if (target.matches('[data-edit-racket]')) {
      const form = document.querySelector('#racket-form');
      const currentId = store.getState().equipment?.primaryRacketId || '';

      if (form && target.dataset.editRacket !== currentId && form.elements.status?.value === 'active') {
        form.elements.status.value = 'spare';
      }
    }

    applyEquipmentLifecycle();
  });
});

window.addEventListener('hashchange', scheduleApply);
window.addEventListener('focus', scheduleApply);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleApply();
});
store.subscribe(scheduleApply);
scheduleApply();
