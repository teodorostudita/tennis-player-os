// VR Lab — macchina a stati di una serie "Lettura del colpo" (indipendente dal rendering).
//
// ready ─grilletto→ windup ─impatto→ flight ─occlusione→ aim ─grilletto→ feedback
//   feedback ─grilletto→ windup (colpo successivo) | summary (ultimo colpo)
//   summary ─grilletto→ windup (nuova serie)
// Con occlusione prima dell'impatto si passa direttamente da windup ad aim.
// interrupt(): in qualsiasi stato della serie chiude con i colpi già completati
// (summary), oppure torna a ready se non ne è stato completato nessuno.
//
// Il gesto dell'avversario arriva da prepareShot (contratto in
// opponent/opponentContract.js): la serie conosce solo durata, istante d'impatto
// e punto di contatto della racchetta, da cui parte la palla.
// I tempi sono in secondi (performance.now() / 1000).
import { OPPONENT_PLACEMENT, OCCLUSION, SHOTS, SHOT_TYPES, TARGET } from './physicsConfig.js?v=1.3.7';
import { generateShot, positionAt } from './ballFlight.js?v=1.3.7';
import { hidesOpponent, normalizeOcclusionMode, occlusionTime } from './occlusion.js?v=1.3.7';
import { COURT, predictionError, summarizeTrials } from './ballPhysics.js?v=1.3.7';

export const OPPONENT_DRILL_KEY = 'opponent_read';
export const OPPONENT_DRILL_VERSION = 1;

const READY_PAUSE = 0.5; // dal grilletto all'inizio del gesto
const TRIGGER_COOLDOWN = 0.3;
const REPLAY_TAIL = 0.6;
const REPLAY_GESTURE_LEAD = 0.6; // nel feedback dei modi pre150/impact si rivede il gesto

// Avversario fermo in attesa, al centro della sua linea di fondo.
export const IDLE_PLACEMENT = Object.freeze({
  x: 0, z: COURT.opponentBaselineZ - 0.5, yaw: Math.PI, aimX: 0,
});

const r3 = v => Math.round(v * 1000) / 1000;
const r1 = v => Math.round(v * 10) / 10;

function between(rng, [min, max]) {
  return min + (max - min) * rng();
}

export function normalizeShotWeights(weights = {}) {
  const result = {};
  let total = 0;
  for (const type of SHOT_TYPES) {
    const value = Number(weights[type]);
    result[type] = Number.isFinite(value) && value > 0 ? value : 0;
    total += result[type];
  }
  if (total > 0) return result;
  return Object.fromEntries(SHOT_TYPES.map(type => [type, SHOTS[type].defaultWeight]));
}

export function pickShotType(weights, rng = Math.random) {
  const normalized = normalizeShotWeights(weights);
  const total = SHOT_TYPES.reduce((sum, type) => sum + normalized[type], 0);
  let roll = rng() * total;
  for (const type of SHOT_TYPES) {
    roll -= normalized[type];
    if (roll < 0) return type;
  }
  return SHOT_TYPES.at(-1);
}

// Posizione e orientamento dell'avversario: non dipendono dal tipo di colpo.
function randomPlacement(rng) {
  const x = between(rng, OPPONENT_PLACEMENT.x);
  const z = COURT.opponentBaselineZ - between(rng, OPPONENT_PLACEMENT.behindBaseline);
  const aimX = between(rng, TARGET.aimX);
  // L'avversario (che nel suo riferimento guarda verso −z) ruota verso il punto di mira.
  const yaw = Math.atan2(-(aimX - x), -(TARGET.aimZ - z));
  return { x, z, yaw, aimX };
}

// Senza avversario (test in Node): contatto fisso davanti e a lato del corpo.
function defaultPrepareShot({ placement }) {
  return {
    duration: 1.6,
    impactTime: 0.95,
    contact: { x: placement.x - 0.9, y: 0.9, z: placement.z + 0.4 },
  };
}

