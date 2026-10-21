// VR Lab — avversario: manichino low-poly animato a keyframe (tennista destro, ~1,85 m).
// Implementa il contratto di opponentContract.js.
//
// Le pose della clip descrivono busto, mani, racchetta e gambe; braccia e gambe
// si ricavano con una IK a due segmenti. Ogni parte è una mesh semplice
// (cilindri a 6 lati, box, sfera a bassa risoluzione) con materiali Lambert
// condivisi: circa 20 draw call, adatto al Quest 2.
import * as THREE from 'three';
import { BALL } from '../physicsConfig.js?v=1.3.7';
import { sampleClip } from './keyframes.js?v=1.3.7';
import { FOREHAND_CLIPS } from './forehandClips.js?v=1.3.7';
import { assertOpponent } from './opponentContract.js?v=1.3.7';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const DIM = Object.freeze({
  hipHeight: 1.0,
  torso: 0.52, // bacino → linea delle spalle
  neck: 0.09,
  headRadius: 0.115,
  shoulderHalf: 0.2,
  hipHalf: 0.1,
  upperArm: 0.31,
  forearm: 0.36, // gomito → impugnatura
  thigh: 0.48,
  shin: 0.46,
  racketHeadCenter: 0.42, // impugnatura → centro del piatto corde
});

const FEET = Object.freeze({
  right: new THREE.Vector3(0.3, 0.07, 0.05),
  left: new THREE.Vector3(-0.3, 0.07, -0.1),
});

const LEFT_ELBOW_POLE = new THREE.Vector3(-0.5, -1, 0.3);

const MATERIALS = {
  skin: new THREE.MeshLambertMaterial({ color: 0xd2a57c }),
  shirt: new THREE.MeshLambertMaterial({ color: 0x3a5f8a }),
  shorts: new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
  shoes: new THREE.MeshLambertMaterial({ color: 0xeef1f4 }),
  frame: new THREE.MeshLambertMaterial({ color: 0x1d1f24 }),
  strings: new THREE.MeshLambertMaterial({ color: 0xc9d1da, side: THREE.DoubleSide }),
};

// Cilindro di altezza 1 lungo y, da scalare tra due punti.
function limb(radius, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, 1, 6), material);
  mesh.matrixAutoUpdate = true;
  return mesh;
}

const tmpDir = new THREE.Vector3();
function placeSegment(mesh, a, b) {
  tmpDir.subVectors(b, a);
  const length = tmpDir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(1, Math.max(length, 1e-4), 1);
  if (length > 1e-6) mesh.quaternion.setFromUnitVectors(UP, tmpDir.multiplyScalar(1 / length));
}

// IK a due segmenti: posizione del gomito/ginocchio dati radice, bersaglio e
// direzione di piegamento. Se il bersaglio è fuori portata, l'estremo si ferma
// sulla retta radice → bersaglio.
function solveTwoBone(root, target, l1, l2, pole, outMid, outEnd) {
  const dir = new THREE.Vector3().subVectors(target, root);
  const dist = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  dir.normalize();
  outEnd.copy(root).addScaledVector(dir, dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(dir, -dir.y);
  bend.normalize();
  outMid.copy(root).addScaledVector(dir, a).addScaledVector(bend, h);
}

function turned(x, y, z, deg) {
  // + = rotazione verso destra (il fronte −z va verso +x).
  return new THREE.Vector3(x, y, z).applyAxisAngle(UP, -deg * DEG);
}

function vec(array) {
  return new THREE.Vector3(array[0], array[1], array[2]);
}

function buildRacket() {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.3, 6), MATERIALS.frame);
  handle.position.y = 0.07;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.009, 4, 18), MATERIALS.frame);
  head.scale.set(1, 1.27, 1);
  head.position.y = DIM.racketHeadCenter;
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), MATERIALS.strings);
  strings.scale.set(1, 1.27, 1);
  strings.position.y = DIM.racketHeadCenter;
  group.add(handle, head, strings);
  return group;
}

