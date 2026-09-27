import '../bootstrap.js';

import { modules } from '../data/schema.js';
import { store } from '../data/store.js';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../cloud/access.js';
import {
  MONITORING_STARTER_METRICS,
  RTP_CHECKLIST,
  SCREENING_STARTER_PROTOCOLS,
  loadHealthModule,
  normalizeHealthPayload,
  startHealthSync,
} from '../cloud/healthCloud.js';
import {
  showInAppAlert,
  showInAppConfirm,
} from './inAppMessages.js';


const BODY_AREA_SUGGESTIONS = [
  'Testa / collo',
  'Cervicale',
  'Spalla',
  'Scapola',
  'Braccio',
  'Bicipite',
  'Tricipite',
  'Gomito',
  'Avambraccio',
  'Polso',
  'Mano / dita',
  'Torace / pettorale',
  'Coste / intercostali',
  'Addome',
  'Schiena / dorsale',
  'Lombare',
  'Anca',
  'Inguine',
  'Gluteo',
  'Adduttori',
  'Coscia anteriore / quadricipite',
  'Coscia posteriore / hamstring',
  'Ginocchio',
  'Polpaccio',
  'Tibia / gamba',
  'Caviglia',
  'Tendine d’Achille',
  'Piede / dita',
];

const LEGACY_BODY_AREA_LABELS = {
  'head-neck': 'Testa / collo',
  shoulder: 'Spalla',
  'upper-arm': 'Braccio',
  elbow: 'Gomito',
  forearm: 'Avambraccio',
  'wrist-hand': 'Polso / mano',
  back: 'Schiena',
  'hip-groin': 'Anca / inguine',
  thigh: 'Coscia',
  knee: 'Ginocchio',
  'lower-leg': 'Gamba',
  ankle: 'Caviglia',
  foot: 'Piede',
};

const BODY_MAP_AREAS = {
  'head-neck': 'Testa / collo',
  shoulder: 'Spalla / scapola',
  chest: 'Torace / pettorale',
  'ribs-intercostal': 'Coste / intercostali',
  abdomen: 'Addome',
  'upper-arm': 'Braccio',
  elbow: 'Gomito',
  forearm: 'Avambraccio',
  'wrist-hand': 'Polso / mano',
  back: 'Schiena / lombare',
  'hip-groin': 'Anca / inguine',
  glute: 'Gluteo',
  thigh: 'Coscia',
  knee: 'Ginocchio',
  calf: 'Polpaccio',
  'lower-leg': 'Tibia / gamba',
  'ankle-achilles': 'Caviglia / Achille',
  foot: 'Piede',
};

const SIDES = {
  none: '—',
  right: 'Destra',
  left: 'Sinistra',
  bilateral: 'Bilaterale',
};

const INJURY_STATUSES = {
  active: 'Attivo',
  improving: 'In miglioramento',
  rtp: 'Return to play',
  resolved: 'Risolto',
  recurrence: 'Recidiva',
};

const ONSET_TYPES = {
  acute: 'Acuto',
  progressive: 'Progressivo / sovraccarico',
  recurrence: 'Recidiva',
};

const RESTRICTIONS = {
  none: 'Nessuna',
  modified: 'Allenamento modificato',
  'no-serve': 'No servizio / overhead',
  'no-tennis': 'No tennis',
  'no-athletics': 'No athletics',
  custom: 'Personalizzata',
};

const RTP_STAGES = {
  protection: 'Protection',
  modified: 'Modified training',
  'tennis-load': 'Tennis-specific loading',
  full: 'Full training',
  competition: 'Competition',
};

const MONITORING_SOURCES = [
  'Manual',
  'Fitbit',
  'Garmin',
  'Apple Health',
  'Whoop',
  'Polar',
  'Oura',
  'Altro',
];

const BODY_MAP_POINTS = {
  'head-neck': { view: 'front', x: 66, y: 38 },
  shoulder: { view: 'front', x: 51, y: 78 },
  chest: { view: 'front', x: 66, y: 96 },
  'ribs-intercostal': { view: 'front', x: 66, y: 114 },
  abdomen: { view: 'front', x: 66, y: 133 },
  'upper-arm': { view: 'front', x: 43, y: 110 },
  elbow: { view: 'front', x: 37, y: 140 },
  forearm: { view: 'front', x: 34, y: 167 },
  'wrist-hand': { view: 'front', x: 33, y: 192 },
  'hip-groin': { view: 'front', x: 66, y: 171 },
  thigh: { view: 'front', x: 59, y: 215 },
  knee: { view: 'front', x: 59, y: 247 },
  calf: { view: 'back', x: 173, y: 278 },
  'lower-leg': { view: 'front', x: 57, y: 281 },
  'ankle-achilles': { view: 'back', x: 173, y: 303 },
  foot: { view: 'front', x: 54, y: 321 },
  back: { view: 'back', x: 174, y: 112 },
  glute: { view: 'back', x: 174, y: 173 },
};

let section = 'overview';
let cloudState = {
  athleteId: '',
  loaded: false,
  stop: null,
  error: '',
};
let enhancementQueued = false;

function route() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function todayKey() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uid(prefix = 'item') {
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

function formatValue(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number);

  return unit ? `${formatted} ${unit}` : formatted;
}

function bodyAreaLabel(value) {
  const raw = String(value || '').trim();
  return LEGACY_BODY_AREA_LABELS[raw] || raw || '—';
}

function inferBodyMapArea(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';
  if (BODY_MAP_AREAS[raw]) return raw;

  const label = bodyAreaLabel(raw).toLocaleLowerCase('it');

  if (/testa|collo|cervic/.test(label)) return 'head-neck';
  if (/spalla|scapol/.test(label)) return 'shoulder';
  if (/intercost|costol|coste|costale/.test(label)) return 'ribs-intercostal';
  if (/torace|pettoral|petto/.test(label)) return 'chest';
  if (/addom/.test(label)) return 'abdomen';
  if (/schiena|dorsal|lombar/.test(label)) return 'back';
  if (/avambraccio/.test(label)) return 'forearm';
  if (/gomito/.test(label)) return 'elbow';
  if (/polso|mano|dita/.test(label)) return 'wrist-hand';
  if (/braccio|bicipit|tricipit/.test(label)) return 'upper-arm';
  if (/glute/.test(label)) return 'glute';
  if (/anca|inguine|addutt/.test(label)) return 'hip-groin';
  if (/ginocchio/.test(label)) return 'knee';
  if (/polpaccio|gastrocnem|soleo/.test(label)) return 'calf';
  if (/caviglia|achille/.test(label)) return 'ankle-achilles';
  if (/piede/.test(label)) return 'foot';
  if (/tibia|gamba/.test(label)) return 'lower-leg';
  if (/coscia|quadricip|hamstring|ischiocrural/.test(label)) return 'thigh';

  return '';
}

function mapAreaLabel(value) {
  return BODY_MAP_AREAS[value] || 'Non posizionato';
}

function applyModuleMetadata() {
  const health = modules.find(item => item.id === 'health');

  if (!health) return;

  health.name = 'Body & Health';
  health.subtitle = 'Injuries · Physio · Screening · Monitoring';
  health.description = 'Stato fisico dell’atleta, infortuni, fisioterapia, certificazione sportiva, screening periodici e monitoraggio fisiologico.';
}

function patchVisibleMetadata() {
  const health = modules.find(item => item.id === 'health');
  if (!health) return;

  document.querySelectorAll('[data-route="health"] .nav-label').forEach(node => {
    node.textContent = `${health.number}. ${health.name}`;
  });

  const dashboardButton = document.querySelector('.module-card [data-route="health"]');
  const card = dashboardButton?.closest('.module-card');

  if (!card) return;

  const h4 = card.querySelector('h4');
  const subtitle = card.querySelector('.module-top p strong');
  const paragraphs = card.querySelectorAll(':scope > div > p');

  if (h4) h4.textContent = health.name;
  if (subtitle) subtitle.textContent = health.subtitle;

  if (paragraphs.length) {
    paragraphs[paragraphs.length - 1].textContent = health.description;
  }
}

function setCloudIndicator(status, message = '') {
  if (route() !== 'health') return;

  const indicator = document.querySelector('#save-indicator');
  if (!indicator) return;

  if (status === 'syncing') {
    indicator.textContent = 'Body & Health → cloud…';
    indicator.title = 'Sincronizzazione Body & Health con Supabase in corso.';
  } else if (status === 'error') {
    indicator.textContent = 'Body & Health · cache locale';
    indicator.title = message || 'Sincronizzazione cloud non disponibile.';
  } else if (status === 'readonly') {
    indicator.textContent = 'Body & Health cloud · sola lettura';
    indicator.title = 'Questo account può leggere il modulo ma non modificarlo.';
  } else {
    indicator.textContent = 'Body & Health cloud ✓';
    indicator.title = 'Body & Health sincronizzato con Supabase.';
  }
}

