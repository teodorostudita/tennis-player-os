// VR Lab — volo della palla con resistenza dell'aria, effetto Magnus e rimbalzo
// dipendente dalla rotazione (funzioni pure, senza Three.js).
//
// Stesso sistema di riferimento di ballPhysics.js: il giocatore guarda verso -z,
// la palla dell'avversario viaggia verso +z. Vettori come array [x, y, z].
// Rotazione ω in rad/s (regola della mano destra). Per un colpo che viaggia nella
// direzione orizzontale d̂, il topspin ha ω = +spin · (ŷ × d̂): la parte bassa
// della palla ruota all'indietro e la forza di Magnus spinge verso il basso.
import {
  AIR, BALL, BOUNCE, DIFFICULTIES, GRAVITY, SHOTS, SIMULATION, TARGET,
} from './physicsConfig.js?v=1.3.7';
import { COURT, netHeightAt } from './ballPhysics.js?v=1.3.7';

const AREA = Math.PI * BALL.radius * BALL.radius;
const K_AIR = (0.5 * AIR.density * AREA) / BALL.mass;
const RPM_TO_RADS = (2 * Math.PI) / 60;
const DEG = Math.PI / 180;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function between(rng, [min, max]) {
  return min + (max - min) * rng();
}

// Coefficienti di resistenza e portanza (Štěpánek) per spin ratio S = r·ω / v.
export function aeroCoefficients(spinRatio) {
  if (!(spinRatio > 1e-6)) return { drag: AIR.dragNoSpin, lift: 0 };
  return {
    drag: AIR.dragNoSpin + (1 / (AIR.dragSpinA + AIR.dragSpinB * spinRatio ** -2.5)) ** 0.4,
    lift: 1 / (AIR.liftA + AIR.liftB / spinRatio),
  };
}

// Accelerazione: gravità + resistenza dell'aria + Magnus.
function acceleration(v, w, out) {
  out[0] = 0;
  out[1] = -GRAVITY;
  out[2] = 0;
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 1e-6) return out;

  const wMag = Math.hypot(w[0], w[1], w[2]);
  const { drag: cd, lift } = aeroCoefficients((BALL.radius * wMag) / speed);
  const drag = K_AIR * cd * speed;
  out[0] -= drag * v[0];
  out[1] -= drag * v[1];
  out[2] -= drag * v[2];

  if (!lift) return out;
  const cx = w[1] * v[2] - w[2] * v[1];
  const cy = w[2] * v[0] - w[0] * v[2];
  const cz = w[0] * v[1] - w[1] * v[0];
  const cMag = Math.hypot(cx, cy, cz);
  if (cMag < 1e-9) return out;
  const f = (K_AIR * lift * speed * speed) / cMag;
  out[0] += f * cx;
  out[1] += f * cy;
  out[2] += f * cz;
  return out;
}

// Un passo RK4 su posizione e velocità (ω costante nel passo).
const k = Array.from({ length: 4 }, () => ({ a: [0, 0, 0], v: [0, 0, 0] }));
const tmpV = [0, 0, 0];
function rk4Step(p, v, w, h, outP, outV) {
  acceleration(v, w, k[0].a);
  k[0].v[0] = v[0]; k[0].v[1] = v[1]; k[0].v[2] = v[2];
  for (let s = 1; s < 4; s += 1) {
    const f = s === 3 ? h : h / 2;
    for (let i = 0; i < 3; i += 1) tmpV[i] = v[i] + f * k[s - 1].a[i];
    acceleration(tmpV, w, k[s].a);
    k[s].v[0] = tmpV[0]; k[s].v[1] = tmpV[1]; k[s].v[2] = tmpV[2];
  }
  for (let i = 0; i < 3; i += 1) {
    outP[i] = p[i] + (h / 6) * (k[0].v[i] + 2 * k[1].v[i] + 2 * k[2].v[i] + k[3].v[i]);
    outV[i] = v[i] + (h / 6) * (k[0].a[i] + 2 * k[1].a[i] + 2 * k[2].a[i] + k[3].a[i]);
  }
}

export function restitution(impactSpeedY) {
  return clamp(
    BOUNCE.restitutionAt0 - BOUNCE.restitutionSlope * Math.abs(impactSpeedY),
    BOUNCE.restitutionMin,
    BOUNCE.restitutionMax,
  );
}

