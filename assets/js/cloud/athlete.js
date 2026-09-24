import { supabase } from './supabaseClient.js';

const SELECTED_ATHLETE_KEY = 'tennisPlayerOS.selectedAthlete.v1';

const PROFILE_METADATA_ROOT = 'tennisPlayerOS';
const PROFILE_FIELDS = [
  'nationality',
  'handedness',
  'backhand',
  'ranking',
  'club',
  'coach',
  'seasonGoal',
  'notes',
  'competitionCategory',
  'competitionGender',
];
const PROFILE_SAVE_DELAY_MS = 350;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function profileFromMetadata(metadata = {}) {
  const root = metadata?.[PROFILE_METADATA_ROOT];
  const profile = root?.profile;
  const competition = root?.competition;

  if (
    (!profile || typeof profile !== 'object' || Array.isArray(profile))
    && (!competition || typeof competition !== 'object' || Array.isArray(competition))
  ) {
    return null;
  }

  const normalized = Object.fromEntries(
    PROFILE_FIELDS.map(field => [field, String(profile?.[field] || '')]),
  );

  normalized.competitionCategory = String(
    profile?.competitionCategory
    || competition?.category
    || '',
  );
  normalized.competitionGender = String(
    profile?.competitionGender
    || competition?.gender
    || '',
  );

  return normalized;
}

function profileFromAthlete(athlete = {}) {
  return Object.fromEntries(
    PROFILE_FIELDS.map(field => [field, String(athlete[field] || '')]),
  );
}

function hasMeaningfulProfile(profile = {}) {
  return PROFILE_FIELDS.some(field => String(profile[field] || '').trim());
}

function metadataWithProfile(metadata = {}, profile = {}) {
  const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {};
  const root = source[PROFILE_METADATA_ROOT]
    && typeof source[PROFILE_METADATA_ROOT] === 'object'
    && !Array.isArray(source[PROFILE_METADATA_ROOT])
      ? source[PROFILE_METADATA_ROOT]
      : {};

  const normalizedProfile = profileFromAthlete(profile);

  return {
    ...source,
    [PROFILE_METADATA_ROOT]: {
      ...root,
      profile: normalizedProfile,
      competition: {
        ...(root.competition && typeof root.competition === 'object' && !Array.isArray(root.competition)
          ? root.competition
          : {}),
        category: normalizedProfile.competitionCategory,
        gender: normalizedProfile.competitionGender,
      },
    },
  };
}

function athleteCloudFingerprint(athlete = {}) {
  return JSON.stringify({
    firstName: String(athlete.firstName || '').trim(),
    lastName: String(athlete.lastName || '').trim(),
    birthDate: String(athlete.birthDate || '').trim(),
    profile: profileFromAthlete(athlete),
  });
}

function mapCloudAthlete(row) {
  const cloudMetadata = row.metadata || {};

  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    birthDate: row.birth_date || '',
    cloudDisplayName: row.display_name || '',
    cloudMetadata,
    cloudProfile: profileFromMetadata(cloudMetadata),
    createdAt: row.created_at || '',
  };
}

function athleteLabel(athlete) {
  return [
    athlete.firstName,
    athlete.lastName,
  ].filter(Boolean).join(' ') || athlete.cloudDisplayName || 'Atleta';
}

