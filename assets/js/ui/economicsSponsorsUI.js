import '../cloud/economicsCloudRuntime.js';

import { store } from '../data/store.js';
import { canWriteModule } from '../cloud/access.js';
import { showInAppConfirm } from './inAppMessages.js';

const statusLabels = {
  prospect: 'Prospect',
  negotiation: 'Trattativa',
  active: 'Attivo',
  completed: 'Concluso',
  declined: 'Non concluso',
};

const typeLabels = {
  cash: 'Economico',
  inkind: 'Fornitura / in-kind',
  mixed: 'Misto',
};

let sponsorModeActive = false;
let enhancementQueued = false;

function route() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function selectedYear() {
  const select = document.querySelector('#economics-year');
  const value = Number(select?.value || new Date().getFullYear());
  return Number.isFinite(value) ? value : new Date().getFullYear();
}

function selectedSeasonStart() {
  const select = document.querySelector('#economics-season');
  const now = new Date();
  const fallback = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const value = Number(select?.value || fallback);
  return Number.isFinite(value) ? value : fallback;
}

function seasonLabel(start) {
  const year = Number(start || selectedSeasonStart());
  return `${year}/${String(year + 1).slice(-2)}`;
}

function sponsors() {
  const rows = store.getState().economics?.sponsors;
  return Array.isArray(rows) ? rows : [];
}

function sponsorsForYear(year) {
  return sponsors()
    .filter(sponsor => Number(sponsor.seasonYear || year) === Number(year))
    .sort((a, b) => {
      const activeOrder = Number(b.status === 'active') - Number(a.status === 'active');
      if (activeOrder) return activeOrder;
      return String(a.name || '').localeCompare(String(b.name || ''), 'it');
    });
}

