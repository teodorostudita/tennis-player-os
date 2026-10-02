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
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

function completedEventMinutes(event, now = new Date()) {
  if (event?.attendanceStatus === 'missed') return 0;
  const start = timeToMinutes(event?.startTime);
  const end = timeToMinutes(event?.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const today = dateKey(now);
  const eventDate = String(event?.date || '');
  if (!eventDate || eventDate > today) return 0;
  if (eventDate < today) return end - start;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes <= start) return 0;
  if (nowMinutes >= end) return end - start;
  return nowMinutes - start;
}

function normalizeSurface(value) {
  return String(value || '').trim().toLowerCase();
}

function plannedMinutesSince(startDate, planner = {}, predicate, now = new Date()) {
  const firstDate = String(startDate || '');
  if (!firstDate) return null;

  const today = dateKey(now);
  if (firstDate > today) return 0;

  const events = Array.isArray(planner.events) ? planner.events : [];
  return events
    .filter(event =>
      String(event?.date || '') >= firstDate
      && String(event?.date || '') <= today
      && predicate(event)
    )
    .reduce((sum, event) => sum + completedEventMinutes(event, now), 0);
}

function tennisMinutesSince(startDate, planner = {}, now = new Date()) {
  return plannedMinutesSince(
    startDate,
    planner,
    event => event?.category === 'tennis',
    now,
  );
}

