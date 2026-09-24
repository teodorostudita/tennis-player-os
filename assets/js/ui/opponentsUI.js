import { canReadModule, canWriteModule, getCurrentAccess } from '../cloud/access.js';
import {
  loadOpponentsIntoLocalStore,
  normalizeOpponentsPayload,
  startOpponentsCloudSync,
} from '../cloud/opponentsCloud.js';
import { store } from '../data/store.js';
import { showInAppAlert, showInAppConfirm } from './inAppMessages.js';

const SECTIONS = [
  ['rankings', 'Rankings'],
  ['watchlist', 'Watchlist'],
  ['profiles', 'Profiles'],
  ['matchup', 'Matchup'],
];

const ui = {
  section: 'rankings',
  selectedProfileId: '',
  matchupProfileId: '',
  rankCategory: '',
  rankGender: '',
  rankScope: 'Italia',
};

let cloudReady = false;
let cloudSyncStarted = false;

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
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
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function opponentsState() {
  return normalizeOpponentsPayload(store.getState().opponents);
}

function athleteCompetition() {
  const athlete = store.getState().athlete || {};
  return {
    category: String(athlete.competitionCategory || ''),
    gender: String(athlete.competitionGender || ''),
    name: [athlete.firstName, athlete.lastName].filter(Boolean).join(' ') || 'Atleta',
  };
}

function canWrite() {
  return canWriteModule('opponents');
}

function setCloudStatus({ status, message = '' }) {
  if (route() !== 'opponents') return;
  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Opponents → cloud…';
    indicator.title = 'Sincronizzazione Opponents in corso.';
  } else if (status === 'error') {
    indicator.textContent = 'Opponents · cache locale';
    indicator.title = message || 'Sincronizzazione Opponents non riuscita.';
  } else if (status === 'readonly') {
    indicator.textContent = 'Opponents cloud · sola lettura';
    indicator.title = 'Questo account può consultare Opponents ma non modificarlo.';
  } else {
    indicator.textContent = 'Opponents cloud ✓';
    indicator.title = 'Opponents sincronizzato con Supabase.';
  }
}

async function waitForAccess() {
  for (let i = 0; i < 80; i += 1) {
    if (getCurrentAccess().athleteId) return getCurrentAccess();
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }
  return getCurrentAccess();
}

async function setupCloud() {
  const access = await waitForAccess();
  if (!access.athleteId || !canReadModule('opponents')) return;

  const result = await loadOpponentsIntoLocalStore({
    store,
    athleteId: access.athleteId,
    allowWrite: canWriteModule('opponents'),
  });

  cloudReady = true;

  if (canWriteModule('opponents') && !result?.cloudError && !cloudSyncStarted) {
    cloudSyncStarted = true;
    startOpponentsCloudSync({
      store,
      athleteId: access.athleteId,
      onStatus: setCloudStatus,
    });
  } else if (!canWriteModule('opponents')) {
    setCloudStatus({ status: 'readonly' });
  }
}

function sourceBadge(profile) {
  const source = profile?.source || {};
  if (!source.provider) return '<span class="opp-source-badge manual">Manuale</span>';
  return `<span class="opp-source-badge">${escapeHtml(source.provider)}</span>`;
}

