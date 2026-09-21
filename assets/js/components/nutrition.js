import { showInAppConfirm } from '../ui/inAppMessages.js';

const MEAL_TYPES = {
  breakfast: 'Colazione',
  snack: 'Spuntino',
  lunch: 'Pranzo',
  pre: 'Pre-allenamento',
  during: 'Durante allenamento',
  post: 'Post-allenamento',
  dinner: 'Cena',
  hydration: 'Idratazione',
  other: 'Altro',
};

const PERFORMANCE_TYPES = new Set(['pre', 'during', 'post']);
const RELEVANT_ACTIVITY_CATEGORIES = new Set(['tennis', 'physical', 'tournament']);

let nutritionSection = 'templates';
let weekAnchor = startOfWeek(new Date());

export function renderNutrition({ main, title, store }) {
  title.textContent = '8. Nutrition & Recovery';
  const state = store.getState();
  const nutrition = normalizeNutrition(state.nutrition);

  main.innerHTML = `
    <section class="nutrition-module-head">
      <div>
        <div class="eyebrow">Nutrition & Recovery</div>
        <h2>Alimentazione, sonno e recupero</h2>
        <p>Un unico spazio per pasti e idratazione, sonno e indicatori quotidiani di recupero. La programmazione oraria resta nel Calendar.</p>
      </div>
    </section>

    <div class="nutrition-section-switch" role="tablist" aria-label="Sezioni Nutrition">
      ${sectionButton('templates', 'Pasti salvati')}
      ${sectionButton('planner', 'Vista settimanale')}
      ${sectionButton('guidance', 'Indicazioni')}
      ${sectionButton('sleep', 'Sonno')}
      ${sectionButton('recovery', 'Recupero')}
    </div>

    <div id="nutrition-section-content"></div>
  `;

  main.querySelectorAll('[data-nutrition-section]').forEach(button => {
    button.addEventListener('click', () => {
      nutritionSection = button.dataset.nutritionSection;
      renderNutrition({ main, title, store });
    });
  });

  const content = main.querySelector('#nutrition-section-content');
  if (nutritionSection === 'planner') renderSharedFoodPlanner({ content, store, state, nutrition });
  else if (nutritionSection === 'guidance') renderGuidance({ content, main, title, store, nutrition });
  else if (nutritionSection === 'sleep') renderSleep({ content, main, title, store, nutrition });
  else if (nutritionSection === 'recovery') renderRecovery({ content, main, title, store, nutrition });
  else renderTemplates({ content, main, title, store, nutrition });
}

function normalizeNutrition(nutrition = {}) {
  return {
    templates: Array.isArray(nutrition.templates) ? nutrition.templates : [],
    guidance: {
      general: nutrition.guidance?.general || '',
      trainingDay: nutrition.guidance?.trainingDay || '',
      matchDay: nutrition.guidance?.matchDay || '',
      recoveryDay: nutrition.guidance?.recoveryDay || '',
      hydration: nutrition.guidance?.hydration || '',
    },
    sleepLogs: Array.isArray(nutrition.sleepLogs) ? nutrition.sleepLogs : [],
    recoveryLogs: Array.isArray(nutrition.recoveryLogs) ? nutrition.recoveryLogs : [],
  };
}

function sectionButton(id, label) {
  return `<button class="nutrition-section-button ${nutritionSection === id ? 'active' : ''}" data-nutrition-section="${id}" type="button">${label}</button>`;
}