// Rimbalzo a impulso (Cross): verticale con coefficiente di restituzione e;
// orizzontale con attrito μ sul punto di contatto. Se l'attrito basta ad
// annullare lo scivolamento la palla esce "in rotolamento" (grip), altrimenti
// scivola per tutto l'impatto. Topspin: poco scivolamento → conserva velocità e
// accelera; slice: molto scivolamento → frena, resta bassa e "slitta".
export function bounce(v, w) {
  const vyIn = Math.abs(v[1]);
  const e = restitution(vyIn);
  const r = BALL.radius;
  const alpha = BALL.inertiaFactor;
  // Velocità del punto di contatto (0, −r, 0) rispetto al terreno.
  const sx = v[0] + r * w[2];
  const sz = v[2] - r * w[0];
  const slip = Math.hypot(sx, sz);
  let jx = 0;
  let jz = 0;
  let gripped = true;
  if (slip > 1e-9) {
    const toRoll = (alpha / (1 + alpha)) * slip;
    const maxFriction = BOUNCE.friction * (1 + e) * vyIn;
    gripped = toRoll <= maxFriction;
    const j = Math.min(toRoll, maxFriction);
    jx = (-j * sx) / slip;
    jz = (-j * sz) / slip;
  }
  return {
    v: [v[0] + jx, e * vyIn, v[2] + jz],
    w: [w[0] - jz / (alpha * r), w[1], w[2] + jx / (alpha * r)],
    e,
    gripped,
  };
}

// Simula dalla racchetta in poi. Restituisce i campioni (tempi non uniformi:
// il rimbalzo è sempre un campione esatto), i rimbalzi e il passaggio a rete.
export function simulate({ position, velocity, spin }, {
  dt = SIMULATION.dt,
  stopAtBounce = false,
  postBounceS = SIMULATION.postBounceS,
  maxFlightS = 4,
} = {}) {
  let p = [...position];
  let v = [...velocity];
  let w = [...spin];
  let t = 0;
  const times = [0];
  const points = [...p];
  const bounces = [];
  let net = null;
  let apex = p[1];
  const nextP = [0, 0, 0];
  const nextV = [0, 0, 0];
  const decay = Math.exp(-AIR.spinDecayPerS * dt);
  const r = BALL.radius;

  while (t < maxFlightS) {
    if (bounces.length && t >= bounces[0].t + postBounceS) break;
    rk4Step(p, v, w, dt, nextP, nextV);
    let h = dt;

    if (nextP[1] < r && v[1] < 0) {
      // Istante esatto del contatto con il suolo (bisezione sul passo).
      let lo = 0;
      let hi = dt;
      for (let i = 0; i < 30; i += 1) {
        const mid = (lo + hi) / 2;
        rk4Step(p, v, w, mid, nextP, nextV);
        if (nextP[1] < r) hi = mid; else lo = mid;
      }
      h = hi;
      rk4Step(p, v, w, h, nextP, nextV);
      nextP[1] = r;
    }

    if (!net && p[2] < COURT.netZ && nextP[2] >= COURT.netZ) {
      const u = (COURT.netZ - p[2]) / (nextP[2] - p[2]);
      const x = p[0] + u * (nextP[0] - p[0]);
      const y = p[1] + u * (nextP[1] - p[1]);
      net = { t: t + u * h, x, y, clearance: y - r - netHeightAt(x) };
    }

    t += h;
    p = [...nextP];
    v = [...nextV];
    w = w.map(c => c * (h === dt ? decay : Math.exp(-AIR.spinDecayPerS * h)));
    apex = Math.max(apex, p[1]);
    times.push(t);
    points.push(p[0], p[1], p[2]);

    if (p[1] <= r + 1e-9 && v[1] < 0) {
      const out = bounce(v, w);
      bounces.push({
        t,
        x: p[0],
        z: p[2],
        vIn: [...v],
        vOut: out.v,
        wIn: [...w],
        wOut: out.w,
        e: out.e,
        gripped: out.gripped,
      });
      v = out.v;
      w = out.w;
      if (stopAtBounce) break;
      if (bounces.length >= 4) break;
    }
  }

  return { times, points, bounces, net, apex, endTime: t };
}

