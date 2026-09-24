import { normalizeOpponentsPayload } from '../cloud/opponentsCloud.js';
import { store } from '../data/store.js';
import { showInAppAlert } from './inAppMessages.js';

const TENNISTALKER_RANKINGS_URL = 'https://www.tennistalker.it/classifiche';
const MAX_IMPORT = 50;

function route() {
  return location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function cleanText(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function selectedFilters() {
  const athlete = store.getState().athlete || {};
  return {
    category: document.querySelector('#opp-rank-category')?.value
      || athlete.competitionCategory
      || 'U12',
    gender: document.querySelector('#opp-rank-gender')?.value
      || athlete.competitionGender
      || 'F',
    scope: document.querySelector('#opp-rank-scope')?.value || 'Italia',
  };
}

function normalizeExternalUrl(href = '') {
  const value = String(href || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value, TENNISTALKER_RANKINGS_URL);
    if (!/(^|\.)tennistalker\.it$/i.test(url.hostname)) return '';
    if (!/^\/(?:giocatore|utente)\/\d+\/?$/i.test(url.pathname)) return '';
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

function externalIdFromUrl(url = '') {
  return String(url).match(/\/(?:giocatore|utente)\/(\d+)/i)?.[1] || '';
}

function parsePlayerText(rawText, {
  fallbackRank = 0,
  externalUrl = '',
  expectedCategory = '',
} = {}) {
  let text = cleanText(rawText);
  if (!text) return null;

  const rankMatch = text.match(/#\s*(\d{1,4})\b/);
  const rank = Number(rankMatch?.[1] || fallbackRank || 0);
  if (rankMatch) text = cleanText(text.replace(rankMatch[0], ' '));

  const head = text.match(/\b([1-4]\.(?:NC|[1-9]))\s*(U(?:08|10|12|14|16|18)|NOR|NOF|O\d{2})?\b/i);
  if (!head) return null;

  const fitpRanking = String(head[1] || '').toUpperCase();
  const detectedCategory = String(head[2] || '').toUpperCase();
  const category = detectedCategory || String(expectedCategory || '').toUpperCase();

  let rest = cleanText(text.slice((head.index || 0) + head[0].length));
  if (!rest) return null;

  let playerName = '';
  let region = '';
  let province = '';
  let club = '';

  const fullTail = rest.match(/^(.+?)\s+([A-Z]{3})\s*\(([A-Z]{2})\)\s*(?:-\s*(.*))?$/);
  if (fullTail) {
    playerName = cleanText(fullTail[1]);
    region = String(fullTail[2] || '').toUpperCase();
    province = String(fullTail[3] || '').toUpperCase();
    club = cleanText(fullTail[4] || '');
  } else {
    const regionTail = rest.match(/^(.+?)\s+([A-Z]{3})\s*(?:-\s*(.*))?$/);
    if (regionTail) {
      playerName = cleanText(regionTail[1]);
      region = String(regionTail[2] || '').toUpperCase();
      club = cleanText(regionTail[3] || '');
    } else {
      playerName = rest;
    }
  }

  if (!playerName) return null;

  const url = normalizeExternalUrl(externalUrl);

  return {
    id: makeId('rankrow'),
    rank,
    playerName,
    fitpRanking,
    region,
    province,
    club,
    externalId: externalIdFromUrl(url),
    externalUrl: url,
    detectedCategory: category,
  };
}

function nearestRank(anchor) {
  let node = anchor;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const match = cleanText(node.textContent).match(/#\s*(\d{1,4})\b/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function parseHtmlSelection(html, filters) {
  if (!html) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = [
    ...doc.querySelectorAll('a[href*="/giocatore/"], a[href*="/utente/"]'),
  ];

  const entries = [];
  const seen = new Set();

  anchors.forEach((anchor, index) => {
    const url = normalizeExternalUrl(anchor.getAttribute('href') || anchor.href || '');
    if (!url || seen.has(url)) return;

    const fallbackRank = nearestRank(anchor) || index + 1;
    const candidates = [
      cleanText(anchor.textContent),
      cleanText(anchor.parentElement?.textContent),
      cleanText(anchor.parentElement?.parentElement?.textContent),
    ].filter(Boolean);

    let parsed = null;
    for (const candidate of candidates) {
      parsed = parsePlayerText(candidate, {
        fallbackRank,
        externalUrl: url,
        expectedCategory: filters.category,
      });
      if (parsed) break;
    }

    if (!parsed) return;
    seen.add(url);
    entries.push(parsed);
  });

  return entries;
}

function parseDelimitedLine(line, index, filters) {
  const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : '';
  if (!separator) return null;

  const parts = line.split(separator).map(part => cleanText(part));
  if (parts.length < 2) return null;

  const [rank, playerName, fitpRanking, region, club, externalUrl] = parts;
  if (!playerName) return null;

  const url = normalizeExternalUrl(externalUrl);
  return {
    id: makeId('rankrow'),
    rank: Number(rank) || index + 1,
    playerName,
    fitpRanking: fitpRanking || '',
    region: region || '',
    province: '',
    club: club || '',
    externalId: externalIdFromUrl(url),
    externalUrl: url,
    detectedCategory: filters.category,
  };
}

function parsePlainText(text, filters) {
  const normalized = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/(?=#\s*\d{1,4}\b)/g, '\n');

  const lines = normalized
    .split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean);

  const entries = [];
  let pendingRank = 0;

  lines.forEach((line, index) => {
    const onlyRank = line.match(/^#\s*(\d{1,4})$/);
    if (onlyRank) {
      pendingRank = Number(onlyRank[1]);
      return;
    }

    const delimited = parseDelimitedLine(line, index, filters);
    if (delimited) {
      entries.push(delimited);
      pendingRank = 0;
      return;
    }

    const rankInLine = line.match(/#\s*(\d{1,4})\b/);
    const parsed = parsePlayerText(line, {
      fallbackRank: Number(rankInLine?.[1] || pendingRank || entries.length + 1),
      expectedCategory: filters.category,
    });

    if (parsed) {
      entries.push(parsed);
      pendingRank = 0;
    }
  });

  return entries;
}

function filterAndNormalizeEntries(entries, filters) {
  const map = new Map();

  entries.forEach((entry, index) => {
    if (!entry?.playerName) return;

    const detected = String(entry.detectedCategory || '').toUpperCase();
    const expected = String(filters.category || '').toUpperCase();

    if (detected && expected && detected !== expected) return;

    const key = entry.externalId
      ? `id:${entry.externalId}`
      : entry.externalUrl
        ? `url:${entry.externalUrl}`
        : `name:${cleanText(entry.playerName).toLocaleLowerCase('it-IT')}`;

    const rank = Number(entry.rank) || index + 1;
    const normalized = {
      ...entry,
      rank,
      detectedCategory: detected || expected,
    };

    const current = map.get(key);
    if (!current || rank < Number(current.rank || 9999)) {
      map.set(key, normalized);
    }
  });

  return [...map.values()]
    .sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999))
    .slice(0, MAX_IMPORT);
}

function parseClipboardPayload({ html = '', text = '', filters }) {
  const fromHtml = parseHtmlSelection(html, filters);
  const fromText = parsePlainText(text, filters);

  return filterAndNormalizeEntries(
    fromHtml.length ? [...fromHtml, ...fromText] : fromText,
    filters,
  );
}

function profileMatchForEntry(opponents, entry) {
  const url = String(entry.externalUrl || '').trim();
  const externalId = String(entry.externalId || '').trim();
  const name = cleanText(entry.playerName).toLocaleLowerCase('it-IT');

  return (opponents.profiles || []).find(profile =>
    (url && profile.source?.url === url)
    || (externalId && profile.source?.externalId === externalId)
    || (name && cleanText(profile.name).toLocaleLowerCase('it-IT') === name)
  ) || null;
}

function updateProfilesFromSnapshot(opponents, snapshot) {
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
      lastCheckedAt: new Date().toISOString(),
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

    profile.updatedAt = new Date().toISOString();
  }
}

function openImportDialog() {
  document.querySelector('#opp-tennistalker-import-dialog')?.remove();

  const filters = selectedFilters();
  const dialog = document.createElement('dialog');
  dialog.id = 'opp-tennistalker-import-dialog';
  dialog.className = 'planner-dialog opp-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="opp-tennistalker-import-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">Opponents · Rankings</div>
          <h3>Importa da TennisTalker</h3>
        </div>
        <button class="dialog-close" type="button" data-dialog-close aria-label="Chiudi">×</button>
      </div>

      <div class="dialog-body">
        <div class="training-inline-note" style="margin-bottom:14px">
          <strong>Importazione assistita.</strong>
          TPOS non riceve né salva le credenziali TennisTalker.
          Apri la pagina Classifiche nel tuo browser, applica i filtri, seleziona i risultati e copiali.
          Puoi incollare più pagine una dopo l’altra: i giocatori vengono accumulati fino a 50.
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Data snapshot</label>
            <input name="date" type="date" value="${todayKey()}" required />
          </div>

          <div class="field">
            <label>Categoria</label>
            <select name="category">
              ${['U10','U12','U14','U16','U18','Open'].map(value =>
                `<option value="${value}" ${filters.category === value ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>

          <div class="field">
            <label>Sesso</label>
            <select name="gender">
              <option value="F" ${filters.gender === 'F' ? 'selected' : ''}>Femminile</option>
              <option value="M" ${filters.gender === 'M' ? 'selected' : ''}>Maschile</option>
            </select>
          </div>

          <div class="field">
            <label>Ambito</label>
            <select name="scope">
              ${['Italia','Regione','Provincia'].map(value =>
                `<option value="${value}" ${filters.scope === value ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>

          <div class="field full">
            <label>Regione / Provincia</label>
            <input name="area" placeholder="Lascia vuoto per Italia; es. Lazio o Roma" />
          </div>

          <div class="field full">
            <label>1. Apri TennisTalker</label>
            <a
              class="button button-ghost"
              href="${TENNISTALKER_RANKINGS_URL}"
              target="_blank"
              rel="noopener noreferrer"
              style="display:inline-flex;width:max-content;text-decoration:none"
            >Apri pagina Classifiche ↗</a>
            <span class="training-field-hint">
              Imposta su TennisTalker gli stessi filtri indicati qui sopra e usa la classifica reale.
            </span>
          </div>

          <div class="field full">
            <label>2. Copia i risultati e incollali qui</label>
            <textarea
              id="opp-tt-paste"
              rows="8"
              placeholder="Copia le righe del ranking da TennisTalker e incollale qui. Ogni nuovo incolla viene aggiunto ai precedenti."
            ></textarea>
            <span class="training-field-hint">
              Se il browser fornisce anche l’HTML copiato, TPOS recupera automaticamente link e ID TennisTalker.
            </span>
          </div>
        </div>

        <div id="opp-tt-import-status" class="auth-message" role="status" aria-live="polite"></div>

        <div id="opp-tt-preview" class="opp-table-scroll" style="margin-top:12px"></div>

        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button class="button button-ghost" id="opp-tt-clear" type="button">Azzera importazione</button>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-dialog-close>Annulla</button>
          <button class="button button-primary" id="opp-tt-save" type="submit" disabled>Salva snapshot</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const form = dialog.querySelector('form');
  const pasteBox = dialog.querySelector('#opp-tt-paste');
  const status = dialog.querySelector('#opp-tt-import-status');
  const preview = dialog.querySelector('#opp-tt-preview');
  const saveButton = dialog.querySelector('#opp-tt-save');
  let accumulated = [];

  const liveFilters = () => ({
    category: form.elements.category.value,
    gender: form.elements.gender.value,
    scope: form.elements.scope.value,
  });

  const mergeEntries = entries => {
    accumulated = filterAndNormalizeEntries(
      [...accumulated, ...entries],
      liveFilters(),
    );
  };

  const refreshPreview = (lastAdded = 0) => {
    saveButton.disabled = accumulated.length === 0;

    if (!accumulated.length) {
      status.textContent = 'Nessun giocatore acquisito.';
      status.className = 'auth-message';
      preview.innerHTML = '';
      return;
    }

    status.textContent = `${accumulated.length} giocatori acquisiti${lastAdded ? ` · +${lastAdded} dall’ultimo incolla` : ''}.`;
    status.className = 'auth-message success';

    preview.innerHTML = `
      <table class="opp-table">
        <thead>
          <tr><th>#</th><th>Giocatore</th><th>FITP</th><th>Area</th><th>Link</th></tr>
        </thead>
        <tbody>
          ${accumulated.slice(0, 8).map(entry => `
            <tr>
              <td>${escapeHtml(entry.rank || '—')}</td>
              <td><strong>${escapeHtml(entry.playerName)}</strong></td>
              <td>${escapeHtml(entry.fitpRanking || '—')}</td>
              <td>${escapeHtml([entry.region, entry.province].filter(Boolean).join(' · ') || '—')}</td>
              <td>${entry.externalUrl ? '✓' : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${accumulated.length > 8
        ? `<div class="training-field-hint" style="padding:8px 2px">Anteprima dei primi 8 su ${accumulated.length}.</div>`
        : ''}
    `;
  };

  pasteBox.addEventListener('paste', event => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    event.preventDefault();

    const html = clipboard.getData('text/html') || '';
    const text = clipboard.getData('text/plain') || '';
    pasteBox.value = text;

    const parsed = parseClipboardPayload({
      html,
      text,
      filters: liveFilters(),
    });

    const before = accumulated.length;
    mergeEntries(parsed);
    refreshPreview(Math.max(0, accumulated.length - before));
  });

  form.querySelectorAll('select[name="category"], select[name="gender"], select[name="scope"]').forEach(select => {
    select.addEventListener('change', () => {
      if (accumulated.length) {
        accumulated = filterAndNormalizeEntries(accumulated, liveFilters());
        refreshPreview();
      }
    });
  });

  dialog.querySelector('#opp-tt-clear').addEventListener('click', () => {
    accumulated = [];
    pasteBox.value = '';
    refreshPreview();
  });

  dialog.querySelectorAll('[data-dialog-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!accumulated.length) {
      await showInAppAlert(
        'Non ho riconosciuto giocatori da importare. Copia le righe della classifica TennisTalker e incollale nel riquadro.',
        { title: 'Importazione vuota' },
      );
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const entries = filterAndNormalizeEntries(accumulated, liveFilters()).slice(0, MAX_IMPORT);

    const snapshot = {
      id: makeId('ranking'),
      date: data.date,
      source: 'TennisTalker',
      sourceMode: 'assisted-copy',
      sourceUrl: TENNISTALKER_RANKINGS_URL,
      category: data.category,
      gender: data.gender,
      scope: data.scope,
      area: cleanText(data.area),
      createdAt: new Date().toISOString(),
      entries: entries.map(entry => ({
        id: entry.id || makeId('rankrow'),
        rank: entry.rank,
        playerName: entry.playerName,
        fitpRanking: entry.fitpRanking || '',
        region: entry.region || '',
        province: entry.province || '',
        club: entry.club || '',
        externalId: entry.externalId || '',
        externalUrl: entry.externalUrl || '',
      })),
    };

    store.update(state => {
      if (!state.opponents) {
        state.opponents = normalizeOpponentsPayload({});
      }
      state.opponents = normalizeOpponentsPayload(state.opponents);
      state.opponents.rankings.snapshots.push(snapshot);
      updateProfilesFromSnapshot(state.opponents, snapshot);
      state.meta.opponentsTennisTalkerImportedAt = new Date().toISOString();
    });

    dialog.close();

    // opponentsUI owns rendering; reuse its existing hashchange handler.
    window.dispatchEvent(new Event('hashchange'));
  });

  refreshPreview();
  dialog.showModal();
  requestAnimationFrame(() => pasteBox.focus());
}

function injectImportButton() {
  if (route() !== 'opponents') return;
  if (document.querySelector('#opp-import-tennistalker')) return;

  const anchor = document.querySelector('#opp-add-snapshot')
    || document.querySelector('#opp-empty-add-snapshot');

  if (!anchor) return;

  const button = document.createElement('button');
  button.id = 'opp-import-tennistalker';
  button.type = 'button';
  button.className = 'button button-ghost';
  button.textContent = 'Importa TennisTalker';
  button.title = 'Importa una classifica copiandola dalla pagina Classifiche di TennisTalker.';
  button.addEventListener('click', openImportDialog);

  anchor.insertAdjacentElement('beforebegin', button);
}

const main = document.querySelector('#main-content');
if (main) {
  const observer = new MutationObserver(() => {
    if (route() === 'opponents') {
      window.queueMicrotask(injectImportButton);
    }
  });

  observer.observe(main, { childList: true, subtree: true });
}

window.addEventListener('hashchange', () => {
  if (route() === 'opponents') {
    window.queueMicrotask(injectImportButton);
  }
});

window.queueMicrotask(injectImportButton);
