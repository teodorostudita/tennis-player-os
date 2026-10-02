import { modules } from '../data/schema.js?v=1.2.4';
import {
  normalizeUserType,
  permissionPresetForUserType,
  userTypeDescription,
  userTypeLabel,
  userTypeOptionsMarkup,
} from '../data/userTypes.js?v=1.2.4';
import {
  createOrUpdateAthleteAccess,
  deleteManagedAccount,
  getCurrentAccess,
  removeAthleteUser,
} from '../cloud/access.js?v=1.2.4';
import {
  loadOwnerAccessWorkspace,
  replaceOwnerUserAccess,
  saveOwnerUserAccountOptions,
} from '../cloud/accessDirectory.js?v=1.2.4';
import { isAppOwner } from '../cloud/accountAccess.js?v=1.2.4';
import { emailFromLogin, loginFromEmail, normalizeUsername } from '../cloud/loginIdentity.js?v=1.2.4';
import { showInAppConfirm } from '../ui/inAppMessages.js?v=1.2.4';

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

function defaultAssignment(athleteId, role = 'member') {
  return {
    athleteId,
    role: role === 'admin' ? 'admin' : 'member',
    status: 'active',
    permissions: blankPermissionMap(),
    protectedOwner: false,
  };
}

function applyUserTypePresetToAssignment(assignment, userType) {
  if (!assignment || assignment.protectedOwner) return false;

  const preset = permissionPresetForUserType(
    userType,
    modules.map(module => module.id),
  );

  if (!preset) return false;

  assignment.role = preset.role;
  assignment.permissions = {
    ...blankPermissionMap(),
    ...preset.permissions,
  };

  return true;
}

function defaultAssignmentForUserType(
  athleteId,
  userType = 'custom',
  isBetaOwner = false,
) {
  if (isBetaOwner) {
    return defaultAssignment(athleteId, 'admin');
  }

  const assignment = defaultAssignment(athleteId, 'member');
  applyUserTypePresetToAssignment(assignment, userType);
  return assignment;
}

function applyUserTypePreset(gate, userType) {
  const state = editorState(gate);
  if (!state?.draft) return false;

  persistActiveAssignment(gate);

  let changed = false;
  for (const assignment of Object.values(state.draft.assignments || {})) {
    changed = applyUserTypePresetToAssignment(assignment, userType) || changed;
  }

  return changed;
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
              <small class="access-beta-counter" id="access-beta-counter" hidden></small>
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

              <label class="access-field">
                <span>Email di contatto</span>
                <input
                  name="contactEmail"
                  type="email"
                  autocomplete="email"
                  placeholder="nome@email.it"
                />
                <small id="access-contact-email-help">L’email tecnica di login resta separata. Se non inserisci una mail reale, resta quella tecnica generata dal nome utente.</small>
              </label>

              <div class="access-profile-block">
                <label class="access-field">
                  <span>Profilo utente</span>
                  <select name="userType">
                    ${userTypeOptionsMarkup()}
                  </select>
                  <small id="access-user-type-help">Il profilo definisce i privilegi consigliati e sarà la base della Home personale. I permessi restano sempre modificabili.</small>
                </label>
                <button
                  class="auth-text-button access-profile-preset"
                  type="button"
                  id="access-apply-profile-preset"
                  hidden
                >
                  Applica privilegi consigliati
                </button>
              </div>

              <label class="access-beta-toggle" id="access-beta-toggle" hidden>
                <input name="isBetaOwner" type="checkbox" />
                <span>
                  <strong>Founding Beta Owner</strong>
                  <small>Default: scrittura completa sul proprio atleta e creazione massima di 1 atleta. I privilegi restano personalizzabili.</small>
                </span>
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
  if (user.isBetaOwner || user.accountRole === 'admin' || user.strongestRole === 'admin') return 'admin';
  return 'member';
}