// Posizione interpolata al tempo t (secondi dall'impatto con la racchetta).
export function positionAt(trajectory, t) {
  const { times, points } = trajectory;
  if (t <= 0) return { x: points[0], y: points[1], z: points[2] };
  const last = times.length - 1;
  if (t >= times[last]) {
    return { x: points[last * 3], y: points[last * 3 + 1], z: points[last * 3 + 2] };
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const u = (t - times[lo]) / (times[hi] - times[lo]);
  const a = lo * 3;
  const b = hi * 3;
  return {
    x: points[a] + u * (points[b] - points[a]),
    y: points[a + 1] + u * (points[b + 1] - points[a + 1]),
    z: points[a + 2] + u * (points[b + 2] - points[a + 2]),
  };
}

// Velocità e rotazione iniziali da parametri "da tennista".
export function launchState({ contact, aim, speedKmh, spinRpm, elevationDeg }) {
  const dx = aim.x - contact.x;
  const dz = aim.z - contact.z;
  const horizontal = Math.hypot(dx, dz) || 1;
  const d = [dx / horizontal, 0, dz / horizontal];
  const speed = speedKmh / 3.6;
  const el = elevationDeg * DEG;
  const spin = spinRpm * RPM_TO_RADS;
  // ŷ × d̂ = (d.z, 0, −d.x)
  return {
    position: [contact.x, contact.y, contact.z],
    velocity: [speed * Math.cos(el) * d[0], speed * Math.sin(el), speed * Math.cos(el) * d[2]],
    spin: [spin * d[2], 0, -spin * d[0]],
  };
}

function firstBounceDistance(state) {
  const sim = simulate(state, { dt: SIMULATION.searchDt, stopAtBounce: true });
  const b = sim.bounces[0];
  if (!b) return { distance: Infinity, sim };
  return { distance: Math.hypot(b.x - state.position[0], b.z - state.position[2]), sim };
}

// Elevazione che porta il primo rimbalzo a `distance` metri dal contatto
// (bisezione: la distanza cresce con l'elevazione negli angoli da tennis).
// Con `range` restituisce null se la distanza non è raggiungibile entro quei
// gradi: il tentativo viene scartato con due sole simulazioni.
function solveElevation(params, distance, range = [-12, 30]) {
  let [lo, hi] = range;
  if (range.feasibleOnly) {
    if (firstBounceDistance(launchState({ ...params, elevationDeg: lo })).distance > distance) return null;
    if (firstBounceDistance(launchState({ ...params, elevationDeg: hi })).distance < distance) return null;
  }
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const { distance: d } = firstBounceDistance(launchState({ ...params, elevationDeg: mid }));
    if (d < distance) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function isValid(sim, elevationDeg, shotSpec) {
  const b = sim.bounces[0];
  if (!b || !sim.net) return false;
  return sim.net.clearance >= TARGET.netClearanceMin
    && sim.apex <= TARGET.apexMax
    && elevationDeg >= shotSpec.elevationDeg[0]
    && elevationDeg <= shotSpec.elevationDeg[1]
    && b.x >= TARGET.bounceX[0] && b.x <= TARGET.bounceX[1]
    && b.z >= TARGET.bounceZ[0] && b.z <= TARGET.bounceZ[1];
}

function speedRange(shotSpec, difficulty) {
  const [f0, f1] = (DIFFICULTIES[difficulty] || DIFFICULTIES.medium).speedFraction;
  const [s0, s1] = shotSpec.speedKmh;
  return [s0 + (s1 - s0) * f0, s0 + (s1 - s0) * f1];
}

function buildShot(shotType, params, elevationDeg, sim) {
  const state = launchState({ ...params, elevationDeg });
  const trajectory = simulate(state);
  const first = trajectory.bounces[0];
  return {
    shotType,
    contact: { ...params.contact },
    aim: { ...params.aim },
    speedKmh: params.speedKmh,
    spinRpm: params.spinRpm,
    elevationDeg,
    velocity: state.velocity,
    spin: state.spin,
    trajectory,
    net: trajectory.net || sim?.net || null,
    flightTime: first ? first.t : trajectory.endTime,
    bounce: first ? { x: first.x, z: first.z } : null,
    bounceOut: first ? {
      speedKmh: Math.hypot(...first.vOut) * 3.6,
      angleDeg: Math.atan2(first.vOut[1], Math.hypot(first.vOut[0], first.vOut[2])) / DEG,
      gripped: first.gripped,
    } : null,
  };
}

// Genera un colpo realistico del tipo richiesto partendo dal punto di contatto
// della racchetta. Estrae velocità, rotazione e profondità del rimbalzo,
// calcola l'elevazione e scarta i colpi irrealistici (rete, fuori, parabola).
export function generateShot({ shotType, contact, aim, difficulty = 'medium', rng = Math.random }) {
  const shotSpec = SHOTS[shotType] || SHOTS.flat;
  const speeds = speedRange(shotSpec, difficulty);
  const dx = aim.x - contact.x;
  const dz = aim.z - contact.z;
  const len = Math.hypot(dx, dz) || 1;

  for (let attempt = 0; attempt < SIMULATION.maxAttempts; attempt += 1) {
    const params = {
      contact,
      aim,
      speedKmh: between(rng, speeds),
      spinRpm: between(rng, shotSpec.spinRpm),
    };
    // Profondità del rimbalzo lungo la direzione del colpo.
    const bounceZ = between(rng, TARGET.bounceZ);
    const distance = ((bounceZ - contact.z) / dz) * len;
    if (!(distance > 0)) continue;
    const range = Object.assign([...shotSpec.elevationDeg], { feasibleOnly: true });
    const elevationDeg = solveElevation(params, distance, range);
    if (elevationDeg == null) continue;
    const { sim } = firstBounceDistance(launchState({ ...params, elevationDeg }));
    if (isValid(sim, elevationDeg, shotSpec)) return buildShot(shotType, params, elevationDeg, sim);
  }

  // Ripiego (raro): colpo centrale a media velocità.
  const params = {
    contact,
    aim: { x: contact.x * 0.3, z: TARGET.aimZ },
    speedKmh: (speeds[0] + speeds[1]) / 2,
    spinRpm: (shotSpec.spinRpm[0] + shotSpec.spinRpm[1]) / 2,
  };
  const elevationDeg = solveElevation(params, Math.abs(-6 - contact.z));
  return buildShot(shotType, params, elevationDeg, null);
}