export async function loadAccessibleAthletes() {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, first_name, last_name, display_name, birth_date, metadata, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Impossibile leggere gli atleti da Supabase: ${error.message}`);
  }

  return (data || []).map(mapCloudAthlete);
}

export function getSelectedAthleteId() {
  return localStorage.getItem(SELECTED_ATHLETE_KEY) || '';
}

export function setSelectedAthleteId(athleteId) {
  if (athleteId) localStorage.setItem(SELECTED_ATHLETE_KEY, athleteId);
  else localStorage.removeItem(SELECTED_ATHLETE_KEY);
}

export function resolveSelectedAthlete(athletes = []) {
  const selectedId = getSelectedAthleteId();
  const selected = athletes.find(athlete => athlete.id === selectedId);

  if (selected) return selected;

  if (athletes.length === 1) {
    setSelectedAthleteId(athletes[0].id);
    return athletes[0];
  }

  return null;
}

export async function createAthlete({
  firstName,
  lastName = '',
  birthDate = '',
}) {
  const normalizedFirstName = String(firstName || '').trim();
  const normalizedLastName = String(lastName || '').trim();
  const normalizedBirthDate = String(birthDate || '').trim();

  if (!normalizedFirstName) {
    throw new Error('Inserisci almeno il nome dell’atleta.');
  }

  const displayName = [normalizedFirstName, normalizedLastName]
    .filter(Boolean)
    .join(' ');

  const { data, error } = await supabase
    .from('athletes')
    .insert({
      first_name: normalizedFirstName,
      last_name: normalizedLastName || null,
      display_name: displayName,
      birth_date: normalizedBirthDate || null,
    })
    .select('id, first_name, last_name, display_name, birth_date, metadata, created_at')
    .single();

  if (error) {
    throw new Error(`Impossibile creare l'atleta: ${error.message}`);
  }

  const athlete = mapCloudAthlete(data);
  setSelectedAthleteId(athlete.id);
  return athlete;
}

export async function syncSelectedAthleteToLocalStore(store, cloudAthlete, userId) {
  if (!cloudAthlete?.id) {
    throw new Error('Nessun atleta selezionato.');
  }

  if (!userId) {
    throw new Error('Account autenticato non disponibile.');
  }

  store.selectAthleteStorage(userId, cloudAthlete.id);

  const {
    cloudProfile,
    ...cloudIdentity
  } = cloudAthlete;

  store.update(state => {
    state.athlete = {
      ...state.athlete,
      ...cloudIdentity,
      ...(cloudProfile || {}),
    };
    state.meta.cloudAthleteSyncedAt = new Date().toISOString();
  });

  return cloudAthlete;
}

