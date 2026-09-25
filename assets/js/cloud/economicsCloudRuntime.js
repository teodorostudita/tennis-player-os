// Economics cloud persistence is attached after the authenticated bootstrap has
// resolved the current athlete and its module permissions.
import '../bootstrap.js';

import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from './access.js';
import { store } from '../data/store.js';
import {
  loadEconomicsIntoLocalStore,
  startEconomicsCloudSync,
} from './economicsCloud.js';

let lastStatus = { status: 'synced', message: '' };

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function paintEconomicsStatus({ status, message = '' }) {
  lastStatus = { status, message };

  if (currentRoute() !== 'economics') return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Economics → cloud…';
    indicator.title = 'Sincronizzazione di Economics con Supabase in corso.';
    return;
  }

  if (status === 'error') {
    indicator.textContent = 'Economics · cache locale';
    indicator.title = message
      || 'I dati restano nella cache locale e verranno risincronizzati.';
    return;
  }

  if (status === 'readonly') {
    indicator.textContent = 'Economics cloud · sola lettura';
    indicator.title = 'Questo account può leggere Economics ma non modificarlo.';
    return;
  }

  indicator.textContent = 'Economics cloud ✓';
  indicator.title = 'Economics letto e salvato su Supabase; la copia locale resta come cache.';
}

async function start() {
  const access = getCurrentAccess();
  const athleteId = String(access.athleteId || '');

  if (!athleteId || !canReadModule('economics')) return;

  const canWrite = canWriteModule('economics');
  const loadResult = await loadEconomicsIntoLocalStore({
    store,
    athleteId,
    allowWrite: canWrite,
  });

  // Loading the cloud payload updates the store after app.js has already
  // rendered the current route. app.js re-renders Dashboard directly on
  // store updates, which replaces the route buttons without rebinding their
  // click handlers. Force one full route render after the Economics bootstrap
  // so navigation handlers are always restored.
  window.dispatchEvent(new HashChangeEvent('hashchange'));


  if (canWrite) {
    startEconomicsCloudSync({
      store,
      athleteId,
      onStatus: paintEconomicsStatus,
    });

    if (loadResult.cloudError) {
      paintEconomicsStatus({
        status: 'error',
        message: loadResult.cloudError?.message || '',
      });
    } else {
      paintEconomicsStatus({ status: 'synced' });
    }
  } else {
    paintEconomicsStatus({ status: 'readonly' });
  }
}

window.addEventListener('hashchange', () => {
  if (currentRoute() === 'economics') {
    paintEconomicsStatus(lastStatus);
  }
});

try {
  await start();
} catch (error) {
  console.warn('Economics cloud runtime failed; local cache retained.', error);
  paintEconomicsStatus({
    status: 'error',
    message: error?.message || 'Economics cloud non disponibile.',
  });
}
