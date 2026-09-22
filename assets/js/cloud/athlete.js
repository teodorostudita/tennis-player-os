import { supabase } from './supabaseClient.js';

const SELECTED_ATHLETE_KEY = 'tennisPlayerOS.selectedAthlete.v1';

function mapCloudAthlete(row) {
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    birthDate: row.birth_date || '',
    cloudDisplayName: row.display_name || '',
    cloudMetadata: row.metadata || {},
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

export async function syncSelectedAthleteToLocalStore(store, cloudAthlete) {
  if (!cloudAthlete?.id) {
    throw new Error('Nessun atleta selezionato.');
  }

  store.selectAthleteStorage(cloudAthlete.id);

  store.update(state => {
    state.athlete = {
      ...state.athlete,
      ...cloudAthlete,
    };
    state.meta.cloudAthleteSyncedAt = new Date().toISOString();
  });

  return cloudAthlete;
}

function pickerMarkup(athletes, currentAthleteId = '') {
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

  return `
    <section class="auth-card athlete-picker-card-shell" aria-labelledby="athlete-picker-title">
      <div class="auth-brand-mark" aria-hidden="true">🎾</div>
      <div class="auth-kicker">Tennis Player OS</div>
      <h1 id="athlete-picker-title">Scegli atleta</h1>
      <p class="auth-intro">Ogni atleta ha dati, Calendar e permessi separati.</p>

      <div class="athlete-picker-list">
        ${athleteCards}
      </div>

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
    </section>
  `;
}

export function showAthletePicker({
  athletes = [],
  currentAthleteId = '',
} = {}) {
  const gate = document.createElement('div');
  gate.className = 'auth-gate athlete-picker-gate';
  gate.innerHTML = pickerMarkup(athletes, currentAthleteId);
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
} = {}) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || actions.querySelector('[data-athlete-controls]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost athlete-switch-button';
  button.dataset.athleteControls = 'true';
  button.innerHTML = `
    <span class="athlete-switch-label">Atleta</span>
    <span class="athlete-switch-name">${escapeHtml(athleteLabel(currentAthlete))}</span>
    <span class="athlete-switch-chevron" aria-hidden="true">⌄</span>
  `;
  button.title = 'Cambia o crea atleta';

  button.addEventListener('click', async () => {
    button.disabled = true;

    try {
      const athletes = await loadAthletes();
      const selected = await showAthletePicker({
        athletes,
        currentAthleteId: currentAthlete?.id || '',
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
