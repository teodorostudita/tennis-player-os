// VR Lab — i tre dritti del manichino come keyframe (tennista destro).
//
// Riferimento del corpo: origine a terra tra i piedi, il manichino guarda verso
// −z, +x è la sua destra, y in alto (metri). Campi di ogni chiave:
//   crouch      abbassamento del bacino (m)
//   hipTurn     rotazione del bacino, gradi (+ = verso destra, chiusura)
//   trunkTurn   rotazione delle spalle, gradi (+ = verso destra)
//   lean        inclinazione in avanti del busto, gradi
//   rightHand   posizione dell'impugnatura
//   elbowPole   direzione verso cui piega il gomito destro
//   shaft       direzione manico → testa della racchetta
//   face        normale del piatto corde (lato che colpisce)
//   leftHand    posizione della mano sinistra
//
// Tutti i colpi hanno la stessa durata, lo stesso istante d'impatto e le stesse
// chiavi di tempo: cambiano solo traiettoria della racchetta, piatto corde e
// finale (più il carico sulle gambe). Nessun altro indizio.
import { mergeKeys } from './keyframes.js?v=1.3.7';

export const FOREHAND_DURATION = 1.6;
export const FOREHAND_IMPACT_TIME = 0.95;

// 0 pronto · 0,35 unit turn · 0,65 fine preparazione · 0,82 accelerazione
// 0,95 impatto · 1,12 accompagnamento · 1,6 finale
const BODY = [
  { t: 0, hipTurn: 0, trunkTurn: 0, lean: 10, leftHand: [0.12, 1.12, -0.6] },
  { t: 0.35, hipTurn: 35, trunkTurn: 75, lean: 12, leftHand: [0.3, 1.2, -0.45] },
  { t: 0.65, hipTurn: 45, trunkTurn: 95, lean: 12, leftHand: [0.15, 1.2, -0.5] },
  { t: 0.82, hipTurn: 20, trunkTurn: 55, lean: 12, leftHand: [-0.05, 1.1, -0.45] },
  { t: FOREHAND_IMPACT_TIME, hipTurn: -5, trunkTurn: 10, lean: 12, leftHand: [-0.35, 1.05, -0.2] },
  { t: 1.12, hipTurn: -25, trunkTurn: -35, lean: 10, leftHand: [-0.4, 1.05, 0.05] },
  { t: FOREHAND_DURATION, hipTurn: -35, trunkTurn: -60, lean: 6, leftHand: [-0.3, 1.2, -0.15] },
];

// Posizione di attesa, uguale per tutti i colpi.
const READY = {
  t: 0,
  crouch: 0.06,
  rightHand: [0.18, 1.0, -0.35],
  shaft: [-0.2, 0.45, -0.87],
  face: [1, 0, 0],
  elbowPole: [0.5, -1, 0.3],
};

// TOPSPIN: racchetta bassa in preparazione, swing dal basso verso l'alto,
// piatto leggermente chiuso, finale alto sopra la spalla sinistra.
const TOPSPIN = [
  READY,
  { t: 0.35, crouch: 0.12, rightHand: [0.45, 1.0, 0.2], shaft: [0.15, 0.1, 0.98], face: [0, -1, 0.1], elbowPole: [0.5, -1, 0.4] },
  { t: 0.65, crouch: 0.2, rightHand: [0.55, 0.72, 0.42], shaft: [0.15, -0.55, 0.82], face: [0.2, -0.8, -0.55], elbowPole: [0.5, -1, 0.4] },
  { t: 0.82, crouch: 0.17, rightHand: [0.6, 0.66, 0.05], shaft: [0.55, -0.45, 0.7], face: [0.1, -0.4, -0.9], elbowPole: [0.4, -1, 0.3] },
  { t: FOREHAND_IMPACT_TIME, crouch: 0.1, rightHand: [0.5, 0.86, -0.32], shaft: [0.97, -0.2, 0.08], face: [0, -0.22, -0.98], elbowPole: [0.3, -1, 0.1] },
  { t: 1.12, crouch: 0.03, rightHand: [0.1, 1.38, -0.55], shaft: [0.55, 0.8, 0.15], face: [-0.25, -0.1, -0.95], elbowPole: [0.2, -0.6, -0.6] },
  { t: FOREHAND_DURATION, crouch: 0.03, rightHand: [-0.35, 1.6, -0.1], shaft: [-0.1, 0.3, 0.95], face: [-1, 0, 0], elbowPole: [0.1, 0, -1] },
];