function shoeUsage(shoe, planner = {}, now = new Date()) {
  const surface = normalizeSurface(shoe?.surface);

  if (surface === 'athletics') {
    return {
      minutes: plannedMinutesSince(
        shoe?.startDate,
        planner,
        event => event?.category === 'physical',
        now,
      ),
      partial: false,
      sourceLabel: 'Atletica dal primo uso',
    };
  }

  if (surface === 'all court') {
    return {
      minutes: tennisMinutesSince(shoe?.startDate, planner, now),
      partial: false,
      sourceLabel: 'Tennis dal primo uso',
    };
  }

  const firstDate = String(shoe?.startDate || '');
  const today = dateKey(now);
  const events = Array.isArray(planner.events) ? planner.events : [];

  const relevant = events.filter(event =>
    event?.category === 'tennis'
    && firstDate
    && String(event.date || '') >= firstDate
    && String(event.date || '') <= today
  );

  const matching = relevant.filter(event =>
    normalizeSurface(event.surface) === surface
  );

  const minutes = matching.reduce(
    (sum, event) => sum + completedEventMinutes(event, now),
    0,
  );

  const partial = relevant.some(event => !normalizeSurface(event.surface));

  return {
    minutes,
    partial,
    sourceLabel: surface
      ? `Tennis ${shoe.surface} dal primo uso`
      : 'Tennis dal primo uso',
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatHoursFromMinutes(minutes, partial = false) {
  if (!Number.isFinite(minutes)) return '—';
  const prefix = partial ? '≥ ' : '';
  return `${prefix}${formatNumber(Math.max(0, minutes) / 60)} h`;
}

function formatHoursValue(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return '—';
  return `${formatNumber(hours)} h`;
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function getCurrentStringJob(racketId, jobs) {
  const installed = (Array.isArray(jobs) ? jobs : [])
    .filter(job => job?.racketId === racketId && job?.status === 'installed');
  if (!installed.length) return null;
  return [...installed].sort(
    (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
  )[0];
}

function lifecycleInfo(actualMinutes, plannedHours, noun, partial = false) {
  const planned = Number(plannedHours);
  if (!Number.isFinite(actualMinutes) || !Number.isFinite(planned) || planned <= 0) return null;

  const actualHours = Math.max(0, actualMinutes) / 60;
  const remaining = planned - actualHours;
  const ratio = actualHours / planned;
  let tone = 'ok';
  let text = `${noun}: sostituzione tra circa ${formatNumber(Math.max(0, remaining))} h`;

  if (remaining <= 0) {
    tone = 'overdue';
    text = `${noun}: soglia superata di ${formatNumber(Math.abs(remaining))} h`;
  } else if (ratio >= 0.75) {
    tone = 'warning';
  }

  if (partial) {
    text = `${noun}: stima parziale · ${text.toLowerCase()}`;
  }

  return { actualHours, plannedHours: planned, remainingHours: remaining, ratio, tone, text, partial };
}

function createSpec(label, value, hint = '') {
  const item = document.createElement('div');
  item.className = 'equipment-spec equipment-dynamic-spec';
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  item.append(span, strong);
  if (hint) {
    const small = document.createElement('small');
    small.textContent = hint;
    item.appendChild(small);
  }
  return item;
}

function createLifecycleBlock({ actualMinutes, plannedHours, noun, compact = false, partial = false }) {
  const info = lifecycleInfo(actualMinutes, plannedHours, noun, partial);
  if (!info) return null;

  const block = document.createElement('div');
  block.className = `equipment-lifecycle-block tone-${info.tone}${compact ? ' compact' : ''}${partial ? ' is-partial' : ''}`;
  const top = document.createElement('div');
  top.className = 'equipment-lifecycle-top';
  const label = document.createElement('span');
  label.textContent = info.text;
  const value = document.createElement('strong');
  value.textContent = `${partial ? '≥ ' : ''}${formatNumber(info.actualHours)} / ${formatNumber(info.plannedHours)} h`;
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
  card.querySelectorAll('.equipment-dynamic-spec, .equipment-lifecycle-block, .equipment-string-live-usage')
    .forEach(node => node.remove());
}

function unwrapOldStringSummary(stringRow) {
  const oldWrapper = stringRow.querySelector('.equipment-string-live-summary');
  if (!oldWrapper) return;
  const strong = oldWrapper.querySelector('strong');
  if (strong) oldWrapper.replaceWith(strong); else oldWrapper.remove();
}

function normalizeRacketCard(card, racket, currentId) {
  const isCurrent = racket.id === currentId;
  card.classList.toggle('is-current-equipment', isCurrent);
  card.classList.toggle('is-emergency-equipment', !isCurrent && racket.status === 'test');
  card.classList.toggle('is-reserve-equipment', !isCurrent && racket.status !== 'test' && racket.status !== 'retired');

  const status = card.querySelector('.equipment-status');
  let chip = card.querySelector('.equipment-primary-chip');
  if (isCurrent && !chip) {
    chip = document.createElement('span');
    chip.className = 'equipment-primary-chip';
    card.querySelector('.equipment-item-topline > div')?.appendChild(chip);
  }
  if (chip) chip.textContent = 'IN USO';

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
  if (setCurrent) setCurrent.textContent = 'Metti in uso';
}

function iconSvg(kind) {
  if (kind === 'racket') return `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="25" cy="23" rx="15" ry="19" fill="none" stroke="currentColor" stroke-width="4"/><path d="M15 15h20M12 23h26M15 31h20M18 7v32M26 4v38M34 8v31" stroke="currentColor" stroke-width="2" opacity=".45"/><path d="M37 39l11 11" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M47 49l7 7" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>`;
  if (kind === 'strings') return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="10" fill="none" stroke="currentColor" stroke-width="4"/><path d="M20 14v36M30 14v36M40 14v36M50 18H14M50 28H14M50 38H14M46 48H18" stroke="currentColor" stroke-width="2.4" opacity=".7"/></svg>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 39c6 0 9-3 14-9 3-4 7-6 11-6 5 0 8 2 12 5l6 5c2 2 2 5 0 7s-5 3-8 3H34c-4 0-7 2-10 5-3 4-6 6-10 6-4 0-7-2-8-5-2-4 1-11 5-11z" fill="currentColor"/><path d="M23 28l6-8m5 10l5-7m6 10l4-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".85"/></svg>`;
}

function ensureCardIcon(card, kind) {
  card.classList.add('equipment-setup-subcard', `setup-kind-${kind}`);
  card.querySelector('.equipment-setup-icon-badge')?.remove();
  const badge = document.createElement('div');
  badge.className = 'equipment-setup-icon-badge';
  badge.innerHTML = iconSvg(kind);
  card.prepend(badge);
}

function removePrinciplePanel() {
  document.querySelectorAll('.equipment-philosophy').forEach(node => node.remove());
  [...document.querySelectorAll('.panel h3')].forEach(h => {
    if ((h.textContent || '').trim().toLowerCase() === 'principio del modulo') h.closest('.panel')?.remove();
  });
}

function shoeName(shoe) {
  return [shoe?.brand, shoe?.model].filter(Boolean).join(' ') || 'Scarpe';
}

function createFootwearMiniCard(shoe, planner, now) {
  const usage = shoeUsage(shoe, planner, now);
  const card = document.createElement('article');
  card.className = `equipment-footwear-mini ${normalizeSurface(shoe.surface) === 'athletics' ? 'is-athletics' : 'is-tennis'}`;

  const head = document.createElement('div');
  head.className = 'equipment-footwear-mini-head';
  const icon = document.createElement('div');
  icon.className = 'equipment-footwear-mini-icon';
  icon.innerHTML = iconSvg('shoes');
  const headCopy = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.textContent = shoe.surface || 'Tennis';
  const name = document.createElement('strong');
  name.textContent = shoeName(shoe);
  headCopy.append(kicker, name);
  head.append(icon, headCopy);

  const specs = document.createElement('div');
  specs.className = 'equipment-footwear-mini-specs';
  specs.append(
    miniSpec('In uso dal', formatDate(shoe.startDate)),
    miniSpec(usage.sourceLabel, formatHoursFromMinutes(usage.minutes, usage.partial)),
    miniSpec('Ore previste', formatHoursValue(shoe.hoursUsed)),
  );

  if (usage.partial) {
    const note = document.createElement('div');
    note.className = 'equipment-footwear-partial-note';
    note.textContent = 'Stima parziale: esclude gli allenamenti Tennis senza superficie registrata.';
    specs.appendChild(note);
  }

  card.append(head, specs);
  const life = createLifecycleBlock({
    actualMinutes: usage.minutes,
    plannedHours: shoe.hoursUsed,
    noun: 'Scarpe',
    compact: true,
    partial: usage.partial,
  });
  if (life) card.appendChild(life);
  return card;
}

function miniSpec(label, value) {
  const row = document.createElement('div');
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  row.append(span, strong);
  return row;
}

function reshapeSetup(state, now) {
  const grid = document.querySelector('.equipment-current-grid');
  if (!grid || grid.dataset.reshaped === 'true') return;

  const cards = [...grid.querySelectorAll(':scope > .equipment-current-card')];
  const byTitle = title => cards.find(card =>
    card.querySelector('.equipment-card-kicker')?.textContent.trim() === title
  );

  const racketCard = byTitle('Racchetta principale') || byTitle('Racchetta in uso');
  const stringCard = byTitle('Incordatura corrente');
  const shoeCard = byTitle('Scarpe principali') || byTitle('Scarpe in uso');

  if (!racketCard || !stringCard) return;

  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const activeShoes = (Array.isArray(equipment.shoes) ? equipment.shoes : [])
    .filter(shoe => shoe.status === 'active')
    .sort((a, b) => String(a.surface || '').localeCompare(String(b.surface || ''), 'it'));

  racketCard.querySelector('.equipment-card-kicker').textContent = 'Racchetta in uso';
  if (shoeCard) shoeCard.remove();

  ensureCardIcon(racketCard, 'racket');
  ensureCardIcon(stringCard, 'strings');

  const racquetPanel = document.createElement('article');
  racquetPanel.className = 'panel equipment-racquet-system';
  const racquetHead = document.createElement('div');
  racquetHead.className = 'equipment-setup-panel-head';
  racquetHead.innerHTML = `<div><div class="eyebrow">Racquet setup</div><h3>Setup racchetta</h3><p>Telaio in uso e incordatura montata, con vita residua delle corde.</p></div><div class="equipment-setup-panel-mark">${iconSvg('racket')}</div>`;
  const racquetBody = document.createElement('div');
  racquetBody.className = 'equipment-racquet-system-grid';
  racquetBody.append(racketCard, stringCard);
  racquetPanel.append(racquetHead, racquetBody);

  const footwearPanel = document.createElement('article');
  footwearPanel.className = 'panel equipment-footwear-system';
  const footwearHead = document.createElement('div');
  footwearHead.className = 'equipment-setup-panel-head';
  footwearHead.innerHTML = `<div><div class="eyebrow">Footwear in use</div><h3>Scarpe in uso</h3><p>Le scarpe attive vengono conteggiate in base a superficie Tennis o attività Athletics.</p></div><div class="equipment-setup-panel-mark footwear">${iconSvg('shoes')}</div>`;

  const manage = document.createElement('button');
  manage.className = 'button button-ghost equipment-manage-footwear';
  manage.type = 'button';
  manage.textContent = 'Gestisci scarpe';
  manage.addEventListener('click', () => {
    document.querySelector('[data-equipment-section="shoes"]')?.click();
  });
  footwearHead.querySelector('div:first-child')?.appendChild(manage);

  const footwearBody = document.createElement('div');
  footwearBody.className = 'equipment-footwear-grid';
  if (activeShoes.length) {
    activeShoes.forEach(shoe => footwearBody.appendChild(createFootwearMiniCard(shoe, planner, now)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'equipment-footwear-empty';
    empty.textContent = 'Nessuna scarpa attualmente in uso.';
    footwearBody.appendChild(empty);
  }
  footwearPanel.append(footwearHead, footwearBody);

  grid.dataset.reshaped = 'true';
  grid.classList.add('equipment-setup-dashboard');
  grid.replaceChildren(racquetPanel, footwearPanel);
}

function enhanceRacketCards(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const rackets = Array.isArray(equipment.rackets) ? equipment.rackets : [];
  const jobs = Array.isArray(equipment.stringJobs) ? equipment.stringJobs : [];

  document.querySelectorAll('.equipment-item-card [data-edit-racket]').forEach(editButton => {
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
    for (const value of [
      `Montata: ${formatDate(currentString.date)}`,
      `Tennis dal montaggio: ${formatHoursFromMinutes(actualMinutes)}`,
      `Ore previste: ${formatHoursValue(currentString.hoursUsed)}`,
    ]) {
      const line = document.createElement('span');
      line.textContent = value;
      details.appendChild(line);
    }
    wrapper.append(details);

    const life = createLifecycleBlock({ actualMinutes, plannedHours: currentString.hoursUsed, noun: 'Corde', compact: true });
    if (life) stringRow.insertAdjacentElement('afterend', life);
  });
}

function enhanceCurrentSetupData(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const jobs = Array.isArray(equipment.stringJobs) ? equipment.stringJobs : [];

  document.querySelectorAll('.equipment-current-card').forEach(card => {
    cleanupDynamic(card);
    const kicker = card.querySelector('.equipment-card-kicker');
    if (!kicker) return;
    if (kicker.textContent.trim() === 'Racchetta principale') kicker.textContent = 'Racchetta in uso';
    if (kicker.textContent.trim() !== 'Incordatura corrente') return;

    const job = getCurrentStringJob(equipment.primaryRacketId, jobs);
    if (!job) return;
    const specs = card.querySelector('.equipment-spec-grid');
    if (!specs) return;

    card.querySelectorAll('.equipment-spec > span').forEach(label => {
      if (['Ore uso', 'Ore previste'].includes(label.textContent.trim())) label.textContent = 'Ore previste';
    });

    const actualMinutes = tennisMinutesSince(job.date, planner, now);
    specs.append(createSpec('Tennis dal montaggio', formatHoursFromMinutes(actualMinutes)));
    const life = createLifecycleBlock({ actualMinutes, plannedHours: job.hoursUsed, noun: 'Corde' });
    if (life) {
      const action = card.querySelector('.equipment-inline-action');
      if (action) action.before(life); else card.append(life);
    }
  });
}

function enhanceShoeCards(state, now) {
  const equipment = state.equipment || {};
  const planner = state.planner || {};
  const shoes = Array.isArray(equipment.shoes) ? equipment.shoes : [];

  document.querySelectorAll('.equipment-item-card [data-edit-shoe]').forEach(editButton => {
    const card = editButton.closest('.equipment-item-card');
    if (!card) return;
    const shoe = shoes.find(item => item.id === editButton.dataset.editShoe);
    if (!shoe) return;

    cleanupDynamic(card);
    const isCurrent = shoe.status === 'active';
    card.classList.toggle('is-current-equipment', isCurrent);

    const topLeft = card.querySelector('.equipment-item-topline > div');
    let chip = card.querySelector('.equipment-primary-chip');
    if (isCurrent && !chip && topLeft) {
      chip = document.createElement('span');
      chip.className = 'equipment-primary-chip';
      topLeft.appendChild(chip);
    }
    if (chip) {
      if (isCurrent) chip.textContent = 'IN USO'; else chip.remove();
    }

    card.querySelector('[data-set-primary-shoe]')?.remove();

    const status = card.querySelector('.equipment-status');
    if (status && shoe.status === 'active') {
      status.textContent = 'In uso';
      status.className = 'equipment-status shoe-active';
    }

    const specs = card.querySelector('.equipment-spec-grid');
    if (!specs) return;
    card.querySelectorAll('.equipment-spec > span').forEach(label => {
      if (label.textContent.trim() === 'Ore uso') label.textContent = 'Ore previste';
    });

    const usage = shoeUsage(shoe, planner, now);
    specs.append(createSpec(
      usage.sourceLabel,
      formatHoursFromMinutes(usage.minutes, usage.partial),
      usage.partial ? 'Stima parziale: alcuni allenamenti Tennis non hanno superficie.' : '',
    ));

    const life = createLifecycleBlock({
      actualMinutes: usage.minutes,
      plannedHours: shoe.hoursUsed,
      noun: 'Scarpe',
      partial: usage.partial,
    });
    if (life) {
      const note = card.querySelector('.equipment-note');
      if (note) note.before(life); else card.append(life);
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
    if (label?.lastChild) label.lastChild.textContent = ' Metti questa racchetta in uso';
  }

  if (stringForm) {
    const input = stringForm.elements.hoursUsed;
    const label = input?.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Ore di utilizzo previste';
  }

  if (shoeForm) {
    const surface = shoeForm.elements.surface;
    if (surface && ![...surface.options].some(option => option.value === 'Athletics')) {
      const option = document.createElement('option');
      option.value = 'Athletics';
      option.textContent = 'Athletics';
      surface.appendChild(option);
    }
    const surfaceLabel = surface?.closest('.field')?.querySelector('label');
    if (surfaceLabel) surfaceLabel.textContent = 'Tipo / superficie';

    const hours = shoeForm.elements.hoursUsed;
    const hoursLabel = hours?.closest('.field')?.querySelector('label');
    if (hoursLabel) hoursLabel.textContent = 'Ore di utilizzo previste';

    const primary = shoeForm.elements.makePrimary;
    const row = primary?.closest('.field');
    if (row) row.hidden = true;
  }
}

function applyEquipmentEnhancements() {
  pending = false;
  if (currentRoute() !== 'equipment') return;

  const state = store.getState();
  const now = new Date();
  removePrinciplePanel();
  enhanceForms();
  enhanceCurrentSetupData(state, now);
  enhanceRacketCards(state, now);
  enhanceShoeCards(state, now);
  reshapeSetup(state, now);
}

function scheduleApply() {
  if (pending) return;
  pending = true;
  window.queueMicrotask(applyEquipmentEnhancements);
}

document.addEventListener('click', event => {
  if (currentRoute() !== 'equipment') return;
  const target = event.target.closest?.(
    '[data-equipment-section], [data-module-workspace], [data-set-primary-racket], [data-edit-string], [data-edit-racket], [data-edit-shoe], #new-racket, #new-racket-empty, #new-string, #new-string-empty, #new-shoe, #new-shoe-empty'
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
    applyEquipmentEnhancements();
  });
});

window.addEventListener('hashchange', scheduleApply);
window.addEventListener('focus', scheduleApply);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); });
store.subscribe(scheduleApply);
scheduleApply();
