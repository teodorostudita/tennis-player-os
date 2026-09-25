import { modules } from '../data/schema.js';
import {
  createOrUpdateAthleteAccess,
  getCurrentAccess,
  removeAthleteUser,
} from '../cloud/access.js';
import {
  loadOwnerAccessWorkspace,
  replaceOwnerUserAccess,
} from '../cloud/accessDirectory.js';
import { loginFromEmail, normalizeUsername } from '../cloud/loginIdentity.js';
import { showInAppConfirm } from '../ui/inAppMessages.js';

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

function roleLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function athleteLabel(athlete = {}) {
  return [athlete.firstName, athlete.lastName]
    .filter(Boolean)
    .join(' ')
    || athlete.displayName
    || 'Atleta';
}

function permissionValue(permission = {}) {
  if (permission.canWrite) return 'write';
  if (permission.canRead) return 'read';
  return 'none';
}

function blankPermissionMap() {
  return Object.fromEntries(modules.map(module => [module.id, 'none']));
}

function permissionMapFromAssignment(assignment = {}) {
  const map = blankPermissionMap();

  for (const permission of assignment.permissions || []) {
    if (!permission?.moduleKey || !(permission.moduleKey in map)) continue;
    map[permission.moduleKey] = permissionValue(permission);
  }

  return map;
}

function defaultAssignment(athleteId) {
  return {
    athleteId,
    role: 'member',
    status: 'active',
    permissions: blankPermissionMap(),
    protectedOwner: false,
  };
}

function assignmentDraft(assignment = {}) {
  return {
    athleteId: String(assignment.athleteId || ''),
    role: assignment.role === 'owner'
      ? 'owner'
      : assignment.role === 'admin'
        ? 'admin'
        : 'member',
    status: assignment.status || 'active',
    permissions: permissionMapFromAssignment(assignment),
    protectedOwner: assignment.role === 'owner',
  };
}

function userLogin(user = {}) {
  return loginFromEmail(user.email || '') || user.displayName || 'utente';
}

function permissionRows() {
  return modules.map(module => `
    <div class="access-permission-row" data-permission-row="${escapeAttr(module.id)}">
      <div class="access-module-copy">
        <span class="access-module-icon">${module.icon}</span>
        <span>
          <strong>${escapeHtml(module.name)}</strong>
          <small>${escapeHtml(module.subtitle)}</small>
        </span>
      </div>
      <select name="permission-${escapeAttr(module.id)}" aria-label="Permesso ${escapeAttr(module.name)}">
        <option value="none">Nessuno</option>
        <option value="read">Lettura</option>
        <option value="write">Lettura + scrittura</option>
      </select>
    </div>
  `).join('');
}

