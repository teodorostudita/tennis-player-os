import '../bootstrap.js';

import { canWriteModule } from '../cloud/access.js';
import { store } from '../data/store.js';

const DRILL_FOCUS_KEY = 'tpos.bridge.drill-focus.v1';
const DEVELOPMENT_FOCUS_KEY = 'tpos.bridge.development-focus.v1';

const bridgeUi = {
  developmentFilter: 'all',
  enhancementTimer: null,
  deepLinkTimer: null,
  deepLinkAttempts: 0,
  knownDrillIds: new Set(),
  cleanupQueued: false,
};

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function developmentItems() {
  const items = store.getState().development?.items;
  return Array.isArray(items) ? items : [];
}

function drills() {
  const library = store.getState().drills?.library;
  return Array.isArray(library) ? library : [];
}

function linkedDevelopmentItems(drillId) {
  return developmentItems()
    .filter(item => (
      Array.isArray(item.linkedDrillIds)
      && item.linkedDrillIds.includes(drillId)
    ))
    .sort((a, b) => {
      const activeA = a.status === 'active' ? 0 : 1;
      const activeB = b.status === 'active' ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;

      const typeA = a.type === 'technique' ? 0 : 1;
      const typeB = b.type === 'technique' ? 0 : 1;
      if (typeA !== typeB) return typeA - typeB;

      return clean(a.title).localeCompare(clean(b.title), 'it');
    });
}

function developmentTypeLabel(item) {
  return item?.type === 'tactics' ? 'Tattica' : 'Tecnica';
}

function developmentStageLabel(stage = '') {
  return {
    learn: 'Imparare',
    stabilize: 'Stabilizzare',
    adapt: 'Adattare',
    match: 'In partita',
  }[stage] || 'Development';
}

function setSessionTarget(key, value) {
  try {
    sessionStorage.setItem(key, String(value || ''));
  } catch {}
}

function sessionTarget(key) {
  try {
    return clean(sessionStorage.getItem(key));
  } catch {
    return '';
  }
}

