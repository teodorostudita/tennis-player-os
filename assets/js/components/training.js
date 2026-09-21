import { showInAppConfirm } from '../ui/inAppMessages.js';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'tests', label: 'Tests & Assessments' },
  { id: 'weekly', label: 'Programma settimanale' },
  { id: 'goals', label: 'Obiettivi' },
];

const areaLabels = {
  general: 'Generale',
  shoulder: 'Spalla / scapola',
  core: 'Core',
  hip: 'Anca',
  knee: 'Ginocchio',
  ankle: 'Caviglia / piede',
  strength: 'Forza',
  power: 'Potenza',
  speed: 'Velocità',
  agility: 'Agilità',
  mobility: 'Mobilità',
  balance: 'Equilibrio / controllo',
  conditioning: 'Conditioning',
  other: 'Altro',
};

const blockLabels = {
  warmup: 'Warm-up',
  strength: 'Forza',
  power: 'Potenza',
  speed: 'Velocità',
  agility: 'Agilità',
  conditioning: 'Conditioning',
  mobility: 'Mobilità',
  prevention: 'Prevenzione',
  recovery: 'Defaticamento',
  other: 'Altro',
};

const goalHorizonLabels = {
  short: 'Breve periodo',
  medium: 'Medio periodo',
  long: 'Lungo periodo',
};

const goalStatusLabels = {
  active: 'Attivo',
  achieved: 'Raggiunto',
  paused: 'In pausa',
};

const days = [
  { id: 0, short: 'Lun', label: 'Lunedì' },
  { id: 1, short: 'Mar', label: 'Martedì' },
  { id: 2, short: 'Mer', label: 'Mercoledì' },
  { id: 3, short: 'Gio', label: 'Giovedì' },
  { id: 4, short: 'Ven', label: 'Venerdì' },
  { id: 5, short: 'Sab', label: 'Sabato' },
  { id: 6, short: 'Dom', label: 'Domenica' },
];

const ui = {
  section: 'overview',
  selectedTestId: '',
};

export function renderTraining({ main, title, store }) {
  title.textContent = '2. Athletics';
  const state = store.getState();
  const training = state.training;

  if (!ui.selectedTestId || !training.tests.some(t => t.id === ui.selectedTestId)) {
    ui.selectedTestId = training.tests[0]?.id || '';
  }

  main.innerHTML = `
    <section class="training-module-head">
      <div>
        <div class="eyebrow">Preparazione atletica</div>
        <h2>Athletics</h2>
        <p>Test fisici, programma settimanale e obiettivi della preparazione atletica. Il lavoro tecnico-tattico con racchetta e palla resta in Drills.</p>
      </div>
      <div class="training-section-switch" role="tablist" aria-label="Sezioni Athletics">
        ${sections.map(section => `
          <button class="training-section-button ${ui.section === section.id ? 'active' : ''}" data-training-section="${section.id}" type="button">${section.label}</button>
        `).join('')}
      </div>
    </section>
    <div id="training-section-content"></div>
  `;

  const content = main.querySelector('#training-section-content');
  if (ui.section === 'tests') renderTests(content, training, store);
  else if (ui.section === 'weekly') renderWeeklyProgram(content, training, store);
  else if (ui.section === 'goals') renderGoals(content, training, store);
  else renderOverview(content, training);

  main.querySelectorAll('[data-training-section]').forEach(button => {
    button.addEventListener('click', () => {
      ui.section = button.dataset.trainingSection;
      renderTraining({ main, title, store });
    });
  });
}

function renderOverview(container, training) {
  const results = [...training.testResults].sort((a, b) => a.date.localeCompare(b.date));
  const activeGoals = training.goals.filter(goal => goal.status === 'active');
  const sessions = [...training.weeklyProgram.sessions].sort(sessionSort);
  const totalMinutes = sessions.reduce((sum, session) => sum + sessionDuration(session), 0);
  const latestDate = results.at(-1)?.date || '';
  const testsWithData = training.tests.filter(test => results.some(result => result.testId === test.id));
  const recentTests = testsWithData
    .map(test => ({ test, results: results.filter(result => result.testId === test.id) }))
    .sort((a, b) => (b.results.at(-1)?.date || '').localeCompare(a.results.at(-1)?.date || ''))
    .slice(0, 6);

  container.innerHTML = `
    <section class="training-kpis">
      <article class="training-kpi"><span>Test definiti</span><strong>${training.tests.length}</strong></article>
      <article class="training-kpi"><span>Ultima valutazione</span><strong>${latestDate ? formatDate(latestDate) : '—'}</strong></article>
      <article class="training-kpi"><span>Sessioni / settimana</span><strong>${sessions.length}</strong></article>
      <article class="training-kpi"><span>Volume previsto</span><strong>${formatMinutes(totalMinutes)}</strong></article>
      <article class="training-kpi"><span>Obiettivi attivi</span><strong>${activeGoals.length}</strong></article>
    </section>

    <section class="training-overview-grid">
      <article class="panel training-overview-panel">
        <div class="panel-header">
          <h3>Programma settimanale</h3>
          <p>Vista sintetica delle sessioni di preparazione atletica.</p>
        </div>
        <div class="panel-body training-week-overview">
          ${sessions.length ? days.map(day => {
            const daySessions = sessions.filter(session => Number(session.dayIndex) === day.id);
            return `
              <div class="training-overview-day ${daySessions.length ? '' : 'empty'}">
                <div class="training-overview-day-label">${day.short}</div>
                <div class="training-overview-day-content">
                  ${daySessions.length ? daySessions.map(session => `
                    <div class="training-overview-session">
                      <strong>${escapeHtml(session.title || 'Sessione')}</strong>
                      <span>${escapeHtml(session.startTime || '')}${session.startTime && session.endTime ? '–' : ''}${escapeHtml(session.endTime || '')}${session.focus ? ` · ${escapeHtml(session.focus)}` : ''}</span>
                    </div>
                  `).join('') : '<span class="training-muted">—</span>'}
                </div>
              </div>
            `;
          }).join('') : renderEmptyInline('Nessuna sessione programmata.', 'Apri “Programma settimanale” per costruire la settimana atletica.')}
        </div>
      </article>

      <article class="panel training-overview-panel">
        <div class="panel-header">
          <h3>Obiettivi attivi</h3>
          <p>Breve, medio e lungo periodo.</p>
        </div>
        <div class="panel-body training-goal-overview-list">
          ${activeGoals.length ? activeGoals
            .sort((a, b) => horizonOrder(a.horizon) - horizonOrder(b.horizon))
            .slice(0, 6)
            .map(goal => `
              <div class="training-goal-overview-row">
                <span class="training-horizon-badge horizon-${goal.horizon}">${goalHorizonLabels[goal.horizon] || 'Obiettivo'}</span>
                <div>
                  <strong>${escapeHtml(goal.title)}</strong>
                  <span>${escapeHtml(areaLabels[goal.area] || goal.area || 'Generale')}${goal.targetDate ? ` · entro ${formatDate(goal.targetDate)}` : ''}</span>
                </div>
              </div>
            `).join('') : renderEmptyInline('Nessun obiettivo attivo.', 'Gli obiettivi collegano il programma ai test di verifica.')}
        </div>
      </article>
    </section>

    <section class="panel training-progress-panel">
      <div class="panel-header">
        <h3>Ultimi test</h3>
        <p>L’ultimo dato disponibile e il cambiamento rispetto alla misurazione precedente.</p>
      </div>
      <div class="panel-body">
        ${recentTests.length ? `
          <div class="training-progress-grid">
            ${recentTests.map(({ test, results: testResults }) => renderOverviewTestCard(test, testResults)).join('')}
          </div>
        ` : renderEmptyInline('Ancora nessun risultato registrato.', 'Crea un test e inserisci le prime misurazioni per iniziare a costruire lo storico.')}
      </div>
    </section>
  `;
}