async function ensureCloud() {
  const access = getCurrentAccess();
  const athleteId = String(access.athleteId || '');

  if (!athleteId || !canReadModule('health')) return;

  if (cloudState.loaded && cloudState.athleteId === athleteId) {
    setCloudIndicator(canWriteModule('health') ? 'synced' : 'readonly');
    return;
  }

  cloudState.stop?.();
  cloudState.stop = null;
  cloudState.loaded = false;
  cloudState.athleteId = athleteId;

  const result = await loadHealthModule({
    store,
    athleteId,
  });

  cloudState.loaded = true;
  cloudState.error = result.cloudError?.message || '';

  if (canWriteModule('health')) {
    cloudState.stop = startHealthSync({
      store,
      athleteId,
      onStatus: ({ status, message }) => {
        setCloudIndicator(status, message);
      },
    });

    setCloudIndicator(
      result.cloudError ? 'error' : 'synced',
      cloudState.error,
    );
  } else {
    setCloudIndicator('readonly');
  }
}

function activeContentHost() {
  const contentButton = document.querySelector(
    '.module-workspace-button[data-module-workspace="content"].active',
  );

  if (!contentButton) return null;

  return document.querySelector('#module-workspace-host');
}

function readOnlyNote() {
  if (canWriteModule('health')) return '';

  return `
    <div class="access-info health-readonly">
      Body & Health è disponibile in sola lettura per questo account.
    </div>
  `;
}

function internalTabs() {
  const items = [
    ['overview', 'Overview'],
    ['injuries', 'Injuries'],
    ['physio', 'Physio'],
    ['screening', 'Screening'],
    ['monitoring', 'Monitoring'],
  ];

  return `
    <div class="health-section-switch" role="tablist">
      ${items.map(([id, label]) => `
        <button
          class="health-section-button ${section === id ? 'active' : ''}"
          type="button"
          data-health-section="${id}"
        >${escapeHtml(label)}</button>
      `).join('')}
    </div>
  `;
}

function certificateStatus(certificate) {
  const expiry = certificate?.expiryDate;
  if (!expiry) {
    return {
      label: 'Scadenza non impostata',
      tone: 'neutral',
      days: null,
    };
  }

  const [year, month, day] = expiry.split('-').map(Number);
  if (!year || !month || !day) {
    return {
      label: 'Data non valida',
      tone: 'neutral',
      days: null,
    };
  }

  const target = new Date(year, month - 1, day);
  target.setHours(12, 0, 0, 0);

  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const days = Math.ceil((target - now) / 86400000);

  if (days < 0) {
    return {
      label: `Scaduto da ${Math.abs(days)} gg`,
      tone: 'danger',
      days,
    };
  }

  if (days <= 30) {
    return {
      label: `Scade tra ${days} gg`,
      tone: 'warning',
      days,
    };
  }

  return {
    label: `Valido · ${days} gg`,
    tone: 'ok',
    days,
  };
}

function activeInjuries(health) {
  return health.injuries.filter(item => item.status !== 'resolved');
}

function restrictionSummary(health) {
  const rows = [];

  for (const injury of activeInjuries(health)) {
    if (injury.restrictionLevel !== 'none' || injury.restrictions) {
      rows.push({
        source: injury.diagnosis || bodyAreaLabel(injury.bodyArea),
        text: injury.restrictions
          || RESTRICTIONS[injury.restrictionLevel]
          || injury.restrictionLevel,
      });
    }
  }

  if (health.physio.restrictions) {
    rows.push({
      source: 'Physio',
      text: health.physio.restrictions,
    });
  }

  return rows;
}

function overallStatus(health) {
  const injuries = activeInjuries(health);
  const restrictions = restrictionSummary(health);
  const certificate = certificateStatus(health.certificate);

  if (
    certificate.tone === 'danger'
    || injuries.some(item => ['no-tennis', 'no-athletics'].includes(item.restrictionLevel))
  ) {
    return {
      label: 'Limitazione',
      tone: 'danger',
      copy: 'È presente almeno una condizione che richiede una limitazione o un adempimento.',
    };
  }

  if (injuries.length || restrictions.length || certificate.tone === 'warning') {
    return {
      label: 'Attenzione',
      tone: 'warning',
      copy: 'Ci sono elementi da monitorare, ma non necessariamente uno stop completo.',
    };
  }

  return {
    label: 'OK',
    tone: 'ok',
    copy: 'Nessuna criticità attiva registrata.',
  };
}

function renderModule(host) {
  const health = normalizeHealthPayload(store.getState().health);

  host.innerHTML = `
    <section class="health-module-head">
      <div>
        <div class="eyebrow">Body & Health</div>
        <h2>Stato fisico e salute dell’atleta</h2>
        <p>Problemi fisici, fisioterapia, certificazione, screening e monitoraggio fisiologico in un unico quadro longitudinale.</p>
      </div>
    </section>

    ${readOnlyNote()}
    ${internalTabs()}

    <div id="health-section-host"></div>
  `;

  host.querySelectorAll('[data-health-section]').forEach(button => {
    button.addEventListener('click', () => {
      section = button.dataset.healthSection;
      renderModule(host);
    });
  });

  const container = host.querySelector('#health-section-host');

  if (section === 'injuries') {
    renderInjuries(container, health, host);
  } else if (section === 'physio') {
    renderPhysio(container, health, host);
  } else if (section === 'screening') {
    renderScreening(container, health, host);
  } else if (section === 'monitoring') {
    renderMonitoring(container, health, host);
  } else {
    renderOverview(container, health, host);
  }
}

function renderOverview(container, health, host) {
  const status = overallStatus(health);
  const injuries = activeInjuries(health);
  const restrictions = restrictionSummary(health);
  const certificate = certificateStatus(health.certificate);

  container.innerHTML = `
    <section class="health-kpis">
      <article class="health-kpi status-${status.tone}">
        <span>Stato</span>
        <strong>${escapeHtml(status.label)}</strong>
        <small>${escapeHtml(status.copy)}</small>
      </article>

      <article class="health-kpi">
        <span>Infortuni attivi</span>
        <strong>${injuries.length}</strong>
        <small>${injuries.length ? 'episodi da seguire' : 'nessun episodio aperto'}</small>
      </article>

      <article class="health-kpi status-${certificate.tone}">
        <span>Certificato agonistico</span>
        <strong>${escapeHtml(certificate.label)}</strong>
        <small>${health.certificate.expiryDate ? `Scadenza ${formatDate(health.certificate.expiryDate)}` : 'completa i dati'}</small>
      </article>

      <article class="health-kpi">
        <span>Prossimo physio</span>
        <strong>${health.physio.nextReview ? formatDate(health.physio.nextReview) : '—'}</strong>
        <small>${health.physio.name || 'professionista non impostato'}</small>
      </article>
    </section>

    <section class="health-overview-grid">
      <article class="panel health-overview-main">
        <div class="panel-header">
          <h3>Body map</h3>
          <p>Localizzazione sintetica degli infortuni attivi.</p>
        </div>

        <div class="panel-body health-body-map-layout">
          ${bodyMapSvg(injuries)}

          <div class="health-body-map-list">
            ${injuries.length
              ? injuries.map(injury => `
                  <button
                    class="health-body-map-row"
                    type="button"
                    data-open-injury="${escapeAttr(injury.id)}"
                  >
                    <span class="health-dot status-${escapeAttr(injury.status)}"></span>
                    <span>
                      <strong>${escapeHtml(injury.diagnosis || bodyAreaLabel(injury.bodyArea))}</strong>
                      <small>${escapeHtml(bodyAreaLabel(injury.bodyArea))}${injury.side !== 'none' ? ` · ${escapeHtml(SIDES[injury.side] || injury.side)}` : ''}</small>
                    </span>
                    <b>${escapeHtml(INJURY_STATUSES[injury.status] || injury.status)}</b>
                  </button>
                `).join('')
              : '<div class="health-empty">Nessun infortunio attivo.</div>'}
          </div>
        </div>
      </article>

      <div class="health-overview-stack">
        ${certificateCard(health, certificate)}
        ${physioSnapshot(health)}
      </div>
    </section>

    <section class="panel health-restrictions-panel">
      <div class="panel-header">
        <h3>Restrizioni attive</h3>
        <p>Indicazioni operative che coach e preparatore dovrebbero conoscere.</p>
      </div>

      <div class="panel-body health-restrictions-list">
        ${restrictions.length
          ? restrictions.map(item => `
              <div>
                <strong>${escapeHtml(item.source)}</strong>
                <span>${escapeHtml(item.text)}</span>
              </div>
            `).join('')
          : '<div class="health-empty">Nessuna restrizione attiva registrata.</div>'}
      </div>
    </section>
  `;

  container.querySelector('[data-edit-certificate]')?.addEventListener('click', () => {
    openCertificateDialog(host, health);
  });

  container.querySelector('[data-edit-physio]')?.addEventListener('click', () => {
    section = 'physio';
    renderModule(host);
  });

  container.querySelectorAll('[data-open-injury]').forEach(button => {
    button.addEventListener('click', () => {
      const injury = health.injuries.find(item => item.id === button.dataset.openInjury);
      if (injury) openInjuryDialog(host, health, injury.id);
    });
  });
}


