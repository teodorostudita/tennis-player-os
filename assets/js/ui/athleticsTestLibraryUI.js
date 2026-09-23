import { canReadModule, canWriteModule } from '../cloud/access.js';
import {
  athleticsTestDefinitionSignature,
  loadReusableAthleticsTests,
  syncAthleticsTestTemplates,
} from '../cloud/athleticsTestLibrary.js';
import { store } from '../data/store.js';

const SYNC_DELAY_MS = 350;

let lastPublishedFingerprint = '';
let syncTimer = null;
let syncRunning = false;
let syncRequestedAgain = false;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function trainingFingerprint() {
  const state = store.getState();
  const athleteId = String(state.athlete?.id || '');
  const tests = Array.isArray(state.training?.tests) ? state.training.tests : [];

  return `${athleteId}|${JSON.stringify(
    tests.map(test => [
      String(test.id || ''),
      athleticsTestDefinitionSignature(test),
    ]),
  )}`;
}

async function publishCurrentTestLibrary() {
  if (!canWriteModule('training')) return;

  const state = store.getState();
  const athleteId = String(state.athlete?.id || '');
  if (!athleteId) return;

  const fingerprint = trainingFingerprint();
  if (fingerprint === lastPublishedFingerprint) return;

  if (syncRunning) {
    syncRequestedAgain = true;
    return;
  }

  syncRunning = true;

  try {
    await syncAthleticsTestTemplates({
      athleteId,
      tests: state.training?.tests || [],
    });
    lastPublishedFingerprint = fingerprint;
  } catch (error) {
    console.warn('Athletics test library sync failed:', error);
  } finally {
    syncRunning = false;

    if (syncRequestedAgain) {
      syncRequestedAgain = false;
      scheduleLibrarySync();
    }
  }
}

function scheduleLibrarySync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    void publishCurrentTestLibrary();
  }, SYNC_DELAY_MS);
}

function panelMarkup() {
  return `
    <section class="training-test-library-import" data-athletics-test-library-panel>
      <div class="training-test-library-copy">
        <strong>Richiama test esistente</strong>
        <span>
          Copia il protocollo da un altro atleta. Misurazioni e target personale
          non vengono mai copiati.
        </span>
      </div>

      <div class="training-test-library-controls">
        <input
          type="search"
          data-athletics-test-search
          placeholder="Cerca per nome, area o atleta…"
          autocomplete="off"
        />
        <select data-athletics-test-select disabled>
          <option value="">Caricamento libreria…</option>
        </select>
        <button
          class="button button-ghost"
          type="button"
          data-athletics-test-use
          disabled
        >
          Usa protocollo
        </button>
      </div>

      <div
        class="training-test-library-status"
        data-athletics-test-status
        aria-live="polite"
      ></div>
    </section>
  `;
}

function setPanelStatus(panel, message = '', kind = '') {
  const status = panel.querySelector('[data-athletics-test-status]');
  if (!status) return;

  status.textContent = message;
  status.className = `training-test-library-status${kind ? ` ${kind}` : ''}`;
}

function optionLabel(entry) {
  const source = entry.sources.length
    ? ` · da ${entry.sources.join(', ')}`
    : '';

  return `${entry.definition.name} · ${entry.definition.area}${source}`;
}

function populateOptions(panel, entries, filter = '') {
  const select = panel.querySelector('[data-athletics-test-select]');
  const useButton = panel.querySelector('[data-athletics-test-use]');
  if (!select || !useButton) return;

  const query = String(filter || '').trim().toLocaleLowerCase('it');

  const filtered = entries.filter(entry => {
    if (!query) return true;

    const haystack = [
      entry.definition.name,
      entry.definition.area,
      entry.definition.unit,
      entry.definition.description,
      ...entry.sources,
    ].join(' ').toLocaleLowerCase('it');

    return haystack.includes(query);
  });

  if (!filtered.length) {
    select.innerHTML = `
      <option value="">
        ${entries.length ? 'Nessun test corrisponde alla ricerca' : 'Nessun test disponibile da altri atleti'}
      </option>
    `;
    select.disabled = true;
    useButton.disabled = true;
    return;
  }

  select.innerHTML = `
    <option value="">Seleziona un test…</option>
    ${filtered.map(entry => `
      <option value="${escapeHtml(entry.signature)}">
        ${escapeHtml(optionLabel(entry))}
      </option>
    `).join('')}
  `;

  select.disabled = false;
  useButton.disabled = true;
}

