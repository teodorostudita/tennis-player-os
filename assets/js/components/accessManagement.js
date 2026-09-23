import { modules } from '../data/schema.js';
import {
  createOrUpdateAthleteAccess,
  getCurrentAccess,
  loadAthleteAccessDirectory,
  removeAthleteUser,
} from '../cloud/access.js';
import { normalizeUsername } from '../cloud/loginIdentity.js';

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

function permissionValue(permission = {}) {
  if (permission.canWrite) return 'write';
  if (permission.canRead) return 'read';
  return 'none';
}

function permissionSummary(member) {
  if (member.role === 'owner') return 'Controllo completo e gestione accessi';
  if (member.role === 'admin') return 'Accesso completo a tutti i moduli';

  let read = 0;
  let write = 0;

  for (const permission of Object.values(member.permissions || {})) {
    if (permission.canWrite) write += 1;
    else if (permission.canRead) read += 1;
  }

  if (!read && !write) return 'Nessun modulo autorizzato';

  const parts = [];
  if (write) parts.push(`${write} scrittura`);
  if (read) parts.push(`${read} sola lettura`);
  return parts.join(' · ');
}

function permissionRows(member = null) {
  return modules.map(module => {
    const selected = member?.permissions?.[module.id] || {};
    const value = permissionValue(selected);

    return `
      <div class="access-permission-row" data-permission-row="${escapeAttr(module.id)}">
        <div class="access-module-copy">
          <span class="access-module-icon">${module.icon}</span>
          <span>
            <strong>${escapeHtml(module.name)}</strong>
            <small>${escapeHtml(module.subtitle)}</small>
          </span>
        </div>
        <select name="permission-${escapeAttr(module.id)}" aria-label="Permesso ${escapeAttr(module.name)}">
          <option value="none" ${value === 'none' ? 'selected' : ''}>Nessuno</option>
          <option value="read" ${value === 'read' ? 'selected' : ''}>Lettura</option>
          <option value="write" ${value === 'write' ? 'selected' : ''}>Lettura + scrittura</option>
        </select>
      </div>
    `;
  }).join('');
}

function memberCards(members) {
  if (!members.length) {
    return '<p class="access-empty">Nessun utente associato.</p>';
  }

  return members.map(member => `
    <article class="access-member-card">
      <div class="access-member-avatar" aria-hidden="true">
        ${escapeHtml((member.displayName || member.login || member.email || 'U').trim().charAt(0).toUpperCase())}
      </div>
      <div class="access-member-copy">
        <div class="access-member-name">
          ${escapeHtml(member.displayName || member.login || member.email || 'Utente')}
          <span class="access-role-badge role-${escapeAttr(member.role)}">${escapeHtml(roleLabel(member.role))}</span>
          ${member.status !== 'active' ? '<span class="access-status-badge">Sospeso</span>' : ''}
        </div>
        <div class="access-member-email">${escapeHtml(member.login || member.email)}</div>
        <div class="access-member-summary">${escapeHtml(permissionSummary(member))}</div>
      </div>
      <div class="access-member-actions">
        ${member.role === 'owner'
          ? '<span class="access-owner-lock">Protetto</span>'
          : `<button class="button button-ghost" type="button" data-edit-member="${escapeAttr(member.userId)}">Modifica</button>`}
      </div>
    </article>
  `).join('');
}

