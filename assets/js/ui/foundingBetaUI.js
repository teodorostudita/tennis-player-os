import { isAppOwner } from '../cloud/accountAccess.js';
import {
  createFoundingBetaOwner,
  loadFoundingBetaStatus,
} from '../cloud/betaProgram.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function panelMarkup() {
  return `
    <section class="founding-beta-admin" data-founding-beta-admin>
      <div class="founding-beta-admin-head">
        <div>
          <div class="auth-kicker">Founding Beta</div>
          <strong>Account Beta</strong>
          <small>30 account Admin con workspace separato.</small>
        </div>
        <button class="button button-primary founding-beta-create" type="button" data-beta-create>
          + Beta Owner
        </button>
      </div>

      <div class="founding-beta-meter" aria-live="polite">
        <div class="founding-beta-meter-copy">
          <span><b data-beta-active>—</b> / <b data-beta-capacity>30</b> assegnati</span>
          <span><b data-beta-remaining>—</b> disponibili</span>
        </div>
        <div class="founding-beta-progress" role="progressbar" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0">
          <span data-beta-progress></span>
        </div>
      </div>

      <form class="founding-beta-form" data-beta-form hidden>
        <label class="access-field">
          <span>Nome</span>
          <input name="displayName" autocomplete="name" placeholder="Nome del Beta Owner" />
        </label>
        <label class="access-field">
          <span>Email</span>
          <input name="email" type="email" autocomplete="email" required placeholder="nome@email.it" />
        </label>
        <div class="founding-beta-form-actions">
          <button class="button button-ghost" type="button" data-beta-cancel>Annulla</button>
          <button class="button button-primary" type="submit" data-beta-submit>Invita e assegna posto</button>
        </div>
      </form>

      <div class="auth-message founding-beta-message" data-beta-message role="status" aria-live="polite"></div>
    </section>
  `;
}

function setMessage(panel, text = '', kind = '') {
  const box = panel.querySelector('[data-beta-message]');
  if (!box) return;
  box.textContent = text;
  box.className = `auth-message founding-beta-message${kind ? ` ${kind}` : ''}`;
}

function renderStatus(panel, status) {
  const capacity = Math.max(0, Number(status?.capacity ?? 30));
  const active = Math.max(0, Number(status?.active ?? 0));
  const remaining = Math.max(0, Number(status?.remaining ?? capacity - active));
  const full = Boolean(status?.full) || remaining <= 0;
  const pct = capacity > 0 ? Math.min(100, Math.max(0, (active / capacity) * 100)) : 0;

  panel.querySelector('[data-beta-active]').textContent = String(active);
  panel.querySelector('[data-beta-capacity]').textContent = String(capacity);
  panel.querySelector('[data-beta-remaining]').textContent = String(remaining);

  const progress = panel.querySelector('.founding-beta-progress');
  const fill = panel.querySelector('[data-beta-progress]');
  if (progress) {
    progress.setAttribute('aria-valuemax', String(capacity));
    progress.setAttribute('aria-valuenow', String(active));
  }
  if (fill) fill.style.width = `${pct}%`;

  const createButton = panel.querySelector('[data-beta-create]');
  if (createButton) {
    createButton.disabled = full;
    createButton.textContent = full ? 'Beta completa' : '+ Beta Owner';
  }

  panel.dataset.betaFull = full ? 'true' : 'false';
}

async function refreshStatus(panel) {
  try {
    const status = await loadFoundingBetaStatus();
    renderStatus(panel, status);
    return status;
  } catch (error) {
    setMessage(panel, error?.message || 'Impossibile leggere il contatore Beta.', 'error');
    return null;
  }
}

function bindPanel(panel) {
  const form = panel.querySelector('[data-beta-form]');
  const createButton = panel.querySelector('[data-beta-create]');
  const cancelButton = panel.querySelector('[data-beta-cancel]');
  const submitButton = panel.querySelector('[data-beta-submit]');

  createButton?.addEventListener('click', () => {
    if (panel.dataset.betaFull === 'true') return;
    form.hidden = false;
    setMessage(panel, '');
    requestAnimationFrame(() => form.elements.email?.focus());
  });

  cancelButton?.addEventListener('click', () => {
    form.reset();
    form.hidden = true;
    setMessage(panel, '');
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = String(form.elements.email?.value || '').trim();
    const displayName = String(form.elements.displayName?.value || '').trim();

    submitButton.disabled = true;
    submitButton.textContent = 'Creazione…';
    setMessage(panel, '');

    try {
      const result = await createFoundingBetaOwner({ email, displayName });
      renderStatus(panel, result.beta);
      form.reset();
      form.hidden = true;
      setMessage(
        panel,
        result.invitationSent
          ? `Account Beta creato e invito inviato a ${email}.`
          : `Account esistente abilitato alla Founding Beta: ${email}.`,
        'success',
      );
    } catch (error) {
      setMessage(panel, error?.message || 'Impossibile creare il Beta Owner.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Invita e assegna posto';
    }
  });
}

async function enhanceAccessDialog(gate) {
  if (!gate || gate.dataset.foundingBetaEnhanced === 'true') return;
  if (!isAppOwner()) return;

  const membersPanel = gate.querySelector('.access-members-panel-v2');
  if (!membersPanel) return;

  gate.dataset.foundingBetaEnhanced = 'true';
  membersPanel.insertAdjacentHTML('afterbegin', panelMarkup());

  const panel = membersPanel.querySelector('[data-founding-beta-admin]');
  if (!panel) return;

  bindPanel(panel);
  await refreshStatus(panel);
}

function scan() {
  const gate = document.querySelector('[data-access-management]');
  if (gate) void enhanceAccessDialog(gate);
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
