import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js';

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

const ui = {
  section: 'overview',
  year: new Date().getFullYear(),
};

export function renderEconomics({ main, title, store }) {
  title.textContent = '11. Economics';
  const state = store.getState();
  const economics = state.economics;

  main.innerHTML = `
    <section class="economics-module-head">
      <div>
        <div class="eyebrow">Economics</div>
        <h2>Costi e sostenibilità</h2>
        <p>Costi di formazione, tornei e trasferte, attrezzatura, pagamenti e budget in un unico registro.</p>
      </div>
      <div class="economics-head-actions">
        <label class="economics-year-picker">
          <span>Anno</span>
          <select id="economics-year">${yearOptions(ui.year)}</select>
        </label>
        <button class="button button-primary" id="economics-add-entry" type="button">+ Nuovo movimento</button>
      </div>
    </section>

    <div class="economics-section-switch" role="tablist" aria-label="Sezioni Economics">
      ${sections.map(section => `
        <button class="economics-section-button ${ui.section === section.id ? 'active' : ''}" data-economics-section="${section.id}" type="button">${section.label}</button>
      `).join('')}
    </div>

    <div id="economics-section-content"></div>
  `;

  const content = main.querySelector('#economics-section-content');
  if (ui.section === 'training') renderTrainingCosts(content, state, store);
  else if (ui.section === 'tournaments') renderTournamentCosts(content, state, store);
  else if (ui.section === 'equipment') renderEquipmentCosts(content, state, store);
  else if (ui.section === 'payments') renderPayments(content, state, store);
  else if (ui.section === 'budget') renderBudget(content, state, store);
  else renderOverview(content, state);

  main.querySelectorAll('[data-economics-section]').forEach(button => {
    button.addEventListener('click', () => {
      ui.section = button.dataset.economicsSection;
      renderEconomics({ main, title, store });
    });
  });

  main.querySelector('#economics-year').addEventListener('change', event => {
    ui.year = Number(event.target.value);
    renderEconomics({ main, title, store });
  });

  main.querySelector('#economics-add-entry').addEventListener('click', () => {
    openEntryDialog({ main, title, store });
  });
}

function renderOverview(container, state) {
  const entries = entriesForYear(state.economics.entries, ui.year).filter(entry => entry.status !== 'cancelled');
  const expenses = entries.filter(entry => entry.direction !== 'income');
  const income = entries.filter(entry => entry.direction === 'income');
  const paid = sum(expenses.filter(entry => entry.status === 'paid'));
  const open = sum(expenses.filter(entry => entry.status !== 'paid'));
  const committed = paid + open;
  const credits = sum(income.filter(entry => entry.status === 'paid'));
  const netPaid = paid - credits;
  const categories = Object.keys(categoryLabels).map(category => ({
    category,
    amount: sum(expenses.filter(entry => entry.category === category)),
  })).filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const maxCategory = Math.max(...categories.map(row => row.amount), 1);
  const upcoming = [...expenses]
    .filter(entry => entry.status !== 'paid' && entry.status !== 'cancelled')
    .sort((a, b) => dateKey(a.dueDate || a.date).localeCompare(dateKey(b.dueDate || b.date)))
    .slice(0, 7);

  container.innerHTML = `
    <section class="economics-kpis">
      <article class="economics-kpi"><span>Pagato ${ui.year}</span><strong>${money(paid)}</strong></article>
      <article class="economics-kpi"><span>Da pagare / previsto</span><strong>${money(open)}</strong></article>
      <article class="economics-kpi"><span>Impegni totali</span><strong>${money(committed)}</strong></article>
      <article class="economics-kpi"><span>Contributi / rimborsi</span><strong>${money(credits)}</strong></article>
      <article class="economics-kpi"><span>Costo netto pagato</span><strong>${money(netPaid)}</strong></article>
    </section>

    <section class="economics-overview-grid">
      <article class="panel">
        <div class="panel-header">
          <h3>Costi per area</h3>
          <p>Movimenti pagati e programmati nell'anno selezionato.</p>
        </div>
        <div class="panel-body">
          ${categories.length ? `
            <div class="economics-bars">
              ${categories.map(row => `
                <div class="economics-bar-row">
                  <div class="economics-bar-copy"><span>${categoryLabels[row.category]}</span><strong>${money(row.amount)}</strong></div>
                  <div class="economics-bar-track"><span style="width:${Math.max(4, (row.amount / maxCategory) * 100)}%"></span></div>
                </div>
              `).join('')}
            </div>
          ` : emptyInline('Ancora nessun costo registrato.', 'I movimenti inseriti alimenteranno automaticamente questa ripartizione.')}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <h3>Prossime scadenze</h3>
          <p>Pagamenti aperti ordinati per data.</p>
        </div>
        <div class="panel-body economics-deadline-list">
          ${upcoming.length ? upcoming.map(entry => `
            <div class="economics-deadline-row">
              <div>
                <strong>${escapeHtml(entry.description || categoryLabels[entry.category] || 'Movimento')}</strong>
                <span>${entry.dueDate ? `Scadenza ${formatDate(entry.dueDate)}` : 'Data non indicata'}${entry.payee ? ` · ${escapeHtml(entry.payee)}` : ''}</span>
              </div>
              <strong>${money(entry.amount)}</strong>
            </div>
          `).join('') : emptyInline('Nessuna scadenza aperta.', 'I pagamenti con stato “Da pagare” o “Programmato” compariranno qui.')}
        </div>
      </article>
    </section>
  `;
}

