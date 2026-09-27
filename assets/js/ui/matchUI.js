import '../bootstrap.js';

import { modules } from '../data/schema.js';
import { store } from '../data/store.js';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  loadOpponentsIntoLocalStore,
  normalizeOpponentsPayload,
} from '../cloud/opponentsCloud.js';
import {
  loadMatchModule,
  normalizeMatchPayload,
  normalizeMatchRecord,
  startMatchSync,
} from '../cloud/matchCloud.js';
import {
  TENNISTALKER_COMPANION,
  companionSetupUrl,
} from '../companionConfig.js';
import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js';

const MAILBOX_ID = 'tpos-companion-mailbox';

const SECTIONS = [
  ['overview', 'Overview'],
  ['log', 'Match Log'],
  ['debrief', 'Debrief'],
  ['insights', 'Insights'],
];

const TECHNICAL_FIELDS = [
  ['serve', 'Servizio'],
  ['return', 'Risposta'],
  ['forehand', 'Dritto'],
  ['backhand', 'Rovescio'],
  ['rally', 'Gestione scambio'],
  ['tactical', 'Scelte tattiche'],
  ['pressure', 'Punti importanti'],
  ['depth', 'Profondità'],
  ['aggression', 'Aggressività / verticalizzazione'],
  ['defense', 'Difesa / contrattacco'],
];

const MENTAL_FIELDS = [
  ['focus', 'Focus'],
  ['confidence', 'Fiducia'],
  ['regulation', 'Regolazione emotiva'],
  ['bodyLanguage', 'Body language'],
  ['resilience', 'Resilienza'],
];

const PHYSICAL_FIELDS = [
  ['energy', 'Energia'],
  ['legs', 'Gambe'],
  ['recovery', 'Tenuta / recupero'],
  ['pain', 'Comfort fisico'],
];

const SURFACES = [
  '',
  'Terra',
  'Cemento',
  'Erba',
  'Sintetico',
  'Indoor hard',
  'Altro',
];

const MATCH_TYPES = {
  official: 'Ufficiale',
  friendly: 'Amichevole',
  training: 'Allenamento',
  team: 'Squadra',
};

let section = 'overview';
let selectedMatchId = '';
let filters = {
  result: '',
  surface: '',
  search: '',
};

let cloudState = {
  athleteId: '',
  loaded: false,
  stop: null,
  error: '',
};

let enhancementQueued = false;
let currentCompanionImportId = '';
const processedCompanionImports = new Set();

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function formatDate(value = '') {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return escapeHtml(value);

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function normalizeName(value = '') {
  return clean(value)
    .toLocaleLowerCase('it-IT')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokenKey(value = '') {
  return normalizeName(value)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join('|');
}

function athleteName() {
  const athlete = store.getState().athlete || {};
  return clean([athlete.firstName, athlete.lastName].filter(Boolean).join(' '));
}

function competitionState() {
  return normalizeMatchPayload(store.getState().competition);
}

function opponentsState() {
  return normalizeOpponentsPayload(store.getState().opponents);
}

function canWrite() {
  return canWriteModule('competition');
}

function applyModuleMetadata() {
  const match = modules.find(item => item.id === 'competition');
  if (!match) return;

  match.name = 'Match';
  match.subtitle = 'Results · Debrief · Performance';
  match.description = 'Registro match, import da TennisTalker, debrief post-partita e insight sulle prestazioni.';
}

function patchVisibleMetadata() {
  const match = modules.find(item => item.id === 'competition');
  if (!match) return;

  document.querySelectorAll('[data-route="competition"] .nav-label').forEach(node => {
    node.textContent = `${match.number}. ${match.name}`;
  });

  const dashboardButton = document.querySelector('.module-card [data-route="competition"]');
  const card = dashboardButton?.closest('.module-card');

  if (card) {
    const h4 = card.querySelector('h4');
    const subtitle = card.querySelector('.module-top p strong');
    const paragraphs = card.querySelectorAll(':scope > div > p');

    if (h4) h4.textContent = match.name;
    if (subtitle) subtitle.textContent = match.subtitle;
    if (paragraphs.length) {
      paragraphs[paragraphs.length - 1].textContent = match.description;
    }
  }
}

function setCloudStatus(status, message = '') {
  if (route() !== 'competition') return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Match → cloud…';
    indicator.title = 'Sincronizzazione Match in corso.';
  } else if (status === 'error') {
    indicator.textContent = 'Match · cache locale';
    indicator.title = message || 'Sincronizzazione cloud non disponibile.';
  } else if (status === 'readonly') {
    indicator.textContent = 'Match cloud · sola lettura';
    indicator.title = 'Questo account può leggere Match ma non modificarlo.';
  } else {
    indicator.textContent = 'Match cloud ✓';
    indicator.title = 'Match sincronizzato con Supabase.';
  }
}

async function waitForAccess() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const access = getCurrentAccess();
    if (access.athleteId) return access;
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }

  return getCurrentAccess();
}

async function ensureCloud() {
  const access = await waitForAccess();
  const athleteId = String(access.athleteId || '');

  if (!athleteId || !canReadModule('competition')) return;

  if (cloudState.loaded && cloudState.athleteId === athleteId) {
    setCloudStatus(canWrite() ? 'synced' : 'readonly');
    return;
  }

  cloudState.stop?.();
  cloudState.stop = null;
  cloudState.loaded = false;
  cloudState.athleteId = athleteId;

  const result = await loadMatchModule({
    store,
    athleteId,
  });

  cloudState.loaded = true;
  cloudState.error = result.cloudError?.message || '';

  if (canWrite()) {
    cloudState.stop = startMatchSync({
      store,
      athleteId,
      onStatus: ({ status, message }) => setCloudStatus(status, message),
    });

    setCloudStatus(result.cloudError ? 'error' : 'synced', cloudState.error);
  } else {
    setCloudStatus('readonly');
  }
}

