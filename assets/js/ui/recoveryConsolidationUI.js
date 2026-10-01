import '../bootstrap.js';

import { store } from '../data/store.js';
import { canReadModule, canWriteModule, getCurrentAccess } from '../cloud/access.js';
import { loadCloudModuleState, saveCloudModuleState } from '../cloud/moduleStateCloud.js';
import { normalizeHealthPayload } from '../cloud/healthCloud.js';
import { BODY_HOTSPOTS, MUSCULOSKELETAL_DISTRICTS } from '../data/healthBodyMapData.js';
import { showInAppAlert, showInAppConfirm } from './inAppMessages.js';

const SYSTEM_DEFAULTS = Object.freeze({
  sleepHours: 8,
  sleepQuality: 4,
  fatigue: 1,
  soreness: 1,
  mood: 4,
  motivation: 3,
  concentration: 4,
});

const RANGE_OPTIONS = [7, 14, 30, 90, 'all'];
const CHECKOUT_EMOJIS = {
  1: { emoji: '😢', label: 'Molto scarso' },
  2: { emoji: '😕', label: 'Sotto tono' },
  3: { emoji: '🙂', label: 'Normale' },
  4: { emoji: '😄', label: 'Buono' },
  5: { emoji: '🥳', label: 'Eccellente' },
};
const CHECKIN_SERIES = [
  { key: 'sleepQuality', label: 'Qualità sonno', css: 'sleep-quality' },
  { key: 'motivation', label: 'Voglia', css: 'motivation' },
  { key: 'concentration', label: 'Concentrazione', css: 'concentration' },
  { key: 'fatigue', label: 'Stanchezza', css: 'fatigue' },
  { key: 'soreness', label: 'Indolenzimento', css: 'soreness' },
  { key: 'mood', label: 'Umore', css: 'mood' },
];

const SIDE_LABELS = { left: 'Sinistra', right: 'Destra', center: 'Centrale', bilateral: 'Bilaterale', none: '' };
const DISTRICT_BY_KEY = new Map(MUSCULOSKELETAL_DISTRICTS.map(item => [item.key, item]));
let sorenessPickerState = { date: '', scope: 'general', locations: [] };
let sorenessHydrationToken = 0;

let enhancementQueued = false;
let checkinRange = 30;
let checkoutRange = 30;
const RECOVERY_FOCUS_KEY = 'tpos.recovery.focus';
let focusTimer = null;

function route() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function isNutritionRoute() {
  return route() === 'nutrition';
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function sorenessLocationKey(location = {}) {
  return `${location.districtKey || ''}|${location.view || ''}|${location.side || ''}`;
}

function sorenessLocationLabel(location = {}) {
  const district = DISTRICT_BY_KEY.get(String(location.districtKey || ''));
  const side = ['center', 'none'].includes(location.side) ? '' : ` · ${SIDE_LABELS[location.side] || location.side}`;
  const view = location.view === 'back' ? ' · posteriore' : location.view === 'front' ? ' · anteriore' : '';
  return `${district?.label || location.districtKey || 'Distretto'}${side}${view}`;
}

function selectedSorenessLocation(location) {
  const key = sorenessLocationKey(location);
  return sorenessPickerState.locations.some(item => sorenessLocationKey(item) === key);
}

function resetSorenessPicker(date, scope = 'general', locations = []) {
  sorenessPickerState = {
    date: String(date || ''),
    scope: scope === 'localized' ? 'localized' : 'general',
    locations: Array.isArray(locations) ? locations.map(item => ({
      districtKey: String(item?.districtKey || ''),
      view: String(item?.view || ''),
      side: String(item?.side || 'center'),
    })).filter(item => item.districtKey && item.view) : [],
  };
}

function currentHealthSorenessLog(date) {
  const logs = Array.isArray(store.getState().health?.sorenessLogs)
    ? store.getState().health.sorenessLogs
    : [];
  return logs.find(item => item.date === date && item.source === 'recovery-checkin') || null;
}

function currentRecoveryScope(date) {
  const recovery = normalizeNutritionState().recoveryLogs.find(item => item.date === date);
  return recovery?.sorenessScope === 'localized' ? 'localized' : 'general';
}

function renderSorenessPickerMarkup(sorenessValue) {
  const healthWritable = canWriteModule('health');
  const active = Number(sorenessValue || 1) > 1;
  const localized = sorenessPickerState.scope === 'localized';

  if (!active) return '';

  if (!healthWritable) {
    return `
      <div class="recovery-soreness-link-note">
        <strong>Indolenzimento presente</strong>
        <span>La localizzazione sulla Body map richiede accesso in scrittura a Body & Health.</span>
      </div>
    `;
  }

  const hotspots = BODY_HOTSPOTS.map(hotspot => {
    const district = DISTRICT_BY_KEY.get(hotspot.districtKey);
    if (!district) return '';
    const selected = selectedSorenessLocation(hotspot);
    return `
      <button
        type="button"
        class="recovery-soreness-hotspot ${selected ? 'selected' : ''}"
        style="left:${hotspot.x}%;top:${hotspot.y}%"
        data-soreness-hotspot
        data-district-key="${escapeAttr(hotspot.districtKey)}"
        data-view="${escapeAttr(hotspot.view)}"
        data-side="${escapeAttr(hotspot.side)}"
        aria-pressed="${selected ? 'true' : 'false'}"
        title="${escapeAttr(sorenessLocationLabel(hotspot))}"
      ><span></span></button>
    `;
  }).join('');

  return `
    <div class="recovery-soreness-link" data-soreness-link>
      <div class="recovery-soreness-scope">
        <span>È un indolenzimento generale o localizzato?</span>
        <div>
          <label><input type="radio" name="sorenessScope" value="general" ${localized ? '' : 'checked'} /> Generale</label>
          <label><input type="radio" name="sorenessScope" value="localized" ${localized ? 'checked' : ''} /> Localizzato</label>
        </div>
      </div>
      <div class="recovery-soreness-map-wrap" ${localized ? '' : 'hidden'} data-soreness-localized>
        <div class="recovery-soreness-map-copy">
          <strong>Dove?</strong>
          <span>Puoi selezionare più di un distretto. Il dettaglio viene registrato in Body & Health.</span>
        </div>
        <div class="recovery-soreness-map-canvas">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/c/c7/Silhouette_humain_asexue_anterieur_posterieur.svg"
            alt="Body chart anteriore e posteriore"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          ${hotspots}
        </div>
        <div class="recovery-soreness-selected" data-soreness-selected>
          ${sorenessPickerState.locations.length
            ? sorenessPickerState.locations.map(item => `<span>${escapeHtml(sorenessLocationLabel(item))}</span>`).join('')
            : '<em>Nessun distretto selezionato.</em>'}
        </div>
      </div>
    </div>
  `;
}

function paintSorenessPicker(container) {
  if (!container) return;
  const form = container.closest('form');
  const soreness = Number(form?.elements?.soreness?.value || 1);
  container.innerHTML = renderSorenessPickerMarkup(soreness);

  container.querySelectorAll('input[name="sorenessScope"]').forEach(input => {
    input.addEventListener('change', () => {
      sorenessPickerState.scope = input.value === 'localized' ? 'localized' : 'general';
      if (sorenessPickerState.scope !== 'localized') sorenessPickerState.locations = [];
      paintSorenessPicker(container);
    });
  });

  container.querySelectorAll('[data-soreness-hotspot]').forEach(button => {
    button.addEventListener('click', () => {
      const location = {
        districtKey: button.dataset.districtKey,
        view: button.dataset.view,
        side: button.dataset.side,
      };
      const key = sorenessLocationKey(location);
      const exists = sorenessPickerState.locations.some(item => sorenessLocationKey(item) === key);
      sorenessPickerState.locations = exists
        ? sorenessPickerState.locations.filter(item => sorenessLocationKey(item) !== key)
        : [...sorenessPickerState.locations, location];
      paintSorenessPicker(container);
    });
  });
}

async function hydrateHealthSoreness(date, container) {
  if (!date || !canReadModule('health')) return;
  const token = ++sorenessHydrationToken;

  try {
    const athleteId = getCurrentAccess().athleteId;
    if (!athleteId) return;
    const cloudState = await loadCloudModuleState({ athleteId, moduleKey: 'health' });
    if (token !== sorenessHydrationToken) return;

    const health = normalizeHealthPayload(cloudState?.payload || store.getState().health || {});
    const log = health.sorenessLogs.find(item => item.date === date && item.source === 'recovery-checkin') || null;
    store.update(state => {
      state.health = health;
    });
    if (token !== sorenessHydrationToken) return;
    resetSorenessPicker(date, log?.scope || currentRecoveryScope(date), log?.locations || []);
    paintSorenessPicker(container);
  } catch (error) {
    console.warn('Impossibile caricare la localizzazione dell’indolenzimento da Body & Health.', error);
  }
}

async function saveHealthSoreness({ date, severity, scope, locations }) {
  if (!canWriteModule('health')) return;
  const athleteId = getCurrentAccess().athleteId;
  if (!athleteId) return;

  const cloudState = await loadCloudModuleState({ athleteId, moduleKey: 'health' });
  const health = normalizeHealthPayload(cloudState?.payload || store.getState().health || {});
  health.sorenessLogs = (health.sorenessLogs || []).filter(item => !(item.date === date && item.source === 'recovery-checkin'));

  if (Number(severity) > 1 && scope === 'localized' && locations.length) {
    health.sorenessLogs.push({
      id: `soreness-${date}`,
      date,
      severity: Number(severity),
      scope: 'localized',
      locations,
      source: 'recovery-checkin',
      notes: '',
    });
  }

  const normalized = normalizeHealthPayload(health);
  await saveCloudModuleState({
    athleteId,
    moduleKey: 'health',
    payload: normalized,
    schemaVersion: 2,
  });

  store.update(state => {
    state.health = normalized;
  });
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatShortDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(year, month - 1, day));
}

