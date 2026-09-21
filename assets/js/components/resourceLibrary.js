import { showInAppAlert, showInAppConfirm } from '../ui/inAppMessages.js';
import { fileProvider } from '../data/providers/provider.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;

let activeObjectUrl = '';

export async function renderResourceLibrary({ main, title, moduleId, moduleName, athleteId = '' }) {
  title.textContent = `${moduleName} · Libreria`;
  main.innerHTML = `
    <section class="resource-library-head">
      <div>
        <div class="eyebrow">Libreria</div>
        <h2>File, link e video</h2>
        <p>Materiale di riferimento del modulo. File e link sono gestiti dal provider della Libreria; i video YouTube possono essere visualizzati direttamente nell’app.</p>
      </div>
      <button class="button button-primary" id="resource-new" type="button">+ Aggiungi risorsa</button>
    </section>

    <section class="resource-library-toolbar panel">
      <div class="resource-search-wrap">
        <label for="resource-search">Cerca</label>
        <input id="resource-search" type="search" placeholder="Titolo, note, nome file…" autocomplete="off" />
      </div>
      <div class="resource-local-note">${escapeHtml(fileProvider.getInfo().label)}</div>
    </section>

    <section id="resource-library-grid" class="resource-library-grid" aria-live="polite">
      <div class="resource-loading">Caricamento libreria…</div>
    </section>

    ${resourceDialog()}
    ${previewDialog()}
  `;

  const dialog = main.querySelector('#resource-dialog');
  const form = main.querySelector('#resource-form');
  const kindSelect = form.elements.kind;
  const fileField = main.querySelector('#resource-file-field');
  const linkField = main.querySelector('#resource-link-field');
  const grid = main.querySelector('#resource-library-grid');
  const search = main.querySelector('#resource-search');
  let resources = [];

  const syncKind = () => {
    const isFile = kindSelect.value === 'file';
    fileField.hidden = !isFile;
    linkField.hidden = isFile;
    form.elements.file.required = isFile;
    form.elements.url.required = !isFile;
  };

  const refresh = async () => {
    try {
      resources = (await fileProvider.listResources(moduleId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      paint();
    } catch (error) {
      console.error(error);
      grid.innerHTML = `<div class="panel resource-empty-panel"><strong>Impossibile aprire la Libreria.</strong><p>Il provider dei file non è disponibile in questo momento.</p></div>`;
    }
  };

  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase('it');
    const visible = resources.filter(resource => {
      if (!query) return true;
      return [resource.title, resource.notes, resource.fileName, resource.url]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('it')
        .includes(query);
    });
    grid.innerHTML = visible.length
      ? visible.map(renderResourceCard).join('')
      : `<div class="panel resource-empty-panel"><strong>${resources.length ? 'Nessun risultato' : 'Libreria vuota'}</strong><p>${resources.length ? 'Prova con un’altra ricerca.' : 'Aggiungi PDF, immagini, documenti, link o video YouTube utili per questo modulo.'}</p></div>`;
    bindCards();
  };

  const bindCards = () => {
    grid.querySelectorAll('[data-resource-open]').forEach(button => {
      button.addEventListener('click', async () => {
        const resource = resources.find(item => item.id === button.dataset.resourceOpen);
        if (resource) await openResourcePreview({ main, resource });
      });
    });
    grid.querySelectorAll('[data-resource-delete]').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        const resource = resources.find(item => item.id === button.dataset.resourceDelete);
        if (!resource) return;
        const ok = await showInAppConfirm(`Eliminare “${resource.title || resource.fileName || 'questa risorsa'}” dalla libreria?`, {
          title: 'Elimina risorsa', confirmLabel: 'Elimina', danger: true,
        });
        if (!ok) return;
        await fileProvider.deleteResource(resource.id);
        await refresh();
      });
    });
  };

  main.querySelector('#resource-new').addEventListener('click', () => {
    form.reset();
    kindSelect.value = 'link';
    syncKind();
    dialog.showModal();
  });
  main.querySelectorAll('[data-resource-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  kindSelect.addEventListener('change', syncKind);
  search.addEventListener('input', paint);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const kind = kindSelect.value;
    const titleValue = form.elements.title.value.trim();
    const notes = form.elements.notes.value.trim();

    try {
      if (kind === 'file') {
        const file = form.elements.file.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
          await showInAppAlert('Il file supera 200 MB. Per i video di grandi dimensioni è preferibile salvare un link esterno o YouTube.', { title: 'File troppo grande' });
          return;
        }
        await fileProvider.putResource({
          id: uid('res'), moduleId, athleteId, kind: 'file',
          title: titleValue || file.name,
          notes,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          fileBlob: file,
          createdAt: new Date().toISOString(),
        });
      } else {
        const rawUrl = form.elements.url.value.trim();
        const normalizedUrl = normalizeHttpUrl(rawUrl);
        if (!normalizedUrl) {
          await showInAppAlert('Inserisci un indirizzo web valido che inizi con http:// o https://.', { title: 'Link non valido' });
          return;
        }
        const youtubeId = getYouTubeId(normalizedUrl);
        const inferredTitle = titleValue || (youtubeId ? 'Video YouTube' : hostnameLabel(normalizedUrl));
        await fileProvider.putResource({
          id: uid('res'), moduleId, athleteId, kind: 'link',
          linkType: youtubeId ? 'youtube' : 'web',
          youtubeId: youtubeId || '',
          title: inferredTitle,
          notes,
          url: normalizedUrl,
          createdAt: new Date().toISOString(),
        });
      }
      dialog.close();
      await refresh();
    } catch (error) {
      console.error(error);
      await showInAppAlert('Non sono riuscito a salvare la risorsa sul dispositivo.', { title: 'Salvataggio non riuscito' });
    }
  });

  main.querySelector('#resource-preview-dialog').addEventListener('close', cleanupPreviewUrl);
  syncKind();
  await refresh();
}