function activeMatches(state = competitionState()) {
  return [...state.matches]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function isReviewed(match) {
  return Boolean(match?.review?.reviewedAt);
}

function resultLabel(match) {
  const result = String(match?.result || '').toUpperCase();
  if (result === 'W') return 'Vittoria';
  if (result === 'L') return 'Sconfitta';
  return '—';
}

function resultClass(match) {
  const result = String(match?.result || '').toUpperCase();
  if (result === 'W') return 'win';
  if (result === 'L') return 'loss';
  return 'neutral';
}

function surfaceLabel(match) {
  return clean(match?.surface) || 'Superficie n/d';
}

function matchTitle(match) {
  return clean(match?.opponentName) || 'Avversario da definire';
}

function opponentProfiles() {
  return [...opponentsState().profiles]
    .sort((a, b) => clean(a.name).localeCompare(clean(b.name), 'it', { sensitivity: 'base' }));
}

function findOpponentProfile(match) {
  const profiles = opponentProfiles();

  return profiles.find(profile =>
    (match.opponentProfileId && profile.id === match.opponentProfileId)
    || (
      match.opponentExternalId
      && profile.source?.externalId === match.opponentExternalId
    )
    || (
      normalizeName(match.opponentName)
      && normalizeName(profile.name) === normalizeName(match.opponentName)
    )
  ) || null;
}

function overallReviewScore(match) {
  const review = match?.review;
  if (!review) return null;

  const values = [
    ...TECHNICAL_FIELDS.map(([key]) => Number(review.technical?.[key])),
    ...MENTAL_FIELDS.map(([key]) => Number(review.mental?.[key])),
    ...PHYSICAL_FIELDS.map(([key]) => Number(review.physical?.[key])),
  ].filter(value => Number.isFinite(value) && value >= 1 && value <= 5);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function companionPresence() {
  const marker = document.getElementById('tpos-companion-presence');
  const version = marker?.dataset?.version || '';
  const major = Number(String(version).split('.')[0] || 0);

  return {
    installed: Boolean(marker?.dataset?.ready === 'true' || version),
    version,
    compatible: Boolean(version && major >= TENNISTALKER_COMPANION.expectedMajor),
  };
}

function sectionSwitch() {
  return `
    <div class="match-section-switch" role="tablist">
      ${SECTIONS.map(([id, label]) => `
        <button
          class="match-section-button ${section === id ? 'active' : ''}"
          type="button"
          data-match-section="${id}"
        >${escapeHtml(label)}</button>
      `).join('')}
    </div>
  `;
}

function renderRoot() {
  if (route() !== 'competition') return;

  const main = document.querySelector('#main-content');
  const title = document.querySelector('#page-title');

  if (!main || !title) return;

  const state = competitionState();
  title.textContent = '5. Match';

  main.innerHTML = `
    <section class="match-module-head">
      <div>
        <div class="eyebrow">Match</div>
        <h2>Partite, debrief e apprendimento</h2>
        <p>Il match non termina con il risultato: qui diventa storico, feedback e materiale operativo per la crescita dell’atleta.</p>
      </div>

      ${canWrite()
        ? '<button class="button button-primary" type="button" id="match-new">+ Nuovo match</button>'
        : ''}
    </section>

    ${!canWrite()
      ? '<div class="access-info match-readonly">Match è disponibile in sola lettura per questo account.</div>'
      : ''}

    ${sectionSwitch()}
    <div id="match-section-host"></div>
  `;

  main.querySelectorAll('[data-match-section]').forEach(button => {
    button.addEventListener('click', () => {
      section = button.dataset.matchSection;
      renderRoot();
    });
  });

  main.querySelector('#match-new')?.addEventListener('click', () => {
    openMatchDialog();
  });

  const host = main.querySelector('#match-section-host');

  if (section === 'log') renderLog(host, state);
  else if (section === 'debrief') renderDebrief(host, state);
  else if (section === 'insights') renderInsights(host, state);
  else renderOverview(host, state);

  setCloudStatus(canWrite() ? 'synced' : 'readonly');
}

function renderOverview(host, state) {
  const matches = activeMatches(state);
  const wins = matches.filter(match => match.result === 'W').length;
  const losses = matches.filter(match => match.result === 'L').length;
  const reviewed = matches.filter(isReviewed).length;
  const pending = matches.filter(match => !isReviewed(match)).slice(0, 4);
  const companion = companionPresence();

  host.innerHTML = `
    <section class="match-kpis">
      <article class="match-kpi">
        <span>Match</span>
        <strong>${matches.length}</strong>
        <small>totale registrati</small>
      </article>
      <article class="match-kpi match-kpi-win">
        <span>W / L</span>
        <strong>${wins} / ${losses}</strong>
        <small>${matches.length ? `${Math.round((wins / matches.length) * 100)}% vittorie` : 'nessun dato'}</small>
      </article>
      <article class="match-kpi">
        <span>Debrief</span>
        <strong>${reviewed}</strong>
        <small>${matches.length ? `${Math.round((reviewed / matches.length) * 100)}% completati` : 'nessun match'}</small>
      </article>
      <article class="match-kpi">
        <span>Da rivedere</span>
        <strong>${matches.length - reviewed}</strong>
        <small>debrief non completati</small>
      </article>
    </section>

    ${renderImportPanel(companion)}

    <section class="match-overview-grid">
      <article class="panel">
        <div class="panel-header match-panel-header">
          <div>
            <h3>Ultimi match</h3>
            <p>Registro più recente dell’atleta.</p>
          </div>
          ${matches.length
            ? '<button class="button button-ghost" type="button" data-go-log>Apri Match Log</button>'
            : ''}
        </div>
        <div class="panel-body">
          ${matches.length
            ? `<div class="match-recent-list">${matches.slice(0, 6).map(matchRecentRow).join('')}</div>`
            : `
              <div class="match-empty">
                <strong>Nessun match registrato</strong>
                <span>Aggiungi manualmente una partita oppure importala da TennisTalker.</span>
              </div>
            `}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <h3>Debrief pending</h3>
          <p>Le partite che non sono ancora diventate apprendimento.</p>
        </div>
        <div class="panel-body">
          ${pending.length
            ? `<div class="match-pending-list">${pending.map(match => `
                <button class="match-pending-row" type="button" data-debrief-match="${escapeAttr(match.id)}">
                  <span class="match-result-dot ${resultClass(match)}"></span>
                  <span>
                    <strong>${escapeHtml(matchTitle(match))}</strong>
                    <small>${escapeHtml(formatDate(match.date))} · ${escapeHtml(match.score || 'score n/d')}</small>
                  </span>
                  <b>Debrief →</b>
                </button>
              `).join('')}</div>`
            : '<div class="match-empty compact"><strong>Tutto rivisto</strong><span>Nessun debrief arretrato.</span></div>'}
        </div>
      </article>
    </section>
  `;

  host.querySelector('[data-go-log]')?.addEventListener('click', () => {
    section = 'log';
    renderRoot();
  });

  host.querySelectorAll('[data-open-match]').forEach(button => {
    button.addEventListener('click', () => openMatchDialog(button.dataset.openMatch));
  });

  host.querySelectorAll('[data-debrief-match]').forEach(button => {
    button.addEventListener('click', () => {
      selectedMatchId = button.dataset.debriefMatch;
      section = 'debrief';
      renderRoot();
    });
  });

  bindImportActions(host);
}

function renderImportPanel(companion) {
  const statusClass = companion.installed && companion.compatible
    ? 'connected'
    : companion.installed
      ? 'warning'
      : 'offline';

  const statusText = companion.installed
    ? companion.compatible
      ? `Companion collegato${companion.version ? ` · v${escapeHtml(companion.version)}` : ''}`
      : `Companion da aggiornare${companion.version ? ` · v${escapeHtml(companion.version)}` : ''}`
    : 'Companion non rilevato';

  return `
    <section class="panel match-import-panel">
      <div class="match-import-copy">
        <div class="match-import-logo">TT</div>
        <div>
          <div class="eyebrow">Import</div>
          <h3>TennisTalker → Match</h3>
          <p>
            Apri la pagina <strong>Partite</strong> dell’atleta in TennisTalker e usa il Companion:
            quando riceviamo lo storico, puoi importarlo qui senza riscrivere le partite.
          </p>
        </div>
      </div>

      <div class="match-import-actions">
        <span class="match-companion-status ${statusClass}"><i></i>${statusText}</span>
        ${canReadModule('opponents')
          ? '<button class="button button-ghost" type="button" id="match-import-opponents">Recupera da Opponents</button>'
          : ''}
        <a
          class="button button-ghost"
          href="https://www.tennistalker.it/"
          target="_blank"
          rel="noopener"
        >Apri TennisTalker</a>
        <a
          class="button button-ghost"
          href="${escapeAttr(companionSetupUrl())}"
          target="_blank"
          rel="noopener"
        >Companion</a>
      </div>
    </section>
  `;
}

function matchRecentRow(match) {
  return `
    <button class="match-recent-row" type="button" data-open-match="${escapeAttr(match.id)}">
      <span class="match-result-badge ${resultClass(match)}">${escapeHtml(match.result || '—')}</span>
      <span class="match-recent-main">
        <strong>${escapeHtml(matchTitle(match))}</strong>
        <small>${escapeHtml([match.tournament, match.round, surfaceLabel(match)].filter(Boolean).join(' · ') || 'Dettagli da completare')}</small>
      </span>
      <span class="match-recent-score">${escapeHtml(match.score || '—')}</span>
      <time>${escapeHtml(formatDate(match.date))}</time>
    </button>
  `;
}

function filteredMatches(state) {
  const query = normalizeName(filters.search);

  return activeMatches(state)
    .filter(match => !filters.result || match.result === filters.result)
    .filter(match => !filters.surface || match.surface === filters.surface)
    .filter(match => {
      if (!query) return true;
      const haystack = normalizeName([
        match.opponentName,
        match.tournament,
        match.round,
        match.score,
        match.notes,
        ...(match.tags || []),
      ].join(' '));
      return haystack.includes(query);
    });
}

function renderLog(host, state) {
  const matches = filteredMatches(state);
  const allMatches = activeMatches(state);
  const surfaces = [...new Set(allMatches.map(match => match.surface).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'it'));

  host.innerHTML = `
    <section class="match-subhead">
      <div>
        <div class="eyebrow">Match Log</div>
        <h2>Registro partite</h2>
        <p>Storico unico di match ufficiali, amichevoli, squadra e allenamento.</p>
      </div>
      ${canWrite()
        ? '<button class="button button-primary" type="button" id="match-log-new">+ Match</button>'
        : ''}
    </section>

    <section class="panel match-log-toolbar">
      <input id="match-filter-search" type="search" value="${escapeAttr(filters.search)}" placeholder="Cerca avversario, torneo, score…" />
      <select id="match-filter-result">
        <option value="">Tutti i risultati</option>
        <option value="W" ${filters.result === 'W' ? 'selected' : ''}>Vittorie</option>
        <option value="L" ${filters.result === 'L' ? 'selected' : ''}>Sconfitte</option>
      </select>
      <select id="match-filter-surface">
        <option value="">Tutte le superfici</option>
        ${surfaces.map(surface => `<option value="${escapeAttr(surface)}" ${filters.surface === surface ? 'selected' : ''}>${escapeHtml(surface)}</option>`).join('')}
      </select>
      <span>${matches.length} / ${allMatches.length}</span>
    </section>

    <section class="panel match-table-panel">
      ${matches.length
        ? `
          <div class="match-table-scroll">
            <table class="match-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ris.</th>
                  <th>Avversario</th>
                  <th>Score</th>
                  <th>Torneo / turno</th>
                  <th>Superficie</th>
                  <th>Debrief</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${matches.map(match => `
                  <tr>
                    <td>${escapeHtml(formatDate(match.date))}</td>
                    <td><span class="match-result-badge ${resultClass(match)}">${escapeHtml(match.result || '—')}</span></td>
                    <td>
                      <strong>${escapeHtml(matchTitle(match))}</strong>
                      ${match.opponentFitpRanking ? `<small>${escapeHtml(match.opponentFitpRanking)}</small>` : ''}
                    </td>
                    <td class="match-score-cell">${escapeHtml(match.score || '—')}</td>
                    <td>
                      <span>${escapeHtml(match.tournament || '—')}</span>
                      <small>${escapeHtml(match.round || '')}</small>
                    </td>
                    <td>${escapeHtml(match.surface || '—')}</td>
                    <td>
                      <span class="match-review-chip ${isReviewed(match) ? 'done' : 'pending'}">
                        ${isReviewed(match) ? 'Completato' : 'Da fare'}
                      </span>
                    </td>
                    <td class="match-row-actions">
                      <button class="button button-ghost match-small-button" type="button" data-log-debrief="${escapeAttr(match.id)}">Debrief</button>
                      ${canWrite()
                        ? `<button class="icon-button" type="button" data-log-edit="${escapeAttr(match.id)}" aria-label="Modifica">✎</button>`
                        : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
        : '<div class="match-empty"><strong>Nessun match corrisponde ai filtri</strong><span>Modifica i filtri o aggiungi un nuovo match.</span></div>'}
    </section>
  `;

  host.querySelector('#match-log-new')?.addEventListener('click', () => openMatchDialog());

  host.querySelector('#match-filter-search')?.addEventListener('input', event => {
    filters.search = event.target.value;
    renderLog(host, competitionState());
  });

  host.querySelector('#match-filter-result')?.addEventListener('change', event => {
    filters.result = event.target.value;
    renderLog(host, competitionState());
  });

  host.querySelector('#match-filter-surface')?.addEventListener('change', event => {
    filters.surface = event.target.value;
    renderLog(host, competitionState());
  });

  host.querySelectorAll('[data-log-edit]').forEach(button => {
    button.addEventListener('click', () => openMatchDialog(button.dataset.logEdit));
  });

  host.querySelectorAll('[data-log-debrief]').forEach(button => {
    button.addEventListener('click', () => {
      selectedMatchId = button.dataset.logDebrief;
      section = 'debrief';
      renderRoot();
    });
  });
}

function ratingSelect(name, value = '') {
  return `
    <select name="${escapeAttr(name)}">
      <option value="">—</option>
      ${[1,2,3,4,5].map(number => `
        <option value="${number}" ${Number(value) === number ? 'selected' : ''}>${number}</option>
      `).join('')}
    </select>
  `;
}

function renderRatingsGroup(title, fields, prefix, values = {}) {
  return `
    <section class="match-review-group">
      <div class="match-review-group-head">
        <strong>${escapeHtml(title)}</strong>
        <span>1 = insufficiente · 5 = eccellente</span>
      </div>
      <div class="match-rating-grid">
        ${fields.map(([key, label]) => `
          <label>
            <span>${escapeHtml(label)}</span>
            ${ratingSelect(`${prefix}.${key}`, values[key])}
          </label>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDebrief(host, state) {
  const matches = activeMatches(state);
  if (!selectedMatchId || !matches.some(match => match.id === selectedMatchId)) {
    selectedMatchId = matches[0]?.id || '';
  }

  const match = matches.find(item => item.id === selectedMatchId);

  host.innerHTML = `
    <section class="match-subhead">
      <div>
        <div class="eyebrow">Debrief</div>
        <h2>Post-match review</h2>
        <p>Un debrief strutturato ma abbastanza leggero da essere usato dopo ogni partita.</p>
      </div>

      ${matches.length ? `
        <select id="match-debrief-select" class="match-debrief-select">
          ${matches.map(item => `
            <option value="${escapeAttr(item.id)}" ${item.id === selectedMatchId ? 'selected' : ''}>
              ${escapeHtml(`${formatDate(item.date)} · ${item.opponentName || 'Avversario'} · ${item.score || ''}`)}
            </option>
          `).join('')}
        </select>
      ` : ''}
    </section>

    ${match ? renderDebriefForm(match) : `
      <section class="panel match-empty-panel">
        <div class="match-empty">
          <strong>Nessun match da rivedere</strong>
          <span>Aggiungi o importa prima una partita.</span>
        </div>
      </section>
    `}
  `;

  host.querySelector('#match-debrief-select')?.addEventListener('change', event => {
    selectedMatchId = event.target.value;
    renderDebrief(host, competitionState());
  });

  if (!match) return;

  host.querySelector('#match-debrief-form')?.addEventListener('submit', event => {
    event.preventDefault();
    saveDebrief(match.id, event.currentTarget);
    renderDebrief(host, competitionState());
  });

  host.querySelector('[data-edit-selected-match]')?.addEventListener('click', () => {
    openMatchDialog(match.id);
  });
}

function renderDebriefForm(match) {
  const review = match.review || {};
  const profile = findOpponentProfile(match);
  const scoreValue = overallReviewScore(match);

  return `
    <section class="match-review-hero panel">
      <div class="match-review-summary">
        <span class="match-result-badge large ${resultClass(match)}">${escapeHtml(match.result || '—')}</span>
        <div>
          <div class="eyebrow">${escapeHtml(formatDate(match.date))}</div>
          <h3>${escapeHtml(matchTitle(match))}</h3>
          <p>${escapeHtml([match.tournament, match.round, match.surface].filter(Boolean).join(' · ') || 'Dettagli da completare')}</p>
        </div>
      </div>
      <div class="match-review-score">
        <span>Score</span>
        <strong>${escapeHtml(match.score || '—')}</strong>
        ${scoreValue !== null ? `<small>Review ${scoreValue.toFixed(1)}/5</small>` : '<small>Review non valutata</small>'}
      </div>
      ${canWrite()
        ? '<button class="button button-ghost" type="button" data-edit-selected-match>Dettagli match</button>'
        : ''}
    </section>

    ${profile?.matchPlan ? `
      <section class="panel match-plan-reference">
        <div class="panel-header">
          <h3>Match plan da Opponents</h3>
          <p>Riferimento pre-match disponibile per ${escapeHtml(profile.name)}.</p>
        </div>
        <div class="panel-body match-plan-reference-grid">
          ${[
            ['Obiettivo', profile.matchPlan.objective],
            ['Servizio', profile.matchPlan.serve],
            ['Risposta', profile.matchPlan.return],
            ['Scambio', profile.matchPlan.rally],
            ['Da evitare', profile.matchPlan.avoid],
            ['Cue', profile.matchPlan.cue],
          ].filter(([, value]) => clean(value)).map(([label, value]) => `
            <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
          `).join('') || '<div class="match-empty compact"><span>Match plan presente ma ancora vuoto.</span></div>'}
        </div>
      </section>
    ` : ''}

    <form id="match-debrief-form" class="match-debrief-form">
      <section class="panel">
        <div class="panel-header">
          <h3>Match story</h3>
          <p>Che cosa è realmente successo?</p>
        </div>
        <div class="panel-body form-grid">
          <div class="field full"><label>Riassunto</label><textarea name="story.summary">${escapeHtml(review.story?.summary || '')}</textarea></div>
          <div class="field"><label>Cosa ha funzionato</label><textarea name="story.worked">${escapeHtml(review.story?.worked || '')}</textarea></div>
          <div class="field"><label>Cosa non ha funzionato</label><textarea name="story.notWorked">${escapeHtml(review.story?.notWorked || '')}</textarea></div>
          <div class="field"><label>Momento chiave</label><textarea name="story.keyMoment">${escapeHtml(review.story?.keyMoment || '')}</textarea></div>
          <div class="field"><label>Perché ho vinto / perso?</label><textarea name="story.why">${escapeHtml(review.story?.why || '')}</textarea></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h3>Piano tattico</h3>
          <p>Quanto il piano ha retto alla partita reale?</p>
        </div>
        <div class="panel-body form-grid">
          <div class="field">
            <label>Piano rispettato?</label>
            <select name="plan.adherence">
              <option value="">—</option>
              <option value="yes" ${review.plan?.adherence === 'yes' ? 'selected' : ''}>Sì</option>
              <option value="partial" ${review.plan?.adherence === 'partial' ? 'selected' : ''}>In parte</option>
              <option value="no" ${review.plan?.adherence === 'no' ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="field"><label>Cosa ha funzionato del piano</label><textarea name="plan.worked">${escapeHtml(review.plan?.worked || '')}</textarea></div>
          <div class="field"><label>Cosa non era corretto / applicabile</label><textarea name="plan.wrong">${escapeHtml(review.plan?.wrong || '')}</textarea></div>
          <div class="field"><label>Prossima volta</label><textarea name="plan.nextTime">${escapeHtml(review.plan?.nextTime || '')}</textarea></div>
        </div>
      </section>

      ${renderRatingsGroup('Tecnico-tattico', TECHNICAL_FIELDS, 'technical', review.technical || {})}
      ${renderRatingsGroup('Mental', MENTAL_FIELDS, 'mental', review.mental || {})}
      ${renderRatingsGroup('Fisico', PHYSICAL_FIELDS, 'physical', review.physical || {})}

      <section class="panel">
        <div class="panel-header">
          <h3>Takeaways</h3>
          <p>La parte che deve sopravvivere al debrief.</p>
        </div>
        <div class="panel-body form-grid">
          <div class="field"><label>Da confermare</label><textarea name="takeaways.confirm">${escapeHtml(review.takeaways?.confirm || '')}</textarea></div>
          <div class="field"><label>Da migliorare</label><textarea name="takeaways.improve">${escapeHtml(review.takeaways?.improve || '')}</textarea></div>
          <div class="field full"><label>Priorità prossima settimana</label><textarea name="takeaways.nextPriority">${escapeHtml(review.takeaways?.nextPriority || '')}</textarea></div>
          <div class="field full"><label>Note fisiche</label><textarea name="physical.notes">${escapeHtml(review.physical?.notes || '')}</textarea></div>
        </div>
      </section>

      ${canWrite()
        ? `
          <div class="match-review-savebar">
            <span>${review.reviewedAt ? `Ultimo debrief: ${escapeHtml(new Date(review.reviewedAt).toLocaleString('it-IT'))}` : 'Debrief non ancora completato'}</span>
            <button class="button button-primary" type="submit">Salva debrief</button>
          </div>
        `
        : ''}
    </form>
  `;
}

function formValue(form, name) {
  return clean(form.elements[name]?.value);
}

function formRating(form, name) {
  const value = Number(form.elements[name]?.value);
  return Number.isFinite(value) && value >= 1 && value <= 5 ? value : '';
}

function saveDebrief(matchId, form) {
  if (!canWrite()) return;

  store.update(state => {
    state.competition = normalizeMatchPayload(state.competition);
    const match = state.competition.matches.find(item => item.id === matchId);
    if (!match) return;

    match.review = {
      story: {
        summary: formValue(form, 'story.summary'),
        worked: formValue(form, 'story.worked'),
        notWorked: formValue(form, 'story.notWorked'),
        keyMoment: formValue(form, 'story.keyMoment'),
        why: formValue(form, 'story.why'),
      },
      plan: {
        adherence: formValue(form, 'plan.adherence'),
        worked: formValue(form, 'plan.worked'),
        wrong: formValue(form, 'plan.wrong'),
        nextTime: formValue(form, 'plan.nextTime'),
      },
      technical: Object.fromEntries(
        TECHNICAL_FIELDS.map(([key]) => [
          key,
          formRating(form, `technical.${key}`),
        ]),
      ),
      mental: Object.fromEntries(
        MENTAL_FIELDS.map(([key]) => [
          key,
          formRating(form, `mental.${key}`),
        ]),
      ),
      physical: {
        ...Object.fromEntries(
          PHYSICAL_FIELDS.map(([key]) => [
            key,
            formRating(form, `physical.${key}`),
          ]),
        ),
        notes: formValue(form, 'physical.notes'),
      },
      takeaways: {
        confirm: formValue(form, 'takeaways.confirm'),
        improve: formValue(form, 'takeaways.improve'),
        nextPriority: formValue(form, 'takeaways.nextPriority'),
      },
      reviewedAt: new Date().toISOString(),
    };

    match.updatedAt = new Date().toISOString();
    state.meta.matchDebriefSavedAt = new Date().toISOString();
  });
}

function renderInsights(host, state) {
  const matches = activeMatches(state);
  const reviewed = matches.filter(isReviewed);

  const surfaceMap = new Map();
  for (const match of matches) {
    const key = clean(match.surface) || 'Non specificata';
    if (!surfaceMap.has(key)) surfaceMap.set(key, { total: 0, wins: 0 });
    const bucket = surfaceMap.get(key);
    bucket.total += 1;
    if (match.result === 'W') bucket.wins += 1;
  }

  const surfaces = [...surfaceMap.entries()]
    .sort((a, b) => b[1].total - a[1].total);

  const technicalAverages = groupAverages(reviewed, 'technical', TECHNICAL_FIELDS);
  const mentalAverages = groupAverages(reviewed, 'mental', MENTAL_FIELDS);
  const physicalAverages = groupAverages(reviewed, 'physical', PHYSICAL_FIELDS);

  host.innerHTML = `
    <section class="match-subhead">
      <div>
        <div class="eyebrow">Insights</div>
        <h2>Pattern emergenti</h2>
        <p>Una lettura descrittiva dei match registrati e dei debrief completati.</p>
      </div>
    </section>

    ${matches.length ? `
      <section class="match-insights-grid">
        <article class="panel">
          <div class="panel-header">
            <h3>Per superficie</h3>
            <p>Match e vittorie nel campione registrato.</p>
          </div>
          <div class="panel-body match-surface-list">
            ${surfaces.map(([surface, value]) => `
              <div>
                <span>${escapeHtml(surface)}</span>
                <strong>${value.wins}/${value.total}</strong>
                <small>${value.total ? `${Math.round((value.wins / value.total) * 100)}% W` : '—'}</small>
              </div>
            `).join('')}
          </div>
        </article>

        ${insightAverageCard('Tecnico-tattico', technicalAverages)}
        ${insightAverageCard('Mental', mentalAverages)}
        ${insightAverageCard('Fisico', physicalAverages)}
      </section>

      <section class="panel match-takeaway-panel">
        <div class="panel-header">
          <h3>Ultime priorità emerse</h3>
          <p>Takeaway espliciti dei debrief più recenti.</p>
        </div>
        <div class="panel-body match-takeaway-list">
          ${reviewed
            .filter(match => clean(match.review?.takeaways?.nextPriority))
            .slice(0, 8)
            .map(match => `
              <div>
                <time>${escapeHtml(formatDate(match.date))}</time>
                <span>
                  <strong>${escapeHtml(match.opponentName || 'Match')}</strong>
                  <small>${escapeHtml(match.review.takeaways.nextPriority)}</small>
                </span>
              </div>
            `).join('') || '<div class="match-empty compact"><span>Nessuna priorità registrata nei debrief.</span></div>'}
        </div>
      </section>
    ` : `
      <section class="panel match-empty-panel">
        <div class="match-empty">
          <strong>Servono match per generare insight</strong>
          <span>Le statistiche compaiono appena il registro inizia a popolarsi.</span>
        </div>
      </section>
    `}
  `;
}

function groupAverages(matches, groupKey, fields) {
  return fields.map(([key, label]) => {
    const values = matches
      .map(match => Number(match.review?.[groupKey]?.[key]))
      .filter(value => Number.isFinite(value) && value >= 1 && value <= 5);

    return {
      key,
      label,
      count: values.length,
      average: values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null,
    };
  }).filter(item => item.count);
}

function insightAverageCard(title, items) {
  return `
    <article class="panel">
      <div class="panel-header">
        <h3>${escapeHtml(title)}</h3>
        <p>Media dei debrief disponibili · scala 1–5.</p>
      </div>
      <div class="panel-body match-average-list">
        ${items.length
          ? items
            .sort((a, b) => b.average - a.average)
            .map(item => `
              <div>
                <span>${escapeHtml(item.label)}</span>
                <strong>${item.average.toFixed(1)}</strong>
                <div class="match-average-track"><i style="width:${Math.round(item.average / 5 * 100)}%"></i></div>
              </div>
            `).join('')
          : '<div class="match-empty compact"><span>Nessun rating disponibile.</span></div>'}
      </div>
    </article>
  `;
}

function surfaceOptions(selected = '') {
  return SURFACES.map(surface => `
    <option value="${escapeAttr(surface)}" ${selected === surface ? 'selected' : ''}>
      ${surface ? escapeHtml(surface) : '—'}
    </option>
  `).join('');
}

function matchTypeOptions(selected = 'official') {
  return Object.entries(MATCH_TYPES).map(([value, label]) => `
    <option value="${value}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>
  `).join('');
}

function openMatchDialog(matchId = '') {
  if (!canWrite()) return;

  const state = competitionState();
  const existing = matchId
    ? state.matches.find(item => item.id === matchId)
    : null;

  const now = new Date().toISOString();
  const match = existing || normalizeMatchRecord({
    id: makeId('match'),
    date: todayKey(),
    matchType: 'official',
    source: { provider: 'Manual' },
    createdAt: now,
    updatedAt: now,
  });

  const profiles = opponentProfiles();

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog match-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="match-edit-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Match</div>
          <h3>${existing ? 'Modifica match' : 'Nuovo match'}</h3>
        </div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${escapeAttr(match.date)}" required /></div>
        <div class="field">
          <label>Tipo</label>
          <select name="matchType">${matchTypeOptions(match.matchType)}</select>
        </div>

        <div class="field full">
          <label>Opponent TPOS</label>
          <select name="opponentProfileId">
            <option value="">— Nessun collegamento —</option>
            ${profiles.map(profile => `
              <option value="${escapeAttr(profile.id)}" ${profile.id === match.opponentProfileId ? 'selected' : ''}>
                ${escapeHtml(profile.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field full"><label>Avversario</label><input name="opponentName" value="${escapeAttr(match.opponentName)}" required /></div>
        <div class="field"><label>Classifica avversario</label><input name="opponentFitpRanking" value="${escapeAttr(match.opponentFitpRanking)}" /></div>
        <div class="field"><label>Categoria avversario</label><input name="opponentCategory" value="${escapeAttr(match.opponentCategory)}" /></div>

        <div class="field"><label>Risultato</label>
          <select name="result">
            <option value="">—</option>
            <option value="W" ${match.result === 'W' ? 'selected' : ''}>W · Vittoria</option>
            <option value="L" ${match.result === 'L' ? 'selected' : ''}>L · Sconfitta</option>
          </select>
        </div>
        <div class="field"><label>Score</label><input name="score" value="${escapeAttr(match.score)}" placeholder="es. 6-4 3-6 10-7" /></div>

        <div class="field full"><label>Torneo / evento</label><input name="tournament" value="${escapeAttr(match.tournament)}" /></div>
        <div class="field"><label>Turno</label><input name="round" value="${escapeAttr(match.round)}" placeholder="R32, QF, SF…" /></div>
        <div class="field"><label>Superficie</label><select name="surface">${surfaceOptions(match.surface)}</select></div>
        <div class="field"><label>Ambiente</label>
          <select name="environment">
            <option value="">—</option>
            <option value="outdoor" ${match.environment === 'outdoor' ? 'selected' : ''}>Outdoor</option>
            <option value="indoor" ${match.environment === 'indoor' ? 'selected' : ''}>Indoor</option>
          </select>
        </div>
        <div class="field"><label>Durata · min</label><input type="number" min="0" step="1" name="durationMin" value="${escapeAttr(match.durationMin)}" /></div>

        <div class="field full"><label>Tag · separati da virgola</label><input name="tags" value="${escapeAttr((match.tags || []).join(', '))}" placeholder="vento, mancina, rimonta…" /></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(match.notes)}</textarea></div>

        ${match.source?.provider && match.source.provider !== 'Manual' ? `
          <div class="field full match-source-note">
            <strong>Fonte: ${escapeHtml(match.source.provider)}</strong>
            <span>I dati importati possono essere corretti manualmente senza perdere il collegamento alla fonte.</span>
          </div>
        ` : ''}
      </div>

      <div class="dialog-actions">
        <div>
          ${existing ? '<button class="button button-danger" type="button" id="match-delete">Elimina</button>' : ''}
        </div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  const profileSelect = dialog.querySelector('[name="opponentProfileId"]');
  profileSelect?.addEventListener('change', () => {
    const profile = profiles.find(item => item.id === profileSelect.value);
    if (!profile) return;

    const form = dialog.querySelector('#match-edit-form');
    form.elements.opponentName.value = profile.name || '';
    form.elements.opponentFitpRanking.value = profile.fitpRanking || '';
    form.elements.opponentCategory.value = profile.category || '';
  });

  dialog.querySelector('#match-edit-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const profile = profiles.find(item => item.id === data.opponentProfileId);
    const updatedAt = new Date().toISOString();

    const nextMatch = normalizeMatchRecord({
      ...match,
      date: data.date,
      matchType: data.matchType,
      opponentProfileId: data.opponentProfileId,
      opponentName: data.opponentName,
      opponentExternalId: profile?.source?.externalId || match.opponentExternalId,
      opponentUrl: profile?.source?.url || match.opponentUrl,
      opponentFitpRanking: data.opponentFitpRanking,
      opponentCategory: data.opponentCategory,
      result: data.result,
      score: data.score,
      tournament: data.tournament,
      round: data.round,
      surface: data.surface,
      environment: data.environment,
      durationMin: data.durationMin,
      tags: String(data.tags || '').split(',').map(clean).filter(Boolean),
      notes: data.notes,
      source: match.source?.provider ? match.source : { provider: 'Manual' },
      review: match.review,
      createdAt: match.createdAt || updatedAt,
      updatedAt,
    });

    store.update(state => {
      state.competition = normalizeMatchPayload(state.competition);
      const index = state.competition.matches.findIndex(item => item.id === nextMatch.id);

      if (index >= 0) state.competition.matches[index] = nextMatch;
      else state.competition.matches.push(nextMatch);

      state.meta.matchUpdatedAt = updatedAt;
    });

    selectedMatchId = nextMatch.id;
    dialog.close();
    renderRoot();
  });

  dialog.querySelector('#match-delete')?.addEventListener('click', async () => {
    const ok = await showInAppConfirm(
      `Eliminare il match contro ${match.opponentName || 'questo avversario'}?`,
      { title: 'Elimina match', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      state.competition = normalizeMatchPayload(state.competition);
      state.competition.matches = state.competition.matches.filter(item => item.id !== match.id);
      state.meta.matchUpdatedAt = new Date().toISOString();
    });

    if (selectedMatchId === match.id) selectedMatchId = '';
    dialog.close();
    renderRoot();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

function importedMatchFingerprint(match = {}) {
  return [
    clean(match.date),
    normalizeName(match.opponentName),
    clean(match.opponentExternalId),
    clean(match.score),
    clean(match.result).toUpperCase(),
    clean(match.tournament),
  ].join('|');
}

function mergeImportedMatches(records = []) {
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  store.update(state => {
    state.competition = normalizeMatchPayload(state.competition);

    const byExternalKey = new Map();
    const byFingerprint = new Map();

    for (const match of state.competition.matches) {
      if (match.source?.externalKey) {
        byExternalKey.set(match.source.externalKey, match);
      }
      byFingerprint.set(importedMatchFingerprint(match), match);
    }

    for (const raw of records) {
      const incoming = normalizeMatchRecord(raw);
      if (!incoming.opponentName) continue;

      const externalKey = clean(incoming.source?.externalKey);
      const fingerprint = importedMatchFingerprint(incoming);

      const target = (
        (externalKey && byExternalKey.get(externalKey))
        || byFingerprint.get(fingerprint)
        || null
      );

      if (target) {
        const review = target.review;
        const createdAt = target.createdAt;

        Object.assign(target, incoming);
        target.review = review;
        target.createdAt = createdAt || incoming.createdAt || now;
        target.updatedAt = now;
        target.source = {
          ...(target.source || {}),
          ...(incoming.source || {}),
          importedAt: target.source?.importedAt || incoming.source?.importedAt || now,
          lastCheckedAt: now,
        };

        updated += 1;
        continue;
      }

      const created = normalizeMatchRecord({
        ...incoming,
        id: incoming.id || makeId('match'),
        createdAt: incoming.createdAt || now,
        updatedAt: now,
        source: {
          ...(incoming.source || {}),
          importedAt: incoming.source?.importedAt || now,
          lastCheckedAt: now,
        },
      });

      state.competition.matches.push(created);
      if (externalKey) byExternalKey.set(externalKey, created);
      byFingerprint.set(fingerprint, created);
      added += 1;
    }

    state.meta.matchImportedAt = now;
  });

  return { added, updated };
}

async function importFromOpponents() {
  if (!canReadModule('opponents')) {
    await showInAppAlert(
      'Questo account non può leggere il modulo Opponents.',
      { title: 'Import non disponibile' },
    );
    return;
  }

  const access = getCurrentAccess();

  try {
    await loadOpponentsIntoLocalStore({
      store,
      athleteId: access.athleteId,
      allowWrite: false,
    });
  } catch (error) {
    console.warn('Opponents load for Match import failed.', error);
  }

  const opponents = opponentsState();
  const records = [];

  for (const profile of opponents.profiles || []) {
    for (const sourceMatch of profile.matchHistory || []) {
      if (!sourceMatch.againstAthlete) continue;

      const sourceResult = clean(sourceMatch.result).toUpperCase();
      const athleteResult = sourceResult === 'W'
        ? 'L'
        : sourceResult === 'L'
          ? 'W'
          : '';

      records.push({
        id: makeId('match'),
        date: sourceMatch.date,
        opponentName: profile.name,
        opponentProfileId: profile.id,
        opponentExternalId: profile.source?.externalId || '',
        opponentUrl: profile.source?.url || '',
        opponentFitpRanking: profile.fitpRanking || '',
        opponentCategory: profile.category || '',
        result: athleteResult,
        score: sourceMatch.score,
        tournament: sourceMatch.tournament,
        surface: sourceMatch.surface,
        source: {
          provider: 'TennisTalker',
          externalKey: sourceMatch.source?.externalKey
            ? `opponent:${profile.id}:${sourceMatch.source.externalKey}`
            : '',
          profileExternalId: profile.source?.externalId || '',
          sourceUrl: profile.source?.url || '',
          raw: sourceMatch.source?.raw || '',
          importedAt: new Date().toISOString(),
        },
      });
    }
  }

  if (!records.length) {
    await showInAppAlert(
      'Non ho trovato nei profili Opponents match TennisTalker riconosciuti come giocati contro l’atleta attivo.',
      { title: 'Nessun match da importare' },
    );
    return;
  }

  const result = mergeImportedMatches(records);

  await showInAppAlert(
    `Import completato: ${result.added} nuovi match, ${result.updated} aggiornati.`,
    { title: 'Opponents → Match' },
  );

  renderRoot();
}

function bindImportActions(host) {
  host.querySelector('#match-import-opponents')?.addEventListener('click', () => {
    void importFromOpponents();
  });
}

function mailbox() {
  return document.getElementById(MAILBOX_ID);
}

function readCompanionPayload() {
  const box = mailbox();
  if (!box || box.dataset.status !== 'pending') return null;

  try {
    const payload = JSON.parse(box.textContent || '');
    const isDedicatedMatches = payload?.kind === 'matches';
    const isLegacyProfileMatches = (
      payload?.kind === 'profile'
      && Array.isArray(payload?.profile?.matches)
      && payload.profile.matches.length
    );

    if (
      !payload?.importId
      || (!isDedicatedMatches && !isLegacyProfileMatches)
      || !payload.profile
      || !Array.isArray(payload.profile.matches)
      || !payload.profile.matches.length
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function finishMailbox(importId, outcome) {
  const box = mailbox();
  if (!box) return;

  let payload = null;
  try {
    payload = JSON.parse(box.textContent || '');
  } catch {
    return;
  }

  if (payload?.importId !== importId) return;

  box.dataset.status = 'finished';
  box.dataset.outcome = outcome;
  box.dataset.finishedAt = new Date().toISOString();
}

function normalizeCompanionMatch(raw = {}, profile = {}) {
  const now = new Date().toISOString();

  return normalizeMatchRecord({
    id: makeId('match'),
    date: raw.date,
    opponentName: raw.opponentName,
    opponentExternalId: raw.opponentExternalId,
    opponentUrl: raw.opponentUrl,
    opponentFitpRanking: raw.opponentFitpRanking,
    opponentCategory: raw.opponentCategory,
    result: raw.result,
    score: raw.score,
    surface: raw.surface,
    tournament: raw.tournament,
    round: raw.round,
    source: {
      provider: 'TennisTalker',
      externalKey: raw.externalKey,
      profileExternalId: profile.externalId || '',
      sourceUrl: profile.externalUrl || '',
      raw: raw.raw || '',
      importedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function openCompanionImport(payload) {
  if (
    route() !== 'competition'
    || currentCompanionImportId === payload.importId
    || processedCompanionImports.has(payload.importId)
  ) {
    return;
  }

  const access = getCurrentAccess();
  if (!access.athleteId || !canWrite()) return;

  currentCompanionImportId = payload.importId;

  const profile = payload.profile || {};
  const matches = profile.matches.map(match => normalizeCompanionMatch(match, profile));
  const sourceName = clean(profile.name);
  const currentName = athleteName();

  const likelyOwnProfile = (
    !sourceName
    || !currentName
    || nameTokenKey(sourceName) === nameTokenKey(currentName)
  );

  const dialog = document.createElement('dialog');
  dialog.id = 'match-companion-import-dialog';
  dialog.className = 'planner-dialog match-dialog match-import-dialog';

  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">TennisTalker → Match</div>
          <h3>Importa storico partite</h3>
        </div>
        <button class="dialog-close" type="button" data-cancel>×</button>
      </div>

      <div class="dialog-body">
        <div class="auth-message ${likelyOwnProfile ? 'success' : ''}">
          Ricevuti <strong>${matches.length}</strong> match dal profilo
          <strong>${escapeHtml(sourceName || 'TennisTalker')}</strong>.
          ${likelyOwnProfile
            ? 'Il profilo è compatibile con l’atleta attivo.'
            : `<br><strong>Attenzione:</strong> l’atleta attivo è ${escapeHtml(currentName || 'non identificato')}. Verifica di avere aperto la pagina TennisTalker corretta.`}
        </div>

        <div class="match-import-preview">
          ${matches.slice(0, 12).map(match => `
            <div>
              <span class="match-result-badge ${resultClass(match)}">${escapeHtml(match.result || '—')}</span>
              <span>
                <strong>${escapeHtml(match.opponentName || 'Avversario')}</strong>
                <small>${escapeHtml([formatDate(match.date), match.score, match.tournament].filter(Boolean).join(' · '))}</small>
              </span>
            </div>
          `).join('')}
        </div>

        ${matches.length > 12 ? `<p class="training-field-hint">Anteprima dei primi 12 match su ${matches.length}.</p>` : ''}

        <p class="training-field-hint">
          I match già importati vengono aggiornati senza cancellare i debrief già compilati.
        </p>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-cancel>Annulla</button>
          <button class="button button-primary" type="submit">
            ${likelyOwnProfile ? 'Importa storico' : 'Importa comunque'}
          </button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const cancel = () => {
    finishMailbox(payload.importId, 'cancelled');
    processedCompanionImports.add(payload.importId);
    currentCompanionImportId = '';
    dialog.close();
  };

  dialog.querySelectorAll('[data-cancel]').forEach(button => {
    button.addEventListener('click', cancel);
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancel();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();

    const result = mergeImportedMatches(matches);

    finishMailbox(payload.importId, 'imported');
    processedCompanionImports.add(payload.importId);
    currentCompanionImportId = '';
    dialog.close();

    renderRoot();

    void showInAppAlert(
      `Import completato: ${result.added} nuovi match, ${result.updated} aggiornati.`,
      { title: 'TennisTalker → Match' },
    );
  });

  dialog.showModal();
}

function checkCompanionMailbox() {
  if (route() !== 'competition') return;

  const payload = readCompanionPayload();
  if (!payload) return;

  if (
    payload.importId === currentCompanionImportId
    || processedCompanionImports.has(payload.importId)
  ) {
    return;
  }

  void openCompanionImport(payload);
}

async function enhanceCurrentRoute() {
  enhancementQueued = false;

  applyModuleMetadata();
  patchVisibleMetadata();

  if (route() !== 'competition') return;

  try {
    await ensureCloud();
  } catch (error) {
    console.warn('Match initialization failed.', error);
    setCloudStatus('error', error?.message || '');
  }

  renderRoot();
  checkCompanionMailbox();
}

function queueEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;

  queueMicrotask(() => {
    void enhanceCurrentRoute();
  });
}

window.addEventListener('hashchange', queueEnhancement);
window.setInterval(checkCompanionMailbox, 500);

applyModuleMetadata();
patchVisibleMetadata();
queueEnhancement();
