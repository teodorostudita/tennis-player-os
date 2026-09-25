import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js';
import { canWriteModule } from '../cloud/access.js';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'training', label: 'Formazione' },
  { id: 'tournaments', label: 'Tornei & trasferte' },
  { id: 'equipment', label: 'Attrezzatura' },
  { id: 'payments', label: 'Pagamenti' },
  { id: 'budget', label: 'Budget' },
];

const categoryLabels = {
  training: 'Formazione',
  tournament: 'Tornei',
  travel: 'Trasferte',
  equipment: 'Attrezzatura',
  health: 'Body & Health',
  recovery: 'Recovery',
  nutrition: 'Nutrition',
  other: 'Altro',
};

const equipmentLabels = {
  racket: 'Racchette',
  strings: 'Corde / incordature',
  shoes: 'Scarpe',
  apparel: 'Abbigliamento',
  bag: 'Borse',
  accessories: 'Accessori',
  other: 'Altro',
};

const statusLabels = {
  planned: 'Programmato',
  due: 'Da pagare',
  paid: 'Pagato',
  cancelled: 'Annullato',
};

const pricingLabels = {
  monthly: 'Mensile',
  session: 'Per sessione',
  hourly: 'Orario',
  package: 'Pacchetto',
  annual: 'Annuale',
  other: 'Altro',
};

function currentSeasonStart(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 9 ? date.getFullYear() : date.getFullYear() - 1;
}

const ui = {
  section: 'overview',
  year: new Date().getFullYear(),
  seasonStart: currentSeasonStart(),
};

export function renderEconomics({ main, title, store }) {
  title.textContent = '12. Economics';

  const state = store.getState();
  const economics = normalizeEconomicsState(state.economics);
  const writable = canWriteModule('economics');

  main.innerHTML = `
    <section class="economics-module-head">
      <div>
        <div class="eyebrow">Economics</div>
        <h2>Costi e sostenibilità</h2>
        <p>Accordi economici di stagione, pagamenti effettivi, tornei, attrezzatura, sponsor e budget senza duplicare le informazioni.</p>
      </div>

      <div class="economics-head-actions">
        <label class="economics-year-picker economics-season-picker">
          <span>Stagione</span>
          <select id="economics-season">${seasonOptions(ui.seasonStart)}</select>
        </label>

        <label class="economics-year-picker">
          <span>Movimenti</span>
          <select id="economics-year">${yearOptions(ui.year)}</select>
        </label>

        ${writable
          ? '<button class="button button-primary" id="economics-add-entry" type="button">+ Nuovo movimento</button>'
          : ''}
      </div>
    </section>

    ${!writable ? `
      <div class="access-info economics-readonly-banner">
        Economics è in sola lettura per questo account.
      </div>
    ` : ''}

    <div class="economics-section-switch" role="tablist" aria-label="Sezioni Economics">
      ${sections.map(section => `
        <button
          class="economics-section-button ${ui.section === section.id ? 'active' : ''}"
          data-economics-section="${section.id}"
          type="button"
        >${section.label}</button>
      `).join('')}
    </div>

    <div id="economics-section-content"></div>
  `;

  const content = main.querySelector('#economics-section-content');

  if (ui.section === 'training') {
    renderTrainingCosts(content, state, store);
  } else if (ui.section === 'tournaments') {
    renderTournamentCosts(content, state, store);
  } else if (ui.section === 'equipment') {
    renderEquipmentCosts(content, state, store);
  } else if (ui.section === 'payments') {
    renderPayments(content, state, store);
  } else if (ui.section === 'budget') {
    renderBudget(content, state, store);
  } else {
    renderOverview(content, state);
  }

  main.querySelectorAll('[data-economics-section]').forEach(button => {
    button.addEventListener('click', () => {
      ui.section = button.dataset.economicsSection;
      renderEconomics({ main, title, store });
    });
  });

  main.querySelector('#economics-year')?.addEventListener('change', event => {
    ui.year = Number(event.target.value);
    renderEconomics({ main, title, store });
  });

  main.querySelector('#economics-season')?.addEventListener('change', event => {
    ui.seasonStart = Number(event.target.value);
    renderEconomics({ main, title, store });
  });

  main.querySelector('#economics-add-entry')?.addEventListener('click', () => {
    openEntryDialog({ main, title, store });
  });
}