function bodyMapSvg(injuries) {
  const markers = injuries
    .map((injury, index) => {
      const mapArea = injury.mapArea || inferBodyMapArea(injury.bodyArea);
      const point = BODY_MAP_POINTS[mapArea];

      if (!point) return '';

      const sideOffset = injury.side === 'left'
        ? -8
        : injury.side === 'right'
          ? 8
          : 0;

      const x = point.x + sideOffset;

      return `
        <g
          class="health-body-marker status-${escapeAttr(injury.status)}"
          aria-label="${escapeAttr(injury.diagnosis || bodyAreaLabel(injury.bodyArea))}"
        >
          <circle cx="${x}" cy="${point.y}" r="6"></circle>
          <circle cx="${x}" cy="${point.y}" r="9.5" class="health-body-marker-halo"></circle>
          <text x="${x}" y="${point.y + 2}" text-anchor="middle">${index + 1}</text>
        </g>
      `;
    })
    .join('');

  return `
    <div class="health-body-map-shell">
      <svg
        class="health-body-map"
        viewBox="0 0 240 332"
        role="img"
        aria-label="Body map anteriore e posteriore degli infortuni attivi"
      >
        <defs>
          <linearGradient id="healthBodyFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e4edf3"></stop>
            <stop offset="100%" stop-color="#cbd8e1"></stop>
          </linearGradient>
          <linearGradient id="healthBodyBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e9eef3"></stop>
            <stop offset="100%" stop-color="#d2dbe3"></stop>
          </linearGradient>
        </defs>

        <text x="66" y="15" text-anchor="middle" class="health-body-view-label">FRONT</text>
        <text x="174" y="15" text-anchor="middle" class="health-body-view-label">BACK</text>

        <g class="health-body-silhouette front">
          <ellipse cx="66" cy="36" rx="14" ry="17"></ellipse>
          <path d="M61 51 L61 63 C59 67 55 70 51 73 L45 77 L87 77 L81 73 C77 70 73 67 71 63 L71 51 Z"></path>

          <path d="M35 77
                   C42 70 52 66 61 67
                   C63 71 64 73 66 73
                   C68 73 69 71 71 67
                   C80 66 90 70 97 77
                   L102 89
                   C104 97 105 106 104 114
                   L102 128
                   C101 139 98 148 92 156
                   C85 163 77 168 66 172
                   C55 168 47 163 40 156
                   C34 148 31 139 30 128
                   L28 114
                   C27 106 28 97 30 89 Z"></path>

          <path d="M37 79
                   C32 87 29 96 28 106
                   L27 121
                   C25 131 25 142 26 152
                   L28 168
                   C29 178 32 186 35 194
                   L42 192
                   C40 184 39 176 39 169
                   L39 151
                   L41 128
                   L44 108
                   C45 98 44 88 37 79 Z"></path>
          <path d="M95 79
                   C100 87 103 96 104 106
                   L105 121
                   C107 131 107 142 106 152
                   L104 168
                   C103 178 100 186 97 194
                   L90 192
                   C92 184 93 176 93 169
                   L93 151
                   L91 128
                   L88 108
                   C87 98 88 88 95 79 Z"></path>

          <path d="M39 193 L36 201 L37 210 L40 209 L41 214 L44 211 L45 216 L48 213 L47 203 L45 192 Z"></path>
          <path d="M93 193 L96 201 L95 210 L92 209 L91 214 L88 211 L87 216 L84 213 L85 203 L87 192 Z"></path>

          <!-- Pelvis: broad iliac contour, no central appendage -->
          <path d="M40 154
                   C46 163 55 169 66 173
                   C77 169 86 163 92 154
                   C91 165 89 177 86 187
                   C80 195 73 200 66 202
                   C59 200 52 195 46 187
                   C43 177 41 165 40 154 Z"></path>
          <path d="M48 172 C54 177 60 180 66 180 C72 180 78 177 84 172" class="health-body-detail"></path>

          <!-- Left thigh + knee + calf + ankle + foot -->
          <path d="M43 179
                   C38 191 36 204 36 216
                   C36 228 39 237 43 245
                   C42 249 41 254 42 259
                   C44 266 44 273 42 283
                   C40 293 40 303 42 312
                   C43 316 46 319 49 321
                   C47 323 44 326 41 328
                   L57 328
                   C59 325 60 322 59 318
                   C60 311 61 302 61 293
                   C61 282 59 272 59 264
                   C59 258 61 253 62 249
                   C64 241 66 231 68 219
                   C69 205 68 192 66 181
                   C58 178 50 178 43 179 Z"></path>

          <!-- Right thigh + knee + calf + ankle + foot -->
          <path d="M89 179
                   C94 191 96 204 96 216
                   C96 228 93 237 89 245
                   C90 249 91 254 90 259
                   C88 266 88 273 90 283
                   C92 293 92 303 90 312
                   C89 316 86 319 83 321
                   C85 323 88 326 91 328
                   L75 328
                   C73 325 72 322 73 318
                   C72 311 71 302 71 293
                   C71 282 73 272 73 264
                   C73 258 71 253 70 249
                   C68 241 66 231 64 219
                   C63 205 64 192 66 181
                   C74 178 82 178 89 179 Z"></path>

          <!-- Upper-body and limb landmarks -->
          <path d="M48 82 C53 88 58 91 66 91 C74 91 79 88 84 82" class="health-body-detail"></path>
          <path d="M54 105 C58 109 61 111 66 111 C71 111 74 109 78 105" class="health-body-detail"></path>
          <path d="M58 132 C61 135 63 136 66 136 C69 136 71 135 74 132" class="health-body-detail"></path>
          <path d="M66 92 L66 158" class="health-body-detail"></path>
          <path d="M40 132 C41 136 42 140 43 144" class="health-body-detail"></path>
          <path d="M92 132 C91 136 90 140 89 144" class="health-body-detail"></path>

          <!-- Knees -->
          <path d="M45 245 C49 248 55 249 61 246" class="health-body-detail"></path>
          <path d="M71 246 C77 249 83 248 87 245" class="health-body-detail"></path>
          <ellipse cx="54" cy="248" rx="5.6" ry="7.2" class="health-body-joint"></ellipse>
          <ellipse cx="78" cy="248" rx="5.6" ry="7.2" class="health-body-joint"></ellipse>

          <!-- Calf / ankle contours -->
          <path d="M46 273 C49 279 53 282 58 283" class="health-body-detail"></path>
          <path d="M86 273 C83 279 79 282 74 283" class="health-body-detail"></path>
          <path d="M46 309 C50 311 54 311 58 309" class="health-body-detail"></path>
          <path d="M74 309 C78 311 82 311 86 309" class="health-body-detail"></path>
        </g>

        <g class="health-body-silhouette back">
          <ellipse cx="174" cy="36" rx="14" ry="17"></ellipse>
          <path d="M169 51 L169 63 C167 67 163 70 159 73 L153 77 L195 77 L189 73 C185 70 181 67 179 63 L179 51 Z"></path>

          <path d="M143 77
                   C150 70 160 66 169 67
                   C171 71 172 73 174 73
                   C176 73 177 71 179 67
                   C188 66 198 70 205 77
                   L210 89
                   C212 97 213 106 212 114
                   L210 128
                   C209 139 206 148 200 156
                   C193 163 185 168 174 172
                   C163 168 155 163 148 156
                   C142 148 139 139 138 128
                   L136 114
                   C135 106 136 97 138 89 Z"></path>

          <path d="M145 79
                   C140 87 137 96 136 106
                   L135 121
                   C133 131 133 142 134 152
                   L136 168
                   C137 178 140 186 143 194
                   L150 192
                   C148 184 147 176 147 169
                   L147 151
                   L149 128
                   L152 108
                   C153 98 152 88 145 79 Z"></path>
          <path d="M203 79
                   C208 87 211 96 212 106
                   L213 121
                   C215 131 215 142 214 152
                   L212 168
                   C211 178 208 186 205 194
                   L198 192
                   C200 184 201 176 201 169
                   L201 151
                   L199 128
                   L196 108
                   C195 98 196 88 203 79 Z"></path>

          <path d="M147 193 L144 201 L145 210 L148 209 L149 214 L152 211 L153 216 L156 213 L155 203 L153 192 Z"></path>
          <path d="M201 193 L204 201 L203 210 L200 209 L199 214 L196 211 L195 216 L192 213 L193 203 L195 192 Z"></path>

          <!-- Pelvis / gluteal contour -->
          <path d="M148 154
                   C154 163 163 169 174 173
                   C185 169 194 163 200 154
                   C199 165 197 177 194 187
                   C188 195 181 200 174 202
                   C167 200 160 195 154 187
                   C151 177 149 165 148 154 Z"></path>
          <path d="M156 172 C162 177 168 180 174 180 C180 180 186 177 192 172" class="health-body-detail"></path>
          <path d="M174 181 L174 198" class="health-body-detail"></path>

          <!-- Left posterior thigh + knee + calf + ankle + foot -->
          <path d="M151 179
                   C146 191 144 204 144 216
                   C144 228 147 237 151 245
                   C150 249 149 254 150 259
                   C152 266 152 273 150 283
                   C148 293 148 303 150 312
                   C151 316 154 319 157 321
                   C155 323 152 326 149 328
                   L165 328
                   C167 325 168 322 167 318
                   C168 311 169 302 169 293
                   C169 282 167 272 167 264
                   C167 258 169 253 170 249
                   C172 241 174 231 176 219
                   C177 205 176 192 174 181
                   C166 178 158 178 151 179 Z"></path>

          <!-- Right posterior thigh + knee + calf + ankle + foot -->
          <path d="M197 179
                   C202 191 204 204 204 216
                   C204 228 201 237 197 245
                   C198 249 199 254 198 259
                   C196 266 196 273 198 283
                   C200 293 200 303 198 312
                   C197 316 194 319 191 321
                   C193 323 196 326 199 328
                   L183 328
                   C181 325 180 322 181 318
                   C180 311 179 302 179 293
                   C179 282 181 272 181 264
                   C181 258 179 253 178 249
                   C176 241 174 231 172 219
                   C171 205 172 192 174 181
                   C182 178 190 178 197 179 Z"></path>

          <!-- Upper-body guide lines -->
          <path d="M156 82 C161 88 166 91 174 91 C182 91 187 88 192 82" class="health-body-detail"></path>
          <path d="M162 98 C166 95 169 94 174 94 C179 94 182 95 186 98" class="health-body-detail"></path>
          <path d="M174 92 L174 158" class="health-body-detail"></path>
          <path d="M165 119 C168 116 171 114 174 114 C177 114 180 116 183 119" class="health-body-detail"></path>
          <path d="M161 146 C165 152 169 155 174 155 C179 155 183 152 187 146" class="health-body-detail"></path>
          <path d="M148 132 C149 136 150 140 151 144" class="health-body-detail"></path>
          <path d="M200 132 C199 136 198 140 197 144" class="health-body-detail"></path>

          <!-- Popliteal / knee landmarks -->
          <path d="M153 245 C157 248 163 249 169 246" class="health-body-detail"></path>
          <path d="M179 246 C185 249 191 248 195 245" class="health-body-detail"></path>
          <path d="M157 249 C160 252 164 253 168 251" class="health-body-detail"></path>
          <path d="M180 251 C184 253 188 252 191 249" class="health-body-detail"></path>

          <!-- Calves: proximal fullness, distal taper, ankle -->
          <path d="M154 271 C157 278 162 282 167 284" class="health-body-detail"></path>
          <path d="M194 271 C191 278 186 282 181 284" class="health-body-detail"></path>
          <path d="M154 309 C158 311 162 311 166 309" class="health-body-detail"></path>
          <path d="M182 309 C186 311 190 311 194 309" class="health-body-detail"></path>
        </g>

        ${markers}
      </svg>

      <div class="health-body-map-legend">
        <span><i class="legend-active"></i> attivo</span>
        <span><i class="legend-improving"></i> in miglioramento / RTP</span>
        <span><i class="legend-resolved"></i> risolto</span>
      </div>
    </div>
  `;
}

