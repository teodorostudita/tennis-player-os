import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'Esercizi' },
  { id: 'sessions', label: 'Sessioni' },
  { id: 'measurements', label: 'Misurazioni' },
];

const categoryLabels = {
  serve: 'Servizio',
  return: 'Risposta',
  baseline: 'Fondo campo',
  transition: 'Transizione',
  net: 'Gioco di volo',
  movement: 'Movimento',
  pointplay: 'Point play',
  mixed: 'Combinato',
};

const focusLabels = {
  technical: 'Tecnica',
  tactical: 'Tattica',
  consistency: 'Continuità',
  attack: 'Attacco',
  defense: 'Difesa',
  decision: 'Decision making',
  pressure: 'Pressione / punteggio',
  movement: 'Movimento',
};

const intensityLabels = {
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta',
};

const ui = {
  section: 'overview',
  search: '',
  category: 'all',
  focus: 'all',
  favoritesOnly: false,
  selectedSessionId: '',
  selectedMeasurementProtocolId: '',
  measurementMetric: 'target',
};

export function renderDrills({ main, title, store }) {
  title.textContent = '3. Drills';
  const state = store.getState();
  const drills = state.drills;

  if (!ui.selectedSessionId && drills.sessions.length) {
    ui.selectedSessionId = [...drills.sessions].sort(sessionDateSort)[0]?.id || '';
  }

  main.innerHTML = `
    <section class="drills-module-head">
      <div>
        <div class="eyebrow">Drills</div>
        <h2>Esercizi e sessioni tennis</h2>
        <p>Una libreria riutilizzabile di esercizi tennis-specifici e un builder per comporre le sessioni in campo senza confonderle con Development o preparazione atletica.</p>
      </div>
      <div class="drills-head-actions">
        ${ui.section === 'measurements' ? `
          <button class="button button-ghost" id="drills-new-protocol" type="button">+ Nuovo protocollo</button>
          <button class="button button-primary" id="drills-new-measurement" type="button">+ Registra misurazione</button>
        ` : `
          <button class="button button-ghost" id="drills-new-session" type="button">+ Nuova sessione</button>
          <button class="button button-primary" id="drills-new-drill" type="button">+ Nuovo drill</button>
        `}
      </div>
    </section>

    <div class="drills-section-switch" role="tablist" aria-label="Sezioni Drills">
      ${sections.map(section => `
        <button class="drills-section-button ${ui.section === section.id ? 'active' : ''}" data-drills-section="${section.id}" type="button">${section.label}</button>
      `).join('')}
    </div>

    <div id="drills-section-content"></div>
  `;

  const content = main.querySelector('#drills-section-content');
  if (ui.section === 'library') renderLibrary(content, state, store);
  else if (ui.section === 'sessions') renderSessions(content, state, store);
  else if (ui.section === 'measurements') renderMeasurements(content, state, store);
  else renderOverview(content, state);

  main.querySelectorAll('[data-drills-section]').forEach(button => {
    button.addEventListener('click', () => {
      ui.section = button.dataset.drillsSection;
      renderDrills({ main, title, store });
    });
  });

  main.querySelector('#drills-new-drill')?.addEventListener('click', () => openDrillDialog({ main, title, store }));
  main.querySelector('#drills-new-session')?.addEventListener('click', () => openSessionDialog({ main, title, store }));
  main.querySelector('#drills-new-protocol')?.addEventListener('click', () => openMeasurementProtocolDialog({ main, title, store }));
  main.querySelector('#drills-new-measurement')?.addEventListener('click', async () => {
    const protocols = store.getState().drills.measurements?.protocols || [];
    const protocolId = ui.selectedMeasurementProtocolId || protocols[0]?.id || '';
    if (!protocolId) { await showInAppAlert('Crea prima un protocollo di misurazione.', { title: 'Protocollo necessario' }); return; }
    openMeasurementRecordDialog({ main, title, store, protocolId });
  });
}