// SLICE: racchetta alta in preparazione, swing dall'alto verso il basso,
// piatto aperto, finale basso e corto in avanti (busto che ruota meno).
const SLICE = [
  READY,
  { t: 0.35, crouch: 0.1, rightHand: [0.45, 1.35, 0.2], shaft: [0.05, 0.85, 0.5], face: [0.1, 0.5, -0.85], elbowPole: [0.6, -1, 0.2] },
  { t: 0.65, crouch: 0.12, rightHand: [0.5, 1.48, 0.42], shaft: [0.1, 0.75, 0.65], face: [0.05, 0.65, -0.75], elbowPole: [0.6, -1, 0.3] },
  { t: 0.82, crouch: 0.14, rightHand: [0.55, 1.22, 0.05], shaft: [0.55, 0.6, 0.55], face: [0, 0.5, -0.85], elbowPole: [0.5, -1, 0.2] },
  { t: FOREHAND_IMPACT_TIME, crouch: 0.14, rightHand: [0.5, 1.0, -0.38], shaft: [0.93, 0.35, 0.05], face: [0, 0.4, -0.92], elbowPole: [0.4, -1, 0] },
  { t: 1.12, crouch: 0.13, trunkTurn: -10, hipTurn: -10, rightHand: [0.32, 0.86, -0.72], shaft: [0.7, 0.25, -0.65], face: [0.25, 0.8, -0.5], elbowPole: [0.4, -1, -0.2] },
  { t: FOREHAND_DURATION, crouch: 0.1, trunkTurn: -15, hipTurn: -15, rightHand: [0.22, 0.88, -0.72], shaft: [0.45, 0.3, -0.84], face: [0.2, 0.9, -0.2], elbowPole: [0.4, -1, -0.2] },
];

// PIATTO: swing quasi orizzontale, impatto più avanti rispetto al corpo,
// finale a media altezza.
const FLAT = [
  READY,
  { t: 0.35, crouch: 0.1, rightHand: [0.45, 1.12, 0.25], shaft: [0.12, 0.3, 0.95], face: [0.98, 0, -0.15], elbowPole: [0.5, -1, 0.4] },
  { t: 0.65, crouch: 0.14, rightHand: [0.56, 1.02, 0.5], shaft: [0.15, 0.08, 0.98], face: [0.98, 0, -0.15], elbowPole: [0.5, -1, 0.4] },
  { t: 0.82, crouch: 0.13, rightHand: [0.6, 0.96, 0.08], shaft: [0.6, 0.02, 0.8], face: [0.8, 0, -0.6], elbowPole: [0.4, -1, 0.3] },
  { t: FOREHAND_IMPACT_TIME, crouch: 0.1, rightHand: [0.45, 0.98, -0.48], shaft: [1, 0, 0.05], face: [0, 0, -1], elbowPole: [0.3, -1, 0] },
  { t: 1.12, crouch: 0.07, rightHand: [-0.05, 1.12, -0.62], shaft: [-0.2, 0.15, -0.97], face: [-0.95, 0, 0.2], elbowPole: [0.2, -0.8, -0.5] },
  { t: FOREHAND_DURATION, crouch: 0.05, rightHand: [-0.48, 1.22, -0.2], shaft: [-0.3, 0.1, 0.95], face: [-0.95, 0, -0.3], elbowPole: [0.1, -0.4, -1] },
];

function clip(specific) {
  return Object.freeze({
    duration: FOREHAND_DURATION,
    impactTime: FOREHAND_IMPACT_TIME,
    keys: mergeKeys(BODY, specific),
  });
}

export const FOREHAND_CLIPS = Object.freeze({
  topspin: clip(TOPSPIN),
  slice: clip(SLICE),
  flat: clip(FLAT),
});
