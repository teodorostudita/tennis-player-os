import { canReadModule, canWriteModule } from '../cloud/access.js';
import {
  athleticsSessionDefinition,
  loadReusableAthleticsSessions,
} from '../cloud/athleticsSessionLibrary.js';
import { store } from '../data/store.js';
import { showInAppAlert } from './inAppMessages.js';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

let queued = false;

function route() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function isTrainingRoute() {
  return route() === 'training';
}

function weeklyActive() {
  return Boolean(
    document.querySelector(
      '[data-training-section="weekly"].active',
    ),
  );
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeFileName(value) {
  return String(value || 'sessione-atletica')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    || 'sessione-atletica';
}

function formatTimeRange(session) {
  const start = session.startTime || '';
  const end = session.endTime || '';

  if (start && end) return `${start}–${end}`;
  return start || end || 'orario libero';
}

function sourceLabel(entry) {
  const source = entry.sources?.length
    ? ` · da ${entry.sources.join(', ')}`
    : '';

  return `${entry.definition.title} · ${DAY_LABELS[entry.definition.dayIndex] || '—'} ${formatTimeRange(entry.definition)}${source}`;
}

function previewMarkup(entry) {
  if (!entry) {
    return `
      <div class="athletics-session-transfer-empty">
        Seleziona una sessione per vedere il contenuto.
      </div>
    `;
  }

  const session = entry.definition;

  return `
    <div class="athletics-session-transfer-preview-head">
      <div>
        <strong>${escapeHtml(session.title)}</strong>
        <span>
          ${escapeHtml(DAY_LABELS[session.dayIndex] || '—')}
          · ${escapeHtml(formatTimeRange(session))}
          ${session.focus ? ` · ${escapeHtml(session.focus)}` : ''}
        </span>
      </div>
      <b>${session.blocks.length} ${session.blocks.length === 1 ? 'blocco' : 'blocchi'}</b>
    </div>

    ${entry.sources?.length
      ? `<div class="athletics-session-transfer-source">Fonte: ${escapeHtml(entry.sources.join(', '))}</div>`
      : ''}

    <div class="athletics-session-transfer-blocks">
      ${session.blocks.length
        ? session.blocks.map(block => `
            <div>
              <strong>${escapeHtml(block.name || 'Blocco')}</strong>
              <span>
                ${escapeHtml(block.type || 'other')}
                ${block.dose ? ` · ${escapeHtml(block.dose)}` : ''}
                ${block.rest ? ` · recupero ${escapeHtml(block.rest)}` : ''}
              </span>
            </div>
          `).join('')
        : '<span>Nessun blocco definito.</span>'}
    </div>
  `;
}

function fillExistingSessionDialog(session) {
  const definition = athleticsSessionDefinition(session);

  const addButton = document.querySelector('#add-training-session');
  if (!addButton) {
    throw new Error('Il comando “Nuova sessione” non è disponibile.');
  }

  addButton.click();

  const dialog = document.querySelector('#training-session-dialog');
  const form = document.querySelector('#training-session-form');
  const rows = document.querySelector('#training-block-rows');
  const addBlock = document.querySelector('#add-training-block');

  if (!dialog?.open || !form || !rows || !addBlock) {
    throw new Error('La finestra di modifica della sessione non è disponibile.');
  }

  form.elements.id.value = '';
  form.elements.dayIndex.value = String(definition.dayIndex);
  form.elements.title.value = definition.title;
  form.elements.startTime.value = definition.startTime;
  form.elements.endTime.value = definition.endTime;
  form.elements.focus.value = definition.focus;
  form.elements.coach.value = definition.coach;
  form.elements.notes.value = definition.notes;

  rows.innerHTML = '';

  const blocks = definition.blocks.length
    ? definition.blocks
    : [{ type: 'warmup', name: '', dose: '', rest: '' }];

  for (const block of blocks) {
    addBlock.click();

    const row = rows.lastElementChild;
    if (!row) continue;

    const type = row.querySelector('[data-block-field="type"]');
    const name = row.querySelector('[data-block-field="name"]');
    const dose = row.querySelector('[data-block-field="dose"]');
    const rest = row.querySelector('[data-block-field="rest"]');

    if (type) {
      const allowed = [...type.options].some(option => option.value === block.type);
      type.value = allowed ? block.type : 'other';
    }

    if (name) name.value = block.name;
    if (dose) dose.value = block.dose;
    if (rest) rest.value = block.rest;
  }

  const body = dialog.querySelector('.dialog-body');
  body?.querySelector('[data-imported-session-note]')?.remove();

  if (body) {
    body.insertAdjacentHTML(
      'afterbegin',
      `
        <div class="athletics-session-imported-note" data-imported-session-note>
          <strong>Sessione importata</strong>
          <span>È una nuova copia indipendente. Puoi cambiare giorno, orario, preparatore o blocchi prima di salvarla.</span>
        </div>
      `,
    );
  }

  document.querySelector('#training-session-dialog-title').textContent =
    'Nuova sessione · importata';
}

function downloadSession(session) {
  const definition = athleticsSessionDefinition(session);
  const athlete = store.getState().athlete || {};
  const athleteName = [athlete.firstName, athlete.lastName]
    .filter(Boolean)
    .join(' ');

  const payload = {
    format: 'tpos-athletics-session',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceAthlete: athleteName,
    session: definition,
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' },
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `${safeFileName(definition.title)}.tpos-athletics-session.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

async function readSessionFile(file) {
  const text = await file.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Il file non contiene JSON valido.');
  }

  if (
    payload?.format !== 'tpos-athletics-session'
    || Number(payload?.version) !== 1
    || !payload?.session
  ) {
    throw new Error('Questo non è un file di sessione Athletics compatibile.');
  }

  return athleticsSessionDefinition(payload.session);
}

function openTransferDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog athletics-session-transfer-dialog';

  dialog.innerHTML = `
    <div class="dialog-head">
      <div>
        <div class="eyebrow">Athletics · Session transfer</div>
        <h3>Importa sessione</h3>
      </div>
      <button class="dialog-close" type="button" data-close aria-label="Chiudi">×</button>
    </div>

    <div class="dialog-body">
      <section class="athletics-session-transfer-method">
        <div>
          <strong>Da un altro atleta</strong>
          <span>Mostra le sessioni degli atleti a cui questo account può accedere in Athletics.</span>
        </div>

        <div class="athletics-session-transfer-controls">
          <input
            type="search"
            data-session-transfer-search
            placeholder="Cerca titolo, focus, blocco o atleta…"
            autocomplete="off"
          />

          <select data-session-transfer-select disabled>
            <option value="">Caricamento sessioni…</option>
          </select>
        </div>

        <div
          class="athletics-session-transfer-preview"
          data-session-transfer-preview
        >
          <div class="athletics-session-transfer-empty">Caricamento…</div>
        </div>

        <div
          class="athletics-session-transfer-status"
          data-session-transfer-status
          aria-live="polite"
        ></div>

        <button
          class="button button-primary"
          type="button"
          data-use-session-transfer
          disabled
        >
          Usa questa sessione
        </button>
      </section>

      <div class="athletics-session-transfer-divider">
        <span>oppure</span>
      </div>

      <section class="athletics-session-transfer-file">
        <div>
          <strong>Da file</strong>
          <span>Puoi anche importare una sessione esportata in formato TPOS.</span>
        </div>

        <input
          type="file"
          accept=".json,.tpos-athletics-session.json,application/json"
          data-session-transfer-file
          hidden
        />

        <button
          class="button button-ghost"
          type="button"
          data-pick-session-file
        >
          Scegli file…
        </button>
      </section>
    </div>

    <div class="dialog-actions">
      <div></div>
      <div class="dialog-save-actions">
        <button class="button button-ghost" type="button" data-close>Chiudi</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const search = dialog.querySelector('[data-session-transfer-search]');
  const select = dialog.querySelector('[data-session-transfer-select]');
  const preview = dialog.querySelector('[data-session-transfer-preview]');
  const status = dialog.querySelector('[data-session-transfer-status]');
  const useButton = dialog.querySelector('[data-use-session-transfer]');
  const fileInput = dialog.querySelector('[data-session-transfer-file]');
  const pickFile = dialog.querySelector('[data-pick-session-file]');

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', close);
  });

  dialog.addEventListener('close', () => dialog.remove());

  const setStatus = (message = '', kind = '') => {
    status.textContent = message;
    status.className = `athletics-session-transfer-status${kind ? ` ${kind}` : ''}`;
  };

  const populate = (entries, filter = '') => {
    const query = String(filter || '').trim().toLocaleLowerCase('it');

    const filtered = entries.filter(entry => {
      if (!query) return true;

      const definition = entry.definition;
      const haystack = [
        definition.title,
        definition.focus,
        definition.coach,
        definition.notes,
        ...definition.blocks.flatMap(block => [
          block.type,
          block.name,
          block.dose,
          block.rest,
        ]),
        ...(entry.sources || []),
      ].join(' ').toLocaleLowerCase('it');

      return haystack.includes(query);
    });

    if (!filtered.length) {
      select.innerHTML = `
        <option value="">
          ${entries.length
            ? 'Nessuna sessione corrisponde alla ricerca'
            : 'Nessuna sessione disponibile da altri atleti'}
        </option>
      `;
      select.disabled = true;
      useButton.disabled = true;
      preview.innerHTML = previewMarkup(null);
      return;
    }

    select.innerHTML = `
      <option value="">Seleziona una sessione…</option>
      ${filtered.map(entry => `
        <option value="${escapeHtml(entry.signature)}">
          ${escapeHtml(sourceLabel(entry))}
        </option>
      `).join('')}
    `;
    select.disabled = false;
    useButton.disabled = true;
    preview.innerHTML = previewMarkup(null);
  };

  const state = store.getState();
  const athleteId = state.athlete?.id;

  dialog.showModal();

  void loadReusableAthleticsSessions({
    currentAthleteId: athleteId,
  }).then(entries => {
    dialog.__sessionEntries = entries;
    populate(entries);
    setStatus(
      entries.length
        ? `${entries.length} ${entries.length === 1 ? 'sessione disponibile' : 'sessioni disponibili'} dagli altri atleti.`
        : 'Nessuna sessione riutilizzabile trovata.',
      entries.length ? 'success' : '',
    );
  }).catch(error => {
    dialog.__sessionEntries = [];
    populate([]);
    setStatus(
      error?.message || 'Impossibile caricare le sessioni.',
      'error',
    );
  });

  search.addEventListener('input', () => {
    populate(dialog.__sessionEntries || [], search.value);
    setStatus('');
  });

  select.addEventListener('change', () => {
    const entry = (dialog.__sessionEntries || [])
      .find(item => item.signature === select.value);

    preview.innerHTML = previewMarkup(entry);
    useButton.disabled = !entry;
    setStatus('');
  });

  useButton.addEventListener('click', async () => {
    const entry = (dialog.__sessionEntries || [])
      .find(item => item.signature === select.value);

    if (!entry) return;

    close();

    window.queueMicrotask(() => {
      try {
        fillExistingSessionDialog(entry.definition);
      } catch (error) {
        void showInAppAlert(
          error?.message || 'Impossibile importare la sessione.',
          { title: 'Import sessione' },
        );
      }
    });
  });

  pickFile.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const session = await readSessionFile(file);
      close();

      window.queueMicrotask(() => {
        try {
          fillExistingSessionDialog(session);
        } catch (error) {
          void showInAppAlert(
            error?.message || 'Impossibile importare la sessione.',
            { title: 'Import sessione' },
          );
        }
      });
    } catch (error) {
      setStatus(
        error?.message || 'File non valido.',
        'error',
      );
      fileInput.value = '';
    }
  });
}

