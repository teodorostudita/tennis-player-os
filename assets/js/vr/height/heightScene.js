// VR Lab · Altezza — scena "trave tra due grattacieli" (segnaposto procedurali F1).
//
// Budget per il Quest 2: materiali Lambert/Basic, nessuna ombra in tempo reale,
// texture generate una volta su canvas (sostituibili con foto PBR in F2),
// città lontana in un'unica InstancedMesh, nebbia lineare. Circa 15 draw call.
//
// Coordinate "trave" (vedi calibration.js): la trave parte da z = startZ e va
// verso -z; il piano dei tetti è y = 0 (il pavimento reale), il fondo stradale
// è a y = -altitude.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY_RADIUS = 3000;
const CITY_RADIUS = 1600;
const CITY_COUNT = 520;
const BUILDING_DEPTH = 34; // estensione dei due grattacieli oltre le estremità della trave
const BUILDING_HALF_WIDTH = 11;
// Distanza minima tra i due grattacieli: l'asse reale è corto, la trave virtuale
// prosegue oltre la sua fine (segnata da una striscia gialla e nera).
const MIN_SPAN_M = 18;
const HAZE = 0xb9c8d8;
const NEUTRAL_BG = 0xd9d6cf;

// --- Texture procedurali ----------------------------------------------------

let seed = 7;
function random() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function canvasTexture(width, height, paint, { repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const v = Math.round(random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 3);
  }
}

// Facciata: 8 moduli finestra × 16 piani (3 m × 3,5 m ciascuno).
function facadeTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5d6670';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 8;
    const fh = h / 16;
    for (let row = 0; row < 16; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const lit = random() < 0.12;
        const shade = 40 + Math.round(random() * 35);
        ctx.fillStyle = lit ? '#d9c98f' : `rgb(${shade},${shade + 12},${shade + 24})`;
        ctx.fillRect(col * cw + 3, row * fh + 5, cw - 6, fh - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(col * cw + 3, row * fh + 5, cw - 6, 3);
      }
    }
  });
}

function steelTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f7378';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 5000, 0.12);
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = `rgba(${120 + random() * 40},${70 + random() * 20},40,${0.08 + random() * 0.12})`;
      ctx.fillRect(random() * w, random() * h, 2 + random() * 6, 8 + random() * 40);
    }
  });
}

function stripeTexture() {
  return canvasTexture(128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#f2c21b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#16181b';
    for (let x = -h; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 16 + h, 0); ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  }, { repeat: false });
}

function concreteTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8d8a84';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 9000, 0.10);
    ctx.strokeStyle = 'rgba(40,40,40,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  });
}

// Pianta della città vista dall'alto: isolati, strade, qualche parco.
function cityTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#3b3f44';
    ctx.fillRect(0, 0, w, h);
    const block = w / 8;
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 8; j += 1) {
        const park = random() < 0.08;
        const v = 95 + Math.round(random() * 40);
        ctx.fillStyle = park ? '#4f6b45' : `rgb(${v},${v - 4},${v - 10})`;
        ctx.fillRect(i * block + 10, j * block + 10, block - 20, block - 20);
      }
    }
    ctx.strokeStyle = 'rgba(230,230,210,0.35)';
    ctx.setLineDash([10, 12]);
    for (let i = 0; i <= 8; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * block, 0); ctx.lineTo(i * block, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * block); ctx.lineTo(w, i * block); ctx.stroke();
    }
  });
}

// --- Elementi fissi -----------------------------------------------------------

function buildSky() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const colors = [];
  const zenith = new THREE.Color(0x3f6ea8);
  const horizon = new THREE.Color(HAZE);
  const below = new THREE.Color(0x8d9aa6);
  const position = geometry.attributes.position;
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const h = position.getY(i) / SKY_RADIUS;
    if (h >= 0) color.copy(horizon).lerp(zenith, Math.pow(h, 0.55));
    else color.copy(horizon).lerp(below, Math.min(1, -h * 4));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
}

function buildNeutralWorld() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshBasicMaterial({ color: 0xc9c5bc }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0xa9a49a, 0xb9b4aa);
  grid.position.y = 0.002;
  group.add(grid);
  return group;
}

// --- Elementi che dipendono dalla calibrazione ---------------------------------

