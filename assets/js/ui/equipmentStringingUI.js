import { store } from '../data/store.js';

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'dashboard';
}

function racketHumanId(racket = {}) {
  return String(racket.label || '').trim();
}

function applyEquipmentStringingLabels() {
  if (currentRoute() !== 'equipment') return;

  // The Equipment component still has an old hard-coded number after the
  // dashboard reorder. Keep the visible page title aligned with module #7.
  const pageTitle = document.querySelector('#page-title');
  if (pageTitle && pageTitle.textContent !== '7. Equipment') {
    pageTitle.textContent = '7. Equipment';
  }

  const main = document.querySelector('#main-content');
  if (!main) return;

  // Make the human frame identifier explicit and mandatory for future edits.
  const racketLabelInput = main.querySelector('#racket-form input[name="label"]');
  if (racketLabelInput) {
    const field = racketLabelInput.closest('.field');
    const label = field?.querySelector('label');

    if (label && label.textContent !== 'ID racchetta') {
      label.textContent = 'ID racchetta';
    }

    if (racketLabelInput.placeholder !== 'es. 1, 2, 3 oppure R1, R2, R3') {
      racketLabelInput.placeholder = 'es. 1, 2, 3 oppure R1, R2, R3';
    }

    racketLabelInput.required = true;
  }

  // In Stringing, select the individual frame by its human ID, not by model.
  const racketSelect = main.querySelector('#string-form select[name="racketId"]');
  if (racketSelect) {
    const field = racketSelect.closest('.field');
    const label = field?.querySelector('label');

    if (label && label.textContent !== 'ID racchetta') {
      label.textContent = 'ID racchetta';
    }

    const rackets = Array.isArray(store.getState().equipment?.rackets)
      ? store.getState().equipment.rackets
      : [];

    for (const option of racketSelect.options) {
      if (!option.value) {
        if (option.textContent !== '— Seleziona ID telaio —') {
          option.textContent = '— Seleziona ID telaio —';
        }
        continue;
      }

      const racket = rackets.find(item => item.id === option.value);
      if (!racket) continue;

      const humanId = racketHumanId(racket);
      const fallbackModel = [racket.brand, racket.model]
        .filter(Boolean)
        .join(' ')
        .trim();

      const nextText = humanId
        || `ID non assegnato${fallbackModel ? ` · ${fallbackModel}` : ''}`;

      if (option.textContent !== nextText) {
        option.textContent = nextText;
      }
    }
  }

  // "hoursUsed" is kept as the storage field for backward compatibility;
  // only its product meaning changes to the planned life of this string job.
  const stringHoursInput = main.querySelector('#string-form input[name="hoursUsed"]');
  if (stringHoursInput) {
    const label = stringHoursInput.closest('.field')?.querySelector('label');
    if (label && label.textContent !== 'Ore di utilizzo previste') {
      label.textContent = 'Ore di utilizzo previste';
    }
  }

  // Keep the Stringing overview consistent with the form wording.
  main.querySelectorAll('.equipment-subhead').forEach(section => {
    const heading = section.querySelector('h2');
    const copy = section.querySelector('p');

    if (heading?.textContent.trim() === 'Incordature' && copy) {
      const next = 'Storico delle corde montate sui singoli telai: tipo, tensione, data e ore di utilizzo previste.';
      if (copy.textContent !== next) copy.textContent = next;
    }
  });

  const stringTable = main.querySelector('.equipment-table');
  if (stringTable) {
    const headers = stringTable.querySelectorAll('thead th');
    if (headers[4] && headers[4].textContent !== 'Ore previste') {
      headers[4].textContent = 'Ore previste';
    }
  }

  main.querySelectorAll('.equipment-current-card').forEach(card => {
    if (card.querySelector('.equipment-card-kicker')?.textContent.trim() !== 'Incordatura corrente') {
      return;
    }

    card.querySelectorAll('.equipment-spec > span').forEach(label => {
      if (label.textContent.trim() === 'Ore uso') {
        label.textContent = 'Ore previste';
      }
    });
  });
}

let pending = false;

function scheduleApply() {
  if (pending) return;
  pending = true;

  window.queueMicrotask(() => {
    pending = false;
    applyEquipmentStringingLabels();
  });
}

const main = document.querySelector('#main-content');

if (main) {
  const observer = new MutationObserver(scheduleApply);
  observer.observe(main, {
    childList: true,
    subtree: true,
  });
}

window.addEventListener('hashchange', scheduleApply);
store.subscribe(scheduleApply);

scheduleApply();
