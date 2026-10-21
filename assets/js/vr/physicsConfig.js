// VR Lab — parametri fisici, colpi dell'avversario e occlusione.
// Unico file da ritoccare per tarare l'esercizio "Lettura del colpo".
// Unità: metri, secondi, kg; per comodità rpm, km/h e gradi dove indicato.

export const GRAVITY = 9.81;

export const BALL = Object.freeze({
  mass: 0.057, // kg (ITF: 56,0–59,4 g)
  radius: 0.0335, // m (ITF: diametro 6,54–6,86 cm)
  inertiaFactor: 2 / 3, // I = k·m·r² (sfera cava a parete sottile)
});

// Coefficienti aerodinamici di Štěpánek (1988), con S = r·ω / v (spin ratio):
//   resistenza  CD = dragNoSpin + (1 / (dragSpinA + dragSpinB · S^−2,5))^0,4
//   portanza    CL = 1 / (liftA + liftB / S)
// Una palla che ruota frena di più: CD ≈ 0,51 senza rotazione, ≈ 0,65–0,70
// con un topspin forte (coerente con le misure in galleria del vento).
export const AIR = Object.freeze({
  density: 1.21, // kg/m³, 20 °C al livello del mare
  dragNoSpin: 0.508,
  dragSpinA: 22.503,
  dragSpinB: 4.196,
  liftA: 2.022,
  liftB: 0.981,
  spinDecayPerS: 0.03, // frazione di rotazione persa al secondo in volo
});

// Suono dell'impatto racchetta-palla: identico per ogni tipo di colpo, arriva
// con il ritardo reale dovuto alla distanza (circa 75 ms da fondo campo).
export const SOUND = Object.freeze({
  speedOfSound: 343, // m/s
  volume: 1.4,
  refDistance: 10, // m, attenuazione con la distanza (modello inverse)
  rolloff: 0.5,
});

// Rimbalzo: restituzione verticale dipendente dalla velocità d'impatto e
// attrito palla-campo (modello a impulso: scivolamento oppure rotolamento).
export const BOUNCE = Object.freeze({
  restitutionAt0: 0.86, // e = restitutionAt0 − restitutionSlope·|vy|, limitato a [min, max]
  restitutionSlope: 0.012,
  restitutionMin: 0.65,
  restitutionMax: 0.85,
  friction: 0.6, // cemento di velocità media
});

// Tre dritti dell'avversario. Velocità e rotazione sono quelle all'uscita dalla
// racchetta; spinRpm > 0 = topspin, < 0 = backspin (slice).
// elevationDeg è solo un filtro di realismo: l'elevazione effettiva viene
// calcolata per far rimbalzare la palla nel punto estratto.
export const SHOTS = Object.freeze({
  topspin: { label: 'Topspin', defaultWeight: 40, speedKmh: [95, 135], spinRpm: [1800, 3200], elevationDeg: [3, 16] },
  slice: { label: 'Slice', defaultWeight: 30, speedKmh: [70, 105], spinRpm: [-1800, -700], elevationDeg: [-3, 9] },
  flat: { label: 'Piatto', defaultWeight: 30, speedKmh: [105, 145], spinRpm: [100, 700], elevationDeg: [-4, 8] },
});

export const SHOT_TYPES = Object.freeze(Object.keys(SHOTS));

// La difficoltà sceglie una fascia (0 = minimo, 1 = massimo) dentro il range
// di velocità di ciascun colpo.
export const DIFFICULTIES = Object.freeze({
  easy: { label: 'Facile', speedFraction: [0, 0.45] },
  medium: { label: 'Medio', speedFraction: [0.25, 0.75] },
  hard: { label: 'Difficile', speedFraction: [0.55, 1] },
});

// Punto di rimbalzo estratto nel campo del giocatore (singolare, con margine).
export const TARGET = Object.freeze({
  bounceX: [-3.9, 3.9],
  bounceZ: [-10.6, -0.4],
  aimX: [-2.8, 2.8], // direzione del colpo: verso (aimX, aimZ)
  aimZ: -5,
  netClearanceMin: 0.05, // m sopra il nastro
  apexMax: 5.0, // m
});

// Posizione dell'avversario: indipendente dal tipo di colpo.
export const OPPONENT_PLACEMENT = Object.freeze({
  x: [-2.2, 2.2],
  behindBaseline: [0.2, 1.0],
});

export const OCCLUSION = Object.freeze({
  preImpactS: 0.150,
  unoccludedTailS: 0.6, // senza occlusione la palla resta visibile dopo il rimbalzo
});

export const SIMULATION = Object.freeze({
  dt: 0.002, // passo RK4 della traiettoria mostrata
  searchDt: 0.005, // passo RK4 durante la ricerca del lancio
  postBounceS: 1.4, // durata simulata dopo il primo rimbalzo
  maxAttempts: 60,
});