function certificateCard(health, certificate) {
  return `
    <article class="panel health-certificate-card">
      <div class="panel-header health-card-header">
        <div>
          <h3>Certificato sportivo agonistico</h3>
          <p>Scadenza e medico sportivo di riferimento.</p>
        </div>

        ${canWriteModule('health')
          ? '<button class="button button-ghost" type="button" data-edit-certificate>Modifica</button>'
          : ''}
      </div>

      <div class="panel-body">
        <div class="health-certificate-status status-${certificate.tone}">
          <strong>${escapeHtml(certificate.label)}</strong>
          <span>${health.certificate.expiryDate ? formatDate(health.certificate.expiryDate) : 'Scadenza non inserita'}</span>
        </div>

        <div class="health-detail-list">
          <div><span>Medico sportivo</span><strong>${escapeHtml(health.certificate.doctor || '—')}</strong></div>
          <div><span>Centro / struttura</span><strong>${escapeHtml(health.certificate.facility || '—')}</strong></div>
          <div><span>Rilascio</span><strong>${escapeHtml(formatDate(health.certificate.issueDate))}</strong></div>
        </div>
      </div>
    </article>
  `;
}

function physioSnapshot(health) {
  return `
    <article class="panel health-physio-card">
      <div class="panel-header health-card-header">
        <div>
          <h3>Physio</h3>
          <p>Quadro operativo, non diario obbligatorio.</p>
        </div>

        ${canWriteModule('health')
          ? '<button class="button button-ghost" type="button" data-edit-physio>Apri</button>'
          : ''}
      </div>

      <div class="panel-body">
        <div class="health-physio-identity">
          <div class="health-avatar">PT</div>
          <div>
            <strong>${escapeHtml(health.physio.name || 'Fisioterapista non impostato')}</strong>
            <span>${escapeHtml(health.physio.clinic || health.physio.contact || '—')}</span>
          </div>
        </div>

        <div class="health-detail-list">
          <div><span>Prossimo controllo</span><strong>${escapeHtml(formatDate(health.physio.nextReview))}</strong></div>
          <div><span>Log sedute</span><strong>${health.physio.sessionLogEnabled ? 'Attivo' : 'Non utilizzato'}</strong></div>
        </div>

        ${health.physio.currentPlan
          ? `<div class="health-callout"><strong>Piano corrente</strong><span>${escapeHtml(health.physio.currentPlan)}</span></div>`
          : ''}
      </div>
    </article>
  `;
}

function openCertificateDialog(host, health) {
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-certificate-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Body & Health</div><h3>Certificato sportivo agonistico</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data rilascio</label><input type="date" name="issueDate" value="${escapeAttr(health.certificate.issueDate)}" /></div>
        <div class="field"><label>Scadenza</label><input type="date" name="expiryDate" value="${escapeAttr(health.certificate.expiryDate)}" /></div>
        <div class="field"><label>Medico sportivo</label><input name="doctor" value="${escapeAttr(health.certificate.doctor)}" /></div>
        <div class="field"><label>Centro / struttura</label><input name="facility" value="${escapeAttr(health.certificate.facility)}" /></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(health.certificate.notes)}</textarea></div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-certificate-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.certificate = {
        issueDate: String(data.issueDate || ''),
        expiryDate: String(data.expiryDate || ''),
        doctor: String(data.doctor || '').trim(),
        facility: String(data.facility || '').trim(),
        notes: String(data.notes || '').trim(),
      };
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}


function renderInjuries(container, health, host) {
  const injuries = [...health.injuries]
    .sort((a, b) => {
      const statusA = a.status === 'resolved' ? 1 : 0;
      const statusB = b.status === 'resolved' ? 1 : 0;

      return statusA - statusB
        || String(b.onsetDate).localeCompare(String(a.onsetDate));
    });

  const openCount = injuries.filter(item => item.status !== 'resolved').length;
  const resolvedCount = injuries.length - openCount;

  container.innerHTML = `
    <section class="health-subhead">
      <div>
        <div class="eyebrow">Injury tracker</div>
        <h2>Infortuni e problemi fisici</h2>
        <p>Un tracker compatto: una riga per episodio, espandibile quando servono dettagli, timeline e return to play.</p>
      </div>

      ${canWriteModule('health')
        ? '<button class="button button-primary" type="button" id="health-new-injury">+ Nuovo infortunio</button>'
        : ''}
    </section>

    <section class="panel health-injury-tracker">
      <div class="panel-header health-card-header">
        <div>
          <h3>Tracker</h3>
          <p>${openCount} ${openCount === 1 ? 'episodio aperto' : 'episodi aperti'} · ${resolvedCount} ${resolvedCount === 1 ? 'risolto' : 'risolti'}</p>
        </div>

        <div class="health-tracker-legend">
          <span><i class="status-active"></i> Attivo</span>
          <span><i class="status-improving"></i> Improving / RTP</span>
          <span><i class="status-resolved"></i> Risolto</span>
        </div>
      </div>

      <div class="panel-body health-injury-tracker-body">
        ${injuries.length
          ? `
            <div class="health-injury-tracker-head" aria-hidden="true">
              <span>Stato</span>
              <span>Problema</span>
              <span>Insorgenza</span>
              <span>Dolore</span>
              <span>Limitazione</span>
              <span>RTP</span>
              <span></span>
            </div>

            <div class="health-injury-tracker-list">
              ${injuries.map(injury => injuryTrackerRow(injury)).join('')}
            </div>
          `
          : '<div class="health-empty">Nessun infortunio registrato.</div>'}
      </div>
    </section>
  `;

  container.querySelector('#health-new-injury')?.addEventListener('click', () => {
    openInjuryDialog(host, health);
  });

  container.querySelectorAll('[data-edit-injury]').forEach(button => {
    button.addEventListener('click', () => {
      openInjuryDialog(host, health, button.dataset.editInjury);
    });
  });

  container.querySelectorAll('[data-injury-update]').forEach(button => {
    button.addEventListener('click', () => {
      openInjuryUpdateDialog(host, health, button.dataset.injuryUpdate);
    });
  });
}