function renderTrainingCosts(container, state, store) {
  const entries = entriesForYear(state.economics.entries, ui.year).filter(entry => entry.category === 'training' && entry.status !== 'cancelled');
  const areas = state.economics.trainingAreas;

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Formazione</div>
        <h2>Costo per area di formazione</h2>
        <p>Le aree sono configurabili: circoli, coach, preparazione atletica, mental, fisioterapia preventiva o altri servizi.</p>
      </div>
      <button class="button button-ghost" id="economics-add-area" type="button">+ Nuova area</button>
    </section>

    <div class="economics-area-grid">
      ${areas.length ? areas.map(area => {
        const areaEntries = entries.filter(entry => entry.areaId === area.id);
        const paid = sum(areaEntries.filter(entry => entry.status === 'paid'));
        const open = sum(areaEntries.filter(entry => entry.status !== 'paid'));
        return `
          <article class="panel economics-area-card">
            <div class="panel-body">
              <div class="economics-card-topline">
                <div>
                  <div class="eyebrow">${escapeHtml(pricingLabels[area.pricingModel] || 'Area')}</div>
                  <h3>${escapeHtml(area.name)}</h3>
                </div>
                <button class="icon-button" data-edit-area="${area.id}" type="button" aria-label="Modifica area">✎</button>
              </div>
              <div class="economics-area-figures">
                <div><span>Pagato</span><strong>${money(paid)}</strong></div>
                <div><span>Aperto</span><strong>${money(open)}</strong></div>
                <div><span>Totale</span><strong>${money(paid + open)}</strong></div>
              </div>
              ${area.referenceAmount ? `<p class="economics-reference">Riferimento: ${money(area.referenceAmount)} · ${escapeHtml(pricingLabels[area.pricingModel] || '')}</p>` : ''}
              ${area.notes ? `<p class="economics-card-note">${escapeHtml(area.notes)}</p>` : ''}
              <button class="button button-primary economics-card-action" data-add-training-cost="${area.id}" type="button">Registra costo</button>
            </div>
          </article>
        `;
      }).join('') : emptyPanel('Nessuna area di formazione.', 'Aggiungi le strutture e i professionisti di cui vuoi monitorare il costo.')}
    </div>
  `;

  container.querySelector('#economics-add-area').addEventListener('click', () => openAreaDialog({ container, state, store }));
  container.querySelectorAll('[data-edit-area]').forEach(button => button.addEventListener('click', () => openAreaDialog({ container, state, store, areaId: button.dataset.editArea })));
  container.querySelectorAll('[data-add-training-cost]').forEach(button => button.addEventListener('click', () => openEntryDialogFromContainer({ container, state, store, preset: { category: 'training', areaId: button.dataset.addTrainingCost } })));
}

function renderTournamentCosts(container, state, store) {
  const tournaments = state.planner?.tournaments || [];
  const entries = entriesForYear(state.economics.entries, ui.year)
    .filter(entry => ['tournament', 'travel'].includes(entry.category) && entry.status !== 'cancelled');
  const yearTournaments = tournaments.filter(t => tournamentYear(t) === ui.year);
  const linkedIds = new Set(yearTournaments.map(t => t.id));
  const unlinked = entries.filter(entry => !entry.tournamentId || !linkedIds.has(entry.tournamentId));

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Tornei & trasferte</div>
        <h2>Costo per torneo</h2>
        <p>I tornei arrivano dal Calendar: qui registriamo solo iscrizione, viaggio, alloggio, vitto, trasporti locali, coach e altre spese.</p>
      </div>
      <button class="button button-primary" id="economics-add-tournament-cost" type="button">+ Costo torneo / trasferta</button>
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
                    <p>${escapeHtml(tournament.location || '')}${tournament.startDate ? ` · ${formatDate(tournament.startDate)}` : ''}${tournament.endDate && tournament.endDate !== tournament.startDate ? `–${formatDate(tournament.endDate)}` : ''}</p>
                  </div>
                  <div class="economics-tournament-total">
                    <span>Totale</span>
                    <strong>${money(total)}</strong>
                    <small>${money(paid)} pagati</small>
                  </div>
                </div>
                <div class="economics-cost-chips">
                  ${costChips(rows)}
                </div>
                <button class="button button-ghost" data-add-tournament-entry="${tournament.id}" type="button">Aggiungi costo</button>
              </div>
            </article>
          `;
        }).join('') : emptyPanel('Nessun torneo programmato per questo anno.', 'Aggiungi i tornei nel Calendar: compariranno automaticamente qui.')}
    </div>

    ${unlinked.length ? `
      <section class="panel economics-unlinked-panel">
        <div class="panel-header"><h3>Costi non collegati a un torneo</h3><p>Spese di torneo o trasferta inserite senza collegamento al Calendar.</p></div>
        <div class="panel-body economics-simple-list">
          ${unlinked.map(entry => simpleEntryRow(entry)).join('')}
        </div>
      </section>
    ` : ''}
  `;

  container.querySelector('#economics-add-tournament-cost').addEventListener('click', () => openEntryDialogFromContainer({ container, state, store, preset: { category: 'tournament' } }));
  container.querySelectorAll('[data-add-tournament-entry]').forEach(button => button.addEventListener('click', () => openEntryDialogFromContainer({ container, state, store, preset: { category: 'tournament', tournamentId: button.dataset.addTournamentEntry } })));
}

function renderEquipmentCosts(container, state, store) {
  const entries = entriesForYear(state.economics.entries, ui.year).filter(entry => entry.category === 'equipment' && entry.status !== 'cancelled');
  const groups = Object.keys(equipmentLabels).map(key => ({
    key,
    amount: sum(entries.filter(entry => (entry.equipmentType || 'other') === key)),
  })).filter(group => group.amount > 0);
  const recent = [...entries].sort((a, b) => dateKey(b.paidDate || b.dueDate || b.date).localeCompare(dateKey(a.paidDate || a.dueDate || a.date))).slice(0, 12);

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Attrezzatura</div>
        <h2>Costi di materiali e setup</h2>
        <p>Racchette, corde, incordature, scarpe, abbigliamento e accessori. Il dettaglio tecnico resta nel modulo Equipment.</p>
      </div>
      <button class="button button-primary" id="economics-add-equipment-cost" type="button">+ Acquisto / costo</button>
    </section>

    <section class="economics-equipment-summary">
      ${groups.length ? groups.map(group => `
        <article class="economics-equipment-stat">
          <span>${equipmentLabels[group.key]}</span>
          <strong>${money(group.amount)}</strong>
        </article>
      `).join('') : `<article class="economics-equipment-stat empty"><span>Nessun costo registrato</span><strong>—</strong></article>`}
    </section>

    <section class="panel">
      <div class="panel-header"><h3>Movimenti attrezzatura</h3><p>${ui.year}</p></div>
      <div class="panel-body economics-simple-list">
        ${recent.length ? recent.map(entry => simpleEntryRow(entry, true)).join('') : emptyInline('Nessun acquisto registrato.', 'Registra i costi e, quando utile, specifica la categoria di materiale.')}
      </div>
    </section>
  `;

  container.querySelector('#economics-add-equipment-cost').addEventListener('click', () => openEntryDialogFromContainer({ container, state, store, preset: { category: 'equipment' } }));
}

