// Tennis Player OS — Install Assistant v1.0.14
// Keeps installation simple without app stores:
// - Android/Chromium: uses the native install prompt when available.
// - iPhone/iPad: shows the exact Safari steps required by iOS.
// - Already installed: stays completely hidden.

const DISMISSED_KEY = 'tpos.pwaInstallOffer.dismissedAt';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

let deferredInstallPrompt = null;
let installButton = null;
let installBanner = null;
let installDialog = null;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isIOSSafari() {
  if (!isIOS()) return false;
  return /Safari/i.test(navigator.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

function dismissedRecently() {
  const raw = Number(localStorage.getItem(DISMISSED_KEY) || 0);
  return raw > 0 && Date.now() - raw < DISMISS_FOR_MS;
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Non-critical: the offer may simply reappear on a future visit.
  }
}

function clearDismissal() {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {}
}

function removeOfferUI() {
  installButton?.remove();
  installBanner?.remove();
  installDialog?.remove();
  installButton = null;
  installBanner = null;
  installDialog = null;
}

function ensureDialog() {
  if (installDialog) return installDialog;

  const overlay = document.createElement('div');
  overlay.className = 'tpos-install-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tpos-install-dialog" role="dialog" aria-modal="true" aria-labelledby="tpos-install-title">
      <button class="tpos-install-close" type="button" aria-label="Chiudi">×</button>
      <div class="tpos-install-appmark" aria-hidden="true">TPOS</div>
      <div class="tpos-install-dialog-copy"></div>
    </section>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.tpos-install-close')) {
      overlay.hidden = true;
    }
  });

  document.body.append(overlay);
  installDialog = overlay;
  return overlay;
}

function showIOSInstructions() {
  const overlay = ensureDialog();
  const copy = overlay.querySelector('.tpos-install-dialog-copy');

  if (!isIOSSafari()) {
    copy.innerHTML = `
      <div class="tpos-install-kicker">Installa Tennis Player OS</div>
      <h2 id="tpos-install-title">Apri TPOS in Safari</h2>
      <p>Su iPhone e iPad l’installazione come app si completa da Safari.</p>
      <ol class="tpos-install-steps">
        <li><strong>Apri Safari</strong> e torna a Tennis Player OS.</li>
        <li>Tocca <strong>Condividi</strong>.</li>
        <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
      </ol>
      <button class="button tpos-install-done" type="button">Ho capito</button>
    `;
  } else {
    copy.innerHTML = `
      <div class="tpos-install-kicker">Installa Tennis Player OS</div>
      <h2 id="tpos-install-title">Aggiungi TPOS all’iPhone</h2>
      <p>Lo fai una volta sola. Poi TPOS si apre dalla Home come un’app.</p>
      <ol class="tpos-install-steps">
        <li>Tocca <strong>Condividi</strong> <span class="tpos-share-symbol" aria-hidden="true">↥</span> in Safari.</li>
        <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
        <li>Attiva <strong>Apri come app web</strong>.</li>
        <li>Tocca <strong>Aggiungi</strong>.</li>
      </ol>
      <button class="button tpos-install-done" type="button">Ho capito</button>
    `;
  }

  copy.querySelector('.tpos-install-done')?.addEventListener('click', () => {
    overlay.hidden = true;
  });

  overlay.hidden = false;
}

function showAndroidFallback() {
  const overlay = ensureDialog();
  const copy = overlay.querySelector('.tpos-install-dialog-copy');
  copy.innerHTML = `
    <div class="tpos-install-kicker">Installa Tennis Player OS</div>
    <h2 id="tpos-install-title">Aggiungi TPOS al telefono</h2>
    <p>Chrome non ha ancora mostrato il pulsante automatico. Puoi comunque installarla dal menu.</p>
    <ol class="tpos-install-steps">
      <li>Tocca il menu <strong>⋮</strong> di Chrome.</li>
      <li>Scegli <strong>Installa app</strong> oppure <strong>Aggiungi alla schermata Home</strong>.</li>
      <li>Conferma <strong>Installa</strong>.</li>
    </ol>
    <button class="button tpos-install-done" type="button">Ho capito</button>
  `;
  copy.querySelector('.tpos-install-done')?.addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.hidden = false;
}

async function startInstall() {
  if (isStandalone()) {
    removeOfferUI();
    return;
  }

  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice?.outcome === 'accepted') {
        clearDismissal();
        removeOfferUI();
      }
    } catch (error) {
      console.warn('[TPOS] Install prompt failed:', error);
    }
    return;
  }

  if (isIOS()) {
    showIOSInstructions();
    return;
  }

  if (isAndroid()) {
    showAndroidFallback();
  }
}

function createTopbarButton(actions) {
  if (installButton || isStandalone()) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost tpos-install-button';
  button.dataset.tposInstall = 'true';
  button.innerHTML = '<span aria-hidden="true">↓</span><span>Installa app</span>';
  button.addEventListener('click', startInstall);

  actions.prepend(button);
  installButton = button;
}

function createBanner() {
  if (
    installBanner
    || isStandalone()
    || dismissedRecently()
    || !(isIOS() || isAndroid() || deferredInstallPrompt)
  ) return;

  const banner = document.createElement('aside');
  banner.className = 'tpos-install-banner';
  banner.setAttribute('aria-label', 'Installa Tennis Player OS');
  banner.innerHTML = `
    <div class="tpos-install-banner-mark" aria-hidden="true">TPOS</div>
    <div class="tpos-install-banner-copy">
      <strong>Usa TPOS come un’app</strong>
      <span>Aprila dalla Home, a schermo intero.</span>
    </div>
    <button class="button tpos-install-primary" type="button">Installa</button>
    <button class="tpos-install-dismiss" type="button" aria-label="Non ora">×</button>
  `;

  banner.querySelector('.tpos-install-primary')?.addEventListener('click', startInstall);
  banner.querySelector('.tpos-install-dismiss')?.addEventListener('click', () => {
    rememberDismissal();
    banner.remove();
    installBanner = null;
  });

  document.body.append(banner);
  installBanner = banner;
}

function mountInstallAssistant() {
  if (isStandalone()) {
    removeOfferUI();
    return;
  }

  const actions = document.querySelector('.topbar-actions');
  const authenticated = document.querySelector('[data-auth-controls]');

  // Do not distract the user during login/invite/recovery flows.
  if (!actions || !authenticated) return;

  if (isIOS() || isAndroid() || deferredInstallPrompt) {
    createTopbarButton(actions);
    window.setTimeout(createBanner, 900);
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  mountInstallAssistant();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  clearDismissal();
  removeOfferUI();
});

const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
standaloneQuery?.addEventListener?.('change', () => {
  if (isStandalone()) removeOfferUI();
});

const observer = new MutationObserver(() => {
  mountInstallAssistant();
  if (document.querySelector('[data-auth-controls]') && (installButton || isStandalone())) {
    observer.disconnect();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountInstallAssistant, { once: true });
} else {
  mountInstallAssistant();
}