function clearSessionTarget(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

function goToDrill(drillId) {
  setSessionTarget(DRILL_FOCUS_KEY, drillId);
  bridgeUi.developmentFilter = 'all';

  if (route() === 'drills') {
    scheduleDeepLink(0);
    return;
  }

  location.hash = '#/drills';
}

function goToDevelopment(itemId) {
  setSessionTarget(DEVELOPMENT_FOCUS_KEY, itemId);

  if (route() === 'development') {
    scheduleDeepLink(0);
    return;
  }

  location.hash = '#/development';
}

function developmentPanel() {
  const detail = document.querySelector('[data-development-detail]');
  if (!detail) return null;

  const panels = [...detail.querySelectorAll(':scope > .panel')];

  return panels.find(panel =>
    clean(panel.querySelector('.panel-header h3')?.textContent)
      .toLowerCase() === 'drills collegati'
  ) || null;
}

function enhanceDevelopmentDetail() {
  if (route() !== 'development') return;

  const detail = document.querySelector('[data-development-detail]');
  const itemId = clean(detail?.dataset.developmentDetail);
  if (!itemId) return;

  const item = developmentItems().find(entry => entry.id === itemId);
  if (!item) return;

  const panel = developmentPanel();
  if (!panel) return;

  const linked = (item.linkedDrillIds || [])
    .map(id => drills().find(drill => drill.id === id))
    .filter(Boolean);

  const header = panel.querySelector('.panel-header');
  const headerButton = header?.querySelector('[data-go-drills]');

  if (headerButton) {
    headerButton.textContent = 'Apri libreria Drills →';
    headerButton.title = 'Apre la libreria completa degli esercizi.';
  }

  const body = panel.querySelector('.panel-body');
  if (!body) return;

  body.innerHTML = linked.length
    ? `
      <div class="dev-drill-bridge-list">
        ${linked.map(drill => `
          <article class="dev-drill-bridge-row">
            <button
              class="dev-drill-bridge-main"
              type="button"
              data-bridge-open-drill="${escapeAttr(drill.id)}"
            >
              <span class="dev-drill-bridge-icon">↗</span>
              <span>
                <strong>${escapeHtml(drill.title || 'Drill')}</strong>
                <small>${escapeHtml(
                  [drill.category, drill.focus].filter(Boolean).join(' · '),
                )}</small>
              </span>
            </button>
            <button
              class="button button-ghost dev-small-button"
              type="button"
              data-bridge-open-drill="${escapeAttr(drill.id)}"
            >
              Apri drill
            </button>
          </article>
        `).join('')}
      </div>
    `
    : `
      <div class="dev-drill-bridge-empty">
        <strong>Nessun drill collegato</strong>
        <span>
          Modifica questo tema Development e seleziona uno o più esercizi della libreria.
        </span>
        ${canWriteModule('development') ? `
          <button class="button button-ghost" type="button" data-bridge-edit-development>
            Collega un drill
          </button>
        ` : ''}
      </div>
    `;

  body.querySelector('[data-bridge-edit-development]')?.addEventListener('click', () => {
    document.querySelector('#dev-edit-item')?.click();
  });
}

function drillCardFromId(drillId) {
  const editButton = document.querySelector(
    `[data-edit-drill="${cssEscape(drillId)}"]`,
  );
  return editButton?.closest('.drills-card') || null;
}

function developmentFilterOptions() {
  const items = developmentItems()
    .filter(item => clean(item.title))
    .sort((a, b) => {
      const activeA = a.status === 'active' ? 0 : 1;
      const activeB = b.status === 'active' ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return clean(a.title).localeCompare(clean(b.title), 'it');
    });

  return `
    <option value="all" ${bridgeUi.developmentFilter === 'all' ? 'selected' : ''}>Tutti</option>
    <option value="linked" ${bridgeUi.developmentFilter === 'linked' ? 'selected' : ''}>Solo collegati</option>
    <option value="unlinked" ${bridgeUi.developmentFilter === 'unlinked' ? 'selected' : ''}>Senza collegamento</option>
    ${items.length ? '<optgroup label="Tema Development">' : ''}
    ${items.map(item => `
      <option value="item:${escapeAttr(item.id)}" ${bridgeUi.developmentFilter === `item:${item.id}` ? 'selected' : ''}>
        ${escapeHtml(`${developmentTypeLabel(item)} · ${item.title}`)}
      </option>
    `).join('')}
    ${items.length ? '</optgroup>' : ''}
  `;
}

function matchesDevelopmentFilter(drillId) {
  const linked = linkedDevelopmentItems(drillId);

  if (bridgeUi.developmentFilter === 'all') return true;
  if (bridgeUi.developmentFilter === 'linked') return linked.length > 0;
  if (bridgeUi.developmentFilter === 'unlinked') return linked.length === 0;

  if (bridgeUi.developmentFilter.startsWith('item:')) {
    const itemId = bridgeUi.developmentFilter.slice(5);
    return linked.some(item => item.id === itemId);
  }

  return true;
}

function applyDevelopmentFilter() {
  if (route() !== 'drills') return;

  const cards = [...document.querySelectorAll('.drills-card')]
    .map(card => ({
      card,
      drillId: clean(card.querySelector('[data-edit-drill]')?.dataset.editDrill),
    }))
    .filter(row => row.drillId);

  let visible = 0;

  for (const row of cards) {
    const show = matchesDevelopmentFilter(row.drillId);
    row.card.hidden = !show;
    if (show) visible += 1;
  }

  const count = document.querySelector('.drills-result-count');
  if (count && document.querySelector('#drills-development-filter')) {
    count.textContent = `${visible} visibili · ${drills().length} totali`;
  }
}

function renderDevelopmentLinksForCard(card, drillId) {
  const linked = linkedDevelopmentItems(drillId);
  const actions = card.querySelector('.drills-card-actions');
  if (!actions) return;

  let bridge = card.querySelector('.drills-development-links');

  if (!bridge) {
    bridge = document.createElement('section');
    bridge.className = 'drills-development-links';
    actions.insertAdjacentElement('beforebegin', bridge);
  }

  bridge.innerHTML = `
    <div class="drills-development-links-head">
      <span>Development</span>
      <strong>${linked.length}</strong>
    </div>
    ${linked.length ? `
      <div class="drills-development-chips">
        ${linked.map(item => `
          <button
            type="button"
            class="drills-development-chip"
            data-bridge-open-development="${escapeAttr(item.id)}"
            title="${escapeAttr(`${developmentTypeLabel(item)} · ${developmentStageLabel(item.stage)}`)}"
          >
            <span>${escapeHtml(item.type === 'tactics' ? 'TAT' : 'TEC')}</span>
            ${escapeHtml(item.title)}
          </button>
        `).join('')}
      </div>
    ` : '<p>Nessun tema collegato.</p>'}
  `;

  let manage = actions.querySelector(
    `[data-bridge-manage-drill="${cssEscape(drillId)}"]`,
  );

  if (!manage) {
    manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'button button-ghost drills-development-manage';
    manage.dataset.bridgeManageDrill = drillId;
    actions.prepend(manage);
  }

  if (canWriteModule('development')) {
    manage.disabled = false;
    manage.textContent = linked.length ? `Development · ${linked.length}` : 'Collega Development';
    manage.title = 'Gestisci i temi Development collegati a questo drill.';
  } else {
    manage.disabled = true;
    manage.textContent = linked.length ? `Development · ${linked.length}` : 'Development';
    manage.title = 'Development è in sola lettura per questo account.';
  }
}

function ensureLibraryDevelopmentFilter() {
  if (route() !== 'drills') return;

  const filterbar = document.querySelector('.drills-filterbar');
  if (!filterbar) return;

  let field = filterbar.querySelector('.drills-development-filter');

  if (!field) {
    field = document.createElement('label');
    field.className = 'drills-development-filter';
    field.innerHTML = `
      <span>Development</span>
      <select id="drills-development-filter">${developmentFilterOptions()}</select>
    `;

    const favorites = filterbar.querySelector('.drills-favorite-filter');
    filterbar.insertBefore(field, favorites || null);

    field.querySelector('select').addEventListener('change', event => {
      bridgeUi.developmentFilter = event.target.value;
      applyDevelopmentFilter();
    });
  } else {
    const select = field.querySelector('select');
    if (select) {
      const active = bridgeUi.developmentFilter;
      select.innerHTML = developmentFilterOptions();
      select.value = active;
    }
  }

  applyDevelopmentFilter();
}

function enhanceDrillsLibrary() {
  if (route() !== 'drills') return;
  if (!document.querySelector('.drills-library-grid')) return;

  for (const card of document.querySelectorAll('.drills-card')) {
    const drillId = clean(card.querySelector('[data-edit-drill]')?.dataset.editDrill);
    if (!drillId) continue;

    card.dataset.bridgeDrillId = drillId;
    renderDevelopmentLinksForCard(card, drillId);
  }

  ensureLibraryDevelopmentFilter();
}

function renderOverviewBridge() {
  if (route() !== 'drills') return;

  const kpis = document.querySelector('.drills-kpis');
  if (!kpis) return;

  const linkedDrillIds = new Set(
    developmentItems().flatMap(item =>
      Array.isArray(item.linkedDrillIds) ? item.linkedDrillIds : [],
    ),
  );

  let kpi = kpis.querySelector('.drills-development-kpi');
  if (!kpi) {
    kpi = document.createElement('article');
    kpi.className = 'drills-kpi drills-development-kpi';
    kpis.appendChild(kpi);
  }

  kpi.innerHTML = `
    <span>Collegati a Development</span>
    <strong>${linkedDrillIds.size}</strong>
  `;

  const overviewGrid = document.querySelector('.drills-overview-grid');
  if (!overviewGrid) return;

  document.querySelector('.drills-development-bridge-panel')?.remove();

  const items = developmentItems()
    .filter(item => Array.isArray(item.linkedDrillIds) && item.linkedDrillIds.length)
    .sort((a, b) => {
      const activeA = a.status === 'active' ? 0 : 1;
      const activeB = b.status === 'active' ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return Number(a.roadmapOrder || 9999) - Number(b.roadmapOrder || 9999);
    });

  const panel = document.createElement('section');
  panel.className = 'panel drills-development-bridge-panel';
  panel.innerHTML = `
    <div class="panel-header drills-development-bridge-head">
      <div>
        <h3>Development bridge</h3>
        <p>I temi di sviluppo e gli esercizi che li rendono operativi in campo.</p>
      </div>
      <button class="button button-ghost" type="button" data-bridge-open-development="">
        Apri Development →
      </button>
    </div>
    <div class="panel-body">
      ${items.length ? `
        <div class="drills-development-theme-grid">
          ${items.slice(0, 8).map(item => {
            const validDrills = (item.linkedDrillIds || [])
              .filter(id => drills().some(drill => drill.id === id));
            return `
              <button
                class="drills-development-theme-card"
                type="button"
                data-bridge-open-development="${escapeAttr(item.id)}"
              >
                <span>${escapeHtml(developmentTypeLabel(item))}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>
                  ${validDrills.length} ${validDrills.length === 1 ? 'drill collegato' : 'drill collegati'}
                  · ${escapeHtml(developmentStageLabel(item.stage))}
                </small>
              </button>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="drills-development-bridge-empty">
          <strong>Nessun collegamento ancora creato.</strong>
          <span>Puoi associare un drill a uno o più temi Development direttamente dalla Libreria.</span>
        </div>
      `}
    </div>
  `;

  overviewGrid.insertAdjacentElement('afterend', panel);
}

function enhanceDrills() {
  if (route() !== 'drills') return;

  const pageTitle = document.querySelector('#page-title');
  if (pageTitle) pageTitle.textContent = '4. Drills';

  if (document.querySelector('.drills-library-grid')) {
    enhanceDrillsLibrary();
  }

  if (document.querySelector('.drills-kpis')) {
    renderOverviewBridge();
  }
}

function openLinkDialog(drillId) {
  if (!canWriteModule('development')) return;

  const drill = drills().find(item => item.id === drillId);
  if (!drill) return;

  document.querySelector('#drills-development-link-dialog')?.remove();

  const selected = new Set(linkedDevelopmentItems(drillId).map(item => item.id));

  const items = [...developmentItems()].sort((a, b) => {
    const activeA = a.status === 'active' ? 0 : 1;
    const activeB = b.status === 'active' ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;

    const typeA = a.type === 'technique' ? 0 : 1;
    const typeB = b.type === 'technique' ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;

    return clean(a.title).localeCompare(clean(b.title), 'it');
  });

  const dialog = document.createElement('dialog');
  dialog.id = 'drills-development-link-dialog';
  dialog.className = 'planner-dialog drills-development-link-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="drills-development-link-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Development ↔ Drills</div>
          <h3>${escapeHtml(drill.title || 'Drill')}</h3>
          <p>Un drill può supportare più temi tecnici o tattici. Il collegamento viene salvato nel record Development.</p>
        </div>
        <button class="dialog-close" type="button" data-bridge-dialog-close aria-label="Chiudi">×</button>
      </div>

      <div class="dialog-body">
        ${items.length ? `
          <div class="drills-development-picker">
            ${items.map(item => `
              <label class="${selected.has(item.id) ? 'selected' : ''}">
                <input
                  type="checkbox"
                  name="developmentItem"
                  value="${escapeAttr(item.id)}"
                  ${selected.has(item.id) ? 'checked' : ''}
                />
                <span>
                  <small>${escapeHtml(developmentTypeLabel(item))} · ${escapeHtml(developmentStageLabel(item.stage))}</small>
                  <strong>${escapeHtml(item.title || 'Tema Development')}</strong>
                  ${item.area ? `<em>${escapeHtml(item.area)}</em>` : ''}
                </span>
              </label>
            `).join('')}
          </div>
        ` : `
          <div class="drills-development-bridge-empty">
            <strong>Nessun tema Development disponibile.</strong>
            <span>Crea prima un tema tecnico o tattico nel modulo Development.</span>
          </div>
        `}
      </div>

      <div class="dialog-actions">
        <span>${selected.size} ${selected.size === 1 ? 'collegamento attuale' : 'collegamenti attuali'}</span>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-bridge-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit" ${items.length ? '' : 'disabled'}>Salva collegamenti</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog.querySelectorAll('[data-bridge-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelectorAll('input[name="developmentItem"]').forEach(input => {
    input.addEventListener('change', () => {
      input.closest('label')?.classList.toggle('selected', input.checked);
    });
  });

  dialog.querySelector('form')?.addEventListener('submit', event => {
    event.preventDefault();

    const chosen = new Set(
      new FormData(event.currentTarget)
        .getAll('developmentItem')
        .map(String),
    );

    const now = new Date().toISOString();

    store.update(state => {
      const devItems = Array.isArray(state.development?.items)
        ? state.development.items
        : [];

      for (const item of devItems) {
        const ids = new Set(
          Array.isArray(item.linkedDrillIds) ? item.linkedDrillIds : [],
        );

        const had = ids.has(drillId);
        const shouldHave = chosen.has(item.id);

        if (shouldHave) ids.add(drillId);
        else ids.delete(drillId);

        if (had !== shouldHave) {
          item.linkedDrillIds = [...ids];
          item.updatedAt = now;
        }
      }
    });

    dialog.close();
    scheduleEnhancement(0);
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

function resetNativeDrillFiltersForDeepLink() {
  const search = document.querySelector('#drills-search');
  const category = document.querySelector('#drills-category-filter');
  const focus = document.querySelector('#drills-focus-filter');
  const favorites = document.querySelector('#drills-favorites-filter');

  bridgeUi.developmentFilter = 'all';

  if (search && search.value) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (category && category.value !== 'all') {
    category.value = 'all';
    category.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (focus && focus.value !== 'all') {
    focus.value = 'all';
    focus.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (favorites?.checked) {
    favorites.checked = false;
    favorites.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function focusPendingDrill() {
  if (route() !== 'drills') return true;

  const drillId = sessionTarget(DRILL_FOCUS_KEY);
  if (!drillId) return true;

  const libraryButton = document.querySelector('[data-drills-section="library"]');

  if (libraryButton && !libraryButton.classList.contains('active')) {
    libraryButton.click();
    return false;
  }

  if (!document.querySelector('.drills-library-grid')) return false;

  let card = drillCardFromId(drillId);

  if (!card) {
    resetNativeDrillFiltersForDeepLink();
    card = drillCardFromId(drillId);
    if (!card) return false;
  }

  clearSessionTarget(DRILL_FOCUS_KEY);

  document.querySelectorAll('.drills-card--focused')
    .forEach(node => node.classList.remove('drills-card--focused'));

  card.hidden = false;
  card.classList.add('drills-card--focused');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });

  window.setTimeout(() => {
    card.classList.remove('drills-card--focused');
  }, 4200);

  return true;
}

function focusPendingDevelopment() {
  if (route() !== 'development') return true;

  const itemId = sessionTarget(DEVELOPMENT_FOCUS_KEY);
  if (!itemId) return true;

  const item = developmentItems().find(entry => entry.id === itemId);
  if (!item) return false;

  const contentButton = document.querySelector('[data-module-workspace="content"]');

  if (contentButton && !contentButton.classList.contains('active')) {
    contentButton.click();
    return false;
  }

  if (document.querySelector(`[data-development-detail="${cssEscape(itemId)}"]`)) {
    clearSessionTarget(DEVELOPMENT_FOCUS_KEY);
    return true;
  }

  const typeButton = document.querySelector(
    `[data-development-type="${cssEscape(item.type === 'tactics' ? 'tactics' : 'technique')}"]`,
  );

  if (typeButton && !typeButton.classList.contains('active')) {
    typeButton.click();
    return false;
  }

  const cardButton = document.querySelector(
    `[data-open-development-item="${cssEscape(itemId)}"]`,
  );

  if (!cardButton) return false;

  cardButton.click();
  clearSessionTarget(DEVELOPMENT_FOCUS_KEY);
  return true;
}

function runDeepLink() {
  window.clearTimeout(bridgeUi.deepLinkTimer);
  bridgeUi.deepLinkTimer = null;

  const done = route() === 'drills'
    ? focusPendingDrill()
    : route() === 'development'
      ? focusPendingDevelopment()
      : true;

  if (done) {
    bridgeUi.deepLinkAttempts = 0;
    return;
  }

  bridgeUi.deepLinkAttempts += 1;

  if (bridgeUi.deepLinkAttempts > 35) {
    bridgeUi.deepLinkAttempts = 0;
    return;
  }

  bridgeUi.deepLinkTimer = window.setTimeout(
    runDeepLink,
    bridgeUi.deepLinkAttempts < 8 ? 80 : 150,
  );
}

function scheduleDeepLink(delay = 30) {
  window.clearTimeout(bridgeUi.deepLinkTimer);
  bridgeUi.deepLinkTimer = window.setTimeout(runDeepLink, delay);
}

function scheduleEnhancement(delay = 35) {
  window.clearTimeout(bridgeUi.enhancementTimer);

  bridgeUi.enhancementTimer = window.setTimeout(() => {
    bridgeUi.enhancementTimer = null;

    if (route() === 'development') {
      enhanceDevelopmentDetail();
    } else if (route() === 'drills') {
      enhanceDrills();
    }

    scheduleDeepLink(0);
  }, delay);
}

function queueStaleLinkCleanup(state) {
  if (!canWriteModule('development')) {
    bridgeUi.knownDrillIds = new Set(
      (state.drills?.library || []).map(drill => drill.id),
    );
    return;
  }

  const currentIds = new Set(
    (state.drills?.library || []).map(drill => drill.id),
  );

  if (!bridgeUi.knownDrillIds.size) {
    bridgeUi.knownDrillIds = currentIds;
    return;
  }

  const removed = [...bridgeUi.knownDrillIds]
    .filter(id => !currentIds.has(id));

  bridgeUi.knownDrillIds = currentIds;

  if (!removed.length || bridgeUi.cleanupQueued) return;

  bridgeUi.cleanupQueued = true;

  window.queueMicrotask(() => {
    bridgeUi.cleanupQueued = false;

    const validIds = new Set(
      (store.getState().drills?.library || []).map(drill => drill.id),
    );

    store.update(next => {
      const items = Array.isArray(next.development?.items)
        ? next.development.items
        : [];
      const now = new Date().toISOString();

      for (const item of items) {
        const before = Array.isArray(item.linkedDrillIds)
          ? item.linkedDrillIds
          : [];
        const after = before.filter(id => validIds.has(id));

        if (after.length !== before.length) {
          item.linkedDrillIds = after;
          item.updatedAt = now;
        }
      }
    });
  });
}

document.addEventListener('click', event => {
  const drillTarget = event.target?.closest?.('[data-bridge-open-drill]');

  if (drillTarget) {
    event.preventDefault();
    event.stopPropagation();
    goToDrill(drillTarget.dataset.bridgeOpenDrill);
    return;
  }

  const developmentTarget = event.target?.closest?.('[data-bridge-open-development]');

  if (developmentTarget) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = clean(developmentTarget.dataset.bridgeOpenDevelopment);
    if (itemId) goToDevelopment(itemId);
    else location.hash = '#/development';
    return;
  }

  const manage = event.target?.closest?.('[data-bridge-manage-drill]');

  if (manage) {
    event.preventDefault();
    event.stopPropagation();
    openLinkDialog(manage.dataset.bridgeManageDrill);
    return;
  }

  if (
    event.target?.closest?.('[data-drills-section]')
    || event.target?.closest?.('[data-edit-drill]')
    || event.target?.closest?.('[data-toggle-favorite]')
    || event.target?.closest?.('[data-open-development-item]')
    || event.target?.closest?.('[data-development-type]')
    || event.target?.closest?.('#dev-back')
    || event.target?.closest?.('#dev-edit-item')
    || event.target?.closest?.('[data-module-workspace]')
  ) {
    scheduleEnhancement(20);
  }
}, true);

document.addEventListener('input', event => {
  if (
    route() === 'drills'
    && event.target?.matches?.('#drills-search')
  ) {
    scheduleEnhancement(190);
  }
});

document.addEventListener('change', event => {
  if (
    route() === 'drills'
    && event.target?.matches?.(
      '#drills-category-filter, #drills-focus-filter, #drills-favorites-filter',
    )
  ) {
    scheduleEnhancement(35);
  }
});

window.addEventListener('hashchange', () => {
  scheduleEnhancement(20);
  scheduleDeepLink(40);
});

bridgeUi.knownDrillIds = new Set(drills().map(drill => drill.id));

store.subscribe(state => {
  queueStaleLinkCleanup(state);

  if (route() === 'development' || route() === 'drills') {
    scheduleEnhancement(60);
  }
});

scheduleEnhancement(60);
scheduleDeepLink(80);