function dateToMs(value) {
  if (!value) return 0;
  return new Date(`${value}T00:00:00`).getTime();
}

function decimalHoursFromTimes(bedtime, wakeTime) {
  const toMinutes = value => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };

  let start = toMinutes(bedtime);
  let end = toMinutes(wakeTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}

function formatHours(value) {
  const hours = Number(value || 0);
  if (!hours) return '—';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours)} h`;
}

function formatDecimal(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function clampScore(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? number : fallback;
}

function normalizeDefaults(value = {}) {
  return {
    sleepHours: Number.isFinite(Number(value.sleepHours)) && Number(value.sleepHours) >= 0
      ? Number(value.sleepHours)
      : SYSTEM_DEFAULTS.sleepHours,
    sleepQuality: clampScore(value.sleepQuality, SYSTEM_DEFAULTS.sleepQuality),
    fatigue: clampScore(value.fatigue, SYSTEM_DEFAULTS.fatigue),
    soreness: clampScore(value.soreness, SYSTEM_DEFAULTS.soreness),
    mood: clampScore(value.mood, SYSTEM_DEFAULTS.mood),
    motivation: clampScore(value.motivation, SYSTEM_DEFAULTS.motivation),
    concentration: clampScore(value.concentration, SYSTEM_DEFAULTS.concentration),
  };
}

function scoreOptions(kind, selected) {
  const labels = {
    sleepQuality: ['1 — Pessima', '2 — Scarsa', '3 — Discreta', '4 — Buona', '5 — Ottima'],
    fatigue: ['1 — Nessuna', '2 — Lieve', '3 — Moderata', '4 — Alta', '5 — Estrema'],
    soreness: ['1 — Assente', '2 — Lieve', '3 — Moderato', '4 — Forte', '5 — Molto forte'],
    mood: ['1 — Molto negativo', '2 — Negativo', '3 — Neutro', '4 — Positivo', '5 — Molto positivo'],
    motivation: ['1 — Nessuna', '2 — Bassa', '3 — Normale', '4 — Alta', '5 — Molto alta'],
    concentration: ['1 — Molto bassa', '2 — Bassa', '3 — Normale', '4 — Alta', '5 — Molto alta'],
  };

  return (labels[kind] || labels.motivation)
    .map((label, index) => {
      const value = index + 1;
      return `<option value="${value}" ${Number(selected) === value ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
}

function checkoutQualityLabel(value) {
  return CHECKOUT_EMOJIS[Number(value)]?.label || '—';
}

function checkoutEmoji(value) {
  return CHECKOUT_EMOJIS[Number(value)]?.emoji || '🙂';
}

function qualityPickerButtons(selected = 3) {
  return Object.entries(CHECKOUT_EMOJIS)
    .map(([value, item]) => `
      <button
        type="button"
        class="recovery-quality-choice ${Number(selected) === Number(value) ? 'active' : ''}"
        data-checkout-quality="${value}"
        aria-pressed="${Number(selected) === Number(value) ? 'true' : 'false'}"
        title="${escapeAttr(value)} — ${escapeAttr(item.label)}"
      >
        <span class="recovery-quality-choice-emoji">${item.emoji}</span>
        <span class="recovery-quality-choice-score">${value}</span>
      </button>
    `)
    .join('');
}

