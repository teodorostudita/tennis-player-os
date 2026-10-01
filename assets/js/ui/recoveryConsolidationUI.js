import '../bootstrap.js';

import { store } from '../data/store.js';
import { canWriteModule } from '../cloud/access.js';
import { showInAppConfirm } from './inAppMessages.js';

const SYSTEM_DEFAULTS = Object.freeze({
  sleepHours: 8,
  sleepQuality: 4,
  fatigue: 1,
  soreness: 1,
  mood: 4,
  motivation: 3,
  concentration: 4,
});

let enhancementQueued = false;
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

function checkoutQualityOptions(selected = 3) {
  const labels = [
    '1 — Molto scarso',
    '2 — Sotto tono',
    '3 — Normale',
    '4 — Buono',
    '5 — Eccellente',
  ];

  return labels.map((label, index) => {
    const value = index + 1;
    return `<option value="${value}" ${Number(selected) === value ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function checkoutQualityLabel(value) {
  return {
    1: 'Molto scarso',
    2: 'Sotto tono',
    3: 'Normale',
    4: 'Buono',
    5: 'Eccellente',
  }[Number(value)] || '—';
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
    <article class="recovery-history-row">
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
  return `
    <article class="recovery-checkout-row">
      <div>
        <strong>${escapeHtml(formatDate(item.date))}</strong>
        <span>${trained
          ? `Qualità ${escapeHtml(item.quality || '—')}/5 · ${escapeHtml(checkoutQualityLabel(item.quality))}`
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
  } : { ...defaults, notes: '' });
}

function fillCheckoutFormForDate(form, date) {
  const existing = checkoutForDate(date);
  const noTraining = existing ? existing.trained === false : false;
  form.elements.quality.value = existing?.quality || 3;
  form.elements.notes.value = existing?.notes || '';
  form.elements.noTraining.checked = noTraining;
  form.elements.quality.disabled = noTraining;
}

function defaultsSummary(defaults) {
  return `${formatHours(defaults.sleepHours)} · sonno ${defaults.sleepQuality}/5 · stanchezza ${defaults.fatigue}/5 · indolenzimento ${defaults.soreness}/5 · umore ${defaults.mood}/5 · voglia ${defaults.motivation}/5 · concentrazione ${defaults.concentration}/5`;
}

function renderDefaultsDialog(defaults) {
  return `
    <dialog class="planner-dialog recovery-defaults-dialog" id="recovery-defaults-dialog">
      <form method="dialog" id="recovery-defaults-form">
        <div class="dialog-head">
          <div>
            <div class="eyebrow">Check-in rapido</div>
            <h3>Valori abituali</h3>
            <p>Questi valori precompilano ogni nuovo check-in. L'atleta modifica soltanto ciò che oggi è diverso dal solito.</p>
          </div>
          <button class="dialog-close" type="button" data-close-defaults aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="field"><label>Ore di sonno</label><input type="number" name="sleepHours" min="0" max="24" step="0.25" value="${escapeAttr(defaults.sleepHours)}" required /></div>
            <div class="field"><label>Qualità del sonno · 1–5</label><select name="sleepQuality">${scoreOptions('sleepQuality', defaults.sleepQuality)}</select></div>
            <div class="field"><label>Stanchezza · 1–5</label><select name="fatigue">${scoreOptions('fatigue', defaults.fatigue)}</select></div>
            <div class="field"><label>Indolenzimento · 1–5</label><select name="soreness">${scoreOptions('soreness', defaults.soreness)}</select></div>
            <div class="field"><label>Umore · 1–5</label><select name="mood">${scoreOptions('mood', defaults.mood)}</select></div>
            <div class="field"><label>Voglia di allenarsi · 1–5</label><select name="motivation">${scoreOptions('motivation', defaults.motivation)}</select></div>
            <div class="field"><label>Concentrazione · 1–5</label><select name="concentration">${scoreOptions('concentration', defaults.concentration)}</select></div>
          </div>
        </div>
        <div class="dialog-actions">
          <div></div>
          <div class="dialog-save-actions">
            <button class="button button-ghost" type="button" data-close-defaults>Annulla</button>
            <button class="button button-primary" type="submit">Salva valori abituali</button>
          </div>
        </div>
      </form>
    </dialog>
  `;
}

function renderCombinedRecovery() {
  if (!isNutritionRoute()) return;
  const content = document.querySelector('#nutrition-section-content');
  if (!content) return;

  const writable = canWriteModule('nutrition');
  const { checkinDefaults } = normalizeNutritionState();
  const logs = mergedLogs();
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

  content.innerHTML = `
    <section class="nutrition-subhead recovery-combined-head">
      <div>
        <div class="eyebrow">Daily Recovery</div>
        <h2>Check-in e Training checkout</h2>
        <p>Il check-in descrive come l'atleta arriva alla giornata; il checkout registra come è andato l'allenamento svolto.</p>
      </div>
      <div class="recovery-quick-nav">
        <button class="button button-ghost" type="button" data-scroll-recovery="daily-checkin">Check-in</button>
        <button class="button button-ghost" type="button" data-scroll-recovery="training-checkout">Training checkout</button>
      </div>
    </section>

    <div class="recovery-scale-guide" aria-label="Spiegazione scale da 1 a 5">
      <strong>Scala 1–5</strong>
      <span><b>Sonno, umore, voglia, concentrazione:</b> alto = positivo</span>
      <span><b>Stanchezza, indolenzimento:</b> basso = positivo</span>
      <span><b>Qualità allenamento:</b> 1 molto scarso · 3 normale · 5 eccellente</span>
    </div>

    <section class="recovery-default-bar">
      <div>
        <strong>Valori abituali del check-in</strong>
        <span>${escapeHtml(defaultsSummary(checkinDefaults))}</span>
      </div>
      ${writable ? '<button class="button button-ghost" id="edit-recovery-defaults" type="button">⚙ Valori abituali</button>' : ''}
    </section>

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
                <div class="field"><label>Umore · 1–5</label><select name="mood">${scoreOptions('mood', initialCheckin.mood)}</select></div>
                <div class="field"><label>Concentrazione · 1–5</label><select name="concentration">${scoreOptions('concentration', initialCheckin.concentration)}</select></div>
                <div class="field full"><label>Note</label><textarea name="notes" placeholder="Sonno interrotto, viaggio, sensazioni, recupero, carico…">${escapeHtml(initialCheckin.notes)}</textarea></div>
                <div class="field full"><button class="button button-primary recovery-one-click" type="submit">${todayLog ? 'Aggiorna check-in' : 'Salva check-in'}</button></div>
              </form>
            `}
        </div>
      </article>

      <article class="panel wellbeing-history-panel">
        <div class="panel-header"><h3>Storico check-in</h3><p>Sonno e sensazioni, giorno per giorno.</p></div>
        <div class="recovery-history-list">
          ${logs.length ? logs.slice(0, 21).map(log => renderHistoryRow(log, writable)).join('') : '<div class="wellbeing-empty">Nessun check-in registrato.</div>'}
        </div>
      </article>
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
                <div class="field"><label>Qualità dell'allenamento · 1–5</label><select name="quality">${checkoutQualityOptions(todayCheckout?.quality || 3)}</select></div>
                <div class="field full recovery-no-training"><label><input type="checkbox" name="noTraining" ${todayCheckout?.trained === false ? 'checked' : ''} /> Nessun allenamento nella giornata</label></div>
                <div class="field full"><label>Note</label><textarea name="notes" placeholder="Cosa è andato bene, cosa no, sensazioni particolari…">${escapeHtml(todayCheckout?.notes || '')}</textarea></div>
                <div class="field full"><button class="button button-primary recovery-one-click" type="submit">${todayCheckout ? 'Aggiorna checkout' : 'Salva checkout'}</button></div>
              </form>
            `}
        </div>
      </article>

      <article class="panel wellbeing-history-panel">
        <div class="panel-header"><h3>Storico checkout</h3><p>Percezione sintetica della qualità del lavoro svolto.</p></div>
        <div class="recovery-checkout-list">
          ${checkouts.length ? checkouts.slice(0, 21).map(item => renderCheckoutRow(item, writable)).join('') : '<div class="wellbeing-empty">Nessun checkout registrato.</div>'}
        </div>
      </article>
    </section>

    ${renderDefaultsDialog(checkinDefaults)}
  `;

  content.querySelectorAll('[data-scroll-recovery]').forEach(button => {
    button.addEventListener('click', () => {
      content.querySelector(`#${button.dataset.scrollRecovery}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  checkinForm?.elements.date.addEventListener('change', event => fillCheckinFormForDate(checkinForm, event.target.value));
  checkinForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const row = {
      id: uid('recovery'),
      date: data.date,
      sleepHours: Number(data.sleepHours || 0),
      sleepQuality: Number(data.sleepQuality || 0),
      fatigue: Number(data.fatigue || 0),
      soreness: Number(data.soreness || 0),
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
    renderCombinedRecovery();
  });

  const checkoutForm = content.querySelector('#training-checkout-form');
  const syncCheckoutDisabled = () => {
    if (!checkoutForm) return;
    checkoutForm.elements.quality.disabled = checkoutForm.elements.noTraining.checked;
  };
  syncCheckoutDisabled();
  checkoutForm?.elements.noTraining.addEventListener('change', syncCheckoutDisabled);
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
