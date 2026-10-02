export const USER_TYPES = Object.freeze({
  athlete: {
    key: 'athlete',
    label: 'Atleta',
    description: 'Uso quotidiano personale: recovery, salute e consultazione del proprio percorso.',
  },
  coach: {
    key: 'coach',
    label: 'Coach',
    description: 'Sviluppo tecnico-tattico, drills, match, scouting e programmazione.',
  },
  trainer: {
    key: 'trainer',
    label: 'Preparatore atletico',
    description: 'Athletics, carico fisico e informazioni utili a recovery e salute.',
  },
  physio: {
    key: 'physio',
    label: 'Fisioterapista',
    description: 'Body & Health con contesto atletico, recovery e calendario.',
  },
  parent: {
    key: 'parent',
    label: 'Genitore',
    description: 'Organizzazione, calendario, costi e visione complessiva del percorso.',
  },
  custom: {
    key: 'custom',
    label: 'Custom',
    description: 'Profilo senza preset: privilegi configurati manualmente.',
  },
});

export const USER_TYPE_KEYS = Object.freeze(Object.keys(USER_TYPES));

const PRESETS = Object.freeze({
  athlete: {
    read: '*',
    write: ['health', 'nutrition'],
  },
  coach: {
    read: '*',
    write: [
      'calendar',
      'training',
      'development',
      'drills',
      'competition',
      'opponents',
      'equipment',
      'health',
      'nutrition',
      'mental',
      'visual',
    ],
  },
  trainer: {
    read: [
      'calendar',
      'training',
      'development',
      'drills',
      'competition',
      'opponents',
      'equipment',
      'health',
      'nutrition',
      'mental',
      'visual',
    ],
    write: ['calendar', 'training'],
  },
  physio: {
    read: ['calendar', 'training', 'health', 'nutrition'],
    write: ['health'],
  },
  parent: {
    read: '*',
    write: ['calendar', 'economics'],
  },
});

export function normalizeUserType(value = '') {
  const key = String(value || '').trim().toLowerCase();
  return USER_TYPES[key] ? key : 'custom';
}

export function userTypeLabel(value = '') {
  return USER_TYPES[normalizeUserType(value)].label;
}

export function userTypeDescription(value = '') {
  return USER_TYPES[normalizeUserType(value)].description;
}

export function userTypeOptionsMarkup(selected = 'custom') {
  const normalized = normalizeUserType(selected);
  return USER_TYPE_KEYS
    .map(key => `<option value="${key}" ${key === normalized ? 'selected' : ''}>${USER_TYPES[key].label}</option>`)
    .join('');
}

export function permissionPresetForUserType(value, moduleIds = []) {
  const userType = normalizeUserType(value);
  const preset = PRESETS[userType];

  if (!preset) return null;

  const ids = [...new Set(moduleIds.map(id => String(id || '').trim()).filter(Boolean))];
  const readable = preset.read === '*' ? new Set(ids) : new Set(preset.read || []);
  const writable = new Set(preset.write || []);

  return {
    role: 'member',
    permissions: Object.fromEntries(
      ids.map(moduleId => [
        moduleId,
        writable.has(moduleId)
          ? 'write'
          : readable.has(moduleId)
            ? 'read'
            : 'none',
      ]),
    ),
  };
}