function renderSharedFoodPlanner({ content, state, nutrition }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i));
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[6]);
  const planner = state.planner || {};
  const foodEvents = (Array.isArray(planner.events) ? planner.events : [])
    .filter(event => event.category === 'nutrition' && event.date >= startKey && event.date <= endKey)
    .sort(comparePlannerEvents);
  const daysCovered = new Set(foodEvents.map(event => event.date)).size;
  const performanceEntries = foodEvents.filter(event => PERFORMANCE_TYPES.has(event.mealType)).length;

  content.innerHTML = `
    <section class="nutrition-planner-head planner-head">
      <div>
        <div class="eyebrow">Calendar view</div>
        <h2>${escapeHtml(formatWeekRange(days[0], days[6]))}</h2>
        <p>Questa è una vista filtrata del Calendar: non crea un secondo calendario alimentare.</p>
      </div>
      <div class="planner-head-actions nutrition-no-print">
        <button class="button button-ghost" id="nutrition-print" type="button">Stampa</button>
        <button class="button button-primary" id="nutrition-open-calendar" type="button">Apri Calendar →</button>
      </div>
    </section>

    <section class="planner-kpis nutrition-kpis nutrition-no-print" aria-label="Riepilogo alimentazione">
      <div class="planner-kpi"><span>Voci pianificate</span><strong>${foodEvents.length}</strong></div>
      <div class="planner-kpi"><span>Giorni coperti</span><strong>${daysCovered}/7</strong></div>
      <div class="planner-kpi"><span>Pre / during / post</span><strong>${performanceEntries}</strong></div>
      <div class="planner-kpi"><span>Pasti salvati</span><strong>${nutrition.templates.length}</strong></div>
    </section>

    <section class="planner-toolbar panel nutrition-toolbar nutrition-no-print">
      <div class="planner-navigation">
        <button class="icon-button" id="nutrition-prev-week" type="button" aria-label="Settimana precedente">←</button>
        <button class="button button-ghost" id="nutrition-current-week" type="button">Questa settimana</button>
        <button class="icon-button" id="nutrition-next-week" type="button" aria-label="Settimana successiva">→</button>
      </div>
      <div class="nutrition-context-legend" aria-label="Legenda">
        <span><i class="nutrition-legend-dot meal"></i>Alimentazione</span>
        <span><i class="nutrition-legend-dot activity"></i>Allenamenti / tornei</span>
      </div>
    </section>

    <section class="nutrition-week" aria-label="Vista alimentare settimanale">
      ${days.map(day => renderNutritionDay(day, foodEvents, planner)).join('')}
    </section>
  `;

  content.querySelector('#nutrition-prev-week').addEventListener('click', () => {
    weekAnchor = addDays(weekAnchor, -7);
    renderSharedFoodPlanner({ content, state, nutrition });
  });
  content.querySelector('#nutrition-next-week').addEventListener('click', () => {
    weekAnchor = addDays(weekAnchor, 7);
    renderSharedFoodPlanner({ content, state, nutrition });
  });
  content.querySelector('#nutrition-current-week').addEventListener('click', () => {
    weekAnchor = startOfWeek(new Date());
    renderSharedFoodPlanner({ content, state, nutrition });
  });
  content.querySelector('#nutrition-print').addEventListener('click', () => window.print());
  content.querySelector('#nutrition-open-calendar').addEventListener('click', () => {
    location.hash = '#/calendar';
  });
}

function renderNutritionDay(day, foodEvents, planner) {
  const key = dateKey(day);
  const dayEntries = foodEvents.filter(event => event.date === key);
  const activities = getDayActivities(key, planner);
  const isToday = key === dateKey(new Date());

  return `
    <article class="nutrition-day ${isToday ? 'today' : ''}">
      <header class="nutrition-day-header">
        <span>${escapeHtml(new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(day))}</span>
        <strong>${day.getDate()}</strong>
      </header>
      <div class="nutrition-day-body">
        ${activities.length ? `<div class="nutrition-activity-stack">${activities.map(renderActivityAnchor).join('')}</div>` : ''}
        <div class="nutrition-meal-stack">
          ${dayEntries.length ? dayEntries.map(renderMealEventCard).join('') : '<div class="nutrition-empty">Nessuna voce alimentare</div>'}
        </div>
      </div>
    </article>
  `;
}

function getDayActivities(key, planner = {}) {
  const events = Array.isArray(planner.events) ? planner.events : [];
  const tournaments = Array.isArray(planner.tournaments) ? planner.tournaments : [];
  const dayEvents = events
    .filter(event => event.date === key && RELEVANT_ACTIVITY_CATEGORIES.has(event.category))
    .map(event => ({ time: event.startTime || '', title: event.title || 'Attività', kind: event.category }))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const dayTournaments = tournaments
    .filter(tournament => dateWithinRange(key, tournament.startDate, tournament.endDate || tournament.startDate))
    .map(tournament => ({ time: '', title: tournament.name || 'Torneo', kind: 'tournament' }));
  return [...dayTournaments, ...dayEvents];
}

function renderActivityAnchor(activity) {
  return `
    <div class="nutrition-activity-anchor">
      <span>${activity.kind === 'tournament' ? '🏆' : '↳'}</span>
      <div>
        ${activity.time ? `<b>${escapeHtml(activity.time)}</b>` : ''}
        <strong>${escapeHtml(activity.title)}</strong>
      </div>
    </div>
  `;
}

