let activeDialog = null;

export function showInAppAlert(message, options = {}) {
  return showMessageDialog({
    title: options.title || 'Attenzione',
    message,
    confirmLabel: options.confirmLabel || 'OK',
    cancelLabel: '',
    danger: Boolean(options.danger),
  }).then(() => true);
}

export function showInAppConfirm(message, options = {}) {
  return showMessageDialog({
    title: options.title || 'Conferma',
    message,
    confirmLabel: options.confirmLabel || 'Conferma',
    cancelLabel: options.cancelLabel || 'Annulla',
    danger: Boolean(options.danger),
  });
}

function showMessageDialog({ title, message, confirmLabel, cancelLabel, danger }) {
  if (activeDialog?.open) activeDialog.close('cancel');
  activeDialog?.remove();

  const dialog = document.createElement('dialog');
  dialog.className = 'inapp-message-dialog';
  dialog.innerHTML = `
    <div class="inapp-message-card">
      <div class="inapp-message-head">
        <div>
          <div class="eyebrow">Tennis Player OS</div>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <button type="button" class="dialog-close" data-inapp-cancel aria-label="Chiudi">×</button>
      </div>
      <div class="inapp-message-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
      <div class="inapp-message-actions">
        ${cancelLabel ? `<button type="button" class="button button-ghost" data-inapp-cancel>${escapeHtml(cancelLabel)}</button>` : ''}
        <button type="button" class="button ${danger ? 'button-danger' : 'button-primary'}" data-inapp-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  activeDialog = dialog;

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close(value ? 'confirm' : 'cancel');
      dialog.remove();
      if (activeDialog === dialog) activeDialog = null;
      resolve(value);
    };

    dialog.querySelector('[data-inapp-confirm]')?.addEventListener('click', () => finish(true));
    dialog.querySelectorAll('[data-inapp-cancel]').forEach(button => button.addEventListener('click', () => finish(false)));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('close', () => {
      if (!settled) finish(dialog.returnValue === 'confirm');
    });

    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('[data-inapp-confirm]')?.focus());
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