function resourceDialog() {
  return `
    <dialog class="planner-dialog resource-dialog" id="resource-dialog">
      <form id="resource-form">
        <div class="dialog-head">
          <div><div class="eyebrow">Libreria</div><h3>Aggiungi risorsa</h3></div>
          <button class="dialog-close" type="button" data-resource-close aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field">
            <label>Tipo</label>
            <select name="kind">
              <option value="link">Link / YouTube</option>
              <option value="file">File locale</option>
            </select>
          </div>
          <div class="field"><label>Titolo <span class="field-optional">opzionale</span></label><input name="title" placeholder="Titolo della risorsa" /></div>
          <div class="field full" id="resource-link-field"><label>URL</label><input name="url" type="url" placeholder="https://…" /></div>
          <div class="field full" id="resource-file-field" hidden><label>File</label><input name="file" type="file" /></div>
          <div class="field full"><label>Note</label><textarea name="notes" placeholder="Perché è utile, cosa guardare, riferimenti…"></textarea></div>
        </div>
        <div class="dialog-actions">
          <span></span>
          <div class="dialog-save-actions">
            <button class="button button-ghost" type="button" data-resource-close>Annulla</button>
            <button class="button button-primary" type="submit">Salva</button>
          </div>
        </div>
      </form>
    </dialog>
  `;
}

function previewDialog() {
  return `
    <dialog class="resource-preview-dialog" id="resource-preview-dialog">
      <div class="resource-preview-head">
        <div><div class="eyebrow" id="resource-preview-type">Risorsa</div><h3 id="resource-preview-title">Anteprima</h3></div>
        <button class="dialog-close" type="button" data-preview-close aria-label="Chiudi">×</button>
      </div>
      <div id="resource-preview-body" class="resource-preview-body"></div>
      <div class="resource-preview-footer" id="resource-preview-footer"></div>
    </dialog>
  `;
}

function renderResourceCard(resource) {
  const type = resource.kind === 'file' ? fileTypeLabel(resource) : (resource.linkType === 'youtube' ? 'YouTube' : 'Link');
  const meta = resource.kind === 'file'
    ? [resource.fileName, formatBytes(resource.size)].filter(Boolean).join(' · ')
    : hostnameLabel(resource.url || '');
  const icon = resource.kind === 'file' ? fileIcon(resource.mimeType) : (resource.linkType === 'youtube' ? '▶' : '↗');
  return `
    <article class="panel resource-card">
      <button class="resource-card-main" type="button" data-resource-open="${escapeAttr(resource.id)}">
        <span class="resource-card-icon type-${escapeAttr(resource.kind === 'file' ? 'file' : resource.linkType || 'web')}">${icon}</span>
        <span class="resource-card-copy">
          <span class="resource-card-type">${escapeHtml(type)}</span>
          <strong>${escapeHtml(resource.title || resource.fileName || 'Risorsa')}</strong>
          <span class="resource-card-meta">${escapeHtml(meta || 'Risorsa salvata')}</span>
          ${resource.notes ? `<span class="resource-card-notes">${escapeHtml(resource.notes)}</span>` : ''}
        </span>
      </button>
      <div class="resource-card-actions">
        <span>${escapeHtml(formatDate(resource.createdAt))}</span>
        <button type="button" class="resource-delete" data-resource-delete="${escapeAttr(resource.id)}" aria-label="Elimina risorsa">Elimina</button>
      </div>
    </article>
  `;
}