function renderShell(gate) {
  gate.innerHTML = `
    <section class="access-dialog access-dialog-v2" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <header class="access-dialog-head">
        <div>
          <div class="auth-kicker">Tennis Player OS</div>
          <h2 id="access-title">Utenti &amp; Accessi</h2>
          <p>Gestione utenti, atleti assegnati e privilegi del workspace.</p>
        </div>
        <button class="dialog-close access-close" type="button" aria-label="Chiudi">×</button>
      </header>

      <div class="access-dialog-body access-dialog-body-v2" id="access-dialog-body">
        <section class="access-members-panel access-members-panel-v2">
          <div class="access-section-head access-list-head">
            <div>
              <h3>Utenti</h3>
              <p>Seleziona un utente per visualizzarne la configurazione.</p>
            </div>
            <button class="button button-primary" type="button" id="access-new-user">+ Nuovo utente</button>
          </div>
          <div id="access-members-list" class="access-members-list">
            <div class="access-loading">Caricamento utenti…</div>
          </div>
        </section>

        <aside class="access-editor-panel access-editor-panel-v2" id="access-editor-panel" hidden>
          <div class="access-editor-scroll">
            <div class="access-section-head access-editor-head">
              <div>
                <div class="auth-kicker" id="access-editor-kicker">Utente</div>
                <h3 id="access-editor-title">Configurazione utente</h3>
                <p id="access-editor-subtitle"></p>
              </div>
            </div>

            <form id="access-form" class="access-form" novalidate>
              <input type="hidden" name="userId" />

              <label class="access-field">
                <span>Nome utente</span>
                <input
                  name="login"
                  type="text"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck="false"
                  required
                  placeholder="es. mario.rossi"
                />
                <small id="access-login-help">3–40 caratteri: lettere, numeri, punto, trattino o underscore.</small>
              </label>

              <div id="access-password-block">
                <label class="access-field">
                  <span>Password temporanea</span>
                  <input
                    name="temporaryPassword"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    placeholder="Minimo 8 caratteri"
                  />
                </label>

                <label class="access-field">
                  <span>Ripeti password temporanea</span>
                  <input
                    name="temporaryPasswordConfirm"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    placeholder="Ripeti la password"
                  />
                </label>

                <div class="access-info">
                  Questa password serve soltanto per il primo accesso. L’utente dovrà cambiarla subito.
                </div>
              </div>

              <section class="access-editor-section">
                <div class="access-permissions-head">
                  <div>
                    <strong>Atleti assegnati</strong>
                    <small>Ogni atleta può avere ruolo e privilegi differenti.</small>
                  </div>
                </div>

                <div id="access-athlete-rows" class="access-athlete-choice-list"></div>
              </section>

              <section class="access-editor-section access-assignment-editor" id="access-assignment-editor">
                <div class="access-permissions-head access-assignment-head">
                  <div>
                    <strong>Privilegi per atleta</strong>
                    <small>Seleziona l’atleta da configurare.</small>
                  </div>
                </div>

                <div id="access-assignment-tabs" class="access-assignment-tabs"></div>
                <div id="access-no-assignment" class="access-info" hidden>
                  Seleziona almeno un atleta per impostare ruolo e privilegi.
                </div>

                <div id="access-assignment-fields">
                  <label class="access-field">
                    <span id="access-role-label">Ruolo</span>
                    <select name="role">
                      <option value="member">Member — privilegi per modulo</option>
                      <option value="admin">Admin — accesso completo</option>
                      <option value="owner" disabled>Owner — protetto</option>
                    </select>
                  </label>

                  <div id="access-admin-note" class="access-info" hidden>
                    Un Admin può leggere e modificare tutti i moduli di questo atleta e può creare nuovi atleti.
                  </div>

                  <div id="access-owner-note" class="access-info" hidden>
                    L’assegnazione Owner è protetta e non può essere modificata da questo pannello.
                  </div>

                  <div id="access-permissions-block">
                    <div class="access-permissions-head">
                      <div>
                        <strong>Privilegi per modulo</strong>
                        <small>“Lettura + scrittura” include sempre anche la lettura.</small>
                      </div>
                      <div class="access-permission-shortcuts" id="access-permission-shortcuts">
                        <button type="button" class="auth-text-button" data-permissions-all="read">Tutti lettura</button>
                        <button type="button" class="auth-text-button" data-permissions-all="write">Tutti scrittura</button>
                        <button type="button" class="auth-text-button" data-permissions-all="none">Azzera</button>
                      </div>
                    </div>
                    <div id="access-permission-rows" class="access-permission-rows">
                      ${permissionRows()}
                    </div>
                  </div>
                </div>
              </section>

              <div id="access-message" class="auth-message" role="status" aria-live="polite"></div>
            </form>
          </div>

          <div class="access-editor-footer">
            <button class="button button-danger-ghost" type="button" id="access-delete-user" hidden>Elimina</button>
            <div class="access-editor-footer-main">
              <button class="button button-ghost" type="button" id="access-cancel">Annulla</button>
              <button class="button button-primary" type="button" id="access-modify" hidden>Modifica</button>
              <button class="button button-primary" type="button" id="access-save" hidden>Salva</button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function setMessage(gate, message = '', kind = '') {
  const box = gate.querySelector('#access-message');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-message${kind ? ` ${kind}` : ''}`;
}

