// VR Lab · Altezza — calibrazione: allinea la trave virtuale all'asse reale.
// Nessuna dipendenza da three: funzioni pure, verificabili con Node.
//
// Coordinate "reali" = spazio di riferimento local-floor del visore (x, z sul
// pavimento). Coordinate "trave" = mondo virtuale: la trave parte da (0, 0, startZ)
// e prosegue verso -z per `length` metri, centrata su x = 0.

export const MIN_PLANK_LENGTH_M = 1.2;
export const MAX_PLANK_LENGTH_M = 12;

// In modalità seduti il bordo del tetto è poco davanti alla sedia e la trave
// (non percorribile) ha una lunghezza fissa.
export const SEATED_EDGE_Z = -0.45;
export const SEATED_BEAM_LENGTH_M = 6;

// Area di sicurezza attorno all'asse (in piedi): oltre si va in pausa.
export const AREA = Object.freeze({ lateralM: 0.25, behindStartM: 0.5, beyondEndM: 0.4 });
export const BOUNDARY_MARGIN_M = 0.3;
export const SEATED_BOUNDARY_MIN_M = 0.6;

// Rotazione attorno a y (stessa convenzione di three: x' = x cos + z sin,
// z' = -x sin + z cos) che porta la direzione (dx, dz) su (0, -1).
export function yawToMinusZ(dx, dz) {
  return -Math.atan2(-dx, -dz);
}

export function rotateY({ x, z }, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

// Trasformazione reale → trave: world = rotY(yaw) · real + offset.
// Il punto `origin` finisce in (0, startZ), la direzione `direction` verso -z.
export function frameFrom(origin, direction, startZ = 0) {
  const yaw = yawToMinusZ(direction.x, direction.z);
  const rotated = rotateY(origin, yaw);
  return { yaw, offset: { x: -rotated.x, z: startZ - rotated.z } };
}

export function toBeamFrame(frame, point) {
  const r = rotateY(point, frame.yaw);
  return { x: r.x + frame.offset.x, z: r.z + frame.offset.z };
}

export function fromBeamFrame(frame, point) {
  return rotateY({ x: point.x - frame.offset.x, z: point.z - frame.offset.z }, -frame.yaw);
}

// --- Confine Guardian (poligono { x, z } in coordinate reali) -------------------

export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

// Distanza dal bordo: positiva dentro il poligono, negativa fuori.
export function signedDistanceToPolygon(p, polygon) {
  let min = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    min = Math.min(min, distanceToSegment(p, polygon[j], polygon[i]));
  }
  return pointInPolygon(p, polygon) ? min : -min;
}

// Solo un avviso, mai un blocco: sul Quest `boundsGeometry` è il rettangolo
// inscritto nel Guardian, spesso molto più piccolo dell'area tracciata.
// Restituisce { ok, clearancesM: [a, b], badEnds, warning }.
export function checkPlankInsideBoundary(a, b, polygon) {
  if (!polygon || polygon.length < 3) return { ok: true, clearancesM: [], badEnds: [] };
  const clearancesM = [a, b].map(p => signedDistanceToPolygon(p, polygon));
  const badEnds = [0, 1].filter(end => clearancesM[end] < BOUNDARY_MARGIN_M);
  if (!badEnds.length) return { ok: true, clearancesM, badEnds };
  const worst = Math.min(...badEnds.map(end => clearancesM[end]));
  const where = worst < 0 ? 'fuori dal confine Guardian' : `a ${Math.round(worst * 100)} cm dal confine Guardian`;
  const which = badEnds.length === 2 ? 'Le estremità risultano' : 'L’estremità in rosso risulta';
  return { ok: false, clearancesM, badEnds, warning: `${which} ${where}: controlla a occhio prima di salire.` };
}

// Calibrazione in piedi: controller appoggiati al centro delle due estremità
// dell'asse; `start` è quella su cui la persona sale per partire. Restituisce { ok, frame, length } o
// { ok: false, error }.
export function calibrateStanding(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < MIN_PLANK_LENGTH_M) {
    return { ok: false, error: `Estremità troppo vicine (${length.toFixed(2)} m): servono almeno ${MIN_PLANK_LENGTH_M} m.` };
  }
  if (length > MAX_PLANK_LENGTH_M) {
    return { ok: false, error: `Estremità troppo lontane (${length.toFixed(1)} m).` };
  }
  return { ok: true, frame: frameFrom(start, { x: dx, z: dz }, 0), length };
}

// Calibrazione da seduti: origine sotto la testa, direzione dello sguardo.
export function calibrateSeated(head, forward) {
  const norm = Math.hypot(forward.x, forward.z);
  if (norm < 0.2) {
    return { ok: false, error: 'Guarda davanti a te (non verso il basso) e premi di nuovo il grilletto.' };
  }
  return { ok: true, frame: frameFrom(head, { x: forward.x / norm, z: forward.z / norm }, 0), length: SEATED_BEAM_LENGTH_M };
}

// Area in cui la persona può stare (coordinate trave). Fuori da qui: pausa.
export function safeArea({ seated, length }) {
  if (seated) return { kind: 'circle', x: 0, z: 0, radius: 0.5 };
  // Davanti: poco oltre la fine dell'asse (la trave virtuale continua, il pavimento no).
  return { kind: 'rect', minX: -AREA.lateralM, maxX: AREA.lateralM, minZ: -length - AREA.beyondEndM, maxZ: AREA.behindStartM };
}

// Zona di partenza: la conferma "pronto" vale solo qui.
export function isAtStart({ seated }, head) {
  if (seated) return Math.hypot(head.x, head.z) < 0.35;
  return Math.abs(head.x) < AREA.lateralM && head.z > -0.6 && head.z < AREA.behindStartM;
}
