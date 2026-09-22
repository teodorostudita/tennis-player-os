import { defaultState, STORAGE_KEY } from './schema.js';
import { dataProvider } from './providers/provider.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePlannerEvent(event = {}) {
  const companionId = event.companionId
    || event.responsibilities?.stay
    || event.responsibilities?.dropoff
    || event.responsibilities?.pickup
    || '';
  return {
    ...event,
    companionId,
    responsibilities: { stay: companionId },
  };
}

function addMinutesToTime(time, minutes = 30) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return '';
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function migrateLegacyNutritionEntries(entries = [], existingEvents = []) {
  const ids = new Set(existingEvents.map(event => event.id));
  return entries.flatMap((entry, index) => {
    if (!entry?.date || !entry?.time || !entry?.title) return [];
    const id = `nutrition-${entry.id || `legacy-${index}`}`;
    if (ids.has(id)) return [];
    return [{
      id,
      title: entry.title,
      date: entry.date,
      category: 'nutrition',
      startTime: entry.time,
      endTime: addMinutesToTime(entry.time, 30),
      location: '',
      notes: entry.notes || '',
      mealType: entry.type || 'other',
      mealDetails: entry.details || '',
      nutritionTemplateId: entry.templateId || '',
      athleteId: '',
      companionId: '',
      responsibilities: { stay: '' },
      seriesId: '',
    }];
  });
}

function normalizeRecurringSeries(series = {}) {
  const template = normalizePlannerEvent(series.template || {});
  return {
    ...series,
    intervalWeeks: Math.max(1, Math.min(52, Number(series.intervalWeeks) || 1)),
    template,
  };
}

function athleteStorageKey(athleteId) {
  return `${STORAGE_KEY}.athlete.${athleteId}`;
}

function accountAthleteStorageKey(userId, athleteId) {
  return `${STORAGE_KEY}.user.${userId}.athlete.${athleteId}`;
}


function stateForLocalPersistence(state) {
  const localState = clone(state);

  // Calendar is cloud-backed. Keep it in memory for the running app, but do
  // not persist the reconstructed recurring occurrences in localStorage.
  localState.planner = clone(defaultState.planner);

  return localState;
}

class Store {
  constructor(provider = dataProvider) {
    this.provider = provider;
    this.listeners = new Set();
    this.state = this.load();
  }

  load() {
    try {
      const parsed = this.provider.loadState();
      if (!parsed) return clone(defaultState);
      const parsedTraining = parsed.training && !Array.isArray(parsed.training) ? parsed.training : {};
      const parsedDrills = parsed.drills && !Array.isArray(parsed.drills) ? parsed.drills : {};
      const parsedEquipment = parsed.equipment && !Array.isArray(parsed.equipment) ? parsed.equipment : {};
      const parsedEconomics = parsed.economics && !Array.isArray(parsed.economics) ? parsed.economics : {};
      const parsedNutrition = parsed.nutrition && !Array.isArray(parsed.nutrition) ? parsed.nutrition : {};
      const sourcePlannerEvents = Array.isArray(parsed.planner?.events)
        ? parsed.planner.events
        : clone(defaultState.planner.events);
      const legacyNutritionEntries = Array.isArray(parsedNutrition.planner?.entries) ? parsedNutrition.planner.entries : [];
      const normalizedRecurringSeries = Array.isArray(parsed.planner?.recurringSeries)
        ? parsed.planner.recurringSeries.map(normalizeRecurringSeries)
        : clone(defaultState.planner.recurringSeries).map(normalizeRecurringSeries);
      const validSeriesIds = new Set(normalizedRecurringSeries.map(series => series.id).filter(Boolean));
      const plannerEvents = [
        ...sourcePlannerEvents,
        ...migrateLegacyNutritionEntries(legacyNutritionEntries, sourcePlannerEvents),
      ].map(normalizePlannerEvent).map(event => (
        event.seriesId && !validSeriesIds.has(event.seriesId)
          ? { ...event, seriesId: '' }
          : event
      ));
      return {
        ...clone(defaultState),
        ...parsed,
        meta: { ...clone(defaultState.meta), ...(parsed.meta || {}), appVersion: defaultState.meta.appVersion },
        athlete: { ...clone(defaultState.athlete), ...(parsed.athlete || {}) },
        modules: { ...clone(defaultState.modules), ...(parsed.modules || {}) },
        planner: {
          ...clone(defaultState.planner),
          ...(parsed.planner || {}),
          people: Array.isArray(parsed.planner?.people) ? parsed.planner.people : clone(defaultState.planner.people),
          events: plannerEvents,
          tournaments: Array.isArray(parsed.planner?.tournaments) ? parsed.planner.tournaments : clone(defaultState.planner.tournaments),
          recurringSeries: normalizedRecurringSeries,
          locationDefaults: parsed.planner?.locationDefaults && typeof parsed.planner.locationDefaults === 'object'
            ? parsed.planner.locationDefaults
            : clone(defaultState.planner.locationDefaults),
        },
        training: {
          ...clone(defaultState.training),
          ...parsedTraining,
          tests: Array.isArray(parsedTraining.tests) ? parsedTraining.tests : clone(defaultState.training.tests),
          testResults: Array.isArray(parsedTraining.testResults) ? parsedTraining.testResults : clone(defaultState.training.testResults),
          weeklyProgram: {
            ...clone(defaultState.training.weeklyProgram),
            ...(parsedTraining.weeklyProgram || {}),
            sessions: Array.isArray(parsedTraining.weeklyProgram?.sessions) ? parsedTraining.weeklyProgram.sessions : clone(defaultState.training.weeklyProgram.sessions),
          },
          goals: Array.isArray(parsedTraining.goals) ? parsedTraining.goals : clone(defaultState.training.goals),
        },
        drills: {
          ...clone(defaultState.drills),
          ...parsedDrills,
          library: Array.isArray(parsedDrills.library) ? parsedDrills.library : clone(defaultState.drills.library),
          sessions: Array.isArray(parsedDrills.sessions) ? parsedDrills.sessions.map(session => ({ ...session, items: Array.isArray(session.items) ? session.items : [] })) : clone(defaultState.drills.sessions),
          measurements: {
            ...clone(defaultState.drills.measurements),
            ...(parsedDrills.measurements || {}),
            protocols: Array.isArray(parsedDrills.measurements?.protocols) ? parsedDrills.measurements.protocols : clone(defaultState.drills.measurements.protocols),
            records: Array.isArray(parsedDrills.measurements?.records) ? parsedDrills.measurements.records : clone(defaultState.drills.measurements.records),
          },
        },
        nutrition: {
          ...clone(defaultState.nutrition),
          ...parsedNutrition,
          planner: {
            ...clone(defaultState.nutrition.planner),
            ...(parsedNutrition.planner || {}),
            entries: [],
          },
          templates: Array.isArray(parsedNutrition.templates) ? parsedNutrition.templates : clone(defaultState.nutrition.templates),
          guidance: {
            ...clone(defaultState.nutrition.guidance),
            ...(parsedNutrition.guidance || {}),
          },
          sleepLogs: Array.isArray(parsedNutrition.sleepLogs) ? parsedNutrition.sleepLogs : clone(defaultState.nutrition.sleepLogs),
          recoveryLogs: Array.isArray(parsedNutrition.recoveryLogs) ? parsedNutrition.recoveryLogs : clone(defaultState.nutrition.recoveryLogs),
        },
        economics: {
          ...clone(defaultState.economics),
          ...parsedEconomics,
          trainingAreas: Array.isArray(parsedEconomics.trainingAreas) ? parsedEconomics.trainingAreas : clone(defaultState.economics.trainingAreas),
          entries: Array.isArray(parsedEconomics.entries) ? parsedEconomics.entries : clone(defaultState.economics.entries),
          budgets: Array.isArray(parsedEconomics.budgets) ? parsedEconomics.budgets : clone(defaultState.economics.budgets),
        },
        equipment: {
          ...clone(defaultState.equipment),
          ...parsedEquipment,
          rackets: Array.isArray(parsedEquipment.rackets) ? parsedEquipment.rackets : clone(defaultState.equipment.rackets),
          stringJobs: Array.isArray(parsedEquipment.stringJobs) ? parsedEquipment.stringJobs : clone(defaultState.equipment.stringJobs),
          shoes: Array.isArray(parsedEquipment.shoes) ? parsedEquipment.shoes : clone(defaultState.equipment.shoes),
        },
      };
    } catch (error) {
      console.warn('Impossibile leggere i dati dal provider. Uso lo stato iniziale.', error);
      return clone(defaultState);
    }
  }