function normalizeNutritionState() {
  const nutrition = store.getState().nutrition || {};
  return {
    sleepLogs: Array.isArray(nutrition.sleepLogs) ? nutrition.sleepLogs : [],
    recoveryLogs: Array.isArray(nutrition.recoveryLogs) ? nutrition.recoveryLogs : [],
    trainingCheckouts: Array.isArray(nutrition.trainingCheckouts) ? nutrition.trainingCheckouts : [],
    checkinDefaults: normalizeDefaults(nutrition.checkinDefaults || {}),
  };
}

function ensureState(state) {
  if (!state.nutrition || Array.isArray(state.nutrition)) state.nutrition = {};
  if (!Array.isArray(state.nutrition.sleepLogs)) state.nutrition.sleepLogs = [];
  if (!Array.isArray(state.nutrition.recoveryLogs)) state.nutrition.recoveryLogs = [];
  if (!Array.isArray(state.nutrition.trainingCheckouts)) state.nutrition.trainingCheckouts = [];
  state.nutrition.checkinDefaults = normalizeDefaults(state.nutrition.checkinDefaults || {});
}

function notesFromLegacy(sleep, recovery) {
  const sleepNote = String(sleep?.notes || '').trim();
  const recoveryNote = String(recovery?.notes || '').trim();
  if (sleepNote && recoveryNote && sleepNote !== recoveryNote) {
    return `Sonno: ${sleepNote}\nRecupero: ${recoveryNote}`;
  }
  return recoveryNote || sleepNote;
}

function mergedLogForDate(date) {
  const { sleepLogs, recoveryLogs } = normalizeNutritionState();
  const sleep = sleepLogs.find(item => item.date === date);
  const recovery = recoveryLogs.find(item => item.date === date);
  if (!sleep && !recovery) return null;

  const sleepHours = Number(
    recovery?.sleepHours
    ?? sleep?.sleepHours
    ?? decimalHoursFromTimes(sleep?.bedtime, sleep?.wakeTime)
    ?? 0
  );

  const sleepQuality = Number(recovery?.sleepQuality ?? sleep?.quality ?? 0);

  return {
    date,
    sleepHours,
    sleepQuality,
    fatigue: Number(recovery?.fatigue || 0),
    soreness: Number(recovery?.soreness || 0),
    sorenessScope: recovery?.sorenessScope === 'localized' ? 'localized' : 'general',
    mood: Number(recovery?.mood || 0),
    motivation: Number(recovery?.motivation || 0),
    concentration: Number(recovery?.concentration || 0),
    legacyReadiness: Number(recovery?.readiness || 0),
    notes: notesFromLegacy(sleep, recovery),
  };
}