async function openResourcePreview({ main, resource }) {
  const dialog = main.querySelector('#resource-preview-dialog');
  const body = main.querySelector('#resource-preview-body');
  const footer = main.querySelector('#resource-preview-footer');
  cleanupPreviewUrl();
  main.querySelector('#resource-preview-title').textContent = resource.title || resource.fileName || 'Risorsa';
  main.querySelector('#resource-preview-type').textContent = resource.kind === 'file' ? 'File locale' : (resource.linkType === 'youtube' ? 'YouTube' : 'Link');
  main.querySelectorAll('[data-preview-close]').forEach(button => button.onclick = () => dialog.close());

  if (resource.kind === 'link' && resource.linkType === 'youtube' && resource.youtubeId) {
    body.innerHTML = `<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(resource.youtubeId)}?rel=0" title="${escapeAttr(resource.title || 'Video YouTube')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>${resource.notes ? `<p class="resource-preview-notes">${escapeHtml(resource.notes)}</p>` : ''}`;
    footer.innerHTML = `<a class="button button-ghost" href="${escapeAttr(resource.url)}" target="_blank" rel="noopener noreferrer">Apri su YouTube ↗</a>`;
  } else if (resource.kind === 'link') {
    body.innerHTML = `<div class="resource-link-preview"><div class="resource-link-host">${escapeHtml(hostnameLabel(resource.url))}</div><p>${escapeHtml(resource.notes || 'Questo link si apre nel browser.')}</p></div>`;
    footer.innerHTML = `<a class="button button-primary" href="${escapeAttr(resource.url)}" target="_blank" rel="noopener noreferrer">Apri link ↗</a>`;
  } else {
    const stored = await fileProvider.getResource(resource.id);
    if (!stored?.fileBlob) {
      await showInAppAlert('Il file non è più disponibile nella memoria locale.', { title: 'File non disponibile' });
      return;
    }
    activeObjectUrl = URL.createObjectURL(stored.fileBlob);
    const mime = stored.mimeType || stored.fileBlob.type || '';
    if (mime.startsWith('image/')) {
      body.innerHTML = `<div class="resource-image-preview"><img src="${activeObjectUrl}" alt="${escapeAttr(stored.title || stored.fileName || 'Anteprima immagine')}" /></div>${stored.notes ? `<p class="resource-preview-notes">${escapeHtml(stored.notes)}</p>` : ''}`;
    } else if (mime === 'application/pdf') {
      body.innerHTML = `<iframe class="resource-document-preview" src="${activeObjectUrl}" title="${escapeAttr(stored.title || stored.fileName || 'PDF')}"></iframe>`;
    } else if (mime.startsWith('video/')) {
      body.innerHTML = `<video class="resource-media-preview" controls src="${activeObjectUrl}"></video>${stored.notes ? `<p class="resource-preview-notes">${escapeHtml(stored.notes)}</p>` : ''}`;
    } else if (mime.startsWith('audio/')) {
      body.innerHTML = `<div class="resource-audio-preview"><audio controls src="${activeObjectUrl}"></audio></div>${stored.notes ? `<p class="resource-preview-notes">${escapeHtml(stored.notes)}</p>` : ''}`;
    } else if (mime.startsWith('text/')) {
      const text = await stored.fileBlob.text();
      body.innerHTML = `<pre class="resource-text-preview">${escapeHtml(text.slice(0, 200000))}</pre>`;
    } else {
      body.innerHTML = `<div class="resource-generic-preview"><div class="resource-generic-icon">▤</div><strong>${escapeHtml(stored.fileName || 'File')}</strong><p>Anteprima non disponibile per questo formato.</p></div>`;
    }
    footer.innerHTML = `<a class="button button-primary" href="${activeObjectUrl}" download="${escapeAttr(stored.fileName || stored.title || 'file')}">Apri / salva file</a>`;
  }
  dialog.showModal();
}

function cleanupPreviewUrl() {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = '';
  }
}


function getYouTubeId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return cleanYouTubeId(url.pathname.split('/').filter(Boolean)[0]);
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') return cleanYouTubeId(url.searchParams.get('v'));
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return cleanYouTubeId(parts[1]);
    }
  } catch (_) {}
  return '';
}

function cleanYouTubeId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : '';
}

function normalizeHttpUrl(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function hostnameLabel(rawUrl) {
  try { return new URL(rawUrl).hostname.replace(/^www\./, ''); }
  catch (_) { return rawUrl || 'Link'; }
}

function fileIcon(mime = '') {
  if (mime.startsWith('image/')) return '▧';
  if (mime.startsWith('video/')) return '▶';
  if (mime.startsWith('audio/')) return '♪';
  if (mime === 'application/pdf') return 'PDF';
  return '▤';
}

function fileTypeLabel(resource) {
  const mime = resource.mimeType || '';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Immagine';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('text/')) return 'Testo';
  return 'File';
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function escapeAttr(value = '') { return escapeHtml(value); }