function renderOverviewTestCard(test, results) {
  const latest = results.at(-1);
  const previous = results.at(-2);
  const latestDisplay = resultDisplay(test, latest);
  const delta = resultDelta(test, latest, previous);
  return `
    <article class="training-progress-card">
      <div class="training-progress-topline">
        <span>${escapeHtml(areaLabels[test.area] || test.area || 'Generale')}</span>
        <span>${formatDate(latest.date)}</span>
      </div>
      <h4>${escapeHtml(test.name)}</h4>
      <div class="training-progress-value">${latestDisplay}</div>
      ${delta ? `<div class="training-progress-delta ${delta.className}">${escapeHtml(delta.text)}</div>` : '<div class="training-progress-delta neutral">Prima misurazione</div>'}
    </article>
  `;
}

function renderTests(container, training, store) {
  const selectedTest = training.tests.find(test => test.id === ui.selectedTestId);
  const selectedResults = selectedTest
    ? training.testResults.filter(result => result.testId === selectedTest.id).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  container.innerHTML = `
    <section class="training-subhead">
      <div>
        <div class="eyebrow">Tests & Assessments</div>
        <h2>Valutazioni fisiche</h2>
        <p>Definisci i test una volta e registra le misurazioni nel tempo. Ogni grafico confronta sempre lo stesso test.</p>
      </div>
      <button class="button button-primary" id="add-training-test" type="button">+ Nuovo test</button>
    </section>

    <section class="training-tests-layout">
      <aside class="panel training-test-library">
        <div class="panel-header">
          <h3>Libreria test</h3>
          <p>${training.tests.length} ${training.tests.length === 1 ? 'test definito' : 'test definiti'}</p>
        </div>
        <div class="training-test-list">
          ${training.tests.length ? training.tests.map(test => {
            const count = training.testResults.filter(result => result.testId === test.id).length;
            return `
              <button class="training-test-list-item ${test.id === ui.selectedTestId ? 'active' : ''}" data-test-id="${escapeAttr(test.id)}" type="button">
                <div>
                  <strong>${escapeHtml(test.name)}</strong>
                  <span>${escapeHtml(areaLabels[test.area] || test.area || 'Generale')}</span>
                </div>
                <span class="training-test-count">${count}</span>
              </button>
            `;
          }).join('') : `
            <div class="training-empty-side">
              <strong>Nessun test</strong>
              <span>Inizia creando il primo protocollo di valutazione.</span>
            </div>
          `}
        </div>
      </aside>

      <div class="training-tests-main">
        ${selectedTest ? renderSelectedTest(selectedTest, selectedResults) : `
          <section class="panel training-empty-panel">
            <div class="training-empty-icon">↗</div>
            <h3>Crea il primo test</h3>
            <p>Può essere generale o riferito a un distretto/capacità specifica, con misurazione singola o bilaterale.</p>
            <button class="button button-primary" id="empty-add-training-test" type="button">+ Nuovo test</button>
          </section>
        `}
      </div>
    </section>

    ${renderTestDialog(training)}
    ${selectedTest ? renderResultDialog(selectedTest) : ''}
  `;

  container.querySelectorAll('[data-test-id]').forEach(button => {
    button.addEventListener('click', () => {
      ui.selectedTestId = button.dataset.testId;
      renderTests(container, store.getState().training, store);
    });
  });

  const openNewTest = () => openTestDialog(container, store);
  container.querySelector('#add-training-test')?.addEventListener('click', openNewTest);
  container.querySelector('#empty-add-training-test')?.addEventListener('click', openNewTest);

  if (selectedTest) {
    container.querySelector('#edit-training-test')?.addEventListener('click', () => openTestDialog(container, store, selectedTest));
    container.querySelector('#add-test-result')?.addEventListener('click', () => openResultDialog(container, store, selectedTest));
    container.querySelectorAll('[data-delete-result]').forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await showInAppConfirm('Eliminare questa misurazione?', { title: 'Elimina misurazione', confirmLabel: 'Elimina', danger: true });
        if (!confirmed) return;
        const resultId = button.dataset.deleteResult;
        store.update(state => {
          state.training.testResults = state.training.testResults.filter(result => result.id !== resultId);
        });
        renderTests(container, store.getState().training, store);
      });
    });
  }
}

