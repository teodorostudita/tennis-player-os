import { showInAppAlert } from './inAppMessages.js';
import { store } from '../data/store.js';
import { getCurrentAccess } from '../cloud/access.js';
import {
  canEditAthleticsRecord,
  getCachedAthleticsStaffDirectory,
  loadAthleticsStaffDirectory,
  reassignAthleticsRecordOwner,
} from '../cloud/trainingCloud.js';

let observer = null;
let staffAthleteId = '';
let staffLoading = false;
let applying = false;

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function trainingWritable() {
  return Boolean(getCurrentAccess().modules?.training?.canWrite);
}

function ownerName(record = {}) {
  const ownerUserId = String(record?.__ownership?.ownerUserId || '');
  const access = getCurrentAccess();

  if (!ownerUserId) return 'Da sincronizzare';
  if (ownerUserId === access.userId) return 'Tu';

  return getCachedAthleticsStaffDirectory()
    .find(member => member.userId === ownerUserId)?.displayName
    || 'Altro membro dello staff';
}

function ownershipBadge(record = {}) {
  const editable = canEditAthleticsRecord(record);
  const span = document.createElement('span');
  span.className = `athletics-owner-badge ${editable ? 'editable' : 'locked'}`;
  span.dataset.athleticsOwnerBadge = 'true';
  span.textContent = `${editable ? '👤' : '🔒'} ${ownerName(record)}`;
  span.title = editable
    ? 'Responsabile del contenuto.'
    : 'Puoi leggere questo contenuto ma non modificarlo.';
  return span;
}


function clearOwnershipBadges() {
  document.querySelectorAll('[data-athletics-owner-badge]').forEach(element => element.remove());
}

function setLocked(element, locked, message = '') {
  if (!element) return;
  element.disabled = Boolean(locked);
  element.classList.toggle('athletics-record-locked', Boolean(locked));
  if (locked) {
    element.setAttribute('aria-disabled', 'true');
    element.title = message || 'Contenuto in sola lettura.';
  } else {
    element.removeAttribute('aria-disabled');
  }
}

function selectedTest(training) {
  const selectedId = document.querySelector('.training-test-list-item.active[data-test-id]')?.dataset.testId;
  return training.tests.find(test => test.id === selectedId) || null;
}

function applyTestOwnership(training) {
  const test = selectedTest(training);
  const edit = document.querySelector('#edit-training-test');

  if (test && edit) {
    const access = getCurrentAccess();
    const editable = canEditAthleticsRecord(test);
    setLocked(edit, !editable, 'Test gestito da un altro membro dello staff.');

    const dependentResults = training.testResults.some(result => result.testId === test.id);
    const dependentGoals = training.goals.some(goal => (goal.linkedTestIds || []).includes(test.id));
    const deleteButton = document.querySelector('#delete-training-test');
    const protectedDependencies = !access.isAdmin && (dependentResults || dependentGoals);

    setLocked(
      deleteButton,
      !editable || protectedDependencies,
      protectedDependencies
        ? 'Per eliminare un test già usato in misurazioni o obiettivi serve Owner/Admin.'
        : 'Test gestito da un altro membro dello staff.',
    );

    const head = document.querySelector('.training-test-detail-head');
    if (head && !head.querySelector('[data-athletics-owner-badge]')) {
      head.appendChild(ownershipBadge(test));
    }
  }

  document.querySelectorAll('[data-delete-result]').forEach(button => {
    const result = training.testResults.find(item => item.id === button.dataset.deleteResult);
    if (!result) return;
    setLocked(button, !canEditAthleticsRecord(result), 'Misurazione inserita da un altro membro dello staff.');
  });
}

function applySessionOwnership(training) {
  document.querySelectorAll('[data-edit-training-session]').forEach(button => {
    const session = training.weeklyProgram.sessions
      .find(item => item.id === button.dataset.editTrainingSession);
    if (!session) return;

    const editable = canEditAthleticsRecord(session);
    setLocked(button, !editable, 'Sessione gestita da un altro membro dello staff.');

    if (!button.querySelector('[data-athletics-owner-badge]')) {
      button.appendChild(ownershipBadge(session));
    }
  });
}