function renderMealEventCard(event) {
  const label = MEAL_TYPES[event.mealType] || MEAL_TYPES.other;
  return `
    <article class="nutrition-meal-card type-${escapeAttr(event.mealType || 'other')}">
      <span class="nutrition-meal-meta"><b>${escapeHtml(event.startTime || '—')}</b><em>${escapeHtml(label)}</em></span>
      <strong>${escapeHtml(event.title || label)}</strong>
      ${event.mealDetails ? `<span class="nutrition-meal-details">${escapeHtml(event.mealDetails)}</span>` : ''}
      ${event.notes ? `<span class="nutrition-meal-note">${escapeHtml(event.notes)}</span>` : ''}
    </article>
  `;
}

function renderTemplates({ content, main, title, store, nutrition }) {
  content.innerHTML = `
    <section class="nutrition-subhead">
      <div>
        <div class="eyebrow">Meal library</div>
        <h2>Pasti salvati</h2>
        <p>Definisci qui pasti, snack e strategie alimentari ricorrenti. Nel Calendar, scegliendo “Alimentazione”, potrai richiamarli direttamente.</p>
      </div>
      <button class="button button-primary" id="nutrition-new-template" type="button">+ Nuovo pasto salvato</button>
    </section>

    <section class="nutrition-template-grid">
      ${nutrition.templates.length ? nutrition.templates.map(renderTemplateCard).join('') : `
        <div class="panel nutrition-empty-panel">
          <strong>Nessun pasto salvato</strong>
          <p>Crea le combinazioni che usi più spesso: colazione, snack, pranzo, pre-allenamento, post-allenamento e così via.</p>
        </div>
      `}
    </section>

    ${renderTemplateDialog()}
  `;

  content.querySelector('#nutrition-new-template').addEventListener('click', () => openTemplateDialog({ content, main, title, store }));
  content.querySelectorAll('[data-template-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const template = nutrition.templates.find(item => item.id === button.dataset.templateEdit);
      if (template) openTemplateDialog({ content, main, title, store, template });
    });
  });
  content.querySelectorAll('[data-template-plan]').forEach(button => {
    button.addEventListener('click', () => {
      location.hash = '#/calendar';
    });
  });
}

function renderTemplateCard(template) {
  return `
    <article class="panel nutrition-template-card">
      <div class="nutrition-template-card-head">
        <span class="nutrition-type-badge type-${escapeAttr(template.type || 'other')}">${escapeHtml(MEAL_TYPES[template.type] || MEAL_TYPES.other)}</span>
        <button class="nutrition-mini-action" type="button" data-template-edit="${escapeAttr(template.id)}">Modifica</button>
      </div>
      <h3>${escapeHtml(template.title)}</h3>
      ${template.details ? `<p>${escapeHtml(template.details)}</p>` : '<p class="muted-copy">Nessun dettaglio.</p>'}
      ${template.notes ? `<div class="nutrition-template-note">${escapeHtml(template.notes)}</div>` : ''}
      <button class="button button-ghost" type="button" data-template-plan="${escapeAttr(template.id)}">Usa nel Calendar →</button>
    </article>
  `;
}

function renderTemplateDialog() {
  return `
    <dialog class="planner-dialog nutrition-dialog" id="nutrition-template-dialog">
      <form method="dialog" id="nutrition-template-form">
        <div class="dialog-header">
          <div><div class="eyebrow">Pasti salvati</div><h3 id="nutrition-template-title">Nuovo pasto salvato</h3></div>
          <button class="icon-button" type="button" data-template-close aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <input type="hidden" name="id" />
          <div class="field"><label>Tipo</label><select name="type">${mealTypeOptions('')}</select></div>
          <div class="field"><label>Nome</label><input name="title" required placeholder="es. Snack pre-tennis" /></div>
          <div class="field full"><label>Composizione / dettagli</label><textarea name="details"></textarea></div>
          <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
        </div>
        <div class="dialog-footer">
          <button class="button button-ghost danger-button" id="nutrition-delete-template" type="button" hidden>Elimina</button>
          <span class="dialog-spacer"></span>
          <button class="button button-ghost" type="button" data-template-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </form>
    </dialog>
  `;
}

