import {
  loadCloudModuleState,
  saveCloudModuleState,
} from './moduleStateCloud.js?v=1.2.6';

const MODULE_KEY = 'economics';
const SCHEMA_VERSION = 3;
const SAVE_DELAY_MS = 300;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeEconomicsPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  return {
    ...source,
    currency: String(source.currency || 'EUR'),
    trainingAreas: Array.isArray(source.trainingAreas) ? source.trainingAreas : [],
    agreements: Array.isArray(source.agreements) ? source.agreements : [],
    entries: Array.isArray(source.entries) ? source.entries : [],
    budgets: Array.isArray(source.budgets) ? source.budgets : [],
    budgetPlans: Array.isArray(source.budgetPlans) ? source.budgetPlans : [],
    sponsors: Array.isArray(source.sponsors) ? source.sponsors : [],
  };
}

export function hasMeaningfulEconomicsData(payload = {}) {
  const economics = normalizeEconomicsPayload(payload);

  return Boolean(
    economics.trainingAreas.length
    || economics.agreements.length
    || economics.entries.length
    || economics.budgets.length
    || economics.budgetPlans.length
    || economics.sponsors.length
  );
}

function fingerprint(payload) {
  return JSON.stringify(normalizeEconomicsPayload(payload));
}

/**
 * Import local-only items only on the first successful cloud hydration of an
 * old browser cache. Cloud values win whenever a record ID already exists.
 * Subsequent visits are cloud-first (including deletions done elsewhere).
 */
function recoverUnmigratedEconomics(localPayload, cloudPayload) {
  const local = normalizeEconomicsPayload(localPayload);
  const cloud = normalizeEconomicsPayload(cloudPayload);
  const keyFor = (item, collection) => {
    if (item?.id) return String(item.id);
    if (collection === 'budgetPlans' && item?.seasonStart != null) {
      return `season:${item.seasonStart}`;
    }
    if (collection === 'budgets' && item?.year != null) {
      return `year:${item.year}`;
    }
    return JSON.stringify(item);
  };

  const merged = { ...cloud };
  for (const collection of [
    'trainingAreas', 'agreements', 'entries', 'budgets', 'budgetPlans', 'sponsors',
  ]) {
    const seen = new Set(cloud[collection].map(item => keyFor(item, collection)));
    const rows = [...cloud[collection]];
    for (const item of local[collection]) {
      const key = keyFor(item, collection);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
    }
    merged[collection] = rows;
  }
  return normalizeEconomicsPayload(merged);
}

export async function loadEconomicsIntoLocalStore({
  store,
  athleteId,
  allowWrite = false,
}) {
  const localEconomics = normalizeEconomicsPayload(store.getState().economics);

  try {
    const cloudState = await loadCloudModuleState({
      athleteId,
      moduleKey: MODULE_KEY,
    });

    if (cloudState) {
      const cloudEconomics = normalizeEconomicsPayload(cloudState.payload);
      const localMeta = store.getState().meta || {};
      const firstCloudLoad = !localMeta.economicsCloudLoadedAt
        && !localMeta.economicsCloudMigratedAt;
      let economics = cloudEconomics;
      let savedState = cloudState;
      let recoveryError = null;

      if (allowWrite && firstCloudLoad && hasMeaningfulEconomicsData(localEconomics)) {
        const recovered = recoverUnmigratedEconomics(localEconomics, cloudEconomics);
        if (fingerprint(recovered) !== fingerprint(cloudEconomics)) {
          economics = recovered;
          try {
            savedState = await saveCloudModuleState({
              athleteId,
              moduleKey: MODULE_KEY,
              payload: recovered,
              schemaVersion: SCHEMA_VERSION,
            });
          } catch (error) {
            recoveryError = error;
            console.warn('Economics local-only data retained; cloud recovery pending.', error);
          }
        }
      }

      store.update(state => {
        state.economics = clone(economics);
        if (!recoveryError) {
          state.meta.economicsCloudLoadedAt = new Date().toISOString();
        }
      });

      return {
        source: recoveryError ? 'local-recovery-pending' : 'cloud',
        economics,
        cloudState: savedState,
        cloudError: recoveryError,
      };
    }

    if (allowWrite && hasMeaningfulEconomicsData(localEconomics)) {
      const saved = await saveCloudModuleState({
        athleteId,
        moduleKey: MODULE_KEY,
        payload: localEconomics,
        schemaVersion: SCHEMA_VERSION,
      });

      store.update(state => {
        state.economics = clone(localEconomics);
        state.meta.economicsCloudMigratedAt = new Date().toISOString();
      });

      return {
        source: 'local-migrated',
        economics: localEconomics,
        cloudState: saved,
        cloudError: null,
      };
    }

    // Normalize the local cache even when no cloud row exists yet so newly
    // introduced structured fields (for example sponsors) are always present.
    store.update(state => {
      state.economics = clone(localEconomics);
    });

    return {
      source: 'local',
      economics: localEconomics,
      cloudState: null,
      cloudError: null,
    };
  } catch (cloudError) {
    console.warn('Economics cloud load failed; using local cache.', cloudError);

    store.update(state => {
      state.economics = clone(localEconomics);
    });

    return {
      source: 'local-fallback',
      economics: localEconomics,
      cloudState: null,
      cloudError,
    };
  }
}

export function startEconomicsCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = fingerprint(store.getState().economics);
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
      console.warn('Economics cloud save failed; local cache retained.', error);
      queuedPayload = payload;
      status(
        'error',
        error?.message || 'Salvataggio Economics cloud non riuscito.',
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

  const queue = economics => {
    if (stopped) return;

    const normalized = normalizeEconomicsPayload(economics);
    if (fingerprint(normalized) === lastSavedFingerprint) return;

    queuedPayload = clone(normalized);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.economics);
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
