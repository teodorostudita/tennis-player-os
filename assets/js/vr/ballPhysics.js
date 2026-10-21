// VR Lab — geometria del campo e valutazione delle predizioni (funzioni pure, senza Three.js).
//
// Sistema di riferimento (metri), coerente con lo spazio WebXR `local-floor`:
//   origine = centro della linea di fondo del giocatore, a terra;
//   y verso l'alto; il giocatore guarda verso -z;
//   +x = destra del giocatore.
// Rete a z = -11.885, linea di fondo avversaria a z = -23.77.
// La fisica del volo (aria, Magnus, rimbalzo) è in ballFlight.js.
import { BALL, SHOT_TYPES } from './physicsConfig.js?v=1.3.7';

export const BALL_RADIUS = BALL.radius;

export const COURT = Object.freeze({
  length: 23.77,
  halfLength: 11.885,
  singlesHalfWidth: 4.115,
  doublesHalfWidth: 5.485,
  serviceLineFromNet: 6.40,
  netZ: -11.885,
  opponentBaselineZ: -23.77,
  netCenterHeight: 0.914,
  netPostHeight: 1.07,
  netPostX: 6.399, // 0,914 m oltre la linea del doppio
});

export function netHeightAt(x) {
  const ratio = Math.min(1, Math.abs(x) / COURT.netPostX);
  return COURT.netCenterHeight
    + (COURT.netPostHeight - COURT.netCenterHeight) * ratio * ratio;
}

// PRNG deterministico opzionale (per test e per ripetere una serie).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Intersezione di un raggio con il piano del campo (y = 0).
export function rayToGround(origin, direction) {
  if (direction.y >= -1e-4) return null;
  const t = -origin.y / direction.y;
  if (t <= 0 || t > 80) return null;
  return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
}

// Errore della predizione in cm.
// depthCm > 0: previsto più lungo (più vicino al giocatore) del rimbalzo reale.
// lateralCm > 0: previsto più a destra del rimbalzo reale.
export function predictionError(actual, predicted) {
  const dx = predicted.x - actual.x;
  const dz = predicted.z - actual.z;
  return {
    errorCm: Math.hypot(dx, dz) * 100,
    depthCm: dz * 100,
    lateralCm: dx * 100,
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeTrials(trials) {
  const errors = trials.map(t => t.errorCm);
  const round = v => (v == null ? null : Math.round(v * 10) / 10);
  return {
    trialCount: trials.length,
    meanErrorCm: round(mean(errors)),
    medianErrorCm: round(median(errors)),
    bestErrorCm: round(errors.length ? Math.min(...errors) : null),
    worstErrorCm: round(errors.length ? Math.max(...errors) : null),
    meanDepthBiasCm: round(mean(trials.map(t => t.depthCm))),
    meanLateralBiasCm: round(mean(trials.map(t => t.lateralCm))),
    meanAbsDepthCm: round(mean(trials.map(t => Math.abs(t.depthCm)))),
    meanAbsLateralCm: round(mean(trials.map(t => Math.abs(t.lateralCm)))),
    meanResponseMs: round(mean(trials.map(t => t.responseMs).filter(Number.isFinite))),
    byShotType: summarizeByShotType(trials, round),
  };
}

// Errore medio per tipo di colpo (solo i tipi presenti nella serie).
function summarizeByShotType(trials, round) {
  const result = {};
  for (const type of SHOT_TYPES) {
    const items = trials.filter(t => t.shotType === type);
    if (!items.length) continue;
    result[type] = {
      count: items.length,
      meanErrorCm: round(mean(items.map(t => t.errorCm))),
      meanDepthBiasCm: round(mean(items.map(t => t.depthCm))),
    };
  }
  return result;
}
