import { APP_VERSION } from '../version.js';
import { RELEASE_LOG } from '../releaseLog.js';
import { isAppOwner } from '../cloud/accountAccess.js';

const DASHBOARD_ROUTE = /^(#\/?dashboard)?$/;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value = '') {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function currentRelease() {
  return RELEASE_LOG.find(item => item.version === APP_VERSION)
    || RELEASE_LOG[0]
    || null;
}

function ensureReleaseDialog() {
  if (!isAppOwner()) return null;

  let dialog = document.querySelector('#owner-release-log-dialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'owner-release-log-dialog';
  dialog.className = 'release-log-dialog';

  dialog.innerHTML = `
    <div class="release-log-head">
      <div>
        <div class="eyebrow">Owner</div>
        <h3>Release log</h3>
        <p>Storico delle versioni pubblicate di Tennis Player OS.</p>
      </div>
      <button class="dialog-close" type="button" data-release-log-close aria-label="Chiudi">×</button>
    </div>

    <div class="release-log-body">
      ${RELEASE_LOG.map((release, index) => `
        <article class="release-log-entry ${release.version === APP_VERSION ? 'current' : ''}">
          <div class="release-log-version">
            <strong>v${escapeHtml(release.version)}</strong>
            ${release.version === APP_VERSION ? '<span>Corrente</span>' : ''}
          </div>
          <div class="release-log-content">
            <div class="release-log-title-row">
              <h4>${escapeHtml(release.title)}</h4>
              <time datetime="${escapeHtml(release.date)}">${escapeHtml(formatDate(release.date))}</time>
            </div>
            <ul>
              ${(release.details || []).map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}
            </ul>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  dialog.querySelector('[data-release-log-close]')
    ?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  document.body.appendChild(dialog);
  return dialog;
}

function injectDashboardVersioning() {
  const main = document.querySelector('#main-content');
  if (!main) return;

  const route = window.location.hash || '#/dashboard';
  if (!DASHBOARD_ROUTE.test(route)) return;

  const hero = main.querySelector('.hero');
  if (!hero || main.querySelector('[data-dashboard-versioning]')) return;

  const release = currentRelease();
  const wrap = document.createElement('div');
  wrap.className = 'dashboard-versioning';
  wrap.dataset.dashboardVersioning = 'true';

  wrap.innerHTML = `
    <div class="dashboard-version-badge">
      <span>Tennis Player OS</span>
      <strong>v${escapeHtml(APP_VERSION)}</strong>
      ${release?.date ? `<small>· ${escapeHtml(formatDate(release.date))}</small>` : ''}
    </div>

    ${isAppOwner() ? `
      <button class="dashboard-release-log-button" type="button" data-open-release-log>
        Release log
      </button>
    ` : ''}
  `;

  hero.insertAdjacentElement('afterend', wrap);

  if (isAppOwner()) {
    wrap.querySelector('[data-open-release-log]')
      ?.addEventListener('click', () => {
        const dialog = ensureReleaseDialog();
        dialog?.showModal();
      });
  }
}

const main = document.querySelector('#main-content');

if (main) {
  const observer = new MutationObserver(() => {
    window.queueMicrotask(injectDashboardVersioning);
  });

  observer.observe(main, {
    childList: true,
    subtree: true,
  });
}

window.addEventListener('hashchange', () => {
  window.queueMicrotask(injectDashboardVersioning);
});

window.queueMicrotask(injectDashboardVersioning);
