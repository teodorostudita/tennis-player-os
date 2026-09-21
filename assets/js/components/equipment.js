import { showInAppConfirm } from '../ui/inAppMessages.js';

const RACKET_STATUSES = {
  active: 'In uso',
  spare: 'Riserva',
  test: 'In test',
  retired: 'Dismessa',
};

const STRING_STATUSES = {
  installed: 'Montata',
  replaced: 'Sostituita',
  broken: 'Rotta',
  cut: 'Tagliata',
};

const SHOE_STATUSES = {
  active: 'In uso',
  rotation: 'Rotazione',
  test: 'In test',
  retired: 'Dismesse',
};

const SHOE_SURFACES = ['Terra', 'Cemento', 'All court', 'Indoor', 'Erba', 'Altro'];

let equipmentSection = 'setup';

export function renderEquipment({ main, title, store }) {
  title.textContent = '6. Equipment';
  const equipment = normalizeEquipment(store.getState().equipment);

  main.innerHTML = `
    <section class="equipment-module-head">
      <div>
        <div class="eyebrow">Equipment</div>
        <h2>Materiali e configurazioni</h2>
        <p>Un inventario tecnico del materiale dell’atleta: telai individuali, incordature e scarpe, con una configurazione corrente chiaramente identificata.</p>
      </div>
      <div class="equipment-section-switch" role="tablist" aria-label="Sezione equipment">
        ${sectionButton('setup', 'Setup attuale')}
        ${sectionButton('rackets', 'Racchette')}
        ${sectionButton('strings', 'Incordature')}
        ${sectionButton('shoes', 'Scarpe')}
      </div>
    </section>

    <div id="equipment-section-content">
      ${renderSection(equipment)}
    </div>

    ${renderRacketDialog()}
    ${renderStringDialog(equipment.rackets)}
    ${renderShoeDialog()}
  `;

  bindEquipment({ main, store });
}

function normalizeEquipment(equipment = {}) {
  return {
    primaryRacketId: equipment.primaryRacketId || '',
    primaryShoeId: equipment.primaryShoeId || '',
    rackets: Array.isArray(equipment.rackets) ? equipment.rackets : [],
    stringJobs: Array.isArray(equipment.stringJobs) ? equipment.stringJobs : [],
    shoes: Array.isArray(equipment.shoes) ? equipment.shoes : [],
  };
}

function renderSection(equipment) {
  if (equipmentSection === 'rackets') return renderRackets(equipment);
  if (equipmentSection === 'strings') return renderStrings(equipment);
  if (equipmentSection === 'shoes') return renderShoes(equipment);
  return renderCurrentSetup(equipment);
}

function sectionButton(section, label) {
  return `<button type="button" class="equipment-section-button ${equipmentSection === section ? 'active' : ''}" data-equipment-section="${section}">${label}</button>`;
}

