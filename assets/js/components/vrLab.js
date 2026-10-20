import { moduleTitle } from '../data/schema.js?v=1.2.6';
import { canWriteModule, getCurrentAccess } from '../cloud/access.js?v=1.2.24';
import {
  deleteVrSession,
  flushPendingVrSessions,
  loadVrSessions,
  pendingVrSessionCount,
} from '../cloud/vrTrainingCloud.js?v=1.3.0';
import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js?v=1.2.6';

const DIFFICULTY_LABELS = { easy: 'Facile', medium: 'Medio', hard: 'Difficile' };

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function vrUrl(athleteId) {
  const url = new URL('./vr.html', location.href);
  url.hash = '';
  if (athleteId) url.searchParams.set('athlete', athleteId);
  return url.toString();
}

function occlusionText(occlusion) {
  if (!occlusion || occlusion.mode === 'none') return 'Nessuna';
  const offset = Number(occlusion.offsetM || 0);
  if (Math.abs(offset) < 0.01) return 'Alla rete';
  const meters = Math.abs(offset).toFixed(1).replace('.', ',');
  return offset > 0 ? `${meters} m dopo` : `${meters} m prima`;
}

function signed(cm, positive, negative) {
  if (cm == null) return '—';
  if (Math.abs(cm) < 5) return 'centrata';
  return cm > 0 ? `${Math.round(cm)} ${positive}` : `${Math.round(-cm)} ${negative}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function trendSvg(sessions) {
  const points = [...sessions].reverse().filter(s => s.mean_error_cm != null);
  if (points.length < 2) {
    return '<p class="vr-muted">Il grafico compare dopo almeno due serie.</p>';
  }
  const values = points.map(s => Number(s.mean_error_cm));
  const max = Math.max(...values) * 1.1;
  const w = 600;
  const h = 120;
  const pad = 8;
  const x = i => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = v => h - pad - (v / max) * (h - 2 * pad);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `
    <svg class="vr-lab-trend" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
      aria-label="Andamento dell'errore medio: da ${Math.round(values[0])} a ${Math.round(values.at(-1))} cm">
      <path d="${path}" fill="none" stroke="#2b5c9e" stroke-width="2.5" vector-effect="non-scaling-stroke" />
      ${values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="#2b5c9e" vector-effect="non-scaling-stroke"><title>${Math.round(v)} cm</title></circle>`).join('')}
    </svg>
    <p class="vr-muted">Errore medio per serie (cm), dalla più vecchia alla più recente. Più in basso è meglio.</p>
  `;
}

function historyMarkup(sessions, canDelete) {
  if (!sessions.length) {
    return '<p class="vr-muted">Nessuna sessione registrata. Avvia la prima serie dal Meta Quest.</p>';
  }
  return `
    ${trendSvg(sessions)}
    <table class="vr-lab-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Lanci</th>
          <th class="hide-mobile">Occlusione</th>
          <th class="hide-mobile">Difficoltà</th>
          <th>Medio</th>
          <th class="hide-mobile">Mediano</th>
          <th class="hide-mobile">Tendenza</th>
          ${canDelete ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${sessions.map(s => `
          <tr>
            <td class="num">${escapeHtml(formatDate(s.completed_at))}</td>
            <td class="num">${s.trial_count}</td>
            <td class="hide-mobile">${escapeHtml(occlusionText(s.settings?.occlusion))}</td>
            <td class="hide-mobile">${escapeHtml(DIFFICULTY_LABELS[s.settings?.difficulty] || '—')}</td>
            <td class="num"><strong>${s.mean_error_cm == null ? '—' : `${Math.round(s.mean_error_cm)} cm`}</strong></td>
            <td class="num hide-mobile">${s.median_error_cm == null ? '—' : `${Math.round(s.median_error_cm)} cm`}</td>
            <td class="hide-mobile">${escapeHtml(signed(s.summary?.meanDepthBiasCm, 'cm lungo', 'cm corto'))} · ${escapeHtml(signed(s.summary?.meanLateralBiasCm, 'cm dx', 'cm sx'))}</td>
            ${canDelete ? `<td><button type="button" data-vr-delete="${escapeHtml(s.id)}" aria-label="Elimina sessione">✕</button></td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function renderVrLab({ main, title, store }) {
  const athleteId = store.getState().athlete?.id || '';
  const url = vrUrl(athleteId);
  const canLaunch = canWriteModule('vr');
  const canDelete = Boolean(getCurrentAccess().isAdmin);
  title.textContent = moduleTitle('vr');

  main.innerHTML = `
    <div class="section-head">
      <div>
        <h3>VR Lab · Bounce prediction</h3>
        <p>La palla parte dal fondo campo avversario e scompare durante il volo: l’atleta indica con il controller dove rimbalzerà nel suo campo.</p>
      </div>
    </div>

    <section class="vr-lab-grid">
      <article class="panel">
        <div class="panel-header"><h3>Avvio</h3><p>Meta Quest 2/3 · Meta Quest Browser</p></div>
        <div class="panel-body vr-lab-launch">
          ${canLaunch
            ? `<a class="button button-primary" href="${escapeHtml(url)}">Apri VR Lab →</a>`
            : '<p class="vr-notice">Serve il permesso di scrittura sul modulo per avviare una serie.</p>'}
          <ol class="vr-muted">
            <li>Sul visore apri <strong>Meta Quest Browser</strong> ed entra in Tennis Player OS con lo stesso account.</li>
            <li>Apri questo modulo e tocca <strong>Apri VR Lab</strong>, oppure digita l’indirizzo qui sotto.</li>
            <li>Mettiti al centro della linea di fondo, guardando verso la rete, e premi <strong>Entra in VR</strong>.</li>
          </ol>
          <div class="vr-lab-url">
            <code>${escapeHtml(url)}</code>
            <button class="button button-ghost" type="button" data-vr-copy>Copia</button>
          </div>
          <p class="vr-muted" id="vr-lab-pending" hidden></p>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header"><h3>Storico</h3><p>Errore medio tra punto indicato e rimbalzo reale.</p></div>
        <div class="panel-body" id="vr-lab-history"><p class="vr-muted">Caricamento…</p></div>
      </article>
    </section>
  `;

  main.querySelector('[data-vr-copy]')?.addEventListener('click', async event => {
    try {
      await navigator.clipboard.writeText(url);
      event.currentTarget.textContent = 'Copiato';
    } catch (_) {
      void showInAppAlert(url, { title: 'Indirizzo VR Lab' });
    }
  });

  const historyHost = main.querySelector('#vr-lab-history');

  async function refresh() {
    if (!historyHost.isConnected) return;
    try {
      await flushPendingVrSessions();
      const pending = pendingVrSessionCount(athleteId);
      const pendingNote = main.querySelector('#vr-lab-pending');
      if (pendingNote) {
        pendingNote.hidden = !pending;
        pendingNote.textContent = `${pending} sessione/i in attesa di salvataggio su questo dispositivo.`;
      }
      const sessions = await loadVrSessions(athleteId);
      if (!historyHost.isConnected) return;
      historyHost.innerHTML = historyMarkup(sessions, canDelete);
      historyHost.querySelectorAll('[data-vr-delete]').forEach(button => {
        button.addEventListener('click', async () => {
          const confirmed = await showInAppConfirm('La sessione VR verrà eliminata definitivamente.', {
            title: 'Eliminare la sessione?',
            confirmLabel: 'Elimina',
            danger: true,
          });
          if (!confirmed) return;
          try {
            await deleteVrSession(button.dataset.vrDelete);
            await refresh();
          } catch (error) {
            void showInAppAlert(error.message, { title: 'Errore' });
          }
        });
      });
    } catch (error) {
      historyHost.innerHTML = `<p class="vr-notice">${escapeHtml(error.message)}</p>`;
    }
  }

  void refresh();
}
