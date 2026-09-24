import { getCurrentAccess } from '../cloud/access.js';
import { store } from '../data/store.js';

let lastSavedAt = '';
let lastErrorAt = '';

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function saveIndicator() {
  return document.querySelector('#save-indicator');
}

function setStatus(status, message = '') {
  if (route() !== 'athlete') return;
  const indicator = saveIndicator();
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Profilo → cloud…';
    indicator.title = 'Salvataggio del Player Profile su Supabase in corso.';
    return;
  }

  if (status === 'error') {
    indicator.textContent = 'Errore profilo cloud';
    indicator.title = message || 'Il Player Profile resta nella cache locale finché il cloud non torna disponibile.';
    return;
  }

  if (status === 'readonly') {
    indicator.textContent = 'Profilo cloud · sola lettura';
    indicator.title = 'Solo Owner/Admin può modificare il Player Profile.';
    return;
  }

  indicator.textContent = 'Profilo cloud ✓';
  indicator.title = 'Player Profile sincronizzato con Supabase.';
}

function competitionFieldsMarkup(athlete) {
  const category = String(athlete.competitionCategory || '');
  const gender = String(athlete.competitionGender || '');

  return `
    <div class="field" data-profile-competition-field>
      <label>Categoria competitiva</label>
      <select name="competitionCategory">
        <option value="">—</option>
        ${['U10','U12','U14','U16','U18','Open'].map(value => `
          <option value="${value}" ${category === value ? 'selected' : ''}>${value}</option>
        `).join('')}
      </select>
    </div>
    <div class="field" data-profile-competition-field>
      <label>Sesso competitivo</label>
      <select name="competitionGender">
        <option value="">—</option>
        <option value="F" ${gender === 'F' ? 'selected' : ''}>Femminile</option>
        <option value="M" ${gender === 'M' ? 'selected' : ''}>Maschile</option>
      </select>
    </div>
  `;
}

function syncFormToStore(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  store.update(state => Object.assign(state.athlete, data));
}

function injectCompetitionFields(form) {
  if (form.querySelector('[data-profile-competition-field]')) return;

  const athlete = store.getState().athlete || {};
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  wrap.dataset.profileCompetitionFields = 'true';
  wrap.innerHTML = competitionFieldsMarkup(athlete);

  const birthField = form.querySelector('input[name="birthDate"]')?.closest('.field');
  if (birthField) birthField.insertAdjacentElement('afterend', wrap);
  else form.appendChild(wrap);

  wrap.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      syncFormToStore(form);
      setStatus('syncing');
    });
  });
}

function injectSummary() {
  const summary = document.querySelector('.profile-summary .summary-list');
  if (!summary || summary.querySelector('[data-profile-competition-summary]')) return;

  const athlete = store.getState().athlete || {};
  const category = String(athlete.competitionCategory || '');
  const gender = String(athlete.competitionGender || '');

  const box = document.createElement('div');
  box.dataset.profileCompetitionSummary = 'true';
  box.style.display = 'contents';
  box.innerHTML = `
    <div class="summary-row"><span>Categoria</span><span>${escapeHtml(category || '—')}</span></div>
    <div class="summary-row"><span>Circuito</span><span>${escapeHtml(gender === 'F' ? 'Femminile' : gender === 'M' ? 'Maschile' : '—')}</span></div>
  `;
  summary.prepend(...box.children);
}

function bindProfileForm() {
  const form = document.querySelector('#athlete-form');
  if (!form || form.dataset.cloudProfileBound === 'true') return;

  form.dataset.cloudProfileBound = 'true';
  injectCompetitionFields(form);
  injectSummary();

  const access = getCurrentAccess();
  if (!access.isAdmin) {
    [...form.elements].forEach(element => {
      element.disabled = true;
    });
    setStatus('readonly');
    return;
  }

  form.addEventListener('input', () => setStatus('syncing'));
  form.addEventListener('change', () => setStatus('syncing'));
  setStatus('synced');
}

function refresh() {
  if (route() !== 'athlete') return;
  window.queueMicrotask(bindProfileForm);
}

store.subscribe(state => {
  const savedAt = String(state.meta?.athleteProfileCloudSavedAt || '');
  const errorAt = String(state.meta?.athleteProfileCloudErrorAt || '');

  if (errorAt && errorAt !== lastErrorAt) {
    lastErrorAt = errorAt;
    setStatus('error', state.meta?.athleteProfileCloudErrorMessage || '');
    return;
  }

  if (savedAt && savedAt !== lastSavedAt) {
    lastSavedAt = savedAt;
    setStatus('synced');
  }
});

const main = document.querySelector('#main-content');
if (main) {
  const observer = new MutationObserver(refresh);
  observer.observe(main, { childList: true, subtree: true });
}

window.addEventListener('hashchange', refresh);
refresh();

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