async function saveAthleteProfileToCloud({
  athleteId,
  athlete,
}) {
  const normalizedAthleteId = String(athleteId || '').trim();
  if (!normalizedAthleteId) {
    throw new Error('Atleta non specificato.');
  }

  const firstName = String(athlete?.firstName || '').trim();
  const lastName = String(athlete?.lastName || '').trim();
  const birthDate = String(athlete?.birthDate || '').trim();

  if (!firstName) {
    throw new Error('Il nome dell’atleta non può essere vuoto.');
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ');
  const metadata = metadataWithProfile(
    athlete?.cloudMetadata || {},
    athlete || {},
  );

  const { data, error } = await supabase
    .from('athletes')
    .update({
      first_name: firstName,
      last_name: lastName || null,
      display_name: displayName,
      birth_date: birthDate || null,
      metadata,
    })
    .eq('id', normalizedAthleteId)
    .select('id, first_name, last_name, display_name, birth_date, metadata, created_at')
    .single();

  if (error) {
    throw new Error(`Impossibile salvare il profilo atleta: ${error.message}`);
  }

  return mapCloudAthlete(data);
}

export async function migrateAthleteProfileToCloudIfNeeded({
  store,
  cloudAthlete,
  allowWrite = false,
}) {
  if (!allowWrite || !cloudAthlete?.id || cloudAthlete.cloudProfile) {
    return cloudAthlete;
  }

  const localAthlete = store.getState().athlete;
  const localProfile = profileFromAthlete(localAthlete);

  if (!hasMeaningfulProfile(localProfile)) {
    return cloudAthlete;
  }

  const saved = await saveAthleteProfileToCloud({
    athleteId: cloudAthlete.id,
    athlete: localAthlete,
  });

  store.update(state => {
    state.athlete.cloudMetadata = clone(saved.cloudMetadata || {});
    state.meta.athleteProfileCloudMigratedAt = new Date().toISOString();
  });

  return saved;
}

export function startAthleteProfileCloudSync({
  store,
  athleteId,
  onStatus = null,
} = {}) {
  let lastSavedFingerprint = athleteCloudFingerprint(store.getState().athlete);
  let timer = null;
  let inFlight = false;
  let queuedAthlete = null;
  let stopped = false;

  const status = (value, message = '') => {
    onStatus?.({ status: value, message });
  };

  const flush = async () => {
    if (stopped || inFlight || !queuedAthlete) return;

    const athlete = queuedAthlete;
    queuedAthlete = null;

    const nextFingerprint = athleteCloudFingerprint(athlete);
    if (nextFingerprint === lastSavedFingerprint) return;

    inFlight = true;
    status('syncing');

    try {
      const saved = await saveAthleteProfileToCloud({
        athleteId,
        athlete,
      });

      lastSavedFingerprint = nextFingerprint;

      store.update(state => {
        state.athlete.cloudMetadata = clone(saved.cloudMetadata || {});
        state.athlete.cloudDisplayName = saved.cloudDisplayName || '';
        state.meta.athleteProfileCloudSavedAt = new Date().toISOString();
        state.meta.athleteProfileCloudErrorAt = '';
        state.meta.athleteProfileCloudErrorMessage = '';
      });

      status('synced');
    } catch (error) {
      console.warn('Athlete profile cloud save failed; local cache retained.', error);
      queuedAthlete = athlete;
      const message = error?.message || 'Salvataggio profilo atleta cloud non riuscito.';
      store.update(state => {
        state.meta.athleteProfileCloudErrorAt = new Date().toISOString();
        state.meta.athleteProfileCloudErrorMessage = message;
      });
      status('error', message);
    } finally {
      inFlight = false;

      if (
        queuedAthlete
        && athleteCloudFingerprint(queuedAthlete) !== lastSavedFingerprint
      ) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void flush();
        }, PROFILE_SAVE_DELAY_MS);
      }
    }
  };

  const queue = athlete => {
    if (stopped) return;

    const snapshot = clone(athlete || {});
    if (athleteCloudFingerprint(snapshot) === lastSavedFingerprint) return;

    queuedAthlete = snapshot;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void flush();
    }, PROFILE_SAVE_DELAY_MS);
  };

  const unsubscribe = store.subscribe(state => {
    queue(state.athlete);
  });

  const retryOnline = () => {
    if (!queuedAthlete) return;

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

function pickerMarkup(
  athletes,
  currentAthleteId = '',
  canCreateAthletes = false,
) {
  const athleteCards = athletes.length
    ? athletes.map(athlete => `
      <button
        class="athlete-picker-card ${athlete.id === currentAthleteId ? 'current' : ''}"
        type="button"
        data-athlete-id="${escapeAttr(athlete.id)}"
      >
        <span class="athlete-picker-avatar">${escapeHtml((athlete.firstName?.[0] || 'A').toUpperCase())}</span>
        <span class="athlete-picker-copy">
          <strong>${escapeHtml(athleteLabel(athlete))}</strong>
          <small>${athlete.birthDate ? escapeHtml(athlete.birthDate) : 'Data di nascita non inserita'}</small>
        </span>
        ${athlete.id === currentAthleteId ? '<span class="athlete-picker-current">Attivo</span>' : '<span>→</span>'}
      </button>
    `).join('')
    : '<p class="auth-intro">Non ci sono ancora atleti associati a questo account.</p>';

  const createMarkup = canCreateAthletes
    ? `
      <div class="athlete-picker-divider"><span>oppure</span></div>

      <form id="create-athlete-form" class="auth-form">
        <div class="athlete-picker-form-title">Nuovo atleta</div>
        <label>
          <span>Nome</span>
          <input name="firstName" required />
        </label>
        <label>
          <span>Cognome</span>
          <input name="lastName" />
        </label>
        <label>
          <span>Data di nascita</span>
          <input name="birthDate" type="date" />
        </label>
        <div id="athlete-picker-message" class="auth-message" role="status" aria-live="polite"></div>
        <div class="athlete-picker-actions">
          ${currentAthleteId ? '<button class="button button-ghost" type="button" data-athlete-cancel>Annulla</button>' : ''}
          <button class="auth-submit" type="submit">Crea atleta</button>
        </div>
      </form>
    `
    : '';

  return `
    <section class="auth-card athlete-picker-card-shell" aria-labelledby="athlete-picker-title">
      <div class="auth-brand-mark" aria-hidden="true">🎾</div>
      <div class="auth-kicker">Tennis Player OS</div>
      <h1 id="athlete-picker-title">Scegli atleta</h1>
      <p class="auth-intro">
        ${canCreateAthletes
          ? 'Ogni atleta ha dati, Calendar e permessi separati.'
          : 'Puoi scegliere solo tra gli atleti assegnati al tuo account.'}
      </p>

      <div class="athlete-picker-list">
        ${athleteCards}
      </div>

      ${createMarkup}
    </section>
  `;
}

export function showAthletePicker({
  athletes = [],
  currentAthleteId = '',
  canCreateAthletes = false,
} = {}) {
  const gate = document.createElement('div');
  gate.className = 'auth-gate athlete-picker-gate';
  gate.innerHTML = pickerMarkup(
    athletes,
    currentAthleteId,
    canCreateAthletes,
  );
  document.body.appendChild(gate);

  return new Promise(resolve => {
    const cancelButton = gate.querySelector('[data-athlete-cancel]');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        gate.remove();
        resolve(null);
      });
    }

    gate.querySelectorAll('[data-athlete-id]').forEach(button => {
      button.addEventListener('click', () => {
        const selected = athletes.find(athlete => athlete.id === button.dataset.athleteId);
        if (!selected) return;
        setSelectedAthleteId(selected.id);
        gate.remove();
        resolve(selected);
      });
    });

    const form = gate.querySelector('#create-athlete-form');
    if (!form) return;

    const message = gate.querySelector('#athlete-picker-message');
    const submit = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      message.textContent = '';
      message.className = 'auth-message';

      const data = Object.fromEntries(new FormData(form).entries());
      submit.disabled = true;
      submit.textContent = 'Creazione…';

      try {
        const created = await createAthlete(data);
        gate.remove();
        resolve(created);
      } catch (error) {
        message.textContent = error?.message || 'Impossibile creare l’atleta.';
        message.className = 'auth-message error';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Crea atleta';
      }
    });
  });
}

