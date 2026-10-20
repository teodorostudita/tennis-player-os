// VR Lab — geometria del campo e fisica della palla (funzioni pure, senza Three.js).
//
// Sistema di riferimento (metri), coerente con lo spazio WebXR `local-floor`:
//   origine = centro della linea di fondo del giocatore, a terra;
//   y verso l'alto; il giocatore guarda verso -z;
//   +x = destra del giocatore.
// Rete a z = -11.885, linea di fondo avversaria a z = -23.77.
// Traiettoria parabolica semplice: niente spin, niente attrito dell'aria.

export const G = 9.81;
export const BALL_RADIUS = 0.0335;

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

export const DIFFICULTIES = Object.freeze({
  easy: { label: 'Facile', speedKmh: [55, 80] },
  medium: { label: 'Medio', speedKmh: [70, 100] },
  hard: { label: 'Difficile', speedKmh: [90, 125] },
});

// Velocità orizzontale campionata dal preset; il resto della traiettoria si
// ricava dal punto di rimbalzo scelto, quindi ogni lancio è valido per costruzione.
const LAUNCH = Object.freeze({
  x: [-3.6, 3.6],
  zBehindBaseline: [0, 1.2],
  height: [0.5, 1.3],
});

const BOUNCE = Object.freeze({
  x: [-(COURT.singlesHalfWidth - 0.15), COURT.singlesHalfWidth - 0.15],
  z: [-10.5, -0.35],
});

const NET_CLEARANCE = 0.04;
const MAX_APEX = 6.5;
const MIN_OCCLUSION_TIME = 0.12;
const MIN_OCCLUSION_LEAD = 0.1; // la palla sparisce almeno 0,1 s prima del rimbalzo

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

function between(rng, [min, max]) {
  return min + (max - min) * rng();
}

export function positionAt(launch, t) {
  return {
    x: launch.x0 + launch.vx * t,
    y: launch.y0 + launch.vy * t - 0.5 * G * t * t,
    z: launch.z0 + launch.vz * t,
  };
}

// Dopo il rimbalzo (solo per la visualizzazione): restituzione semplificata.
export function positionAfterBounce(launch, t) {
  if (t <= launch.flightTime) return positionAt(launch, t);
  const dt = t - launch.flightTime;
  const vyImpact = launch.vy - G * launch.flightTime;
  const vy = -0.72 * vyImpact;
  return {
    x: launch.bounce.x + launch.vx * 0.68 * dt,
    y: Math.max(BALL_RADIUS, BALL_RADIUS + vy * dt - 0.5 * G * dt * dt),
    z: launch.bounce.z + launch.vz * 0.68 * dt,
  };
}

function buildLaunch({ x0, y0, z0, bounceX, bounceZ, horizontalSpeed }) {
  const dx = bounceX - x0;
  const dz = bounceZ - z0;
  const distance = Math.hypot(dx, dz);
  const flightTime = distance / horizontalSpeed;
  const vx = dx / flightTime;
  const vz = dz / flightTime;
  const vy = (BALL_RADIUS - y0 + 0.5 * G * flightTime * flightTime) / flightTime;

  return {
    x0, y0, z0, vx, vy, vz,
    flightTime,
    bounce: { x: bounceX, z: bounceZ },
    speedKmh: Math.hypot(vx, vy, vz) * 3.6,
  };
}

export function netCrossing(launch) {
  const t = (COURT.netZ - launch.z0) / launch.vz;
  const p = positionAt(launch, t);
  return { t, ...p, clearance: p.y - BALL_RADIUS - netHeightAt(p.x) };
}

export function apexHeight(launch) {
  if (launch.vy <= 0) return launch.y0;
  return launch.y0 + (launch.vy * launch.vy) / (2 * G);
}

export function isRealistic(launch) {
  return netCrossing(launch).clearance >= NET_CLEARANCE
    && apexHeight(launch) <= MAX_APEX;
}

export function generateLaunch({ difficulty = 'medium', rng = Math.random } = {}) {
  const preset = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const launch = buildLaunch({
      x0: between(rng, LAUNCH.x),
      y0: between(rng, LAUNCH.height),
      z0: COURT.opponentBaselineZ - between(rng, LAUNCH.zBehindBaseline),
      bounceX: between(rng, BOUNCE.x),
      bounceZ: between(rng, BOUNCE.z),
      horizontalSpeed: between(rng, preset.speedKmh) / 3.6,
    });
    if (isRealistic(launch)) return launch;
  }

  // Ripiego sicuro (praticamente irraggiungibile): palla media al centro.
  return buildLaunch({
    x0: 0, y0: 1, z0: COURT.opponentBaselineZ,
    bounceX: 0, bounceZ: -4, horizontalSpeed: 18,
  });
}

// occlusion: { mode: 'none' } oppure { mode: 'distance', offsetM }, dove
// offsetM è la distanza dalla rete verso il giocatore (negativo = prima della rete).
// Restituisce l'istante di scomparsa, o null se la palla resta sempre visibile.
export function occlusionTime(launch, occlusion) {
  if (!occlusion || occlusion.mode === 'none') return null;
  const z = COURT.netZ + Number(occlusion.offsetM || 0);
  const t = (z - launch.z0) / launch.vz;
  return Math.min(
    Math.max(t, MIN_OCCLUSION_TIME),
    launch.flightTime - MIN_OCCLUSION_LEAD,
  );
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
  };
}
