// VR Lab — costruzione della scena: campo in scala 1:1, rete, palla, marcatori.
import * as THREE from 'three';
import { BALL_RADIUS, COURT, netHeightAt } from './ballPhysics.js?v=1.3.0';

const LINE_Y = 0.003;
const LINE_WIDTH = 0.05;
const BASELINE_WIDTH = 0.10;

const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

function addLine(group, { x1, z1, x2, z2, width = LINE_WIDTH }) {
  const horizontal = z1 === z2;
  const length = horizontal ? Math.abs(x2 - x1) + width : Math.abs(z2 - z1) + width;
  const geometry = horizontal
    ? new THREE.PlaneGeometry(length, width)
    : new THREE.PlaneGeometry(width, length);
  const mesh = new THREE.Mesh(geometry, lineMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x1 + x2) / 2, LINE_Y, (z1 + z2) / 2);
  group.add(mesh);
}

function buildLines() {
  const group = new THREE.Group();
  const { doublesHalfWidth: dw, singlesHalfWidth: sw, netZ, opponentBaselineZ: far, serviceLineFromNet } = COURT;
  // Le linee sono interne al campo: il bordo esterno coincide con la misura ufficiale.
  const inset = LINE_WIDTH / 2;
  const nearZ = -BASELINE_WIDTH / 2;
  const farZ = far + BASELINE_WIDTH / 2;

  addLine(group, { x1: -dw, z1: nearZ, x2: dw, z2: nearZ, width: BASELINE_WIDTH });
  addLine(group, { x1: -dw, z1: farZ, x2: dw, z2: farZ, width: BASELINE_WIDTH });
  for (const x of [-dw + inset, dw - inset, -sw + inset, sw - inset]) {
    addLine(group, { x1: x, z1: 0, x2: x, z2: far });
  }
  for (const z of [netZ + serviceLineFromNet - inset, netZ - serviceLineFromNet + inset]) {
    addLine(group, { x1: -sw, z1: z, x2: sw, z2: z });
  }
  addLine(group, {
    x1: 0, z1: netZ + serviceLineFromNet, x2: 0, z2: netZ - serviceLineFromNet,
  });
  addLine(group, { x1: 0, z1: 0, x2: 0, z2: -0.1 });
  addLine(group, { x1: 0, z1: far, x2: 0, z2: far + 0.1 });
  return group;
}

function buildNet() {
  const group = new THREE.Group();
  const halfWidth = COURT.netPostX;
  const segments = 32;

  const geometry = new THREE.PlaneGeometry(halfWidth * 2, 1, segments, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    position.setY(i, position.getY(i) > 0 ? netHeightAt(x) : 0);
  }
  geometry.computeVertexNormals();

  const netMaterial = new THREE.MeshBasicMaterial({
    color: 0x111418,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const net = new THREE.Mesh(geometry, netMaterial);
  net.position.z = COURT.netZ;
  group.add(net);

  const tapePoints = [];
  for (let i = 0; i <= segments; i += 1) {
    const x = -halfWidth + (2 * halfWidth * i) / segments;
    tapePoints.push(new THREE.Vector3(x, netHeightAt(x) - 0.025, COURT.netZ));
  }
  const tape = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePoints), 64, 0.025, 6, false),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }),
  );
  group.add(tape);

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3b2f, metalness: 0.3, roughness: 0.6 });
  for (const x of [-halfWidth, halfWidth]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, COURT.netPostHeight + 0.02, 12),
      postMaterial,
    );
    post.position.set(x, (COURT.netPostHeight + 0.02) / 2, COURT.netZ);
    group.add(post);
  }

  const strap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, COURT.netCenterHeight),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  strap.position.set(0, COURT.netCenterHeight / 2, COURT.netZ + 0.002);
  group.add(strap);
  return group;
}

function buildGround() {
  const group = new THREE.Group();
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 60),
    new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 1 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, 0, COURT.netZ);
  group.add(surround);

  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.doublesHalfWidth * 2, COURT.length),
    new THREE.MeshStandardMaterial({ color: 0x2b5c9e, roughness: 0.95 }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set(0, 0.001, COURT.netZ);
  group.add(court);
  return group;
}

function buildBackdrop() {
  // Teloni di fondo scuri: contrasto per la palla e riferimento di profondità.
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x173b2c, roughness: 1, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(36, 3.5), material);
  back.position.set(0, 1.75, COURT.opponentBaselineZ - 6.4);
  group.add(back);
  for (const x of [-18, 18]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.5), material);
    side.rotation.y = Math.PI / 2;
    side.position.set(x, 1.75, COURT.netZ);
    group.add(side);
  }
  return group;
}

function ringMarker(color, radius = 0.12) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.62, radius, 40),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, transparent: true }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return mesh;
}

export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc8ea);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a40, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 14, 4);
  scene.add(sun);

  scene.add(buildGround(), buildLines(), buildNet(), buildBackdrop());

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xdcf03c, emissive: 0x4a5a00, roughness: 0.7 }),
  );
  ball.visible = false;
  scene.add(ball);

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_RADIUS * 1.1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.visible = false;
  scene.add(ballShadow);

  const launcher = new THREE.Group();
  const launcherBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.6 }),
  );
  launcherBody.position.y = 0.25;
  const launcherMouth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x1b1d21 }),
  );
  launcherMouth.rotation.x = Math.PI / 2;
  launcherMouth.position.set(0, 0.55, 0.15);
  launcher.add(launcherBody, launcherMouth);
  launcher.visible = false;
  scene.add(launcher);

  const actualMarker = ringMarker(0x3ddc84);
  const predictedMarker = ringMarker(0xff8a2a);
  const reticle = ringMarker(0xffffff, 0.09);
  scene.add(actualMarker, predictedMarker, reticle);

  const errorLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
  );
  errorLine.renderOrder = 6;
  errorLine.visible = false;
  scene.add(errorLine);

  const visiblePath = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  const hiddenPath = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: 0xffe14d, dashSize: 0.25, gapSize: 0.15 }),
  );
  visiblePath.visible = false;
  hiddenPath.visible = false;
  scene.add(visiblePath, hiddenPath);

  return {
    scene, ball, ballShadow, launcher,
    actualMarker, predictedMarker, reticle, errorLine, visiblePath, hiddenPath,
  };
}

export function setPath(line, points) {
  line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(p => new THREE.Vector3(p.x, p.y, p.z)),
  );
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
}
