
import { canWriteModule, getCurrentAccess } from '../cloud/access.js';
import { normalizeOpponentsPayload } from '../cloud/opponentsCloud.js';
import { store } from '../data/store.js';

const EXTENSION_SOURCE = 'TPOS_COMPANION_EXTENSION';
const WEBAPP_SOURCE = 'TPOS_WEBAPP';
const MESSAGE_TYPE = 'TENNISTALKER_RANKING_IMPORT';
const READY_TYPE = 'TPOS_COMPANION_BRIDGE_READY';
const FINISHED_TYPE = 'TPOS_COMPANION_IMPORT_FINISHED';
const MAX_RANKING = 50;

let currentImportId = '';

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

async function waitUntilReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const access = getCurrentAccess();
    if (access.athleteId && route() === 'opponents') return access;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  return getCurrentAccess();
}

function postToCompanion(type, extra = {}) {
  window.postMessage({
    source: WEBAPP_SOURCE,
    type,
    ...extra,
  }, location.origin);
}

function announceReady() {
  postToCompanion(READY_TYPE, {
    route: route(),
    at: new Date().toISOString(),
  });
}

function sendFinished(importId, outcome) {
  postToCompanion(FINISHED_TYPE, { importId, outcome });
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

function closeExistingDialog() {
  const existing = document.querySelector('#opp-companion-import-dialog');
  if (!existing) return;
  if (currentImportId) sendFinished(currentImportId, 'replaced');
  currentImportId = '';
  existing.close();
}

async function openImportDialog(payload) {
  const access = await waitUntilReady();

  if (!access.athleteId || route() !== 'opponents') {
    announceReady();
    return;
  }

  if (!canWriteModule('opponents')) {
    sendFinished(payload.importId, 'readonly');
    return;
  }

  const players = normalizePlayers(payload.players);
  if (!players.length) {
    sendFinished(payload.importId, 'empty');
    return;
  }

  closeExistingDialog();

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
  currentImportId = payload.importId;

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
          <div class="field"><label>Data snapshot</label><input name="date" type="date" value="${todayKey()}" required /></div>
          <div class="field"><label>Categoria</label><select name="category">${categoryOptions(category)}</select></div>
          <div class="field"><label>Sesso</label><select name="gender">${genderOptions(gender)}</select></div>
          <div class="field"><label>Ambito</label><select name="scope"><option selected>Italia</option><option>Regione</option><option>Provincia</option></select></div>
          <div class="field full"><label>Regione / Provincia</label><input name="area" placeholder="Lascia vuoto per Italia" /></div>
        </div>

        <div class="opp-table-scroll" style="margin-top:14px;max-height:330px">
          <table class="opp-table">
            <thead><tr><th>#</th><th>Giocatrice</th><th>FITP</th><th>Area</th><th>Club</th></tr></thead>
            <tbody>
              ${preview.map(player => `
                <tr>
                  <td class="opp-rank-number">${escapeHtml(player.rank)}</td>
                  <td><strong>${escapeHtml(player.playerName)}</strong>${player.externalId ? `<small style="display:block">TT #${escapeHtml(player.externalId)}</small>` : ''}</td>
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
    sendFinished(payload.importId, 'cancelled');
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
      .filter(player => !player.detectedCategory || !data.category || player.detectedCategory === data.category)
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
      if (!state.opponents) state.opponents = normalizeOpponentsPayload({});
      state.opponents = normalizeOpponentsPayload(state.opponents);

      if (state.opponents.rankings.snapshots.some(item => item.companionImportId === payload.importId)) {
        return;
      }

      state.opponents.rankings.snapshots.push(snapshot);
      updateProfilesFromSnapshot(state.opponents, snapshot);
      state.meta.opponentsCompanionImportedAt = new Date().toISOString();
    });

    sendFinished(payload.importId, 'imported');
    currentImportId = '';
    dialog.close();
    window.dispatchEvent(new Event('hashchange'));
  });

  dialog.showModal();
}

window.addEventListener('message', event => {
  if (event.source !== window) return;

  const message = event.data;
  if (
    message?.source !== EXTENSION_SOURCE
    || message?.type !== MESSAGE_TYPE
    || !message?.payload?.importId
  ) return;

  void openImportDialog(message.payload);
});

window.addEventListener('hashchange', () => {
  window.setTimeout(announceReady, 50);
});

announceReady();
window.setTimeout(announceReady, 500);
window.setTimeout(announceReady, 1500);