function money(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatPeriod(sponsor) {
  if (sponsor.startDate && sponsor.endDate) {
    return `${dateLabel(sponsor.startDate)} – ${dateLabel(sponsor.endDate)}`;
  }
  if (sponsor.startDate) return `dal ${dateLabel(sponsor.startDate)}`;
  if (sponsor.endDate) return `fino al ${dateLabel(sponsor.endDate)}`;
  return `Stagione ${seasonLabel(sponsor.seasonYear || selectedSeasonStart())}`;
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

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function statusOptions(selected) {
  return Object.entries(statusLabels)
    .map(([value, label]) =>
      `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function typeOptions(selected) {
  return Object.entries(typeLabels)
    .map(([value, label]) =>
      `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function sponsorSummary(rows) {
  const activeCount = rows.filter(row => row.status === 'active').length;
  const cashCommitted = rows.reduce(
    (total, row) => total + Number(row.cashCommitted || 0),
    0,
  );
  const cashReceived = rows.reduce(
    (total, row) => total + Number(row.cashReceived || 0),
    0,
  );
  const inKindValue = rows.reduce(
    (total, row) => total + Number(row.inKindValue || 0),
    0,
  );

  return {
    activeCount,
    cashCommitted,
    cashReceived,
    inKindValue,
    totalValue: cashReceived + inKindValue,
  };
}

function sponsorCard(sponsor, writable) {
  const contact = [
    sponsor.contactName,
    sponsor.contactEmail,
    sponsor.contactPhone,
  ].filter(Boolean).join(' · ');

  return `
    <article class="panel economics-sponsor-card">
      <div class="panel-body">
        <div class="economics-sponsor-card-head">
          <div>
            <div class="economics-sponsor-badges">
              <span class="economics-sponsor-status status-${escapeAttr(sponsor.status || 'prospect')}">
                ${escapeHtml(statusLabels[sponsor.status] || 'Prospect')}
              </span>
              <span class="economics-sponsor-type">
                ${escapeHtml(typeLabels[sponsor.type] || 'Economico')}
              </span>
            </div>
            <h3>${escapeHtml(sponsor.name || 'Sponsor')}</h3>
            <p>${escapeHtml(formatPeriod(sponsor))}</p>
          </div>
          ${writable
            ? `<button class="icon-button" type="button"
                 data-edit-sponsor="${escapeAttr(sponsor.id)}"
                 aria-label="Modifica sponsor">✎</button>`
            : ''}
        </div>

        <div class="economics-sponsor-values">
          <div><span>Concordato</span><strong>${money(sponsor.cashCommitted)}</strong></div>
          <div><span>Ricevuto</span><strong>${money(sponsor.cashReceived)}</strong></div>
          <div><span>In-kind</span><strong>${money(sponsor.inKindValue)}</strong></div>
        </div>

        ${contact
          ? `<div class="economics-sponsor-contact">
               <strong>Contatto</strong><span>${escapeHtml(contact)}</span>
             </div>`
          : ''}
        ${sponsor.benefits
          ? `<div class="economics-sponsor-note">
               <strong>Fornitura / benefit</strong><span>${escapeHtml(sponsor.benefits)}</span>
             </div>`
          : ''}
        ${sponsor.deliverables
          ? `<div class="economics-sponsor-note">
               <strong>Impegni atleta / visibilità</strong><span>${escapeHtml(sponsor.deliverables)}</span>
             </div>`
          : ''}
        ${sponsor.notes
          ? `<div class="economics-sponsor-note">
               <strong>Note</strong><span>${escapeHtml(sponsor.notes)}</span>
             </div>`
          : ''}
      </div>
    </article>
  `;
}

function renderSponsorSection() {
  if (route() !== 'economics') return;

  const content = document.querySelector('#economics-section-content');
  if (!content) return;

  const year = selectedSeasonStart();
  const rows = sponsorsForYear(year);
  const summary = sponsorSummary(rows);
  const writable = canWriteModule('economics');

  content.innerHTML = `
    <section data-economics-sponsor-root>
      <section class="economics-subhead economics-sponsor-head">
        <div>
          <div class="eyebrow">Sponsor</div>
          <h2>Partnership e contributi</h2>
          <p>Gestisci sponsor, accordi economici e in-kind, contatti, durata e impegni collegati alla stagione.</p>
        </div>
        ${writable
          ? '<button class="button button-primary" id="economics-add-sponsor" type="button">+ Nuovo sponsor</button>'
          : ''}
      </section>

      ${!writable
        ? `<div class="access-info economics-sponsor-readonly">
             Economics è in sola lettura per questo account.
           </div>`
        : ''}

      <div class="economics-sponsor-accounting-note">
        Il cash ricevuto dagli sponsor viene incluso automaticamente nei KPI di sostenibilità dell’Overview.
        Non duplicarlo come entrata nei Pagamenti.
      </div>

      <section class="economics-kpis economics-sponsor-kpis">
        <article class="economics-kpi">
          <span>Sponsor attivi</span><strong>${summary.activeCount}</strong>
        </article>
        <article class="economics-kpi">
          <span>Cash concordato</span><strong>${money(summary.cashCommitted)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Cash ricevuto</span><strong>${money(summary.cashReceived)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Valore in-kind</span><strong>${money(summary.inKindValue)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Valore acquisito</span><strong>${money(summary.totalValue)}</strong>
        </article>
      </section>

      ${rows.length
        ? `<div class="economics-sponsor-grid">
             ${rows.map(row => sponsorCard(row, writable)).join('')}
           </div>`
        : `<article class="panel economics-empty-panel">
             <div class="panel-body">
               <div class="economics-empty">
                 <strong>Nessuno sponsor per ${year}.</strong>
                 <span>Aggiungi prospect, trattative o partnership già attive.</span>
               </div>
             </div>
           </article>`}
    </section>
  `;

  content.querySelector('#economics-add-sponsor')?.addEventListener('click', () => {
    openSponsorDialog();
  });

  content.querySelectorAll('[data-edit-sponsor]').forEach(button => {
    button.addEventListener('click', () => {
      openSponsorDialog(button.dataset.editSponsor);
    });
  });
}

function openSponsorDialog(sponsorId = '') {
  if (!canWriteModule('economics')) return;

  const current = sponsorId
    ? sponsors().find(item => item.id === sponsorId)
    : null;

  const sponsor = current || {
    id: '',
    name: '',
    seasonYear: selectedSeasonStart(),
    status: 'prospect',
    type: 'cash',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    startDate: '',
    endDate: '',
    cashCommitted: '',
    cashReceived: '',
    inKindValue: '',
    benefits: '',
    deliverables: '',
    notes: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog economics-sponsor-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="economics-sponsor-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Sponsor</div>
          <h3>${current ? 'Modifica sponsor' : 'Nuovo sponsor'}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Nome / azienda</label>
          <input name="name" required value="${escapeAttr(sponsor.name)}" />
        </div>

        <div class="field">
          <label>Stagione</label>
          <input name="seasonYear" type="number" min="2000" max="2100"
                 required value="${escapeAttr(sponsor.seasonYear || selectedSeasonStart())}" />
        </div>

        <div class="field">
          <label>Stato</label>
          <select name="status">${statusOptions(sponsor.status)}</select>
        </div>

        <div class="field">
          <label>Tipo accordo</label>
          <select name="type">${typeOptions(sponsor.type)}</select>
        </div>

        <div class="field">
          <label>Sito</label>
          <input name="website" type="url" value="${escapeAttr(sponsor.website)}"
                 placeholder="https://…" />
        </div>

        <div class="field">
          <label>Referente</label>
          <input name="contactName" value="${escapeAttr(sponsor.contactName)}" />
        </div>

        <div class="field">
          <label>Email</label>
          <input name="contactEmail" type="email" value="${escapeAttr(sponsor.contactEmail)}" />
        </div>

        <div class="field">
          <label>Telefono</label>
          <input name="contactPhone" value="${escapeAttr(sponsor.contactPhone)}" />
        </div>

        <div class="field">
          <label>Data inizio</label>
          <input name="startDate" type="date" value="${escapeAttr(sponsor.startDate)}" />
        </div>

        <div class="field">
          <label>Data fine</label>
          <input name="endDate" type="date" value="${escapeAttr(sponsor.endDate)}" />
        </div>

        <div class="field">
          <label>Cash concordato (€)</label>
          <input name="cashCommitted" type="number" min="0" step="0.01"
                 value="${escapeAttr(sponsor.cashCommitted)}" />
        </div>

        <div class="field">
          <label>Cash ricevuto (€)</label>
          <input name="cashReceived" type="number" min="0" step="0.01"
                 value="${escapeAttr(sponsor.cashReceived)}" />
        </div>

        <div class="field">
          <label>Valore in-kind (€)</label>
          <input name="inKindValue" type="number" min="0" step="0.01"
                 value="${escapeAttr(sponsor.inKindValue)}" />
        </div>

        <div class="field full">
          <label>Fornitura / benefit</label>
          <textarea name="benefits"
                    placeholder="Materiale, servizi, viaggi, abbigliamento…">${escapeHtml(sponsor.benefits)}</textarea>
        </div>

        <div class="field full">
          <label>Impegni atleta / visibilità</label>
          <textarea name="deliverables"
                    placeholder="Logo, social, eventi, contenuti, presenza…">${escapeHtml(sponsor.deliverables)}</textarea>
        </div>

        <div class="field full">
          <label>Note</label>
          <textarea name="notes">${escapeHtml(sponsor.notes)}</textarea>
        </div>
      </div>

      <div class="dialog-actions">
        <div>
          ${current
            ? '<button class="button button-danger-ghost" id="economics-delete-sponsor" type="button">Elimina</button>'
            : ''}
        </div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  document.querySelector('#main-content')?.appendChild(dialog);

  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#economics-sponsor-form')?.addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const now = new Date().toISOString();

    const normalized = {
      ...sponsor,
      ...data,
      id: current?.id || makeId('econ-sponsor'),
      seasonYear: Number(data.seasonYear || selectedSeasonStart()),
      cashCommitted: Number(data.cashCommitted || 0),
      cashReceived: Number(data.cashReceived || 0),
      inKindValue: Number(data.inKindValue || 0),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };

    store.update(state => {
      if (!state.economics || typeof state.economics !== 'object') {
        state.economics = {};
      }

      if (!Array.isArray(state.economics.sponsors)) {
        state.economics.sponsors = [];
      }

      const index = state.economics.sponsors.findIndex(
        item => item.id === normalized.id,
      );

      if (index >= 0) state.economics.sponsors[index] = normalized;
      else state.economics.sponsors.push(normalized);
    });

    dialog.close();
    renderSponsorSection();
  });

  dialog.querySelector('#economics-delete-sponsor')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm(
      `Eliminare lo sponsor “${sponsor.name || 'selezionato'}”?`,
      {
        title: 'Elimina sponsor',
        confirmLabel: 'Elimina',
        danger: true,
      },
    );

    if (!confirmed) return;

    store.update(state => {
      if (!Array.isArray(state.economics?.sponsors)) return;
      state.economics.sponsors = state.economics.sponsors.filter(
        item => item.id !== sponsor.id,
      );
    });

    dialog.close();
    renderSponsorSection();
  });

  dialog.addEventListener('close', () => {
    if (dialog.isConnected) dialog.remove();
  });

  dialog.showModal();
}

function applyEconomicsReadOnly() {
  if (route() !== 'economics') return;

  const writable = canWriteModule('economics');
  const main = document.querySelector('#main-content');
  if (!main) return;

  const mutationSelectors = [
    '#economics-add-entry',
    '#economics-add-area',
    '#economics-add-tournament-cost',
    '#economics-add-equipment-cost',
    '#economics-add-payment',
    '#economics-set-budget',
    '[data-edit-area]',
    '[data-add-training-cost]',
    '[data-add-tournament-entry]',
    '[data-edit-entry]',
    '[data-mark-paid]',
    '[data-budget-category]',
    '#economics-add-sponsor',
    '[data-edit-sponsor]',
  ];

  for (const selector of mutationSelectors) {
    main.querySelectorAll(selector).forEach(element => {
      element.hidden = !writable
        || (sponsorModeActive && selector === '#economics-add-entry');
    });
  }

  let banner = main.querySelector('#economics-readonly-banner');

  if (!writable && !banner && !sponsorModeActive) {
    const head = main.querySelector('.economics-module-head');
    if (head) {
      banner = document.createElement('div');
      banner.id = 'economics-readonly-banner';
      banner.className = 'access-info';
      banner.style.marginBottom = '14px';
      banner.textContent =
        'Economics in sola lettura: puoi consultare costi, budget e sponsor ma non modificarli.';
      head.insertAdjacentElement('afterend', banner);
    }
  } else if (writable || sponsorModeActive) {
    banner?.remove();
  }
}

function enhanceOverviewWithSponsors() {
  if (sponsorModeActive || route() !== 'economics') return;

  const main = document.querySelector('#main-content');
  const overviewActive =
    main?.querySelector('[data-economics-section="overview"].active');

  if (!main || !overviewActive) return;

  const year = selectedYear();
  const economics = store.getState().economics || {};

  const entries = (
    Array.isArray(economics.entries) ? economics.entries : []
  ).filter(entry => {
    if (entry.status === 'cancelled') return false;
    const date = entry.paidDate || entry.dueDate || entry.date || '';
    return Number(String(date).slice(0, 4)) === Number(year);
  });

  const expenses = entries.filter(entry => entry.direction !== 'income');
  const income = entries.filter(entry => entry.direction === 'income');

  const paid = expenses
    .filter(entry => entry.status === 'paid')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const ledgerCredits = income
    .filter(entry => entry.status === 'paid')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const sponsorCash = sponsorsForYear(year)
    .reduce((sum, sponsor) => sum + Number(sponsor.cashReceived || 0), 0);

  const totalCredits = ledgerCredits + sponsorCash;

  for (const kpi of main.querySelectorAll('.economics-kpi')) {
    const label = kpi.querySelector('span');
    const value = kpi.querySelector('strong');
    if (!label || !value) continue;

    if (label.textContent.trim().startsWith('Contributi / rimborsi')) {
      const nextLabel = 'Contributi / rimborsi + sponsor';
      const nextValue = money(totalCredits);

      if (label.textContent !== nextLabel) label.textContent = nextLabel;
      if (value.textContent !== nextValue) value.textContent = nextValue;
    } else if (label.textContent.trim() === 'Costo netto pagato') {
      const nextValue = money(paid - totalCredits);
      if (value.textContent !== nextValue) value.textContent = nextValue;
    }
  }
}

function enhanceEconomics() {
  enhancementQueued = false;
  if (route() !== 'economics') return;

  const main = document.querySelector('#main-content');
  const switcher = main?.querySelector('.economics-section-switch');
  if (!main || !switcher) return;

  const pageTitle = document.querySelector('#page-title');
  if (pageTitle && pageTitle.textContent !== '12. Economics') {
    pageTitle.textContent = '12. Economics';
  }

  let sponsorButton = switcher.querySelector('[data-economics-sponsor]');

  if (!sponsorButton) {
    sponsorButton = document.createElement('button');
    sponsorButton.type = 'button';
    sponsorButton.className = 'economics-section-button';
    sponsorButton.dataset.economicsSponsor = 'true';
    sponsorButton.textContent = 'Sponsor';
    switcher.appendChild(sponsorButton);

    sponsorButton.addEventListener('click', () => {
      sponsorModeActive = true;

      switcher.querySelectorAll('.economics-section-button').forEach(button => {
        button.classList.toggle('active', button === sponsorButton);
      });

      const addEntry = main.querySelector('#economics-add-entry');
      if (addEntry) addEntry.hidden = true;

      renderSponsorSection();
      applyEconomicsReadOnly();
    });
  }

  if (sponsorModeActive) {
    switcher.querySelectorAll('.economics-section-button').forEach(button => {
      button.classList.toggle('active', button === sponsorButton);
    });

    const addEntry = main.querySelector('#economics-add-entry');
    if (addEntry) addEntry.hidden = true;

    renderSponsorSection();
  } else {
    enhanceOverviewWithSponsors();
  }

  applyEconomicsReadOnly();
}

function queueEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  queueMicrotask(enhanceEconomics);
}