function renderCurrentSetup(equipment) {
  const primaryRacket = equipment.rackets.find(r => r.id === equipment.primaryRacketId) || null;
  const primaryShoe = equipment.shoes.find(s => s.id === equipment.primaryShoeId) || null;
  const currentString = primaryRacket ? getCurrentStringJob(primaryRacket.id, equipment.stringJobs) : null;

  return `
    <section class="equipment-kpis" aria-label="Riepilogo equipment">
      <div class="equipment-kpi"><span>Telai</span><strong>${equipment.rackets.filter(r => r.status !== 'retired').length}</strong></div>
      <div class="equipment-kpi"><span>In uso</span><strong>${equipment.rackets.filter(r => r.status === 'active').length}</strong></div>
      <div class="equipment-kpi"><span>Incordature registrate</span><strong>${equipment.stringJobs.length}</strong></div>
      <div class="equipment-kpi"><span>Scarpe attive</span><strong>${equipment.shoes.filter(s => ['active','rotation'].includes(s.status)).length}</strong></div>
    </section>

    <section class="equipment-current-grid">
      <article class="panel equipment-current-card">
        <div class="equipment-card-kicker">Racchetta principale</div>
        ${primaryRacket ? `
          <div class="equipment-current-title">${escapeHtml(racketName(primaryRacket))}</div>
          <div class="equipment-spec-grid">
            ${spec('Peso', formatUnit(primaryRacket.weightG, 'g'))}
            ${spec('Bilanciamento', formatUnit(primaryRacket.balanceMm, 'mm'))}
            ${spec('Schema corde', primaryRacket.stringPattern || '—')}
            ${spec('Grip', primaryRacket.gripSize || '—')}
          </div>
          ${primaryRacket.customization ? `<div class="equipment-note"><strong>Custom</strong><span>${escapeHtml(primaryRacket.customization)}</span></div>` : ''}
          <button type="button" class="button button-ghost equipment-inline-action" data-edit-racket="${escapeAttr(primaryRacket.id)}">Modifica telaio</button>
        ` : emptySetup('Nessuna racchetta principale', 'Aggiungi un telaio e impostalo come principale.', 'rackets')}
      </article>

      <article class="panel equipment-current-card">
        <div class="equipment-card-kicker">Incordatura corrente</div>
        ${currentString ? `
          <div class="equipment-current-title">${escapeHtml(currentString.stringName || 'Corda non specificata')}</div>
          <div class="equipment-string-tension">${escapeHtml(formatTension(currentString))}</div>
          <div class="equipment-spec-grid compact">
            ${spec('Calibro', currentString.gaugeMm ? `${escapeHtml(currentString.gaugeMm)} mm` : '—')}
            ${spec('Montata', formatDate(currentString.date))}
            ${spec('Ore uso', currentString.hoursUsed !== '' && currentString.hoursUsed != null ? `${escapeHtml(currentString.hoursUsed)} h` : '—')}
            ${spec('Stato', STRING_STATUSES[currentString.status] || currentString.status || '—')}
          </div>
          <button type="button" class="button button-ghost equipment-inline-action" data-edit-string="${escapeAttr(currentString.id)}">Apri incordatura</button>
        ` : emptySetup('Nessuna incordatura attiva', primaryRacket ? 'Registra la corda montata sul telaio principale.' : 'Serve prima una racchetta principale.', primaryRacket ? 'strings' : 'rackets')}
      </article>

      <article class="panel equipment-current-card">
        <div class="equipment-card-kicker">Scarpe principali</div>
        ${primaryShoe ? `
          <div class="equipment-current-title">${escapeHtml(shoeName(primaryShoe))}</div>
          <div class="equipment-spec-grid">
            ${spec('Superficie', primaryShoe.surface || '—')}
            ${spec('Taglia', primaryShoe.size || '—')}
            ${spec('In uso dal', formatDate(primaryShoe.startDate))}
            ${spec('Stato', SHOE_STATUSES[primaryShoe.status] || primaryShoe.status || '—')}
          </div>
          <button type="button" class="button button-ghost equipment-inline-action" data-edit-shoe="${escapeAttr(primaryShoe.id)}">Modifica scarpe</button>
        ` : emptySetup('Nessuna scarpa principale', 'Aggiungi un paio e impostalo come principale.', 'shoes')}
      </article>
    </section>

    <section class="panel equipment-philosophy">
      <div class="panel-header">
        <h3>Principio del modulo</h3>
        <p>Ogni telaio è un oggetto individuale, non solo un modello commerciale.</p>
      </div>
      <div class="panel-body equipment-principle-grid">
        <div><strong>1 · Telaio</strong><span>Specifiche e customizzazione stabili del singolo frame.</span></div>
        <div><strong>2 · Incordatura</strong><span>Ogni nuova incordatura viene collegata a quel telaio e resta nello storico.</span></div>
        <div><strong>3 · Utilizzo</strong><span>Athletics e Competition potranno poi registrare quale setup è stato realmente usato.</span></div>
      </div>
    </section>
  `;
}

function renderRackets(equipment) {
  return `
    <section class="equipment-subhead">
      <div><div class="eyebrow">Racket inventory</div><h2>Racchette</h2><p>Registra ogni telaio singolarmente, anche quando più racchette sono dello stesso modello.</p></div>
      <button type="button" class="button button-primary" id="new-racket">+ Nuova racchetta</button>
    </section>
    ${equipment.rackets.length ? `
      <section class="equipment-list-grid">
        ${equipment.rackets.map(racket => renderRacketCard(racket, equipment)).join('')}
      </section>
    ` : renderEmptyPanel('Nessuna racchetta', 'Aggiungi il primo telaio dell’atleta.', 'new-racket-empty', '+ Nuova racchetta')}
  `;
}