export function mountAthleteControls({
  currentAthlete,
  loadAthletes = loadAccessibleAthletes,
  athleteCount = 1,
  canCreateAthletes = false,
} = {}) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || actions.querySelector('[data-athlete-controls]')) return;

  const canSwitch = athleteCount > 1 || canCreateAthletes;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost athlete-switch-button';
  button.dataset.athleteControls = 'true';
  button.innerHTML = `
    <span class="athlete-switch-label">Atleta</span>
    <span class="athlete-switch-name">${escapeHtml(athleteLabel(currentAthlete))}</span>
    ${canSwitch ? '<span class="athlete-switch-chevron" aria-hidden="true">⌄</span>' : ''}
  `;

  if (!canSwitch) {
    button.disabled = true;
    button.title = 'Atleta assegnato a questo account';
    actions.prepend(button);
    return;
  }

  button.title = canCreateAthletes
    ? 'Cambia o crea atleta'
    : 'Cambia atleta';

  button.addEventListener('click', async () => {
    button.disabled = true;

    try {
      const athletes = await loadAthletes();
      const selected = await showAthletePicker({
        athletes,
        currentAthleteId: currentAthlete?.id || '',
        canCreateAthletes,
      });

      if (selected?.id && selected.id !== currentAthlete?.id) {
        setSelectedAthleteId(selected.id);
        window.location.reload();
      }
    } catch (error) {
      console.error('Athlete picker failed:', error);
    } finally {
      button.disabled = false;
    }
  });

  actions.prepend(button);
}

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