function renderShell(gate) {
  gate.innerHTML = `
    <section class="access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <header class="access-dialog-head">
        <div>
          <div class="auth-kicker">Tennis Player OS</div>
          <h2 id="access-title">Utenti &amp; Accessi</h2>
          <p>Account autorizzati e privilegi per l’atleta attivo.</p>
        </div>
        <button class="dialog-close access-close" type="button" aria-label="Chiudi">×</button>
      </header>

      <div class="access-dialog-body">
        <section class="access-members-panel">
          <div class="access-section-head">
            <div>
              <h3>Utenti autorizzati</h3>
              <p>Owner, amministratori e collaboratori.</p>
            </div>
            <button class="button button-primary" type="button" id="access-new-user" hidden>+ Nuovo utente</button>
          </div>
          <div id="access-members-list" class="access-members-list">
            <div class="access-loading">Caricamento utenti…</div>
          </div>
        </section>

        <aside class="access-editor-panel">
          <div class="access-section-head">
            <div>
              <h3 id="access-editor-title">Nuovo utente</h3>
              <p id="access-editor-subtitle">Crea un nuovo account o assegna un account esistente a questo atleta.</p>
            </div>
          </div>

          <form id="access-form" class="access-form">
            <input type="hidden" name="userId" />

            <label class="access-field">
              <span>Nome visualizzato</span>
              <input name="displayName" autocomplete="off" placeholder="es. Coach Mario" />
            </label>

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
              <small>3–40 caratteri: lettere, numeri, punto, trattino o underscore. Gli account legacy con email restano compatibili.</small>
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
                Se l’account non esiste ancora, questa sarà la password del primo accesso.
                L’utente sarà obbligato a cambiarla subito. Se il nome utente appartiene già
                a un account esistente, la sua password non viene modificata.
              </div>
            </div>

            <label class="access-field">
              <span>Ruolo</span>
              <select name="role">
                <option value="member">Member — privilegi per modulo</option>
                <option value="admin">Admin — accesso completo</option>
              </select>
            </label>

            <div id="access-admin-note" class="access-info" hidden>
              Un Admin può leggere e modificare tutti i moduli dell’atleta e può creare nuovi atleti.
              Non può gestire utenti e privilegi dell’atleta.
            </div>

            <div id="access-permissions-block">
              <div class="access-permissions-head">
                <div>
                  <strong>Privilegi per modulo</strong>
                  <small>“Scrittura” include sempre anche la lettura.</small>
                </div>
                <div class="access-permission-shortcuts">
                  <button type="button" class="auth-text-button" data-permissions-all="read">Tutti lettura</button>
                  <button type="button" class="auth-text-button" data-permissions-all="write">Tutti scrittura</button>
                  <button type="button" class="auth-text-button" data-permissions-all="none">Azzera</button>
                </div>
              </div>
              <div id="access-permission-rows" class="access-permission-rows">
                ${permissionRows()}
              </div>
            </div>

            <div id="access-remove-confirm" class="access-remove-confirm" hidden>
              <strong>Rimuovere questo utente?</strong>
              <p>
                L’accesso a questo atleta verrà eliminato. Se l’account non è associato
                ad altri atleti, verrà eliminato completamente e il nome utente potrà
                essere riutilizzato per un nuovo account.
              </p>
              <div class="access-remove-confirm-actions">
                <button class="button button-ghost" type="button" id="access-remove-cancel">Annulla</button>
                <button class="button button-danger" type="button" id="access-remove-confirm-button">Conferma rimozione</button>
              </div>
            </div>

            <div id="access-message" class="auth-message" role="status" aria-live="polite"></div>

            <div class="access-form-actions access-form-actions-split">
              <button class="button button-danger-ghost" type="button" id="access-remove-user" hidden>Rimuovi utente</button>
              <div class="access-form-actions-main">
                <button class="button button-ghost" type="button" id="access-reset-form" hidden>Annulla modifica</button>
                <button class="button button-primary" type="submit" id="access-submit">Crea utente</button>
              </div>
            </div>
          </form>
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

function collectPermissions(form) {
  return modules.flatMap(module => {
    const value = String(form.elements[`permission-${module.id}`]?.value || 'none');

    if (value === 'none') return [];

    return [{
      moduleKey: module.id,
      canRead: true,
      canWrite: value === 'write',
    }];
  });
}

function updateEditorMode(gate, member = null) {
  const editing = Boolean(member?.userId);
  const form = gate.querySelector('#access-form');
  const passwordBlock = gate.querySelector('#access-password-block');
  const newUserButton = gate.querySelector('#access-new-user');
  const resetButton = gate.querySelector('#access-reset-form');
  const removeButton = gate.querySelector('#access-remove-user');
  const removeConfirm = gate.querySelector('#access-remove-confirm');
  const submit = gate.querySelector('#access-submit');

  if (passwordBlock) passwordBlock.hidden = editing;
  if (newUserButton) newUserButton.hidden = !editing;
  if (resetButton) resetButton.hidden = !editing;
  if (removeButton) removeButton.hidden = !editing;
  if (removeConfirm) removeConfirm.hidden = true;

  for (const name of ['temporaryPassword', 'temporaryPasswordConfirm']) {
    const input = form?.elements?.[name];
    if (!input) continue;
    input.disabled = editing;
    input.value = '';
  }

  if (submit) {
    submit.textContent = editing ? 'Salva modifiche' : 'Crea utente';
  }
}

function applyMemberToForm(gate, member = null) {
  const form = gate.querySelector('#access-form');
  if (!form) return;

  form.reset();
  form.elements.userId.value = member?.userId || '';
  form.elements.login.value = member?.login || member?.email || '';
  form.elements.login.readOnly = Boolean(member?.userId);
  form.elements.displayName.value = member?.displayName || '';
  form.elements.role.value = member?.role === 'admin' ? 'admin' : 'member';

  gate.querySelector('#access-editor-title').textContent =
    member ? 'Modifica utente' : 'Nuovo utente';
  gate.querySelector('#access-editor-subtitle').textContent =
    member
      ? 'Aggiorna ruolo e privilegi dell’account selezionato.'
      : 'Crea un nuovo account o assegna un account esistente a questo atleta.';

  for (const module of modules) {
    const select = form.elements[`permission-${module.id}`];
    if (!select) continue;
    select.value = permissionValue(member?.permissions?.[module.id] || {});
  }

  updateEditorMode(gate, member);
  updateRoleUI(gate);
  setMessage(gate, '');
}

function updateRoleUI(gate) {
  const form = gate.querySelector('#access-form');
  const isAdmin = form?.elements.role?.value === 'admin';
  const block = gate.querySelector('#access-permissions-block');
  const note = gate.querySelector('#access-admin-note');

  if (block) block.hidden = isAdmin;
  if (note) note.hidden = !isAdmin;
}

async function refreshMembers(gate, athleteId) {
  const list = gate.querySelector('#access-members-list');
  list.innerHTML = '<div class="access-loading">Caricamento utenti…</div>';

  try {
    const members = await loadAthleteAccessDirectory(athleteId);
    list.innerHTML = memberCards(members);

    list.querySelectorAll('[data-edit-member]').forEach(button => {
      button.addEventListener('click', () => {
        const member = members.find(item => item.userId === button.dataset.editMember);
        if (!member) return;
        applyMemberToForm(gate, member);
        gate.querySelector('.access-editor-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  } catch (error) {
    list.innerHTML = `
      <div class="auth-message error">
        ${escapeHtml(error?.message || 'Impossibile leggere gli utenti.')}
      </div>
    `;
  }
}

export function openAccessManagement({ athleteId }) {
  const access = getCurrentAccess();

  if (!access.isOwner || access.athleteId !== athleteId) {
    return;
  }

  if (document.querySelector('[data-access-management]')) return;

  const gate = document.createElement('div');
  gate.className = 'access-gate';
  gate.dataset.accessManagement = 'true';
  renderShell(gate);
  document.body.appendChild(gate);

  const close = () => gate.remove();

  gate.querySelector('.access-close')?.addEventListener('click', close);
  gate.addEventListener('click', event => {
    if (event.target === gate) close();
  });

  gate.querySelector('#access-new-user')?.addEventListener('click', () => {
    applyMemberToForm(gate, null);
  });

  gate.querySelector('#access-reset-form')?.addEventListener('click', () => {
    applyMemberToForm(gate, null);
  });

  gate.querySelector('#access-remove-user')?.addEventListener('click', () => {
    setMessage(gate, '');
    const confirm = gate.querySelector('#access-remove-confirm');
    if (confirm) confirm.hidden = false;
  });

  gate.querySelector('#access-remove-cancel')?.addEventListener('click', () => {
    const confirm = gate.querySelector('#access-remove-confirm');
    if (confirm) confirm.hidden = true;
  });

  gate.querySelector('#access-remove-confirm-button')?.addEventListener('click', async () => {
    const form = gate.querySelector('#access-form');
    const userId = String(form?.elements?.userId?.value || '');
    const confirmButton = gate.querySelector('#access-remove-confirm-button');
    const removeButton = gate.querySelector('#access-remove-user');

    if (!userId) return;

    setMessage(gate, '');
    confirmButton.disabled = true;
    if (removeButton) removeButton.disabled = true;
    confirmButton.textContent = 'Rimozione…';

    try {
      const result = await removeAthleteUser({
        athleteId,
        userId,
      });

      await refreshMembers(gate, athleteId);
      applyMemberToForm(gate, null);

      setMessage(
        gate,
        result?.accountDeleted
          ? 'Utente eliminato completamente. Il nome utente può essere riutilizzato.'
          : 'Accesso rimosso da questo atleta. L’account è stato conservato perché è associato ad altri atleti.',
        'success',
      );
    } catch (error) {
      setMessage(
        gate,
        error?.message || 'Impossibile rimuovere l’utente.',
        'error',
      );
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = 'Conferma rimozione';
      if (removeButton) removeButton.disabled = false;
    }
  });

  gate.querySelector('#access-form')?.elements.role?.addEventListener('change', () => {
    updateRoleUI(gate);
  });

  gate.querySelectorAll('[data-permissions-all]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.permissionsAll;
      const form = gate.querySelector('#access-form');

      for (const module of modules) {
        const select = form.elements[`permission-${module.id}`];
        if (select) select.value = value;
      }
    });
  });

  gate.querySelector('#access-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    setMessage(gate, '');

    const form = event.currentTarget;
    const submit = gate.querySelector('#access-submit');
    const data = new FormData(form);
    const editing = Boolean(String(data.get('userId') || ''));
    const role = String(data.get('role') || 'member');
    const login = String(data.get('login') || '').trim();
    const displayName = String(data.get('displayName') || '').trim();
    const temporaryPassword = editing
      ? ''
      : String(data.get('temporaryPassword') || '');
    const temporaryPasswordConfirm = editing
      ? ''
      : String(data.get('temporaryPasswordConfirm') || '');

    if (!editing && !login.includes('@')) {
      try {
        normalizeUsername(login);
      } catch (error) {
        setMessage(gate, error?.message || 'Nome utente non valido.', 'error');
        return;
      }
    }

    if (!editing && (temporaryPassword || temporaryPasswordConfirm)) {
      if (temporaryPassword.length < 8) {
        setMessage(gate, 'La password temporanea deve contenere almeno 8 caratteri.', 'error');
        return;
      }

      if (temporaryPassword !== temporaryPasswordConfirm) {
        setMessage(gate, 'Le due password temporanee non coincidono.', 'error');
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = 'Salvataggio…';

    try {
      const result = await createOrUpdateAthleteAccess({
        athleteId,
        login,
        displayName,
        temporaryPassword,
        role,
        permissions: role === 'member' ? collectPermissions(form) : [],
      });

      await refreshMembers(gate, athleteId);
      applyMemberToForm(gate, null);

      setMessage(
        gate,
        result?.accountCreated
          ? 'Utente creato. Potrà entrare subito con la password temporanea e dovrà cambiarla al primo accesso.'
          : 'Account esistente collegato e privilegi aggiornati.',
        'success',
      );
    } catch (error) {
      setMessage(
        gate,
        error?.message || 'Impossibile salvare l’utente.',
        'error',
      );
    } finally {
      submit.disabled = false;
      const editingNow = Boolean(form.elements.userId.value);
      submit.textContent = editingNow ? 'Salva modifiche' : 'Crea utente';
    }
  });

  applyMemberToForm(gate, null);
  void refreshMembers(gate, athleteId);
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
  button.title = 'Gestisci account e privilegi dell’atleta';

  button.addEventListener('click', () => {
    openAccessManagement({ athleteId });
  });

  actions.prepend(button);
}
