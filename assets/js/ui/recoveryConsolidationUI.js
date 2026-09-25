import '../bootstrap.js';

import { store } from '../data/store.js';
import { canWriteModule } from '../cloud/access.js';
import { showInAppConfirm } from './inAppMessages.js';

let enhancementQueued = false;

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

function scoreOptions(kind, selected) {
  const labels = {
    sleepQuality: [
      '1 — Pessima',
      '2 — Scarsa',
      '3 — Discreta',
      '4 — Buona',
      '5 — Ottima',
    ],
    readiness: [
      '1 — Molto bassa',
      '2 — Bassa',
      '3 — Media',
      '4 — Alta',
      '5 — Molto alta',
    ],
    fatigue: [
      '1 — Nessuna',
      '2 — Lieve',
      '3 — Moderata',
      '4 — Alta',
      '5 — Estrema',
    ],
    soreness: [
      '1 — Assente',
      '2 — Lieve',
      '3 — Moderato',
      '4 — Forte',
      '5 — Molto forte',
    ],
    mood: [
      '1 — Molto negativo',
      '2 — Negativo',
      '3 — Neutro',
      '4 — Positivo',
      '5 — Molto positivo',
    ],
  };

  return (labels[kind] || labels.readiness)
    .map((label, index) => {
      const value = index + 1;
      return `<option value="${value}" ${Number(selected) === value ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
}

function normalizeNutritionState() {
  const nutrition = store.getState().nutrition || {};

  return {
    sleepLogs: Array.isArray(nutrition.sleepLogs) ? nutrition.sleepLogs : [],
    recoveryLogs: Array.isArray(nutrition.recoveryLogs) ? nutrition.recoveryLogs : [],
  };
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

  const sleepQuality = Number(
    recovery?.sleepQuality
    ?? sleep?.quality
    ?? 0
  );

  return {
    date,
    sleepHours,
    sleepQuality,
    readiness: Number(recovery?.readiness || 0),
    fatigue: Number(recovery?.fatigue || 0),
    soreness: Number(recovery?.soreness || 0),
    mood: Number(recovery?.mood || 0),
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

function ensureArrays(state) {
  if (!state.nutrition || Array.isArray(state.nutrition)) {
    state.nutrition = {};
  }

  if (!Array.isArray(state.nutrition.sleepLogs)) {
    state.nutrition.sleepLogs = [];
  }

  if (!Array.isArray(state.nutrition.recoveryLogs)) {
    state.nutrition.recoveryLogs = [];
  }
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
          ${renderMetric('Prontezza', log.readiness)}
          ${renderMetric('Stanchezza', log.fatigue)}
          ${renderMetric('Indolenzimento', log.soreness)}
          ${renderMetric('Umore', log.mood)}
        </div>

        ${log.notes
          ? `<div class="recovery-history-notes">${escapeHtml(log.notes)}</div>`
          : ''}
      </div>

      ${writable
        ? `<button
             class="resource-delete"
             type="button"
             data-delete-combined-recovery="${escapeAttr(log.date)}"
           >Elimina</button>`
        : ''}
    </article>
  `;
}

function fillFormForDate(form, date) {
  const existing = mergedLogForDate(date);

  form.elements.sleepHours.value = existing?.sleepHours || '';
  form.elements.sleepQuality.value = existing?.sleepQuality || 4;
  form.elements.readiness.value = existing?.readiness || 4;
  form.elements.fatigue.value = existing?.fatigue || 2;
  form.elements.soreness.value = existing?.soreness || 2;
  form.elements.mood.value = existing?.mood || 4;
  form.elements.notes.value = existing?.notes || '';
}

function renderCombinedRecovery() {
  if (!isNutritionRoute()) return;

  const content = document.querySelector('#nutrition-section-content');
  if (!content) return;

  const writable = canWriteModule('nutrition');
  const logs = mergedLogs();
  const today = todayKey();
  const todayLog = mergedLogForDate(today);

  content.innerHTML = `
    <section class="nutrition-subhead recovery-combined-head">
      <div>
        <div class="eyebrow">Benessere quotidiano</div>
        <h2>Sonno e recupero</h2>
        <p>Un unico check-in giornaliero per ore e qualità del sonno, prontezza, stanchezza, indolenzimento e umore.</p>
      </div>
    </section>

    <div class="recovery-scale-guide" aria-label="Spiegazione scala da 1 a 5">
      <strong>Scala 1–5</strong>
      <span><b>Qualità del sonno:</b> 1 pessima · 5 ottima</span>
      <span><b>Prontezza:</b> 1 molto bassa · 5 molto alta</span>
      <span><b>Stanchezza:</b> 1 nessuna · 5 estrema</span>
      <span><b>Indolenzimento:</b> 1 assente · 5 molto forte</span>
      <span><b>Umore:</b> 1 molto negativo · 5 molto positivo</span>
    </div>

    <section class="wellbeing-grid recovery-combined-grid">
      <article class="panel wellbeing-entry-panel">
        <div class="panel-header">
          <h3>Check-in giornaliero</h3>
          <p>Una sola registrazione per giornata.</p>
        </div>

        <div class="panel-body">
          ${!writable
            ? `<div class="access-info">Nutrition & Recovery è in sola lettura per questo account.</div>`
            : `
              <form id="combined-recovery-form" class="form-grid">
                <div class="field">
                  <label>Data</label>
                  <input type="date" name="date" value="${today}" required />
                </div>

                <div class="field">
                  <label>Ore di sonno</label>
                  <input
                    type="number"
                    name="sleepHours"
                    min="0"
                    max="24"
                    step="0.25"
                    value="${escapeAttr(todayLog?.sleepHours || '')}"
                    placeholder="es. 8,5"
                    required
                  />
                </div>

                <div class="field">
                  <label>Qualità del sonno · 1–5</label>
                  <select name="sleepQuality">${scoreOptions('sleepQuality', todayLog?.sleepQuality || 4)}</select>
                </div>

                <div class="field">
                  <label>Prontezza all'allenamento · 1–5</label>
                  <select name="readiness">${scoreOptions('readiness', todayLog?.readiness || 4)}</select>
                </div>

                <div class="field">
                  <label>Stanchezza · 1–5</label>
                  <select name="fatigue">${scoreOptions('fatigue', todayLog?.fatigue || 2)}</select>
                </div>

                <div class="field">
                  <label>Indolenzimento · 1–5</label>
                  <select name="soreness">${scoreOptions('soreness', todayLog?.soreness || 2)}</select>
                </div>

                <div class="field">
                  <label>Umore · 1–5</label>
                  <select name="mood">${scoreOptions('mood', todayLog?.mood || 4)}</select>
                </div>

                <div class="field full">
                  <label>Note</label>
                  <textarea
                    name="notes"
                    placeholder="Sonno interrotto, viaggio, sensazioni, recupero, carico…"
                  >${escapeHtml(todayLog?.notes || '')}</textarea>
                </div>

                <div class="field full">
                  <button class="button button-primary" type="submit">
                    Salva check-in
                  </button>
                </div>
              </form>
            `}
        </div>
      </article>

      <article class="panel wellbeing-history-panel">
        <div class="panel-header">
          <h3>Storico recente</h3>
          <p>Sonno e recupero letti insieme, giorno per giorno.</p>
        </div>

        <div class="recovery-history-list">
          ${logs.length
            ? logs.slice(0, 21).map(log => renderHistoryRow(log, writable)).join('')
            : '<div class="wellbeing-empty">Nessun check-in registrato.</div>'}
        </div>
      </article>
    </section>
  `;

  const form = content.querySelector('#combined-recovery-form');

  form?.elements.date.addEventListener('change', event => {
    fillFormForDate(form, event.target.value);
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    const row = {
      id: uid('recovery'),
      date: data.date,
      sleepHours: Number(data.sleepHours || 0),
      sleepQuality: Number(data.sleepQuality || 0),
      readiness: Number(data.readiness || 0),
      fatigue: Number(data.fatigue || 0),
      soreness: Number(data.soreness || 0),
      mood: Number(data.mood || 0),
      notes: String(data.notes || '').trim(),
      updatedAt: new Date().toISOString(),
    };

    store.update(state => {
      ensureArrays(state);

      // Consolidation: the daily record now lives in recoveryLogs.
      // Any legacy sleep-only record for the same date is removed after
      // preserving its values in the combined form.
      state.nutrition.sleepLogs = state.nutrition.sleepLogs
        .filter(item => item.date !== row.date);

      state.nutrition.recoveryLogs = state.nutrition.recoveryLogs
        .filter(item => item.date !== row.date);

      state.nutrition.recoveryLogs.push(row);
    });

    renderCombinedRecovery();
  });

  content.querySelectorAll('[data-delete-combined-recovery]').forEach(button => {
    button.addEventListener('click', async () => {
      const date = button.dataset.deleteCombinedRecovery;

      const ok = await showInAppConfirm(
        `Eliminare il check-in del ${formatDate(date)}?`,
        {
          title: 'Elimina check-in',
          confirmLabel: 'Elimina',
          danger: true,
        },
      );

      if (!ok) return;

      store.update(state => {
        ensureArrays(state);

        state.nutrition.sleepLogs = state.nutrition.sleepLogs
          .filter(item => item.date !== date);

        state.nutrition.recoveryLogs = state.nutrition.recoveryLogs
          .filter(item => item.date !== date);
      });

      renderCombinedRecovery();
    });
  });
}

function enhanceTabs() {
  if (!isNutritionRoute()) return;

  const switcher = document.querySelector('.nutrition-section-switch');
  if (!switcher) return;

  const sleepButton = switcher.querySelector('[data-nutrition-section="sleep"]');
  sleepButton?.remove();

  const recoveryButton = switcher.querySelector('[data-nutrition-section="recovery"]');

  if (recoveryButton) {
    recoveryButton.textContent = 'Sonno & recupero';

    if (recoveryButton.classList.contains('active')) {
      renderCombinedRecovery();
    }
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

document.addEventListener('click', event => {
  if (!isNutritionRoute()) return;

  const sectionButton = event.target.closest?.('[data-nutrition-section]');
  if (!sectionButton) return;

  // nutrition.js renders synchronously in the button handler. Run our
  // consolidation immediately after that render has completed.
  queueEnhancement();
});

window.addEventListener('hashchange', () => {
  if (isNutritionRoute()) queueEnhancement();
});

queueEnhancement();