function applyGoalOwnership(training) {
  document.querySelectorAll('[data-edit-goal]').forEach(button => {
    const goal = training.goals.find(item => item.id === button.dataset.editGoal);
    if (!goal) return;

    const editable = canEditAthleticsRecord(goal);
    setLocked(button, !editable, 'Obiettivo gestito da un altro membro dello staff.');

    if (!button.querySelector('[data-athletics-owner-badge]')) {
      button.appendChild(ownershipBadge(goal));
    }
  });
}

function applyWritePermission() {
  const access = getCurrentAccess();
  const canWrite = trainingWritable();

  const creationSelectors = [
    '#add-training-test',
    '#empty-add-training-test',
    '#add-test-result',
    '#add-training-session',
    '[data-add-day-session]',
    '#add-training-goal',
  ];

  for (const selector of creationSelectors) {
    document.querySelectorAll(selector).forEach(element => {
      setLocked(element, !canWrite, 'Athletics è in sola lettura per questo account.');
    });
  }

  const weeklySettings = document.querySelector('#edit-weekly-program');
  if (weeklySettings) {
    setLocked(
      weeklySettings,
      !access.isAdmin,
      'Le impostazioni generali del programma sono riservate a Owner/Admin.',
    );
  }
}

function typeLabel(type) {
  return {
    test: 'Test',
    test_result: 'Misurazione',
    session: 'Sessione',
    goal: 'Obiettivo',
  }[type] || type;
}

function recordTitle(type, record, training) {
  if (type === 'test') return record.name || 'Test senza nome';
  if (type === 'session') return record.title || 'Sessione';
  if (type === 'goal') return record.title || 'Obiettivo';
  if (type === 'test_result') {
    const test = training.tests.find(item => item.id === record.testId);
    const testName = test?.name || 'Test';
    return `${testName}${record.date ? ` · ${record.date}` : ''}`;
  }
  return record.id || 'Record';
}

function recordsForManager(training) {
  return [
    ...training.tests.map(record => ({ type: 'test', record })),
    ...training.testResults.map(record => ({ type: 'test_result', record })),
    ...training.weeklyProgram.sessions.map(record => ({ type: 'session', record })),
    ...training.goals.map(record => ({ type: 'goal', record })),
  ];
}

function updateLocalOwner(type, clientId, ownerUserId) {
  clearOwnershipBadges();
  store.update(state => {
    let record = null;

    if (type === 'test') {
      record = state.training.tests.find(item => item.id === clientId);
    } else if (type === 'test_result') {
      record = state.training.testResults.find(item => item.id === clientId);
    } else if (type === 'session') {
      record = state.training.weeklyProgram.sessions.find(item => item.id === clientId);
    } else if (type === 'goal') {
      record = state.training.goals.find(item => item.id === clientId);
    }

    if (!record) return;
    record.__ownership = {
      ...(record.__ownership || {}),
      ownerUserId,
    };
  });
}