/*
 * IMPORTANT:
 * Do not use a MutationObserver here.
 *
 * Economics itself re-renders its DOM when switching native tabs/year.
 * Observing those mutations and then touching text/DOM again creates a
 * self-triggering microtask loop. Instead we schedule one enhancement after
 * the user action that causes the native render.
 */
document.addEventListener('click', event => {
  if (route() !== 'economics') return;

  const nativeSectionButton =
    event.target.closest?.('[data-economics-section]');

  if (nativeSectionButton) {
    sponsorModeActive = false;
    queueEnhancement();
  }

  if (!canWriteModule('economics')) {
    const blocked = event.target.closest?.([
      '#economics-add-entry',
      '#economics-add-area',
      '#economics-add-tournament-cost',
      '#economics-add-equipment-cost',
      '#economics-add-payment',
      '#economics-set-budget',
      '[data-edit-area]',
      '[data-add-training-cost]',
      '[data-add-tournament-entry]',
      '[data-edit-entry]',
      '[data-mark-paid]',
      '[data-budget-category]',
      '#economics-add-sponsor',
      '[data-edit-sponsor]',
    ].join(','));

    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}, true);

document.addEventListener('change', event => {
  if (route() !== 'economics') return;

  if (event.target?.matches?.('#economics-year')) {
    queueEnhancement();
  }

  if (event.target?.matches?.('#economics-season')) {
    if (sponsorModeActive) renderSponsorSection();
    queueEnhancement();
  }
}, true);

document.addEventListener('submit', event => {
  if (route() !== 'economics' || canWriteModule('economics')) return;

  const form = event.target;
  if (form?.matches?.('[id^="economics-"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener('hashchange', () => {
  if (route() !== 'economics') {
    sponsorModeActive = false;
    return;
  }

  queueEnhancement();
});

queueEnhancement();