function installWeeklyImportButton() {
  if (!isTrainingRoute() || !weeklyActive()) return;

  const actions = document.querySelector(
    '#training-section-content .training-subhead-actions',
  );

  if (!actions || actions.querySelector('[data-import-athletics-session]')) {
    return;
  }

  if (!canWriteModule('training')) return;

  const button = document.createElement('button');
  button.className = 'button button-ghost';
  button.type = 'button';
  button.dataset.importAthleticsSession = '';
  button.textContent = 'Importa sessione';

  const addButton = actions.querySelector('#add-training-session');

  if (addButton) {
    actions.insertBefore(button, addButton);
  } else {
    actions.appendChild(button);
  }

  button.addEventListener('click', () => {
    if (!canReadModule('training') || !canWriteModule('training')) return;
    openTransferDialog();
  });
}

function prepareSessionDialog() {
  const dialog = document.querySelector('#training-session-dialog');
  const form = document.querySelector('#training-session-form');

  if (!dialog?.open || !form) return;

  dialog.querySelector('[data-export-athletics-session]')?.remove();
  dialog.querySelector('[data-imported-session-note]')?.remove();

  const id = String(form.elements.id?.value || '');
  if (!id) return;

  const session = store.getState().training?.weeklyProgram?.sessions
    ?.find(item => item.id === id);

  if (!session) return;

  const leftActions = dialog.querySelector('.dialog-delete-actions')
    || dialog.querySelector('.dialog-actions > div:first-child');

  if (!leftActions) return;

  const exportButton = document.createElement('button');
  exportButton.className = 'button button-ghost';
  exportButton.type = 'button';
  exportButton.dataset.exportAthleticsSession = '';
  exportButton.textContent = 'Esporta sessione';

  exportButton.addEventListener('click', () => {
    downloadSession(session);
  });

  leftActions.appendChild(exportButton);
}

function enhance() {
  queued = false;

  if (!isTrainingRoute()) return;

  installWeeklyImportButton();
}

function queueEnhance() {
  if (queued) return;
  queued = true;

  window.queueMicrotask(() => {
    enhance();
  });
}

document.addEventListener('click', event => {
  const sectionButton = event.target.closest?.('[data-training-section]');
  if (sectionButton) {
    queueEnhance();
  }

  const sessionEdit = event.target.closest?.('[data-edit-training-session]');
  const sessionAdd = event.target.closest?.(
    '#add-training-session, [data-add-day-session]',
  );

  if (sessionEdit || sessionAdd) {
    window.queueMicrotask(() => {
      prepareSessionDialog();
    });
  }
});

window.addEventListener('hashchange', queueEnhance);

store.subscribe(() => {
  if (isTrainingRoute() && weeklyActive()) {
    queueEnhance();
  }
});

queueEnhance();