function openTemplateDialog({ content, main, title, store, template = null }) {
  const dialog = content.querySelector('#nutrition-template-dialog');
  const form = content.querySelector('#nutrition-template-form');
  const deleteButton = content.querySelector('#nutrition-delete-template');
  if (!dialog || !form) return;
  form.reset();
  form.elements.id.value = template?.id || '';
  form.elements.type.value = template?.type || 'snack';
  form.elements.title.value = template?.title || '';
  form.elements.details.value = template?.details || '';
  form.elements.notes.value = template?.notes || '';
  content.querySelector('#nutrition-template-title').textContent = template ? 'Modifica pasto salvato' : 'Nuovo pasto salvato';
  deleteButton.hidden = !template;
  content.querySelectorAll('[data-template-close]').forEach(button => { button.onclick = () => dialog.close(); });

  form.onsubmit = event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    store.update(state => {
      ensureNutritionState(state);
      const nextTemplate = {
        id: template?.id || uid('food'),
        type: data.type || 'other',
        title: (data.title || '').trim(),
        details: (data.details || '').trim(),
        notes: (data.notes || '').trim(),
      };
      if (template) {
        const index = state.nutrition.templates.findIndex(item => item.id === template.id);
        if (index >= 0) state.nutrition.templates[index] = nextTemplate;
      } else state.nutrition.templates.push(nextTemplate);
    });
    dialog.close();
    renderNutrition({ main, title, store });
  };

  deleteButton.onclick = async () => {
    if (!template) return;
    const confirmed = await showInAppConfirm('Eliminare questo pasto salvato? Le attività già pianificate nel Calendar resteranno invariate.', { title: 'Elimina pasto salvato', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(state => {
      ensureNutritionState(state);
      state.nutrition.templates = state.nutrition.templates.filter(item => item.id !== template.id);
    });
    dialog.close();
    renderNutrition({ main, title, store });
  };
  dialog.showModal();
}

function renderGuidance({ content, main, title, store, nutrition }) {
  const guidance = nutrition.guidance;
  content.innerHTML = `
    <section class="nutrition-subhead">
      <div><div class="eyebrow">Reference notes</div><h2>Indicazioni</h2><p>Uno spazio per conservare le indicazioni concordate con il nutrizionista o con lo staff.</p></div>
    </section>
    <section class="panel nutrition-guidance-panel">
      <div class="panel-body">
        <form id="nutrition-guidance-form" class="form-grid">
          <div class="field full"><label>Indicazioni generali</label><textarea name="general">${escapeHtml(guidance.general)}</textarea></div>
          <div class="field"><label>Giorni di allenamento</label><textarea name="trainingDay">${escapeHtml(guidance.trainingDay)}</textarea></div>
          <div class="field"><label>Giorni di match / torneo</label><textarea name="matchDay">${escapeHtml(guidance.matchDay)}</textarea></div>
          <div class="field"><label>Giorni di recupero</label><textarea name="recoveryDay">${escapeHtml(guidance.recoveryDay)}</textarea></div>
          <div class="field"><label>Idratazione</label><textarea name="hydration">${escapeHtml(guidance.hydration)}</textarea></div>
          <div class="field full nutrition-guidance-actions"><button class="button button-primary" type="submit">Salva indicazioni</button></div>
        </form>
      </div>
    </section>
  `;

  content.querySelector('#nutrition-guidance-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.update(state => {
      ensureNutritionState(state);
      state.nutrition.guidance = {
        general: (data.general || '').trim(),
        trainingDay: (data.trainingDay || '').trim(),
        matchDay: (data.matchDay || '').trim(),
        recoveryDay: (data.recoveryDay || '').trim(),
        hydration: (data.hydration || '').trim(),
      };
    });
    renderNutrition({ main, title, store });
  });
}