function renderSelectedTest(test, results) {
  const latest = results.at(-1);
  const previous = results.at(-2);
  const delta = resultDelta(test, latest, previous);
  return `
    <section class="panel training-test-detail">
      <div class="training-test-detail-head">
        <div>
          <div class="training-chip-row">
            <span class="training-area-chip">${escapeHtml(areaLabels[test.area] || test.area || 'Generale')}</span>
            <span class="training-area-chip subtle">${test.bilateral ? 'Bilaterale' : 'Misura singola'}</span>
          </div>
          <h3>${escapeHtml(test.name)}</h3>
          <p>${escapeHtml(test.description || 'Nessuna descrizione.')}</p>
        </div>
        <div class="training-detail-actions">
          <button class="button button-ghost" id="edit-training-test" type="button">Modifica test</button>
          <button class="button button-primary" id="add-test-result" type="button">+ Misurazione</button>
        </div>
      </div>

      <div class="training-test-meta">
        <div><span>Unità</span><strong>${escapeHtml(test.unit || '—')}</strong></div>
        <div><span>Direzione</span><strong>${test.direction === 'lower' ? 'Più basso = meglio' : test.direction === 'higher' ? 'Più alto = meglio' : 'Neutra'}</strong></div>
        <div><span>Target</span><strong>${test.targetValue !== '' && test.targetValue != null ? `${escapeHtml(test.targetValue)} ${escapeHtml(test.unit || '')}` : '—'}</strong></div>
        <div><span>Misurazioni</span><strong>${results.length}</strong></div>
      </div>

      <div class="training-chart-wrap">
        ${results.length ? renderTestChart(test, results) : renderEmptyInline('Nessun dato ancora.', 'Registra la prima misurazione per iniziare il grafico.')}
      </div>

      ${latest ? `
        <div class="training-latest-strip">
          <div><span>Ultimo dato</span><strong>${resultDisplay(test, latest)}</strong></div>
          <div><span>Data</span><strong>${formatDate(latest.date)}</strong></div>
          <div><span>Andamento</span><strong class="${delta?.className || 'neutral'}">${escapeHtml(delta?.text || 'Prima misurazione')}</strong></div>
          ${test.bilateral ? `<div><span>Asimmetria</span><strong>${formatAsymmetry(latest)}</strong></div>` : ''}
        </div>
      ` : ''}
    </section>

    <section class="panel training-results-panel">
      <div class="panel-header"><h3>Storico misurazioni</h3><p>Dati grezzi del test selezionato.</p></div>
      <div class="training-results-scroll">
        ${results.length ? `
          <table class="training-table">
            <thead><tr>
              <th>Data</th>
              ${test.bilateral ? '<th>Sinistra</th><th>Destra</th><th>Asimmetria</th>' : '<th>Valore</th>'}
              <th>Valutatore</th><th>Note</th><th></th>
            </tr></thead>
            <tbody>
              ${[...results].reverse().map(result => `
                <tr>
                  <td>${formatDate(result.date)}</td>
                  ${test.bilateral
                    ? `<td>${formatNumeric(result.leftValue)} ${escapeHtml(test.unit || '')}</td><td>${formatNumeric(result.rightValue)} ${escapeHtml(test.unit || '')}</td><td>${formatAsymmetry(result)}</td>`
                    : `<td>${formatNumeric(result.value)} ${escapeHtml(test.unit || '')}</td>`}
                  <td>${escapeHtml(result.evaluator || '—')}</td>
                  <td>${escapeHtml(result.notes || '—')}</td>
                  <td><button class="training-icon-danger" data-delete-result="${escapeAttr(result.id)}" type="button" title="Elimina">×</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="training-results-empty">Nessuna misurazione registrata.</div>'}
      </div>
    </section>
  `;
}

function renderTestDialog(training) {
  return `
    <dialog class="planner-dialog" id="training-test-dialog">
      <form method="dialog" id="training-test-form">
        <div class="dialog-head">
          <div><div class="eyebrow">Test fisico</div><h3 id="training-test-dialog-title">Nuovo test</h3></div>
          <button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body">
          <input type="hidden" name="id" />
          <div class="form-grid">
            <div class="field full"><label>Nome del test</label><input name="name" required placeholder="es. CMJ, sprint 10 m, rotazione spalla..." /></div>
            <div class="field"><label>Area / capacità</label><select name="area">${areaOptions()}</select></div>
            <div class="field"><label>Tipo di misura</label><select name="bilateral"><option value="false">Singola</option><option value="true">Bilaterale Dx/Sx</option></select></div>
            <div class="field"><label>Unità</label><input name="unit" placeholder="cm, s, kg, reps, °..." /></div>
            <div class="field"><label>Interpretazione</label><select name="direction"><option value="higher">Più alto = meglio</option><option value="lower">Più basso = meglio</option><option value="neutral">Neutra / descrittiva</option></select></div>
            <div class="field"><label>Target personale</label><input name="targetValue" type="number" step="any" placeholder="opzionale" /></div>
            <div class="field full"><label>Descrizione / protocollo</label><textarea name="description" placeholder="Come viene eseguito il test, posizione, attrezzatura, condizioni..." ></textarea></div>
          </div>
        </div>
        <div class="dialog-actions">
          <div class="dialog-delete-actions"><button class="button button-danger-ghost" id="delete-training-test" type="button" hidden>Elimina test</button></div>
          <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" id="save-training-test" type="submit">Salva test</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function openTestDialog(container, store, test = null) {
  const dialog = container.querySelector('#training-test-dialog');
  const form = container.querySelector('#training-test-form');
  const deleteButton = container.querySelector('#delete-training-test');
  const title = container.querySelector('#training-test-dialog-title');
  bindDialogClose(dialog);
  form.reset();
  title.textContent = test ? 'Modifica test' : 'Nuovo test';
  deleteButton.hidden = !test;

  if (test) {
    form.elements.id.value = test.id;
    form.elements.name.value = test.name || '';
    form.elements.area.value = test.area || 'general';
    form.elements.bilateral.value = String(Boolean(test.bilateral));
    form.elements.unit.value = test.unit || '';
    form.elements.direction.value = test.direction || 'higher';
    form.elements.targetValue.value = test.targetValue ?? '';
    form.elements.description.value = test.description || '';
  }

  form.onsubmit = event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id || makeId('test');
    dialog.close();
    store.update(state => {
      const record = {
        id,
        name: data.name.trim(),
        area: data.area,
        bilateral: data.bilateral === 'true',
        unit: data.unit.trim(),
        direction: data.direction,
        targetValue: data.targetValue === '' ? '' : Number(data.targetValue),
        description: data.description.trim(),
      };
      const index = state.training.tests.findIndex(item => item.id === id);
      if (index >= 0) state.training.tests[index] = record;
      else state.training.tests.push(record);
    });
    ui.selectedTestId = id;
    renderTests(container, store.getState().training, store);
  };

  deleteButton.onclick = async () => {
    if (!test) return;
    const confirmed = await showInAppConfirm(`Eliminare “${test.name}” e tutte le relative misurazioni?`, { title: 'Elimina test', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    dialog.close();
    store.update(state => {
      state.training.tests = state.training.tests.filter(item => item.id !== test.id);
      state.training.testResults = state.training.testResults.filter(result => result.testId !== test.id);
      state.training.goals.forEach(goal => {
        goal.linkedTestIds = (goal.linkedTestIds || []).filter(testId => testId !== test.id);
      });
    });
    ui.selectedTestId = '';
    renderTests(container, store.getState().training, store);
  };

  dialog.showModal();
}

function renderResultDialog(test) {
  return `
    <dialog class="planner-dialog" id="training-result-dialog">
      <form method="dialog" id="training-result-form">
        <div class="dialog-head">
          <div><div class="eyebrow">${escapeHtml(test.name)}</div><h3>Nuova misurazione</h3></div>
          <button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="field"><label>Data</label><input name="date" type="date" required value="${todayKey()}" /></div>
            <div class="field"><label>Valutatore</label><input name="evaluator" placeholder="Preparatore / fisioterapista / coach" /></div>
            ${test.bilateral ? `
              <div class="field"><label>Sinistra (${escapeHtml(test.unit || 'valore')})</label><input name="leftValue" type="number" step="any" required /></div>
              <div class="field"><label>Destra (${escapeHtml(test.unit || 'valore')})</label><input name="rightValue" type="number" step="any" required /></div>
            ` : `
              <div class="field full"><label>Valore (${escapeHtml(test.unit || 'unità')})</label><input name="value" type="number" step="any" required /></div>
            `}
            <div class="field full"><label>Note</label><textarea name="notes" placeholder="Condizioni del test, eventuali osservazioni..." ></textarea></div>
          </div>
        </div>
        <div class="dialog-actions">
          <div></div>
          <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva misurazione</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function openResultDialog(container, store, test) {
  const dialog = container.querySelector('#training-result-dialog');
  const form = container.querySelector('#training-result-form');
  bindDialogClose(dialog);
  form.reset();
  form.elements.date.value = todayKey();
  form.onsubmit = event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const record = {
      id: makeId('result'),
      testId: test.id,
      date: data.date,
      evaluator: data.evaluator.trim(),
      notes: data.notes.trim(),
    };
    if (test.bilateral) {
      record.leftValue = Number(data.leftValue);
      record.rightValue = Number(data.rightValue);
    } else {
      record.value = Number(data.value);
    }
    dialog.close();
    store.update(state => state.training.testResults.push(record));
    renderTests(container, store.getState().training, store);
  };
  dialog.showModal();
}

function renderWeeklyProgram(container, training, store) {
  const program = training.weeklyProgram;
  const sessions = [...program.sessions].sort(sessionSort);
  const totalMinutes = sessions.reduce((sum, session) => sum + sessionDuration(session), 0);
  const totalBlocks = sessions.reduce((sum, session) => sum + (session.blocks?.length || 0), 0);

  container.innerHTML = `
    <section class="training-subhead">
      <div>
        <div class="eyebrow">Programma settimanale</div>
        <h2>${escapeHtml(program.title || 'Programma settimanale')}</h2>
        <p>${program.effectiveFrom || program.effectiveTo ? `${program.effectiveFrom ? `Dal ${formatDate(program.effectiveFrom)}` : ''}${program.effectiveFrom && program.effectiveTo ? ' ' : ''}${program.effectiveTo ? `al ${formatDate(program.effectiveTo)}` : ''}` : 'Template corrente della preparazione atletica.'}</p>
      </div>
      <div class="training-subhead-actions">
        <button class="button button-ghost" id="edit-weekly-program" type="button">Impostazioni</button>
        <button class="button button-primary" id="add-training-session" type="button">+ Sessione</button>
      </div>
    </section>

    <section class="training-kpis compact">
      <article class="training-kpi"><span>Sessioni</span><strong>${sessions.length}</strong></article>
      <article class="training-kpi"><span>Volume previsto</span><strong>${formatMinutes(totalMinutes)}</strong></article>
      <article class="training-kpi"><span>Blocchi di lavoro</span><strong>${totalBlocks}</strong></article>
      <article class="training-kpi"><span>Giorni attivi</span><strong>${new Set(sessions.map(session => session.dayIndex)).size}</strong></article>
    </section>

    <section class="training-week-grid">
      ${days.map(day => {
        const daySessions = sessions.filter(session => Number(session.dayIndex) === day.id);
        return `
          <article class="training-week-day">
            <header><span>${day.short}</span><strong>${day.label}</strong><button type="button" data-add-day-session="${day.id}" title="Aggiungi sessione">+</button></header>
            <div class="training-week-day-body">
              ${daySessions.length ? daySessions.map(session => renderTrainingSessionCard(session)).join('') : '<div class="training-week-empty">Nessuna sessione</div>'}
            </div>
          </article>
        `;
      }).join('')}
    </section>

    ${program.notes ? `<section class="panel training-program-notes"><div class="panel-header"><h3>Note del programma</h3></div><div class="panel-body"><p>${escapeHtml(program.notes)}</p></div></section>` : ''}

    ${renderProgramDialog(program)}
    ${renderSessionDialog()}
  `;

  container.querySelector('#edit-weekly-program')?.addEventListener('click', () => openProgramDialog(container, store));
  container.querySelector('#add-training-session')?.addEventListener('click', () => openSessionDialog(container, store));
  container.querySelectorAll('[data-add-day-session]').forEach(button => {
    button.addEventListener('click', () => openSessionDialog(container, store, null, Number(button.dataset.addDaySession)));
  });
  container.querySelectorAll('[data-edit-training-session]').forEach(button => {
    button.addEventListener('click', () => {
      const session = store.getState().training.weeklyProgram.sessions.find(item => item.id === button.dataset.editTrainingSession);
      if (session) openSessionDialog(container, store, session);
    });
  });
}

function renderTrainingSessionCard(session) {
  const blocks = session.blocks || [];
  return `
    <button class="training-session-card" type="button" data-edit-training-session="${escapeAttr(session.id)}">
      <div class="training-session-card-top">
        <span>${escapeHtml(session.startTime || '')}${session.startTime && session.endTime ? '–' : ''}${escapeHtml(session.endTime || '')}</span>
        <span>${formatMinutes(sessionDuration(session))}</span>
      </div>
      <strong>${escapeHtml(session.title || 'Sessione')}</strong>
      ${session.focus ? `<div class="training-session-focus">${escapeHtml(session.focus)}</div>` : ''}
      ${blocks.length ? `<div class="training-session-blocks">${blocks.map(block => `<span>${escapeHtml(blockLabels[block.type] || block.type || 'Blocco')}: ${escapeHtml(block.name || '')}${block.dose ? ` · ${escapeHtml(block.dose)}` : ''}</span>`).join('')}</div>` : '<div class="training-session-blocks"><span>Nessun blocco definito</span></div>'}
      ${session.coach ? `<div class="training-session-coach">${escapeHtml(session.coach)}</div>` : ''}
    </button>
  `;
}

function renderProgramDialog(program) {
  return `
    <dialog class="planner-dialog" id="weekly-program-dialog">
      <form method="dialog" id="weekly-program-form">
        <div class="dialog-head"><div><div class="eyebrow">Programma atletico</div><h3>Impostazioni</h3></div><button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button></div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="field full"><label>Titolo</label><input name="title" value="${escapeAttr(program.title || '')}" /></div>
            <div class="field"><label>Valido dal</label><input name="effectiveFrom" type="date" value="${escapeAttr(program.effectiveFrom || '')}" /></div>
            <div class="field"><label>Valido fino al</label><input name="effectiveTo" type="date" value="${escapeAttr(program.effectiveTo || '')}" /></div>
            <div class="field full"><label>Note generali</label><textarea name="notes">${escapeHtml(program.notes || '')}</textarea></div>
          </div>
        </div>
        <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva</button></div></div>
      </form>
    </dialog>
  `;
}

function openProgramDialog(container, store) {
  const dialog = container.querySelector('#weekly-program-dialog');
  const form = container.querySelector('#weekly-program-form');
  bindDialogClose(dialog);
  form.onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    dialog.close();
    store.update(state => {
      state.training.weeklyProgram.title = data.title.trim() || 'Programma settimanale';
      state.training.weeklyProgram.effectiveFrom = data.effectiveFrom;
      state.training.weeklyProgram.effectiveTo = data.effectiveTo;
      state.training.weeklyProgram.notes = data.notes.trim();
    });
    renderWeeklyProgram(container, store.getState().training, store);
  };
  dialog.showModal();
}

function renderSessionDialog() {
  return `
    <dialog class="planner-dialog training-session-dialog" id="training-session-dialog">
      <form method="dialog" id="training-session-form">
        <div class="dialog-head"><div><div class="eyebrow">Preparazione atletica</div><h3 id="training-session-dialog-title">Nuova sessione</h3></div><button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button></div>
        <div class="dialog-body">
          <input type="hidden" name="id" />
          <div class="form-grid">
            <div class="field"><label>Giorno</label><select name="dayIndex">${days.map(day => `<option value="${day.id}">${day.label}</option>`).join('')}</select></div>
            <div class="field"><label>Titolo</label><input name="title" required placeholder="es. Forza + prevenzione" /></div>
            <div class="field"><label>Inizio</label><input name="startTime" type="time" /></div>
            <div class="field"><label>Fine</label><input name="endTime" type="time" /></div>
            <div class="field"><label>Focus</label><input name="focus" placeholder="es. lower body / speed" /></div>
            <div class="field"><label>Preparatore</label><input name="coach" /></div>
            <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
          </div>

          <div class="training-block-builder">
            <div class="training-block-builder-head"><div><strong>Blocchi di lavoro</strong><span>Ogni blocco può contenere categoria, esercizio/contenuto e dose.</span></div><button class="button button-ghost" id="add-training-block" type="button">+ Blocco</button></div>
            <div id="training-block-rows" class="training-block-rows"></div>
          </div>
        </div>
        <div class="dialog-actions">
          <div class="dialog-delete-actions"><button class="button button-danger-ghost" id="delete-training-session" type="button" hidden>Elimina sessione</button></div>
          <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva sessione</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function openSessionDialog(container, store, session = null, presetDay = null) {
  const dialog = container.querySelector('#training-session-dialog');
  const form = container.querySelector('#training-session-form');
  const rows = container.querySelector('#training-block-rows');
  const deleteButton = container.querySelector('#delete-training-session');
  bindDialogClose(dialog);
  container.querySelector('#training-session-dialog-title').textContent = session ? 'Modifica sessione' : 'Nuova sessione';
  form.reset();
  rows.innerHTML = '';
  deleteButton.hidden = !session;

  if (session) {
    form.elements.id.value = session.id;
    form.elements.dayIndex.value = String(session.dayIndex ?? 0);
    form.elements.title.value = session.title || '';
    form.elements.startTime.value = session.startTime || '';
    form.elements.endTime.value = session.endTime || '';
    form.elements.focus.value = session.focus || '';
    form.elements.coach.value = session.coach || '';
    form.elements.notes.value = session.notes || '';
    (session.blocks || []).forEach(block => addBlockRow(rows, block));
  } else {
    form.elements.dayIndex.value = String(presetDay ?? 0);
    addBlockRow(rows);
  }

  container.querySelector('#add-training-block').onclick = () => addBlockRow(rows);

  form.onsubmit = event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const blocks = collectBlockRows(rows);
    const id = data.id || makeId('session');
    dialog.close();
    store.update(state => {
      const record = {
        id,
        dayIndex: Number(data.dayIndex),
        title: data.title.trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        focus: data.focus.trim(),
        coach: data.coach.trim(),
        notes: data.notes.trim(),
        blocks,
      };
      const sessions = state.training.weeklyProgram.sessions;
      const index = sessions.findIndex(item => item.id === id);
      if (index >= 0) sessions[index] = record;
      else sessions.push(record);
    });
    renderWeeklyProgram(container, store.getState().training, store);
  };

  deleteButton.onclick = async () => {
    if (!session) return;
    const confirmed = await showInAppConfirm('Eliminare questa sessione dal programma settimanale?', { title: 'Elimina sessione', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    dialog.close();
    store.update(state => {
      state.training.weeklyProgram.sessions = state.training.weeklyProgram.sessions.filter(item => item.id !== session.id);
    });
    renderWeeklyProgram(container, store.getState().training, store);
  };

  dialog.showModal();
}

function addBlockRow(container, block = {}) {
  const row = document.createElement('div');
  row.className = 'training-block-row';
  row.innerHTML = `
    <select data-block-field="type" aria-label="Tipo di blocco">${blockTypeOptions(block.type || 'warmup')}</select>
    <input data-block-field="name" value="${escapeAttr(block.name || '')}" placeholder="Esercizio / contenuto" aria-label="Esercizio o contenuto" />
    <input data-block-field="dose" value="${escapeAttr(block.dose || '')}" placeholder="Dose: 3×8, 10 min..." aria-label="Dose" />
    <input data-block-field="rest" value="${escapeAttr(block.rest || '')}" placeholder="Recupero" aria-label="Recupero" />
    <button class="training-icon-danger" type="button" aria-label="Rimuovi blocco">×</button>
  `;
  row.querySelector('button').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectBlockRows(container) {
  return [...container.querySelectorAll('.training-block-row')].map(row => ({
    id: makeId('block'),
    type: row.querySelector('[data-block-field="type"]').value,
    name: row.querySelector('[data-block-field="name"]').value.trim(),
    dose: row.querySelector('[data-block-field="dose"]').value.trim(),
    rest: row.querySelector('[data-block-field="rest"]').value.trim(),
  })).filter(block => block.name || block.dose || block.rest);
}

function renderGoals(container, training, store) {
  const goals = [...training.goals].sort((a, b) => horizonOrder(a.horizon) - horizonOrder(b.horizon) || (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));
  container.innerHTML = `
    <section class="training-subhead">
      <div>
        <div class="eyebrow">Obiettivi</div>
        <h2>Direzione della preparazione</h2>
        <p>Obiettivi distinti per orizzonte temporale, collegabili ai test che ne misurano l’andamento.</p>
      </div>
      <button class="button button-primary" id="add-training-goal" type="button">+ Nuovo obiettivo</button>
    </section>

    <section class="training-goal-columns">
      ${['short', 'medium', 'long'].map(horizon => {
        const horizonGoals = goals.filter(goal => goal.horizon === horizon);
        return `
          <article class="training-goal-column">
            <header>
              <div><span>${goalHorizonLabels[horizon]}</span><strong>${horizonGoals.length}</strong></div>
              <p>${horizon === 'short' ? 'Priorità immediate e adattamenti delle prossime settimane.' : horizon === 'medium' ? 'Blocchi di lavoro e traguardi dei prossimi mesi.' : 'Direzione fisica della stagione e dello sviluppo.'}</p>
            </header>
            <div class="training-goal-list">
              ${horizonGoals.length ? horizonGoals.map(goal => renderGoalCard(goal, training)).join('') : '<div class="training-goal-empty">Nessun obiettivo</div>'}
            </div>
          </article>
        `;
      }).join('')}
    </section>

    ${renderGoalDialog(training)}
  `;

  container.querySelector('#add-training-goal')?.addEventListener('click', () => openGoalDialog(container, store));
  container.querySelectorAll('[data-edit-goal]').forEach(button => {
    button.addEventListener('click', () => {
      const goal = store.getState().training.goals.find(item => item.id === button.dataset.editGoal);
      if (goal) openGoalDialog(container, store, goal);
    });
  });
}

function renderGoalCard(goal, training) {
  const linkedTests = (goal.linkedTestIds || []).map(id => training.tests.find(test => test.id === id)).filter(Boolean);
  return `
    <button class="training-goal-card goal-status-${goal.status || 'active'}" data-edit-goal="${escapeAttr(goal.id)}" type="button">
      <div class="training-goal-card-top"><span>${escapeHtml(areaLabels[goal.area] || goal.area || 'Generale')}</span><span class="training-goal-status">${escapeHtml(goalStatusLabels[goal.status] || 'Attivo')}</span></div>
      <strong>${escapeHtml(goal.title)}</strong>
      ${goal.description ? `<p>${escapeHtml(goal.description)}</p>` : ''}
      <div class="training-goal-card-meta">
        ${goal.targetDate ? `<span>Entro ${formatDate(goal.targetDate)}</span>` : '<span>Nessuna scadenza</span>'}
        ${linkedTests.length ? `<span>${linkedTests.length} ${linkedTests.length === 1 ? 'test collegato' : 'test collegati'}</span>` : '<span>Nessun test collegato</span>'}
      </div>
    </button>
  `;
}

function renderGoalDialog(training) {
  return `
    <dialog class="planner-dialog" id="training-goal-dialog">
      <form method="dialog" id="training-goal-form">
        <div class="dialog-head"><div><div class="eyebrow">Obiettivo atletico</div><h3 id="training-goal-dialog-title">Nuovo obiettivo</h3></div><button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button></div>
        <div class="dialog-body">
          <input type="hidden" name="id" />
          <div class="form-grid">
            <div class="field full"><label>Titolo</label><input name="title" required /></div>
            <div class="field"><label>Orizzonte</label><select name="horizon"><option value="short">Breve periodo</option><option value="medium">Medio periodo</option><option value="long">Lungo periodo</option></select></div>
            <div class="field"><label>Area / capacità</label><select name="area">${areaOptions()}</select></div>
            <div class="field"><label>Data obiettivo</label><input name="targetDate" type="date" /></div>
            <div class="field"><label>Stato</label><select name="status"><option value="active">Attivo</option><option value="achieved">Raggiunto</option><option value="paused">In pausa</option></select></div>
            <div class="field full"><label>Descrizione</label><textarea name="description"></textarea></div>
            <div class="field full">
              <label>Test collegati</label>
              ${training.tests.length ? `<select name="linkedTestIds" multiple class="training-multiselect">${training.tests.map(test => `<option value="${escapeAttr(test.id)}">${escapeHtml(test.name)} · ${escapeHtml(areaLabels[test.area] || test.area || 'Generale')}</option>`).join('')}</select><span class="training-field-hint">⌘/Ctrl + clic per selezionare più test.</span>` : '<div class="training-inline-note">Non hai ancora definito test da collegare.</div>'}
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <div class="dialog-delete-actions"><button class="button button-danger-ghost" id="delete-training-goal" type="button" hidden>Elimina obiettivo</button></div>
          <div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva obiettivo</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function openGoalDialog(container, store, goal = null) {
  const dialog = container.querySelector('#training-goal-dialog');
  const form = container.querySelector('#training-goal-form');
  const deleteButton = container.querySelector('#delete-training-goal');
  bindDialogClose(dialog);
  container.querySelector('#training-goal-dialog-title').textContent = goal ? 'Modifica obiettivo' : 'Nuovo obiettivo';
  form.reset();
  deleteButton.hidden = !goal;

  if (goal) {
    form.elements.id.value = goal.id;
    form.elements.title.value = goal.title || '';
    form.elements.horizon.value = goal.horizon || 'short';
    form.elements.area.value = goal.area || 'general';
    form.elements.targetDate.value = goal.targetDate || '';
    form.elements.status.value = goal.status || 'active';
    form.elements.description.value = goal.description || '';
    if (form.elements.linkedTestIds) {
      [...form.elements.linkedTestIds.options].forEach(option => option.selected = (goal.linkedTestIds || []).includes(option.value));
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const linkedTestIds = form.elements.linkedTestIds ? [...form.elements.linkedTestIds.selectedOptions].map(option => option.value) : [];
    const id = data.id || makeId('goal');
    dialog.close();
    store.update(state => {
      const record = {
        id,
        title: data.title.trim(),
        horizon: data.horizon,
        area: data.area,
        targetDate: data.targetDate,
        status: data.status,
        description: data.description.trim(),
        linkedTestIds,
      };
      const index = state.training.goals.findIndex(item => item.id === id);
      if (index >= 0) state.training.goals[index] = record;
      else state.training.goals.push(record);
    });
    renderGoals(container, store.getState().training, store);
  };

  deleteButton.onclick = async () => {
    if (!goal) return;
    const confirmed = await showInAppConfirm('Eliminare questo obiettivo?', { title: 'Elimina obiettivo', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    dialog.close();
    store.update(state => {
      state.training.goals = state.training.goals.filter(item => item.id !== goal.id);
    });
    renderGoals(container, store.getState().training, store);
  };

  dialog.showModal();
}

function renderTestChart(test, results) {
  const width = 760;
  const height = 270;
  const left = 52;
  const right = 18;
  const top = 20;
  const bottom = 44;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const series = test.bilateral
    ? [
        { key: 'leftValue', label: 'Sinistra', className: 'series-a' },
        { key: 'rightValue', label: 'Destra', className: 'series-b' },
      ]
    : [{ key: 'value', label: test.name, className: 'series-a' }];

  const values = results.flatMap(result => series.map(s => Number(result[s.key]))).filter(Number.isFinite);
  const target = Number(test.targetValue);
  if (Number.isFinite(target)) values.push(target);
  if (!values.length) return '';
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.abs(min || 1) * 0.1;
    max += Math.abs(max || 1) * 0.1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const x = index => results.length === 1 ? left + plotW / 2 : left + (index / (results.length - 1)) * plotW;
  const y = value => top + ((max - Number(value)) / (max - min)) * plotH;
  const ticks = Array.from({ length: 5 }, (_, i) => max - ((max - min) * i / 4));

  const grid = ticks.map(value => `
    <line x1="${left}" y1="${y(value).toFixed(1)}" x2="${width-right}" y2="${y(value).toFixed(1)}" class="training-chart-grid" />
    <text x="${left-8}" y="${(y(value)+4).toFixed(1)}" text-anchor="end" class="training-chart-axis-label">${escapeHtml(formatNumeric(value))}</text>
  `).join('');

  const xLabels = results.map((result, index) => `
    <text x="${x(index).toFixed(1)}" y="${height-14}" text-anchor="middle" class="training-chart-axis-label">${escapeHtml(formatShortDate(result.date))}</text>
  `).join('');

  const paths = series.map(s => {
    const points = results.map((result, index) => ({ x: x(index), y: y(result[s.key]), value: result[s.key] }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const dots = points.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="training-chart-dot ${s.className}"><title>${escapeHtml(`${s.label}: ${formatNumeric(point.value)} ${test.unit || ''}`)}</title></circle>`).join('');
    return `<path d="${path}" class="training-chart-line ${s.className}" />${dots}`;
  }).join('');

  const targetLine = Number.isFinite(target)
    ? `<line x1="${left}" y1="${y(target).toFixed(1)}" x2="${width-right}" y2="${y(target).toFixed(1)}" class="training-chart-target" /><text x="${width-right}" y="${(y(target)-6).toFixed(1)}" text-anchor="end" class="training-chart-target-label">Target ${escapeHtml(formatNumeric(target))}</text>`
    : '';

  return `
    <div class="training-chart-header">
      <div><strong>Andamento nel tempo</strong><span>${escapeHtml(test.unit || 'Valore')}</span></div>
      ${test.bilateral ? '<div class="training-chart-legend"><span><i class="series-a"></i>Sinistra</span><span><i class="series-b"></i>Destra</span></div>' : ''}
    </div>
    <div class="training-chart-scroll">
      <svg class="training-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento del test ${escapeAttr(test.name)}">
        ${grid}
        ${targetLine}
        ${paths}
        ${xLabels}
      </svg>
    </div>
  `;
}

function resultDisplay(test, result) {
  if (!result) return '—';
  if (test.bilateral) return `${formatNumeric(result.leftValue)} / ${formatNumeric(result.rightValue)} ${escapeHtml(test.unit || '')}`;
  return `${formatNumeric(result.value)} ${escapeHtml(test.unit || '')}`;
}

function resultDelta(test, latest, previous) {
  if (!latest || !previous) return null;
  const latestValue = test.bilateral ? averagePair(latest) : Number(latest.value);
  const previousValue = test.bilateral ? averagePair(previous) : Number(previous.value);
  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) return null;
  const delta = latestValue - previousValue;
  if (Math.abs(delta) < 1e-9) return { text: 'Invariato', className: 'neutral' };
  const sign = delta > 0 ? '+' : '−';
  const magnitude = formatNumeric(Math.abs(delta));
  const isGood = test.direction === 'higher' ? delta > 0 : test.direction === 'lower' ? delta < 0 : null;
  const className = isGood === true ? 'positive' : isGood === false ? 'negative' : 'neutral';
  return { text: `${sign}${magnitude} ${test.unit || ''} vs precedente`, className };
}

function averagePair(result) {
  const left = Number(result.leftValue);
  const right = Number(result.rightValue);
  return Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : NaN;
}

function formatAsymmetry(result) {
  const left = Math.abs(Number(result.leftValue));
  const right = Math.abs(Number(result.rightValue));
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.max(left, right) === 0) return '—';
  return `${(Math.abs(left - right) / Math.max(left, right) * 100).toFixed(1)}%`;
}

function sessionDuration(session) {
  if (session.startTime && session.endTime) {
    const [sh, sm] = session.startTime.split(':').map(Number);
    const [eh, em] = session.endTime.split(':').map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (Number.isFinite(minutes) && minutes > 0) return minutes;
  }
  return 0;
}

function sessionSort(a, b) {
  return Number(a.dayIndex) - Number(b.dayIndex) || (a.startTime || '').localeCompare(b.startTime || '');
}

function horizonOrder(horizon) {
  return horizon === 'short' ? 0 : horizon === 'medium' ? 1 : 2;
}

function renderEmptyInline(title, copy) {
  return `<div class="training-empty-inline"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
}

function areaOptions(selected = 'general') {
  return Object.entries(areaLabels).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function blockTypeOptions(selected = 'warmup') {
  return Object.entries(blockLabels).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function formatMinutes(minutes) {
  if (!minutes) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatNumeric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatShortDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function bindDialogClose(dialog) {
  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.onclick = () => dialog.close();
  });
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function escapeAttr(value = '') { return escapeHtml(value); }