export function createMannequin({ clips = FOREHAND_CLIPS } = {}) {
  const object3d = new THREE.Group();
  object3d.name = 'opponent';
  const body = new THREE.Group();
  object3d.add(body);

  const parts = {
    head: new THREE.Mesh(new THREE.SphereGeometry(DIM.headRadius, 8, 6), MATERIALS.skin),
    neck: limb(0.045, MATERIALS.skin),
    torso: new THREE.Mesh(new THREE.BoxGeometry(0.38, DIM.torso + 0.04, 0.2), MATERIALS.shirt),
    pelvis: new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), MATERIALS.shorts),
    upperArmR: limb(0.048, MATERIALS.shirt),
    forearmR: limb(0.04, MATERIALS.skin),
    upperArmL: limb(0.048, MATERIALS.shirt),
    forearmL: limb(0.04, MATERIALS.skin),
    handR: new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), MATERIALS.skin),
    handL: new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), MATERIALS.skin),
    thighR: limb(0.075, MATERIALS.shorts),
    shinR: limb(0.055, MATERIALS.skin),
    thighL: limb(0.075, MATERIALS.shorts),
    shinL: limb(0.055, MATERIALS.skin),
    footR: new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.28), MATERIALS.shoes),
    footL: new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.28), MATERIALS.shoes),
    racket: buildRacket(),
  };
  body.add(...Object.values(parts));
  parts.footR.position.set(FEET.right.x, 0.035, FEET.right.z - 0.06);
  parts.footL.position.set(FEET.left.x, 0.035, FEET.left.z - 0.06);
  parts.footR.rotation.y = -0.35;
  parts.footL.rotation.y = 0.2;

  const v = {
    pelvis: new THREE.Vector3(),
    chest: new THREE.Vector3(),
    shoulderR: new THREE.Vector3(),
    shoulderL: new THREE.Vector3(),
    elbowR: new THREE.Vector3(),
    handR: new THREE.Vector3(),
    elbowL: new THREE.Vector3(),
    handL: new THREE.Vector3(),
    hipR: new THREE.Vector3(),
    hipL: new THREE.Vector3(),
    kneeR: new THREE.Vector3(),
    ankleR: new THREE.Vector3(),
    kneeL: new THREE.Vector3(),
    ankleL: new THREE.Vector3(),
    neckTop: new THREE.Vector3(),
  };
  const basis = new THREE.Matrix4();
  const racketX = new THREE.Vector3();
  const racketY = new THREE.Vector3();
  const racketZ = new THREE.Vector3();
  const contactLocal = new THREE.Vector3();

  function clipFor(shotType) {
    return clips[shotType] || clips[Object.keys(clips)[0]];
  }

  // Applica la posa (riferimento del corpo) a tutte le mesh.
  function applyPose(p) {
    v.pelvis.set(0, DIM.hipHeight - p.crouch, 0);

    // Bacino
    const hipRight = turned(1, 0, 0, p.hipTurn);
    const hipBack = new THREE.Vector3().crossVectors(hipRight, UP);
    parts.pelvis.position.copy(v.pelvis);
    parts.pelvis.quaternion.setFromRotationMatrix(basis.makeBasis(hipRight, UP, hipBack));

    // Busto: rotazione delle spalle e inclinazione in avanti
    const right = turned(1, 0, 0, p.trunkTurn);
    const forward = turned(0, 0, -1, p.trunkTurn);
    const spine = UP.clone().multiplyScalar(Math.cos(p.lean * DEG)).addScaledVector(forward, Math.sin(p.lean * DEG));
    const back = new THREE.Vector3().crossVectors(right, spine);
    v.chest.copy(v.pelvis).addScaledVector(spine, DIM.torso);
    parts.torso.position.copy(v.pelvis).addScaledVector(spine, DIM.torso / 2 + 0.02);
    parts.torso.quaternion.setFromRotationMatrix(basis.makeBasis(right, spine, back));
    v.neckTop.copy(v.chest).addScaledVector(spine, DIM.neck);
    placeSegment(parts.neck, v.chest, v.neckTop);
    parts.head.position.copy(v.neckTop).addScaledVector(spine, DIM.headRadius * 0.9);

    // Braccia
    v.shoulderR.copy(v.chest).addScaledVector(right, DIM.shoulderHalf);
    v.shoulderL.copy(v.chest).addScaledVector(right, -DIM.shoulderHalf);
    solveTwoBone(v.shoulderR, vec(p.rightHand), DIM.upperArm, DIM.forearm, vec(p.elbowPole), v.elbowR, v.handR);
    solveTwoBone(v.shoulderL, vec(p.leftHand), DIM.upperArm, DIM.forearm, LEFT_ELBOW_POLE, v.elbowL, v.handL);
    placeSegment(parts.upperArmR, v.shoulderR, v.elbowR);
    placeSegment(parts.forearmR, v.elbowR, v.handR);
    placeSegment(parts.upperArmL, v.shoulderL, v.elbowL);
    placeSegment(parts.forearmL, v.elbowL, v.handL);
    parts.handR.position.copy(v.handR);
    parts.handL.position.copy(v.handL);

    // Racchetta: y = manico → testa, z = normale del piatto corde
    racketY.fromArray(p.shaft).normalize();
    racketZ.fromArray(p.face);
    racketZ.addScaledVector(racketY, -racketZ.dot(racketY));
    if (racketZ.lengthSq() < 1e-8) racketZ.set(0, 0, -1).addScaledVector(racketY, racketY.z);
    racketZ.normalize();
    racketX.crossVectors(racketY, racketZ);
    parts.racket.position.copy(v.handR);
    parts.racket.quaternion.setFromRotationMatrix(basis.makeBasis(racketX, racketY, racketZ));
    contactLocal.copy(v.handR)
      .addScaledVector(racketY, DIM.racketHeadCenter)
      .addScaledVector(racketZ, BALL.radius);

    // Gambe: piedi fermi, ginocchia in avanti e leggermente in fuori
    v.hipR.copy(v.pelvis).addScaledVector(hipRight, DIM.hipHalf);
    v.hipL.copy(v.pelvis).addScaledVector(hipRight, -DIM.hipHalf);
    const kneePole = turned(0, 0, -1, p.hipTurn * 0.5);
    solveTwoBone(v.hipR, FEET.right, DIM.thigh, DIM.shin, kneePole.clone().add(new THREE.Vector3(0.3, 0, 0)), v.kneeR, v.ankleR);
    solveTwoBone(v.hipL, FEET.left, DIM.thigh, DIM.shin, kneePole.clone().add(new THREE.Vector3(-0.3, 0, 0)), v.kneeL, v.ankleL);
    placeSegment(parts.thighR, v.hipR, v.kneeR);
    placeSegment(parts.shinR, v.kneeR, v.ankleR);
    placeSegment(parts.thighL, v.hipL, v.kneeL);
    placeSegment(parts.shinL, v.kneeL, v.ankleL);
  }

  function place(placement) {
    body.position.set(placement.x, 0, placement.z);
    body.rotation.set(0, placement.yaw, 0);
  }

  function pose({ shotType, placement, clipTime }) {
    place(placement);
    applyPose(sampleClip(clipFor(shotType), clipTime));
  }

  // Posa al frame d'impatto e centro della palla sulle corde, in coordinate del campo.
  function prepare({ shotType, placement }) {
    const clip = clipFor(shotType);
    pose({ shotType, placement, clipTime: clip.impactTime });
    const world = contactLocal.clone().applyAxisAngle(UP, placement.yaw);
    return {
      duration: clip.duration,
      impactTime: clip.impactTime,
      contact: { x: placement.x + world.x, y: world.y, z: placement.z + world.z },
    };
  }

  function setVisible(visible) {
    object3d.visible = visible;
  }

  return assertOpponent({ object3d, prepare, pose, setVisible });
}
