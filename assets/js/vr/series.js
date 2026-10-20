// VR Lab — macchina a stati di una serie di lanci (indipendente dal rendering).
//
// ready ─grilletto→ countdown ─0,8 s→ flight ─occlusione→ aim ─grilletto→ feedback
//   feedback ─grilletto→ countdown (lancio successivo) | summary (ultimo lancio)
//   summary ─grilletto→ countdown (nuova serie)
// interrupt(): in qualsiasi stato della serie chiude con i lanci già completati
// (summary), oppure torna a ready se non ne è stato completato nessuno.
// I tempi sono in secondi (performance.now() / 1000).
import {
  generateLaunch,
  occlusionTime,
  positionAfterBounce,
  predictionError,
  summarizeTrials,
} from './ballPhysics.js?v=1.3.0';

export const BOUNCE_DRILL_VERSION = 1;

const COUNTDOWN = 0.8;
const TRIGGER_COOLDOWN = 0.3;
const UNOCCLUDED_TAIL = 0.6; // senza occlusione la palla resta visibile dopo il rimbalzo
const REPLAY_TAIL = 0.6;

const r3 = v => Math.round(v * 1000) / 1000;
const r1 = v => Math.round(v * 10) / 10;

export function createSeries({ settings, rng = Math.random }) {
  let state = 'ready';
  let stateSince = -Infinity;
  let trials = [];
  let current = null;
  let startedAt = null;
  let summary = null;

  function setState(next, now) {
    state = next;
    stateSince = now;
  }

  function startTrial(now) {
    if (!startedAt) startedAt = new Date().toISOString();
    const launch = generateLaunch({ difficulty: settings.difficulty, rng });
    current = {
      launch,
      tLaunch: now + COUNTDOWN,
      tOcc: occlusionTime(launch, settings.occlusion),
      aimStart: null,
      trial: null,
    };
    setState('countdown', now);
  }

  function recordPrediction(now, prediction, hand) {
    const { launch, tOcc } = current;
    const error = predictionError(launch.bounce, prediction);
    current.trial = {
      index: trials.length + 1,
      launch: {
        x0: r3(launch.x0), y0: r3(launch.y0), z0: r3(launch.z0),
        vx: r3(launch.vx), vy: r3(launch.vy), vz: r3(launch.vz),
      },
      speedKmh: r1(launch.speedKmh),
      flightTime: r3(launch.flightTime),
      occlusionTime: tOcc == null ? null : r3(tOcc),
      bounce: { x: r3(launch.bounce.x), z: r3(launch.bounce.z) },
      prediction: { x: r3(prediction.x), z: r3(prediction.z) },
      errorCm: r1(error.errorCm),
      depthCm: r1(error.depthCm),
      lateralCm: r1(error.lateralCm),
      responseMs: Math.round((now - current.aimStart) * 1000),
      hand: hand || '',
    };
    trials.push(current.trial);
    setState('feedback', now);
  }

  function finish(now, interrupted) {
    summary = {
      ...summarizeTrials(trials),
      plannedTrialCount: settings.trialCount,
      interrupted,
    };
    current = null;
    setState('summary', now);
    return {
      type: 'completed',
      session: {
        drillKey: 'bounce_prediction',
        startedAt,
        completedAt: new Date().toISOString(),
        settings: { ...settings, drillVersion: BOUNCE_DRILL_VERSION },
        summary,
        trials: [...trials],
      },
    };
  }

  // Il lancio in corso senza risposta viene scartato.
  function interrupt(now) {
    if (state === 'ready' || state === 'summary') return null;
    if (!trials.length) {
      current = null;
      startedAt = null;
      setState('ready', now);
      return { type: 'cancelled' };
    }
    return finish(now, true);
  }

  // prediction: { x, z } sul piano del campo, oppure null se il raggio non lo colpisce.
  function trigger(now, prediction = null, hand = '') {
    advance(now);
    // In aim nessun cooldown: l'ultimo grilletto è di almeno un lancio prima,
    // e una risposta rapida subito dopo l'occlusione deve essere accettata.
    if (state !== 'aim' && now - stateSince < TRIGGER_COOLDOWN) return null;

    if (state === 'ready') {
      startTrial(now);
      return { type: 'started' };
    }
    if (state === 'aim') {
      if (!prediction) return null;
      recordPrediction(now, prediction, hand);
      return { type: 'predicted', trial: current.trial };
    }
    if (state === 'feedback') {
      if (trials.length >= settings.trialCount) return finish(now, false);
      startTrial(now);
      return { type: 'next' };
    }
    if (state === 'summary') {
      trials = [];
      summary = null;
      startedAt = null;
      startTrial(now);
      return { type: 'restarted' };
    }
    return null;
  }

  // Transizioni temporali (countdown → flight → aim). Chiamata sia dal loop di
  // rendering sia dal grilletto, così lo stato non dipende dal frame rate.
  let pendingEvents = [];
  function advance(now) {
    if (state === 'countdown' && now >= current.tLaunch) {
      setState('flight', current.tLaunch);
      pendingEvents.push('launched');
    }
    if (state === 'flight') {
      const { launch, tOcc, tLaunch } = current;
      const t = now - tLaunch;
      if (tOcc != null && t >= tOcc) {
        current.aimStart = tLaunch + tOcc;
        setState('aim', current.aimStart);
      } else if (tOcc == null && t >= launch.flightTime + UNOCCLUDED_TAIL) {
        current.aimStart = tLaunch + launch.flightTime;
        setState('aim', now);
      }
    }
  }

  // Avanza il tempo e restituisce cosa mostrare.
  function update(now) {
    advance(now);
    const events = pendingEvents;
    pendingEvents = [];

    if (state === 'flight') {
      const t = now - current.tLaunch;
      return { state, events, ballVisible: true, ball: positionAfterBounce(current.launch, t) };
    }

    if (state === 'feedback') {
      const { launch, tOcc } = current;
      const t = (tOcc ?? 0) + (now - stateSince);
      if (t <= launch.flightTime + REPLAY_TAIL) {
        return { state, events, ballVisible: true, ball: positionAfterBounce(launch, t) };
      }
    }

    return { state, events, ballVisible: false, ball: null };
  }

  return {
    trigger,
    interrupt,
    update,
    get state() { return state; },
    get current() { return current; },
    get trials() { return trials; },
    get summary() { return summary; },
    get settings() { return settings; },
  };
}
