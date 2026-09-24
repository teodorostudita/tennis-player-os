import { supabase } from '../cloud/supabaseClient.js';
import { getCurrentAccess } from '../cloud/access.js';
import { store } from '../data/store.js';

const SAVE_DELAY_MS = 180;
let saveTimer = null;
let saving = false;
let queued = false;

function currentCompetitionMeta() {
  const athlete = store.getState().athlete || {};
  const root = athlete.cloudMetadata?.tennisPlayerOS;
  const competition = root?.competition;

  return {
    category: String(
      athlete.competitionCategory
      || competition?.category
      || '',
    ),
    gender: String(
      athlete.competitionGender
      || competition?.gender
      || '',
    ),
  };
}

function applyCompetitionMetaToStore() {
  const athlete = store.getState().athlete || {};
  const root = athlete.cloudMetadata?.tennisPlayerOS;
  const competition = root?.competition;
  if (!competition || typeof competition !== 'object') return;

  const category = String(competition.category || '');
  const gender = String(competition.gender || '');

  if (
    athlete.competitionCategory === category
    && athlete.competitionGender === gender
  ) return;

  store.update(state => {
    state.athlete.competitionCategory = category;
    state.athlete.competitionGender = gender;
  });
}

async function saveCompetitionMeta() {
  if (saving) {
    queued = true;
    return;
  }

  const access = getCurrentAccess();
  if (!access.isAdmin || !access.athleteId) return;

  saving = true;
  queued = false;

  try {
    const { data: current, error: readError } = await supabase
      .from('athletes')
      .select('metadata')
      .eq('id', access.athleteId)
      .single();

    if (readError) throw readError;

    const metadata = current?.metadata
      && typeof current.metadata === 'object'
      && !Array.isArray(current.metadata)
        ? current.metadata
        : {};
    const root = metadata.tennisPlayerOS
      && typeof metadata.tennisPlayerOS === 'object'
      && !Array.isArray(metadata.tennisPlayerOS)
        ? metadata.tennisPlayerOS
        : {};
    const competition = currentCompetitionMeta();

    const nextMetadata = {
      ...metadata,
      tennisPlayerOS: {
        ...root,
        competition,
      },
    };

    const { data, error } = await supabase
      .from('athletes')
      .update({ metadata: nextMetadata })
      .eq('id', access.athleteId)
      .select('metadata')
      .single();

    if (error) throw error;

    store.update(state => {
      state.athlete.cloudMetadata = data?.metadata || nextMetadata;
      state.meta.athleteCompetitionCloudSavedAt = new Date().toISOString();
    });
  } catch (error) {
    console.warn('Competitive athlete profile save failed.', error);
  } finally {
    saving = false;
    if (queued) {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void saveCompetitionMeta();
      }, SAVE_DELAY_MS);
    }
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveCompetitionMeta();
  }, SAVE_DELAY_MS);
}

function injectFields() {
  const form = document.querySelector('#athlete-form');
  if (!form || form.querySelector('[data-competition-profile-fields]')) return;

  const athlete = store.getState().athlete || {};
  const category = String(athlete.competitionCategory || '');
  const gender = String(athlete.competitionGender || '');

  const wrap = document.createElement('div');
  wrap.dataset.competitionProfileFields = 'true';
  wrap.style.display = 'contents';
  wrap.innerHTML = `
    <div class="field">
      <label>Categoria competitiva</label>
      <select name="competitionCategory" data-competition-category>
        <option value="">—</option>
        ${['U10','U12','U14','U16','U18','Open'].map(value => `
          <option value="${value}" ${category === value ? 'selected' : ''}>${value}</option>
        `).join('')}
      </select>
    </div>
    <div class="field">
      <label>Sesso competitivo</label>
      <select name="competitionGender" data-competition-gender>
        <option value="">—</option>
        <option value="F" ${gender === 'F' ? 'selected' : ''}>Femminile</option>
        <option value="M" ${gender === 'M' ? 'selected' : ''}>Maschile</option>
      </select>
    </div>
  `;

  const birthField = form.querySelector('input[name="birthDate"]')?.closest('.field');
  if (birthField) birthField.insertAdjacentElement('afterend', wrap);
  else form.appendChild(wrap);

  wrap.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      store.update(state => {
        state.athlete.competitionCategory = form.elements.competitionCategory?.value || '';
        state.athlete.competitionGender = form.elements.competitionGender?.value || '';
      });
      scheduleSave();
    });
  });

  const summary = document.querySelector('.profile-summary .summary-list');
  if (summary && !summary.querySelector('[data-competition-summary]')) {
    const row = document.createElement('div');
    row.dataset.competitionSummary = 'true';
    row.innerHTML = `
      <div class="summary-row"><span>Categoria</span><span>${escapeHtml(category || '—')}</span></div>
      <div class="summary-row"><span>Circuito</span><span>${escapeHtml(gender === 'F' ? 'Femminile' : gender === 'M' ? 'Maschile' : '—')}</span></div>
    `;
    summary.prepend(...row.children);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

applyCompetitionMetaToStore();

const main = document.querySelector('#main-content');
if (main) {
  const observer = new MutationObserver(() => {
    window.queueMicrotask(injectFields);
  });
  observer.observe(main, { childList: true, subtree: true });
}

window.addEventListener('hashchange', () => window.queueMicrotask(injectFields));
window.queueMicrotask(injectFields);
