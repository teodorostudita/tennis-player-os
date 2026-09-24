
import { canWriteModule, getCurrentAccess } from '../cloud/access.js';
import { normalizeOpponentsPayload } from '../cloud/opponentsCloud.js';
import { store } from '../data/store.js';

const MAILBOX_ID = 'tpos-companion-mailbox';
const MAX_RANKING = 50;

let currentImportId = '';
const processedImportIds = new Set();

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function normalizePlayer(player, index) {
  const name = clean(player?.name);
  if (!name) return null;

  return {
    id: makeId('rankrow'),
    rank: Number(player?.rank) || index + 1,
    playerName: name,
    fitpRanking: clean(player?.fitpRanking),
    region: clean(player?.region),
    province: clean(player?.province),
    club: clean(player?.club),
    externalId: clean(player?.externalId),
    externalUrl: clean(player?.url),
    detectedCategory: clean(player?.category).toUpperCase(),
  };
}

function normalizePlayers(players = []) {
  const map = new Map();

  (Array.isArray(players) ? players : []).forEach((player, index) => {
    const item = normalizePlayer(player, index);
    if (!item) return;

    const key = item.externalId
      ? `id:${item.externalId}`
      : item.externalUrl
        ? `url:${item.externalUrl}`
        : `name:${item.playerName.toLocaleLowerCase('it-IT')}`;

    const current = map.get(key);
    if (!current || item.rank < current.rank) map.set(key, item);
  });

  return [...map.values()].sort((a, b) => a.rank - b.rank);
}

function profileMatchForEntry(opponents, entry) {
  const name = clean(entry.playerName).toLocaleLowerCase('it-IT');

  return (opponents.profiles || []).find(profile =>
    (entry.externalId && profile.source?.externalId === entry.externalId)
    || (entry.externalUrl && profile.source?.url === entry.externalUrl)
    || (name && clean(profile.name).toLocaleLowerCase('it-IT') === name)
  ) || null;
}

function updateProfilesFromSnapshot(opponents, snapshot) {
  const now = new Date().toISOString();

  for (const entry of snapshot.entries) {
    const profile = profileMatchForEntry(opponents, entry);
    if (!profile) continue;

    profile.fitpRanking = entry.fitpRanking || profile.fitpRanking || '';
    profile.region = entry.region || profile.region || '';
    profile.province = entry.province || profile.province || '';
    profile.club = entry.club || profile.club || '';
    profile.category = snapshot.category || profile.category || '';
    profile.gender = snapshot.gender || profile.gender || '';

    profile.source = {
      ...(profile.source || {}),
      provider: 'TennisTalker',
      externalId: entry.externalId || profile.source?.externalId || '',
      url: entry.externalUrl || profile.source?.url || '',
      lastCheckedAt: now,
    };

    profile.rankingHistory = Array.isArray(profile.rankingHistory)
      ? profile.rankingHistory
      : [];

    if (!profile.rankingHistory.some(item => item.snapshotId === snapshot.id)) {
      profile.rankingHistory.push({
        snapshotId: snapshot.id,
        date: snapshot.date,
        rank: entry.rank,
        fitpRanking: entry.fitpRanking || '',
        source: 'TennisTalker',
      });
    }

    profile.updatedAt = now;
  }
}

function mailbox() {
  return document.getElementById(MAILBOX_ID);
}

function readMailboxPayload() {
  const box = mailbox();
  if (!box || box.dataset.status !== 'pending') return null;

  try {
    const payload = JSON.parse(box.textContent || '');
    if (!payload?.importId) return null;

    const kind = payload.kind
      || (Array.isArray(payload.players) ? 'ranking' : '');

    const validRanking = (
      kind === 'ranking'
      && Array.isArray(payload.players)
      && payload.players.length
    );

    const validProfile = (
      kind === 'profile'
      && payload.profile
      && payload.profile.externalId
    );

    if (!validRanking && !validProfile) return null;

    return {
      ...payload,
      kind,
    };
  } catch (error) {
    console.warn('TPOS Companion mailbox payload non valido.', error);
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
    payload = null;
  }

  if (payload?.importId !== importId) return;

  box.dataset.status = 'finished';
  box.dataset.outcome = outcome;
  box.dataset.finishedAt = new Date().toISOString();
}

function categoryOptions(selected) {
  return ['U10','U12','U14','U16','U18','Open'].map(value =>
    `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`
  ).join('');
}

function genderOptions(selected) {
  return `
    <option value="F" ${selected === 'F' ? 'selected' : ''}>Femminile</option>
    <option value="M" ${selected === 'M' ? 'selected' : ''}>Maschile</option>
  `;
}