export function createSeries({ settings, prepareShot = defaultPrepareShot, rng = Math.random }) {
  let state = 'ready';
  let stateSince = -Infinity;
  let trials = [];
  let current = null;
  let startedAt = null;
  let summary = null;
  let pendingEvents = [];

  function setState(next, now) {
    state = next;
    stateSince = now;
  }

  function occlusionMode() {
    return normalizeOcclusionMode(settings.occlusion?.mode);
  }

  function startTrial(now) {
    if (!startedAt) startedAt = new Date().toISOString();
    const shotType = pickShotType(settings.shotWeights, rng);
    const placement = randomPlacement(rng);
    const clip = prepareShot({ shotType, placement });
    const shot = generateShot({
      shotType,
      contact: clip.contact,
      aim: { x: placement.aimX, z: TARGET.aimZ },
      difficulty: settings.difficulty,
      rng,
    });
    const mode = occlusionMode();
    const tClipStart = now + READY_PAUSE;
    current = {
      shotType,
      placement,
      clip,
      shot,
      mode,
      tClipStart,
      tImpact: tClipStart + clip.impactTime,
      occ: occlusionTime(mode, shot),
      impactFired: false,
      aimStart: null,
      trial: null,
    };
    setState('windup', now);
  }

  function recordPrediction(now, prediction, hand) {
    const { shot, occ, mode, placement } = current;
    const error = predictionError(shot.bounce, prediction);
    current.trial = {
      index: trials.length + 1,
      shotType: shot.shotType,
      spinRpm: Math.round(shot.spinRpm),
      speedKmh: r1(shot.speedKmh),
      elevationDeg: r1(shot.elevationDeg),
      contact: { x: r3(shot.contact.x), y: r3(shot.contact.y), z: r3(shot.contact.z) },
      opponent: { x: r3(placement.x), z: r3(placement.z) },
      velocity: shot.velocity.map(r3),
      netClearance: shot.net ? r3(shot.net.clearance) : null,
      flightTime: r3(shot.flightTime),
      bounce: { x: r3(shot.bounce.x), z: r3(shot.bounce.z) },
      bounceOut: shot.bounceOut ? {
        speedKmh: r1(shot.bounceOut.speedKmh),
        angleDeg: r1(shot.bounceOut.angleDeg),
        gripped: shot.bounceOut.gripped,
      } : null,
      occlusionMode: mode,
      occlusionTime: occ == null ? null : r3(occ),
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
        drillKey: OPPONENT_DRILL_KEY,
        startedAt,
        completedAt: new Date().toISOString(),
        settings: {
          ...settings,
          occlusion: { mode: occlusionMode() },
          shotWeights: normalizeShotWeights(settings.shotWeights),
          drillVersion: OPPONENT_DRILL_VERSION,
        },
        summary,
        trials: [...trials],
      },
    };
  }

  // Il colpo in corso senza risposta viene scartato.
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
    // In aim nessun cooldown: una risposta rapida subito dopo l'occlusione va accettata.
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

  // Transizioni temporali (windup → flight → aim), chiamate sia dal loop di
  // rendering sia dal grilletto: lo stato non dipende dal frame rate.
  function advance(now) {
    if (!current || !['windup', 'flight', 'aim'].includes(state)) return;
    const t = now - current.tImpact;
    if (!current.impactFired && t >= 0) {
      current.impactFired = true;
      pendingEvents.push('impact');
    }
    if (state === 'aim') return;
    if (state === 'windup' && t >= 0) setState('flight', current.tImpact);

    const { occ, shot } = current;
    if (occ != null && t >= occ) {
      current.aimStart = current.tImpact + occ;
      setState('aim', current.aimStart);
    } else if (occ == null && t >= shot.flightTime + OCCLUSION.unoccludedTailS) {
      current.aimStart = current.tImpact + shot.flightTime;
      setState('aim', now);
    }
  }

  function opponentFrame(visible, clipTime) {
    return {
      visible,
      shotType: current.shotType,
      placement: current.placement,
      clipTime,
    };
  }

  function idleFrame(events) {
    return {
      state,
      events,
      ball: { visible: false, position: null },
      opponent: { visible: true, shotType: SHOT_TYPES[0], placement: IDLE_PLACEMENT, clipTime: 0 },
    };
  }

  // Avanza il tempo e restituisce cosa mostrare: palla e posa dell'avversario.
  function update(now) {
    advance(now);
    const events = pendingEvents;
    pendingEvents = [];
    if (!current) return idleFrame(events);

    const { shot, occ, mode, clip } = current;
    const hides = hidesOpponent(mode);

    if (state === 'windup' || state === 'flight' || state === 'aim') {
      const t = now - current.tImpact;
      const occluded = occ != null && t >= occ;
      const ballVisible = t >= 0 && !occluded && t <= shot.trajectory.endTime;
      return {
        state,
        events,
        ball: { visible: ballVisible, position: ballVisible ? positionAt(shot.trajectory, t) : null },
        opponent: opponentFrame(!(hides && occluded), clip.impactTime + t),
      };
    }

    if (state === 'feedback') {
      // Replay: nei modi che oscurano l'avversario si rivede anche il gesto.
      const replayStart = hides ? -REPLAY_GESTURE_LEAD : Math.max(0, occ ?? 0);
      const t = replayStart + (now - stateSince);
      const ballVisible = t >= 0 && t <= shot.flightTime + REPLAY_TAIL;
      return {
        state,
        events,
        ball: { visible: ballVisible, position: ballVisible ? positionAt(shot.trajectory, t) : null },
        opponent: opponentFrame(true, clip.impactTime + t),
      };
    }

    return idleFrame(events);
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