function applyDefinitionToForm(form, entry) {
  const definition = entry.definition;

  form.elements.name.value = definition.name || '';
  form.elements.area.value = definition.area || 'general';
  form.elements.bilateral.value = String(Boolean(definition.bilateral));
  form.elements.unit.value = definition.unit || '';
  form.elements.direction.value = definition.direction || 'higher';
  form.elements.targetValue.value = '';
  form.elements.description.value = definition.description || '';
}

async function prepareImportPanel(dialog) {
  const form = dialog.querySelector('#training-test-form');
  const body = dialog.querySelector('.dialog-body');
  if (!form || !body) return;

  let panel = body.querySelector('[data-athletics-test-library-panel]');

  if (!panel) {
    body.insertAdjacentHTML('afterbegin', panelMarkup());
    panel = body.querySelector('[data-athletics-test-library-panel]');
  }

  const editing = Boolean(String(form.elements.id?.value || ''));
  panel.hidden = editing;

  if (editing || !canReadModule('training')) return;

  const search = panel.querySelector('[data-athletics-test-search]');
  const select = panel.querySelector('[data-athletics-test-select]');
  const useButton = panel.querySelector('[data-athletics-test-use]');

  search.value = '';
  select.innerHTML = '<option value="">Caricamento libreria…</option>';
  select.disabled = true;
  useButton.disabled = true;
  setPanelStatus(panel, '');

  try {
    const state = store.getState();
    const entries = await loadReusableAthleticsTests({
      currentAthleteId: state.athlete?.id,
      currentTests: state.training?.tests || [],
    });

    panel.__athleticsLibraryEntries = entries;
    populateOptions(panel, entries);

    search.oninput = () => {
      populateOptions(
        panel,
        panel.__athleticsLibraryEntries || [],
        search.value,
      );
      setPanelStatus(panel, '');
    };

    select.onchange = () => {
      useButton.disabled = !select.value;
      setPanelStatus(panel, '');
    };

    useButton.onclick = () => {
      const entry = (panel.__athleticsLibraryEntries || [])
        .find(item => item.signature === select.value);

      if (!entry) return;

      applyDefinitionToForm(form, entry);

      const sources = entry.sources.length
        ? ` da ${entry.sources.join(', ')}`
        : '';

      setPanelStatus(
        panel,
        `Protocollo caricato${sources}. Puoi modificarlo prima di salvarlo.`,
        'success',
      );
    };
  } catch (error) {
    panel.__athleticsLibraryEntries = [];
    populateOptions(panel, []);
    setPanelStatus(
      panel,
      error?.message || 'Libreria test non disponibile.',
      'error',
    );
  }
}

function inspectTrainingDialog() {
  const dialog = document.querySelector('#training-test-dialog');
  if (!dialog?.open) return;

  void prepareImportPanel(dialog);
}

function installDialogObserver() {
  const observer = new MutationObserver(() => {
    window.queueMicrotask(inspectTrainingDialog);
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['open'],
    childList: true,
    subtree: true,
  });

  window.addEventListener('hashchange', () => {
    window.queueMicrotask(inspectTrainingDialog);
    scheduleLibrarySync();
  });
}

store.subscribe(() => {
  scheduleLibrarySync();
});

installDialogObserver();

window.addEventListener('load', () => {
  scheduleLibrarySync();
  window.queueMicrotask(inspectTrainingDialog);
});