function closeExistingDialog(outcome = 'replaced') {
  const existing = document.querySelector('#opp-companion-import-dialog');
  if (!existing) return;

  if (currentImportId) {
    finishMailbox(currentImportId, outcome);
    processedImportIds.add(currentImportId);
  }

  currentImportId = '';
  existing.close();
}

async function waitUntilAppReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const access = getCurrentAccess();

    if (
      access.athleteId
      && route() === 'opponents'
      && document.querySelector('[data-opponents-root]')
    ) {
      return access;
    }

    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return getCurrentAccess();
}

async function openRankingImportDialog(payload) {
  if (
    currentImportId === payload.importId
    || processedImportIds.has(payload.importId)
  ) {
    return;
  }

  currentImportId = payload.importId;

  const access = await waitUntilAppReady();

  if (!access.athleteId || route() !== 'opponents') {
    currentImportId = '';
    return;
  }

  if (!canWriteModule('opponents')) {
    finishMailbox(payload.importId, 'readonly');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    return;
  }

  const players = normalizePlayers(payload.players);
  if (!players.length) {
    finishMailbox(payload.importId, 'empty');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    return;
  }

  closeExistingDialog();

  currentImportId = payload.importId;

  const athlete = store.getState().athlete || {};
  const categories = [...new Set(players.map(p => p.detectedCategory).filter(Boolean))];

  const category = categories.length === 1
    ? categories[0]
    : clean(athlete.competitionCategory) || 'U12';

  const gender = clean(athlete.competitionGender) || 'F';
  const preview = players.slice(0, MAX_RANKING);

  const dialog = document.createElement('dialog');
  dialog.id = 'opp-companion-import-dialog';
  dialog.className = 'planner-dialog opp-dialog';

  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">TennisTalker → Tennis Player OS</div>
          <h3>Importa ranking</h3>
        </div>
        <button class="dialog-close" type="button" data-companion-cancel>×</button>
      </div>

      <div class="dialog-body">
        <div class="auth-message success" style="margin-bottom:14px">
          Ricevuti <strong>${players.length}</strong> giocatori dal Companion.
          Verranno salvate le prime <strong>${Math.min(MAX_RANKING, preview.length)}</strong> posizioni.
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Data snapshot</label>
            <input name="date" type="date" value="${todayKey()}" required />
          </div>
          <div class="field">
            <label>Categoria</label>
            <select name="category">${categoryOptions(category)}</select>
          </div>
          <div class="field">
            <label>Sesso</label>
            <select name="gender">${genderOptions(gender)}</select>
          </div>
          <div class="field">
            <label>Ambito</label>
            <select name="scope">
              <option selected>Italia</option>
              <option>Regione</option>
              <option>Provincia</option>
            </select>
          </div>
          <div class="field full">
            <label>Regione / Provincia</label>
            <input name="area" placeholder="Lascia vuoto per Italia" />
          </div>
        </div>

        <div class="opp-table-scroll" style="margin-top:14px;max-height:330px">
          <table class="opp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Giocatrice</th>
                <th>FITP</th>
                <th>Area</th>
                <th>Club</th>
              </tr>
            </thead>
            <tbody>
              ${preview.map(player => `
                <tr>
                  <td class="opp-rank-number">${escapeHtml(player.rank)}</td>
                  <td>
                    <strong>${escapeHtml(player.playerName)}</strong>
                    ${player.externalId ? `<small style="display:block">TT #${escapeHtml(player.externalId)}</small>` : ''}
                  </td>
                  <td>${escapeHtml(player.fitpRanking || '—')}</td>
                  <td>${escapeHtml([player.region, player.province].filter(Boolean).join(' · ') || '—')}</td>
                  <td>${escapeHtml(player.club || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <p class="training-field-hint" style="margin-top:10px">
          I profili Opponent già esistenti con lo stesso ID/link TennisTalker vengono aggiornati.
          Scouting, storico personalizzato e match plan non vengono toccati.
        </p>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-companion-cancel>Annulla</button>
          <button class="button button-primary" type="submit">Importa Top 50</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const cancel = () => {
    finishMailbox(payload.importId, 'cancelled');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    dialog.close();
  };

  dialog.querySelectorAll('[data-companion-cancel]').forEach(button => {
    button.addEventListener('click', cancel);
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancel();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    const filtered = players
      .filter(player =>
        !player.detectedCategory
        || !data.category
        || player.detectedCategory === data.category
      )
      .slice(0, MAX_RANKING);

    if (!filtered.length) return;

    const snapshot = {
      id: makeId('ranking'),
      date: data.date,
      source: 'TennisTalker',
      sourceMode: 'companion',
      sourceUrl: clean(payload.sourceUrl),
      category: data.category,
      gender: data.gender,
      scope: data.scope,
      area: clean(data.area),
      createdAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
      companionImportId: payload.importId,
      entries: filtered.map(player => ({
        id: player.id,
        rank: player.rank,
        playerName: player.playerName,
        fitpRanking: player.fitpRanking,
        region: player.region,
        province: player.province,
        club: player.club,
        externalId: player.externalId,
        externalUrl: player.externalUrl,
      })),
    };

    store.update(state => {
      if (!state.opponents) {
        state.opponents = normalizeOpponentsPayload({});
      }

      state.opponents = normalizeOpponentsPayload(state.opponents);

      if (
        state.opponents.rankings.snapshots.some(
          item => item.companionImportId === payload.importId
        )
      ) {
        return;
      }

      state.opponents.rankings.snapshots.push(snapshot);
      updateProfilesFromSnapshot(state.opponents, snapshot);
      state.meta.opponentsCompanionImportedAt = new Date().toISOString();
    });

    finishMailbox(payload.importId, 'imported');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    dialog.close();

    window.dispatchEvent(new Event('hashchange'));
  });

  dialog.showModal();
}


function defaultOpponentProfile(overrides = {}) {
  const athlete = store.getState().athlete || {};

  return {
    id: makeId('opponent'),
    name: '',
    birthYear: '',
    category: clean(athlete.competitionCategory),
    gender: clean(athlete.competitionGender) || 'F',
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
      provider: '',
      externalId: '',
      url: '',
      importedAt: '',
      lastCheckedAt: '',
    },
    rankingHistory: [],
    matchHistory: [],
    scouting: {
      style: '',
      serve: '',
      return: '',
      forehand: '',
      backhand: '',
      movement: '',
      patterns: '',
      weaknesses: '',
      behavior: '',
      notes: '',
    },
    matchPlan: {
      objective: '',
      serve: '',
      return: '',
      rally: '',
      avoid: '',
      cue: '',
    },
    externalData: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function profileMatchForExternal(opponents, incoming) {
  const externalId = clean(incoming.externalId);
  const externalUrl = clean(incoming.externalUrl);
  const name = clean(incoming.name).toLocaleLowerCase('it-IT');

  return (opponents.profiles || []).find(profile =>
    (externalId && profile.source?.externalId === externalId)
    || (externalUrl && profile.source?.url === externalUrl)
    || (name && clean(profile.name).toLocaleLowerCase('it-IT') === name)
  ) || null;
}

function rankingHistoryForExternal(opponents, externalId, externalUrl, name) {
  const normalizedName = clean(name).toLocaleLowerCase('it-IT');
  const history = [];

  for (const snapshot of opponents.rankings?.snapshots || []) {
    const entry = (snapshot.entries || []).find(item =>
      (externalId && item.externalId === externalId)
      || (externalUrl && item.externalUrl === externalUrl)
      || (
        normalizedName
        && clean(item.playerName).toLocaleLowerCase('it-IT') === normalizedName
      )
    );

    if (!entry) continue;

    history.push({
      snapshotId: snapshot.id,
      date: snapshot.date,
      rank: entry.rank,
      fitpRanking: entry.fitpRanking || '',
      source: snapshot.source || 'TennisTalker',
    });
  }

  return history.sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || ''))
  );
}

function genderForExternal(opponents, incoming, existing = null) {
  if (existing?.gender) return existing.gender;

  for (const snapshot of opponents.rankings?.snapshots || []) {
    const match = (snapshot.entries || []).some(entry =>
      (incoming.externalId && entry.externalId === incoming.externalId)
      || (incoming.externalUrl && entry.externalUrl === incoming.externalUrl)
    );

    if (match && snapshot.gender) return snapshot.gender;
  }

  return clean(store.getState().athlete?.competitionGender) || 'F';
}

function normalizeIncomingProfile(raw = {}) {
  return {
    externalId: clean(raw.externalId),
    externalUrl: clean(raw.externalUrl),
    name: clean(raw.name),
    fitpRanking: clean(raw.fitpRanking),
    fitpPoints: clean(raw.fitpPoints),
    category: clean(raw.category).toUpperCase(),
    club: clean(raw.club),
    region: clean(raw.region),
    province: clean(raw.province),
    handedness: clean(raw.handedness),
    backhand: clean(raw.backhand),
    preferredSurface: clean(raw.preferredSurface),
    stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
    equipment: raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {},
    strengths: raw.strengths && typeof raw.strengths === 'object' ? raw.strengths : {},
  };
}

async function openProfileImportDialog(payload) {
  if (
    currentImportId === payload.importId
    || processedImportIds.has(payload.importId)
  ) {
    return;
  }

  currentImportId = payload.importId;

  const access = await waitUntilAppReady();

  if (!access.athleteId || route() !== 'opponents') {
    currentImportId = '';
    return;
  }

  if (!canWriteModule('opponents')) {
    finishMailbox(payload.importId, 'readonly');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    return;
  }

  const incoming = normalizeIncomingProfile(payload.profile);
  if (!incoming.externalId || !incoming.name) {
    finishMailbox(payload.importId, 'empty');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    return;
  }

  closeExistingDialog();
  currentImportId = payload.importId;

  const opponents = normalizeOpponentsPayload(store.getState().opponents);
  const existing = profileMatchForExternal(opponents, incoming);
  const mode = existing ? 'update' : 'create';

  const optionalNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const winLoss = [
    optionalNumber(incoming.stats?.wins),
    optionalNumber(incoming.stats?.losses),
  ];

  const strengthLabels = {
    forehand: 'Dritto',
    backhand: 'Rovescio',
    serve: 'Servizio',
    volley: 'Volée',
    physical: 'Tenuta fisica',
    mental: 'Tenuta mentale',
  };

  const strengthRows = Object.entries(incoming.strengths || {})
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => `
      <div class="summary-row">
        <span>${escapeHtml(strengthLabels[key] || key)}</span>
        <span>${escapeHtml(`${value}%`)}</span>
      </div>
    `).join('');

  const dialog = document.createElement('dialog');
  dialog.id = 'opp-companion-import-dialog';
  dialog.className = 'planner-dialog opp-dialog';

  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">TennisTalker → Tennis Player OS</div>
          <h3>${mode === 'update' ? 'Aggiorna opponent' : 'Crea opponent'}</h3>
        </div>
        <button class="dialog-close" type="button" data-companion-cancel>×</button>
      </div>

      <div class="dialog-body">
        <div class="auth-message success" style="margin-bottom:14px">
          ${mode === 'update'
            ? `Trovato il profilo TPOS di <strong>${escapeHtml(existing.name)}</strong>. I dati esterni verranno aggiornati senza toccare scouting, match plan o storico manuale.`
            : `Nuovo opponent rilevato: <strong>${escapeHtml(incoming.name)}</strong>.`}
        </div>

        <div class="form-grid">
          <div class="field full">
            <label>Nome</label>
            <input name="name" value="${escapeHtml(incoming.name)}" required />
          </div>
          <div class="field">
            <label>Categoria</label>
            <input name="category" value="${escapeHtml(incoming.category)}" />
          </div>
          <div class="field">
            <label>Classifica FITP</label>
            <input name="fitpRanking" value="${escapeHtml(incoming.fitpRanking)}" />
          </div>
          <div class="field">
            <label>Punti FITP</label>
            <input name="fitpPoints" value="${escapeHtml(incoming.fitpPoints)}" />
          </div>
          <div class="field">
            <label>Regione</label>
            <input name="region" value="${escapeHtml(incoming.region)}" />
          </div>
          <div class="field">
            <label>Provincia</label>
            <input name="province" value="${escapeHtml(incoming.province)}" />
          </div>
          <div class="field full">
            <label>Club</label>
            <input name="club" value="${escapeHtml(incoming.club)}" />
          </div>
          <div class="field">
            <label>Mano</label>
            <input name="handedness" value="${escapeHtml(incoming.handedness)}" />
          </div>
          <div class="field">
            <label>Rovescio</label>
            <input name="backhand" value="${escapeHtml(incoming.backhand)}" />
          </div>
          <div class="field">
            <label>Superficie preferita</label>
            <input name="preferredSurface" value="${escapeHtml(incoming.preferredSurface)}" />
          </div>
        </div>

        <section class="panel" style="margin-top:14px">
          <div class="panel-header">
            <h3>Dati TennisTalker</h3>
            <p>Informazioni esterne conservate separatamente dallo scouting TPOS.</p>
          </div>
          <div class="panel-body summary-list">
            <div class="summary-row"><span>TennisTalker ID</span><span>${escapeHtml(incoming.externalId)}</span></div>
            <div class="summary-row"><span>W / L</span><span>${
              winLoss[0] !== null || winLoss[1] !== null
                ? `${winLoss[0] ?? '—'} / ${winLoss[1] ?? '—'}`
                : '—'
            }</span></div>
            <div class="summary-row"><span>Win rate</span><span>${escapeHtml(incoming.stats?.winRate || '—')}</span></div>
            <div class="summary-row"><span>Massima classifica</span><span>${escapeHtml(incoming.stats?.bestRanking || '—')}</span></div>
            <div class="summary-row"><span>Brand racchetta</span><span>${escapeHtml(incoming.equipment?.racketBrand || '—')}</span></div>
            <div class="summary-row"><span>Brand scarpe</span><span>${escapeHtml(incoming.equipment?.shoeBrand || '—')}</span></div>
            ${strengthRows}
          </div>
        </section>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-companion-cancel>Annulla</button>
          <button class="button button-primary" type="submit">
            ${mode === 'update' ? 'Aggiorna profilo' : 'Crea profilo'}
          </button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const cancel = () => {
    finishMailbox(payload.importId, 'cancelled');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    dialog.close();
  };

  dialog.querySelectorAll('[data-companion-cancel]').forEach(button => {
    button.addEventListener('click', cancel);
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancel();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const now = new Date().toISOString();

    store.update(state => {
      if (!state.opponents) {
        state.opponents = normalizeOpponentsPayload({});
      }

      state.opponents = normalizeOpponentsPayload(state.opponents);

      const current = profileMatchForExternal(state.opponents, incoming);
      const gender = genderForExternal(state.opponents, incoming, current);

      if (current) {
        current.name = current.name || clean(data.name);
        current.category = clean(data.category) || current.category || '';
        current.gender = gender;
        current.fitpRanking = clean(data.fitpRanking) || current.fitpRanking || '';
        current.fitpPoints = clean(data.fitpPoints) || current.fitpPoints || '';
        current.region = clean(data.region) || current.region || '';
        current.province = clean(data.province) || current.province || '';
        current.club = clean(data.club) || current.club || '';
        current.handedness = clean(data.handedness) || current.handedness || '';
        current.backhand = clean(data.backhand) || current.backhand || '';
        current.preferredSurface = clean(data.preferredSurface) || current.preferredSurface || '';

        current.source = {
          ...(current.source || {}),
          provider: 'TennisTalker',
          externalId: incoming.externalId,
          url: incoming.externalUrl,
          importedAt: current.source?.importedAt || now,
          lastCheckedAt: now,
        };

        current.externalData = {
          ...(current.externalData || {}),
          tennisTalker: {
            stats: incoming.stats,
            equipment: incoming.equipment,
            strengths: incoming.strengths,
            importedAt: now,
            sourceUrl: incoming.externalUrl,
          },
        };

        current.updatedAt = now;
      } else {
        const history = rankingHistoryForExternal(
          state.opponents,
          incoming.externalId,
          incoming.externalUrl,
          incoming.name,
        );

        state.opponents.profiles.push(defaultOpponentProfile({
          name: clean(data.name),
          category: clean(data.category),
          gender,
          fitpRanking: clean(data.fitpRanking),
          fitpPoints: clean(data.fitpPoints),
          region: clean(data.region),
          province: clean(data.province),
          club: clean(data.club),
          handedness: clean(data.handedness),
          backhand: clean(data.backhand),
          preferredSurface: clean(data.preferredSurface),
          source: {
            provider: 'TennisTalker',
            externalId: incoming.externalId,
            url: incoming.externalUrl,
            importedAt: now,
            lastCheckedAt: now,
          },
          rankingHistory: history,
          externalData: {
            tennisTalker: {
              stats: incoming.stats,
              equipment: incoming.equipment,
              strengths: incoming.strengths,
              importedAt: now,
              sourceUrl: incoming.externalUrl,
            },
          },
          createdAt: now,
          updatedAt: now,
        }));
      }

      state.meta.opponentsCompanionProfileImportedAt = now;
    });

    finishMailbox(payload.importId, mode === 'update' ? 'updated' : 'created');
    processedImportIds.add(payload.importId);
    currentImportId = '';
    dialog.close();

    window.dispatchEvent(new Event('hashchange'));
  });

  dialog.showModal();
}

function checkMailbox() {
  const payload = readMailboxPayload();
  if (!payload) return;

  if (
    payload.importId === currentImportId
    || processedImportIds.has(payload.importId)
  ) {
    return;
  }

  if (payload.kind === 'profile') {
    void openProfileImportDialog(payload);
    return;
  }

  void openRankingImportDialog(payload);
}

const observer = new MutationObserver(() => {
  checkMailbox();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['data-status'],
});

window.setInterval(checkMailbox, 500);
window.addEventListener('hashchange', () => {
  window.setTimeout(checkMailbox, 50);
  window.setTimeout(checkMailbox, 500);
});

checkMailbox();