function renderSleep({ content, main, title, store, nutrition }) {
  const logs = [...nutrition.sleepLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  content.innerHTML = `
    <section class="nutrition-subhead">
      <div><div class="eyebrow">Sleep log</div><h2>Sonno</h2><p>Registra orari, durata e qualità percepita. È un diario semplice, non un dispositivo di misurazione clinica.</p></div>
    </section>
    <section class="wellbeing-grid">
      <article class="panel wellbeing-entry-panel">
        <div class="panel-header"><h3>Nuova registrazione</h3><p>Una voce per notte.</p></div>
        <div class="panel-body">
          <form id="sleep-log-form" class="form-grid">
            <div class="field"><label>Data del risveglio</label><input type="date" name="date" value="${dateKey(new Date())}" required /></div>
            <div class="field"><label>Qualità percepita</label><select name="quality">${ratingOptions(4)}</select></div>
            <div class="field"><label>Ora di addormentamento</label><input type="time" name="bedtime" required /></div>
            <div class="field"><label>Ora di risveglio</label><input type="time" name="wakeTime" required /></div>
            <div class="field full"><label>Note</label><textarea name="notes" placeholder="Risvegli, viaggio, sensazioni…"></textarea></div>
            <div class="field full"><button class="button button-primary" type="submit">Salva sonno</button></div>
          </form>
        </div>
      </article>
      <article class="panel wellbeing-history-panel">
        <div class="panel-header"><h3>Storico recente</h3><p>Ultime registrazioni.</p></div>
        <div class="wellbeing-log-list">
          ${logs.length ? logs.slice(0, 14).map(log => `
            <div class="wellbeing-log-row">
              <div><strong>${escapeHtml(formatSimpleDate(log.date))}</strong><span>${escapeHtml(log.bedtime || '—')} → ${escapeHtml(log.wakeTime || '—')} · ${escapeHtml(formatSleepDuration(log.bedtime, log.wakeTime))}</span></div>
              <div class="wellbeing-score"><b>${escapeHtml(log.quality || '—')}/5</b><span>qualità</span></div>
              <button class="resource-delete" type="button" data-delete-sleep="${escapeAttr(log.id)}">Elimina</button>
            </div>
          `).join('') : '<div class="wellbeing-empty">Nessun dato sul sonno.</div>'}
        </div>
      </article>
    </section>
  `;

  content.querySelector('#sleep-log-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.update(state => {
      ensureNutritionState(state);
      state.nutrition.sleepLogs = state.nutrition.sleepLogs.filter(log => log.date !== data.date);
      state.nutrition.sleepLogs.push({ id: uid('sleep'), date: data.date, bedtime: data.bedtime, wakeTime: data.wakeTime, quality: Number(data.quality) || 0, notes: (data.notes || '').trim() });
    });
    renderNutrition({ main, title, store });
  });
  content.querySelectorAll('[data-delete-sleep]').forEach(button => button.addEventListener('click', async () => {
    const ok = await showInAppConfirm('Eliminare questa registrazione del sonno?', { title: 'Elimina registrazione', confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    store.update(state => { ensureNutritionState(state); state.nutrition.sleepLogs = state.nutrition.sleepLogs.filter(log => log.id !== button.dataset.deleteSleep); });
    renderNutrition({ main, title, store });
  }));
}

function renderRecovery({ content, main, title, store, nutrition }) {
  const logs = [...nutrition.recoveryLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  content.innerHTML = `
    <section class="nutrition-subhead">
      <div><div class="eyebrow">Recovery log</div><h2>Recupero</h2><p>Readiness e sensazioni quotidiane per dare contesto al carico di allenamento.</p></div>
    </section>
    <section class="wellbeing-grid">
      <article class="panel wellbeing-entry-panel">
        <div class="panel-header"><h3>Check-in</h3><p>Scala 1–5; per readiness un valore alto è positivo, per fatigue/soreness/stress è più impegnativo.</p></div>
        <div class="panel-body">
          <form id="recovery-log-form" class="form-grid">
            <div class="field"><label>Data</label><input type="date" name="date" value="${dateKey(new Date())}" required /></div>
            <div class="field"><label>Readiness</label><select name="readiness">${ratingOptions(4)}</select></div>
            <div class="field"><label>Fatigue</label><select name="fatigue">${ratingOptions(2)}</select></div>
            <div class="field"><label>Soreness</label><select name="soreness">${ratingOptions(2)}</select></div>
            <div class="field"><label>Stress</label><select name="stress">${ratingOptions(2)}</select></div>
            <div class="field full"><label>Note</label><textarea name="notes" placeholder="Sensazioni, recupero, viaggio, ciclo di carico…"></textarea></div>
            <div class="field full"><button class="button button-primary" type="submit">Salva check-in</button></div>
          </form>
        </div>
      </article>
      <article class="panel wellbeing-history-panel">
        <div class="panel-header"><h3>Storico recente</h3><p>Ultimi check-in.</p></div>
        <div class="wellbeing-log-list">
          ${logs.length ? logs.slice(0, 14).map(log => `
            <div class="wellbeing-log-row recovery-row">
              <div><strong>${escapeHtml(formatSimpleDate(log.date))}</strong><span>Fatigue ${escapeHtml(log.fatigue || '—')} · Soreness ${escapeHtml(log.soreness || '—')} · Stress ${escapeHtml(log.stress || '—')}</span></div>
              <div class="wellbeing-score"><b>${escapeHtml(log.readiness || '—')}/5</b><span>readiness</span></div>
              <button class="resource-delete" type="button" data-delete-recovery="${escapeAttr(log.id)}">Elimina</button>
            </div>
          `).join('') : '<div class="wellbeing-empty">Nessun check-in di recupero.</div>'}
        </div>
      </article>
    </section>
  `;

  content.querySelector('#recovery-log-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.update(state => {
      ensureNutritionState(state);
      state.nutrition.recoveryLogs = state.nutrition.recoveryLogs.filter(log => log.date !== data.date);
      state.nutrition.recoveryLogs.push({ id: uid('recovery'), date: data.date, readiness: Number(data.readiness) || 0, fatigue: Number(data.fatigue) || 0, soreness: Number(data.soreness) || 0, stress: Number(data.stress) || 0, notes: (data.notes || '').trim() });
    });
    renderNutrition({ main, title, store });
  });
  content.querySelectorAll('[data-delete-recovery]').forEach(button => button.addEventListener('click', async () => {
    const ok = await showInAppConfirm('Eliminare questo check-in di recupero?', { title: 'Elimina check-in', confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    store.update(state => { ensureNutritionState(state); state.nutrition.recoveryLogs = state.nutrition.recoveryLogs.filter(log => log.id !== button.dataset.deleteRecovery); });
    renderNutrition({ main, title, store });
  }));
}

function ratingOptions(selected = 3) {
  return [1,2,3,4,5].map(value => `<option value="${value}" ${Number(selected) === value ? 'selected' : ''}>${value}</option>`).join('');
}

function formatSleepDuration(bedtime, wakeTime) {
  const toMinutes = value => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  let start = toMinutes(bedtime), end = toMinutes(wakeTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  if (end <= start) end += 24 * 60;
  const duration = end - start;
  return `${Math.floor(duration / 60)}h ${String(duration % 60).padStart(2, '0')}m`;
}

function formatSimpleDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function mealTypeOptions(selected) {
  return Object.entries(MEAL_TYPES).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function ensureNutritionState(state) {
  if (!state.nutrition || Array.isArray(state.nutrition)) state.nutrition = freshNutritionState();
  if (!Array.isArray(state.nutrition.templates)) state.nutrition.templates = [];
  if (!state.nutrition.guidance || typeof state.nutrition.guidance !== 'object') state.nutrition.guidance = freshNutritionState().guidance;
  if (!state.nutrition.planner || typeof state.nutrition.planner !== 'object') state.nutrition.planner = { entries: [] };
  if (!Array.isArray(state.nutrition.planner.entries)) state.nutrition.planner.entries = [];
  if (!Array.isArray(state.nutrition.sleepLogs)) state.nutrition.sleepLogs = [];
  if (!Array.isArray(state.nutrition.recoveryLogs)) state.nutrition.recoveryLogs = [];
}

function freshNutritionState() {
  return {
    planner: { entries: [] },
    templates: [],
    guidance: { general: '', trainingDay: '', matchDay: '', recoveryDay: '', hydration: '' },
    sleepLogs: [],
    recoveryLogs: [],
  };
}

function comparePlannerEvents(a, b) {
  return `${a.date || ''} ${a.startTime || ''}`.localeCompare(`${b.date || ''} ${b.startTime || ''}`);
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateWithinRange(value, start, end) {
  if (!value || !start) return false;
  const finalEnd = end || start;
  return value >= start && value <= finalEnd;
}

function formatWeekRange(start, end) {
  const month = new Intl.DateTimeFormat('it-IT', { month: 'long' });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${month.format(end)} ${end.getFullYear()}`;
  }
  const short = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
  return `${short.format(start)} – ${short.format(end)} ${end.getFullYear()}`;
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

function escapeAttr(value = '') { return escapeHtml(value); }