  selectAthleteStorage(userId, athleteId) {
    if (
      !userId
      || !athleteId
      || typeof this.provider.setKey !== 'function'
    ) return;

    const targetKey = accountAthleteStorageKey(userId, athleteId);
    const previousAthleteKey = athleteStorageKey(athleteId);

    if (!this.provider.hasState(targetKey)) {
      // Migrate the athlete-only cache introduced by v0.17.x into an
      // account+athlete cache. This prevents two different login accounts
      // using the same browser from sharing still-local module data.
      if (this.provider.hasState(previousAthleteKey)) {
        const previousState = this.provider.loadStateFromKey(previousAthleteKey);

        if (previousState) {
          const migratedState = stateForLocalPersistence(previousState);

          // Free the old large athlete-only cache before writing the new
          // account+athlete cache. If the write unexpectedly fails, restore
          // the old value so no still-local module data is lost.
          localStorage.removeItem(previousAthleteKey);

          try {
            this.provider.saveStateToKey(targetKey, migratedState);
          } catch (error) {
            try {
              this.provider.saveStateToKey(previousAthleteKey, previousState);
            } catch (restoreError) {
              console.error('Impossibile ripristinare la cache locale precedente.', restoreError);
            }
            throw error;
          }
        }
      } else {
        const currentKey = this.provider.key;
        const currentState = this.state;

        // Legacy single-athlete migration. Calendar is cloud-backed, so do not
        // duplicate its reconstructed occurrences into localStorage.
        if (
          currentKey === STORAGE_KEY
          && currentState?.athlete?.id === athleteId
        ) {
          const migratedState = stateForLocalPersistence(currentState);

          migratedState.meta = {
            ...migratedState.meta,
            athleteStorageMigratedAt: new Date().toISOString(),
          };

          this.provider.saveStateToKey(targetKey, migratedState);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    this.provider.setKey(targetKey);
    this.state = this.load();
    this.emit();
  }

  getState() {
    return this.state;
  }

  update(mutator) {
    const next = clone(this.state);
    mutator(next);
    next.meta.updatedAt = new Date().toISOString();
    this.state = next;
    this.persist();
    this.emit();
  }

  persist() {
    this.provider.saveState(stateForLocalPersistence(this.state));
  }

  getPersistenceInfo() {
    return this.provider.getInfo();
  }

  reset() {
    this.state = clone(defaultState);
    this.state.meta.createdAt = new Date().toISOString();
    this.state.meta.updatedAt = new Date().toISOString();
    this.persist();
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

export const store = new Store();