function injuryTrackerRow(injury) {
  const completed = RTP_CHECKLIST.filter(item => injury.rtpChecklist[item.id]).length;
  const rtpPercent = Math.round(completed / RTP_CHECKLIST.length * 100);
  const lastUpdate = injury.timeline[0];

  return `
    <details class="health-injury-tracker-row status-${escapeAttr(injury.status)}">
      <summary>
        <span class="health-tracker-status">
          <i></i>
          <b>${escapeHtml(INJURY_STATUSES[injury.status] || injury.status)}</b>
        </span>

        <span class="health-tracker-problem">
          <strong>${escapeHtml(injury.diagnosis || bodyAreaLabel(injury.bodyArea))}</strong>
          <small>
            ${escapeHtml(bodyAreaLabel(injury.bodyArea))}
            ${injury.side !== 'none' ? ` · ${escapeHtml(SIDES[injury.side] || injury.side)}` : ''}
          </small>
        </span>

        <span class="health-tracker-date">${escapeHtml(formatDate(injury.onsetDate))}</span>

        <span class="health-tracker-pain">
          <b>${Number(injury.pain || 0)}</b><small>/10</small>
        </span>

        <span class="health-tracker-restriction">
          ${escapeHtml(RESTRICTIONS[injury.restrictionLevel] || injury.restrictionLevel)}
        </span>

        <span class="health-tracker-rtp">
          ${escapeHtml(RTP_STAGES[injury.rtpStage] || injury.rtpStage)}
        </span>

        <span class="health-tracker-chevron">⌄</span>
      </summary>

      <div class="health-injury-tracker-expanded">
        <div class="health-tracker-expanded-grid">
          <div>
            <span>Modalità</span>
            <strong>${escapeHtml(ONSET_TYPES[injury.onsetType] || injury.onsetType)}</strong>
          </div>
          <div>
            <span>Professionista</span>
            <strong>${escapeHtml(injury.professional || '—')}</strong>
          </div>
          <div>
            <span>Body map</span>
            <strong>${escapeHtml(mapAreaLabel(injury.mapArea || inferBodyMapArea(injury.bodyArea)))}</strong>
          </div>
          <div>
            <span>Risoluzione</span>
            <strong>${escapeHtml(formatDate(injury.resolvedDate))}</strong>
          </div>
        </div>

        ${injury.restrictions
          ? `<div class="health-callout warning"><strong>Indicazioni / restrizioni</strong><span>${escapeHtml(injury.restrictions)}</span></div>`
          : ''}

        ${injury.notes
          ? `<div class="health-callout"><strong>Note</strong><span>${escapeHtml(injury.notes)}</span></div>`
          : ''}

        <div class="health-tracker-rtp-progress">
          <div>
            <span>Return to play checklist</span>
            <strong>${completed}/${RTP_CHECKLIST.length}</strong>
          </div>
          <div class="health-progress-track"><span style="width:${rtpPercent}%"></span></div>
        </div>

        ${lastUpdate
          ? `
            <div class="health-tracker-last-update">
              <span>Ultimo aggiornamento</span>
              <strong>${escapeHtml(formatDate(lastUpdate.date))} · ${escapeHtml(lastUpdate.title || lastUpdate.notes || 'Aggiornamento')}</strong>
            </div>
          `
          : ''}

        ${injury.timeline.length
          ? `
            <div class="health-tracker-mini-timeline">
              ${injury.timeline.slice(0, 4).map(item => `
                <div>
                  <time>${escapeHtml(formatDate(item.date))}</time>
                  <span>
                    <strong>${escapeHtml(item.title || 'Aggiornamento')}</strong>
                    ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
                  </span>
                </div>
              `).join('')}
            </div>
          `
          : ''}

        ${canWriteModule('health')
          ? `
            <div class="health-card-actions">
              <button class="button button-ghost" type="button" data-injury-update="${escapeAttr(injury.id)}">+ Aggiornamento</button>
              <button class="button button-ghost" type="button" data-edit-injury="${escapeAttr(injury.id)}">Modifica</button>
            </div>
          `
          : ''}
      </div>
    </details>
  `;
}