function editorState(gate) {
  return gate.__tposAccessEditor;
}

function workspace(gate) {
  return editorState(gate)?.workspace || { athletes: [], users: [] };
}

function athleteById(gate, athleteId) {
  return workspace(gate).athletes.find(athlete => athlete.id === athleteId) || null;
}

function assignmentIds(draft) {
  return Object.keys(draft?.assignments || {});
}

function activeAssignment(gate) {
  const state = editorState(gate);
  if (!state?.draft?.activeAthleteId) return null;
  return state.draft.assignments[state.draft.activeAthleteId] || null;
}

function isEditableMode(gate) {
  const mode = editorState(gate)?.mode;
  return mode === 'new' || mode === 'edit';
}

function isProtectedUser(gate) {
  return Boolean(editorState(gate)?.draft?.hasOwnerRole);
}

function memberRole(user = {}) {
  if (user.hasOwnerRole || user.strongestRole === 'owner') return 'owner';
  if (user.strongestRole === 'admin') return 'admin';
  return 'member';
}

function memberSummary(gate, user) {
  const names = (user.assignments || [])
    .map(assignment => athleteLabel(athleteById(gate, assignment.athleteId) || {}))
    .filter(Boolean);

  if (!names.length) return 'Nessun atleta assegnato';
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} · +${names.length - 2}`;
}

function memberCards(gate) {
  const state = editorState(gate);
  const selectedUserId = state?.draft?.userId || '';
  const users = workspace(gate).users || [];

  if (!users.length) {
    return '<p class="access-empty">Nessun utente configurato.</p>';
  }

  return users.map(user => {
    const login = userLogin(user);
    const role = memberRole(user);
    const selected = selectedUserId === user.userId;

    return `
      <button
        class="access-member-card access-member-card-v2 ${selected ? 'selected' : ''}"
        type="button"
        data-select-member="${escapeAttr(user.userId)}"
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        <span class="access-member-avatar" aria-hidden="true">${escapeHtml(login.charAt(0).toUpperCase() || 'U')}</span>
        <span class="access-member-copy">
          <span class="access-member-name">
            ${escapeHtml(login)}
            <span class="access-role-badge role-${escapeAttr(role)}">${escapeHtml(roleLabel(role))}</span>
          </span>
          <span class="access-member-summary">${escapeHtml(memberSummary(gate, user))}</span>
        </span>
        <span class="access-user-chevron" aria-hidden="true">›</span>
      </button>
    `;
  }).join('');
}

function renderMembers(gate) {
  const list = gate.querySelector('#access-members-list');
  if (!list) return;
  list.innerHTML = memberCards(gate);

  list.querySelectorAll('[data-select-member]').forEach(button => {
    button.addEventListener('click', () => {
      openExistingUser(gate, button.dataset.selectMember);
    });
  });
}

function showEditor(gate, visible) {
  const panel = gate.querySelector('#access-editor-panel');
  const body = gate.querySelector('#access-dialog-body');
  if (!panel || !body) return;

  panel.hidden = !visible;
  body.classList.toggle('access-editor-open', visible);
}

function userToDraft(user) {
  const assignments = {};

  for (const assignment of user.assignments || []) {
    assignments[assignment.athleteId] = assignmentDraft(assignment);
  }

  return {
    userId: user.userId,
    login: userLogin(user),
    hasOwnerRole: Boolean(user.hasOwnerRole),
    assignments,
    activeAthleteId: assignmentIds({ assignments })[0] || '',
  };
}

function newDraft(gate) {
  const athletes = workspace(gate).athletes || [];
  const state = editorState(gate);
  const preferred = athletes.find(athlete => athlete.id === state.contextAthleteId) || athletes[0] || null;
  const assignments = {};

  if (preferred) {
    assignments[preferred.id] = defaultAssignment(preferred.id);
  }

  return {
    userId: '',
    login: '',
    hasOwnerRole: false,
    assignments,
    activeAthleteId: preferred?.id || '',
  };
}

function setControlDisabled(control, disabled) {
  if (control) control.disabled = Boolean(disabled);
}

function persistActiveAssignment(gate) {
  const state = editorState(gate);
  const assignment = activeAssignment(gate);
  const form = gate.querySelector('#access-form');
  if (!state || !assignment || !form || !isEditableMode(gate)) return;
  if (assignment.protectedOwner) return;

  assignment.role = String(form.elements.role?.value || 'member');

  for (const module of modules) {
    const select = form.elements[`permission-${module.id}`];
    assignment.permissions[module.id] = String(select?.value || 'none');
  }
}

function updateAssignmentFields(gate) {
  const state = editorState(gate);
  const form = gate.querySelector('#access-form');
  const fields = gate.querySelector('#access-assignment-fields');
  const empty = gate.querySelector('#access-no-assignment');
  const adminNote = gate.querySelector('#access-admin-note');
  const ownerNote = gate.querySelector('#access-owner-note');
  const permissionsBlock = gate.querySelector('#access-permissions-block');
  const shortcuts = gate.querySelector('#access-permission-shortcuts');
  const roleLabelNode = gate.querySelector('#access-role-label');
  const assignment = activeAssignment(gate);

  if (!form || !fields || !empty) return;

  const hasAssignment = Boolean(assignment);
  fields.hidden = !hasAssignment;
  empty.hidden = hasAssignment;
  if (!hasAssignment) return;

  const athlete = athleteById(gate, assignment.athleteId);
  if (roleLabelNode) {
    roleLabelNode.textContent = `Ruolo — ${athleteLabel(athlete || {})}`;
  }

  form.elements.role.value = assignment.role;

  for (const module of modules) {
    const select = form.elements[`permission-${module.id}`];
    if (select) select.value = assignment.permissions[module.id] || 'none';
  }

  const editable = isEditableMode(gate) && !assignment.protectedOwner && !isProtectedUser(gate);
  setControlDisabled(form.elements.role, !editable);

  const implicitFullAccess = assignment.role === 'admin' || assignment.role === 'owner';
  if (adminNote) adminNote.hidden = assignment.role !== 'admin';
  if (ownerNote) ownerNote.hidden = assignment.role !== 'owner';
  if (permissionsBlock) permissionsBlock.hidden = implicitFullAccess;
  if (shortcuts) shortcuts.hidden = !editable || implicitFullAccess;

  for (const module of modules) {
    setControlDisabled(form.elements[`permission-${module.id}`], !editable || implicitFullAccess);
  }
}

function renderAssignmentTabs(gate) {
  const state = editorState(gate);
  const container = gate.querySelector('#access-assignment-tabs');
  if (!state || !container) return;

  const ids = assignmentIds(state.draft);
  if (ids.length && !ids.includes(state.draft.activeAthleteId)) {
    state.draft.activeAthleteId = ids[0];
  }
  if (!ids.length) state.draft.activeAthleteId = '';

  container.innerHTML = ids.map(athleteId => {
    const athlete = athleteById(gate, athleteId);
    const assignment = state.draft.assignments[athleteId];
    const active = athleteId === state.draft.activeAthleteId;
    return `
      <button
        type="button"
        class="access-assignment-tab ${active ? 'active' : ''}"
        data-assignment-tab="${escapeAttr(athleteId)}"
      >
        <span>${escapeHtml(athleteLabel(athlete || {}))}</span>
        <small>${escapeHtml(roleLabel(assignment.role))}</small>
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-assignment-tab]').forEach(button => {
    button.addEventListener('click', () => {
      persistActiveAssignment(gate);
      state.draft.activeAthleteId = button.dataset.assignmentTab;
      renderAssignmentTabs(gate);
      updateAssignmentFields(gate);
    });
  });

  updateAssignmentFields(gate);
}

