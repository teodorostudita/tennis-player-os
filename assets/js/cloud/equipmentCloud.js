import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js';

const MODULE_KEY = 'equipment';
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeEquipmentPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  return {
    ...source,
    primaryRacketId: String(source.primaryRacketId || ''),
    primaryShoeId: String(source.primaryShoeId || ''),
    rackets: Array.isArray(source.rackets) ? source.rackets : [],
    stringJobs: Array.isArray(source.stringJobs) ? source.stringJobs : [],
    shoes: Array.isArray(source.shoes) ? source.shoes : [],
  };
}

export function hasMeaningfulEquipmentData(payload = {}) {
  const equipment = normalizeEquipmentPayload(payload);

  return Boolean(
    equipment.primaryRacketId
    || equipment.primaryShoeId
    || equipment.rackets.length
    || equipment.stringJobs.length
    || equipment.shoes.length
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeEquipmentPayload(payload));
}

/**
 * Equipment cloud bootstrap.
 *
 * Migration rule:
 * - existing cloud row -> cloud is authoritative;
 * - no cloud row + meaningful legacy local data + write permission ->
 *   upload the local Equipment state once;
 * - cloud temporarily unavailable -> keep using the local cache.
 */
export async function loadEquipmentIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localEquipment = normalizeEquipmentPayload(store.getState().equipment);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: MODULE_KEY,
    });

    if (cloudState) {
      const cloudEquipment = normalizeEquipmentPayload(cloudState.payload);

      store.update(state => {
        state.equipment = clone(cloudEquipment);
        state.meta.equipmentCloudLoadedAt = new Date().toISOString();
      });

      return {
        source: 'cloud',
        equipment: cloudEquipment,
        cloudState,
        cloudError: null,
      };
    }

    if (allowWrite && hasMeaningfulEquipmentData(localEquipment)) {
      const saved = await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload: localEquipment,
        schemaVersion: SCHEMA_VERSION,
      });

      store.update(state => {
        state.meta.equipmentCloudMigratedAt = new Date().toISOString();
      });

      return {
        source: 'local-migrated',
        equipment: localEquipment,
        cloudState: saved,
        cloudError: null,
      };
    }

    return {
      source: 'local',
      equipment: localEquipment,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Equipment cloud load failed; using local cache.', cloudError);

    return {
      source: 'local-fallback',
      equipment: localEquipment,
      cloudState: null,
      cloudError,
    };
  }
}

/**
 * Mirrors the complete structured Equipment state to Supabase.
 * localStorage remains a per-account/per-athlete cache and offline fallback.
 *
 * Payload currently includes:
 * - primary racket / primary shoes
 * - racket inventory and technical setup
 * - complete string-job history
 * - shoes and their status/history
 * - any future fields added under state.equipment
 */
export function startEquipmentCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().equipment);
  let timer = null;
  let inFlight = false;
  let queuedPayload = null;
  let stopped = false;

  const status = (value, message = '') => {
    onStatus?.({ status: value, message });
  };

  const flush = async () => {
    if (stopped || inFlight || !queuedPayload) return;

    const payload = queuedPayload;
    queuedPayload = null;

    const nextFingerprint = fingerprint(payload);
    if (nextFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    status('syncing');

    try {
      await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload,
        schemaVersion: SCHEMA_VERSION,
      });

      lastSavedFingerprint = nextFingerprint;
      status('synced');
    } catch (error) {
      console.warn('Equipment cloud save failed; local cache retained.', error);
      queuedPayload = payload;
      status(
        'error',
        error?.message || 'Salvataggio Equipment cloud non riuscito.',
      );
    } finally {
      inFlight = false;

      if (
        queuedPayload
        && fingerprint(queuedPayload) !== lastSavedFingerprint
      ) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY_MS);
      }
    }
  };

  const queue = equipment => {
    if (stopped) return;

    const normalized = normalizeEquipmentPayload(equipment);
    if (fingerprint(normalized) === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.equipment);
  });

  const retryOnline = () => {
    if (!queuedPayload) return;

    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, 50);
  };

  window.addEventListener('online', retryOnline);

  status('synced');

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribe();
    window.removeEventListener('online', retryOnline);
  };
}