function renderOverview(container, state) {
  const drills = state.drills.library;
  const sessions = state.drills.sessions;
  const favorites = drills.filter(drill => drill.favorite).length;
  const totalMinutes = sessions.reduce((sum, session) => sum + sessionDuration(session), 0);
  const usage = usageMap(sessions);
  const topUsed = drills
    .map(drill => ({ drill, count: usage.get(drill.id) || 0 }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const categories = Object.entries(categoryLabels).map(([key, label]) => ({
    key,
    label,
    count: drills.filter(drill => drill.category === key).length,
  })).filter(row => row.count > 0);
  const maxCategory = Math.max(...categories.map(row => row.count), 1);
  const upcoming = [...sessions]
    .filter(session => !session.date || session.date >= todayKey())
    .sort(sessionDateSort)
    .slice(0, 5);

  container.innerHTML = `
    <section class="drills-kpis">
      <article class="drills-kpi"><span>Drill in libreria</span><strong>${drills.length}</strong></article>
      <article class="drills-kpi"><span>Preferiti</span><strong>${favorites}</strong></article>
      <article class="drills-kpi"><span>Sessioni</span><strong>${sessions.length}</strong></article>
      <article class="drills-kpi"><span>Minuti pianificati</span><strong>${formatMinutes(totalMinutes)}</strong></article>
    </section>

    <section class="drills-overview-grid">
      <article class="panel">
        <div class="panel-header"><h3>Libreria per area</h3><p>Distribuzione degli esercizi tennis-specifici.</p></div>
        <div class="panel-body">
          ${categories.length ? `
            <div class="drills-category-bars">
              ${categories.map(row => `
                <div class="drills-category-row">
                  <div class="drills-category-copy"><span>${row.label}</span><strong>${row.count}</strong></div>
                  <div class="drills-category-track"><span style="width:${Math.max(8, (row.count / maxCategory) * 100)}%"></span></div>
                </div>
              `).join('')}
            </div>
          ` : emptyInline('La libreria è vuota.', 'Aggiungi il primo drill per costruire il repertorio di lavoro in campo.')}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header"><h3>Prossime sessioni</h3><p>Sessioni pianificate nel builder Drills.</p></div>
        <div class="panel-body drills-upcoming-list">
          ${upcoming.length ? upcoming.map(session => `
            <div class="drills-upcoming-row">
              <div><strong>${escapeHtml(session.title || 'Sessione tennis')}</strong><span>${session.date ? formatDate(session.date) : 'Data non indicata'}${session.location ? ` · ${escapeHtml(session.location)}` : ''}</span></div>
              <strong>${formatMinutes(sessionDuration(session))}</strong>
            </div>
          `).join('') : emptyInline('Nessuna sessione pianificata.', 'Le sessioni composte con i drill compariranno qui.')}
        </div>
      </article>
    </section>

    <section class="panel drills-top-used-panel">
      <div class="panel-header"><h3>Drill più utilizzati</h3><p>Conteggio delle presenze nelle sessioni salvate.</p></div>
      <div class="panel-body">
        ${topUsed.length ? `
          <div class="drills-top-used-grid">
            ${topUsed.map(({ drill, count }) => `
              <article class="drills-top-used-card">
                <span class="drills-category-badge">${escapeHtml(categoryLabels[drill.category] || 'Drill')}</span>
                <strong>${escapeHtml(drill.title)}</strong>
                <small>${count} ${count === 1 ? 'utilizzo' : 'utilizzi'}</small>
              </article>
            `).join('')}
          </div>
        ` : emptyInline('Ancora nessun utilizzo registrato.', 'Aggiungi drill alle sessioni per vedere quali ricorrono più spesso.')}
      </div>
    </section>
  `;
}

function renderLibrary(container, state, store) {
  const allDrills = state.drills.library;
  const filtered = allDrills.filter(drill => {
    const haystack = `${drill.title || ''} ${drill.objective || ''} ${(drill.tags || []).join(' ')} ${drill.setup || ''}`.toLowerCase();
    const matchesSearch = !ui.search || haystack.includes(ui.search.toLowerCase());
    const matchesCategory = ui.category === 'all' || drill.category === ui.category;
    const matchesFocus = ui.focus === 'all' || drill.focus === ui.focus;
    const matchesFavorite = !ui.favoritesOnly || drill.favorite;
    return matchesSearch && matchesCategory && matchesFocus && matchesFavorite;
  });

  container.innerHTML = `
    <section class="drills-subhead">
      <div>
        <div class="eyebrow">Libreria</div>
        <h2>Repertorio degli esercizi</h2>
        <p>Ogni drill descrive il lavoro operativo in campo: obiettivo, setup, modalità, punteggio, vincoli e varianti.</p>
      </div>
      <span class="drills-result-count">${filtered.length} / ${allDrills.length}</span>
    </section>

    <section class="drills-filterbar">
      <label class="drills-search"><span>Cerca</span><input id="drills-search" type="search" value="${escapeAttr(ui.search)}" placeholder="Titolo, obiettivo, tag…" /></label>
      <label><span>Area</span><select id="drills-category-filter"><option value="all">Tutte</option>${optionsFromMap(categoryLabels, ui.category)}</select></label>
      <label><span>Focus</span><select id="drills-focus-filter"><option value="all">Tutti</option>${optionsFromMap(focusLabels, ui.focus)}</select></label>
      <label class="drills-favorite-filter"><input id="drills-favorites-filter" type="checkbox" ${ui.favoritesOnly ? 'checked' : ''} /> <span>Solo preferiti</span></label>
    </section>

    <section class="drills-library-grid">
      ${filtered.length ? filtered.map(drill => renderDrillCard(drill, state.drills.sessions)).join('') : emptyPanel('Nessun drill corrisponde ai filtri.', 'Modifica i filtri oppure crea un nuovo esercizio.')}
    </section>
  `;

  const search = container.querySelector('#drills-search');
  let searchTimer;
  search.addEventListener('input', event => {
    clearTimeout(searchTimer);
    ui.search = event.target.value;
    searchTimer = setTimeout(() => renderLibrary(container, store.getState(), store), 140);
  });
  container.querySelector('#drills-category-filter').addEventListener('change', event => { ui.category = event.target.value; renderLibrary(container, store.getState(), store); });
  container.querySelector('#drills-focus-filter').addEventListener('change', event => { ui.focus = event.target.value; renderLibrary(container, store.getState(), store); });
  container.querySelector('#drills-favorites-filter').addEventListener('change', event => { ui.favoritesOnly = event.target.checked; renderLibrary(container, store.getState(), store); });

  container.querySelectorAll('[data-edit-drill]').forEach(button => button.addEventListener('click', () => openDrillDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store, drillId: button.dataset.editDrill })));
  container.querySelectorAll('[data-toggle-favorite]').forEach(button => button.addEventListener('click', () => {
    const drillId = button.dataset.toggleFavorite;
    store.update(next => {
      const drill = next.drills.library.find(item => item.id === drillId);
      if (drill) drill.favorite = !drill.favorite;
    });
    renderLibrary(container, store.getState(), store);
  }));
}