function mergedLogs() {
  const { sleepLogs, recoveryLogs } = normalizeNutritionState();
  const dates = new Set([
    ...sleepLogs.map(item => item.date).filter(Boolean),
    ...recoveryLogs.map(item => item.date).filter(Boolean),
  ]);

  return [...dates]
    .map(mergedLogForDate)
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function checkoutForDate(date) {
  return normalizeNutritionState().trainingCheckouts.find(item => item.date === date) || null;
}

function sortedCheckouts() {
  return [...normalizeNutritionState().trainingCheckouts]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function renderMetric(label, value) {
  return `
    <div class="recovery-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${value ? `${escapeHtml(value)}/5` : '—'}</strong>
    </div>
  `;
}

function renderHistoryRow(log, writable) {
  return `
    <article class="recovery-history-row compact">
      <div class="recovery-history-main">
        <div class="recovery-history-date">
          <strong>${escapeHtml(formatDate(log.date))}</strong>
          <span>${escapeHtml(formatHours(log.sleepHours))} di sonno · qualità ${log.sleepQuality ? `${log.sleepQuality}/5` : '—'}</span>
        </div>

        <div class="recovery-history-metrics">
          ${renderMetric('Voglia', log.motivation)}
          ${renderMetric('Concentrazione', log.concentration)}
          ${renderMetric('Stanchezza', log.fatigue)}
          ${renderMetric('Indolenzimento', log.soreness)}
          ${renderMetric('Umore', log.mood)}
        </div>

        ${log.legacyReadiness && !log.motivation
          ? `<div class="recovery-legacy-note">Storico precedente: prontezza ${escapeHtml(log.legacyReadiness)}/5.</div>`
          : ''}

        ${log.notes ? `<div class="recovery-history-notes">${escapeHtml(log.notes)}</div>` : ''}
      </div>

      ${writable
        ? `<button class="resource-delete" type="button" data-delete-combined-recovery="${escapeAttr(log.date)}">Elimina</button>`
        : ''}
    </article>
  `;
}

function renderCheckoutRow(item, writable) {
  const trained = item.trained !== false;
  const quality = Number(item.quality || 0);
  return `
    <article class="recovery-checkout-row compact">
      <div>
        <strong>${escapeHtml(formatDate(item.date))}</strong>
        <span>${trained
          ? `${checkoutEmoji(quality)} Qualità ${escapeHtml(item.quality || '—')}/5 · ${escapeHtml(checkoutQualityLabel(item.quality))}`
          : 'Nessun allenamento nella giornata'}</span>
        ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}
      </div>
      ${writable
        ? `<button class="resource-delete" type="button" data-delete-training-checkout="${escapeAttr(item.date)}">Elimina</button>`
        : ''}
    </article>
  `;
}

function applyCheckinValues(form, values) {
  form.elements.sleepHours.value = values.sleepHours ?? '';
  form.elements.sleepQuality.value = values.sleepQuality;
  form.elements.fatigue.value = values.fatigue;
  form.elements.soreness.value = values.soreness;
  form.elements.mood.value = values.mood;
  form.elements.motivation.value = values.motivation;
  form.elements.concentration.value = values.concentration;
  form.elements.notes.value = values.notes || '';
}

function fillCheckinFormForDate(form, date) {
  const defaults = normalizeNutritionState().checkinDefaults;
  const existing = mergedLogForDate(date);

  applyCheckinValues(form, existing ? {
    sleepHours: existing.sleepHours || defaults.sleepHours,
    sleepQuality: existing.sleepQuality || defaults.sleepQuality,
    fatigue: existing.fatigue || defaults.fatigue,
    soreness: existing.soreness || defaults.soreness,
    mood: existing.mood || defaults.mood,
    motivation: existing.motivation || defaults.motivation,
    concentration: existing.concentration || defaults.concentration,
    notes: existing.notes || '',
  } : {
    ...defaults,
    notes: '',
  });
}

function updateQualityPicker(form, value = Number(form.elements.quality.value || 3)) {
  const quality = Math.min(5, Math.max(1, Number(value) || 3));
  form.elements.quality.value = quality;
  form.querySelectorAll('[data-checkout-quality]').forEach(button => {
    const active = Number(button.dataset.checkoutQuality) === quality;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const label = form.querySelector('[data-checkout-quality-label]');
  if (label) label.textContent = `${quality}/5 · ${checkoutQualityLabel(quality)}`;
}

function fillCheckoutFormForDate(form, date) {
  const existing = checkoutForDate(date);
  form.elements.noTraining.checked = existing?.trained === false;
  form.elements.quality.value = existing?.quality || 3;
  form.elements.notes.value = existing?.notes || '';
  syncCheckoutDisabled(form);
  updateQualityPicker(form, existing?.quality || 3);
}

function defaultsSummary(defaults) {
  return `${formatHours(defaults.sleepHours)} · sonno ${defaults.sleepQuality}/5 · stanchezza ${defaults.fatigue}/5 · indolenzimento ${defaults.soreness}/5 · umore ${defaults.mood}/5 · voglia ${defaults.motivation}/5 · concentrazione ${defaults.concentration}/5`;
}

function renderDefaultsDialog(defaults) {
  return `
    <dialog id="recovery-defaults-dialog" class="dialog recovery-defaults-dialog">
      <form method="dialog" class="dialog-shell">
        <div class="dialog-head">
          <div>
            <span class="eyebrow">Check-in rapido</span>
            <h3>Valori abituali</h3>
            <p>Questi valori precompilano ogni nuovo check-in. L'atleta modifica soltanto ciò che oggi è diverso dal solito.</p>
          </div>
          <button type="button" class="icon-button" data-close-defaults aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body">
          <form id="recovery-defaults-form" class="form-grid">
            <div class="field"><label>Ore di sonno</label><input name="sleepHours" type="number" min="0" max="24" step="0.25" value="${escapeAttr(defaults.sleepHours)}" required></div>
            <div class="field"><label>Qualità del sonno · 1–5</label><select name="sleepQuality">${scoreOptions('sleepQuality', defaults.sleepQuality)}</select></div>
            <div class="field"><label>Stanchezza · 1–5</label><select name="fatigue">${scoreOptions('fatigue', defaults.fatigue)}</select></div>
            <div class="field"><label>Indolenzimento · 1–5</label><select name="soreness">${scoreOptions('soreness', defaults.soreness)}</select></div>
            <div class="field"><label>Umore · 1–5</label><select name="mood">${scoreOptions('mood', defaults.mood)}</select></div>
            <div class="field"><label>Voglia di allenarsi · 1–5</label><select name="motivation">${scoreOptions('motivation', defaults.motivation)}</select></div>
            <div class="field"><label>Concentrazione · 1–5</label><select name="concentration">${scoreOptions('concentration', defaults.concentration)}</select></div>
          </form>
        </div>
        <div class="dialog-foot">
          <button type="button" class="button button-ghost" data-close-defaults>Annulla</button>
          <button type="submit" class="button button-primary" form="recovery-defaults-form">Salva valori abituali</button>
        </div>
      </form>
    </dialog>
  `;
}

function sortChronological(items) {
  return [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function sliceByRange(items, range) {
  if (range === 'all' || !items.length) return items;
  const last = dateToMs(items[items.length - 1]?.date);
  const cutoff = last - ((Number(range) - 1) * 24 * 60 * 60 * 1000);
  return items.filter(item => dateToMs(item.date) >= cutoff);
}

function average(values) {
  const filtered = values.filter(value => Number.isFinite(Number(value)) && Number(value) > 0).map(Number);
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function movingAverage(rows, key, windowSize) {
  return rows.map((row, index) => {
    const subset = rows.slice(Math.max(0, index - windowSize + 1), index + 1)
      .map(item => Number(item[key] || 0))
      .filter(value => value > 0);
    return subset.length
      ? { date: row.date, value: subset.reduce((sum, value) => sum + value, 0) / subset.length }
      : { date: row.date, value: null };
  });
}

function rangeButtons(group, selected) {
  return RANGE_OPTIONS.map(option => {
    const active = option === selected;
    const label = option === 'all' ? 'Tutto' : `${option}g`;
    return `<button type="button" class="recovery-range-button ${active ? 'active' : ''}" data-recovery-range="${group}" data-range-value="${option}">${label}</button>`;
  }).join('');
}

function chartTicks(min, max, count = 5) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => max - (step * index));
}

function polylinePoints(points, xFromIndex, yFromValue) {
  return points
    .map((value, index) => {
      if (!Number.isFinite(Number(value))) return null;
      return `${xFromIndex(index)},${yFromValue(Number(value))}`;
    })
    .filter(Boolean)
    .join(' ');
}

function singlePointMarkers(points, xFromIndex, yFromValue, cssClass) {
  return points
    .map((value, index) => Number.isFinite(Number(value))
      ? `<circle class="${cssClass}" cx="${xFromIndex(index)}" cy="${yFromValue(Number(value))}" r="3.2"></circle>`
      : '')
    .join('');
}

function xTicksMarkup(rows, width, paddingLeft, innerWidth, height) {
  if (!rows.length) return '';
  const maxTicks = Math.min(6, rows.length);
  const indexes = [...new Set(Array.from({ length: maxTicks }, (_, i) => Math.round(i * (rows.length - 1) / Math.max(1, maxTicks - 1))))];
  return indexes.map(index => {
    const x = rows.length === 1 ? paddingLeft + (innerWidth / 2) : paddingLeft + ((innerWidth) * index / Math.max(1, rows.length - 1));
    return `<text x="${x}" y="${height - 4}" text-anchor="middle">${escapeHtml(formatShortDate(rows[index].date))}</text>`;
  }).join('');
}

function buildLineChart({ rows, series, yMin = 1, yMax = 5, height = 230, emptyLabel = 'Nessun dato disponibile.' }) {
  if (!rows.length) {
    return `<div class="recovery-chart-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  const width = 760;
  const padding = { top: 16, right: 16, bottom: 30, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xFromIndex = index => rows.length === 1
    ? padding.left + (innerWidth / 2)
    : padding.left + (innerWidth * index / Math.max(1, rows.length - 1));
  const yFromValue = value => padding.top + ((yMax - value) / (yMax - yMin)) * innerHeight;
  const ticks = chartTicks(yMin, yMax, 5);

  return `
    <svg class="recovery-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Grafico andamento">
      <g class="recovery-chart-grid">
        ${ticks.map(value => `
          <g>
            <line x1="${padding.left}" y1="${yFromValue(value)}" x2="${width - padding.right}" y2="${yFromValue(value)}"></line>
            <text x="${padding.left - 10}" y="${yFromValue(value) + 4}" text-anchor="end">${escapeHtml(String(Math.round(value * 10) / 10).replace('.', ','))}</text>
          </g>
        `).join('')}
      </g>
      <g class="recovery-chart-xaxis">${xTicksMarkup(rows, width, padding.left, innerWidth, height)}</g>
      <g class="recovery-chart-series">
        ${series.map(serie => {
          const values = rows.map(row => Number(row[serie.key]) > 0 ? Number(row[serie.key]) : NaN);
          return `
            <polyline class="recovery-chart-line recovery-series-${serie.css}" fill="none" points="${polylinePoints(values, xFromIndex, yFromValue)}"></polyline>
            ${singlePointMarkers(values, xFromIndex, yFromValue, `recovery-chart-point recovery-series-${serie.css}`)}
          `;
        }).join('')}
      </g>
    </svg>
  `;
}

function buildBarChart({ rows, key, yMax, height = 150, emptyLabel = 'Nessun dato disponibile.' }) {
  if (!rows.length) return `<div class="recovery-chart-empty">${escapeHtml(emptyLabel)}</div>`;
  const width = 760;
  const padding = { top: 16, right: 16, bottom: 30, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barWidth = Math.max(10, Math.min(36, innerWidth / Math.max(1, rows.length) - 6));
  const xFromIndex = index => padding.left + (innerWidth * index / Math.max(1, rows.length - 1));
  const yFromValue = value => padding.top + ((yMax - value) / yMax) * innerHeight;
  const ticks = [0, Math.round(yMax / 2), yMax];

  return `
    <svg class="recovery-chart-svg recovery-chart-svg-small" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Grafico ore di sonno">
      <g class="recovery-chart-grid">
        ${ticks.map(value => `
          <g>
            <line x1="${padding.left}" y1="${yFromValue(value)}" x2="${width - padding.right}" y2="${yFromValue(value)}"></line>
            <text x="${padding.left - 10}" y="${yFromValue(value) + 4}" text-anchor="end">${escapeHtml(String(value))}</text>
          </g>
        `).join('')}
      </g>
      <g class="recovery-chart-xaxis">${xTicksMarkup(rows, width, padding.left, innerWidth, height)}</g>
      <g class="recovery-chart-bars">
        ${rows.map((row, index) => {
          const value = Math.max(0, Number(row[key] || 0));
          const x = xFromIndex(index) - (barWidth / 2);
          const y = yFromValue(value);
          const h = padding.top + innerHeight - y;
          return `<rect class="recovery-chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4"></rect>`;
        }).join('')}
      </g>
    </svg>
  `;
}

function renderCheckinAnalytics(logs, writable) {
  const chron = sortChronological(logs);
  const ranged = sliceByRange(chron, checkinRange);
  const avgSleep = average(ranged.map(item => item.sleepHours));
  const avgMood = average(ranged.map(item => item.mood));
  const avgMotivation = average(ranged.map(item => item.motivation));
  const lastDate = ranged.at(-1)?.date;
  const maxSleep = Math.max(10, ...ranged.map(item => Number(item.sleepHours || 0)));

  return `
    <article class="panel wellbeing-history-panel recovery-analytics-panel">
      <div class="panel-header recovery-analytics-head">
        <div>
          <h3>Andamento check-in</h3>
          <p>Trend dei valori giornalieri con orizzonte temporale variabile.</p>
        </div>
        <div class="recovery-range-switch" role="group" aria-label="Intervallo andamento check-in">
          ${rangeButtons('checkin', checkinRange)}
        </div>
      </div>
      <div class="panel-body recovery-analytics-body">
        <div class="recovery-analytics-stats">
          <div class="recovery-stat"><span>Registrazioni</span><strong>${ranged.length}</strong></div>
          <div class="recovery-stat"><span>Sonno medio</span><strong>${avgSleep ? `${escapeHtml(formatDecimal(avgSleep, 1))} h` : '—'}</strong></div>
          <div class="recovery-stat"><span>Umore medio</span><strong>${avgMood ? `${escapeHtml(formatDecimal(avgMood, 1))}/5` : '—'}</strong></div>
          <div class="recovery-stat"><span>Voglia media</span><strong>${avgMotivation ? `${escapeHtml(formatDecimal(avgMotivation, 1))}/5` : '—'}</strong></div>
          <div class="recovery-stat"><span>Ultimo check-in</span><strong>${lastDate ? escapeHtml(formatShortDate(lastDate)) : '—'}</strong></div>
        </div>

        <div class="recovery-chart-card">
          <div class="recovery-chart-head">
            <strong>Trend percezione giornaliera</strong>
            <span>Scala 1–5</span>
          </div>
          ${buildLineChart({ rows: ranged, series: CHECKIN_SERIES, yMin: 1, yMax: 5, height: 240, emptyLabel: 'Nessun check-in nel periodo selezionato.' })}
          <div class="recovery-chart-legend">
            ${CHECKIN_SERIES.map(item => `<span><i class="recovery-legend-dot recovery-series-${item.css}"></i>${escapeHtml(item.label)}</span>`).join('')}
          </div>
        </div>

        <div class="recovery-chart-card">
          <div class="recovery-chart-head">
            <strong>Ore di sonno</strong>
            <span>Barre giornaliere</span>
          </div>
          ${buildBarChart({ rows: ranged, key: 'sleepHours', yMax: Math.ceil(maxSleep), height: 150, emptyLabel: 'Nessuna informazione sul sonno nel periodo selezionato.' })}
        </div>

        <details class="recovery-recent-details">
          <summary>
            <span><strong>Ultimi check-in</strong><small>${logs.length} registrazion${logs.length === 1 ? 'e' : 'i'}</small></span>
            <b>Apri analitico</b>
          </summary>
          <div class="recovery-history-list">
            ${logs.length ? logs.slice(0, 10).map(log => renderHistoryRow(log, writable)).join('') : '<div class="wellbeing-empty">Nessun check-in registrato.</div>'}
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderCheckoutAnalytics(checkouts, writable) {
  const chron = sortChronological(checkouts);
  const ranged = sliceByRange(chron, checkoutRange);
  const trainedRows = ranged.filter(item => item.trained !== false && Number(item.quality || 0) > 0);
  const avgQuality = average(trainedRows.map(item => item.quality));
  const maSeries = movingAverage(trainedRows, 'quality', 5).map(item => ({ date: item.date, movingAverage: item.value }));
  const chartRows = trainedRows.map(item => ({ ...item, movingAverage: maSeries.find(entry => entry.date === item.date)?.movingAverage }));
  const latestMA = chartRows.at(-1)?.movingAverage;
  const noTrainingCount = ranged.filter(item => item.trained === false).length;

  return `
    <article class="panel wellbeing-history-panel recovery-analytics-panel">
      <div class="panel-header recovery-analytics-head">
        <div>
          <h3>Andamento checkout</h3>
          <p>Qualità percepita dell'allenamento con media mobile a 5 sessioni.</p>
        </div>
        <div class="recovery-range-switch" role="group" aria-label="Intervallo andamento checkout">
          ${rangeButtons('checkout', checkoutRange)}
        </div>
      </div>
      <div class="panel-body recovery-analytics-body">
        <div class="recovery-analytics-stats">
          <div class="recovery-stat"><span>Sessioni nel periodo</span><strong>${trainedRows.length}</strong></div>
          <div class="recovery-stat"><span>Media qualità</span><strong>${avgQuality ? `${escapeHtml(formatDecimal(avgQuality, 1))}/5` : '—'}</strong></div>
          <div class="recovery-stat"><span>Media mobile</span><strong>${latestMA ? `${escapeHtml(formatDecimal(latestMA, 1))}/5` : '—'}</strong></div>
          <div class="recovery-stat"><span>Giorni senza training</span><strong>${noTrainingCount}</strong></div>
        </div>

        <div class="recovery-chart-card">
          <div class="recovery-chart-head">
            <strong>Qualità allenamento</strong>
            <span>Linea piena + media mobile 5 sessioni</span>
          </div>
          ${buildLineChart({ rows: chartRows, series: [
            { key: 'quality', label: 'Qualità', css: 'checkout' },
            { key: 'movingAverage', label: 'Media mobile', css: 'moving-average' },
          ], yMin: 1, yMax: 5, height: 240, emptyLabel: 'Non ci sono ancora allenamenti registrati nel periodo selezionato.' })}
          <div class="recovery-chart-legend">
            <span><i class="recovery-legend-dot recovery-series-checkout"></i>Qualità</span>
            <span><i class="recovery-legend-dot recovery-series-moving-average"></i>Media mobile 5</span>
          </div>
        </div>

        <details class="recovery-recent-details">
          <summary>
            <span><strong>Ultimi checkout</strong><small>${checkouts.length} registrazion${checkouts.length === 1 ? 'e' : 'i'}</small></span>
            <b>Apri analitico</b>
          </summary>
          <div class="recovery-checkout-list">
            ${checkouts.length ? checkouts.slice(0, 12).map(item => renderCheckoutRow(item, writable)).join('') : '<div class="wellbeing-empty">Nessun checkout registrato.</div>'}
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderCombinedRecovery() {
  const content = document.querySelector('#nutrition-section-content');
  if (!content) return;

  const writable = canWriteModule('nutrition');
  const logs = mergedLogs();
  const { checkinDefaults } = normalizeNutritionState();
  const checkouts = sortedCheckouts();
  const today = todayKey();
  const todayLog = mergedLogForDate(today);
  const todayCheckout = checkoutForDate(today);

  const initialCheckin = todayLog ? {
    sleepHours: todayLog.sleepHours || checkinDefaults.sleepHours,
    sleepQuality: todayLog.sleepQuality || checkinDefaults.sleepQuality,
    fatigue: todayLog.fatigue || checkinDefaults.fatigue,
    soreness: todayLog.soreness || checkinDefaults.soreness,
    mood: todayLog.mood || checkinDefaults.mood,
    motivation: todayLog.motivation || checkinDefaults.motivation,
    concentration: todayLog.concentration || checkinDefaults.concentration,
    notes: todayLog.notes || '',
  } : { ...checkinDefaults, notes: '' };

  const localSorenessLog = currentHealthSorenessLog(today);
  resetSorenessPicker(
    today,
    localSorenessLog?.scope || todayLog?.sorenessScope || 'general',
    localSorenessLog?.locations || [],
  );

  content.innerHTML = `
    <section class="nutrition-subhead recovery-combined-head">
      <div>
        <div class="eyebrow">Daily wellbeing</div>
        <h2>Check-in e Training checkout</h2>
        <p>Il check-in descrive come l'atleta arriva alla giornata; il checkout registra come è andato l'allenamento svolto.</p>
      </div>
      <div class="recovery-quick-nav">
        <button class="button button-ghost" type="button" data-scroll-recovery="daily-checkin">Check-in</button>
        <button class="button button-ghost" type="button" data-scroll-recovery="training-checkout">Training checkout</button>
      </div>
    </section>

    <div class="recovery-scale-guide" role="note">
      <strong>Legenda rapida</strong>
      <span><b>Sonno, umore, voglia, concentrazione:</b> alto = positivo</span>
      <span><b>Stanchezza e indolenzimento:</b> alto = peggiore</span>
    </div>

    <div class="recovery-default-bar">
      <div>
        <strong>Valori abituali del check-in</strong>
        <span>${escapeHtml(defaultsSummary(checkinDefaults))}</span>
      </div>
      ${writable ? '<button class="button button-ghost" id="edit-recovery-defaults" type="button">Modifica default</button>' : ''}
    </div>

    <section class="wellbeing-grid recovery-combined-grid" id="daily-checkin">
      <article class="panel wellbeing-entry-panel">
        <div class="panel-header recovery-panel-title">
          <div>
            <h3>Check-in giornaliero</h3>
            <p>Già precompilato con i valori abituali: se oggi è tutto normale basta salvare.</p>
          </div>
          ${todayLog ? '<span class="recovery-status-badge done">✓ Oggi completato</span>' : '<span class="recovery-status-badge">Da fare oggi</span>'}
        </div>
        <div class="panel-body">
          ${!writable
            ? '<div class="access-info">Nutrition & Recovery è in sola lettura per questo account.</div>'
            : `
              <form id="combined-recovery-form" class="form-grid">
                <div class="field"><label>Data</label><input type="date" name="date" value="${today}" required /></div>
                <div class="field"><label>Ore di sonno</label><input type="number" name="sleepHours" min="0" max="24" step="0.25" value="${escapeAttr(initialCheckin.sleepHours)}" required /></div>
                <div class="field"><label>Qualità del sonno · 1–5</label><select name="sleepQuality">${scoreOptions('sleepQuality', initialCheckin.sleepQuality)}</select></div>
                <div class="field"><label>Voglia di allenarsi · 1–5</label><select name="motivation">${scoreOptions('motivation', initialCheckin.motivation)}</select></div>
                <div class="field"><label>Stanchezza · 1–5</label><select name="fatigue">${scoreOptions('fatigue', initialCheckin.fatigue)}</select></div>
                <div class="field"><label>Indolenzimento · 1–5</label><select name="soreness">${scoreOptions('soreness', initialCheckin.soreness)}</select></div>
                <div class="field full recovery-soreness-location-host" id="recovery-soreness-location-host">${renderSorenessPickerMarkup(initialCheckin.soreness)}</div>
                <div class="field"><label>Umore · 1–5</label><select name="mood">${scoreOptions('mood', initialCheckin.mood)}</select></div>
                <div class="field"><label>Concentrazione · 1–5</label><select name="concentration">${scoreOptions('concentration', initialCheckin.concentration)}</select></div>
                <div class="field full"><label>Note</label><textarea name="notes" placeholder="Sonno interrotto, viaggio, sensazioni, recupero, carico…">${escapeHtml(initialCheckin.notes)}</textarea></div>
                <div class="field full"><button class="button button-primary recovery-one-click" type="submit">${todayLog ? 'Aggiorna check-in' : 'Salva check-in'}</button></div>
              </form>
            `}
        </div>
      </article>

      ${renderCheckinAnalytics(logs, writable)}
    </section>

    <section class="wellbeing-grid recovery-checkout-grid" id="training-checkout">
      <article class="panel wellbeing-entry-panel">
        <div class="panel-header recovery-panel-title">
          <div>
            <h3>Training checkout</h3>
            <p>Una domanda sulla qualità dell'allenamento della giornata, più eventuali annotazioni.</p>
          </div>
          ${todayCheckout ? '<span class="recovery-status-badge done">✓ Oggi completato</span>' : '<span class="recovery-status-badge">Da fare dopo l’allenamento</span>'}
        </div>
        <div class="panel-body">
          ${!writable
            ? '<div class="access-info">Nutrition & Recovery è in sola lettura per questo account.</div>'
            : `
              <form id="training-checkout-form" class="form-grid">
                <div class="field"><label>Data</label><input type="date" name="date" value="${today}" required /></div>
                <div class="field full recovery-quality-field">
                  <label>Qualità dell'allenamento</label>
                  <div class="recovery-quality-picker" data-quality-picker>
                    <input type="hidden" name="quality" value="${escapeAttr(todayCheckout?.quality || 3)}" />
                    <div class="recovery-quality-buttons">${qualityPickerButtons(todayCheckout?.quality || 3)}</div>
                    <div class="recovery-quality-caption"><span data-checkout-quality-label>${escapeHtml(`${todayCheckout?.quality || 3}/5 · ${checkoutQualityLabel(todayCheckout?.quality || 3)}`)}</span></div>
                  </div>
                </div>
                <div class="field full recovery-no-training"><label><input type="checkbox" name="noTraining" ${todayCheckout?.trained === false ? 'checked' : ''} /> Nessun allenamento nella giornata</label></div>
                <div class="field full"><label>Note</label><textarea name="notes" placeholder="Cosa è andato bene, cosa no, sensazioni particolari…">${escapeHtml(todayCheckout?.notes || '')}</textarea></div>
                <div class="field full"><button class="button button-primary recovery-one-click" type="submit">${todayCheckout ? 'Aggiorna checkout' : 'Salva checkout'}</button></div>
              </form>
            `}
        </div>
      </article>

      ${renderCheckoutAnalytics(checkouts, writable)}
    </section>

    ${renderDefaultsDialog(checkinDefaults)}
  `;

  content.querySelectorAll('[data-scroll-recovery]').forEach(button => {
    button.addEventListener('click', () => {
      content.querySelector(`#${button.dataset.scrollRecovery}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  content.querySelectorAll('[data-recovery-range]').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.recoveryRange;
      const value = button.dataset.rangeValue === 'all' ? 'all' : Number(button.dataset.rangeValue);
      if (target === 'checkin') checkinRange = value;
      if (target === 'checkout') checkoutRange = value;
      renderCombinedRecovery();
    });
  });

  const defaultsDialog = content.querySelector('#recovery-defaults-dialog');
  content.querySelector('#edit-recovery-defaults')?.addEventListener('click', () => defaultsDialog?.showModal());
  defaultsDialog?.querySelectorAll('[data-close-defaults]').forEach(button => button.addEventListener('click', () => defaultsDialog.close()));
  defaultsDialog?.querySelector('#recovery-defaults-form')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.update(state => {
      ensureState(state);
      state.nutrition.checkinDefaults = normalizeDefaults({
        sleepHours: Number(data.sleepHours),
        sleepQuality: Number(data.sleepQuality),
        fatigue: Number(data.fatigue),
        soreness: Number(data.soreness),
        mood: Number(data.mood),
        motivation: Number(data.motivation),
        concentration: Number(data.concentration),
      });
    });
    defaultsDialog.close();
    renderCombinedRecovery();
  });

  const checkinForm = content.querySelector('#combined-recovery-form');
  const sorenessHost = content.querySelector('#recovery-soreness-location-host');
  paintSorenessPicker(sorenessHost);
  if (checkinForm) void hydrateHealthSoreness(checkinForm.elements.date.value, sorenessHost);

  checkinForm?.elements.soreness.addEventListener('change', () => {
    if (Number(checkinForm.elements.soreness.value || 1) <= 1) {
      sorenessPickerState.scope = 'general';
      sorenessPickerState.locations = [];
    }
    paintSorenessPicker(sorenessHost);
  });

  checkinForm?.elements.date.addEventListener('change', event => {
    fillCheckinFormForDate(checkinForm, event.target.value);
    const localLog = currentHealthSorenessLog(event.target.value);
    resetSorenessPicker(
      event.target.value,
      localLog?.scope || currentRecoveryScope(event.target.value),
      localLog?.locations || [],
    );
    paintSorenessPicker(sorenessHost);
    void hydrateHealthSoreness(event.target.value, sorenessHost);
  });

  checkinForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const soreness = Number(data.soreness || 0);
    const sorenessScope = soreness > 1 && sorenessPickerState.scope === 'localized' ? 'localized' : 'general';
    const sorenessLocations = sorenessScope === 'localized' ? [...sorenessPickerState.locations] : [];

    if (sorenessScope === 'localized' && !sorenessLocations.length) {
      await showInAppAlert('Hai indicato un indolenzimento localizzato. Seleziona almeno un distretto sulla Body map oppure scegli “Generale”.', {
        title: 'Dove senti indolenzimento?',
      });
      return;
    }

    const row = {
      id: uid('recovery'),
      date: data.date,
      sleepHours: Number(data.sleepHours || 0),
      sleepQuality: Number(data.sleepQuality || 0),
      fatigue: Number(data.fatigue || 0),
      soreness,
      sorenessScope,
      mood: Number(data.mood || 0),
      motivation: Number(data.motivation || 0),
      concentration: Number(data.concentration || 0),
      notes: String(data.notes || '').trim(),
      updatedAt: new Date().toISOString(),
    };

    store.update(state => {
      ensureState(state);
      state.nutrition.sleepLogs = state.nutrition.sleepLogs.filter(item => item.date !== row.date);
      state.nutrition.recoveryLogs = state.nutrition.recoveryLogs.filter(item => item.date !== row.date);
      state.nutrition.recoveryLogs.push(row);
    });

    try {
      await saveHealthSoreness({
        date: row.date,
        severity: soreness,
        scope: sorenessScope,
        locations: sorenessLocations,
      });
    } catch (error) {
      console.error('Salvataggio localizzazione indolenzimento fallito.', error);
      await showInAppAlert('Il check-in è stato salvato, ma la localizzazione dell’indolenzimento non è stata sincronizzata con Body & Health. Riprova aprendo il check-in.', {
        title: 'Body & Health non aggiornato',
      });
    }

    renderCombinedRecovery();
  });

  const checkoutForm = content.querySelector('#training-checkout-form');
  if (checkoutForm) {
    syncCheckoutDisabled(checkoutForm);
    updateQualityPicker(checkoutForm, Number(checkoutForm.elements.quality.value || 3));
    checkoutForm.querySelectorAll('[data-checkout-quality]').forEach(button => {
      button.addEventListener('click', () => {
        if (checkoutForm.elements.noTraining.checked) return;
        updateQualityPicker(checkoutForm, Number(button.dataset.checkoutQuality));
      });
    });
  }
  checkoutForm?.elements.noTraining.addEventListener('change', () => syncCheckoutDisabled(checkoutForm));
  checkoutForm?.elements.date.addEventListener('change', event => fillCheckoutFormForDate(checkoutForm, event.target.value));
  checkoutForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const noTraining = event.currentTarget.elements.noTraining.checked;
    const row = {
      id: uid('checkout'),
      date: data.date,
      trained: !noTraining,
      quality: noTraining ? 0 : Number(data.quality || 3),
      notes: String(data.notes || '').trim(),
      updatedAt: new Date().toISOString(),
    };

    store.update(state => {
      ensureState(state);
      state.nutrition.trainingCheckouts = state.nutrition.trainingCheckouts.filter(item => item.date !== row.date);
      state.nutrition.trainingCheckouts.push(row);
    });
    renderCombinedRecovery();
  });

  content.querySelectorAll('[data-delete-combined-recovery]').forEach(button => {
    button.addEventListener('click', async () => {
      const date = button.dataset.deleteCombinedRecovery;
      const ok = await showInAppConfirm(`Eliminare il check-in del ${formatDate(date)}?`, {
        title: 'Elimina check-in',
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (!ok) return;
      store.update(state => {
        ensureState(state);
        state.nutrition.sleepLogs = state.nutrition.sleepLogs.filter(item => item.date !== date);
        state.nutrition.recoveryLogs = state.nutrition.recoveryLogs.filter(item => item.date !== date);
      });
      try {
        await saveHealthSoreness({ date, severity: 1, scope: 'general', locations: [] });
      } catch (error) {
        console.warn('Rimozione localizzazione indolenzimento da Body & Health non riuscita.', error);
      }
      renderCombinedRecovery();
    });
  });

  content.querySelectorAll('[data-delete-training-checkout]').forEach(button => {
    button.addEventListener('click', async () => {
      const date = button.dataset.deleteTrainingCheckout;
      const ok = await showInAppConfirm(`Eliminare il checkout del ${formatDate(date)}?`, {
        title: 'Elimina checkout',
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (!ok) return;
      store.update(state => {
        ensureState(state);
        state.nutrition.trainingCheckouts = state.nutrition.trainingCheckouts.filter(item => item.date !== date);
      });
      renderCombinedRecovery();
    });
  });
}

function syncCheckoutDisabled(form) {
  if (!form) return;
  const disabled = form.elements.noTraining.checked;
  form.querySelectorAll('[data-checkout-quality]').forEach(button => {
    button.disabled = disabled;
    button.classList.toggle('disabled', disabled);
  });
  form.querySelector('[data-quality-picker]')?.classList.toggle('disabled', disabled);
}

function enhanceTabs() {
  if (!isNutritionRoute()) return;
  const switcher = document.querySelector('.nutrition-section-switch');
  if (!switcher) return;

  switcher.querySelector('[data-nutrition-section="sleep"]')?.remove();
  const recoveryButton = switcher.querySelector('[data-nutrition-section="recovery"]');
  if (recoveryButton) {
    recoveryButton.textContent = 'Recovery';
    if (recoveryButton.classList.contains('active')) renderCombinedRecovery();
  }
}

function queueEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  queueMicrotask(() => {
    enhancementQueued = false;
    enhanceTabs();
  });
}

function pendingRecoveryFocus() {
  try {
    return sessionStorage.getItem(RECOVERY_FOCUS_KEY) || '';
  } catch (_) {
    return '';
  }
}

function clearRecoveryFocus() {
  try {
    sessionStorage.removeItem(RECOVERY_FOCUS_KEY);
  } catch (_) {
    // Ignore storage failures.
  }
}

function queuePendingRecoveryFocus() {
  const targetId = pendingRecoveryFocus();
  if (!targetId || !isNutritionRoute()) return;

  if (focusTimer) clearTimeout(focusTimer);

  let attempts = 0;
  const focus = () => {
    focusTimer = null;
    if (!isNutritionRoute()) return;

    const recoveryButton = document.querySelector('[data-nutrition-section="recovery"]');
    if (recoveryButton && !recoveryButton.classList.contains('active')) {
      recoveryButton.click();
    }

    const target = document.getElementById(targetId);
    if (target) {
      clearRecoveryFocus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        const firstControl = target.querySelector('input:not([type="hidden"]), select, textarea, button');
        firstControl?.focus?.({ preventScroll: true });
      }, 350);
      return;
    }

    attempts += 1;
    if (attempts < 10) {
      focusTimer = window.setTimeout(focus, 60);
    }
  };

  focusTimer = window.setTimeout(focus, 0);
}

document.addEventListener('click', event => {
  if (!isNutritionRoute()) return;
  const sectionButton = event.target.closest?.('[data-nutrition-section]');
  if (!sectionButton) return;
  queueEnhancement();
});

window.addEventListener('hashchange', () => {
  if (isNutritionRoute()) {
    queueEnhancement();
    queuePendingRecoveryFocus();
  }
});

window.addEventListener('tpos:route-rendered', event => {
  if (event?.detail?.route !== 'nutrition') return;
  queueEnhancement();
  queuePendingRecoveryFocus();
});

queueEnhancement();
queuePendingRecoveryFocus();