function renderAthleteChoices(gate) {
  const state = editorState(gate);
  const container = gate.querySelector('#access-athlete-rows');
  if (!state || !container) return;

  const editable = isEditableMode(gate) && !isProtectedUser(gate);

  container.innerHTML = (workspace(gate).athletes || []).map(athlete => {
    const assignment = state.draft.assignments[athlete.id];
    const checked = Boolean(assignment);
    const protectedOwner = assignment?.protectedOwner;

    return `
      <label class="access-athlete-choice ${checked ? 'selected' : ''}">
        <span class="access-athlete-choice-copy">
          <span class="access-module-icon">🎾</span>
          <span>
            <strong>${escapeHtml(athleteLabel(athlete))}</strong>
            <small>${protectedOwner ? 'Owner — assegnazione protetta' : checked ? roleLabel(assignment.role) : 'Non assegnato'}</small>
          </span>
        </span>
        <input
          type="checkbox"
          name="athleteIds"
          value="${escapeAttr(athlete.id)}"
          ${checked ? 'checked' : ''}
          ${!editable || protectedOwner ? 'disabled' : ''}
          aria-label="Assegna ${escapeAttr(athleteLabel(athlete))}"
        />
      </label>
    `;
  }).join('');

  container.querySelectorAll('input[name="athleteIds"]').forEach(input => {
    input.addEventListener('change', () => {
      persistActiveAssignment(gate);
      const athleteId = input.value;

      if (input.checked) {
        state.draft.assignments[athleteId] ||= defaultAssignment(athleteId);
        state.draft.activeAthleteId = athleteId;
      } else {
        delete state.draft.assignments[athleteId];
        if (state.draft.activeAthleteId === athleteId) {
          state.draft.activeAthleteId = assignmentIds(state.draft)[0] || '';
        }
      }

      renderAthleteChoices(gate);
      renderAssignmentTabs(gate);
    });
  });
}