function renderRacketCard(racket, equipment) {
  const currentString = getCurrentStringJob(racket.id, equipment.stringJobs);
  const primary = racket.id === equipment.primaryRacketId;
  return `
    <article class="panel equipment-item-card ${primary ? 'is-primary' : ''}">
      <div class="equipment-item-topline">
        <div>
          <span class="equipment-status status-${escapeAttr(racket.status || 'spare')}">${escapeHtml(RACKET_STATUSES[racket.status] || racket.status || 'Riserva')}</span>
          ${primary ? '<span class="equipment-primary-chip">Principale</span>' : ''}
        </div>
        <button type="button" class="equipment-more-button" data-edit-racket="${escapeAttr(racket.id)}">Modifica</button>
      </div>
      <h3>${escapeHtml(racketName(racket))}</h3>
      ${racket.label ? `<p class="equipment-item-label">${escapeHtml(racket.label)}</p>` : ''}
      <div class="equipment-spec-grid">
        ${spec('Lunghezza', racket.lengthIn ? `${escapeHtml(racket.lengthIn)}″` : '—')}
        ${spec('Peso', formatUnit(racket.weightG, 'g'))}
        ${spec('Bilanciamento', formatUnit(racket.balanceMm, 'mm'))}
        ${spec('Schema corde', racket.stringPattern || '—')}
        ${spec('Grip', racket.gripSize || '—')}
        ${spec('Swingweight', racket.swingweight || '—')}
      </div>
      ${racket.customization ? `<div class="equipment-note"><strong>Custom</strong><span>${escapeHtml(racket.customization)}</span></div>` : ''}
      <div class="equipment-current-string-row">
        <span>Incordatura</span>
        <strong>${currentString ? `${escapeHtml(currentString.stringName || '—')} · ${escapeHtml(formatTension(currentString))}` : 'Nessuna montata'}</strong>
      </div>
      ${!primary && racket.status !== 'retired' ? `<button type="button" class="button button-ghost" data-set-primary-racket="${escapeAttr(racket.id)}">Imposta come principale</button>` : ''}
    </article>
  `;
}