function ensureManagerDialog() {
  let dialog = document.querySelector('#athletics-ownership-dialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'athletics-ownership-dialog';
  dialog.className = 'planner-dialog athletics-ownership-dialog';
  document.body.appendChild(dialog);

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  return dialog;
}

function renderManagerDialog() {
  const dialog = ensureManagerDialog();
  const training = store.getState().training;
  const staff = getCachedAthleticsStaffDirectory()
    .filter(member => member.canWriteTraining);
  const records = recordsForManager(training);

  dialog.innerHTML = `
    <div class="dialog-head">
      <div>
        <div class="eyebrow">Athletics</div>
        <h3>Responsabili dei contenuti</h3>
        <p>Owner/Admin può assegnare ogni record a un membro dello staff abilitato in scrittura.</p>
      </div>
      <button class="dialog-close" type="button" data-ownership-close aria-label="Chiudi">×</button>
    </div>
    <div class="dialog-body athletics-ownership-body">
      ${records.length ? records.map(({ type, record }) => {
        const currentOwner = String(record?.__ownership?.ownerUserId || '');
        const options = staff.map(member => `
          <option value="${escapeAttr(member.userId)}" ${member.userId === currentOwner ? 'selected' : ''}>
            ${escapeHtml(member.displayName)}${member.role === 'owner' ? ' · Owner' : member.role === 'admin' ? ' · Admin' : ''}
          </option>
        `).join('');

        return `
          <div class="athletics-ownership-row">
            <div>
              <span>${escapeHtml(typeLabel(type))}</span>
              <strong>${escapeHtml(recordTitle(type, record, training))}</strong>
            </div>
            <select
              data-athletics-owner-type="${escapeAttr(type)}"
              data-athletics-owner-id="${escapeAttr(record.id)}"
              aria-label="Responsabile di ${escapeAttr(recordTitle(type, record, training))}"
            >
              ${currentOwner && !staff.some(member => member.userId === currentOwner)
                ? `<option value="${escapeAttr(currentOwner)}" selected>Responsabile non più disponibile</option>`
                : ''}
              ${options}
            </select>
          </div>
        `;
      }).join('') : '<div class="training-empty-inline"><strong>Nessun contenuto Athletics</strong><span>Non ci sono ancora record da assegnare.</span></div>'}
    </div>
    <div class="dialog-actions">
      <div></div>
      <button class="button button-primary" type="button" data-ownership-close>Chiudi</button>
    </div>
  `;

  dialog.querySelectorAll('[data-ownership-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelectorAll('[data-athletics-owner-type]').forEach(select => {
    select.addEventListener('change', async () => {
      const access = getCurrentAccess();
      const ownerUserId = select.value;
      const recordType = select.dataset.athleticsOwnerType;
      const clientId = select.dataset.athleticsOwnerId;
      select.disabled = true;

      try {
        await reassignAthleticsRecordOwner({
          athleteId: access.athleteId,
          recordType,
          clientId,
          ownerUserId,
        });
        updateLocalOwner(recordType, clientId, ownerUserId);
      } catch (error) {
        await showInAppAlert(
          error?.message || 'Impossibile cambiare responsabile.',
          { title: 'Responsabile non modificato', danger: true },
        );
        renderManagerDialog();
      } finally {
        select.disabled = false;
      }
    });
  });

  return dialog;
}

function ensureManagerButton() {
  const access = getCurrentAccess();
  if (!access.isAdmin || route() !== 'training') return;

  const head = document.querySelector('.training-module-head');
  if (!head || head.querySelector('[data-athletics-manage-owners]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost athletics-manage-owners';
  button.dataset.athleticsManageOwners = 'true';
  button.textContent = 'Responsabili';
  button.addEventListener('click', async () => {
    if (!getCachedAthleticsStaffDirectory().length) {
      await loadAthleticsStaffDirectory(access.athleteId);
    }
    const dialog = renderManagerDialog();
    dialog.showModal();
  });

  head.appendChild(button);
}

async function ensureStaffDirectory() {
  const access = getCurrentAccess();
  if (!access.athleteId || route() !== 'training') return;
  if (staffLoading || staffAthleteId === access.athleteId) return;

  staffLoading = true;
  try {
    await loadAthleticsStaffDirectory(access.athleteId);
    staffAthleteId = access.athleteId;
  } finally {
    staffLoading = false;
    clearOwnershipBadges();
    queueApply();
  }
}

function applyOwnershipUI() {
  if (applying || route() !== 'training') return;
  applying = true;

  try {
    const training = store.getState().training;
    applyWritePermission();
    applyTestOwnership(training);
    applySessionOwnership(training);
    applyGoalOwnership(training);
    ensureManagerButton();
    void ensureStaffDirectory();
  } finally {
    applying = false;
  }
}

function queueApply() {
  window.queueMicrotask(applyOwnershipUI);
}

function installCaptureGuard() {
  document.addEventListener('click', event => {
    if (route() !== 'training') return;

    const target = event.target.closest?.('button, [role="button"]');
    if (!target) return;

    if (!trainingWritable()) {
      const mutating = target.matches([
        '#add-training-test',
        '#empty-add-training-test',
        '#add-test-result',
        '#edit-training-test',
        '#delete-training-test',
        '#edit-weekly-program',
        '#add-training-session',
        '[data-add-day-session]',
        '[data-edit-training-session]',
        '[data-delete-result]',
        '#add-training-goal',
        '[data-edit-goal]',
      ].join(','));

      if (mutating) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    if (target.disabled || target.classList.contains('athletics-record-locked')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
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

installCaptureGuard();

observer = new MutationObserver(queueApply);
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.addEventListener('hashchange', queueApply);
store.subscribe(queueApply);
queueApply();