function categoryOptions(selected = '') {
  return ['U10','U12','U14','U16','U18','Open'].map(value =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`,
  ).join('');
}

function genderOptions(selected = '') {
  return `
    <option value="F" ${selected === 'F' ? 'selected' : ''}>Femminile</option>
    <option value="M" ${selected === 'M' ? 'selected' : ''}>Maschile</option>
  `;
}

function latestSnapshot(state) {
  const snapshots = [...state.rankings.snapshots]
    .filter(snapshot => !ui.rankCategory || snapshot.category === ui.rankCategory)
    .filter(snapshot => !ui.rankGender || snapshot.gender === ui.rankGender)
    .filter(snapshot => !ui.rankScope || snapshot.scope === ui.rankScope)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return snapshots[0] || null;
}

function profileMatchForEntry(state, entry) {
  const url = String(entry.externalUrl || '').trim();
  const externalId = String(entry.externalId || '').trim();
  const name = String(entry.playerName || '').trim().toLowerCase();
  return state.profiles.find(profile =>
    (url && profile.source?.url === url)
    || (externalId && profile.source?.externalId === externalId)
    || (name && String(profile.name || '').trim().toLowerCase() === name)
  ) || null;
}

function renderRankings(state) {
  const competition = athleteCompetition();
  if (!ui.rankCategory) ui.rankCategory = competition.category || 'U12';
  if (!ui.rankGender) ui.rankGender = competition.gender || 'F';

  const snapshot = latestSnapshot(state);
  const entries = [...(snapshot?.entries || [])]
    .sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999))
    .slice(0, 50);

  return `
    <section class="opp-toolbar panel">
      <div class="opp-filter-grid">
        <label><span>Categoria</span><select id="opp-rank-category">${categoryOptions(ui.rankCategory)}</select></label>
        <label><span>Sesso</span><select id="opp-rank-gender">${genderOptions(ui.rankGender)}</select></label>
        <label><span>Ambito</span><select id="opp-rank-scope"><option ${ui.rankScope === 'Italia' ? 'selected' : ''}>Italia</option><option ${ui.rankScope === 'Regione' ? 'selected' : ''}>Regione</option><option ${ui.rankScope === 'Provincia' ? 'selected' : ''}>Provincia</option></select></label>
      </div>
      ${canWrite() ? '<button class="button button-primary" id="opp-add-snapshot" type="button">+ Snapshot ranking</button>' : ''}
    </section>

    ${snapshot ? `
      <section class="panel opp-ranking-panel">
        <div class="panel-header opp-panel-header-row">
          <div>
            <h3>Top ${Math.min(entries.length || 50, 50)} · ${escapeHtml(snapshot.category)} ${snapshot.gender === 'F' ? 'Femminile' : 'Maschile'}</h3>
            <p>${escapeHtml(snapshot.scope || 'Italia')} · ${escapeHtml(snapshot.source || 'Fonte manuale')} · aggiornato ${formatDate(snapshot.date)}</p>
          </div>
          <span class="opp-snapshot-count">${entries.length} giocatric${snapshot.gender === 'F' ? 'i' : 'ori'}</span>
        </div>
        <div class="opp-table-scroll">
          <table class="opp-table">
            <thead><tr><th>#</th><th>Giocatore</th><th>FITP</th><th>Regione</th><th>Club</th><th></th></tr></thead>
            <tbody>
              ${entries.map(entry => {
                const profile = profileMatchForEntry(state, entry);
                return `
                  <tr>
                    <td class="opp-rank-number">${escapeHtml(entry.rank || '—')}</td>
                    <td><strong>${escapeHtml(entry.playerName)}</strong>${entry.externalUrl ? '<span class="opp-external-dot" title="Fonte esterna">●</span>' : ''}</td>
                    <td>${escapeHtml(entry.fitpRanking || '—')}</td>
                    <td>${escapeHtml(entry.region || '—')}</td>
                    <td>${escapeHtml(entry.club || '—')}</td>
                    <td class="opp-table-action">
                      ${profile
                        ? `<button class="button button-ghost opp-small-button" data-open-profile="${escapeAttr(profile.id)}" type="button">Apri</button>`
                        : canWrite()
                          ? `<button class="button button-ghost opp-small-button" data-create-profile-from-rank="${escapeAttr(entry.id)}" data-snapshot-id="${escapeAttr(snapshot.id)}" type="button">Crea profilo</button>`
                          : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    ` : `
      <section class="panel opp-empty">
        <div class="opp-empty-icon">50</div>
        <h3>Nessuna snapshot ranking</h3>
        <p>Il contenitore è pronto per la Top 50 ${escapeHtml(ui.rankCategory)}. Per ora puoi incollare una lista manuale; in seguito collegheremo TennisTalker.</p>
        ${canWrite() ? '<button class="button button-primary" id="opp-empty-add-snapshot" type="button">Crea prima snapshot</button>' : ''}
      </section>
    `}
  `;
}

function profileCard(profile) {
  const matches = Array.isArray(profile.matchHistory) ? profile.matchHistory : [];
  const recent = [...matches].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5);
  return `
    <article class="panel opp-profile-card">
      <button class="opp-profile-main" data-open-profile="${escapeAttr(profile.id)}" type="button">
        <div class="opp-profile-avatar">${escapeHtml(String(profile.name || '?').trim().charAt(0).toUpperCase() || '?')}</div>
        <div class="opp-profile-copy">
          <div class="opp-card-title-row"><strong>${escapeHtml(profile.name || 'Opponent')}</strong>${profile.watchlisted ? '<span title="Watchlist">★</span>' : ''}</div>
          <span>${escapeHtml([profile.fitpRanking, profile.category, profile.region].filter(Boolean).join(' · ') || 'Dati competitivi da completare')}</span>
          <small>${recent.length ? `${recent.length} match recenti registrati` : 'Nessun match registrato'}</small>
        </div>
      </button>
      <div class="opp-profile-card-footer">${sourceBadge(profile)}<span>${escapeHtml(profile.club || '')}</span></div>
    </article>
  `;
}

function renderProfiles(state) {
  return `
    <section class="training-subhead opp-subhead">
      <div>
        <div class="eyebrow">Database avversari</div>
        <h2>Profiles</h2>
        <p>Dati esterni, storico match e scouting Tennis Player OS restano separati nello stesso profilo.</p>
      </div>
      ${canWrite() ? '<button class="button button-primary" id="opp-add-profile" type="button">+ Nuovo opponent</button>' : ''}
    </section>
    <section class="opp-profile-grid">
      ${state.profiles.length
        ? [...state.profiles].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it')).map(profileCard).join('')
        : '<div class="panel opp-empty"><div class="opp-empty-icon">👥</div><h3>Nessun opponent</h3><p>Crea un profilo manualmente oppure trasformalo da una riga del ranking.</p></div>'}
    </section>
  `;
}

function renderWatchlist(state) {
  const profiles = state.profiles.filter(profile => profile.watchlisted);
  return `
    <section class="training-subhead opp-subhead">
      <div>
        <div class="eyebrow">Monitoraggio</div>
        <h2>Watchlist</h2>
        <p>Gli avversari che meritano attenzione continuativa: ranking, risultati e possibili incroci futuri.</p>
      </div>
      <div class="opp-watch-count">★ ${profiles.length}</div>
    </section>
    <section class="opp-profile-grid">
      ${profiles.length
        ? profiles.map(profileCard).join('')
        : '<div class="panel opp-empty"><div class="opp-empty-icon">☆</div><h3>Watchlist vuota</h3><p>Apri un profilo e usa la stella per iniziare a seguirlo.</p></div>'}
    </section>
  `;
}

function h2hForProfile(profile) {
  const matches = (profile.matchHistory || []).filter(match => match.againstAthlete);
  const athleteWins = matches.filter(match => match.result === 'L').length;
  const opponentWins = matches.filter(match => match.result === 'W').length;
  return { matches, athleteWins, opponentWins };
}

function renderMatchup(state) {
  if (!ui.matchupProfileId && state.profiles.length) {
    ui.matchupProfileId = state.profiles[0].id;
  }
  const profile = state.profiles.find(item => item.id === ui.matchupProfileId) || null;
  const athlete = athleteCompetition();

  return `
    <section class="training-subhead opp-subhead">
      <div>
        <div class="eyebrow">Confronto</div>
        <h2>Matchup</h2>
        <p>H2H e piano partita specifico rispetto a ${escapeHtml(athlete.name)}.</p>
      </div>
      ${state.profiles.length ? `<select id="opp-matchup-select" class="opp-matchup-select">${state.profiles.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === ui.matchupProfileId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>` : ''}
    </section>
    ${profile ? renderMatchupProfile(profile, athlete) : '<section class="panel opp-empty"><h3>Nessun profilo disponibile</h3><p>Crea prima un opponent.</p></section>'}
  `;
}

function renderMatchupProfile(profile, athlete) {
  const h2h = h2hForProfile(profile);
  const plan = profile.matchPlan || {};
  const matches = [...h2h.matches].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return `
    <section class="opp-matchup-hero panel">
      <div>
        <span class="eyebrow">Head to head</span>
        <h3>${escapeHtml(athlete.name)} vs ${escapeHtml(profile.name)}</h3>
        <p>${escapeHtml([profile.fitpRanking, profile.category, profile.club].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="opp-h2h-score"><strong>${h2h.athleteWins}</strong><span>–</span><strong>${h2h.opponentWins}</strong></div>
    </section>
    <section class="opp-detail-columns">
      <article class="panel">
        <div class="panel-header"><h3>Precedenti</h3><p>Risultati registrati contro l’atleta corrente.</p></div>
        <div class="panel-body">
          ${matches.length ? matches.map(match => `<div class="opp-match-row"><span>${formatDate(match.date)}</span><strong>${match.result === 'L' ? 'V' : 'S'} ${escapeHtml(match.score || '')}</strong><small>${escapeHtml(match.tournament || '')}</small></div>`).join('') : '<div class="opp-inline-empty">Nessun H2H registrato.</div>'}
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><h3>Match plan</h3><p>Indicazioni operative per questa specifica avversaria.</p></div>
        <div class="panel-body opp-plan-summary">
          ${plan.objective ? `<div><span>Obiettivo</span><strong>${escapeHtml(plan.objective)}</strong></div>` : ''}
          ${plan.serve ? `<div><span>Servizio</span><p>${escapeHtml(plan.serve)}</p></div>` : ''}
          ${plan.return ? `<div><span>Risposta</span><p>${escapeHtml(plan.return)}</p></div>` : ''}
          ${plan.rally ? `<div><span>Rally</span><p>${escapeHtml(plan.rally)}</p></div>` : ''}
          ${plan.avoid ? `<div><span>Evita</span><p>${escapeHtml(plan.avoid)}</p></div>` : ''}
          ${plan.cue ? `<div><span>Cue</span><strong>${escapeHtml(plan.cue)}</strong></div>` : ''}
          ${!Object.values(plan).some(Boolean) ? '<div class="opp-inline-empty">Match plan non ancora compilato.</div>' : ''}
          ${canWrite() ? `<button class="button button-ghost" data-open-profile="${escapeAttr(profile.id)}" type="button">Apri profilo completo</button>` : ''}
        </div>
      </article>
    </section>
    <section class="panel opp-common-placeholder">
      <div><strong>Avversari comuni</strong><span>La struttura è predisposta; il confronto automatico si attiverà quando Competition condividerà lo storico match di ${escapeHtml(athlete.name)}.</span></div>
    </section>
  `;
}

function renderProfileDetail(profile) {
  const scouting = profile.scouting || {};
  const plan = profile.matchPlan || {};
  const history = [...(profile.matchHistory || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rankingHistory = [...(profile.rankingHistory || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return `
    <section class="opp-profile-detail" data-opponent-detail="${escapeAttr(profile.id)}">
      <div class="opp-detail-top">
        <button class="button button-ghost" id="opp-back-profiles" type="button">← Profiles</button>
        <div class="opp-detail-actions">
          <button class="button button-ghost" id="opp-toggle-watch" type="button">${profile.watchlisted ? '★ In watchlist' : '☆ Segui'}</button>
          ${canWrite() ? '<button class="button button-primary" id="opp-edit-profile" type="button">Modifica dati</button>' : ''}
        </div>
      </div>
      <section class="panel opp-profile-hero">
        <div class="opp-profile-avatar large">${escapeHtml(String(profile.name || '?').charAt(0).toUpperCase())}</div>
        <div>
          <div class="opp-profile-titleline"><h2>${escapeHtml(profile.name)}</h2>${sourceBadge(profile)}</div>
          <p>${escapeHtml([profile.fitpRanking, profile.category, profile.region, profile.club].filter(Boolean).join(' · ') || 'Dati competitivi da completare')}</p>
          <div class="opp-chip-row">
            ${profile.handedness ? `<span>${escapeHtml(profile.handedness)}</span>` : ''}
            ${profile.backhand ? `<span>Rovescio ${escapeHtml(profile.backhand)}</span>` : ''}
            ${profile.preferredSurface ? `<span>${escapeHtml(profile.preferredSurface)}</span>` : ''}
          </div>
        </div>
      </section>

      <section class="opp-detail-columns">
        <article class="panel">
          <div class="panel-header"><h3>Dati esterni</h3><p>Identità e riferimenti della fonte.</p></div>
          <div class="panel-body summary-list">
            <div class="summary-row"><span>TennisTalker ID</span><span>${escapeHtml(profile.source?.externalId || '—')}</span></div>
            <div class="summary-row"><span>FITP</span><span>${escapeHtml(profile.fitpRanking || '—')}</span></div>
            <div class="summary-row"><span>Punti</span><span>${escapeHtml(profile.fitpPoints || '—')}</span></div>
            <div class="summary-row"><span>Regione / Provincia</span><span>${escapeHtml([profile.region, profile.province].filter(Boolean).join(' · ') || '—')}</span></div>
            <div class="summary-row"><span>Ultimo controllo</span><span>${profile.source?.lastCheckedAt ? formatDate(profile.source.lastCheckedAt.slice(0, 10)) : '—'}</span></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><h3>Ranking history</h3><p>Posizione nelle snapshot archiviate.</p></div>
          <div class="panel-body opp-rank-history">
            ${rankingHistory.length ? rankingHistory.slice(0, 10).map(item => `<div><span>${formatDate(item.date)}</span><strong>#${escapeHtml(item.rank || '—')}</strong><small>${escapeHtml(item.fitpRanking || '')}</small></div>`).join('') : '<div class="opp-inline-empty">Nessuna cronologia ranking.</div>'}
          </div>
        </article>
      </section>

      <section class="panel">
        <div class="panel-header opp-panel-header-row"><div><h3>Storico match</h3><p>Risultati dell’opponent; W/L è dal suo punto di vista.</p></div>${canWrite() ? '<button class="button button-primary" id="opp-add-match" type="button">+ Match</button>' : ''}</div>
        <div class="opp-table-scroll">
          ${history.length ? `<table class="opp-table"><thead><tr><th>Data</th><th>Avversario</th><th>Esito</th><th>Score</th><th>Torneo</th><th>Superficie</th><th></th></tr></thead><tbody>${history.map(match => `<tr><td>${formatDate(match.date)}</td><td>${escapeHtml(match.againstAthlete ? athleteCompetition().name : match.opponentName || '—')}</td><td><strong>${escapeHtml(match.result || '—')}</strong></td><td>${escapeHtml(match.score || '—')}</td><td>${escapeHtml(match.tournament || '—')}</td><td>${escapeHtml(match.surface || '—')}</td><td>${canWrite() ? `<button class="opp-delete-link" data-delete-match="${escapeAttr(match.id)}" type="button">Elimina</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="opp-inline-empty padded">Nessun match registrato.</div>'}
        </div>
      </section>

      <section class="opp-detail-columns">
        <article class="panel">
          <div class="panel-header"><h3>Scouting TPOS</h3><p>Osservazioni nostre, separate dai dati importati.</p></div>
          <div class="panel-body opp-text-summary">
            ${scouting.style ? `<div><span>Stile</span><p>${escapeHtml(scouting.style)}</p></div>` : ''}
            ${scouting.serve ? `<div><span>Servizio</span><p>${escapeHtml(scouting.serve)}</p></div>` : ''}
            ${scouting.return ? `<div><span>Risposta</span><p>${escapeHtml(scouting.return)}</p></div>` : ''}
            ${scouting.forehand ? `<div><span>Dritto</span><p>${escapeHtml(scouting.forehand)}</p></div>` : ''}
            ${scouting.backhand ? `<div><span>Rovescio</span><p>${escapeHtml(scouting.backhand)}</p></div>` : ''}
            ${scouting.patterns ? `<div><span>Pattern</span><p>${escapeHtml(scouting.patterns)}</p></div>` : ''}
            ${scouting.weaknesses ? `<div><span>Vulnerabilità</span><p>${escapeHtml(scouting.weaknesses)}</p></div>` : ''}
            ${scouting.behavior ? `<div><span>Comportamento</span><p>${escapeHtml(scouting.behavior)}</p></div>` : ''}
            ${scouting.notes ? `<div><span>Note</span><p>${escapeHtml(scouting.notes)}</p></div>` : ''}
            ${!Object.values(scouting).some(Boolean) ? '<div class="opp-inline-empty">Scouting non ancora compilato.</div>' : ''}
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><h3>Match plan</h3><p>Piano partita rispetto all’atleta corrente.</p></div>
          <div class="panel-body opp-text-summary">
            ${plan.objective ? `<div><span>Obiettivo</span><p>${escapeHtml(plan.objective)}</p></div>` : ''}
            ${plan.serve ? `<div><span>Servizio</span><p>${escapeHtml(plan.serve)}</p></div>` : ''}
            ${plan.return ? `<div><span>Risposta</span><p>${escapeHtml(plan.return)}</p></div>` : ''}
            ${plan.rally ? `<div><span>Rally</span><p>${escapeHtml(plan.rally)}</p></div>` : ''}
            ${plan.avoid ? `<div><span>Evita</span><p>${escapeHtml(plan.avoid)}</p></div>` : ''}
            ${plan.cue ? `<div><span>Cue</span><p>${escapeHtml(plan.cue)}</p></div>` : ''}
            ${!Object.values(plan).some(Boolean) ? '<div class="opp-inline-empty">Match plan non ancora compilato.</div>' : ''}
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderOpponents() {
  if (route() !== 'opponents') return;
  const main = document.querySelector('#main-content');
  if (!main) return;

  const state = opponentsState();
  const selected = ui.selectedProfileId
    ? state.profiles.find(profile => profile.id === ui.selectedProfileId)
    : null;

  document.querySelector('#page-title').textContent = '6. Opponents';

  if (selected) {
    main.innerHTML = `<div data-opponents-root>${renderProfileDetail(selected)}</div>`;
    bindDetailEvents(selected);
    return;
  }

  const content = ui.section === 'watchlist'
    ? renderWatchlist(state)
    : ui.section === 'profiles'
      ? renderProfiles(state)
      : ui.section === 'matchup'
        ? renderMatchup(state)
        : renderRankings(state);

  main.innerHTML = `
    <div data-opponents-root>
      <section class="opp-head">
        <div>
          <div class="eyebrow">Scouting · Analisi · Preparazione</div>
          <h2>Opponents</h2>
          <p>Ranking di riferimento, profili avversari, storico, scouting e preparazione del match.</p>
        </div>
        <div class="opp-athlete-context">
          <span>${escapeHtml(athleteCompetition().category || 'Categoria non impostata')}</span>
          <strong>${escapeHtml(athleteCompetition().name)}</strong>
        </div>
      </section>
      <div class="opp-section-switch" role="tablist">
        ${SECTIONS.map(([id, label]) => `<button class="opp-section-button ${ui.section === id ? 'active' : ''}" data-opp-section="${id}" type="button">${label}</button>`).join('')}
      </div>
      <div class="opp-section-content">${content}</div>
    </div>
  `;

  bindCommonEvents();
}

function bindCommonEvents() {
  document.querySelectorAll('[data-opp-section]').forEach(button => {
    button.addEventListener('click', () => {
      ui.section = button.dataset.oppSection;
      ui.selectedProfileId = '';
      renderOpponents();
    });
  });

  document.querySelectorAll('[data-open-profile]').forEach(button => {
    button.addEventListener('click', () => {
      ui.selectedProfileId = button.dataset.openProfile;
      renderOpponents();
    });
  });

  document.querySelector('#opp-add-profile')?.addEventListener('click', () => openProfileDialog());
  document.querySelector('#opp-add-snapshot')?.addEventListener('click', openSnapshotDialog);
  document.querySelector('#opp-empty-add-snapshot')?.addEventListener('click', openSnapshotDialog);

  document.querySelector('#opp-rank-category')?.addEventListener('change', event => {
    ui.rankCategory = event.target.value;
    renderOpponents();
  });
  document.querySelector('#opp-rank-gender')?.addEventListener('change', event => {
    ui.rankGender = event.target.value;
    renderOpponents();
  });
  document.querySelector('#opp-rank-scope')?.addEventListener('change', event => {
    ui.rankScope = event.target.value;
    renderOpponents();
  });
  document.querySelector('#opp-matchup-select')?.addEventListener('change', event => {
    ui.matchupProfileId = event.target.value;
    renderOpponents();
  });

  document.querySelectorAll('[data-create-profile-from-rank]').forEach(button => {
    button.addEventListener('click', () => {
      createProfileFromRanking(button.dataset.snapshotId, button.dataset.createProfileFromRank);
    });
  });
}

function bindDetailEvents(profile) {
  document.querySelector('#opp-back-profiles')?.addEventListener('click', () => {
    ui.selectedProfileId = '';
    ui.section = 'profiles';
    renderOpponents();
  });

  document.querySelector('#opp-toggle-watch')?.addEventListener('click', () => {
    if (!canWrite()) return;
    store.update(state => {
      const target = state.opponents.profiles.find(item => item.id === profile.id);
      if (target) target.watchlisted = !target.watchlisted;
    });
    renderOpponents();
  });

  document.querySelector('#opp-edit-profile')?.addEventListener('click', () => openProfileDialog(profile));
  document.querySelector('#opp-add-match')?.addEventListener('click', () => openMatchDialog(profile));
  document.querySelectorAll('[data-delete-match]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!canWrite()) return;
      const confirmed = await showInAppConfirm('Eliminare questo match dallo storico?', {
        title: 'Elimina match', confirmLabel: 'Elimina', danger: true,
      });
      if (!confirmed) return;
      store.update(state => {
        const target = state.opponents.profiles.find(item => item.id === profile.id);
        if (target) target.matchHistory = (target.matchHistory || []).filter(match => match.id !== button.dataset.deleteMatch);
      });
      renderOpponents();
    });
  });
}

function openDialog(markup, id) {
  document.querySelector(`#${id}`)?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'planner-dialog opp-dialog';
  dialog.innerHTML = markup;
  document.body.appendChild(dialog);
  dialog.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
}

function openSnapshotDialog() {
  if (!canWrite()) return;
  const dialog = openDialog(`
    <form method="dialog" id="opp-snapshot-form">
      <div class="dialog-head"><div><div class="eyebrow">Ranking</div><h3>Nuova snapshot</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field"><label>Data</label><input name="date" type="date" value="${todayKey()}" required /></div>
          <div class="field"><label>Fonte</label><input name="source" value="TennisTalker" /></div>
          <div class="field"><label>Categoria</label><select name="category">${categoryOptions(ui.rankCategory || athleteCompetition().category || 'U12')}</select></div>
          <div class="field"><label>Sesso</label><select name="gender">${genderOptions(ui.rankGender || athleteCompetition().gender || 'F')}</select></div>
          <div class="field"><label>Ambito</label><select name="scope"><option>Italia</option><option>Regione</option><option>Provincia</option></select></div>
          <div class="field"><label>Regione / Provincia</label><input name="area" placeholder="opzionale" /></div>
          <div class="field full"><label>Top 50 — una riga per giocatore</label><textarea name="rows" rows="12" placeholder="1; Nome Cognome; 3.2; LAZ; Club; https://...\n2; Nome Cognome; 3.3; LOM; Club; https://..."></textarea><span class="training-field-hint">Formato: posizione ; nome ; classifica FITP ; regione ; club ; URL TennisTalker. Sono accettati anche tab come separatori.</span></div>
        </div>
      </div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva snapshot</button></div></div>
    </form>
  `, 'opp-snapshot-dialog');

  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const entries = parseRankingRows(data.rows);
    if (!entries.length) {
      await showInAppAlert('Inserisci almeno una riga valida nel ranking.', { title: 'Snapshot vuota' });
      return;
    }

    const snapshot = {
      id: makeId('ranking'),
      date: data.date,
      source: String(data.source || '').trim() || 'Manuale',
      category: data.category,
      gender: data.gender,
      scope: data.scope,
      area: String(data.area || '').trim(),
      createdAt: new Date().toISOString(),
      entries: entries.slice(0, 50),
    };

    store.update(state => {
      if (!state.opponents) state.opponents = normalizeOpponentsPayload({});
      state.opponents.rankings.snapshots.push(snapshot);
      updateProfilesFromSnapshot(state.opponents, snapshot);
    });

    ui.rankCategory = snapshot.category;
    ui.rankGender = snapshot.gender;
    ui.rankScope = snapshot.scope;
    dialog.close();
    renderOpponents();
  });
}

function parseRankingRows(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(';');
      const [rank, playerName, fitpRanking, region, club, externalUrl] = parts.map(part => String(part || '').trim());
      if (!playerName) return null;
      const url = externalUrl || '';
      const idMatch = url.match(/\/giocatore\/(\d+)/);
      return {
        id: makeId('rankrow'),
        rank: Number(rank) || index + 1,
        playerName,
        fitpRanking: fitpRanking || '',
        region: region || '',
        club: club || '',
        externalId: idMatch?.[1] || '',
        externalUrl: url,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

function updateProfilesFromSnapshot(opponents, snapshot) {
  for (const entry of snapshot.entries) {
    const profile = profileMatchForEntry(opponents, entry);
    if (!profile) continue;

    profile.fitpRanking = entry.fitpRanking || profile.fitpRanking || '';
    profile.region = entry.region || profile.region || '';
    profile.club = entry.club || profile.club || '';
    profile.category = snapshot.category || profile.category || '';
    profile.gender = snapshot.gender || profile.gender || '';
    profile.source = {
      ...(profile.source || {}),
      provider: snapshot.source || profile.source?.provider || '',
      externalId: entry.externalId || profile.source?.externalId || '',
      url: entry.externalUrl || profile.source?.url || '',
      lastCheckedAt: new Date().toISOString(),
    };
    profile.rankingHistory = Array.isArray(profile.rankingHistory) ? profile.rankingHistory : [];
    const existing = profile.rankingHistory.find(item => item.snapshotId === snapshot.id);
    if (!existing) {
      profile.rankingHistory.push({
        snapshotId: snapshot.id,
        date: snapshot.date,
        rank: entry.rank,
        fitpRanking: entry.fitpRanking || '',
        source: snapshot.source || '',
      });
    }
    profile.updatedAt = new Date().toISOString();
  }
}

function createProfileFromRanking(snapshotId, entryId) {
  if (!canWrite()) return;
  const state = opponentsState();
  const snapshot = state.rankings.snapshots.find(item => item.id === snapshotId);
  const entry = snapshot?.entries?.find(item => item.id === entryId);
  if (!snapshot || !entry) return;

  const existing = profileMatchForEntry(state, entry);
  if (existing) {
    ui.selectedProfileId = existing.id;
    renderOpponents();
    return;
  }

  const profile = baseProfile({
    name: entry.playerName,
    category: snapshot.category,
    gender: snapshot.gender,
    fitpRanking: entry.fitpRanking,
    region: entry.region,
    club: entry.club,
    source: {
      provider: snapshot.source || 'TennisTalker',
      externalId: entry.externalId || '',
      url: entry.externalUrl || '',
      importedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    },
    rankingHistory: [{
      snapshotId: snapshot.id,
      date: snapshot.date,
      rank: entry.rank,
      fitpRanking: entry.fitpRanking || '',
      source: snapshot.source || '',
    }],
  });

  store.update(storeState => {
    if (!storeState.opponents) storeState.opponents = normalizeOpponentsPayload({});
    storeState.opponents.profiles.push(profile);
  });
  ui.selectedProfileId = profile.id;
  renderOpponents();
}

function baseProfile(overrides = {}) {
  return {
    id: makeId('opponent'),
    name: '',
    birthYear: '',
    category: athleteCompetition().category || '',
    gender: athleteCompetition().gender || 'F',
    nationality: 'ITA',
    region: '',
    province: '',
    club: '',
    fitpRanking: '',
    fitpPoints: '',
    handedness: '',
    backhand: '',
    preferredSurface: '',
    watchlisted: false,
    source: {
      provider: '', externalId: '', url: '', importedAt: '', lastCheckedAt: '',
    },
    rankingHistory: [],
    matchHistory: [],
    scouting: {
      style: '', serve: '', return: '', forehand: '', backhand: '', movement: '', patterns: '', weaknesses: '', behavior: '', notes: '',
    },
    matchPlan: {
      objective: '', serve: '', return: '', rally: '', avoid: '', cue: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function openProfileDialog(profile = null) {
  if (!canWrite()) return;
  const value = profile ? clone(profile) : baseProfile();
  const scouting = value.scouting || {};
  const plan = value.matchPlan || {};
  const dialog = openDialog(`
    <form method="dialog" id="opp-profile-form">
      <div class="dialog-head"><div><div class="eyebrow">Opponent profile</div><h3>${profile ? 'Modifica opponent' : 'Nuovo opponent'}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body opp-profile-form-body">
        <div class="opp-form-section"><h4>Identità e dati competitivi</h4><div class="form-grid">
          <div class="field full"><label>Nome e cognome</label><input name="name" value="${escapeAttr(value.name)}" required /></div>
          <div class="field"><label>Anno nascita</label><input name="birthYear" type="number" min="1990" max="2030" value="${escapeAttr(value.birthYear)}" /></div>
          <div class="field"><label>Categoria</label><select name="category">${categoryOptions(value.category)}</select></div>
          <div class="field"><label>Sesso</label><select name="gender">${genderOptions(value.gender)}</select></div>
          <div class="field"><label>Nazionalità</label><input name="nationality" value="${escapeAttr(value.nationality)}" /></div>
          <div class="field"><label>Classifica FITP</label><input name="fitpRanking" value="${escapeAttr(value.fitpRanking)}" /></div>
          <div class="field"><label>Punti FITP</label><input name="fitpPoints" value="${escapeAttr(value.fitpPoints)}" /></div>
          <div class="field"><label>Regione</label><input name="region" value="${escapeAttr(value.region)}" /></div>
          <div class="field"><label>Provincia</label><input name="province" value="${escapeAttr(value.province)}" /></div>
          <div class="field full"><label>Club</label><input name="club" value="${escapeAttr(value.club)}" /></div>
          <div class="field"><label>Mano</label><input name="handedness" value="${escapeAttr(value.handedness)}" placeholder="Destra / Sinistra" /></div>
          <div class="field"><label>Rovescio</label><input name="backhand" value="${escapeAttr(value.backhand)}" placeholder="Una mano / Due mani" /></div>
          <div class="field"><label>Superficie preferita</label><input name="preferredSurface" value="${escapeAttr(value.preferredSurface)}" /></div>
        </div></div>
        <div class="opp-form-section"><h4>Fonte TennisTalker</h4><div class="form-grid">
          <div class="field"><label>ID TennisTalker</label><input name="sourceExternalId" value="${escapeAttr(value.source?.externalId)}" /></div>
          <div class="field full"><label>URL profilo</label><input name="sourceUrl" type="url" value="${escapeAttr(value.source?.url)}" placeholder="https://www.tennistalker.it/giocatore/..." /></div>
        </div></div>
        <div class="opp-form-section"><h4>Scouting Tennis Player OS</h4><div class="form-grid">
          <div class="field full"><label>Stile di gioco</label><textarea name="scoutingStyle">${escapeHtml(scouting.style)}</textarea></div>
          <div class="field"><label>Servizio</label><textarea name="scoutingServe">${escapeHtml(scouting.serve)}</textarea></div>
          <div class="field"><label>Risposta</label><textarea name="scoutingReturn">${escapeHtml(scouting.return)}</textarea></div>
          <div class="field"><label>Dritto</label><textarea name="scoutingForehand">${escapeHtml(scouting.forehand)}</textarea></div>
          <div class="field"><label>Rovescio</label><textarea name="scoutingBackhand">${escapeHtml(scouting.backhand)}</textarea></div>
          <div class="field"><label>Movimento</label><textarea name="scoutingMovement">${escapeHtml(scouting.movement)}</textarea></div>
          <div class="field"><label>Pattern</label><textarea name="scoutingPatterns">${escapeHtml(scouting.patterns)}</textarea></div>
          <div class="field"><label>Vulnerabilità</label><textarea name="scoutingWeaknesses">${escapeHtml(scouting.weaknesses)}</textarea></div>
          <div class="field"><label>Comportamento / pressione</label><textarea name="scoutingBehavior">${escapeHtml(scouting.behavior)}</textarea></div>
          <div class="field full"><label>Note libere</label><textarea name="scoutingNotes">${escapeHtml(scouting.notes)}</textarea></div>
        </div></div>
        <div class="opp-form-section"><h4>Match plan</h4><div class="form-grid">
          <div class="field full"><label>Obiettivo</label><input name="planObjective" value="${escapeAttr(plan.objective)}" /></div>
          <div class="field"><label>Servizio</label><textarea name="planServe">${escapeHtml(plan.serve)}</textarea></div>
          <div class="field"><label>Risposta</label><textarea name="planReturn">${escapeHtml(plan.return)}</textarea></div>
          <div class="field"><label>Rally</label><textarea name="planRally">${escapeHtml(plan.rally)}</textarea></div>
          <div class="field"><label>Evita</label><textarea name="planAvoid">${escapeHtml(plan.avoid)}</textarea></div>
          <div class="field full"><label>Cue per l’atleta</label><input name="planCue" value="${escapeAttr(plan.cue)}" /></div>
        </div></div>
      </div>
      <div class="dialog-actions"><div>${profile ? '<button class="button button-danger-ghost" id="opp-delete-profile" type="button">Elimina opponent</button>' : ''}</div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva profilo</button></div></div>
    </form>
  `, 'opp-profile-dialog');

  const form = dialog.querySelector('form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();
    const id = profile?.id || value.id;
    const record = {
      ...value,
      id,
      name: data.name.trim(),
      birthYear: data.birthYear,
      category: data.category,
      gender: data.gender,
      nationality: data.nationality.trim(),
      fitpRanking: data.fitpRanking.trim(),
      fitpPoints: data.fitpPoints.trim(),
      region: data.region.trim(),
      province: data.province.trim(),
      club: data.club.trim(),
      handedness: data.handedness.trim(),
      backhand: data.backhand.trim(),
      preferredSurface: data.preferredSurface.trim(),
      source: {
        ...(value.source || {}),
        provider: (data.sourceExternalId || data.sourceUrl) ? 'TennisTalker' : '',
        externalId: data.sourceExternalId.trim(),
        url: data.sourceUrl.trim(),
        importedAt: value.source?.importedAt || ((data.sourceExternalId || data.sourceUrl) ? now : ''),
        lastCheckedAt: value.source?.lastCheckedAt || '',
      },
      scouting: {
        style: data.scoutingStyle.trim(), serve: data.scoutingServe.trim(), return: data.scoutingReturn.trim(), forehand: data.scoutingForehand.trim(), backhand: data.scoutingBackhand.trim(), movement: data.scoutingMovement.trim(), patterns: data.scoutingPatterns.trim(), weaknesses: data.scoutingWeaknesses.trim(), behavior: data.scoutingBehavior.trim(), notes: data.scoutingNotes.trim(),
      },
      matchPlan: {
        objective: data.planObjective.trim(), serve: data.planServe.trim(), return: data.planReturn.trim(), rally: data.planRally.trim(), avoid: data.planAvoid.trim(), cue: data.planCue.trim(),
      },
      updatedAt: now,
    };

    store.update(state => {
      if (!state.opponents) state.opponents = normalizeOpponentsPayload({});
      const index = state.opponents.profiles.findIndex(item => item.id === id);
      if (index >= 0) state.opponents.profiles[index] = record;
      else state.opponents.profiles.push(record);
    });
    ui.selectedProfileId = id;
    dialog.close();
    renderOpponents();
  });

  dialog.querySelector('#opp-delete-profile')?.addEventListener('click', async () => {
    const confirmed = await showInAppConfirm(`Eliminare il profilo di “${profile.name}”?`, {
      title: 'Elimina opponent', confirmLabel: 'Elimina', danger: true,
    });
    if (!confirmed) return;
    store.update(state => {
      state.opponents.profiles = state.opponents.profiles.filter(item => item.id !== profile.id);
    });
    ui.selectedProfileId = '';
    dialog.close();
    renderOpponents();
  });
}

function openMatchDialog(profile) {
  if (!canWrite()) return;
  const athlete = athleteCompetition();
  const dialog = openDialog(`
    <form method="dialog" id="opp-match-form">
      <div class="dialog-head"><div><div class="eyebrow">Storico match</div><h3>Nuovo match di ${escapeHtml(profile.name)}</h3></div><button class="dialog-close" type="button" data-dialog-close>×</button></div>
      <div class="dialog-body"><div class="form-grid">
        <div class="field"><label>Data</label><input name="date" type="date" value="${todayKey()}" required /></div>
        <div class="field"><label>Esito per ${escapeHtml(profile.name)}</label><select name="result"><option value="W">W</option><option value="L">L</option></select></div>
        <div class="field full"><label><input name="againstAthlete" type="checkbox" /> Match contro ${escapeHtml(athlete.name)}</label></div>
        <div class="field full"><label>Avversario</label><input name="opponentName" placeholder="lascia vuoto se è ${escapeAttr(athlete.name)}" /></div>
        <div class="field"><label>Score</label><input name="score" placeholder="6-3 4-6 10-7" /></div>
        <div class="field"><label>Superficie</label><input name="surface" placeholder="Terra, Hard..." /></div>
        <div class="field full"><label>Torneo</label><input name="tournament" /></div>
        <div class="field full"><label>Note</label><textarea name="notes"></textarea></div>
      </div></div>
      <div class="dialog-actions"><div></div><div class="dialog-save-actions"><button class="button button-ghost" type="button" data-dialog-close>Annulla</button><button class="button button-primary" type="submit">Salva match</button></div></div>
    </form>
  `, 'opp-match-dialog');

  const form = dialog.querySelector('form');
  const checkbox = form.elements.againstAthlete;
  checkbox.addEventListener('change', () => {
    form.elements.opponentName.disabled = checkbox.checked;
    if (checkbox.checked) form.elements.opponentName.value = '';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const record = {
      id: makeId('match'),
      date: data.date,
      result: data.result,
      againstAthlete: checkbox.checked,
      opponentName: checkbox.checked ? athlete.name : String(data.opponentName || '').trim(),
      score: String(data.score || '').trim(),
      surface: String(data.surface || '').trim(),
      tournament: String(data.tournament || '').trim(),
      notes: String(data.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    store.update(state => {
      const target = state.opponents.profiles.find(item => item.id === profile.id);
      if (!target) return;
      target.matchHistory = Array.isArray(target.matchHistory) ? target.matchHistory : [];
      target.matchHistory.push(record);
      target.updatedAt = new Date().toISOString();
    });
    dialog.close();
    renderOpponents();
  });
}

await setupCloud();

const main = document.querySelector('#main-content');
if (main) {
  const observer = new MutationObserver(() => {
    if (route() === 'opponents' && !main.querySelector('[data-opponents-root]')) {
      window.queueMicrotask(renderOpponents);
    }
  });
  observer.observe(main, { childList: true, subtree: true });
}

window.addEventListener('hashchange', () => {
  if (route() === 'opponents') {
    ui.selectedProfileId = '';
    if (cloudReady) setCloudStatus({ status: canWrite() ? 'synced' : 'readonly' });
    window.queueMicrotask(renderOpponents);
  }
});

if (route() === 'opponents') renderOpponents();
