// Wait for the authenticated app bootstrap to finish before attaching
// Equipment cloud persistence.
import '../bootstrap.js';

import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from './access.js';
import { store } from '../data/store.js';
import {
  loadEquipmentIntoLocalStore,
  startEquipmentCloudSync,
} from './equipmentCloud.js';

let lastStatus = { status: 'synced', message: '' };

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function paintEquipmentStatus({ status, message = '' }) {
  lastStatus = { status, message };

  if (currentRoute() !== 'equipment') return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Equipment → cloud…';
    indicator.title = 'Sincronizzazione di Equipment con Supabase in corso.';
    return;
  }

  if (status === 'error') {
    indicator.textContent = 'Equipment · cache locale';
    indicator.title = message
      || 'I dati restano nella cache locale e verranno risincronizzati.';
    return;
  }

  if (status === 'readonly') {
    indicator.textContent = 'Equipment cloud · sola lettura';
    indicator.title = 'Questo account può leggere Equipment ma non modificarlo.';
    return;
  }

  indicator.textContent = 'Equipment cloud ✓';
  indicator.title = 'Equipment letto e salvato su Supabase; la copia locale resta come cache.';
}

async function start() {
  const access = getCurrentAccess();
  const athleteId = String(access.athleteId || '');

  if (!athleteId || !canReadModule('equipment')) return;

  const canWrite = canWriteModule('equipment');

  const loadResult = await loadEquipmentIntoLocalStore({
    store,
    athleteId,
    allowWrite: canWrite,
  });

  // If Equipment was the initial route, repaint it now with the cloud state.
  if (currentRoute() === 'equipment') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  if (canWrite) {
    startEquipmentCloudSync({
      store,
      athleteId,
      onStatus: paintEquipmentStatus,
    });

    if (loadResult.cloudError) {
      paintEquipmentStatus({
        status: 'error',
        message: loadResult.cloudError?.message || '',
      });
    } else {
      paintEquipmentStatus({ status: 'synced' });
    }
  } else {
    paintEquipmentStatus({ status: 'readonly' });
  }
}

window.addEventListener('hashchange', () => {
  if (currentRoute() === 'equipment') {
    paintEquipmentStatus(lastStatus);
  }
});

try {
  await start();
} catch (error) {
  console.warn('Equipment cloud runtime failed; local cache retained.', error);
  paintEquipmentStatus({
    status: 'error',
    message: error?.message || 'Equipment cloud non disponibile.',
  });
}