function openInjuryDialog(host, health, injuryId = '') {
  const existing = injuryId
    ? health.injuries.find(item => item.id === injuryId)
    : null;

  const injury = existing || {
    id: uid('injury'),
    onsetDate: todayKey(),
    bodyArea: '',
    mapArea: '',
    side: 'none',
    diagnosis: '',
    onsetType: 'progressive',
    status: 'active',
    pain: 0,
    restrictionLevel: 'none',
    restrictions: '',
    professional: '',
    notes: '',
    rtpStage: 'protection',
    rtpChecklist: Object.fromEntries(RTP_CHECKLIST.map(item => [item.id, false])),
    timeline: [],
    resolvedDate: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog health-injury-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-injury-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Body & Health</div><h3>${existing ? 'Modifica infortunio' : 'Nuovo infortunio'}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field"><label>Data insorgenza</label><input type="date" name="onsetDate" value="${escapeAttr(injury.onsetDate)}" required /></div>
          <div class="field"><label>Stato</label><select name="status">${options(INJURY_STATUSES, injury.status)}</select></div>

          <div class="field">
            <label>Distretto / area</label>
            <input
              name="bodyArea"
              list="health-body-area-suggestions"
              value="${escapeAttr(bodyAreaLabel(injury.bodyArea) === '—' ? '' : bodyAreaLabel(injury.bodyArea))}"
              placeholder="Scrivi liberamente, es. polpaccio, intercostale…"
              required
            />
            <datalist id="health-body-area-suggestions">
              ${BODY_AREA_SUGGESTIONS.map(label => `<option value="${escapeAttr(label)}"></option>`).join('')}
            </datalist>
            <span class="training-field-hint">Campo libero: i suggerimenti servono solo per velocizzare l’inserimento.</span>
          </div>

          <div class="field">
            <label>Posizione body map</label>
            <select name="mapArea">
              <option value="">Auto dal distretto</option>
              ${Object.entries(BODY_MAP_AREAS).map(([id, label]) => `
                <option value="${id}" ${(injury.mapArea || inferBodyMapArea(injury.bodyArea)) === id ? 'selected' : ''}>
                  ${escapeHtml(label)}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="field"><label>Lato</label><select name="side">${options(SIDES, injury.side)}</select></div>

          <div class="field full"><label>Diagnosi / descrizione</label><input name="diagnosis" value="${escapeAttr(injury.diagnosis)}" placeholder="Descrizione clinica o problema riferito" /></div>

          <div class="field"><label>Modalità di insorgenza</label><select name="onsetType">${options(ONSET_TYPES, injury.onsetType)}</select></div>
          <div class="field"><label>Dolore · 0–10</label><input type="number" name="pain" min="0" max="10" step="1" value="${Number(injury.pain || 0)}" /></div>

          <div class="field"><label>Limitazione</label><select name="restrictionLevel">${options(RESTRICTIONS, injury.restrictionLevel)}</select></div>
          <div class="field"><label>Return to play</label><select name="rtpStage">${options(RTP_STAGES, injury.rtpStage)}</select></div>

          <div class="field full"><label>Indicazioni / restrizioni operative</label><textarea name="restrictions" placeholder="es. no servizio, carico ridotto, max 60 minuti…">${escapeHtml(injury.restrictions)}</textarea></div>

          <div class="field"><label>Professionista di riferimento</label><input name="professional" value="${escapeAttr(injury.professional)}" /></div>
          <div class="field"><label>Data risoluzione</label><input type="date" name="resolvedDate" value="${escapeAttr(injury.resolvedDate)}" /></div>

          <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(injury.notes)}</textarea></div>
        </div>

        <section class="health-dialog-section">
          <div>
            <strong>Return to play checklist</strong>
            <span>Criteri di lavoro; non sostituiscono la valutazione clinica.</span>
          </div>

          <div class="health-checklist">
            ${RTP_CHECKLIST.map(item => `
              <label>
                <input
                  type="checkbox"
                  name="rtp-${item.id}"
                  ${injury.rtpChecklist[item.id] ? 'checked' : ''}
                />
                <span>${escapeHtml(item.label)}</span>
              </label>
            `).join('')}
          </div>
        </section>

        ${existing && injury.timeline.length ? `
          <section class="health-dialog-section">
            <div><strong>Timeline</strong><span>Aggiornamenti recenti dell’episodio.</span></div>
            <div class="health-timeline">
              ${injury.timeline.slice(0, 8).map(item => `
                <div>
                  <time>${escapeHtml(formatDate(item.date))}</time>
                  <span><strong>${escapeHtml(item.title || 'Aggiornamento')}</strong>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</span>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}
      </div>

      <div class="dialog-actions">
        <div>
          ${existing
            ? '<button class="button button-danger" type="button" id="health-delete-injury">Elimina</button>'
            : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-injury-form').addEventListener('submit', event => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    const nextInjury = {
      ...injury,
      onsetDate: data.onsetDate,
      bodyArea: String(data.bodyArea || '').trim(),
      mapArea: data.mapArea || inferBodyMapArea(data.bodyArea),
      side: data.side,
      diagnosis: String(data.diagnosis || '').trim(),
      onsetType: data.onsetType,
      status: data.status,
      pain: Math.max(0, Math.min(10, Number(data.pain || 0))),
      restrictionLevel: data.restrictionLevel,
      restrictions: String(data.restrictions || '').trim(),
      professional: String(data.professional || '').trim(),
      notes: String(data.notes || '').trim(),
      rtpStage: data.rtpStage,
      rtpChecklist: Object.fromEntries(
        RTP_CHECKLIST.map(item => [
          item.id,
          Boolean(form.querySelector(`[name="rtp-${item.id}"]`)?.checked),
        ]),
      ),
      resolvedDate: data.resolvedDate || '',
    };

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const index = next.injuries.findIndex(item => item.id === nextInjury.id);

      if (index >= 0) {
        next.injuries[index] = nextInjury;
      } else {
        next.injuries.push(nextInjury);
      }

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.querySelector('#health-delete-injury')?.addEventListener('click', async () => {
    const ok = await showInAppConfirm(
      'Eliminare definitivamente questo episodio di infortunio?',
      { title: 'Elimina infortunio', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.injuries = next.injuries.filter(item => item.id !== injury.id);
      next.physio.sessions = next.physio.sessions.filter(item => item.injuryId !== injury.id);
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function openInjuryUpdateDialog(host, health, injuryId) {
  const injury = health.injuries.find(item => item.id === injuryId);
  if (!injury) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-injury-update-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Injury update</div><h3>${escapeHtml(injury.diagnosis || bodyAreaLabel(injury.bodyArea))}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayKey()}" required /></div>
        <div class="field"><label>Titolo</label><input name="title" placeholder="es. controllo, ripresa, test funzionale" /></div>
        <div class="field full"><label>Note</label><textarea name="notes" placeholder="Cosa è cambiato?"></textarea></div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Aggiungi</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-injury-update-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const target = next.injuries.find(item => item.id === injuryId);

      if (target) {
        target.timeline.unshift({
          id: uid('update'),
          date: data.date,
          title: String(data.title || '').trim(),
          notes: String(data.notes || '').trim(),
        });

        target.timeline.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      }

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderPhysio(container, health, host) {
  const physio = health.physio;
  const sessions = [...physio.sessions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    <section class="health-subhead">
      <div>
        <div class="eyebrow">Physio</div>
        <h2>Quadro fisioterapico</h2>
        <p>Informazioni operative sempre disponibili; il diario delle sedute resta opzionale.</p>
      </div>

      ${canWriteModule('health')
        ? '<button class="button button-primary" type="button" id="health-edit-physio">Modifica quadro</button>'
        : ''}
    </section>

    <section class="health-physio-layout">
      <article class="panel">
        <div class="panel-header">
          <h3>Professionista e piano corrente</h3>
          <p>Il riferimento utile per atleta, famiglia e staff.</p>
        </div>

        <div class="panel-body">
          <div class="health-physio-profile">
            <div class="health-avatar large">PT</div>
            <div>
              <h3>${escapeHtml(physio.name || 'Fisioterapista non impostato')}</h3>
              <p>${escapeHtml(physio.clinic || '—')}</p>
              <span>${escapeHtml(physio.contact || '')}</span>
            </div>
          </div>

          <div class="health-detail-list">
            <div><span>Prossimo controllo</span><strong>${escapeHtml(formatDate(physio.nextReview))}</strong></div>
            <div><span>Diario sedute</span><strong>${physio.sessionLogEnabled ? 'Attivo' : 'Disattivato'}</strong></div>
          </div>

          ${physio.currentPlan
            ? `<div class="health-callout"><strong>Piano / lavoro attuale</strong><span>${escapeHtml(physio.currentPlan)}</span></div>`
            : ''}

          ${physio.restrictions
            ? `<div class="health-callout warning"><strong>Restrizioni / indicazioni</strong><span>${escapeHtml(physio.restrictions)}</span></div>`
            : ''}

          ${physio.notes
            ? `<div class="health-note">${escapeHtml(physio.notes)}</div>`
            : ''}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header health-card-header">
          <div>
            <h3>Diario sedute</h3>
            <p>${physio.sessionLogEnabled ? 'Disponibile per chi vuole documentare il lavoro.' : 'Non è obbligatorio: attivalo solo se serve.'}</p>
          </div>

          ${canWriteModule('health') && physio.sessionLogEnabled
            ? '<button class="button button-ghost" type="button" id="health-new-physio-session">+ Seduta</button>'
            : ''}
        </div>

        <div class="panel-body">
          ${physio.sessionLogEnabled
            ? sessions.length
              ? `<div class="health-session-list">${sessions.map(session => physioSessionRow(session, health)).join('')}</div>`
              : '<div class="health-empty">Diario attivo, ma nessuna seduta registrata.</div>'
            : '<div class="health-optional-log"><strong>Log opzionale</strong><span>Il modulo funziona anche senza registrare ogni seduta. Se il fisioterapista vuole usarlo come diario clinico-operativo, può essere attivato dal quadro Physio.</span></div>'}
        </div>
      </article>
    </section>
  `;

  container.querySelector('#health-edit-physio')?.addEventListener('click', () => {
    openPhysioDialog(host, health);
  });

  container.querySelector('#health-new-physio-session')?.addEventListener('click', () => {
    openPhysioSessionDialog(host, health);
  });

  container.querySelectorAll('[data-edit-physio-session]').forEach(button => {
    button.addEventListener('click', () => {
      openPhysioSessionDialog(host, health, button.dataset.editPhysioSession);
    });
  });
}

function physioSessionRow(session, health) {
  const injury = health.injuries.find(item => item.id === session.injuryId);

  return `
    <button class="health-session-row" type="button" data-edit-physio-session="${escapeAttr(session.id)}">
      <time>${escapeHtml(formatDate(session.date))}</time>
      <span>
        <strong>${escapeHtml(session.summary || 'Seduta physio')}</strong>
        <small>${injury ? escapeHtml(injury.diagnosis || bodyAreaLabel(injury.bodyArea)) : 'Seduta generale'}</small>
      </span>
      <b>Apri →</b>
    </button>
  `;
}

function openPhysioDialog(host, health) {
  const physio = health.physio;
  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-physio-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Body & Health</div><h3>Quadro Physio</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Fisioterapista</label><input name="name" value="${escapeAttr(physio.name)}" /></div>
        <div class="field"><label>Studio / centro</label><input name="clinic" value="${escapeAttr(physio.clinic)}" /></div>
        <div class="field full"><label>Contatto</label><input name="contact" value="${escapeAttr(physio.contact)}" placeholder="Telefono, email o riferimento" /></div>
        <div class="field"><label>Prossimo controllo</label><input type="date" name="nextReview" value="${escapeAttr(physio.nextReview)}" /></div>
        <div class="field full"><label>Piano / lavoro attuale</label><textarea name="currentPlan">${escapeHtml(physio.currentPlan)}</textarea></div>
        <div class="field full"><label>Restrizioni / indicazioni allo staff</label><textarea name="restrictions">${escapeHtml(physio.restrictions)}</textarea></div>
        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(physio.notes)}</textarea></div>

        <div class="field full">
          <label class="checkbox-row">
            <input type="checkbox" name="sessionLogEnabled" ${physio.sessionLogEnabled ? 'checked' : ''} />
            Attiva il diario opzionale delle sedute
          </label>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-physio-form').addEventListener('submit', event => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    store.update(state => {
      const next = normalizeHealthPayload(state.health);

      next.physio = {
        ...next.physio,
        name: String(data.name || '').trim(),
        clinic: String(data.clinic || '').trim(),
        contact: String(data.contact || '').trim(),
        currentPlan: String(data.currentPlan || '').trim(),
        restrictions: String(data.restrictions || '').trim(),
        nextReview: data.nextReview || '',
        notes: String(data.notes || '').trim(),
        sessionLogEnabled: Boolean(form.elements.sessionLogEnabled.checked),
      };

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function openPhysioSessionDialog(host, health, sessionId = '') {
  const existing = sessionId
    ? health.physio.sessions.find(item => item.id === sessionId)
    : null;

  const session = existing || {
    id: uid('physio'),
    date: todayKey(),
    injuryId: '',
    summary: '',
    treatment: '',
    recommendations: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-physio-session-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Optional physio log</div><h3>${existing ? 'Modifica seduta' : 'Nuova seduta'}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${escapeAttr(session.date)}" required /></div>
        <div class="field"><label>Collegamento infortunio</label>
          <select name="injuryId">
            <option value="">Seduta generale</option>
            ${health.injuries.map(injury => `
              <option value="${injury.id}" ${session.injuryId === injury.id ? 'selected' : ''}>
                ${escapeHtml(injury.diagnosis || bodyAreaLabel(injury.bodyArea))}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field full"><label>Sintesi</label><input name="summary" value="${escapeAttr(session.summary)}" placeholder="Breve titolo della seduta" /></div>
        <div class="field full"><label>Trattamento / lavoro</label><textarea name="treatment">${escapeHtml(session.treatment)}</textarea></div>
        <div class="field full"><label>Indicazioni / esercizi</label><textarea name="recommendations">${escapeHtml(session.recommendations)}</textarea></div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing ? '<button class="button button-danger" id="health-delete-physio-session" type="button">Elimina</button>' : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-physio-session-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    const row = {
      id: session.id,
      date: data.date,
      injuryId: data.injuryId || '',
      summary: String(data.summary || '').trim(),
      treatment: String(data.treatment || '').trim(),
      recommendations: String(data.recommendations || '').trim(),
    };

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const index = next.physio.sessions.findIndex(item => item.id === row.id);

      if (index >= 0) next.physio.sessions[index] = row;
      else next.physio.sessions.push(row);

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.querySelector('#health-delete-physio-session')?.addEventListener('click', async () => {
    const ok = await showInAppConfirm(
      'Eliminare questa seduta dal diario?',
      { title: 'Elimina seduta', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.physio.sessions = next.physio.sessions.filter(item => item.id !== session.id);
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderScreening(container, health, host) {
  const protocols = health.screening.protocols;

  container.innerHTML = `
    <section class="health-subhead">
      <div>
        <div class="eyebrow">Screening</div>
        <h2>Misure periodiche e protocolli</h2>
        <p>Protocolli personalizzabili per crescita, mobilità, ROM, forza o altri parametri utili allo staff.</p>
      </div>

      ${canWriteModule('health')
        ? '<button class="button button-primary" id="health-new-screening-protocol" type="button">+ Protocollo</button>'
        : ''}
    </section>

    <section class="health-screening-grid">
      ${protocols.length
        ? protocols.map(protocol => screeningProtocolCard(protocol, health)).join('')
        : '<article class="panel health-empty-panel"><div class="health-empty">Nessun protocollo configurato.</div></article>'}
    </section>
  `;

  container.querySelector('#health-new-screening-protocol')?.addEventListener('click', () => {
    openScreeningProtocolDialog(host, health);
  });

  container.querySelectorAll('[data-edit-screening-protocol]').forEach(button => {
    button.addEventListener('click', () => {
      openScreeningProtocolDialog(host, health, button.dataset.editScreeningProtocol);
    });
  });

  container.querySelectorAll('[data-record-screening]').forEach(button => {
    button.addEventListener('click', () => {
      openScreeningRecordDialog(host, health, button.dataset.recordScreening);
    });
  });
}

function screeningProtocolCard(protocol, health) {
  const rows = [];

  for (const metric of protocol.metrics) {
    const series = health.screening.measurements?.[protocol.id]?.[metric.id] || [];
    const latest = [...series].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

    rows.push({
      metric,
      latest,
    });
  }

  return `
    <article class="panel health-screening-card">
      <div class="panel-body">
        <div class="health-card-head">
          <div>
            <h3>${escapeHtml(protocol.name)}</h3>
            <p>${escapeHtml(protocol.description || 'Protocollo personalizzato')}</p>
          </div>

          ${canWriteModule('health')
            ? `<button class="icon-button" type="button" data-edit-screening-protocol="${escapeAttr(protocol.id)}" aria-label="Modifica protocollo">✎</button>`
            : ''}
        </div>

        <div class="health-screening-metrics">
          ${rows.length
            ? rows.map(({ metric, latest }) => `
                <div>
                  <span>${escapeHtml(metric.name)}</span>
                  <strong>${latest ? formatValue(latest.value, metric.unit) : '—'}</strong>
                  <small>${latest ? formatDate(latest.date) : 'nessun dato'}</small>
                </div>
              `).join('')
            : '<div class="health-empty">Nessuna metrica definita.</div>'}
        </div>

        ${canWriteModule('health') && protocol.metrics.length
          ? `<button class="button button-ghost" type="button" data-record-screening="${escapeAttr(protocol.id)}">Registra misure</button>`
          : ''}
      </div>
    </article>
  `;
}

function metricDefinitionRow(metric = null) {
  return `
    <div class="health-metric-definition-row" data-health-metric-row>
      <input type="hidden" name="metricId" value="${escapeAttr(metric?.id || uid('metric'))}" />

      <label>
        <span>Nome</span>
        <input name="metricName" value="${escapeAttr(metric?.name || '')}" required />
      </label>

      <label>
        <span>Unità</span>
        <input name="metricUnit" value="${escapeAttr(metric?.unit || '')}" placeholder="cm, kg, °, N…" />
      </label>

      <button class="icon-button" type="button" data-remove-health-metric aria-label="Rimuovi">×</button>
    </div>
  `;
}

function openScreeningProtocolDialog(host, health, protocolId = '') {
  const existing = protocolId
    ? health.screening.protocols.find(item => item.id === protocolId)
    : null;

  const protocol = existing || {
    id: uid('screening'),
    name: '',
    description: '',
    metrics: [],
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog health-protocol-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-screening-protocol-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Screening</div><h3>${existing ? 'Modifica protocollo' : 'Nuovo protocollo'}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body">
        <div class="form-grid">
          <div class="field full"><label>Nome</label><input name="name" value="${escapeAttr(protocol.name)}" required /></div>
          <div class="field full"><label>Descrizione</label><textarea name="description">${escapeHtml(protocol.description)}</textarea></div>
        </div>

        <section class="health-dialog-section">
          <div class="health-section-row">
            <div>
              <strong>Metriche</strong>
              <span>Definisci cosa viene misurato in questo protocollo.</span>
            </div>
            <button class="button button-ghost" id="health-add-screening-metric" type="button">+ Metrica</button>
          </div>

          <div id="health-screening-metric-list" class="health-metric-definition-list">
            ${protocol.metrics.map(metricDefinitionRow).join('')}
          </div>
        </section>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing ? '<button class="button button-danger" id="health-delete-screening-protocol" type="button">Elimina</button>' : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  const list = dialog.querySelector('#health-screening-metric-list');

  const bindRemovers = () => {
    list.querySelectorAll('[data-remove-health-metric]').forEach(button => {
      button.onclick = () => button.closest('[data-health-metric-row]')?.remove();
    });
  };

  bindRemovers();

  dialog.querySelector('#health-add-screening-metric')?.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', metricDefinitionRow());
    bindRemovers();
  });

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-screening-protocol-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const name = String(form.elements.name.value || '').trim();
    if (!name) return;

    const metrics = [...list.querySelectorAll('[data-health-metric-row]')]
      .map(row => ({
        id: row.querySelector('[name="metricId"]').value,
        name: String(row.querySelector('[name="metricName"]').value || '').trim(),
        unit: String(row.querySelector('[name="metricUnit"]').value || '').trim(),
      }))
      .filter(item => item.name);

    if (existing) {
      const removed = existing.metrics
        .map(metric => metric.id)
        .filter(id => !metrics.some(metric => metric.id === id));

      const inUse = removed.some(metricId =>
        (health.screening.measurements?.[existing.id]?.[metricId] || []).length
      );

      if (inUse) {
        await showInAppAlert(
          'Non puoi rimuovere una metrica che possiede già misurazioni. Elimina prima i relativi dati.',
          { title: 'Metrica in uso' },
        );
        return;
      }
    }

    const row = {
      id: protocol.id,
      name,
      description: String(form.elements.description.value || '').trim(),
      metrics,
    };

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const index = next.screening.protocols.findIndex(item => item.id === row.id);

      if (index >= 0) next.screening.protocols[index] = row;
      else next.screening.protocols.push(row);

      if (!next.screening.measurements[row.id]) {
        next.screening.measurements[row.id] = {};
      }

      for (const metric of row.metrics) {
        if (!Array.isArray(next.screening.measurements[row.id][metric.id])) {
          next.screening.measurements[row.id][metric.id] = [];
        }
      }

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.querySelector('#health-delete-screening-protocol')?.addEventListener('click', async () => {
    const hasData = Object.values(health.screening.measurements?.[protocol.id] || {})
      .some(rows => Array.isArray(rows) && rows.length);

    if (hasData) {
      await showInAppAlert(
        'Il protocollo contiene già misurazioni. Elimina prima i dati associati.',
        { title: 'Protocollo in uso' },
      );
      return;
    }

    const ok = await showInAppConfirm(
      `Eliminare il protocollo “${protocol.name}”?`,
      { title: 'Elimina protocollo', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.screening.protocols = next.screening.protocols.filter(item => item.id !== protocol.id);
      delete next.screening.measurements[protocol.id];
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function openScreeningRecordDialog(host, health, protocolId) {
  const protocol = health.screening.protocols.find(item => item.id === protocolId);
  if (!protocol) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-screening-record-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Screening</div><h3>${escapeHtml(protocol.name)}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayKey()}" required /></div>
        <div></div>

        ${protocol.metrics.map(metric => `
          <div class="field">
            <label>${escapeHtml(metric.name)}${metric.unit ? ` · ${escapeHtml(metric.unit)}` : ''}</label>
            <input type="number" step="0.01" name="metric-${escapeAttr(metric.id)}" />
          </div>
        `).join('')}
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva misure</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-screening-record-form').addEventListener('submit', event => {
    event.preventDefault();

    const form = event.currentTarget;
    const date = form.elements.date.value;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);

      if (!next.screening.measurements[protocol.id]) {
        next.screening.measurements[protocol.id] = {};
      }

      for (const metric of protocol.metrics) {
        const input = form.elements[`metric-${metric.id}`];
        const value = Number(input?.value);

        if (!Number.isFinite(value) || input.value === '') continue;

        if (!Array.isArray(next.screening.measurements[protocol.id][metric.id])) {
          next.screening.measurements[protocol.id][metric.id] = [];
        }

        const series = next.screening.measurements[protocol.id][metric.id];
        const existing = series.find(item => item.date === date);

        if (existing) existing.value = value;
        else series.push({ date, value });

        series.sort((a, b) => a.date.localeCompare(b.date));
      }

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderMonitoring(container, health, host) {
  const metrics = health.monitoring.metrics;

  container.innerHTML = `
    <section class="health-subhead">
      <div>
        <div class="eyebrow">Monitoring</div>
        <h2>Dati fisiologici e wearable</h2>
        <p>Modello device-agnostic: ogni osservazione conserva metrica, valore, data e fonte.</p>
      </div>

      ${canWriteModule('health')
        ? `
          <div class="health-subhead-actions">
            <button class="button button-ghost" id="health-new-monitoring-metric" type="button">+ Metrica</button>
            <button class="button button-primary" id="health-new-observation" type="button">+ Osservazione</button>
          </div>
        `
        : ''}
    </section>

    <section class="health-integration-banner">
      <div class="health-integration-icon">⌁</div>
      <div>
        <strong>Pronto per integrazioni wearable</strong>
        <span>La struttura non dipende da Fitbit: in futuro potrà ricevere dati da Fitbit, Garmin, Apple Health, Whoop, Polar, Oura o altre sorgenti.</span>
      </div>
      <div class="health-source-chips">
        ${['Fitbit', 'Garmin', 'Apple Health', 'Whoop', 'Polar', 'Oura'].map(source => `<span>${source}</span>`).join('')}
      </div>
    </section>

    <section class="health-monitoring-grid">
      ${metrics.length
        ? metrics.map(metric => monitoringMetricCard(metric, health)).join('')
        : '<article class="panel health-empty-panel"><div class="health-empty">Nessuna metrica configurata.</div></article>'}
    </section>

    <section class="panel health-monitoring-history">
      <div class="panel-header">
        <h3>Osservazioni recenti</h3>
        <p>I dati wearable restano separati dal check-in soggettivo di Recovery.</p>
      </div>

      <div class="panel-body">
        ${health.monitoring.observations.length
          ? `<div class="health-observation-list">${health.monitoring.observations.slice(0, 20).map(row => observationRow(row, health)).join('')}</div>`
          : '<div class="health-empty">Nessuna osservazione registrata.</div>'}
      </div>
    </section>
  `;

  container.querySelector('#health-new-monitoring-metric')?.addEventListener('click', () => {
    openMonitoringMetricDialog(host, health);
  });

  container.querySelector('#health-new-observation')?.addEventListener('click', () => {
    openObservationDialog(host, health);
  });

  container.querySelectorAll('[data-edit-monitoring-metric]').forEach(button => {
    button.addEventListener('click', () => {
      openMonitoringMetricDialog(host, health, button.dataset.editMonitoringMetric);
    });
  });

  container.querySelectorAll('[data-edit-observation]').forEach(button => {
    button.addEventListener('click', () => {
      openObservationDialog(host, health, button.dataset.editObservation);
    });
  });
}

function monitoringMetricCard(metric, health) {
  const rows = health.monitoring.observations
    .filter(item => item.metricId === metric.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const latest = rows[0];

  return `
    <article class="panel health-monitoring-card">
      <div class="panel-body">
        <div class="health-card-head">
          <div>
            <h3>${escapeHtml(metric.name)}</h3>
            <p>${escapeHtml(metric.unit || 'unità non specificata')}</p>
          </div>

          ${canWriteModule('health')
            ? `<button class="icon-button" type="button" data-edit-monitoring-metric="${escapeAttr(metric.id)}" aria-label="Modifica metrica">✎</button>`
            : ''}
        </div>

        <div class="health-monitoring-value">
          <strong>${latest ? formatValue(latest.value, metric.unit) : '—'}</strong>
          <span>${latest ? `${formatDate(latest.date)} · ${escapeHtml(latest.source)}` : 'nessun dato'}</span>
        </div>

        <div class="health-mini-history">
          ${rows.slice(0, 5).map(row => `<span>${formatDate(row.date)} <b>${formatValue(row.value, metric.unit)}</b></span>`).join('')}
        </div>
      </div>
    </article>
  `;
}

function observationRow(row, health) {
  const metric = health.monitoring.metrics.find(item => item.id === row.metricId);

  return `
    <button class="health-observation-row" type="button" data-edit-observation="${escapeAttr(row.id)}">
      <time>${escapeHtml(formatDate(row.date))}</time>
      <span>
        <strong>${escapeHtml(metric?.name || 'Metrica rimossa')}</strong>
        <small>${escapeHtml(row.source)}${row.notes ? ` · ${escapeHtml(row.notes)}` : ''}</small>
      </span>
      <b>${metric ? formatValue(row.value, metric.unit) : formatValue(row.value)}</b>
    </button>
  `;
}

function openMonitoringMetricDialog(host, health, metricId = '') {
  const existing = metricId
    ? health.monitoring.metrics.find(item => item.id === metricId)
    : null;

  const metric = existing || {
    id: uid('monitoring'),
    name: '',
    unit: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-monitoring-metric-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Monitoring</div><h3>${existing ? 'Modifica metrica' : 'Nuova metrica'}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Nome</label><input name="name" value="${escapeAttr(metric.name)}" required /></div>
        <div class="field"><label>Unità</label><input name="unit" value="${escapeAttr(metric.unit)}" placeholder="bpm, ms, h, kg…" /></div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing ? '<button class="button button-danger" id="health-delete-monitoring-metric" type="button">Elimina</button>' : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-monitoring-metric-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    const row = {
      id: metric.id,
      name: String(data.name || '').trim(),
      unit: String(data.unit || '').trim(),
    };

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const index = next.monitoring.metrics.findIndex(item => item.id === row.id);

      if (index >= 0) next.monitoring.metrics[index] = row;
      else next.monitoring.metrics.push(row);

      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.querySelector('#health-delete-monitoring-metric')?.addEventListener('click', async () => {
    const inUse = health.monitoring.observations.some(item => item.metricId === metric.id);

    if (inUse) {
      await showInAppAlert(
        'Questa metrica contiene osservazioni. Elimina prima i dati associati.',
        { title: 'Metrica in uso' },
      );
      return;
    }

    const ok = await showInAppConfirm(
      `Eliminare la metrica “${metric.name}”?`,
      { title: 'Elimina metrica', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.monitoring.metrics = next.monitoring.metrics.filter(item => item.id !== metric.id);
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function openObservationDialog(host, health, observationId = '') {
  if (!health.monitoring.metrics.length) return;

  const existing = observationId
    ? health.monitoring.observations.find(item => item.id === observationId)
    : null;

  const row = existing || {
    id: uid('observation'),
    date: todayKey(),
    metricId: health.monitoring.metrics[0].id,
    value: '',
    source: 'Manual',
    notes: '',
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'planner-dialog health-dialog';

  dialog.innerHTML = `
    <form method="dialog" id="health-observation-form">
      <div class="dialog-head">
        <div><div class="eyebrow">Monitoring</div><h3>${existing ? 'Modifica osservazione' : 'Nuova osservazione'}</h3></div>
        <button class="dialog-close" type="button" data-close>×</button>
      </div>

      <div class="dialog-body form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${escapeAttr(row.date)}" required /></div>

        <div class="field"><label>Fonte</label>
          <select name="source">
            ${MONITORING_SOURCES.map(source => `<option ${row.source === source ? 'selected' : ''}>${escapeHtml(source)}</option>`).join('')}
          </select>
        </div>

        <div class="field"><label>Metrica</label>
          <select name="metricId">
            ${health.monitoring.metrics.map(metric => `<option value="${metric.id}" ${row.metricId === metric.id ? 'selected' : ''}>${escapeHtml(metric.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field"><label>Valore</label><input type="number" step="0.01" name="value" value="${escapeAttr(row.value)}" required /></div>

        <div class="field full"><label>Note</label><textarea name="notes">${escapeHtml(row.notes)}</textarea></div>
      </div>

      <div class="dialog-actions">
        <div>
          ${existing ? '<button class="button button-danger" id="health-delete-observation" type="button">Elimina</button>' : ''}
        </div>

        <div class="dialog-save-actions">
          <button class="button button-ghost" type="button" data-close>Annulla</button>
          <button class="button button-primary" type="submit">Salva</button>
        </div>
      </div>
    </form>
  `;

  host.appendChild(dialog);

  dialog.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.querySelector('#health-observation-form').addEventListener('submit', event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const value = Number(data.value);

    if (!Number.isFinite(value)) return;

    const observation = {
      id: row.id,
      date: data.date,
      metricId: data.metricId,
      value,
      source: data.source || 'Manual',
      notes: String(data.notes || '').trim(),
    };

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      const index = next.monitoring.observations.findIndex(item => item.id === observation.id);

      if (index >= 0) next.monitoring.observations[index] = observation;
      else next.monitoring.observations.push(observation);

      next.monitoring.observations.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.querySelector('#health-delete-observation')?.addEventListener('click', async () => {
    const ok = await showInAppConfirm(
      'Eliminare questa osservazione?',
      { title: 'Elimina osservazione', confirmLabel: 'Elimina', danger: true },
    );

    if (!ok) return;

    store.update(state => {
      const next = normalizeHealthPayload(state.health);
      next.monitoring.observations = next.monitoring.observations.filter(item => item.id !== row.id);
      state.health = next;
    });

    dialog.close();
    renderModule(host);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function options(map, selected) {
  return Object.entries(map)
    .map(([value, label]) => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

async function enhanceCurrentRoute() {
  enhancementQueued = false;

  applyModuleMetadata();
  patchVisibleMetadata();

  if (route() !== 'health') return;

  const host = activeContentHost();
  if (!host) return;

  try {
    await ensureCloud();
  } catch (error) {
    console.warn('health initialization failed.', error);
    setCloudIndicator('error', error?.message || '');
  }

  renderModule(host);
}

function queueEnhancement() {
  if (enhancementQueued) return;

  enhancementQueued = true;

  queueMicrotask(() => {
    void enhanceCurrentRoute();
  });
}

document.addEventListener('click', event => {
  const workspaceButton = event.target.closest?.('[data-module-workspace]');

  if (workspaceButton && route() === 'health') {
    queueEnhancement();
  }
});

window.addEventListener('hashchange', queueEnhancement);

applyModuleMetadata();
patchVisibleMetadata();
queueEnhancement();