function renderPayments(container, state, store) {
  const entries = entriesForYear(state.economics.entries, ui.year)
    .sort((a, b) => dateKey(b.paidDate || b.dueDate || b.date).localeCompare(dateKey(a.paidDate || a.dueDate || a.date)));

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Diario</div>
        <h2>Pagamenti effettuati e da fare</h2>
        <p>Un unico registro per spese, rimborsi, contributi e scadenze.</p>
      </div>
      <button class="button button-primary" id="economics-add-payment" type="button">+ Nuovo movimento</button>
    </section>

    <section class="panel economics-ledger-panel">
      <div class="economics-ledger-wrap">
        <table class="economics-ledger">
          <thead>
            <tr><th>Data</th><th>Descrizione</th><th>Area</th><th>Importo</th><th>Stato</th><th></th></tr>
          </thead>
          <tbody>
            ${entries.length ? entries.map(entry => `
              <tr>
                <td>${formatDate(entry.paidDate || entry.dueDate || entry.date)}</td>
                <td><strong>${escapeHtml(entry.description || 'Movimento')}</strong>${entry.payee ? `<small>${escapeHtml(entry.payee)}</small>` : ''}</td>
                <td>${escapeHtml(categoryLabels[entry.category] || entry.category || 'Altro')}</td>
                <td class="economics-amount ${entry.direction === 'income' ? 'income' : ''}">${entry.direction === 'income' ? '+' : '−'}${money(entry.amount)}</td>
                <td><span class="economics-status status-${entry.status || 'planned'}">${statusLabels[entry.status] || 'Programmato'}</span></td>
                <td class="economics-row-actions">
                  ${entry.direction !== 'income' && entry.status !== 'paid' && entry.status !== 'cancelled' ? `<button class="button button-ghost economics-small-button" data-mark-paid="${entry.id}" type="button">Pagato</button>` : ''}
                  <button class="icon-button" data-edit-entry="${entry.id}" type="button" aria-label="Modifica movimento">✎</button>
                </td>
              </tr>
            `).join('') : `<tr><td colspan="6">${emptyInline('Nessun movimento nell’anno selezionato.', 'Inserisci il primo pagamento o costo programmato.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#economics-add-payment').addEventListener('click', () => openEntryDialogFromContainer({ container, state, store }));
  container.querySelectorAll('[data-edit-entry]').forEach(button => button.addEventListener('click', () => openEntryDialogFromContainer({ container, state, store, entryId: button.dataset.editEntry })));
  container.querySelectorAll('[data-mark-paid]').forEach(button => button.addEventListener('click', () => {
    store.update(next => {
      const entry = next.economics.entries.find(item => item.id === button.dataset.markPaid);
      if (!entry) return;
      entry.status = 'paid';
      entry.paidDate = todayKey();
    });
    rerenderEconomics(container, store);
  }));
}

function renderBudget(container, state, store) {
  const entries = entriesForYear(state.economics.entries, ui.year).filter(entry => entry.direction !== 'income' && entry.status !== 'cancelled');
  const budgets = state.economics.budgets.filter(budget => Number(budget.year) === ui.year);
  const rows = Object.keys(categoryLabels).map(category => {
    const budget = budgets.find(item => item.category === category);
    const spent = sum(entries.filter(entry => entry.category === category));
    return { category, budget: Number(budget?.amount || 0), spent };
  });
  const totalBudget = rows.reduce((acc, row) => acc + row.budget, 0);
  const totalCommitted = rows.reduce((acc, row) => acc + row.spent, 0);

  container.innerHTML = `
    <section class="economics-subhead">
      <div>
        <div class="eyebrow">Budget & forecast</div>
        <h2>Budget annuale</h2>
        <p>Confronta budget e costi già sostenuti o programmati. Non è contabilità fiscale: è controllo gestionale della stagione.</p>
      </div>
      <button class="button button-ghost" id="economics-set-budget" type="button">Imposta budget</button>
    </section>

    <section class="economics-kpis economics-budget-kpis">
      <article class="economics-kpi"><span>Budget ${ui.year}</span><strong>${money(totalBudget)}</strong></article>
      <article class="economics-kpi"><span>Impegnato</span><strong>${money(totalCommitted)}</strong></article>
      <article class="economics-kpi"><span>Residuo</span><strong>${money(totalBudget - totalCommitted)}</strong></article>
    </section>

    <section class="panel">
      <div class="panel-body economics-budget-list">
        ${rows.map(row => {
          const pct = row.budget > 0 ? Math.min(100, (row.spent / row.budget) * 100) : 0;
          return `
            <div class="economics-budget-row">
              <div class="economics-budget-copy"><strong>${categoryLabels[row.category]}</strong><span>${money(row.spent)} / ${row.budget ? money(row.budget) : 'budget non impostato'}</span></div>
              <div class="economics-budget-track"><span style="width:${pct}%"></span></div>
              <button class="button button-ghost economics-small-button" data-budget-category="${row.category}" type="button">Modifica</button>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  container.querySelector('#economics-set-budget').addEventListener('click', () => openBudgetDialog({ container, state, store }));
  container.querySelectorAll('[data-budget-category]').forEach(button => button.addEventListener('click', () => openBudgetDialog({ container, state, store, category: button.dataset.budgetCategory })));
}

function openEntryDialog({ main, title, store, preset = {}, entryId = '' }) {
  const state = store.getState();
  const host = main || document.querySelector('#main-content');
  createEntryDialog(host, state, store, preset, entryId, () => renderEconomics({ main: host, title: title || document.querySelector('#page-title'), store }));
}

function openEntryDialogFromContainer({ container, state, store, preset = {}, entryId = '' }) {
  const main = document.querySelector('#main-content');
  const title = document.querySelector('#page-title');
  createEntryDialog(main, state, store, preset, entryId, () => renderEconomics({ main, title, store }));
}

function createEntryDialog(host, state, store, preset, entryId, onSave) {
  const existing = entryId ? state.economics.entries.find(entry => entry.id === entryId) : null;
  const entry = existing || {
    direction: 'expense', category: preset.category || 'training', areaId: preset.areaId || '', tournamentId: preset.tournamentId || '',
    equipmentType: 'other', description: '', payee: '', amount: '', date: todayKey(), dueDate: '', paidDate: '', status: 'paid', method: '', notes: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="economics-entry-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Economics</div><h3>${existing ? 'Modifica movimento' : 'Nuovo movimento'}</h3></div>
        <button class="dialog-close" type="button" data-dialog-close>×</button>
      </div>
      <div class="dialog-body form-grid">
        <div class="field"><label>Tipo</label><select name="direction"><option value="expense" ${entry.direction !== 'income' ? 'selected' : ''}>Uscita</option><option value="income" ${entry.direction === 'income' ? 'selected' : ''}>Entrata / rimborso</option></select></div>
        <div class="field"><label>Categoria</label><select name="category">${categoryOptions(entry.category)}</select></div>
        <div class="field full"><label>Descrizione</label><input name="description" required value="${escapeAttr(entry.description)}" placeholder="es. Quota mensile settembre" /></div>
        <div class="field"><label>Importo (€)</label><input name="amount" type="number" min="0" step="0.01" required value="${escapeAttr(entry.amount)}" /></div>
        <div class="field"><label>Beneficiario / fonte</label><input name="payee" value="${escapeAttr(entry.payee)}" placeholder="es. MD Vita" /></div>
        <div class="field"><label>Data movimento</label><input name="date" type="date" value="${escapeAttr(entry.date || todayKey())}" /></div>
        <div class="field"><label>Stato</label><select name="status">${statusOptions(entry.status)}</select></div>
        <div class="field"><label>Scadenza</label><input name="dueDate" type="date" value="${escapeAttr(entry.dueDate)}" /></div>
        <div class="field"><label>Data pagamento</label><input name="paidDate" type="date" value="${escapeAttr(entry.paidDate)}" /></div>
        <div class="field"><label>Area formazione</label><select name="areaId"><option value="">—</option>${state.economics.trainingAreas.map(area => `<option value="${area.id}" ${entry.areaId === area.id ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Torneo collegato</label><select name="tournamentId"><option value="">—</option>${(state.planner?.tournaments || []).map(t => `<option value="${t.id}" ${entry.tournamentId === t.id ? 'selected' : ''}>${escapeHtml(t.name || 'Torneo')}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo attrezzatura</label><select name="equipmentType">${equipmentOptions(entry.equipmentType)}</select></div>
        <div class="field"><label>Metodo pagamento</label><input name="method" value="${escapeAttr(entry.method)}" placeholder="Carta, bonifico, contanti…" /></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(entry.notes)}</textarea></div>
      </div>
      <div class="dialog-actions">
        <div>${existing ? '<button class="button button-danger-ghost" id="economics-delete-entry" type="button">Elimina</button>' : ''}</div>
        <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div>
      </div>
    </form>
  `;
  host.appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#economics-entry-form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const normalized = {
      ...data,
      amount: Number(data.amount || 0),
      id: existing?.id || makeId('econ-entry'),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (normalized.status === 'paid' && !normalized.paidDate) normalized.paidDate = normalized.date || todayKey();
    store.update(next => {
      const index = next.economics.entries.findIndex(item => item.id === normalized.id);
      if (index >= 0) next.economics.entries[index] = normalized;
      else next.economics.entries.push(normalized);
    });
    dialog.close();
    dialog.remove();
    onSave();
  });

  dialog.querySelector('#economics-delete-entry')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm('Eliminare questo movimento?', { title: 'Elimina movimento', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(next => { next.economics.entries = next.economics.entries.filter(item => item.id !== existing.id); });
    dialog.close(); dialog.remove(); onSave();
  });

  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function openAreaDialog({ container, state, store, areaId = '' }) {
  const existing = areaId ? state.economics.trainingAreas.find(area => area.id === areaId) : null;
  const area = existing || { name: '', category: 'tennis', pricingModel: 'monthly', referenceAmount: '', active: true, notes: '' };
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="economics-area-form">
      <div class="dialog-head"><div><div class="eyebrow">Formazione</div><h3>${existing ? 'Modifica area' : 'Nuova area'}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body form-grid">
        <div class="field full"><label>Nome</label><input name="name" required value="${escapeAttr(area.name)}" placeholder="es. MD Vita" /></div>
        <div class="field"><label>Tipo</label><select name="category"><option value="tennis" ${area.category === 'tennis' ? 'selected' : ''}>Tennis</option><option value="physical" ${area.category === 'physical' ? 'selected' : ''}>Preparazione atletica</option><option value="mental" ${area.category === 'mental' ? 'selected' : ''}>Mental</option><option value="medical" ${area.category === 'medical' ? 'selected' : ''}>Fisio / prevenzione</option><option value="other" ${area.category === 'other' ? 'selected' : ''}>Altro</option></select></div>
        <div class="field"><label>Modalità costo</label><select name="pricingModel">${pricingOptions(area.pricingModel)}</select></div>
        <div class="field"><label>Costo di riferimento (€)</label><input name="referenceAmount" type="number" min="0" step="0.01" value="${escapeAttr(area.referenceAmount)}" /></div>
        <div class="field"><label>Attiva</label><select name="active"><option value="true" ${area.active !== false ? 'selected' : ''}>Sì</option><option value="false" ${area.active === false ? 'selected' : ''}>No</option></select></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(area.notes)}</textarea></div>
      </div>
      <div class="dialog-actions"><div>${existing ? '<button class="button button-danger-ghost" id="economics-delete-area" type="button">Elimina</button>' : ''}</div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div></div>
    </form>
  `;
  document.querySelector('#main-content').appendChild(dialog);
  bindDialogClose(dialog);
  const form = dialog.querySelector('#economics-area-form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const normalized = { ...data, id: existing?.id || makeId('econ-area'), active: data.active === 'true', referenceAmount: data.referenceAmount ? Number(data.referenceAmount) : '' };
    store.update(next => {
      const index = next.economics.trainingAreas.findIndex(item => item.id === normalized.id);
      if (index >= 0) next.economics.trainingAreas[index] = normalized;
      else next.economics.trainingAreas.push(normalized);
    });
    dialog.close(); dialog.remove(); rerenderEconomics(container, store);
  });
  dialog.querySelector('#economics-delete-area')?.addEventListener('click', async () => {
    const used = state.economics.entries.some(entry => entry.areaId === existing.id);
    if (used) { await showInAppAlert('Questa area è già collegata a dei movimenti e non può essere eliminata. Puoi marcarla come non attiva.', { title: 'Area in uso' }); return; }
    const confirmed = await showInAppConfirm('Eliminare questa area?', { title: 'Elimina area', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(next => { next.economics.trainingAreas = next.economics.trainingAreas.filter(item => item.id !== existing.id); });
    dialog.close(); dialog.remove(); rerenderEconomics(container, store);
  });
  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function openBudgetDialog({ container, state, store, category = 'training' }) {
  const existing = state.economics.budgets.find(item => Number(item.year) === ui.year && item.category === category);
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog economics-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="economics-budget-form">
      <div class="dialog-head"><div><div class="eyebrow">Budget ${ui.year}</div><h3>Imposta budget</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body form-grid">
        <div class="field"><label>Categoria</label><select name="category">${categoryOptions(category)}</select></div>
        <div class="field"><label>Budget annuale (€)</label><input name="amount" type="number" min="0" step="0.01" required value="${escapeAttr(existing?.amount || '')}" /></div>
      </div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div></div>
    </form>
  `;
  document.querySelector('#main-content').appendChild(dialog);
  bindDialogClose(dialog);
  dialog.querySelector('#economics-budget-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.update(next => {
      const index = next.economics.budgets.findIndex(item => Number(item.year) === ui.year && item.category === data.category);
      const row = { id: index >= 0 ? next.economics.budgets[index].id : makeId('econ-budget'), year: ui.year, category: data.category, amount: Number(data.amount || 0) };
      if (index >= 0) next.economics.budgets[index] = row; else next.economics.budgets.push(row);
    });
    dialog.close(); dialog.remove(); rerenderEconomics(container, store);
  });
  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
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

function tournamentYear(tournament) {
  return Number(String(tournament.startDate || tournament.date || '').slice(0, 4));
}

function costChips(entries) {
  if (!entries.length) return '<span class="economics-muted">Nessun costo registrato.</span>';
  const groups = [
    ['tournament', 'Iscrizione / torneo'],
    ['travel', 'Trasferta'],
  ];
  return groups.map(([category, label]) => {
    const amount = sum(entries.filter(entry => entry.category === category));
    return amount ? `<span class="economics-cost-chip"><b>${label}</b> ${money(amount)}</span>` : '';
  }).join('');
}

function simpleEntryRow(entry, showEquipment = false) {
  return `
    <div class="economics-simple-row">
      <div>
        <strong>${escapeHtml(entry.description || 'Movimento')}</strong>
        <span>${formatDate(entry.paidDate || entry.dueDate || entry.date)}${entry.payee ? ` · ${escapeHtml(entry.payee)}` : ''}${showEquipment && entry.equipmentType ? ` · ${escapeHtml(equipmentLabels[entry.equipmentType] || entry.equipmentType)}` : ''}</span>
      </div>
      <div class="economics-simple-value"><strong>${money(entry.amount)}</strong><span>${statusLabels[entry.status] || 'Programmato'}</span></div>
    </div>
  `;
}

function categoryOptions(selected) {
  return Object.entries(categoryLabels).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('');
}
function equipmentOptions(selected) {
  return Object.entries(equipmentLabels).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('');
}
function statusOptions(selected) {
  return Object.entries(statusLabels).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('');
}
function pricingOptions(selected) {
  return Object.entries(pricingLabels).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('');
}

function yearOptions(selected) {
  const current = new Date().getFullYear();
  const years = [];
  for (let year = current - 2; year <= current + 3; year++) years.push(year);
  if (!years.includes(Number(selected))) years.push(Number(selected));
  return years.sort().map(year => `<option value="${year}" ${Number(selected) === year ? 'selected' : ''}>${year}</option>`).join('');
}

function sum(entries) {
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

function money(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function dateKey(value) { return value || '9999-12-31'; }
function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function makeId(prefix) { return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function bindDialogClose(dialog) { dialog.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close())); }
function emptyInline(title, copy) { return `<div class="economics-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`; }
function emptyPanel(title, copy) { return `<article class="panel economics-empty-panel"><div class="panel-body">${emptyInline(title, copy)}</div></article>`; }
function escapeHtml(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value = '') { return escapeHtml(value); }