function setFormMode(gate) {
  const state = editorState(gate);
  const form = gate.querySelector('#access-form');
  const passwordBlock = gate.querySelector('#access-password-block');
  const loginHelp = gate.querySelector('#access-login-help');
  const modifyButton = gate.querySelector('#access-modify');
  const saveButton = gate.querySelector('#access-save');
  const deleteButton = gate.querySelector('#access-delete-user');
  if (!state || !form) return;

  const isNew = state.mode === 'new';
  const isEdit = state.mode === 'edit';
  const isView = state.mode === 'view';
  const protectedUser = Boolean(state.draft.hasOwnerRole);

  form.elements.userId.value = state.draft.userId || '';
  form.elements.login.value = state.draft.login || '';
  form.elements.login.readOnly = !isNew;
  setControlDisabled(form.elements.login, false);

  if (passwordBlock) passwordBlock.hidden = !isNew;
  if (loginHelp) {
    loginHelp.textContent = isNew
      ? '3–40 caratteri: lettere, numeri, punto, trattino o underscore. Gli account legacy con email restano compatibili.'
      : 'Il nome utente non può essere cambiato da questo pannello.';
  }

  for (const name of ['temporaryPassword', 'temporaryPasswordConfirm']) {
    const input = form.elements[name];
    if (!input) continue;
    input.disabled = !isNew;
    if (!isNew) input.value = '';
  }

  if (modifyButton) modifyButton.hidden = !isView || protectedUser;
  if (saveButton) saveButton.hidden = !(isNew || isEdit);
  if (deleteButton) deleteButton.hidden = !isView || protectedUser;

  gate.querySelector('#access-editor-kicker').textContent = isNew ? 'Nuovo account' : protectedUser ? 'Account protetto' : 'Account';
  gate.querySelector('#access-editor-title').textContent = isNew ? 'Nuovo utente' : state.draft.login;
  gate.querySelector('#access-editor-subtitle').textContent = isNew
    ? 'Crea l’account, assegna gli atleti e configura i privilegi di ciascuno.'
    : protectedUser
      ? 'Puoi consultare le assegnazioni Owner, ma non modificarle o eliminarle.'
      : isEdit
        ? 'Modifica atleti, ruoli e privilegi. Le modifiche valgono indipendentemente dall’atleta aperto nell’app.'
        : 'Configurazione attuale dell’utente in tutto il workspace gestibile.';

  renderAthleteChoices(gate);
  renderAssignmentTabs(gate);
}