function renderDrillCard(drill, sessions) {
  const uses = sessions.reduce((sum, session) => sum + (session.items || []).filter(item => item.drillId === drill.id).length, 0);
  return `
    <article class="panel drills-card">
      <div class="panel-body">
        <div class="drills-card-topline">
          <div class="drills-card-badges">
            <span class="drills-category-badge">${escapeHtml(categoryLabels[drill.category] || 'Drill')}</span>
            <span class="drills-focus-badge">${escapeHtml(focusLabels[drill.focus] || 'Focus')}</span>
          </div>
          <button class="drills-star ${drill.favorite ? 'active' : ''}" data-toggle-favorite="${drill.id}" type="button" aria-label="${drill.favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}">★</button>
        </div>
        <h3>${escapeHtml(drill.title || 'Drill senza titolo')}</h3>
        <p class="drills-objective">${escapeHtml(drill.objective || 'Obiettivo non specificato.')}</p>
        <div class="drills-card-meta">
          <span>${Number(drill.durationMin || 0) ? `${Number(drill.durationMin)} min` : 'Durata libera'}</span>
          <span>${escapeHtml(intensityLabels[drill.intensity] || 'Intensità libera')}</span>
          <span>${drill.players ? `${escapeHtml(drill.players)} gioc.` : 'Giocatori liberi'}</span>
          <span>${uses} ${uses === 1 ? 'uso' : 'usi'}</span>
        </div>
        ${drill.setup ? `<div class="drills-card-block"><strong>Setup</strong><span>${escapeHtml(drill.setup)}</span></div>` : ''}
        ${drill.execution ? `<div class="drills-card-block"><strong>Esecuzione</strong><span>${escapeHtml(drill.execution)}</span></div>` : ''}
        ${drill.scoring ? `<div class="drills-card-block"><strong>Punteggio / criterio</strong><span>${escapeHtml(drill.scoring)}</span></div>` : ''}
        ${(drill.tags || []).length ? `<div class="drills-tags">${drill.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        <div class="drills-card-actions"><button class="button button-ghost" data-edit-drill="${drill.id}" type="button">Modifica</button></div>
      </div>
    </article>
  `;
}

function renderSessions(container, state, store) {
  const sessions = [...state.drills.sessions].sort(sessionDateSort);
  let selected = sessions.find(session => session.id === ui.selectedSessionId);
  if (!selected && sessions.length) {
    selected = sessions[0];
    ui.selectedSessionId = selected.id;
  }

  container.innerHTML = `
    <section class="drills-subhead">
      <div>
        <div class="eyebrow">Sessioni</div>
        <h2>Session builder</h2>
        <p>Componi il lavoro in campo usando drill già definiti. La sessione può essere collegata a un evento tennis del Calendar senza duplicare l'appuntamento.</p>
      </div>
    </section>

    <section class="drills-sessions-layout">
      <aside class="panel drills-session-list-panel">
        <div class="panel-header"><h3>Sessioni salvate</h3><p>${sessions.length} ${sessions.length === 1 ? 'sessione' : 'sessioni'}</p></div>
        <div class="drills-session-list">
          ${sessions.length ? sessions.map(session => `
            <button class="drills-session-list-item ${selected?.id === session.id ? 'active' : ''}" data-session-id="${session.id}" type="button">
              <div><strong>${escapeHtml(session.title || 'Sessione tennis')}</strong><span>${session.date ? formatDate(session.date) : 'Senza data'}${session.location ? ` · ${escapeHtml(session.location)}` : ''}</span></div>
              <span>${formatMinutes(sessionDuration(session))}</span>
            </button>
          `).join('') : `<div class="drills-empty-side"><strong>Nessuna sessione</strong><span>Crea la prima sessione e aggiungi i drill dalla libreria.</span></div>`}
        </div>
      </aside>

      <div class="drills-session-main">
        ${selected ? renderSessionBuilder(selected, state) : `
          <section class="panel drills-empty-panel">
            <div class="drills-empty-icon">🎾</div>
            <h3>Costruisci una sessione</h3>
            <p>Salva il piano di lavoro e riutilizza i drill già presenti in libreria.</p>
            <button class="button button-primary" id="drills-empty-new-session" type="button">+ Nuova sessione</button>
          </section>
        `}
      </div>
    </section>
  `;

  container.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', () => {
    ui.selectedSessionId = button.dataset.sessionId;
    renderSessions(container, store.getState(), store);
  }));

  container.querySelector('#drills-empty-new-session')?.addEventListener('click', () => openSessionDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store }));

  if (!selected) return;

  container.querySelector('#drills-edit-session')?.addEventListener('click', () => openSessionDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store, sessionId: selected.id }));
  container.querySelector('#drills-print-session')?.addEventListener('click', () => window.print());
  container.querySelector('#drills-delete-session')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm('Eliminare questa sessione?', { title: 'Elimina sessione', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(next => { next.drills.sessions = next.drills.sessions.filter(session => session.id !== selected.id); });
    ui.selectedSessionId = '';
    renderSessions(container, store.getState(), store);
  });

  const addForm = container.querySelector('#drills-add-to-session-form');
  addForm?.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(addForm).entries());
    if (!data.drillId) return;
    store.update(next => {
      const session = next.drills.sessions.find(item => item.id === selected.id);
      const drill = next.drills.library.find(item => item.id === data.drillId);
      if (!session || !drill) return;
      session.items ||= [];
      session.items.push({
        id: makeId('session-item'),
        drillId: drill.id,
        titleSnapshot: drill.title,
        durationMin: Number(data.durationMin || drill.durationMin || 0),
        notes: data.notes || '',
      });
    });
    renderSessions(container, store.getState(), store);
  });

  container.querySelectorAll('[data-remove-session-item]').forEach(button => button.addEventListener('click', () => {
    const itemId = button.dataset.removeSessionItem;
    store.update(next => {
      const session = next.drills.sessions.find(item => item.id === selected.id);
      if (session) session.items = (session.items || []).filter(item => item.id !== itemId);
    });
    renderSessions(container, store.getState(), store);
  }));

  container.querySelectorAll('[data-move-session-item]').forEach(button => button.addEventListener('click', () => {
    const itemId = button.dataset.moveSessionItem;
    const direction = Number(button.dataset.direction);
    store.update(next => {
      const session = next.drills.sessions.find(item => item.id === selected.id);
      if (!session) return;
      const items = session.items || [];
      const index = items.findIndex(item => item.id === itemId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target], items[index]];
    });
    renderSessions(container, store.getState(), store);
  }));
}

function renderSessionBuilder(session, state) {
  const calendarEvent = (state.planner?.events || []).find(event => event.id === session.calendarEventId);
  const items = session.items || [];
  return `
    <section class="panel drills-session-builder" id="drills-print-area">
      <div class="drills-session-builder-head">
        <div>
          <div class="eyebrow">${session.date ? formatDate(session.date) : 'Sessione tennis'}</div>
          <h2>${escapeHtml(session.title || 'Sessione tennis')}</h2>
          <p>${[session.location, session.coach ? `Coach: ${session.coach}` : '', session.focus ? focusLabels[session.focus] || session.focus : ''].filter(Boolean).map(escapeHtml).join(' · ')}</p>
          ${calendarEvent ? `<span class="drills-calendar-link">↗ Collegata a Calendar: ${escapeHtml(calendarEvent.title || 'evento tennis')}</span>` : ''}
        </div>
        <div class="drills-session-actions no-print">
          <button class="button button-ghost" id="drills-print-session" type="button">Stampa</button>
          <button class="button button-ghost" id="drills-edit-session" type="button">Modifica</button>
          <button class="button button-danger-ghost" id="drills-delete-session" type="button">Elimina</button>
        </div>
      </div>

      ${session.objective ? `<div class="drills-session-objective"><strong>Obiettivo</strong><span>${escapeHtml(session.objective)}</span></div>` : ''}

      <div class="drills-session-summary">
        <div><span>Drill</span><strong>${items.length}</strong></div>
        <div><span>Durata</span><strong>${formatMinutes(sessionDuration(session))}</strong></div>
      </div>

      <div class="drills-session-items">
        ${items.length ? items.map((item, index) => renderSessionItem(item, index, items.length, state.drills.library)).join('') : emptyInline('Sessione ancora vuota.', 'Aggiungi uno o più drill dalla libreria.')}
      </div>

      <form id="drills-add-to-session-form" class="drills-add-form no-print">
        <label><span>Drill</span><select name="drillId" required><option value="">Seleziona…</option>${state.drills.library.map(drill => `<option value="${drill.id}">${escapeHtml(drill.title)}</option>`).join('')}</select></label>
        <label><span>Minuti</span><input name="durationMin" type="number" min="0" step="1" placeholder="auto" /></label>
        <label class="drills-add-notes"><span>Note sessione</span><input name="notes" placeholder="Dose, variante, vincolo…" /></label>
        <button class="button button-primary" type="submit" ${state.drills.library.length ? '' : 'disabled'}>Aggiungi</button>
      </form>

      ${session.notes ? `<div class="drills-session-notes"><strong>Note</strong><p>${escapeHtml(session.notes)}</p></div>` : ''}
    </section>
  `;
}

function renderSessionItem(item, index, count, library) {
  const drill = library.find(row => row.id === item.drillId);
  const title = drill?.title || item.titleSnapshot || 'Drill rimosso';
  const category = drill?.category ? categoryLabels[drill.category] : '';
  return `
    <article class="drills-session-item">
      <div class="drills-session-order">${index + 1}</div>
      <div class="drills-session-item-main">
        <div class="drills-session-item-title"><strong>${escapeHtml(title)}</strong>${category ? `<span>${escapeHtml(category)}</span>` : ''}</div>
        ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}
      </div>
      <strong class="drills-session-item-duration">${formatMinutes(Number(item.durationMin || 0))}</strong>
      <div class="drills-session-item-actions no-print">
        <button class="icon-button" data-move-session-item="${item.id}" data-direction="-1" type="button" aria-label="Sposta su" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-button" data-move-session-item="${item.id}" data-direction="1" type="button" aria-label="Sposta giù" ${index === count - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-button" data-remove-session-item="${item.id}" type="button" aria-label="Rimuovi">×</button>
      </div>
    </article>
  `;
}

function openDrillDialog({ main, title, store, drillId = '' }) {
  const state = store.getState();
  const existing = drillId ? state.drills.library.find(drill => drill.id === drillId) : null;
  const drill = existing || {
    title: '', category: 'baseline', focus: 'tactical', objective: '', players: '2', durationMin: 15,
    intensity: 'medium', equipment: '', setup: '', execution: '', scoring: '', constraints: '', progression: '', regression: '', tags: [], notes: '', favorite: false,
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog drills-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="drill-form">
      <div class="dialog-head"><div><div class="eyebrow">Drills</div><h3>${existing ? 'Modifica drill' : 'Nuovo drill'}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body form-grid">
        <div class="field full"><label>Titolo</label><input name="title" required value="${escapeAttr(drill.title)}" placeholder="es. Serve +1 sul lato aperto" /></div>
        <div class="field"><label>Area</label><select name="category">${optionsFromMap(categoryLabels, drill.category)}</select></div>
        <div class="field"><label>Focus</label><select name="focus">${optionsFromMap(focusLabels, drill.focus)}</select></div>
        <div class="field full"><label>Obiettivo</label><input name="objective" value="${escapeAttr(drill.objective)}" placeholder="Che cosa allena questo esercizio?" /></div>
        <div class="field"><label>Giocatori</label><input name="players" value="${escapeAttr(drill.players)}" placeholder="1, 2, 3…" /></div>
        <div class="field"><label>Durata standard (min)</label><input name="durationMin" type="number" min="0" step="1" value="${escapeAttr(drill.durationMin)}" /></div>
        <div class="field"><label>Intensità</label><select name="intensity">${optionsFromMap(intensityLabels, drill.intensity)}</select></div>
        <div class="field"><label>Materiale</label><input name="equipment" value="${escapeAttr(drill.equipment)}" placeholder="Cinesini, basket, target…" /></div>
        <div class="field full"><label>Setup</label><textarea name="setup" placeholder="Posizioni, feed, metà campo, numero palline…">${escapeHtml(drill.setup)}</textarea></div>
        <div class="field full"><label>Esecuzione</label><textarea name="execution" placeholder="Sequenza operativa dell'esercizio">${escapeHtml(drill.execution)}</textarea></div>
        <div class="field full"><label>Punteggio / criterio di successo</label><textarea name="scoring" placeholder="Come si misura o si rende competitivo?">${escapeHtml(drill.scoring)}</textarea></div>
        <div class="field full"><label>Vincoli</label><textarea name="constraints" placeholder="Direzioni obbligate, numero colpi, zone, seconda palla…">${escapeHtml(drill.constraints)}</textarea></div>
        <div class="field"><label>Progressione</label><textarea name="progression">${escapeHtml(drill.progression)}</textarea></div>
        <div class="field"><label>Regressione</label><textarea name="regression">${escapeHtml(drill.regression)}</textarea></div>
        <div class="field full"><label>Tag</label><input name="tags" value="${escapeAttr((drill.tags || []).join(', '))}" placeholder="serve+1, pressione, seconda…" /></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(drill.notes)}</textarea></div>
        <label class="field full drills-dialog-check"><input name="favorite" type="checkbox" ${drill.favorite ? 'checked' : ''} /> <span>Preferito</span></label>
      </div>
      <div class="dialog-actions">
        <div>${existing ? '<button class="button button-danger-ghost" id="delete-drill" type="button">Elimina</button>' : ''}</div>
        <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div>
      </div>
    </form>
  `;
  main.appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#drill-form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const normalized = {
      ...drill,
      ...data,
      id: existing?.id || makeId('drill'),
      durationMin: Number(data.durationMin || 0),
      favorite: form.elements.favorite.checked,
      tags: String(data.tags || '').split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.update(next => {
      const index = next.drills.library.findIndex(item => item.id === normalized.id);
      if (index >= 0) next.drills.library[index] = normalized;
      else next.drills.library.push(normalized);
    });
    dialog.close(); dialog.remove();
    ui.section = 'library';
    renderDrills({ main, title, store });
  });

  dialog.querySelector('#delete-drill')?.addEventListener('click', async () => {
    const used = state.drills.sessions.some(session => (session.items || []).some(item => item.drillId === existing.id));
    if (used) {
      await showInAppAlert('Questo drill è già usato in una o più sessioni. Rimuovilo dalle sessioni prima di eliminarlo.', { title: 'Drill in uso' });
      return;
    }
    const confirmed = await showInAppConfirm('Eliminare questo drill?', { title: 'Elimina drill', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(next => { next.drills.library = next.drills.library.filter(item => item.id !== existing.id); });
    dialog.close(); dialog.remove();
    ui.section = 'library';
    renderDrills({ main, title, store });
  });

  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function openSessionDialog({ main, title, store, sessionId = '' }) {
  const state = store.getState();
  const existing = sessionId ? state.drills.sessions.find(session => session.id === sessionId) : null;
  const session = existing || { title: '', date: todayKey(), location: '', coach: '', focus: 'tactical', objective: '', calendarEventId: '', notes: '', items: [] };
  const tennisEvents = (state.planner?.events || []).filter(event => event.category === 'tennis').sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog drills-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="drills-session-form">
      <div class="dialog-head"><div><div class="eyebrow">Session builder</div><h3>${existing ? 'Modifica sessione' : 'Nuova sessione'}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body form-grid">
        <div class="field full"><label>Titolo</label><input name="title" required value="${escapeAttr(session.title)}" placeholder="es. Tattica + sparring" /></div>
        <div class="field"><label>Data</label><input name="date" type="date" value="${escapeAttr(session.date)}" /></div>
        <div class="field"><label>Focus principale</label><select name="focus">${optionsFromMap(focusLabels, session.focus)}</select></div>
        <div class="field"><label>Luogo</label><input name="location" value="${escapeAttr(session.location)}" /></div>
        <div class="field"><label>Coach</label><input name="coach" value="${escapeAttr(session.coach)}" /></div>
        <div class="field full"><label>Evento Calendar collegato</label><select name="calendarEventId"><option value="">Nessuno</option>${tennisEvents.map(event => `<option value="${event.id}" ${session.calendarEventId === event.id ? 'selected' : ''}>${escapeHtml(event.date ? `${formatDate(event.date)} · ` : '')}${escapeHtml(event.title || 'Tennis')}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</option>`).join('')}</select></div>
        <div class="field full"><label>Obiettivo sessione</label><textarea name="objective">${escapeHtml(session.objective)}</textarea></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(session.notes)}</textarea></div>
      </div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div></div>
    </form>
  `;
  main.appendChild(dialog);
  bindDialogClose(dialog);

  const form = dialog.querySelector('#drills-session-form');
  const eventSelect = form.elements.calendarEventId;
  eventSelect.addEventListener('change', () => {
    const event = tennisEvents.find(row => row.id === eventSelect.value);
    if (!event) return;
    if (!form.elements.date.value) form.elements.date.value = event.date || '';
    if (!form.elements.location.value) form.elements.location.value = event.location || '';
    if (!form.elements.title.value) form.elements.title.value = event.title || 'Sessione tennis';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const normalized = {
      ...session,
      ...data,
      id: existing?.id || makeId('tennis-session'),
      items: existing?.items || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.update(next => {
      const index = next.drills.sessions.findIndex(item => item.id === normalized.id);
      if (index >= 0) next.drills.sessions[index] = normalized;
      else next.drills.sessions.push(normalized);
    });
    ui.selectedSessionId = normalized.id;
    ui.section = 'sessions';
    dialog.close(); dialog.remove();
    renderDrills({ main, title, store });
  });

  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function renderMeasurements(container, state, store) {
  const measurementState = state.drills.measurements || { protocols: [], records: [] };
  const protocols = measurementState.protocols || [];
  const records = measurementState.records || [];

  if (!ui.selectedMeasurementProtocolId || !protocols.some(protocol => protocol.id === ui.selectedMeasurementProtocolId)) {
    ui.selectedMeasurementProtocolId = protocols[0]?.id || '';
  }
  const selected = protocols.find(protocol => protocol.id === ui.selectedMeasurementProtocolId) || null;
  const selectedRecords = selected
    ? records.filter(record => record.protocolId === selected.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    : [];

  container.innerHTML = `
    <section class="drills-subhead">
      <div>
        <div class="eyebrow">Misurazioni</div>
        <h2>Test tennis-specifici ripetibili</h2>
        <p>Protocolli separati dai normali drill, pensati per essere ripetuti nel tempo con lo stesso formato e confrontati attraverso indicatori e grafici.</p>
      </div>
      <span class="drills-result-count">${protocols.length} protocolli · ${records.length} rilevazioni</span>
    </section>

    <section class="drills-measurements-layout">
      <aside class="panel drills-measurement-list-panel">
        <div class="panel-header"><h3>Protocolli</h3><p>Struttura stabile del test.</p></div>
        <div class="drills-measurement-list">
          ${protocols.length ? protocols.map(protocol => {
            const count = records.filter(record => record.protocolId === protocol.id).length;
            const last = records.filter(record => record.protocolId === protocol.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
            return `
              <button class="drills-measurement-list-item ${selected?.id === protocol.id ? 'active' : ''}" data-measurement-protocol="${protocol.id}" type="button">
                <div><strong>${escapeHtml(protocol.title)}</strong><span>${escapeHtml(categoryLabels[protocol.category] || 'Misurazione')}${last?.date ? ` · ultima ${formatDate(last.date)}` : ''}</span></div>
                <span>${count}</span>
              </button>`;
          }).join('') : `<div class="drills-empty-side"><strong>Nessun protocollo</strong><span>Crea un test ripetibile: servizio, risposta, precisione, consistenza o altro.</span></div>`}
        </div>
      </aside>

      <div class="drills-measurement-main">
        ${selected ? renderMeasurementDetail(selected, selectedRecords) : `
          <section class="panel drills-empty-panel">
            <div class="drills-empty-icon">◎</div>
            <h3>Crea il primo protocollo</h3>
            <p>Definisci una volta sola serie, target e criteri. Le rilevazioni successive useranno sempre la stessa struttura.</p>
            <button class="button button-primary" id="drills-empty-new-protocol" type="button">+ Nuovo protocollo</button>
          </section>`}
      </div>
    </section>
  `;

  container.querySelectorAll('[data-measurement-protocol]').forEach(button => button.addEventListener('click', () => {
    ui.selectedMeasurementProtocolId = button.dataset.measurementProtocol;
    renderMeasurements(container, store.getState(), store);
  }));

  container.querySelector('#drills-empty-new-protocol')?.addEventListener('click', () => openMeasurementProtocolDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store }));
  container.querySelector('#drills-edit-protocol')?.addEventListener('click', () => openMeasurementProtocolDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store, protocolId: selected.id }));
  container.querySelector('#drills-record-measurement')?.addEventListener('click', () => openMeasurementRecordDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store, protocolId: selected.id }));
  container.querySelectorAll('[data-measurement-metric]').forEach(button => button.addEventListener('click', () => {
    ui.measurementMetric = button.dataset.measurementMetric;
    renderMeasurements(container, store.getState(), store);
  }));
  container.querySelectorAll('[data-edit-measurement-record]').forEach(button => button.addEventListener('click', () => openMeasurementRecordDialog({ main: document.querySelector('#main-content'), title: document.querySelector('#page-title'), store, protocolId: selected.id, recordId: button.dataset.editMeasurementRecord })));
  container.querySelectorAll('[data-delete-measurement-record]').forEach(button => button.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm('Eliminare questa rilevazione?', { title: 'Elimina rilevazione', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    const recordId = button.dataset.deleteMeasurementRecord;
    store.update(next => { next.drills.measurements.records = next.drills.measurements.records.filter(record => record.id !== recordId); });
    renderMeasurements(container, store.getState(), store);
  }));
}

function renderMeasurementDetail(protocol, records) {
  const latest = records[0] || null;
  const latestSummary = latest ? summarizeMeasurementRecord(protocol, latest) : null;
  const latestBest = latest ? bestMeasurementItem(protocol, latest) : null;
  const totalAttempts = latestSummary?.attempts || 0;
  return `
    <section class="panel drills-measurement-detail">
      <div class="drills-session-builder-head">
        <div>
          <div class="eyebrow">${escapeHtml(categoryLabels[protocol.category] || 'Misurazione')}</div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>${escapeHtml(protocol.description || `${protocol.attemptsPerItem || 10} tentativi per serie · ${(protocol.items || []).length} serie`)}</p>
        </div>
        <div class="drills-session-actions">
          <button class="button button-ghost" id="drills-edit-protocol" type="button">Modifica protocollo</button>
          <button class="button button-primary" id="drills-record-measurement" type="button">+ Registra test</button>
        </div>
      </div>

      <div class="drills-measurement-kpis">
        <div><span>Rilevazioni</span><strong>${records.length}</strong></div>
        <div><span>Ultima accuracy</span><strong>${latestSummary ? `${formatPct(latestSummary.targetPct)}%` : '—'}</strong></div>
        <div><span>Ultimo in campo</span><strong>${latestSummary ? `${formatPct(latestSummary.inPlayPct)}%` : '—'}</strong></div>
        <div><span>Tentativi / test</span><strong>${totalAttempts || ((protocol.items || []).length * Number(protocol.attemptsPerItem || 0)) || '—'}</strong></div>
        <div><span>Miglior target</span><strong>${latestBest ? escapeHtml(latestBest.label) : '—'}</strong></div>
      </div>

      <div class="drills-measurement-chart-head">
        <div><h3>Andamento nel tempo</h3><p>Confronto omogeneo tra rilevazioni dello stesso protocollo.</p></div>
        <div class="drills-measurement-metric-switch" role="group" aria-label="Metrica grafico">
          <button class="${ui.measurementMetric === 'target' ? 'active' : ''}" data-measurement-metric="target" type="button">Accuracy target</button>
          <button class="${ui.measurementMetric === 'inplay' ? 'active' : ''}" data-measurement-metric="inplay" type="button">Ball in</button>
        </div>
      </div>
      <div class="drills-measurement-chart-wrap">
        ${records.length ? renderMeasurementChart(protocol, [...records].reverse(), ui.measurementMetric) : emptyInline('Ancora nessuna rilevazione.', 'Registra il primo test per iniziare a costruire la serie storica.')}
      </div>

      ${latest ? renderMeasurementLatest(protocol, latest) : ''}

      <div class="drills-measurement-history">
        <div class="panel-header"><h3>Storico rilevazioni</h3><p>${records.length ? 'Apri una rilevazione per correggerla oppure confronta i valori nel grafico.' : 'Nessuna rilevazione salvata.'}</p></div>
        ${records.length ? records.map(record => {
          const summary = summarizeMeasurementRecord(protocol, record);
          return `
            <div class="drills-measurement-history-row">
              <div><strong>${formatDate(record.date)}</strong><span>${record.notes ? escapeHtml(record.notes) : '—'}</span></div>
              <div class="drills-measurement-history-metrics"><span>Target <strong>${formatPct(summary.targetPct)}%</strong></span><span>In campo <strong>${formatPct(summary.inPlayPct)}%</strong></span></div>
              <div class="drills-measurement-history-actions"><button class="button button-ghost economics-small-button" data-edit-measurement-record="${record.id}" type="button">Modifica</button><button class="button button-danger-ghost economics-small-button" data-delete-measurement-record="${record.id}" type="button">Elimina</button></div>
            </div>`;
        }).join('') : ''}
      </div>
    </section>
  `;
}

function renderMeasurementLatest(protocol, record) {
  const grouped = groupProtocolItems(protocol);
  const byId = new Map((record.entries || []).map(entry => [entry.itemId, entry]));
  const labels = protocol.outcomes || { target: 'Al target', secondary: 'Dentro ma fuori target', fail: 'Fuori / rete' };
  return `
    <section class="drills-measurement-latest">
      <div class="panel-header"><h3>Ultima rilevazione · ${formatDate(record.date)}</h3><p>${escapeHtml(record.notes || 'Dettaglio per serie / target.')}</p></div>
      <div class="drills-measurement-table-wrap">
        <table class="drills-measurement-table">
          <thead><tr><th>Gruppo</th><th>Serie / target</th><th>${escapeHtml(labels.target)}</th><th>${escapeHtml(labels.secondary)}</th><th>${escapeHtml(labels.fail)}</th><th>Accuracy</th><th>In campo</th></tr></thead>
          <tbody>
            ${grouped.flatMap(group => group.items.map((item, index) => {
              const entry = byId.get(item.id) || { target: 0, secondary: 0, fail: 0 };
              const total = Number(entry.target || 0) + Number(entry.secondary || 0) + Number(entry.fail || 0);
              const targetPct = total ? (Number(entry.target || 0) / total) * 100 : 0;
              const inPct = total ? ((Number(entry.target || 0) + Number(entry.secondary || 0)) / total) * 100 : 0;
              return `<tr>${index === 0 ? `<td rowspan="${group.items.length}"><strong>${escapeHtml(group.label)}</strong></td>` : ''}<td>${escapeHtml(item.label)}</td><td>${Number(entry.target || 0)}</td><td>${Number(entry.secondary || 0)}</td><td>${Number(entry.fail || 0)}</td><td>${formatPct(targetPct)}%</td><td>${formatPct(inPct)}%</td></tr>`;
            })).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMeasurementChart(protocol, records, metric) {
  const width = 760;
  const height = 250;
  const pad = { left: 44, right: 18, top: 20, bottom: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const groups = groupProtocolItems(protocol);
  const series = [
    { key: 'overall', label: 'Totale', className: 'series-0' },
    ...groups.slice(0, 4).map((group, index) => ({ key: group.label, label: group.label, className: `series-${index + 1}` })),
  ];
  const x = index => records.length <= 1 ? pad.left + innerW / 2 : pad.left + (index / (records.length - 1)) * innerW;
  const y = value => pad.top + innerH - (Math.max(0, Math.min(100, value)) / 100) * innerH;
  const grid = [0, 25, 50, 75, 100].map(value => `<g><line x1="${pad.left}" y1="${y(value)}" x2="${width - pad.right}" y2="${y(value)}" class="measure-grid-line"/><text x="${pad.left - 8}" y="${y(value) + 4}" text-anchor="end" class="measure-axis-label">${value}%</text></g>`).join('');

  const paths = series.map(seriesRow => {
    const values = records.map(record => {
      if (seriesRow.key === 'overall') {
        const summary = summarizeMeasurementRecord(protocol, record);
        return metric === 'inplay' ? summary.inPlayPct : summary.targetPct;
      }
      const summary = summarizeMeasurementGroup(protocol, record, seriesRow.key);
      return metric === 'inplay' ? summary.inPlayPct : summary.targetPct;
    });
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
    return `<polyline points="${points}" class="measure-series ${seriesRow.className}" fill="none"/>${values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" class="measure-dot ${seriesRow.className}"><title>${escapeHtml(seriesRow.label)} · ${formatDate(records[index].date)} · ${formatPct(value)}%</title></circle>`).join('')}`;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(records.length / 6));
  const labels = records.map((record, index) => (index % labelEvery === 0 || index === records.length - 1) ? `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" class="measure-axis-label">${escapeHtml(shortDate(record.date))}</text>` : '').join('');
  const legend = series.map(row => `<span><i class="${row.className}"></i>${escapeHtml(row.label)}</span>`).join('');
  return `
    <div class="drills-measurement-legend">${legend}</div>
    <svg class="drills-measurement-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento ${metric === 'inplay' ? 'palle in campo' : 'accuracy al target'} nel tempo">
      ${grid}${paths}${labels}
    </svg>
  `;
}

function openMeasurementProtocolDialog({ main, title, store, protocolId = '' }) {
  const state = store.getState();
  const existing = protocolId ? (state.drills.measurements?.protocols || []).find(protocol => protocol.id === protocolId) : null;
  const protocol = existing || {
    title: '', category: 'serve', description: '', attemptsPerItem: 10,
    outcomes: { target: 'Al target', secondary: 'Dentro ma fuori target', fail: 'Fuori / rete' }, items: [], notes: '',
  };
  const lines = (protocol.items || []).map(item => `${item.group || 'Generale'} | ${item.label}`).join('\n');
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog drills-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="measurement-protocol-form">
      <div class="dialog-head"><div><div class="eyebrow">Misurazioni</div><h3>${existing ? 'Modifica protocollo' : 'Nuovo protocollo'}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body form-grid">
        <div class="field full"><label>Nome del test</label><input name="title" required value="${escapeAttr(protocol.title)}" placeholder="es. Precisione servizio — 6 target" /></div>
        <div class="field"><label>Area</label><select name="category">${optionsFromMap(categoryLabels, protocol.category)}</select></div>
        <div class="field"><label>Tentativi per serie / target</label><input name="attemptsPerItem" type="number" min="1" max="999" required value="${Number(protocol.attemptsPerItem || 10)}" /></div>
        <div class="field full"><label>Descrizione / istruzioni</label><textarea name="description" placeholder="Condizioni da mantenere uguali a ogni rilevazione…">${escapeHtml(protocol.description)}</textarea></div>
        <div class="field"><label>Esito 1 — successo</label><input name="targetLabel" value="${escapeAttr(protocol.outcomes?.target || 'Al target')}" /></div>
        <div class="field"><label>Esito 2 — valido</label><input name="secondaryLabel" value="${escapeAttr(protocol.outcomes?.secondary || 'Dentro ma fuori target')}" /></div>
        <div class="field"><label>Esito 3 — errore</label><input name="failLabel" value="${escapeAttr(protocol.outcomes?.fail || 'Fuori / rete')}" /></div>
        <div class="field full"><label>Serie / target</label><textarea name="items" required rows="8" placeholder="Una riga per serie, nel formato Gruppo | Target\nDa destra | T\nDa destra | Body\nDa sinistra | A uscire">${escapeHtml(lines)}</textarea><small>Il gruppo è libero: lato, colpo, situazione, ecc. Usa una riga per ogni serie da misurare.</small></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(protocol.notes || '')}</textarea></div>
      </div>
      <div class="dialog-actions"><div>${existing ? '<button class="button button-danger-ghost" id="delete-measurement-protocol" type="button">Elimina</button>' : ''}</div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div></div>
    </form>`;
  main.appendChild(dialog);
  bindDialogClose(dialog);
  const form = dialog.querySelector('#measurement-protocol-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const parsedItems = parseProtocolItems(data.items, existing?.items || []);
    if (!parsedItems.length) { await showInAppAlert('Inserisci almeno una serie / target.', { title: 'Protocollo incompleto' }); return; }
    const normalized = {
      ...protocol,
      id: existing?.id || makeId('measurement-protocol'),
      title: String(data.title || '').trim(),
      category: data.category || 'mixed',
      description: String(data.description || '').trim(),
      attemptsPerItem: Math.max(1, Number(data.attemptsPerItem || 10)),
      outcomes: {
        target: String(data.targetLabel || 'Al target').trim(),
        secondary: String(data.secondaryLabel || 'Dentro ma fuori target').trim(),
        fail: String(data.failLabel || 'Fuori / rete').trim(),
      },
      items: parsedItems,
      notes: String(data.notes || '').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.update(next => {
      next.drills.measurements ||= { protocols: [], records: [] };
      const index = next.drills.measurements.protocols.findIndex(item => item.id === normalized.id);
      if (index >= 0) next.drills.measurements.protocols[index] = normalized;
      else next.drills.measurements.protocols.push(normalized);
    });
    ui.selectedMeasurementProtocolId = normalized.id;
    ui.section = 'measurements';
    dialog.close(); dialog.remove();
    renderDrills({ main, title, store });
  });
  dialog.querySelector('#delete-measurement-protocol')?.addEventListener('click', async () => {
    const records = state.drills.measurements?.records || [];
    if (records.some(record => record.protocolId === existing.id)) {
      await showInAppAlert('Questo protocollo contiene rilevazioni. Elimina prima lo storico associato.', { title: 'Protocollo in uso' });
      return;
    }
    const confirmed = await showInAppConfirm('Eliminare questo protocollo?', { title: 'Elimina protocollo', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(next => { next.drills.measurements.protocols = next.drills.measurements.protocols.filter(item => item.id !== existing.id); });
    ui.selectedMeasurementProtocolId = '';
    dialog.close(); dialog.remove();
    renderDrills({ main, title, store });
  });
  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function openMeasurementRecordDialog({ main, title, store, protocolId, recordId = '' }) {
  const state = store.getState();
  const protocol = (state.drills.measurements?.protocols || []).find(item => item.id === protocolId);
  if (!protocol) return;
  const existing = recordId ? (state.drills.measurements?.records || []).find(record => record.id === recordId) : null;
  const byId = new Map((existing?.entries || []).map(entry => [entry.itemId, entry]));
  const labels = protocol.outcomes || { target: 'Al target', secondary: 'Dentro ma fuori target', fail: 'Fuori / rete' };
  const groups = groupProtocolItems(protocol);
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog drills-dialog drills-measurement-record-dialog';
  dialog.innerHTML = `
    <form method="dialog" id="measurement-record-form">
      <div class="dialog-head"><div><div class="eyebrow">${escapeHtml(protocol.title)}</div><h3>${existing ? 'Modifica rilevazione' : 'Nuova rilevazione'}</h3><p>${Number(protocol.attemptsPerItem || 0)} tentativi per serie / target.</p></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body">
        <div class="form-grid measurement-record-meta"><div class="field"><label>Data</label><input name="date" type="date" required value="${escapeAttr(existing?.date || todayKey())}" /></div><div class="field"><label>Note</label><input name="notes" value="${escapeAttr(existing?.notes || '')}" placeholder="Condizioni, palline, fatica…" /></div></div>
        <div class="drills-measurement-entry-table-wrap">
          <table class="drills-measurement-entry-table">
            <thead><tr><th>Gruppo</th><th>Serie / target</th><th>${escapeHtml(labels.target)}</th><th>${escapeHtml(labels.secondary)}</th><th>${escapeHtml(labels.fail)}</th><th>Tot.</th></tr></thead>
            <tbody>
              ${groups.flatMap(group => group.items.map((item, index) => {
                const entry = byId.get(item.id) || {};
                return `<tr>${index === 0 ? `<td rowspan="${group.items.length}"><strong>${escapeHtml(group.label)}</strong></td>` : ''}<td>${escapeHtml(item.label)}</td><td><input data-measure-entry="${item.id}" data-outcome="target" type="number" min="0" max="${Number(protocol.attemptsPerItem || 10)}" value="${Number(entry.target || 0)}" /></td><td><input data-measure-entry="${item.id}" data-outcome="secondary" type="number" min="0" max="${Number(protocol.attemptsPerItem || 10)}" value="${Number(entry.secondary || 0)}" /></td><td><input data-measure-entry="${item.id}" data-outcome="fail" type="number" min="0" max="${Number(protocol.attemptsPerItem || 10)}" value="${Number(entry.fail || 0)}" /></td><td><strong data-measure-total="${item.id}">0 / ${Number(protocol.attemptsPerItem || 10)}</strong></td></tr>`;
              })).join('')}
            </tbody>
          </table>
        </div>
        <p class="drills-measurement-validation" id="measurement-validation" aria-live="polite"></p>
      </div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva rilevazione</button></div></div>
    </form>`;
  main.appendChild(dialog);
  bindDialogClose(dialog);
  const form = dialog.querySelector('#measurement-record-form');
  const refreshTotals = () => {
    (protocol.items || []).forEach(item => {
      const inputs = [...dialog.querySelectorAll(`[data-measure-entry="${cssEscape(item.id)}"]`)];
      const total = inputs.reduce((sum, input) => sum + Math.max(0, Number(input.value || 0)), 0);
      const target = dialog.querySelector(`[data-measure-total="${cssEscape(item.id)}"]`);
      if (target) { target.textContent = `${total} / ${Number(protocol.attemptsPerItem || 10)}`; target.classList.toggle('invalid', total !== Number(protocol.attemptsPerItem || 10)); }
    });
  };
  dialog.querySelectorAll('[data-measure-entry]').forEach(input => input.addEventListener('input', refreshTotals));
  refreshTotals();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const expected = Number(protocol.attemptsPerItem || 10);
    const entries = (protocol.items || []).map(item => {
      const getValue = outcome => Number(dialog.querySelector(`[data-measure-entry="${cssEscape(item.id)}"][data-outcome="${outcome}"]`)?.value || 0);
      return { itemId: item.id, target: getValue('target'), secondary: getValue('secondary'), fail: getValue('fail') };
    });
    const invalid = entries.filter(entry => entry.target + entry.secondary + entry.fail !== expected);
    const validation = dialog.querySelector('#measurement-validation');
    if (invalid.length) {
      validation.textContent = `Ogni riga deve totalizzare ${expected} tentativi. Controlla ${invalid.length} ${invalid.length === 1 ? 'riga' : 'righe'}.`;
      return;
    }
    const normalized = {
      id: existing?.id || makeId('measurement-record'),
      protocolId: protocol.id,
      date: form.elements.date.value,
      notes: String(form.elements.notes.value || '').trim(),
      entries,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.update(next => {
      next.drills.measurements ||= { protocols: [], records: [] };
      const index = next.drills.measurements.records.findIndex(record => record.id === normalized.id);
      if (index >= 0) next.drills.measurements.records[index] = normalized;
      else next.drills.measurements.records.push(normalized);
    });
    ui.selectedMeasurementProtocolId = protocol.id;
    ui.section = 'measurements';
    dialog.close(); dialog.remove();
    renderDrills({ main, title, store });
  });
  dialog.addEventListener('close', () => { if (dialog.isConnected) dialog.remove(); });
  dialog.showModal();
}

function parseProtocolItems(text, existingItems = []) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split('|').map(part => part.trim());
    const group = parts.length > 1 ? parts.shift() : 'Generale';
    const label = parts.join(' | ').trim() || group;
    return { id: existingItems[index]?.id || makeId('measure-item'), group: parts.length || line.includes('|') ? group : 'Generale', label };
  });
}

function groupProtocolItems(protocol) {
  const groups = [];
  const map = new Map();
  (protocol.items || []).forEach(item => {
    const label = item.group || 'Generale';
    if (!map.has(label)) { const group = { label, items: [] }; map.set(label, group); groups.push(group); }
    map.get(label).items.push(item);
  });
  return groups;
}

function summarizeMeasurementRecord(protocol, record) {
  const entries = record.entries || [];
  const totals = entries.reduce((acc, entry) => {
    acc.target += Number(entry.target || 0);
    acc.secondary += Number(entry.secondary || 0);
    acc.fail += Number(entry.fail || 0);
    return acc;
  }, { target: 0, secondary: 0, fail: 0 });
  const attempts = totals.target + totals.secondary + totals.fail;
  return { ...totals, attempts, targetPct: attempts ? (totals.target / attempts) * 100 : 0, inPlayPct: attempts ? ((totals.target + totals.secondary) / attempts) * 100 : 0 };
}

function summarizeMeasurementGroup(protocol, record, groupLabel) {
  const ids = new Set((protocol.items || []).filter(item => (item.group || 'Generale') === groupLabel).map(item => item.id));
  const entries = (record.entries || []).filter(entry => ids.has(entry.itemId));
  const totals = entries.reduce((acc, entry) => {
    acc.target += Number(entry.target || 0); acc.secondary += Number(entry.secondary || 0); acc.fail += Number(entry.fail || 0); return acc;
  }, { target: 0, secondary: 0, fail: 0 });
  const attempts = totals.target + totals.secondary + totals.fail;
  return { ...totals, attempts, targetPct: attempts ? (totals.target / attempts) * 100 : 0, inPlayPct: attempts ? ((totals.target + totals.secondary) / attempts) * 100 : 0 };
}

function bestMeasurementItem(protocol, record) {
  const byId = new Map((record.entries || []).map(entry => [entry.itemId, entry]));
  return (protocol.items || []).map(item => {
    const entry = byId.get(item.id) || { target: 0, secondary: 0, fail: 0 };
    const attempts = Number(entry.target || 0) + Number(entry.secondary || 0) + Number(entry.fail || 0);
    return { label: `${item.group || 'Generale'} · ${item.label}`, targetPct: attempts ? (Number(entry.target || 0) / attempts) * 100 : -1 };
  }).sort((a, b) => b.targetPct - a.targetPct)[0] || null;
}

function formatPct(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace('.', ',');
}

function shortDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function usageMap(sessions) {
  const map = new Map();
  sessions.forEach(session => (session.items || []).forEach(item => map.set(item.drillId, (map.get(item.drillId) || 0) + 1)));
  return map;
}

function sessionDuration(session) {
  return (session.items || []).reduce((sum, item) => sum + Number(item.durationMin || 0), 0);
}

function sessionDateSort(a, b) {
  const ad = a.date || '9999-12-31';
  const bd = b.date || '9999-12-31';
  return ad.localeCompare(bd) || String(a.title || '').localeCompare(String(b.title || ''));
}

function optionsFromMap(map, selected) {
  return Object.entries(map).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function formatMinutes(minutes) {
  const value = Number(minutes || 0);
  if (!value) return '0 min';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function bindDialogClose(dialog) {
  dialog.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
}

function emptyInline(title, copy) {
  return `<div class="drills-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
}

function emptyPanel(title, copy) {
  return `<article class="panel drills-empty-panel"><div class="panel-body">${emptyInline(title, copy)}</div></article>`;
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}