function memberSummary(gate, user) {
  const names = (user.assignments || [])
    .map(assignment => athleteLabel(athleteById(gate, assignment.athleteId) || {}))
    .filter(Boolean);

  if (!names.length) return user.isBetaOwner
    ? 'Founding Beta · nessun atleta ancora'
    : 'Nessun atleta assegnato';
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
            <span class="access-role-badge role-profile">${escapeHtml(userTypeLabel(user.userType))}</span>
            ${user.isBetaOwner ? '<span class="access-role-badge role-beta">Beta</span>' : ''}
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

  const betaCounter = gate.querySelector('#access-beta-counter');
  if (betaCounter) {
    const beta = workspace(gate).beta || {};
    betaCounter.hidden = !isAppOwner();
    betaCounter.textContent = `Founding Beta: ${Number(beta.active || 0)}/${Number(beta.capacity || 30)} · ${Number(beta.remaining || 0)} disponibili`;
  }

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
    contactEmail: String(user.contactEmail || user.email || ''),
    userType: normalizeUserType(user.userType),
    isBetaOwner: Boolean(user.isBetaOwner),
    athleteCreationLimit: user.athleteCreationLimit == null ? null : Number(user.athleteCreationLimit),
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
    contactEmail: '',
    userType: 'custom',
    isBetaOwner: false,
    athleteCreationLimit: null,
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
        state.draft.assignments[athleteId] ||= defaultAssignmentForUserType(
          athleteId,
          state.draft.userType,
          state.draft.isBetaOwner,
        );
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
  const contactHelp = gate.querySelector('#access-contact-email-help');
  const userTypeHelp = gate.querySelector('#access-user-type-help');
  const profilePresetButton = gate.querySelector('#access-apply-profile-preset');
  const betaToggle = gate.querySelector('#access-beta-toggle');
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
  form.elements.contactEmail.value = state.draft.contactEmail || '';
  form.elements.userType.value = normalizeUserType(state.draft.userType);
  form.elements.isBetaOwner.checked = Boolean(state.draft.isBetaOwner);
  form.elements.login.readOnly = !isNew;
  form.elements.contactEmail.readOnly = !isAppOwner() || isView;
  setControlDisabled(form.elements.login, false);
  setControlDisabled(
    form.elements.userType,
    isView || (!isNew && !isAppOwner()),
  );
  setControlDisabled(form.elements.isBetaOwner, !isAppOwner() || isView || protectedUser);
  if (betaToggle) betaToggle.hidden = !isAppOwner();
  if (contactHelp) {
    contactHelp.textContent = state.draft.isBetaOwner
      ? 'Email amministrativa/di contatto. Non modifica il nome utente tecnico usato per il login.'
      : 'Se non conosci una mail reale, puoi lasciare quella tecnica generata dal nome utente.';
  }

  const normalizedUserType = normalizeUserType(state.draft.userType);
  if (userTypeHelp) {
    userTypeHelp.textContent = `${userTypeDescription(normalizedUserType)} I permessi restano sempre modificabili.`;
  }
  if (profilePresetButton) {
    const canApplyPreset = (
      isEditableMode(gate)
      && !protectedUser
      && normalizedUserType !== 'custom'
      && assignmentIds(state.draft).length > 0
    );
    profilePresetButton.hidden = !canApplyPreset;
    profilePresetButton.textContent = isNew
      ? 'Ripristina privilegi consigliati'
      : 'Applica privilegi consigliati';
  }

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

  if (modifyButton) {
    modifyButton.hidden = !isView || (protectedUser && !isAppOwner());
    modifyButton.textContent = protectedUser ? 'Modifica profilo' : 'Modifica';
  }
  if (saveButton) saveButton.hidden = !(isNew || isEdit);
  if (deleteButton) deleteButton.hidden = !isView || protectedUser;

  gate.querySelector('#access-editor-kicker').textContent = isNew ? 'Nuovo account' : protectedUser ? 'Account protetto' : 'Account';
  gate.querySelector('#access-editor-title').textContent = isNew ? 'Nuovo utente' : state.draft.login;
  gate.querySelector('#access-editor-subtitle').textContent = isNew
    ? 'Crea l’account, scegli il profilo e configura eventuali atleti/privilegi.'
    : protectedUser
      ? isEdit
        ? 'Puoi modificare profilo utente ed email di contatto; assegnazioni e privilegi Owner restano protetti.'
        : 'Le assegnazioni Owner sono protette. Profilo utente ed email di contatto possono essere modificati separatamente.'
      : isEdit
        ? 'Modifica profilo, atleti, ruoli e privilegi. Cambiare profilo non sovrascrive automaticamente i permessi esistenti.'
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
  state.contactEmailEdited = false;

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
  const isNew = state.mode === 'new';
  const login = String(form.elements.login?.value || '').trim();
  const contactEmail = String(form.elements.contactEmail?.value || '').trim();
  const userType = normalizeUserType(form.elements.userType?.value);
  const isBetaOwner = Boolean(form.elements.isBetaOwner?.checked) && isAppOwner();
  const originalUser = state.draft?.userId
    ? workspace(gate).users.find(user => user.userId === state.draft.userId)
    : null;

  if (!assignments.length && !isBetaOwner) {
    setMessage(gate, 'Seleziona almeno un atleta oppure abilita Founding Beta Owner.', 'error');
    return;
  }

  if (!assignments.length && !isNew && (originalUser?.assignments || []).length) {
    setMessage(gate, 'Non rimuovere qui l’ultimo atleta assegnato: mantienilo oppure elimina l’account.', 'error');
    return;
  }

  if (contactEmail && !form.elements.contactEmail?.validity?.valid) {
    setMessage(gate, 'Inserisci un indirizzo email di contatto valido.', 'error');
    return;
  }

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
        contactEmail,
        isBetaOwner,
        userType,
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

    if (assignments.length && !state.draft.hasOwnerRole) {
      await replaceOwnerUserAccess({
        userId,
        assignments,
        // A newly created account has no pre-existing assignments. If the
        // username already existed, preserve assignments outside this owner’s
        // current selection rather than silently removing them from the New flow.
        removeMissing: isNew ? accountCreated : true,
      });
    }

    if (isAppOwner()) {
      await saveOwnerUserAccountOptions({
        userId,
        contactEmail,
        isBetaOwner,
        userType,
      });
    }

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
        ? isBetaOwner
          ? `Founding Beta Owner creato con profilo ${userTypeLabel(userType)}. Potrà creare un solo atleta; i privilegi restano personalizzabili.`
          : accountCreated
            ? 'Utente creato. Atleti, email e privilegi sono stati salvati.'
            : 'Account esistente trovato: assegnazioni, email e privilegi sono stati salvati.'
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
    let lastResult = null;

    if (!removable.length && user.isBetaOwner && isAppOwner()) {
      lastResult = await deleteManagedAccount({ userId });
    } else {
      if (!removable.length) {
        throw new Error('Questo utente non ha assegnazioni eliminabili.');
      }

      for (const assignment of removable) {
        lastResult = await removeAthleteUser({
          athleteId: assignment.athleteId,
          userId,
        });
      }
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

  gate.querySelector('#access-form')?.elements.login?.addEventListener('input', event => {
    const state = editorState(gate);
    const form = gate.querySelector('#access-form');
    if (!state || state.mode !== 'new' || state.contactEmailEdited || !form) return;

    try {
      form.elements.contactEmail.value = emailFromLogin(event.target.value || '');
      state.draft.contactEmail = form.elements.contactEmail.value;
    } catch (_) {
      form.elements.contactEmail.value = '';
    }
  });

  gate.querySelector('#access-form')?.elements.contactEmail?.addEventListener('input', event => {
    const state = editorState(gate);
    if (!state) return;
    state.contactEmailEdited = true;
    state.draft.contactEmail = String(event.target.value || '');
  });

  gate.querySelector('#access-form')?.elements.userType?.addEventListener('change', event => {
    const state = editorState(gate);
    if (!state || !isEditableMode(gate)) return;

    persistActiveAssignment(gate);
    const nextType = normalizeUserType(event.target.value);
    state.draft.userType = nextType;

    // On first creation the selected profile is a true preset: apply it
    // immediately. On existing users, changing profile only changes the
    // classification/Home; permissions stay untouched unless requested.
    if (state.mode === 'new' && nextType !== 'custom') {
      applyUserTypePreset(gate, nextType);
      renderAthleteChoices(gate);
      renderAssignmentTabs(gate);
    }

    setFormMode(gate);
  });

  gate.querySelector('#access-apply-profile-preset')?.addEventListener('click', () => {
    const state = editorState(gate);
    if (!state || !isEditableMode(gate)) return;

    const userType = normalizeUserType(state.draft.userType);
    if (userType === 'custom') return;

    if (applyUserTypePreset(gate, userType)) {
      renderAthleteChoices(gate);
      renderAssignmentTabs(gate);
      setMessage(
        gate,
        `Applicati i privilegi consigliati per ${userTypeLabel(userType)}. Puoi ancora modificarli prima di salvare.`,
        'success',
      );
    }
  });

  gate.querySelector('#access-form')?.elements.isBetaOwner?.addEventListener('change', event => {
    const state = editorState(gate);
    if (!state || !isEditableMode(gate) || !isAppOwner()) return;

    persistActiveAssignment(gate);
    state.draft.isBetaOwner = Boolean(event.target.checked);

    // New Beta Owners start in a clean workspace. They create their own athlete.
    // Existing assignments can still be added back manually and customized.
    if (state.mode === 'new' && state.draft.isBetaOwner) {
      state.draft.assignments = {};
      state.draft.activeAthleteId = '';
    }

    renderAthleteChoices(gate);
    renderAssignmentTabs(gate);
    setFormMode(gate);
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
    if (!state?.draft?.userId) return;
    if (state.draft.hasOwnerRole && !isAppOwner()) return;
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