function resetFormMessages(gate) {
  setMessage(gate, '');
}

function openNewUser(gate) {
  const state = editorState(gate);
  state.mode = 'new';
  state.originalUserId = '';
  state.draft = newDraft(gate);

  const form = gate.querySelector('#access-form');
  form?.reset();
  resetFormMessages(gate);
  showEditor(gate, true);
  setFormMode(gate);
  renderMembers(gate);
  requestAnimationFrame(() => form?.elements?.login?.focus());
}

function openExistingUser(gate, userId, mode = 'view') {
  const state = editorState(gate);
  const user = workspace(gate).users.find(item => item.userId === userId);
  if (!user) return;

  persistActiveAssignment(gate);
  state.mode = mode;
  state.originalUserId = userId;
  state.draft = userToDraft(user);

  resetFormMessages(gate);
  showEditor(gate, true);
  setFormMode(gate);
  renderMembers(gate);
}

function closeEditor(gate) {
  const state = editorState(gate);
  if (!state) return;
  state.mode = 'list';
  state.originalUserId = '';
  state.draft = null;
  resetFormMessages(gate);
  showEditor(gate, false);
  renderMembers(gate);
}

function collectPermissionPayload(assignment) {
  if (assignment.role !== 'member') return [];

  return modules.flatMap(module => {
    const value = assignment.permissions[module.id] || 'none';
    if (value === 'none') return [];
    return [{
      moduleKey: module.id,
      canRead: true,
      canWrite: value === 'write',
    }];
  });
}

function collectAssignmentPayload(gate) {
  persistActiveAssignment(gate);
  const state = editorState(gate);

  return assignmentIds(state.draft).map(athleteId => {
    const assignment = state.draft.assignments[athleteId];
    return {
      athleteId,
      role: assignment.role === 'admin' ? 'admin' : 'member',
      permissions: collectPermissionPayload(assignment),
    };
  });
}

async function refreshWorkspace(gate) {
  const state = editorState(gate);
  const previousUserId = state?.draft?.userId || state?.originalUserId || '';
  const workspaceData = await loadOwnerAccessWorkspace();
  state.workspace = workspaceData;

  if (previousUserId) {
    const fresh = workspaceData.users.find(user => user.userId === previousUserId);
    if (fresh && state.mode !== 'list' && state.mode !== 'new') {
      state.draft = userToDraft(fresh);
    }
  }

  renderMembers(gate);
}