function renderStrings(equipment) {
  const jobs = [...equipment.stringJobs].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  return `
    <section class="equipment-subhead">
      <div><div class="eyebrow">Stringing log</div><h2>Incordature</h2><p>Storico delle corde montate sui singoli telai: tipo, tensione, data e ore di utilizzo.</p></div>
      <button type="button" class="button button-primary" id="new-string">+ Nuova incordatura</button>
    </section>
    ${equipment.rackets.length ? '' : `<div class="equipment-inline-warning">Prima di registrare un’incordatura devi creare almeno una racchetta.</div>`}
    ${jobs.length ? `
      <section class="panel equipment-table-panel">
        <div class="equipment-table-scroll">
          <table class="equipment-table">
            <thead><tr><th>Data</th><th>Telaio</th><th>Corda</th><th>Tensione</th><th>Ore</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              ${jobs.map(job => renderStringRow(job, equipment.rackets)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    ` : renderEmptyPanel('Nessuna incordatura registrata', equipment.rackets.length ? 'Registra la prima incordatura per iniziare lo storico.' : 'Aggiungi prima una racchetta.', equipment.rackets.length ? 'new-string-empty' : '', equipment.rackets.length ? '+ Nuova incordatura' : '')}
  `;
}

function renderStringRow(job, rackets) {
  const racket = rackets.find(r => r.id === job.racketId);
  return `
    <tr>
      <td>${escapeHtml(formatDate(job.date))}</td>
      <td><strong>${escapeHtml(racket ? racketShortName(racket) : 'Telaio eliminato')}</strong></td>
      <td>${escapeHtml(job.stringName || '—')}${job.gaugeMm ? `<span class="table-sub">${escapeHtml(job.gaugeMm)} mm</span>` : ''}</td>
      <td><strong>${escapeHtml(formatTension(job))}</strong></td>
      <td>${job.hoursUsed !== '' && job.hoursUsed != null ? `${escapeHtml(job.hoursUsed)} h` : '—'}</td>
      <td><span class="equipment-status string-${escapeAttr(job.status || 'replaced')}">${escapeHtml(STRING_STATUSES[job.status] || job.status || '—')}</span></td>
      <td><button type="button" class="equipment-more-button" data-edit-string="${escapeAttr(job.id)}">Modifica</button></td>
    </tr>
  `;
}

function renderShoes(equipment) {
  return `
    <section class="equipment-subhead">
      <div><div class="eyebrow">Footwear</div><h2>Scarpe</h2><p>Rotazione delle scarpe per superficie, data di entrata in uso e stato del paio.</p></div>
      <button type="button" class="button button-primary" id="new-shoe">+ Nuove scarpe</button>
    </section>
    ${equipment.shoes.length ? `
      <section class="equipment-list-grid equipment-shoes-grid">
        ${equipment.shoes.map(shoe => renderShoeCard(shoe, equipment)).join('')}
      </section>
    ` : renderEmptyPanel('Nessuna scarpa registrata', 'Aggiungi il primo paio dell’atleta.', 'new-shoe-empty', '+ Nuove scarpe')}
  `;
}

function renderShoeCard(shoe, equipment) {
  const primary = shoe.id === equipment.primaryShoeId;
  return `
    <article class="panel equipment-item-card ${primary ? 'is-primary' : ''}">
      <div class="equipment-item-topline">
        <div>
          <span class="equipment-status shoe-${escapeAttr(shoe.status || 'active')}">${escapeHtml(SHOE_STATUSES[shoe.status] || shoe.status || 'In uso')}</span>
          ${primary ? '<span class="equipment-primary-chip">Principali</span>' : ''}
        </div>
        <button type="button" class="equipment-more-button" data-edit-shoe="${escapeAttr(shoe.id)}">Modifica</button>
      </div>
      <h3>${escapeHtml(shoeName(shoe))}</h3>
      <div class="equipment-spec-grid">
        ${spec('Superficie', shoe.surface || '—')}
        ${spec('Taglia', shoe.size || '—')}
        ${spec('In uso dal', formatDate(shoe.startDate))}
        ${spec('Ore uso', shoe.hoursUsed !== '' && shoe.hoursUsed != null ? `${escapeHtml(shoe.hoursUsed)} h` : '—')}
      </div>
      ${shoe.notes ? `<div class="equipment-note"><strong>Note</strong><span>${escapeHtml(shoe.notes)}</span></div>` : ''}
      ${!primary && shoe.status !== 'retired' ? `<button type="button" class="button button-ghost" data-set-primary-shoe="${escapeAttr(shoe.id)}">Imposta come principali</button>` : ''}
    </article>
  `;
}

function renderEmptyPanel(title, copy, buttonId, buttonLabel) {
  return `
    <section class="panel equipment-empty-panel">
      <div class="equipment-empty-icon">🎾</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
      ${buttonId && buttonLabel ? `<button type="button" class="button button-primary" id="${escapeAttr(buttonId)}">${escapeHtml(buttonLabel)}</button>` : ''}
    </section>
  `;
}

function emptySetup(title, copy, targetSection) {
  return `
    <div class="equipment-empty-current">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(copy)}</span>
      <button type="button" class="button button-ghost" data-go-equipment="${escapeAttr(targetSection)}">Vai a ${targetSection === 'strings' ? 'incordature' : targetSection === 'shoes' ? 'scarpe' : 'racchette'}</button>
    </div>
  `;
}

function renderRacketDialog() {
  return `
    <dialog id="racket-dialog" class="planner-dialog">
      <form id="racket-form" method="dialog">
        <input type="hidden" name="id" />
        <div class="dialog-head">
          <div><div class="eyebrow">Equipment · Racket</div><h3 id="racket-dialog-title">Nuova racchetta</h3></div>
          <button type="button" class="dialog-close" data-close-racket aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field"><label>Marca</label><input name="brand" placeholder="es. Yonex" /></div>
          <div class="field"><label>Modello</label><input name="model" required placeholder="es. VCORE 26" /></div>
          <div class="field full"><label>Nome / identificativo telaio</label><input name="label" placeholder="es. R1, Gara #1, Telaio rosso" /></div>
          <div class="field"><label>Lunghezza (pollici)</label><input name="lengthIn" type="number" min="20" max="30" step="0.1" /></div>
          <div class="field"><label>Peso statico (g)</label><input name="weightG" type="number" min="150" max="450" step="0.1" /></div>
          <div class="field"><label>Bilanciamento (mm)</label><input name="balanceMm" type="number" min="200" max="400" step="0.1" /></div>
          <div class="field"><label>Swingweight</label><input name="swingweight" type="number" min="100" max="500" step="1" /></div>
          <div class="field"><label>Schema corde</label><input name="stringPattern" placeholder="es. 16×19" /></div>
          <div class="field"><label>Grip</label><input name="gripSize" placeholder="es. L2" /></div>
          <div class="field"><label>Stato</label><select name="status">${options(RACKET_STATUSES)}</select></div>
          <div class="field full"><label>Customizzazione</label><textarea name="customization" placeholder="es. +3 g ore 3 e +3 g ore 9; overgrip; piombo sotto grip..."></textarea></div>
          <div class="field full"><label>Note</label><textarea name="notes" placeholder="Comfort, differenze rispetto agli altri telai, misure effettuate..."></textarea></div>
          <div class="field full"><label class="checkbox-row"><input type="checkbox" name="makePrimary" /> Imposta come racchetta principale</label></div>
        </div>
        <div class="dialog-actions">
          <div><button type="button" class="button button-danger" id="delete-racket" hidden>Elimina</button></div>
          <div class="dialog-save-actions"><button type="button" class="button button-ghost" data-close-racket>Annulla</button><button type="submit" class="button button-primary">Salva racchetta</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function renderStringDialog(rackets) {
  return `
    <dialog id="string-dialog" class="planner-dialog">
      <form id="string-form" method="dialog">
        <input type="hidden" name="id" />
        <div class="dialog-head">
          <div><div class="eyebrow">Equipment · Stringing</div><h3 id="string-dialog-title">Nuova incordatura</h3></div>
          <button type="button" class="dialog-close" data-close-string aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field full"><label>Racchetta</label><select name="racketId" required><option value="">— Seleziona —</option>${rackets.map(r => `<option value="${escapeAttr(r.id)}">${escapeHtml(racketName(r))}</option>`).join('')}</select></div>
          <div class="field"><label>Data incordatura</label><input name="date" type="date" required /></div>
          <div class="field"><label>Stato</label><select name="status">${options(STRING_STATUSES)}</select></div>
          <div class="field full"><label>Corda</label><input name="stringName" required placeholder="es. Luxilon Element" /></div>
          <div class="field"><label>Calibro (mm)</label><input name="gaugeMm" inputmode="decimal" placeholder="es. 1.25" /></div>
          <div class="field"><label>Incordatore</label><input name="stringer" placeholder="Nome / negozio" /></div>
          <div class="field"><label>Tensione verticali (kg)</label><input name="mainsKg" type="number" min="5" max="40" step="0.1" required /></div>
          <div class="field"><label>Tensione orizzontali (kg)</label><input name="crossesKg" type="number" min="5" max="40" step="0.1" required /></div>
          <div class="field"><label>Ore di utilizzo</label><input name="hoursUsed" type="number" min="0" max="500" step="0.5" /></div>
          <div class="field"><label>Pre-stretch</label><input name="preStretch" placeholder="es. 0%, 10%" /></div>
          <div class="field full"><label>Note</label><textarea name="notes" placeholder="Comfort, controllo, spin, perdita di tensione, motivo sostituzione..."></textarea></div>
          <div class="field full"><label class="checkbox-row"><input type="checkbox" name="makeCurrent" checked /> Considera questa l’incordatura attualmente montata sul telaio</label></div>
        </div>
        <div class="dialog-actions">
          <div><button type="button" class="button button-danger" id="delete-string" hidden>Elimina</button></div>
          <div class="dialog-save-actions"><button type="button" class="button button-ghost" data-close-string>Annulla</button><button type="submit" class="button button-primary">Salva incordatura</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function renderShoeDialog() {
  return `
    <dialog id="shoe-dialog" class="planner-dialog">
      <form id="shoe-form" method="dialog">
        <input type="hidden" name="id" />
        <div class="dialog-head">
          <div><div class="eyebrow">Equipment · Shoes</div><h3 id="shoe-dialog-title">Nuove scarpe</h3></div>
          <button type="button" class="dialog-close" data-close-shoe aria-label="Chiudi">×</button>
        </div>
        <div class="dialog-body form-grid">
          <div class="field"><label>Marca</label><input name="brand" placeholder="es. Yonex" /></div>
          <div class="field"><label>Modello</label><input name="model" required /></div>
          <div class="field"><label>Superficie</label><select name="surface">${SHOE_SURFACES.map(v => `<option>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Taglia</label><input name="size" placeholder="es. EU 39" /></div>
          <div class="field"><label>In uso dal</label><input name="startDate" type="date" /></div>
          <div class="field"><label>Ore di utilizzo</label><input name="hoursUsed" type="number" min="0" max="1000" step="0.5" /></div>
          <div class="field"><label>Stato</label><select name="status">${options(SHOE_STATUSES)}</select></div>
          <div class="field full"><label>Note</label><textarea name="notes" placeholder="Calzata, usura, comfort, supporto, eventuali problemi..."></textarea></div>
          <div class="field full"><label class="checkbox-row"><input type="checkbox" name="makePrimary" /> Imposta come scarpe principali</label></div>
        </div>
        <div class="dialog-actions">
          <div><button type="button" class="button button-danger" id="delete-shoe" hidden>Elimina</button></div>
          <div class="dialog-save-actions"><button type="button" class="button button-ghost" data-close-shhoe data-close-shoe>Annulla</button><button type="submit" class="button button-primary">Salva scarpe</button></div>
        </div>
      </form>
    </dialog>
  `;
}

function bindEquipment({ main, store }) {
  main.querySelectorAll('[data-equipment-section]').forEach(button => {
    button.addEventListener('click', () => {
      equipmentSection = button.dataset.equipmentSection;
      rerender(main, store);
    });
  });

  main.querySelectorAll('[data-go-equipment]').forEach(button => {
    button.addEventListener('click', () => {
      equipmentSection = button.dataset.goEquipment;
      rerender(main, store);
    });
  });

  bindRacketActions(main, store);
  bindStringActions(main, store);
  bindShoeActions(main, store);
}

function bindRacketActions(main, store) {
  const dialog = main.querySelector('#racket-dialog');
  const form = main.querySelector('#racket-form');
  const equipment = normalizeEquipment(store.getState().equipment);

  const open = (racket = null) => {
    form.reset();
    form.elements.id.value = racket?.id || '';
    form.elements.brand.value = racket?.brand || '';
    form.elements.model.value = racket?.model || '';
    form.elements.label.value = racket?.label || '';
    form.elements.lengthIn.value = racket?.lengthIn ?? '';
    form.elements.weightG.value = racket?.weightG ?? '';
    form.elements.balanceMm.value = racket?.balanceMm ?? '';
    form.elements.swingweight.value = racket?.swingweight ?? '';
    form.elements.stringPattern.value = racket?.stringPattern || '';
    form.elements.gripSize.value = racket?.gripSize || '';
    form.elements.status.value = racket?.status || 'active';
    form.elements.customization.value = racket?.customization || '';
    form.elements.notes.value = racket?.notes || '';
    form.elements.makePrimary.checked = racket ? equipment.primaryRacketId === racket.id : equipment.rackets.length === 0;
    main.querySelector('#racket-dialog-title').textContent = racket ? 'Modifica racchetta' : 'Nuova racchetta';
    main.querySelector('#delete-racket').hidden = !racket;
    dialog.showModal();
  };

  const newButtons = [main.querySelector('#new-racket'), main.querySelector('#new-racket-empty')].filter(Boolean);
  newButtons.forEach(button => button.addEventListener('click', () => open()));

  main.querySelectorAll('[data-edit-racket]').forEach(button => button.addEventListener('click', () => {
    const racket = normalizeEquipment(store.getState().equipment).rackets.find(r => r.id === button.dataset.editRacket);
    if (racket) open(racket);
  }));

  main.querySelectorAll('[data-set-primary-racket]').forEach(button => button.addEventListener('click', () => {
    store.update(state => { ensureEquipment(state); state.equipment.primaryRacketId = button.dataset.setPrimaryRacket; });
    rerender(main, store);
  }));

  main.querySelectorAll('[data-close-racket]').forEach(button => button.addEventListener('click', () => dialog.close()));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id || uid('racket');
    const record = {
      id,
      brand: clean(data.brand), model: clean(data.model), label: clean(data.label),
      lengthIn: numberOrBlank(data.lengthIn), weightG: numberOrBlank(data.weightG), balanceMm: numberOrBlank(data.balanceMm), swingweight: numberOrBlank(data.swingweight),
      stringPattern: clean(data.stringPattern), gripSize: clean(data.gripSize), status: data.status || 'active',
      customization: clean(data.customization), notes: clean(data.notes),
    };
    store.update(state => {
      ensureEquipment(state);
      const index = state.equipment.rackets.findIndex(r => r.id === id);
      if (index >= 0) state.equipment.rackets[index] = record; else state.equipment.rackets.push(record);
      if (form.elements.makePrimary.checked || !state.equipment.primaryRacketId) state.equipment.primaryRacketId = id;
      if (record.status === 'retired' && state.equipment.primaryRacketId === id) state.equipment.primaryRacketId = '';
    });
    dialog.close();
    rerender(main, store);
  });

  main.querySelector('#delete-racket').addEventListener('click', async () => {
    const id = form.elements.id.value;
    if (!id) return;
    const confirmed = await showInAppConfirm('Eliminare questa racchetta? Verranno eliminate anche le incordature collegate.', { title: 'Elimina racchetta', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(state => {
      ensureEquipment(state);
      state.equipment.rackets = state.equipment.rackets.filter(r => r.id !== id);
      state.equipment.stringJobs = state.equipment.stringJobs.filter(j => j.racketId !== id);
      if (state.equipment.primaryRacketId === id) state.equipment.primaryRacketId = '';
    });
    dialog.close();
    rerender(main, store);
  });
}

function bindStringActions(main, store) {
  const dialog = main.querySelector('#string-dialog');
  const form = main.querySelector('#string-form');

  const open = (job = null) => {
    const equipment = normalizeEquipment(store.getState().equipment);
    if (!equipment.rackets.length) {
      equipmentSection = 'rackets';
      rerender(main, store);
      return;
    }
    form.reset();
    form.elements.id.value = job?.id || '';
    form.elements.racketId.value = job?.racketId || equipment.primaryRacketId || equipment.rackets[0].id;
    form.elements.date.value = job?.date || dateKey(new Date());
    form.elements.status.value = job?.status || 'installed';
    form.elements.stringName.value = job?.stringName || '';
    form.elements.gaugeMm.value = job?.gaugeMm || '';
    form.elements.stringer.value = job?.stringer || '';
    form.elements.mainsKg.value = job?.mainsKg ?? '';
    form.elements.crossesKg.value = job?.crossesKg ?? '';
    form.elements.hoursUsed.value = job?.hoursUsed ?? '';
    form.elements.preStretch.value = job?.preStretch || '';
    form.elements.notes.value = job?.notes || '';
    form.elements.makeCurrent.checked = job ? job.status === 'installed' : true;
    main.querySelector('#string-dialog-title').textContent = job ? 'Modifica incordatura' : 'Nuova incordatura';
    main.querySelector('#delete-string').hidden = !job;
    dialog.showModal();
  };

  [main.querySelector('#new-string'), main.querySelector('#new-string-empty')].filter(Boolean).forEach(button => button.addEventListener('click', () => open()));
  main.querySelectorAll('[data-edit-string]').forEach(button => button.addEventListener('click', () => {
    const job = normalizeEquipment(store.getState().equipment).stringJobs.find(j => j.id === button.dataset.editString);
    if (job) open(job);
  }));
  main.querySelectorAll('[data-close-string]').forEach(button => button.addEventListener('click', () => dialog.close()));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id || uid('string');
    const makeCurrent = form.elements.makeCurrent.checked;
    const record = {
      id, racketId: data.racketId, date: data.date,
      stringName: clean(data.stringName), gaugeMm: clean(data.gaugeMm),
      mainsKg: numberOrBlank(data.mainsKg), crossesKg: numberOrBlank(data.crossesKg),
      stringer: clean(data.stringer), hoursUsed: numberOrBlank(data.hoursUsed), preStretch: clean(data.preStretch),
      status: makeCurrent ? 'installed' : (data.status || 'replaced'), notes: clean(data.notes),
    };
    store.update(state => {
      ensureEquipment(state);
      if (makeCurrent) {
        state.equipment.stringJobs.forEach(job => {
          if (job.racketId === record.racketId && job.id !== id && job.status === 'installed') job.status = 'replaced';
        });
      }
      const index = state.equipment.stringJobs.findIndex(j => j.id === id);
      if (index >= 0) state.equipment.stringJobs[index] = record; else state.equipment.stringJobs.push(record);
    });
    dialog.close();
    rerender(main, store);
  });

  main.querySelector('#delete-string').addEventListener('click', async () => {
    const id = form.elements.id.value;
    if (!id) return;
    const confirmed = await showInAppConfirm('Eliminare questa registrazione di incordatura?', { title: 'Elimina incordatura', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(state => { ensureEquipment(state); state.equipment.stringJobs = state.equipment.stringJobs.filter(j => j.id !== id); });
    dialog.close();
    rerender(main, store);
  });
}

function bindShoeActions(main, store) {
  const dialog = main.querySelector('#shoe-dialog');
  const form = main.querySelector('#shoe-form');
  const equipment = normalizeEquipment(store.getState().equipment);

  const open = (shoe = null) => {
    form.reset();
    form.elements.id.value = shoe?.id || '';
    form.elements.brand.value = shoe?.brand || '';
    form.elements.model.value = shoe?.model || '';
    form.elements.surface.value = shoe?.surface || 'Terra';
    form.elements.size.value = shoe?.size || '';
    form.elements.startDate.value = shoe?.startDate || '';
    form.elements.hoursUsed.value = shoe?.hoursUsed ?? '';
    form.elements.status.value = shoe?.status || 'active';
    form.elements.notes.value = shoe?.notes || '';
    form.elements.makePrimary.checked = shoe ? equipment.primaryShoeId === shoe.id : equipment.shoes.length === 0;
    main.querySelector('#shoe-dialog-title').textContent = shoe ? 'Modifica scarpe' : 'Nuove scarpe';
    main.querySelector('#delete-shoe').hidden = !shoe;
    dialog.showModal();
  };

  [main.querySelector('#new-shoe'), main.querySelector('#new-shoe-empty')].filter(Boolean).forEach(button => button.addEventListener('click', () => open()));
  main.querySelectorAll('[data-edit-shoe]').forEach(button => button.addEventListener('click', () => {
    const shoe = normalizeEquipment(store.getState().equipment).shoes.find(s => s.id === button.dataset.editShoe);
    if (shoe) open(shoe);
  }));
  main.querySelectorAll('[data-set-primary-shoe]').forEach(button => button.addEventListener('click', () => {
    store.update(state => { ensureEquipment(state); state.equipment.primaryShoeId = button.dataset.setPrimaryShoe; });
    rerender(main, store);
  }));
  main.querySelectorAll('[data-close-shoe]').forEach(button => button.addEventListener('click', () => dialog.close()));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id || uid('shoe');
    const record = {
      id, brand: clean(data.brand), model: clean(data.model), surface: data.surface || 'Terra', size: clean(data.size),
      startDate: data.startDate || '', hoursUsed: numberOrBlank(data.hoursUsed), status: data.status || 'active', notes: clean(data.notes),
    };
    store.update(state => {
      ensureEquipment(state);
      const index = state.equipment.shoes.findIndex(s => s.id === id);
      if (index >= 0) state.equipment.shoes[index] = record; else state.equipment.shoes.push(record);
      if (form.elements.makePrimary.checked || !state.equipment.primaryShoeId) state.equipment.primaryShoeId = id;
      if (record.status === 'retired' && state.equipment.primaryShoeId === id) state.equipment.primaryShoeId = '';
    });
    dialog.close();
    rerender(main, store);
  });

  main.querySelector('#delete-shoe').addEventListener('click', async () => {
    const id = form.elements.id.value;
    if (!id) return;
    const confirmed = await showInAppConfirm('Eliminare questo paio di scarpe?', { title: 'Elimina scarpe', confirmLabel: 'Elimina', danger: true });
    if (!confirmed) return;
    store.update(state => {
      ensureEquipment(state);
      state.equipment.shoes = state.equipment.shoes.filter(s => s.id !== id);
      if (state.equipment.primaryShoeId === id) state.equipment.primaryShoeId = '';
    });
    dialog.close();
    rerender(main, store);
  });
}

function ensureEquipment(state) {
  if (!state.equipment || Array.isArray(state.equipment)) state.equipment = {};
  if (!Array.isArray(state.equipment.rackets)) state.equipment.rackets = [];
  if (!Array.isArray(state.equipment.stringJobs)) state.equipment.stringJobs = [];
  if (!Array.isArray(state.equipment.shoes)) state.equipment.shoes = [];
  if (typeof state.equipment.primaryRacketId !== 'string') state.equipment.primaryRacketId = '';
  if (typeof state.equipment.primaryShoeId !== 'string') state.equipment.primaryShoeId = '';
}

function rerender(main, store) {
  renderEquipment({ main, title: document.querySelector('#page-title'), store });
}

function getCurrentStringJob(racketId, jobs) {
  const installed = jobs.filter(j => j.racketId === racketId && j.status === 'installed');
  if (!installed.length) return null;
  return [...installed].sort((a,b) => (b.date || '').localeCompare(a.date || ''))[0];
}

function racketName(racket) {
  return [racket.brand, racket.model].filter(Boolean).join(' ') || racket.label || 'Racchetta';
}
function racketShortName(racket) {
  return racket.label || racketName(racket);
}
function shoeName(shoe) {
  return [shoe.brand, shoe.model].filter(Boolean).join(' ') || 'Scarpe';
}
function spec(label, value) {
  return `<div class="equipment-spec"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value == null || value === '' ? '—' : value)}</strong></div>`;
}
function formatUnit(value, unit) {
  return value === '' || value == null ? '—' : `${value} ${unit}`;
}
function formatTension(job) {
  const mains = job.mainsKg;
  const crosses = job.crossesKg;
  if ((mains === '' || mains == null) && (crosses === '' || crosses == null)) return '—';
  if (String(mains) === String(crosses)) return `${mains} kg`;
  return `${mains || '—'} / ${crosses || '—'} kg`;
}
function formatDate(value) {
  if (!value) return '—';
  const [y,m,d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(y, m-1, d));
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function numberOrBlank(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}
function clean(value) { return String(value || '').trim(); }
function options(map) { return Object.entries(map).map(([value,label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join(''); }
function uid(prefix) { return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function escapeHtml(value = '') {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function escapeAttr(value = '') { return escapeHtml(value); }