// Profilo a doppia T: ala superiore larga quanto l'asse reale.
function beamGeometry(width, length, topY) {
  const depth = Math.max(0.28, width * 1.3);
  const flange = 0.025;
  const web = Math.max(0.012, width * 0.08);
  const parts = [
    new THREE.BoxGeometry(width, flange, length).translate(0, topY - flange / 2, 0),
    new THREE.BoxGeometry(web, depth - 2 * flange, length).translate(0, topY - depth / 2, 0),
    new THREE.BoxGeometry(width, flange, length).translate(0, topY - depth + flange / 2, 0),
  ];
  // Texture ripetuta ogni metro lungo la trave.
  for (const part of parts) {
    const uv = part.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) * length);
  }
  return mergeGeometries(parts);
}

function boltMatrices(width, length, topY) {
  const matrices = [];
  const step = 0.5;
  for (let z = -step / 2; z > -length; z -= step) {
    for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) {
      matrices.push(new THREE.Matrix4().makeTranslation(x, topY + 0.006, z));
    }
  }
  return matrices;
}

function railingGeometry(halfGap, length, topY) {
  const parts = [];
  for (const side of [-1, 1]) {
    const x = side * halfGap;
    for (const height of [0.5, 1.05]) {
      parts.push(new THREE.CylinderGeometry(0.02, 0.02, length, 8)
        .rotateX(Math.PI / 2).translate(x, topY + height, -length / 2));
    }
    for (let z = 0; z >= -length; z -= Math.min(1.5, length / 2)) {
      parts.push(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8).translate(x, topY + 0.525, z));
    }
  }
  return mergeGeometries(parts);
}

