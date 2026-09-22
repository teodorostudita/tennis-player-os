import { getCurrentAccess } from './access.js';

const MODULE_KEYS = new Set([
  'development',
  'training',
  'drills',
  'competition',
  'opponents',
  'equipment',
  'health',
  'nutrition',
  'mental',
  'visual',
  'economics',
  'calendar',
]);

let observer = null;
let guardStarted = false;

function routeFromHash() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function isModuleRoute(route) {
  return MODULE_KEYS.has(route);
}

function canRead(access, moduleKey) {
  return Boolean(access.modules?.[moduleKey]?.canRead);
}

function canWrite(access, moduleKey) {
  return Boolean(access.modules?.[moduleKey]?.canWrite);
}

function applyRouteVisibility(access) {
  document.querySelectorAll('[data-route]').forEach(element => {
    const route = element.dataset.route;
    if (!isModuleRoute(route)) return;

    const denied = !canRead(access, route);

    element.hidden = false;
    element.classList.toggle('tpos-route-locked', denied);
    element.setAttribute('aria-disabled', denied ? 'true' : 'false');

    if (denied) {
      element.title = 'Modulo non autorizzato per questo account';
    } else if (element.title === 'Modulo non autorizzato per questo account') {
      element.removeAttribute('title');
    }
  });

  document.querySelectorAll('.module-card').forEach(card => {
    const routeElement = card.querySelector('[data-route]');
    const route = routeElement?.dataset.route;
    if (!isModuleRoute(route)) return;

    const denied = !canRead(access, route);

    card.hidden = false;
    card.classList.toggle('tpos-module-locked', denied);

    let badge = card.querySelector('[data-permission-lock-badge]');

    if (denied && !badge) {
      badge = document.createElement('div');
      badge.dataset.permissionLockBadge = 'true';
      badge.className = 'tpos-module-lock-badge';
      badge.textContent = 'Non autorizzato';
      card.appendChild(badge);
    } else if (!denied) {
      badge?.remove();
    }
  });

  const currentRoute = routeFromHash();
  if (isModuleRoute(currentRoute) && !canRead(access, currentRoute)) {
    location.hash = '#/dashboard';
  }
}

function applyAthleteProfileReadOnly(access) {
  const form = document.querySelector('#athlete-form');
  if (!form) return;

  const readOnly = !access.isAdmin;

  form.querySelectorAll('input, select, textarea').forEach(control => {
    control.disabled = readOnly;
  });

  let note = document.querySelector('#athlete-profile-access-note');

  if (readOnly) {
    if (!note) {
      note = document.createElement('div');
      note.id = 'athlete-profile-access-note';
      note.className = 'access-info';
      note.textContent = 'Profilo atleta in sola lettura per questo account.';
      form.prepend(note);
    }
  } else {
    note?.remove();
  }
}

function applyCalendarReadOnly(access) {
  const main = document.querySelector('#main-content');
  if (!main) return;

  const calendarReadable = canRead(access, 'calendar');
  const calendarWritable = canWrite(access, 'calendar');
  const readOnly = calendarReadable && !calendarWritable;

  main.classList.toggle('tpos-calendar-readonly', readOnly);

  const mutationSelectors = [
    '#new-calendar-event',
    '#manage-people',
    '#new-tournament',
    '[data-add-date]',
    '[data-add-tournament-month]',
    '#copy-event',
    '#delete-event',
    '#delete-series',
    '#delete-tournament',
    '#add-person-form',
    '[data-remove-person]',
    '.planner-resize-handle',
  ];

  for (const selector of mutationSelectors) {
    main.querySelectorAll(selector).forEach(element => {
      element.hidden = readOnly;
    });
  }

  if (!readOnly) return;

  for (const selector of ['#event-form', '#tournament-form']) {
    const form = main.querySelector(selector);
    if (!form) continue;

    form.querySelectorAll('input, select, textarea').forEach(control => {
      control.disabled = true;
    });

    form.querySelectorAll('button[type="submit"]').forEach(button => {
      button.hidden = true;
    });
  }

  const existingBanner = main.querySelector('#calendar-readonly-banner');
  if (!existingBanner) {
    const calendarHead = main.querySelector('.calendar-module-head');
    if (calendarHead) {
      const banner = document.createElement('div');
      banner.id = 'calendar-readonly-banner';
      banner.className = 'access-info';
      banner.style.marginTop = '12px';
      banner.textContent = 'Calendar in sola lettura: puoi consultare programma, logistica e tornei, ma non modificarli.';
      calendarHead.insertAdjacentElement('afterend', banner);
    }
  }
}

function applyPermissionUI() {
  const access = getCurrentAccess();
  applyRouteVisibility(access);
  applyAthleteProfileReadOnly(access);
  applyCalendarReadOnly(access);
}

function isCalendarReadOnly() {
  const access = getCurrentAccess();
  return canRead(access, 'calendar') && !canWrite(access, 'calendar');
}

function installCaptureGuards() {
  document.addEventListener('pointerdown', event => {
    if (!isCalendarReadOnly()) return;
    if (routeFromHash() !== 'calendar') return;

    const eventCard = event.target.closest?.('.planner-timeline-event[data-event-id]');
    if (eventCard) {
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('click', event => {
    const access = getCurrentAccess();
    const target = event.target;

    const routeElement = target.closest?.('[data-route]');
    const route = routeElement?.dataset.route;

    if (isModuleRoute(route) && !canRead(access, route)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (!isCalendarReadOnly()) return;
    if (routeFromHash() !== 'calendar') return;

    const blocked = target.closest?.([
      '#new-calendar-event',
      '#manage-people',
      '#new-tournament',
      '[data-add-date]',
      '[data-add-tournament-month]',
      '#copy-event',
      '#delete-event',
      '#delete-series',
      '#delete-tournament',
      '#add-person-form',
      '[data-remove-person]',
      '.planner-resize-handle',
    ].join(','));

    const blankTimeline = target.closest?.('.planner-timeline-day')
      && !target.closest?.('.planner-timeline-event[data-event-id]');

    if (blocked || blankTimeline) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('submit', event => {
    if (!isCalendarReadOnly()) return;
    if (routeFromHash() !== 'calendar') return;

    const form = event.target;
    if (form?.matches?.('#event-form, #tournament-form, #add-person-form')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

export function startPermissionGuard() {
  if (guardStarted) return;
  guardStarted = true;

  installCaptureGuards();
  applyPermissionUI();

  observer = new MutationObserver(() => {
    queueMicrotask(applyPermissionUI);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('hashchange', () => {
    queueMicrotask(applyPermissionUI);
  });
}