function renderOverview(container, state) {
  const economics = normalizeEconomicsState(state.economics);
  const annualEntries = entriesForYear(economics.entries, ui.year)
    .filter(entry => entry.status !== 'cancelled');

  const annualExpenses = annualEntries.filter(entry => entry.direction !== 'income');
  const annualIncome = annualEntries.filter(entry => entry.direction === 'income');
  const annualPaid = sum(annualExpenses.filter(entry => entry.status === 'paid'));
  const annualOpen = sum(annualExpenses.filter(entry => entry.status !== 'paid'));
  const annualCredits = sum(annualIncome.filter(entry => entry.status === 'paid'));
  const annualBalance = annualCredits - annualPaid;

  const season = buildSeasonSnapshot(economics, ui.seasonStart);

  const categories = Object.keys(categoryLabels)
    .map(category => ({
      category,
      amount: sum(annualExpenses.filter(entry => entry.category === category)),
    }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const maxCategory = Math.max(...categories.map(row => row.amount), 1);

  const upcoming = [...annualExpenses]
    .filter(entry => entry.status !== 'paid' && entry.status !== 'cancelled')
    .sort((a, b) => dateKey(a.dueDate || a.date).localeCompare(dateKey(b.dueDate || b.date)))
    .slice(0, 7);

  container.innerHTML = `
    <section class="economics-season-overview">
      <div class="economics-season-overview-head">
        <div>
          <div class="eyebrow">Stagione ${seasonLabel(ui.seasonStart)}</div>
          <h2>Impegni della stagione</h2>
          <p>Gli accordi di formazione contano per il valore pattuito; i pagamenti collegati non vengono conteggiati due volte.</p>
        </div>
      </div>

      <section class="economics-kpis economics-season-kpis">
        <article class="economics-kpi">
          <span>Costo / impegni stagione</span>
          <strong>${money(season.committed)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Già pagato</span>
          <strong>${money(season.paid)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Residuo impegnato</span>
          <strong>${money(season.remaining)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Copertura sponsor acquisita</span>
          <strong>${money(season.sponsorCoverage)}</strong>
        </article>
        <article class="economics-kpi">
          <span>Costo netto previsto</span>
          <strong>${money(season.netForecast)}</strong>
        </article>
      </section>

      ${season.committed > 0 ? `
        <div class="economics-season-progress">
          <div class="economics-season-progress-copy">
            <span>Avanzamento pagamenti</span>
            <strong>${Math.round(season.paidPct)}%</strong>
          </div>
          <div class="economics-budget-track">
            <span style="width:${season.paidPct}%"></span>
          </div>
        </div>
      ` : ''}
    </section>

    <section class="economics-overview-grid economics-overview-grid-v2">
      <article class="panel">
        <div class="panel-header">
          <h3>Impegni per la stagione</h3>
          <p>${seasonLabel(ui.seasonStart)} · accordi e altri costi registrati.</p>
        </div>
        <div class="panel-body economics-commitment-list">
          ${season.rows.length
            ? season.rows.map(row => `
                <div class="economics-commitment-row">
                  <div>
                    <strong>${escapeHtml(row.label)}</strong>
                    <span>${escapeHtml(row.detail || '')}</span>
                  </div>
                  <div class="economics-commitment-values">
                    <strong>${money(row.committed)}</strong>
                    <span>${money(row.paid)} pagati</span>
                  </div>
                </div>
              `).join('')
            : emptyInline(
                'Nessun impegno stagionale ancora definito.',
                'Configura gli accordi nella sezione Formazione oppure registra i costi della stagione.',
              )}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <h3>Cash flow ${ui.year}</h3>
          <p>Movimenti effettivi e programmati nell’anno solare.</p>
        </div>
        <div class="panel-body">
          <div class="economics-cashflow-grid">
            <div><span>Uscite pagate</span><strong>${money(annualPaid)}</strong></div>
            <div><span>Da pagare / previste</span><strong>${money(annualOpen)}</strong></div>
            <div><span>Entrate / rimborsi</span><strong>${money(annualCredits)}</strong></div>
            <div><span>Saldo cassa</span><strong>${money(annualBalance)}</strong></div>
          </div>
        </div>
      </article>
    </section>

    <section class="economics-overview-grid">
      <article class="panel">
        <div class="panel-header">
          <h3>Costi per area · ${ui.year}</h3>
          <p>Ripartizione dei movimenti dell’anno selezionato.</p>
        </div>
        <div class="panel-body">
          ${categories.length ? `
            <div class="economics-bars">
              ${categories.map(row => `
                <div class="economics-bar-row">
                  <div class="economics-bar-copy">
                    <span>${categoryLabels[row.category]}</span>
                    <strong>${money(row.amount)}</strong>
                  </div>
                  <div class="economics-bar-track">
                    <span style="width:${Math.max(4, (row.amount / maxCategory) * 100)}%"></span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : emptyInline(
            'Ancora nessun costo registrato.',
            'I movimenti inseriti alimenteranno automaticamente questa ripartizione.',
          )}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <h3>Prossime scadenze · ${ui.year}</h3>
          <p>Pagamenti aperti ordinati per data.</p>
        </div>
        <div class="panel-body economics-deadline-list">
          ${upcoming.length ? upcoming.map(entry => `
            <div class="economics-deadline-row">
              <div>
                <strong>${escapeHtml(entry.description || categoryLabels[entry.category] || 'Movimento')}</strong>
                <span>
                  ${entry.dueDate ? `Scadenza ${formatDate(entry.dueDate)}` : 'Data non indicata'}
                  ${entry.payee ? ` · ${escapeHtml(entry.payee)}` : ''}
                </span>
              </div>
              <strong>${money(entry.amount)}</strong>
            </div>
          `).join('') : emptyInline(
            'Nessuna scadenza aperta.',
            'I pagamenti programmati o da pagare compariranno qui.',
          )}
        </div>
      </article>
    </section>
  `;
}

function renderTrainingCosts(container, state, store) {
  const economics = normalizeEconomicsState(state.economics);
  const areas = economics.trainingAreas;
  const agreements = economics.agreements
    .filter(item => Number(item.seasonStart) === Number(ui.seasonStart));

  const writable = canWriteModule('economics');

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Formazione · ${seasonLabel(ui.seasonStart)}</div>
        <h2>Accordi e costi di formazione</h2>
        <p>La struttura o il professionista è stabile nel tempo; il costo pattuito appartiene invece alla singola stagione.</p>
      </div>

      ${writable ? `
        <div class="economics-inline-actions">
          <button class="button button-ghost" id="economics-add-area" type="button">+ Nuova area</button>
          <button class="button button-primary" id="economics-add-agreement" type="button">+ Accordo stagione</button>
        </div>
      ` : ''}
    </section>

    <div class="economics-area-grid economics-area-grid-v2">
      ${areas.length ? areas.map(area => {
        const agreement = agreements.find(item => item.areaId === area.id);
        return trainingAreaCard({
          area,
          agreement,
          economics,
          writable,
        });
      }).join('') : emptyPanel(
        'Nessuna area di formazione.',
        'Aggiungi circolo, coach, preparatore atletico, fisioterapia o altri servizi.',
      )}
    </div>
  `;

  container.querySelector('#economics-add-area')?.addEventListener('click', () => {
    openAreaDialog({ container, state: store.getState(), store });
  });

  container.querySelector('#economics-add-agreement')?.addEventListener('click', () => {
    openAgreementDialog({ container, store });
  });

  container.querySelectorAll('[data-edit-area]').forEach(button => {
    button.addEventListener('click', () => {
      openAreaDialog({
        container,
        state: store.getState(),
        store,
        areaId: button.dataset.editArea,
      });
    });
  });

  container.querySelectorAll('[data-add-agreement]').forEach(button => {
    button.addEventListener('click', () => {
      openAgreementDialog({
        container,
        store,
        presetAreaId: button.dataset.addAgreement,
      });
    });
  });

  container.querySelectorAll('[data-edit-agreement]').forEach(button => {
    button.addEventListener('click', () => {
      openAgreementDialog({
        container,
        store,
        agreementId: button.dataset.editAgreement,
      });
    });
  });

  container.querySelectorAll('[data-pay-agreement]').forEach(button => {
    button.addEventListener('click', () => {
      openEntryDialogFromContainer({
        container,
        state: store.getState(),
        store,
        preset: {
          agreementId: button.dataset.payAgreement,
        },
      });
    });
  });

  container.querySelectorAll('[data-add-training-cost]').forEach(button => {
    button.addEventListener('click', () => {
      openEntryDialogFromContainer({
        container,
        state: store.getState(),
        store,
        preset: {
          category: 'training',
          areaId: button.dataset.addTrainingCost,
        },
      });
    });
  });
}

function trainingAreaCard({ area, agreement, economics, writable }) {
  if (!agreement) {
    return `
      <article class="panel economics-area-card economics-area-card-v2">
        <div class="panel-body">
          <div class="economics-card-topline">
            <div>
              <div class="eyebrow">${escapeHtml(areaTypeLabel(area.category))}</div>
              <h3>${escapeHtml(area.name)}</h3>
            </div>
            ${writable
              ? `<button class="icon-button" data-edit-area="${area.id}" type="button" aria-label="Modifica area">✎</button>`
              : ''}
          </div>

          <div class="economics-agreement-empty">
            <strong>Nessun accordo per ${seasonLabel(ui.seasonStart)}</strong>
            <span>Definisci il costo complessivo della stagione per separarlo dai singoli pagamenti.</span>
          </div>

          ${area.referenceAmount ? `
            <p class="economics-reference">
              Vecchio riferimento area: ${money(area.referenceAmount)}
              · ${escapeHtml(pricingLabels[area.pricingModel] || '')}
            </p>
          ` : ''}

          ${area.notes ? `<p class="economics-card-note">${escapeHtml(area.notes)}</p>` : ''}

          ${writable ? `
            <div class="economics-card-actions">
              <button class="button button-primary" data-add-agreement="${area.id}" type="button">Imposta accordo</button>
              <button class="button button-ghost" data-add-training-cost="${area.id}" type="button">Movimento libero</button>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }

  const linked = economics.entries
    .filter(entry => entry.agreementId === agreement.id && entry.status !== 'cancelled');

  const paidRows = linked.filter(entry => entry.status === 'paid' && entry.direction !== 'income');
  const paid = sum(paidRows);
  const agreed = Number(agreement.agreedAmount || 0);
  const remaining = Math.max(0, agreed - paid);
  const pct = agreed > 0 ? Math.min(100, (paid / agreed) * 100) : 0;
  const next = [...linked]
    .filter(entry => entry.status !== 'paid' && entry.status !== 'cancelled')
    .sort((a, b) => dateKey(a.dueDate || a.date).localeCompare(dateKey(b.dueDate || b.date)))[0];

  const installmentText = agreementInstallmentText(agreement);
  const installmentProgress = Number(agreement.installmentCount || 0) > 0
    ? `${paidRows.length}/${Number(agreement.installmentCount)} pagamenti registrati`
    : '';

  return `
    <article class="panel economics-area-card economics-area-card-v2">
      <div class="panel-body">
        <div class="economics-card-topline">
          <div>
            <div class="eyebrow">${escapeHtml(areaTypeLabel(area.category))} · ${seasonLabel(agreement.seasonStart)}</div>
            <h3>${escapeHtml(area.name)}</h3>
          </div>
          ${writable
            ? `<button class="icon-button" data-edit-area="${area.id}" type="button" aria-label="Modifica area">✎</button>`
            : ''}
        </div>

        <div class="economics-agreement-total">
          <span>Costo pattuito</span>
          <strong>${money(agreed)}</strong>
          <small>${escapeHtml(installmentText)}</small>
        </div>

        <div class="economics-area-figures">
          <div><span>Pagato</span><strong>${money(paid)}</strong></div>
          <div><span>Residuo</span><strong>${money(remaining)}</strong></div>
          <div>
            <span>Avanzamento</span>
            <strong>${Math.round(pct)}%</strong>
          </div>
        </div>

        <div class="economics-budget-track economics-agreement-progress">
          <span style="width:${pct}%"></span>
        </div>

        <div class="economics-agreement-meta">
          ${installmentProgress ? `<span>${escapeHtml(installmentProgress)}</span>` : ''}
          ${next?.dueDate
            ? `<span>Prossima scadenza: <strong>${formatDate(next.dueDate)}</strong> · ${money(next.amount)}</span>`
            : '<span>Nessuna prossima scadenza registrata.</span>'}
        </div>

        ${agreement.notes ? `<p class="economics-card-note">${escapeHtml(agreement.notes)}</p>` : ''}

        ${writable ? `
          <div class="economics-card-actions">
            <button class="button button-primary" data-pay-agreement="${agreement.id}" type="button">Registra pagamento</button>
            <button class="button button-ghost" data-edit-agreement="${agreement.id}" type="button">Dettagli accordo</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function renderTournamentCosts(container, state, store) {
  const economics = normalizeEconomicsState(state.economics);
  const tournaments = state.planner?.tournaments || [];
  const entries = entriesForYear(economics.entries, ui.year)
    .filter(entry => ['tournament', 'travel'].includes(entry.category) && entry.status !== 'cancelled');

  const yearTournaments = tournaments.filter(t => tournamentYear(t) === ui.year);
  const linkedIds = new Set(yearTournaments.map(t => t.id));
  const unlinked = entries.filter(entry => !entry.tournamentId || !linkedIds.has(entry.tournamentId));
  const writable = canWriteModule('economics');

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Tornei & trasferte · ${ui.year}</div>
        <h2>Costo per torneo</h2>
        <p>I tornei arrivano dal Calendar; qui registriamo iscrizione, viaggio, alloggio, vitto, trasporti locali, coach e altre spese.</p>
      </div>
      ${writable
        ? '<button class="button button-primary" id="economics-add-tournament-cost" type="button">+ Costo torneo / trasferta</button>'
        : ''}
    </section>

    <div class="economics-tournament-list">
      ${yearTournaments.length ? yearTournaments
        .sort((a, b) => dateKey(a.startDate).localeCompare(dateKey(b.startDate)))
        .map(tournament => {
          const rows = entries.filter(entry => entry.tournamentId === tournament.id);
          const total = sum(rows);
          const paid = sum(rows.filter(entry => entry.status === 'paid'));

          return `
            <article class="panel economics-tournament-card">
              <div class="panel-body">
                <div class="economics-tournament-main">
                  <div>
                    <div class="eyebrow">${escapeHtml(tournament.circuit || tournament.type || 'Torneo')}</div>
                    <h3>${escapeHtml(tournament.name || 'Torneo')}</h3>
                    <p>
                      ${escapeHtml(tournament.location || '')}
                      ${tournament.startDate ? ` · ${formatDate(tournament.startDate)}` : ''}
                      ${tournament.endDate && tournament.endDate !== tournament.startDate
                        ? `–${formatDate(tournament.endDate)}`
                        : ''}
                    </p>
                  </div>
                  <div class="economics-tournament-total">
                    <span>Totale</span>
                    <strong>${money(total)}</strong>
                    <small>${money(paid)} pagati</small>
                  </div>
                </div>

                <div class="economics-cost-chips">${costChips(rows)}</div>

                ${writable
                  ? `<button class="button button-ghost" data-add-tournament-entry="${tournament.id}" type="button">Aggiungi costo</button>`
                  : ''}
              </div>
            </article>
          `;
        }).join('')
        : emptyPanel(
            'Nessun torneo programmato per questo anno.',
            'Aggiungi i tornei nel Calendar: compariranno automaticamente qui.',
          )}
    </div>

    ${unlinked.length ? `
      <section class="panel economics-unlinked-panel">
        <div class="panel-header">
          <h3>Costi non collegati a un torneo</h3>
          <p>Spese di torneo o trasferta inserite senza collegamento al Calendar.</p>
        </div>
        <div class="panel-body economics-simple-list">
          ${unlinked.map(entry => simpleEntryRow(entry)).join('')}
        </div>
      </section>
    ` : ''}
  `;

  container.querySelector('#economics-add-tournament-cost')?.addEventListener('click', () => {
    openEntryDialogFromContainer({
      container,
      state: store.getState(),
      store,
      preset: { category: 'tournament' },
    });
  });

  container.querySelectorAll('[data-add-tournament-entry]').forEach(button => {
    button.addEventListener('click', () => {
      openEntryDialogFromContainer({
        container,
        state: store.getState(),
        store,
        preset: {
          category: 'tournament',
          tournamentId: button.dataset.addTournamentEntry,
        },
      });
    });
  });
}

function renderEquipmentCosts(container, state, store) {
  const economics = normalizeEconomicsState(state.economics);
  const entries = entriesForYear(economics.entries, ui.year)
    .filter(entry => entry.category === 'equipment' && entry.status !== 'cancelled');

  const groups = Object.keys(equipmentLabels)
    .map(key => ({
      key,
      amount: sum(entries.filter(entry => (entry.equipmentType || 'other') === key)),
    }))
    .filter(group => group.amount > 0);

  const recent = [...entries]
    .sort((a, b) =>
      dateKey(b.paidDate || b.dueDate || b.date)
        .localeCompare(dateKey(a.paidDate || a.dueDate || a.date)))
    .slice(0, 12);

  const writable = canWriteModule('economics');

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Attrezzatura · ${ui.year}</div>
        <h2>Costi di materiali e setup</h2>
        <p>Racchette, corde, incordature, scarpe, abbigliamento e accessori. Il dettaglio tecnico resta nel modulo Equipment.</p>
      </div>
      ${writable
        ? '<button class="button button-primary" id="economics-add-equipment-cost" type="button">+ Acquisto / costo</button>'
        : ''}
    </section>

    <section class="economics-equipment-summary">
      ${groups.length ? groups.map(group => `
        <article class="economics-equipment-stat">
          <span>${equipmentLabels[group.key]}</span>
          <strong>${money(group.amount)}</strong>
        </article>
      `).join('') : `
        <article class="economics-equipment-stat empty">
          <span>Nessun costo registrato</span><strong>—</strong>
        </article>
      `}
    </section>

    <section class="panel">
      <div class="panel-header"><h3>Movimenti attrezzatura</h3><p>${ui.year}</p></div>
      <div class="panel-body economics-simple-list">
        ${recent.length
          ? recent.map(entry => simpleEntryRow(entry, true)).join('')
          : emptyInline(
              'Nessun acquisto registrato.',
              'Registra i costi e, quando utile, specifica la categoria di materiale.',
            )}
      </div>
    </section>
  `;

  container.querySelector('#economics-add-equipment-cost')?.addEventListener('click', () => {
    openEntryDialogFromContainer({
      container,
      state: store.getState(),
      store,
      preset: { category: 'equipment' },
    });
  });
}

function renderPayments(container, state, store) {
  const economics = normalizeEconomicsState(state.economics);
  const entries = entriesForYear(economics.entries, ui.year)
    .sort((a, b) =>
      dateKey(b.paidDate || b.dueDate || b.date)
        .localeCompare(dateKey(a.paidDate || a.dueDate || a.date)));

  const writable = canWriteModule('economics');

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Diario · ${ui.year}</div>
        <h2>Pagamenti effettuati e da fare</h2>
        <p>Ogni movimento può essere libero oppure collegato a un accordo economico di formazione.</p>
      </div>
      ${writable
        ? '<button class="button button-primary" id="economics-add-payment" type="button">+ Nuovo movimento</button>'
        : ''}
    </section>

    <div class="economics-payment-link-note">
      <strong>Accordo ↔ pagamento.</strong>
      Selezionando un accordo nel movimento, il pagamento aggiorna automaticamente pagato, residuo e avanzamento della relativa stagione.
    </div>

    <section class="panel economics-ledger-panel">
      <div class="economics-ledger-wrap">
        <table class="economics-ledger">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrizione</th>
              <th>Area / accordo</th>
              <th>Importo</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${entries.length ? entries.map(entry => {
              const agreement = economics.agreements.find(item => item.id === entry.agreementId);
              const area = agreement
                ? economics.trainingAreas.find(item => item.id === agreement.areaId)
                : null;

              return `
                <tr>
                  <td>${formatDate(entry.paidDate || entry.dueDate || entry.date)}</td>
                  <td>
                    <strong>${escapeHtml(entry.description || 'Movimento')}</strong>
                    ${entry.payee ? `<small>${escapeHtml(entry.payee)}</small>` : ''}
                  </td>
                  <td>
                    ${escapeHtml(categoryLabels[entry.category] || entry.category || 'Altro')}
                    ${agreement ? `
                      <small class="economics-agreement-link">
                        ↳ ${escapeHtml(area?.name || 'Accordo')} · ${seasonLabel(agreement.seasonStart)}
                      </small>
                    ` : ''}
                  </td>
                  <td class="economics-amount ${entry.direction === 'income' ? 'income' : ''}">
                    ${entry.direction === 'income' ? '+' : '−'}${money(entry.amount)}
                  </td>
                  <td>
                    <span class="economics-status status-${entry.status || 'planned'}">
                      ${statusLabels[entry.status] || 'Programmato'}
                    </span>
                  </td>
                  <td class="economics-row-actions">
                    ${writable && entry.direction !== 'income' && entry.status !== 'paid' && entry.status !== 'cancelled'
                      ? `<button class="button button-ghost economics-small-button" data-mark-paid="${entry.id}" type="button">Pagato</button>`
                      : ''}
                    ${writable
                      ? `<button class="icon-button" data-edit-entry="${entry.id}" type="button" aria-label="Modifica movimento">✎</button>`
                      : ''}
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="6">
                  ${emptyInline(
                    'Nessun movimento nell’anno selezionato.',
                    'Inserisci il primo pagamento o costo programmato.',
                  )}
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#economics-add-payment')?.addEventListener('click', () => {
    openEntryDialogFromContainer({
      container,
      state: store.getState(),
      store,
    });
  });

  container.querySelectorAll('[data-edit-entry]').forEach(button => {
    button.addEventListener('click', () => {
      openEntryDialogFromContainer({
        container,
        state: store.getState(),
        store,
        entryId: button.dataset.editEntry,
      });
    });
  });

  container.querySelectorAll('[data-mark-paid]').forEach(button => {
    button.addEventListener('click', () => {
      store.update(next => {
        const entry = next.economics.entries.find(
          item => item.id === button.dataset.markPaid,
        );
        if (!entry) return;
        entry.status = 'paid';
        entry.paidDate = todayKey();
      });
      rerenderEconomics(container, store);
    });
  });
}

function renderBudget(container, state, store) {
  const economics = normalizeEconomicsState(state.economics);
  const entries = entriesForYear(economics.entries, ui.year)
    .filter(entry => entry.direction !== 'income' && entry.status !== 'cancelled');

  const budgets = economics.budgets
    .filter(budget => Number(budget.year) === ui.year);

  const rows = Object.keys(categoryLabels).map(category => {
    const budget = budgets.find(item => item.category === category);
    const spent = sum(entries.filter(entry => entry.category === category));

    return {
      category,
      budget: Number(budget?.amount || 0),
      spent,
    };
  });

  const totalBudget = rows.reduce((acc, row) => acc + row.budget, 0);
  const totalCommitted = rows.reduce((acc, row) => acc + row.spent, 0);
  const writable = canWriteModule('economics');

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Budget & forecast · ${ui.year}</div>
        <h2>Budget annuale</h2>
        <p>Il budget resta una vista annuale; gli accordi di formazione hanno invece una propria stagione.</p>
      </div>
      ${writable
        ? '<button class="button button-ghost" id="economics-set-budget" type="button">Imposta budget</button>'
        : ''}
    </section>

    <section class="economics-kpis economics-budget-kpis">
      <article class="economics-kpi">
        <span>Budget ${ui.year}</span><strong>${money(totalBudget)}</strong>
      </article>
      <article class="economics-kpi">
        <span>Impegnato</span><strong>${money(totalCommitted)}</strong>
      </article>
      <article class="economics-kpi">
        <span>Residuo</span><strong>${money(totalBudget - totalCommitted)}</strong>
      </article>
    </section>

    <section class="panel">
      <div class="panel-body economics-budget-list">
        ${rows.map(row => {
          const pct = row.budget > 0
            ? Math.min(100, (row.spent / row.budget) * 100)
            : 0;

          return `
            <div class="economics-budget-row">
              <div class="economics-budget-copy">
                <strong>${categoryLabels[row.category]}</strong>
                <span>${money(row.spent)} / ${row.budget ? money(row.budget) : 'budget non impostato'}</span>
              </div>

              <div class="economics-budget-track">
                <span style="width:${pct}%"></span>
              </div>

              ${writable
                ? `<button class="button button-ghost economics-small-button" data-budget-category="${row.category}" type="button">Modifica</button>`
                : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  container.querySelector('#economics-set-budget')?.addEventListener('click', () => {
    openBudgetDialog({
      container,
      state: store.getState(),
      store,
    });
  });

  container.querySelectorAll('[data-budget-category]').forEach(button => {
    button.addEventListener('click', () => {
      openBudgetDialog({
        container,
        state: store.getState(),
        store,
        category: button.dataset.budgetCategory,
      });
    });
  });
}

function openEntryDialog({
  main,
  title,
  store,
  preset = {},
  entryId = '',
}) {
  const state = store.getState();
  const host = main || document.querySelector('#main-content');

  createEntryDialog(
    host,
    state,
    store,
    preset,
    entryId,
    () => renderEconomics({
      main: host,
      title: title || document.querySelector('#page-title'),
      store,
    }),
  );
}

function openEntryDialogFromContainer({
  container,
  state,
  store,
  preset = {},
  entryId = '',
}) {
  const main = document.querySelector('#main-content');
  const title = document.querySelector('#page-title');

  createEntryDialog(
    main,
    state,
    store,
    preset,
    entryId,
    () => renderEconomics({ main, title, store }),
  );
}

function createEntryDialog(host, state, store, preset, entryId, onSave) {
  if (!canWriteModule('economics')) return;

  const economics = normalizeEconomicsState(state.economics);

  const existing = entryId
    ? economics.entries.find(entry => entry.id === entryId)
    : null;

  let entry = existing || {
    direction: 'expense',
    category: preset.category || 'training',
    areaId: preset.areaId || '',
    agreementId: preset.agreementId || '',
    tournamentId: preset.tournamentId || '',
    equipmentType: 'other',
    description: '',
    payee: '',
    amount: '',
    date: todayKey(),
    dueDate: '',
    paidDate: '',
    status: 'paid',
    method: '',
    notes: '',
  };

  if (!existing && entry.agreementId) {
    entry = hydrateEntryFromAgreement(entry, entry.agreementId, economics);
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="economics-entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Economics</div>
          <h3>${existing ? 'Modifica movimento' : 'Nuovo movimento'}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full economics-agreement-picker-field">
          <label>Collega a un accordo economico</label>
          <select name="agreementId" id="economics-entry-agreement">
            <option value="">— Movimento libero —</option>
            ${agreementOptions(economics, entry.agreementId)}
          </select>
          <small class="economics-field-help">
            Il collegamento aggiorna automaticamente pagato e residuo dell’accordo di formazione.
          </small>
        </div>

        <div class="field">
          <label>Tipo</label>
          <select name="direction">
            <option value="expense" ${entry.direction !== 'income' ? 'selected' : ''}>Uscita</option>
            <option value="income" ${entry.direction === 'income' ? 'selected' : ''}>Entrata / rimborso</option>
          </select>
        </div>

        <div class="field">
          <label>Categoria</label>
          <select name="category">${categoryOptions(entry.category)}</select>
        </div>

        <div class="field full">
          <label>Descrizione</label>
          <input
            name="description"
            required
            value="${escapeAttr(entry.description)}"
            placeholder="es. Rata MD Vita ottobre"
          />
        </div>

        <div class="field">
          <label>Importo (€)</label>
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            value="${escapeAttr(entry.amount)}"
          />
        </div>

        <div class="field">
          <label>Beneficiario / fonte</label>
          <input
            name="payee"
            value="${escapeAttr(entry.payee)}"
            placeholder="es. MD Vita"
          />
        </div>

        <div class="field">
          <label>Data movimento</label>
          <input name="date" type="date" value="${escapeAttr(entry.date || todayKey())}" />
        </div>

        <div class="field">
          <label>Stato</label>
          <select name="status">${statusOptions(entry.status)}</select>
        </div>

        <div class="field">
          <label>Scadenza</label>
          <input name="dueDate" type="date" value="${escapeAttr(entry.dueDate)}" />
        </div>

        <div class="field">
          <label>Data pagamento</label>
          <input name="paidDate" type="date" value="${escapeAttr(entry.paidDate)}" />
        </div>

        <div class="field">
          <label>Area formazione</label>
          <select name="areaId">
            <option value="">—</option>
            ${economics.trainingAreas.map(area => `
              <option value="${area.id}" ${entry.areaId === area.id ? 'selected' : ''}>
                ${escapeHtml(area.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>Torneo collegato</label>
          <select name="tournamentId">
            <option value="">—</option>
            ${(state.planner?.tournaments || []).map(t => `
              <option value="${t.id}" ${entry.tournamentId === t.id ? 'selected' : ''}>
                ${escapeHtml(t.name || 'Torneo')}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>Tipo attrezzatura</label>
          <select name="equipmentType">${equipmentOptions(entry.equipmentType)}</select>
        </div>

        <div class="field">
          <label>Metodo pagamento</label>
          <input
            name="method"
            value="${escapeAttr(entry.method)}"
            placeholder="Carta, bonifico, contanti…"
          />
        </div>

        <div class="field full">
          <label>Note</label>
          <textarea name="notes">${escapeHtml(entry.notes)}</textarea>
        </div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger-ghost" id="economics-delete-entry" type="button">Elimina</button>'
            : ''}
        </div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#economics-entry-form');
  const agreementSelect = form.querySelector('[name="agreementId"]');

  agreementSelect?.addEventListener('change', () => {
    if (!agreementSelect.value) return;

    const current = Object.fromEntries(new FormData(form).entries());
    const next = hydrateEntryFromAgreement(current, agreementSelect.value, economics);

    form.elements.category.value = next.category;
    form.elements.areaId.value = next.areaId;
    form.elements.direction.value = 'expense';

    if (!form.elements.description.value.trim()) {
      form.elements.description.value = next.description;
    }

    if (!form.elements.payee.value.trim()) {
      form.elements.payee.value = next.payee;
    }

    if (!Number(form.elements.amount.value || 0) && Number(next.amount || 0)) {
      form.elements.amount.value = next.amount;
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form).entries());

    const normalized = {
      ...data,
      amount: Number(data.amount || 0),
      id: existing?.id || makeId('econ-entry'),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (normalized.status === 'paid' && !normalized.paidDate) {
      normalized.paidDate = normalized.date || todayKey();
    }

    store.update(next => {
      ensureEconomicsCollections(next.economics);

      const index = next.economics.entries
        .findIndex(item => item.id === normalized.id);

      if (index >= 0) next.economics.entries[index] = normalized;
      else next.economics.entries.push(normalized);
    });

    dialog.close();
    dialog.remove();
    onSave();
  });

  dialog.querySelector('#economics-delete-entry')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm(
      'Eliminare questo movimento?',
      {
        title: 'Elimina movimento',
        confirmLabel: 'Elimina',
        danger: true,
      },
    );

    if (!confirmed) return;

    store.update(next => {
      ensureEconomicsCollections(next.economics);
      next.economics.entries = next.economics.entries
        .filter(item => item.id !== existing.id);
    });

    dialog.close();
    dialog.remove();
    onSave();
  });

  dialog.addEventListener('close', () => {
    if (dialog.isConnected) dialog.remove();
  });

  dialog.showModal();
}

function hydrateEntryFromAgreement(entry, agreementId, economics) {
  const agreement = economics.agreements.find(item => item.id === agreementId);
  if (!agreement) return { ...entry, agreementId };

  const area = economics.trainingAreas
    .find(item => item.id === agreement.areaId);

  const amount = Number(agreement.installmentAmount || 0);

  return {
    ...entry,
    agreementId,
    direction: 'expense',
    category: 'training',
    areaId: agreement.areaId || '',
    payee: entry.payee || area?.name || '',
    description: entry.description
      || `Rata ${area?.name || 'formazione'} · ${seasonLabel(agreement.seasonStart)}`,
    amount: Number(entry.amount || 0) || amount || '',
  };
}

function openAreaDialog({
  container,
  state,
  store,
  areaId = '',
}) {
  if (!canWriteModule('economics')) return;

  const economics = normalizeEconomicsState(state.economics);

  const existing = areaId
    ? economics.trainingAreas.find(area => area.id === areaId)
    : null;

  const area = existing || {
    name: '',
    category: 'tennis',
    pricingModel: 'monthly',
    referenceAmount: '',
    active: true,
    notes: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="economics-area-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Formazione</div>
          <h3>${existing ? 'Modifica area' : 'Nuova area'}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Nome</label>
          <input
            name="name"
            required
            value="${escapeAttr(area.name)}"
            placeholder="es. MD Vita"
          />
        </div>

        <div class="field">
          <label>Tipo</label>
          <select name="category">
            <option value="tennis" ${area.category === 'tennis' ? 'selected' : ''}>Tennis</option>
            <option value="physical" ${area.category === 'physical' ? 'selected' : ''}>Preparazione atletica</option>
            <option value="mental" ${area.category === 'mental' ? 'selected' : ''}>Mental</option>
            <option value="medical" ${area.category === 'medical' ? 'selected' : ''}>Fisio / prevenzione</option>
            <option value="other" ${area.category === 'other' ? 'selected' : ''}>Altro</option>
          </select>
        </div>

        <div class="field">
          <label>Modalità abituale</label>
          <select name="pricingModel">${pricingOptions(area.pricingModel)}</select>
        </div>

        <div class="field">
          <label>Riferimento storico (€)</label>
          <input
            name="referenceAmount"
            type="number"
            min="0"
            step="0.01"
            value="${escapeAttr(area.referenceAmount)}"
          />
        </div>

        <div class="field">
          <label>Attiva</label>
          <select name="active">
            <option value="true" ${area.active !== false ? 'selected' : ''}>Sì</option>
            <option value="false" ${area.active === false ? 'selected' : ''}>No</option>
          </select>
        </div>

        <div class="field full">
          <label>Note</label>
          <textarea name="notes">${escapeHtml(area.notes)}</textarea>
        </div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger-ghost" id="economics-delete-area" type="button">Elimina</button>'
            : ''}
        </div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  document.querySelector('#main-content').appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#economics-area-form');

  form.addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form).entries());

    const normalized = {
      ...data,
      id: existing?.id || makeId('econ-area'),
      active: data.active === 'true',
      referenceAmount: data.referenceAmount
        ? Number(data.referenceAmount)
        : '',
    };

    store.update(next => {
      ensureEconomicsCollections(next.economics);

      const index = next.economics.trainingAreas
        .findIndex(item => item.id === normalized.id);

      if (index >= 0) next.economics.trainingAreas[index] = normalized;
      else next.economics.trainingAreas.push(normalized);
    });

    dialog.close();
    dialog.remove();
    rerenderEconomics(container, store);
  });

  dialog.querySelector('#economics-delete-area')?.addEventListener('click', async () => {
    const current = normalizeEconomicsState(store.getState().economics);

    const usedByEntries = current.entries
      .some(entry => entry.areaId === existing.id);

    const usedByAgreements = current.agreements
      .some(agreement => agreement.areaId === existing.id);

    if (usedByEntries || usedByAgreements) {
      await showInAppAlert(
        'Questa area è già collegata a movimenti o accordi e non può essere eliminata. Puoi marcarla come non attiva.',
        { title: 'Area in uso' },
      );
      return;
    }

    const confirmed = await showInAppConfirm(
      'Eliminare questa area?',
      {
        title: 'Elimina area',
        confirmLabel: 'Elimina',
        danger: true,
      },
    );

    if (!confirmed) return;

    store.update(next => {
      ensureEconomicsCollections(next.economics);
      next.economics.trainingAreas = next.economics.trainingAreas
        .filter(item => item.id !== existing.id);
    });

    dialog.close();
    dialog.remove();
    rerenderEconomics(container, store);
  });

  dialog.addEventListener('close', () => {
    if (dialog.isConnected) dialog.remove();
  });

  dialog.showModal();
}

function openAgreementDialog({
  container,
  store,
  agreementId = '',
  presetAreaId = '',
}) {
  if (!canWriteModule('economics')) return;

  const economics = normalizeEconomicsState(store.getState().economics);

  if (!economics.trainingAreas.length) {
    void showInAppAlert(
      'Prima crea almeno un’area di formazione.',
      { title: 'Nessuna area disponibile' },
    );
    return;
  }

  const existing = agreementId
    ? economics.agreements.find(item => item.id === agreementId)
    : null;

  const presetArea = economics.trainingAreas.find(item => item.id === presetAreaId);

  const agreement = existing || {
    areaId: presetAreaId || '',
    seasonStart: ui.seasonStart,
    agreedAmount: '',
    pricingModel: presetArea?.pricingModel || 'monthly',
    installmentAmount: '',
    installmentCount: '',
    startDate: '',
    endDate: '',
    notes: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog economics-agreement-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="economics-agreement-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Accordo economico</div>
          <h3>${existing ? 'Modifica accordo stagione' : 'Nuovo accordo stagione'}</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field full">
          <label>Area / struttura / professionista</label>
          <select name="areaId" required>
            <option value="">— Seleziona —</option>
            ${economics.trainingAreas.map(area => `
              <option value="${area.id}" ${agreement.areaId === area.id ? 'selected' : ''}>
                ${escapeHtml(area.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>Stagione</label>
          <select name="seasonStart">${seasonOptions(Number(agreement.seasonStart || ui.seasonStart))}</select>
        </div>

        <div class="field">
          <label>Costo pattuito stagione (€)</label>
          <input
            name="agreedAmount"
            type="number"
            min="0"
            step="0.01"
            required
            value="${escapeAttr(agreement.agreedAmount)}"
          />
        </div>

        <div class="field">
          <label>Modalità pagamento</label>
          <select name="pricingModel">${pricingOptions(agreement.pricingModel)}</select>
        </div>

        <div class="field">
          <label>Numero rate / pagamenti previsti</label>
          <input
            name="installmentCount"
            type="number"
            min="0"
            step="1"
            value="${escapeAttr(agreement.installmentCount)}"
          />
        </div>

        <div class="field">
          <label>Importo rata indicativa (€)</label>
          <input
            name="installmentAmount"
            type="number"
            min="0"
            step="0.01"
            value="${escapeAttr(agreement.installmentAmount)}"
          />
        </div>

        <div class="field">
          <label>Inizio accordo</label>
          <input name="startDate" type="date" value="${escapeAttr(agreement.startDate)}" />
        </div>

        <div class="field">
          <label>Fine accordo</label>
          <input name="endDate" type="date" value="${escapeAttr(agreement.endDate)}" />
        </div>

        <div class="field full">
          <label>Note</label>
          <textarea name="notes" placeholder="Condizioni, inclusioni, eccezioni…">${escapeHtml(agreement.notes)}</textarea>
        </div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger-ghost" id="economics-delete-agreement" type="button">Elimina accordo</button>'
            : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  document.querySelector('#main-content').appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#economics-agreement-form');

  const recalcInstallment = () => {
    const amount = Number(form.elements.agreedAmount.value || 0);
    const count = Number(form.elements.installmentCount.value || 0);
    const installment = Number(form.elements.installmentAmount.value || 0);

    if (amount > 0 && count > 0 && !installment) {
      form.elements.installmentAmount.value =
        (amount / count).toFixed(2);
    }
  };

  form.elements.installmentCount.addEventListener('change', recalcInstallment);

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form).entries());

    const duplicate = normalizeEconomicsState(store.getState().economics)
      .agreements
      .find(item =>
        item.id !== existing?.id
        && item.areaId === data.areaId
        && Number(item.seasonStart) === Number(data.seasonStart));

    if (duplicate) {
      await showInAppAlert(
        'Per questa area esiste già un accordo nella stagione selezionata. Modifica quello esistente.',
        { title: 'Accordo già presente' },
      );
      return;
    }

    const agreedAmount = Number(data.agreedAmount || 0);
    const installmentCount = Number(data.installmentCount || 0);
    let installmentAmount = Number(data.installmentAmount || 0);

    if (!installmentAmount && agreedAmount > 0 && installmentCount > 0) {
      installmentAmount = agreedAmount / installmentCount;
    }

    const normalized = {
      ...data,
      id: existing?.id || makeId('econ-agreement'),
      seasonStart: Number(data.seasonStart || ui.seasonStart),
      agreedAmount,
      installmentCount,
      installmentAmount,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.update(next => {
      ensureEconomicsCollections(next.economics);

      const index = next.economics.agreements
        .findIndex(item => item.id === normalized.id);

      if (index >= 0) next.economics.agreements[index] = normalized;
      else next.economics.agreements.push(normalized);
    });

    ui.seasonStart = normalized.seasonStart;
    dialog.close();
    dialog.remove();
    rerenderEconomics(container, store);
  });

  dialog.querySelector('#economics-delete-agreement')?.addEventListener('click', async () => {
    const current = normalizeEconomicsState(store.getState().economics);
    const linked = current.entries.some(entry => entry.agreementId === existing.id);

    if (linked) {
      await showInAppAlert(
        'Questo accordo ha già movimenti collegati. Prima scollega o elimina i movimenti associati.',
        { title: 'Accordo in uso' },
      );
      return;
    }

    const confirmed = await showInAppConfirm(
      'Eliminare questo accordo stagionale?',
      {
        title: 'Elimina accordo',
        confirmLabel: 'Elimina',
        danger: true,
      },
    );

    if (!confirmed) return;

    store.update(next => {
      ensureEconomicsCollections(next.economics);
      next.economics.agreements = next.economics.agreements
        .filter(item => item.id !== existing.id);
    });

    dialog.close();
    dialog.remove();
    rerenderEconomics(container, store);
  });

  dialog.addEventListener('close', () => {
    if (dialog.isConnected) dialog.remove();
  });

  dialog.showModal();
}

function openBudgetDialog({
  container,
  state,
  store,
  category = 'training',
}) {
  if (!canWriteModule('economics')) return;

  const economics = normalizeEconomicsState(state.economics);

  const existing = economics.budgets
    .find(item =>
      Number(item.year) === ui.year
      && item.category === category);

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="economics-budget-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Budget ${ui.year}</div>
          <h3>Imposta budget</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field">
          <label>Categoria</label>
          <select name="category">${categoryOptions(category)}</select>
        </div>

        <div class="field">
          <label>Budget annuale (€)</label>
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            value="${escapeAttr(existing?.amount || '')}"
          />
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  document.querySelector('#main-content').appendChild(dialog);
  bindDialogClose(dialog);

  dialog.querySelector('#economics-budget-form')
    .addEventListener('submit', event => {
      event.preventDefault();

      const data = Object.fromEntries(
        new FormData(event.currentTarget).entries(),
      );

      store.update(next => {
        ensureEconomicsCollections(next.economics);

        const index = next.economics.budgets.findIndex(
          item =>
            Number(item.year) === ui.year
            && item.category === data.category,
        );

        const row = {
          id: index >= 0
            ? next.economics.budgets[index].id
            : makeId('econ-budget'),
          year: ui.year,
          category: data.category,
          amount: Number(data.amount || 0),
        };

        if (index >= 0) next.economics.budgets[index] = row;
        else next.economics.budgets.push(row);
      });

      dialog.close();
      dialog.remove();
      rerenderEconomics(container, store);
    });

  dialog.addEventListener('close', () => {
    if (dialog.isConnected) dialog.remove();
  });

  dialog.showModal();
}

function buildSeasonSnapshot(economics, seasonStart) {
  const agreements = economics.agreements
    .filter(item => Number(item.seasonStart) === Number(seasonStart));

  const agreementIds = new Set(agreements.map(item => item.id));
  const agreementCommitted = agreements
    .reduce((total, item) => total + Number(item.agreedAmount || 0), 0);

  const agreementPaid = economics.entries
    .filter(entry =>
      agreementIds.has(entry.agreementId)
      && entry.direction !== 'income'
      && entry.status === 'paid')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);

  const unlinkedSeasonExpenses = entriesForSeason(economics.entries, seasonStart)
    .filter(entry =>
      entry.direction !== 'income'
      && entry.status !== 'cancelled'
      && !entry.agreementId);

  const unlinkedCommitted = sum(unlinkedSeasonExpenses);
  const unlinkedPaid = sum(
    unlinkedSeasonExpenses.filter(entry => entry.status === 'paid'),
  );

  const committed = agreementCommitted + unlinkedCommitted;
  const paid = agreementPaid + unlinkedPaid;
  const remaining = Math.max(0, committed - paid);

  const sponsors = economics.sponsors
    .filter(item => Number(item.seasonYear) === Number(seasonStart));

  const sponsorCoverage = sponsors.reduce(
    (total, item) =>
      total
      + Number(item.cashReceived || 0)
      + Number(item.inKindValue || 0),
    0,
  );

  const rows = agreements.map(agreement => {
    const area = economics.trainingAreas
      .find(item => item.id === agreement.areaId);

    const paidForAgreement = economics.entries
      .filter(entry =>
        entry.agreementId === agreement.id
        && entry.direction !== 'income'
        && entry.status === 'paid')
      .reduce((total, entry) => total + Number(entry.amount || 0), 0);

    return {
      label: area?.name || 'Accordo formazione',
      detail: agreementInstallmentText(agreement),
      committed: Number(agreement.agreedAmount || 0),
      paid: paidForAgreement,
    };
  });

  if (unlinkedCommitted > 0) {
    rows.push({
      label: 'Altri costi registrati',
      detail: 'Tornei, trasferte, attrezzatura e movimenti non collegati ad accordi.',
      committed: unlinkedCommitted,
      paid: unlinkedPaid,
    });
  }

  return {
    committed,
    paid,
    remaining,
    sponsorCoverage,
    netForecast: committed - sponsorCoverage,
    paidPct: committed > 0
      ? Math.min(100, Math.max(0, (paid / committed) * 100))
      : 0,
    rows,
  };
}

function normalizeEconomicsState(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    ...source,
    currency: String(source.currency || 'EUR'),
    trainingAreas: Array.isArray(source.trainingAreas) ? source.trainingAreas : [],
    agreements: Array.isArray(source.agreements) ? source.agreements : [],
    entries: Array.isArray(source.entries) ? source.entries : [],
    budgets: Array.isArray(source.budgets) ? source.budgets : [],
    sponsors: Array.isArray(source.sponsors) ? source.sponsors : [],
  };
}

function ensureEconomicsCollections(economics) {
  if (!economics || typeof economics !== 'object') return;
  if (!Array.isArray(economics.trainingAreas)) economics.trainingAreas = [];
  if (!Array.isArray(economics.agreements)) economics.agreements = [];
  if (!Array.isArray(economics.entries)) economics.entries = [];
  if (!Array.isArray(economics.budgets)) economics.budgets = [];
  if (!Array.isArray(economics.sponsors)) economics.sponsors = [];
}

function agreementOptions(economics, selected) {
  const rows = [...economics.agreements]
    .sort((a, b) => {
      const seasonOrder = Number(b.seasonStart) - Number(a.seasonStart);
      if (seasonOrder) return seasonOrder;

      const areaA = economics.trainingAreas.find(item => item.id === a.areaId)?.name || '';
      const areaB = economics.trainingAreas.find(item => item.id === b.areaId)?.name || '';

      return areaA.localeCompare(areaB, 'it');
    });

  return rows.map(agreement => {
    const area = economics.trainingAreas
      .find(item => item.id === agreement.areaId);

    const paid = economics.entries
      .filter(entry =>
        entry.agreementId === agreement.id
        && entry.direction !== 'income'
        && entry.status === 'paid')
      .reduce((total, entry) => total + Number(entry.amount || 0), 0);

    const remaining = Math.max(
      0,
      Number(agreement.agreedAmount || 0) - paid,
    );

    const label = `${area?.name || 'Accordo'} · ${seasonLabel(agreement.seasonStart)} · residuo ${money(remaining)}`;

    return `
      <option value="${agreement.id}" ${selected === agreement.id ? 'selected' : ''}>
        ${escapeHtml(label)}
      </option>
    `;
  }).join('');
}

function agreementInstallmentText(agreement) {
  const model = pricingLabels[agreement.pricingModel] || 'Accordo';
  const amount = Number(agreement.installmentAmount || 0);
  const count = Number(agreement.installmentCount || 0);

  if (amount > 0 && count > 0) {
    return `${model} · ${money(amount)} × ${count}`;
  }

  if (amount > 0 && agreement.pricingModel === 'monthly') {
    return `${model} · ${money(amount)} / mese`;
  }

  if (count > 0) {
    return `${model} · ${count} pagamenti previsti`;
  }

  return model;
}

function areaTypeLabel(value) {
  return {
    tennis: 'Tennis',
    physical: 'Preparazione atletica',
    mental: 'Mental',
    medical: 'Fisio / prevenzione',
    other: 'Altro',
  }[value] || 'Formazione';
}

function rerenderEconomics(container, store) {
  const main = document.querySelector('#main-content');
  const title = document.querySelector('#page-title');
  renderEconomics({ main, title, store });
}

function entriesForYear(entries, year) {
  return entries.filter(entry => {
    const date = entry.paidDate || entry.dueDate || entry.date || '';
    return Number(String(date).slice(0, 4)) === Number(year);
  });
}

function entriesForSeason(entries, seasonStart) {
  const from = `${seasonStart}-09-01`;
  const to = `${Number(seasonStart) + 1}-08-31`;

  return entries.filter(entry => {
    const date = entry.paidDate || entry.dueDate || entry.date || '';
    return date >= from && date <= to;
  });
}

function tournamentYear(tournament) {
  return Number(
    String(tournament.startDate || tournament.date || '').slice(0, 4),
  );
}

function costChips(entries) {
  if (!entries.length) {
    return '<span class="economics-muted">Nessun costo registrato.</span>';
  }

  const groups = [
    ['tournament', 'Iscrizione / torneo'],
    ['travel', 'Trasferta'],
  ];

  return groups.map(([category, label]) => {
    const amount = sum(
      entries.filter(entry => entry.category === category),
    );

    return amount
      ? `<span class="economics-cost-chip"><b>${label}</b> ${money(amount)}</span>`
      : '';
  }).join('');
}

function simpleEntryRow(entry, showEquipment = false) {
  return `
    <div class="economics-simple-row">
      <div>
        <strong>${escapeHtml(entry.description || 'Movimento')}</strong>
        <span>
          ${formatDate(entry.paidDate || entry.dueDate || entry.date)}
          ${entry.payee ? ` · ${escapeHtml(entry.payee)}` : ''}
          ${showEquipment && entry.equipmentType
            ? ` · ${escapeHtml(equipmentLabels[entry.equipmentType] || entry.equipmentType)}`
            : ''}
        </span>
      </div>

      <div class="economics-simple-value">
        <strong>${money(entry.amount)}</strong>
        <span>${statusLabels[entry.status] || 'Programmato'}</span>
      </div>
    </div>
  `;
}

function categoryOptions(selected) {
  return Object.entries(categoryLabels)
    .map(([key, label]) =>
      `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function equipmentOptions(selected) {
  return Object.entries(equipmentLabels)
    .map(([key, label]) =>
      `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function statusOptions(selected) {
  return Object.entries(statusLabels)
    .map(([key, label]) =>
      `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function pricingOptions(selected) {
  return Object.entries(pricingLabels)
    .map(([key, label]) =>
      `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function yearOptions(selected) {
  const current = new Date().getFullYear();
  const years = [];

  for (let year = current - 2; year <= current + 3; year++) {
    years.push(year);
  }

  if (!years.includes(Number(selected))) years.push(Number(selected));

  return years
    .sort()
    .map(year =>
      `<option value="${year}" ${Number(selected) === year ? 'selected' : ''}>${year}</option>`)
    .join('');
}

function seasonOptions(selected) {
  const current = currentSeasonStart();
  const seasons = [];

  for (let year = current - 3; year <= current + 3; year++) {
    seasons.push(year);
  }

  if (!seasons.includes(Number(selected))) seasons.push(Number(selected));

  return seasons
    .sort()
    .map(year => `
      <option value="${year}" ${Number(selected) === year ? 'selected' : ''}>
        ${seasonLabel(year)}
      </option>
    `)
    .join('');
}

function seasonLabel(start) {
  const year = Number(start || currentSeasonStart());
  return `${year}/${String(year + 1).slice(-2)}`;
}

function sum(entries) {
  return entries.reduce(
    (total, entry) => total + Number(entry.amount || 0),
    0,
  );
}

function money(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
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

function dateKey(value) {
  return value || '9999-12-31';
}

function todayKey() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function bindDialogClose(dialog) {
  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
}

function emptyInline(title, copy) {
  return `
    <div class="economics-empty">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(copy)}</span>
    </div>
  `;
}

function emptyPanel(title, copy) {
  return `
    <article class="panel economics-empty-panel">
      <div class="panel-body">${emptyInline(title, copy)}</div>
    </article>
  `;
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