// UV in metri reali: facciate a moduli di 24 × 56 m (la texture), tetto a riquadri di 4 m.
function buildingGeometry(zNear, zFar, altitude) {
  const depth = Math.abs(zFar - zNear);
  const width = BUILDING_HALF_WIDTH * 2;
  const geometry = new THREE.BoxGeometry(width, altitude, depth)
    .translate(0, -altitude / 2, (zNear + zFar) / 2);
  // Ordine delle facce di BoxGeometry: +x, -x, +y, -y, +z, -z (4 vertici ciascuna).
  const scale = [
    [depth / 24, altitude / 56], [depth / 24, altitude / 56],
    [width / 4, depth / 4], [width / 4, depth / 4],
    [width / 24, altitude / 56], [width / 24, altitude / 56],
  ];
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    const [su, sv] = scale[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return geometry;
}

// --- Scena --------------------------------------------------------------------

export function buildHeightScene() {
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(HAZE, 60, 1900);

  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x5b5850, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
  sun.position.set(-300, 500, 200);
  scene.add(sun);

  const textures = {
    facade: facadeTexture(),
    steel: steelTexture(),
    concrete: concreteTexture(),
    city: cityTexture(),
    stripe: stripeTexture(),
  };
  const materials = {
    facade: new THREE.MeshLambertMaterial({ map: textures.facade }),
    roof: new THREE.MeshLambertMaterial({ map: textures.concrete }),
    steel: new THREE.MeshLambertMaterial({ map: textures.steel }),
    bolt: new THREE.MeshLambertMaterial({ color: 0x4a4d52 }),
    railing: new THREE.MeshLambertMaterial({ color: 0xd8b13a }),
    ground: new THREE.MeshLambertMaterial({ map: textures.city }),
    city: new THREE.MeshLambertMaterial({ map: textures.facade }),
    footprint: new THREE.LineBasicMaterial({ color: 0x1f6fd1 }),
    stripe: new THREE.MeshBasicMaterial({ map: textures.stripe, fog: false }),
  };
  textures.city.repeat.set(CITY_RADIUS / 120, CITY_RADIUS / 120);

  const heightWorld = new THREE.Group();
  heightWorld.add(buildSky());
  const neutralWorld = buildNeutralWorld();
  scene.add(heightWorld, neutralWorld);

  // Strada e città lontana: si spostano con la quota.
  const below = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(CITY_RADIUS * 1.4, 48), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  below.add(ground);
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Una sola faccia di texture per tutto il palazzo: la nebbia nasconde lo stiramento.
  const city = new THREE.InstancedMesh(unitBox, materials.city, CITY_COUNT);
  below.add(city);
  heightWorld.add(below);

  // Ricalcolato a ogni calibrazione / cambio di quota.
  const layoutGroup = new THREE.Group();
  heightWorld.add(layoutGroup);
  // Contorno dell'asse reale, visibile anche nell'ambiente neutro.
  const footprintGroup = new THREE.Group();
  scene.add(footprintGroup);

  function placeCity(altitude) {
    seed = 99;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const maxHeight = Math.max(12, altitude * 0.85);
    for (let i = 0; i < CITY_COUNT; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = 90 + Math.pow(random(), 0.7) * (CITY_RADIUS - 90);
      const w = 18 + random() * 30;
      const d = 18 + random() * 30;
      const h = 8 + Math.pow(random(), 1.8) * (maxHeight - 8);
      matrix.makeRotationY(Math.round(random() * 4) * Math.PI / 2);
      matrix.scale(new THREE.Vector3(w, h, d));
      matrix.setPosition(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      city.setMatrixAt(i, matrix);
      const v = 0.7 + random() * 0.35;
      city.setColorAt(i, color.setRGB(v, v * 0.98, v * 0.95));
    }
    city.instanceMatrix.needsUpdate = true;
    if (city.instanceColor) city.instanceColor.needsUpdate = true;
  }

  function disposeGroup(group) {
    for (const child of [...group.children]) {
      child.geometry?.dispose();
      group.remove(child);
    }
  }

  let current = null;
  // layout: { beamWidth, beamLength, startZ, altitude, railings, plankThickness }
  function setLayout(layout) {
    current = { ...layout };
    const { beamWidth, beamLength, startZ, altitude, railings, plankThickness } = current;
    const topY = plankThickness;
    const endZ = startZ - beamLength;
    const span = Math.max(MIN_SPAN_M, beamLength + 2);
    const farZ = startZ - span;
    disposeGroup(layoutGroup);
    disposeGroup(footprintGroup);

    const beam = new THREE.Mesh(beamGeometry(beamWidth, span + 0.4, topY), materials.steel);
    beam.position.z = startZ - span / 2;
    layoutGroup.add(beam);

    // Fine dell'asse reale: oltre c'è il pavimento, non la trave.
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(beamWidth, 0.12).rotateX(-Math.PI / 2), materials.stripe);
    stripe.position.set(0, topY + 0.002, endZ + 0.06);
    layoutGroup.add(stripe);

    const bolts = boltMatrices(beamWidth, span, topY);
    const boltMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), materials.bolt, bolts.length,
    );
    bolts.forEach((m, i) => boltMesh.setMatrixAt(i, m));
    boltMesh.position.z = startZ;
    layoutGroup.add(boltMesh);

    if (railings) {
      const rail = new THREE.Mesh(railingGeometry(Math.max(0.45, beamWidth / 2 + 0.3), span, topY), materials.railing);
      rail.position.z = startZ;
      layoutGroup.add(rail);
    }

    // Grattacielo di partenza (dietro) e di arrivo (davanti).
    for (const [zNear, zFar] of [[startZ, startZ + BUILDING_DEPTH], [farZ, farZ - BUILDING_DEPTH]]) {
      const building = new THREE.Mesh(buildingGeometry(zNear, zFar, altitude), [
        materials.facade, materials.facade, materials.roof, materials.roof, materials.facade, materials.facade,
      ]);
      layoutGroup.add(building);
    }

    below.position.y = -altitude;
    placeCity(altitude);

    // Contorno dell'asse sul pavimento (coordinate trave).
    const w = beamWidth / 2;
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-w, 0.01, startZ), new THREE.Vector3(w, 0.01, startZ),
        new THREE.Vector3(w, 0.01, endZ), new THREE.Vector3(-w, 0.01, endZ),
      ]),
      materials.footprint,
    );
    footprintGroup.add(outline);
  }

  // 'height' | 'neutral'
  function setWorld(name) {
    const height = name === 'height';
    heightWorld.visible = height;
    neutralWorld.visible = !height;
    footprintGroup.visible = !height;
    scene.fog = height ? fog : null;
    scene.background = new THREE.Color(height ? HAZE : NEUTRAL_BG);
  }

  setWorld('neutral');
  return { scene, setLayout, setWorld, get layout() { return current; } };
}
