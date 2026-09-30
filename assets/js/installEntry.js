let deferredInstallPrompt = null;
let androidPromptTimer = null;
const content = document.querySelector('#install-content');

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
  return isIOS()
    && /Safari/i.test(navigator.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showAlreadyInstalled() {
  content.innerHTML = `
    <div class="install-success">
      <div class="install-success-mark" aria-hidden="true">✓</div>
      <strong>TPOS è già installata</strong>
      <span class="install-copy">Aprila dalla schermata Home ed effettua l’accesso da lì.</span>
    </div>
  `;
}

function showIOS() {
  if (isIOSSafari()) {
    content.innerHTML = `
      <ol class="install-steps">
        <li>Tocca <strong>Condividi</strong> in Safari.</li>
        <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
        <li>Attiva <strong>Apri come app web</strong> e tocca <strong>Aggiungi</strong>.</li>
      </ol>
      <div class="install-note">
        Fatto. Ora chiudi Safari e apri <strong>TPOS</strong> dalla schermata Home. Lì effettuerai l’accesso.
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <p class="install-copy">Su iPhone e iPad l’installazione va completata da Safari.</p>
    <ol class="install-steps">
      <li>Apri questa stessa pagina in <strong>Safari</strong>.</li>
      <li>Tocca <strong>Condividi</strong>.</li>
      <li>Scegli <strong>Aggiungi alla schermata Home</strong>, quindi <strong>Aggiungi</strong>.</li>
    </ol>
  `;
}

async function runAndroidInstall() {
  if (!deferredInstallPrompt) return;

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;

  try {
    await promptEvent.prompt();
    const result = await promptEvent.userChoice;

    if (result?.outcome === 'accepted') {
      content.innerHTML = `
        <div class="install-success">
          <div class="install-success-mark" aria-hidden="true">✓</div>
          <strong>TPOS installata</strong>
          <span class="install-copy">Ora aprila dalla schermata Home ed effettua l’accesso.</span>
        </div>
      `;
    } else {
      showAndroidReady();
    }
  } catch (error) {
    console.warn('[TPOS] Native install prompt failed:', error);
    showAndroidFallback();
  }
}

function showAndroidReady() {
  content.innerHTML = `
    <button id="native-install" class="install-primary" type="button">
      Installa Tennis Player OS
    </button>
    <p class="install-copy">Dopo l’installazione apri TPOS dalla schermata Home e accedi.</p>
  `;

  document.querySelector('#native-install')?.addEventListener('click', runAndroidInstall);
}

function showAndroidWaiting() {
  content.innerHTML = `
    <button class="install-primary" type="button" disabled>Preparo l’installazione…</button>
    <p class="install-copy">Un attimo soltanto.</p>
  `;
}

function showAndroidFallback() {
  content.innerHTML = `
    <ol class="install-steps">
      <li>Tocca il menu <strong>⋮</strong> di Chrome.</li>
      <li>Scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.</li>
      <li>Conferma <strong>Installa</strong>.</li>
    </ol>
    <div class="install-note">
      Poi chiudi Chrome e apri <strong>TPOS</strong> dalla schermata Home.
    </div>
  `;
}

function showDesktop() {
  content.innerHTML = `
    <p class="install-copy">
      Apri questa pagina dal telefono sul quale vuoi installare Tennis Player OS.
    </p>
    <div class="install-desktop-url">${escapeHtml(location.href)}</div>
  `;
}

function renderForDevice() {
  if (isStandalone()) {
    showAlreadyInstalled();
    return;
  }
  if (isIOS()) {
    showIOS();
    return;
  }
  if (isAndroid()) {
    deferredInstallPrompt ? showAndroidReady() : showAndroidWaiting();
    return;
  }
  showDesktop();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  if (androidPromptTimer) {
    clearTimeout(androidPromptTimer);
    androidPromptTimer = null;
  }

  if (isAndroid()) showAndroidReady();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  content.innerHTML = `
    <div class="install-success">
      <div class="install-success-mark" aria-hidden="true">✓</div>
      <strong>TPOS installata</strong>
      <span class="install-copy">Aprila dalla schermata Home ed effettua l’accesso.</span>
    </div>
  `;
});

if ('serviceWorker' in navigator) {
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('[TPOS] Service worker registration failed:', error);
  }
}

renderForDevice();

if (isAndroid() && !deferredInstallPrompt) {
  androidPromptTimer = setTimeout(() => {
    if (!deferredInstallPrompt && !isStandalone()) showAndroidFallback();
  }, 3500);
}