async function saveEditor(gate) {
  const state = editorState(gate);
  const form = gate.querySelector('#access-form');
  const saveButton = gate.querySelector('#access-save');
  if (!state || !form || !saveButton) return;

  const assignments = collectAssignmentPayload(gate);
  if (!assignments.length) {
    setMessage(gate, 'Seleziona almeno un atleta da assegnare all’utente.', 'error');
    return;
  }

  const isNew = state.mode === 'new';
  const login = String(form.elements.login?.value || '').trim();
  let userId = state.draft.userId || '';

  if (isNew) {
    if (!login) {
      setMessage(gate, 'Inserisci un nome utente.', 'error');
      return;
    }

    if (!login.includes('@')) {
      try {
        normalizeUsername(login);
      } catch (error) {
        setMessage(gate, error?.message || 'Nome utente non valido.', 'error');
        return;
      }
    }

    const temporaryPassword = String(form.elements.temporaryPassword?.value || '');
    const confirmation = String(form.elements.temporaryPasswordConfirm?.value || '');

    if (temporaryPassword.length < 8) {
      setMessage(gate, 'La password temporanea deve contenere almeno 8 caratteri.', 'error');
      return;
    }

    if (temporaryPassword !== confirmation) {
      setMessage(gate, 'Le due password temporanee non coincidono.', 'error');
      return;
    }
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Salvataggio…';
  resetFormMessages(gate);

  try {
    let accountCreated = false;

    if (isNew) {
      // Account creation remains server-side. Initial module permissions are
      // deliberately empty (fail closed); the transactional RPC below then
      // applies the exact per-athlete configuration selected in the editor.
      const creation = await createOrUpdateAthleteAccess({
        athleteId: state.contextAthleteId,
        athleteIds: assignments.map(item => item.athleteId),
        login,
        temporaryPassword: String(form.elements.temporaryPassword?.value || ''),
        role: 'member',
        permissions: [],
      });

      userId = String(creation?.userId || '');
      accountCreated = Boolean(creation?.accountCreated);

      if (!userId) {
        throw new Error('L’account è stato creato ma non è stato restituito il suo identificativo.');
      }
    }

    await replaceOwnerUserAccess({
      userId,
      assignments,
      // A newly created account has no pre-existing assignments. If the
      // username already existed, preserve assignments outside this owner’s
      // current selection rather than silently removing them from the New flow.
      removeMissing: isNew ? accountCreated : true,
    });

    state.originalUserId = userId;
    state.mode = 'view';
    await refreshWorkspace(gate);

    const savedUser = state.workspace.users.find(user => user.userId === userId);
    if (savedUser) state.draft = userToDraft(savedUser);

    setFormMode(gate);
    renderMembers(gate);
    setMessage(
      gate,
      isNew
        ? accountCreated
          ? 'Utente creato. Atleti e privilegi sono stati salvati.'
          : 'Account esistente trovato: le nuove assegnazioni e i relativi privilegi sono stati salvati.'
        : 'Configurazione utente aggiornata.',
      'success',
    );
  } catch (error) {
    setMessage(gate, error?.message || 'Impossibile salvare l’utente.', 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salva';
  }
}

async function deleteCurrentUser(gate) {
  const state = editorState(gate);
  const userId = state?.draft?.userId;
  if (!state || !userId || state.draft.hasOwnerRole) return;

  const user = state.workspace.users.find(item => item.userId === userId);
  if (!user) return;

  const confirmed = await showInAppConfirm(
    `Eliminare definitivamente “${userLogin(user)}”? Verranno rimosse tutte le assegnazioni che puoi gestire.`,
    {
      title: 'Elimina utente',
      confirmLabel: 'Elimina',
      danger: true,
    },
  );
  if (!confirmed) return;

  const deleteButton = gate.querySelector('#access-delete-user');
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.textContent = 'Eliminazione…';
  }

  try {
    const removable = (user.assignments || []).filter(assignment => assignment.role !== 'owner');
    if (!removable.length) {
      throw new Error('Questo utente non ha assegnazioni eliminabili.');
    }

    let lastResult = null;
    for (const assignment of removable) {
      lastResult = await removeAthleteUser({
        athleteId: assignment.athleteId,
        userId,
      });
    }

    closeEditor(gate);
    await refreshWorkspace(gate);

    const listMessage = lastResult?.accountDeleted
      ? 'Utente eliminato completamente.'
      : 'Le assegnazioni gestibili sono state rimosse; l’account è stato conservato perché esistono altre assegnazioni.';

    const list = gate.querySelector('#access-members-list');
    list?.insertAdjacentHTML(
      'afterbegin',
      `<div class="auth-message success access-list-message">${escapeHtml(listMessage)}</div>`,
    );
  } catch (error) {
    setMessage(gate, error?.message || 'Impossibile eliminare l’utente.', 'error');
  } finally {
    if (deleteButton) {
      deleteButton.disabled = false;
      deleteButton.textContent = 'Elimina';
    }
  }
}

function bindStaticEvents(gate) {
  const close = () => gate.remove();

  gate.querySelector('.access-close')?.addEventListener('click', close);
  gate.addEventListener('click', event => {
    if (event.target === gate) close();
  });

  gate.querySelector('#access-new-user')?.addEventListener('click', () => {
    openNewUser(gate);
  });

  gate.querySelector('#access-cancel')?.addEventListener('click', () => {
    const state = editorState(gate);
    if (state?.mode === 'edit' && state.originalUserId) {
      openExistingUser(gate, state.originalUserId, 'view');
      return;
    }
    closeEditor(gate);
  });

  gate.querySelector('#access-modify')?.addEventListener('click', () => {
    const state = editorState(gate);
    if (!state?.draft?.userId || state.draft.hasOwnerRole) return;
    openExistingUser(gate, state.draft.userId, 'edit');
  });

  gate.querySelector('#access-save')?.addEventListener('click', () => {
    void saveEditor(gate);
  });

  gate.querySelector('#access-delete-user')?.addEventListener('click', () => {
    void deleteCurrentUser(gate);
  });

  gate.querySelector('#access-form')?.elements.role?.addEventListener('change', () => {
    persistActiveAssignment(gate);
    renderAthleteChoices(gate);
    renderAssignmentTabs(gate);
  });

  gate.querySelectorAll('[data-permissions-all]').forEach(button => {
    button.addEventListener('click', () => {
      if (!isEditableMode(gate)) return;
      const assignment = activeAssignment(gate);
      if (!assignment || assignment.role !== 'member' || assignment.protectedOwner) return;

      const value = button.dataset.permissionsAll;
      const form = gate.querySelector('#access-form');

      for (const module of modules) {
        const select = form.elements[`permission-${module.id}`];
        if (select) select.value = value;
        assignment.permissions[module.id] = value;
      }
    });
  });
}

export async function openAccessManagement({ athleteId }) {
  const access = getCurrentAccess();

  if (!access.isOwner || access.athleteId !== athleteId) {
    return;
  }

  if (document.querySelector('[data-access-management]')) return;

  const gate = document.createElement('div');
  gate.className = 'access-gate';
  gate.dataset.accessManagement = 'true';
  gate.__tposAccessEditor = {
    contextAthleteId: athleteId,
    workspace: { athletes: [], users: [] },
    mode: 'list',
    originalUserId: '',
    draft: null,
  };

  renderShell(gate);
  document.body.appendChild(gate);
  bindStaticEvents(gate);
  showEditor(gate, false);

  try {
    await refreshWorkspace(gate);
  } catch (error) {
    const list = gate.querySelector('#access-members-list');
    if (list) {
      list.innerHTML = `
        <div class="auth-message error">
          ${escapeHtml(error?.message || 'Impossibile leggere utenti e privilegi.')}
        </div>
      `;
    }
  }
}

export function mountAccessManagementControl({ athleteId }) {
  const access = getCurrentAccess();
  const actions = document.querySelector('.topbar-actions');

  if (
    !actions
    || !access.isOwner
    || access.athleteId !== athleteId
    || actions.querySelector('[data-access-control]')
  ) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost access-topbar-button';
  button.dataset.accessControl = 'true';
  button.innerHTML = '<span aria-hidden="true">♙</span><span>Utenti &amp; Accessi</span>';
  button.title = 'Gestisci account e privilegi del workspace';

  button.addEventListener('click', () => {
    void openAccessManagement({ athleteId });
  });

  actions.prepend(button);
}
