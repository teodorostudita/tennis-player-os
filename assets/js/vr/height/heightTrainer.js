// VR Lab · Altezza — rendering, calibrazione, sicurezza e anteprima desktop.
//
// Stati in VR:
//   intro → (in piedi) calibStart → calibEnd | (seduti) calibSeated
//         → ready → exposed ⇄ ground / paused
// Tutto ciò che non è "exposed" si svolge nell'ambiente neutro (pavimento
// chiaro, contorno blu dell'asse reale). La camera segue solo la testa: nessun
// movimento artificiale.
import * as THREE from 'three';
import { createPanel } from '../hud.js?v=1.3.10';
import { buildHeightScene } from './heightScene.js?v=1.3.10';
import {
  SEATED_BEAM_LENGTH_M,
  SEATED_EDGE_Z,
  calibrateSeated,
  calibrateStanding,
  isAtStart,
  safeArea,
} from './calibration.js?v=1.3.10';
import { createSafetyMonitor } from './safety.js?v=1.3.10';

export const ALTITUDES = Object.freeze({
  low: { label: 'Bassa · 4 m', meters: 4 },
  medium: { label: 'Media · 25 m', meters: 25 },
  high: { label: 'Alta · 80 m', meters: 80 },
  extreme: { label: 'Estrema · 200 m', meters: 200 },
});

const DESKTOP_EYE = { standing: 1.7, seated: 1.2 };
const DESKTOP_PLANK_LENGTH_M = 3.6;
const FADE_OUT_EMERGENCY_S = 0.12;
const FADE_OUT_S = 0.4;
const FADE_IN_S = 0.7;
// Dopo un'uscita d'emergenza il grip resta inattivo per un attimo: chi lo preme
// più volte di fila non deve finire per sbaglio nella ricalibrazione.
const GRIP_COOLDOWN_S = 1.5;
const PREFERRED_HZ = 90;
const FALLBACK_HZ = 72;
// Secondi consecutivi sotto questa soglia (a 90 Hz) prima di scendere a 72 Hz.
const LOW_FPS_THRESHOLD = 82;
const LOW_FPS_SECONDS = 4;

const NEUTRAL_STATES = new Set(['intro', 'calibStart', 'calibEnd', 'calibSeated', 'ready', 'ground', 'paused']);

export function createHeightTrainer({ host, settings, onDiagnostics, onEnd }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);
  host.appendChild(renderer.domElement);

  const world = buildHeightScene();
  const { scene } = world;
  const camera = new THREE.PerspectiveCamera(75, host.clientWidth / host.clientHeight, 0.05, 4000);
  // Il rig porta le coordinate reali (local-floor) in quelle della trave.
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  // Sfera nera attorno alla testa per le dissolvenze.
  const fadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }),
  );
  fadeMesh.renderOrder = 20;
  fadeMesh.frustumCulled = false;
  fadeMesh.visible = false;
  camera.add(fadeMesh);

  const panel = createPanel({ width: 1.6, height: 0.8 });
  panel.mesh.material.fog = false;
  scene.add(panel.mesh);

  // Cursore sul pavimento sotto la punta del controller e segno dell'estremità
  // già registrata: figli del rig, cioè in coordinate reali.
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x1f6fd1, fog: false });
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.06, 24).rotateX(-Math.PI / 2), markerMaterial);
  const startMarker = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2), markerMaterial);
  cursor.visible = startMarker.visible = false;
  rig.add(cursor, startMarker);

  const safety = createSafetyMonitor();
  let state = 'intro';
  let stateSince = 0;
  let calibration = null; // { frame, length, seated }
  let pendingStart = null;
  let lastMessage = '';
  let lastPanelKey = '';
  let eyeHeight = 0;

  // --- Utilità ------------------------------------------------------------------
  function now() {
    return performance.now() / 1000;
  }

  const headWorld = new THREE.Vector3();
  function headInBeamFrame() {
    camera.getWorldPosition(headWorld);
    return { x: headWorld.x, y: headWorld.y, z: headWorld.z };
  }

  const forward = new THREE.Vector3();
  function placePanelInFront(distance = 1.6) {
    camera.getWorldPosition(headWorld);
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    panel.mesh.position.copy(headWorld).addScaledVector(forward, distance);
    panel.mesh.position.y = Math.max(1.0, headWorld.y - 0.1);
    panel.mesh.lookAt(headWorld.x, panel.mesh.position.y, headWorld.z);
  }

  function isSeated() {
    return settings.posture === 'seated';
  }

  function layoutFor(cal) {
    return {
      beamWidth: settings.beamWidthCm / 100,
      beamLength: cal.length,
      startZ: cal.seated ? SEATED_EDGE_Z : 0,
      altitude: ALTITUDES[settings.altitude]?.meters ?? ALTITUDES.low.meters,
      railings: Boolean(settings.railings),
      plankThickness: cal.seated ? 0 : settings.plankThicknessCm / 100,
    };
  }

  function applyCalibration(cal) {
    calibration = cal;
    rig.rotation.set(0, cal.frame.yaw, 0);
    rig.position.set(cal.frame.offset.x, 0, cal.frame.offset.z);
    rig.updateMatrixWorld(true);
    world.setLayout(layoutFor(cal));
  }

  // --- Dissolvenze --------------------------------------------------------------
  const fade = { value: 0, phase: 'idle', outS: FADE_OUT_S, onBlack: null };
  function fadeThrough(onBlack, { emergency = false } = {}) {
    fade.phase = 'out';
    fade.outS = emergency ? FADE_OUT_EMERGENCY_S : FADE_OUT_S;
    fade.onBlack = onBlack;
  }
  function updateFade(dt) {
    if (fade.phase === 'out') {
      fade.value = Math.min(1, fade.value + dt / fade.outS);
      if (fade.value >= 1) {
        const callback = fade.onBlack;
        fade.onBlack = null;
        fade.phase = 'in';
        callback?.();
      }
    } else if (fade.phase === 'in') {
      fade.value = Math.max(0, fade.value - dt / FADE_IN_S);
      if (fade.value <= 0) fade.phase = 'idle';
    }
    fadeMesh.visible = fade.value > 0;
    fadeMesh.material.opacity = fade.value;
  }

  // --- Stati --------------------------------------------------------------------
  function setState(next, message = '') {
    state = next;
    stateSince = now();
    lastMessage = message;
    lastPanelKey = '';
    world.setWorld(NEUTRAL_STATES.has(next) ? 'neutral' : 'height');
    if (NEUTRAL_STATES.has(next)) placePanelInFront();
    logEvent(`stato: ${next}${message ? ` (${message})` : ''}`);
  }

  function goToGround(reason) {
    safety.disarm();
    fadeThrough(() => setState(reason ? 'paused' : 'ground', reason || ''), { emergency: true });
  }

  function startCalibration() {
    pendingStart = null;
    startMarker.visible = false;
    setState(isSeated() ? 'calibSeated' : 'calibStart');
  }

  function tryExpose() {
    if (!calibration) {
      startCalibration();
      return;
    }
    const head = headInBeamFrame();
    if (!isAtStart({ seated: calibration.seated }, head)) {
      lastMessage = calibration.seated
        ? 'Resta seduto nella posizione della calibrazione.'
        : 'Mettiti sull’inizio dell’asse, sopra il contorno blu.';
      lastPanelKey = '';
      return;
    }
    const minEye = calibration.seated ? 0.8 : 1.2;
    if (head.y < minEye) {
      lastMessage = calibration.seated ? 'Siediti con la schiena dritta.' : 'Alzati in piedi, con lo sguardo avanti.';
      lastPanelKey = '';
      return;
    }
    eyeHeight = head.y;
    logEvent(`partenza: occhi a ${Math.round(eyeHeight * 100)} cm`);
    fadeThrough(() => {
      setState('exposed');
      safety.arm(eyeHeight, safeArea({ seated: calibration.seated, length: calibration.length }));
    });
  }

  function handleTrigger(controller) {
    if (fade.phase !== 'idle') return;
    const point = controller ? { x: controller.position.x, z: controller.position.z } : null;
    switch (state) {
      case 'intro':
        startCalibration();
        break;
      case 'calibStart':
        if (!point) return;
        pendingStart = point;
        startMarker.position.set(point.x, 0.006, point.z);
        startMarker.visible = true;
        setState('calibEnd');
        break;
      case 'calibEnd': {
        if (!point || !pendingStart) return;
        const result = calibrateStanding(pendingStart, point);
        if (!result.ok) {
          lastMessage = result.error;
          lastPanelKey = '';
          return;
        }
        startMarker.visible = false;
        applyCalibration({ ...result, seated: false });
        logEvent(`calibrazione in piedi: asse ${result.length.toFixed(2)} m`);
        setState('ready');
        break;
      }
      case 'calibSeated': {
        camera.getWorldDirection(forward);
        // Direzione e testa in coordinate reali (locali al rig).
        const yaw = rig.rotation.y;
        const realForward = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
        const result = calibrateSeated({ x: camera.position.x, z: camera.position.z }, { x: realForward.x, z: realForward.z });
        if (!result.ok) {
          lastMessage = result.error;
          lastPanelKey = '';
          return;
        }
        applyCalibration({ ...result, seated: true });
        logEvent('calibrazione da seduti');
        setState('ready');
        break;
      }
      case 'ready':
      case 'ground':
      case 'paused':
        tryExpose();
        break;
      default:
        break;
    }
  }

  function handleGrip() {
    if (state === 'exposed') {
      logEvent('uscita: grip');
      goToGround('');
      return;
    }
    if (fade.phase !== 'idle' || now() - stateSince < GRIP_COOLDOWN_S) return;
    // Nell'anteprima desktop non c'è un controller con cui calibrare: si riparte.
    if (!renderer.xr.isPresenting) resetDesktop();
    else if (state !== 'intro') startCalibration();
  }

  // --- Pannello -----------------------------------------------------------------
  const WHITE = '#ffffff';
  const MUTED = '#b9c6d8';
  const ACCENT = '#ffe14d';
  function panelLines() {
    const note = lastMessage ? [{ text: lastMessage, size: 0.8, color: ACCENT }] : [];
    switch (state) {
      case 'intro':
        return [
          { text: 'Altezza · sicurezza', size: 1.2, weight: 700 },
          { text: 'Spazio libero, una persona presente, nessun ostacolo.', size: 0.75, color: MUTED },
          { text: 'Grip (tasto laterale) in qualsiasi momento = torna a terra.', size: 0.75, color: MUTED },
          { text: 'Grilletto: inizia la calibrazione', size: 0.9, color: ACCENT },
        ];
      case 'calibStart':
        return [
          { text: 'Calibrazione 1/2', size: 1.2, weight: 700 },
          { text: 'Appoggia la punta del controller sul pavimento', size: 0.8 },
          { text: 'al centro dell’estremità da cui PARTI e premi il grilletto.', size: 0.8 },
          ...note,
        ];
      case 'calibEnd':
        return [
          { text: 'Calibrazione 2/2', size: 1.2, weight: 700 },
          { text: 'Ora la punta del controller al centro', size: 0.8 },
          { text: 'dell’estremità OPPOSTA dell’asse, poi grilletto.', size: 0.8 },
          { text: 'Grip = ricomincia', size: 0.7, color: MUTED },
          ...note,
        ];
      case 'calibSeated':
        return [
          { text: 'Calibrazione da seduti', size: 1.2, weight: 700 },
          { text: 'Siediti comodo, guarda dritto davanti a te', size: 0.8 },
          { text: 'e premi il grilletto.', size: 0.8 },
          ...note,
        ];
      case 'ready':
      case 'ground':
      case 'paused': {
        const title = state === 'paused' ? 'Pausa di sicurezza' : state === 'ground' ? 'Sei a terra' : 'Pronto';
        const where = calibration?.seated ? 'Resta seduto, schiena dritta, sguardo avanti.' : 'In piedi sull’inizio dell’asse, sguardo avanti.';
        return [
          { text: title, size: 1.2, weight: 700 },
          ...(state === 'paused' && lastMessage ? [] : note),
          { text: where, size: 0.8 },
          { text: `Grilletto: sali in quota (${ALTITUDES[settings.altitude]?.label || ''})`, size: 0.85, color: ACCENT },
          { text: 'Grip: ricalibra · tasto Meta → Esci per finire', size: 0.7, color: MUTED },
        ];
      }
      default:
        return [];
    }
  }

  function updatePanel() {
    const visible = NEUTRAL_STATES.has(state);
    panel.mesh.visible = visible;
    if (!visible) return;
    const key = `${state}|${lastMessage}`;
    if (key === lastPanelKey) return;
    lastPanelKey = key;
    panel.draw(panelLines());
  }

  // --- Input dei controller -----------------------------------------------------
  const controllers = [];
  const controllerMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const controllerTipMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14d, fog: false });
  for (let i = 0; i < 2; i += 1) {
    const controller = renderer.xr.getController(i);
    controller.addEventListener('selectstart', () => handleTrigger(controller));
    controller.addEventListener('squeezestart', handleGrip);
    controller.addEventListener('connected', event => { controller.userData.hand = event.data?.handedness || ''; });
    rig.add(controller);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 12), controllerMaterial);
    handle.rotation.x = Math.PI / 2 - 0.5;
    handle.position.set(0, -0.02, 0.03);
    grip.add(handle);
    rig.add(grip);
    // Punta gialla sull'origine del raggio: è il punto usato per la calibrazione.
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), controllerTipMaterial);
    controller.add(tip);
  }

  function updateCursor() {
    const calibrating = state === 'calibStart' || state === 'calibEnd';
    const active = controllers.find(c => c.visible);
    cursor.visible = calibrating && Boolean(active);
    if (cursor.visible) cursor.position.set(active.position.x, 0.006, active.position.z);
  }

  // --- Anteprima desktop --------------------------------------------------------
  // Trascina per guardare; frecce/WASD spostano la testa, C si accovaccia,
  // G = grip (a terra), spazio = grilletto.
  const look = { yaw: 0, pitch: -0.35, dragging: false, x: 0, y: 0, crouch: false };
  function desktopEye() {
    return DESKTOP_EYE[isSeated() ? 'seated' : 'standing'];
  }
  function applyDesktopCamera() {
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    camera.position.y = look.crouch ? desktopEye() * 0.5 : desktopEye();
  }
  function resetDesktop() {
    look.yaw = 0;
    look.pitch = -0.35;
    look.crouch = false;
    const seated = isSeated();
    // Asse simulato: parte sotto i piedi e prosegue verso -z.
    applyCalibration({
      seated,
      length: seated ? SEATED_BEAM_LENGTH_M : DESKTOP_PLANK_LENGTH_M,
      frame: { yaw: 0, offset: { x: 0, z: 0 } },
    });
    camera.position.set(0, desktopEye(), seated ? 0 : 0.2);
    applyDesktopCamera();
    safety.disarm();
    setState('exposed');
    safety.arm(desktopEye(), safeArea({ seated, length: calibration.length }));
  }

  function onPointerDown(event) {
    look.dragging = true;
    look.x = event.clientX;
    look.y = event.clientY;
  }
  function onPointerMove(event) {
    if (!look.dragging || renderer.xr.isPresenting) return;
    look.yaw -= (event.clientX - look.x) * 0.005;
    look.pitch = Math.max(-1.45, Math.min(1.2, look.pitch - (event.clientY - look.y) * 0.005));
    look.x = event.clientX;
    look.y = event.clientY;
    applyDesktopCamera();
  }
  function onPointerUp() {
    look.dragging = false;
  }
  function onKeyDown(event) {
    if (renderer.xr.isPresenting) return;
    if (event.target?.closest?.('input, select, textarea')) return;
    const step = 0.1;
    const moves = {
      ArrowUp: [0, -step], KeyW: [0, -step], ArrowDown: [0, step], KeyS: [0, step],
      ArrowLeft: [-step, 0], KeyA: [-step, 0], ArrowRight: [step, 0], KeyD: [step, 0],
    };
    if (moves[event.code]) {
      const [dx, dz] = moves[event.code];
      const c = Math.cos(look.yaw);
      const s = Math.sin(look.yaw);
      camera.position.x += dx * c + dz * s;
      camera.position.z += -dx * s + dz * c;
      event.preventDefault();
    } else if (event.code === 'KeyC') {
      look.crouch = !look.crouch;
      applyDesktopCamera();
    } else if (event.code === 'KeyG') {
      handleGrip();
    } else if (event.code === 'Space') {
      event.preventDefault();
      handleTrigger(null);
    }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  function onResize() {
    if (renderer.xr.isPresenting) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener('resize', onResize);

  // --- Diagnostica (stesso formato della lettura del colpo) -----------------------
  const diagnostics = { frames: 0, xrFrames: 0, errors: [], events: [], xrFramesPerSecond: [] };
  let diagnosticsTimer = null;
  let framesAtLastTick = 0;
  let lowFpsSeconds = 0;
  let targetHz = null;
  function logEvent(text) {
    const at = diagnostics.sessionStart ? `${(now() - diagnostics.sessionStart).toFixed(2)} s` : 'pre';
    diagnostics.events.push(`${at} · ${text}`);
    if (diagnostics.events.length > 60) diagnostics.events.shift();
  }
  function emitDiagnostics() {
    if (!diagnostics.id) return;
    diagnostics.elapsedS = Math.round((now() - diagnostics.sessionStart) * 100) / 100;
    diagnostics.state = state;
    diagnostics.targetHz = targetHz;
    try { onDiagnostics?.(structuredClone(diagnostics)); } catch (_) {}
  }
  renderer.domElement.addEventListener('webglcontextlost', () => { logEvent('webglcontextlost'); emitDiagnostics(); });

  // Se a 90 Hz il visore non tiene il passo per qualche secondo, scende a 72 Hz.
  function checkFrameRate(fps) {
    const session = renderer.xr.getSession();
    if (!session || targetHz !== PREFERRED_HZ) return;
    lowFpsSeconds = fps < LOW_FPS_THRESHOLD ? lowFpsSeconds + 1 : 0;
    if (lowFpsSeconds < LOW_FPS_SECONDS) return;
    targetHz = FALLBACK_HZ;
    session.updateTargetFrameRate?.(FALLBACK_HZ)
      .then(() => logEvent(`frequenza abbassata a ${FALLBACK_HZ} Hz (${LOW_FPS_SECONDS} s sotto ${LOW_FPS_THRESHOLD} fps)`))
      .catch(error => logEvent(`cambio frequenza non riuscito: ${error?.message || error}`));
  }

  // --- Ciclo dei frame ------------------------------------------------------------
  let lastTime = now();
  function drawFrame() {
    const t = now();
    const dt = Math.min(0.1, t - lastTime);
    lastTime = t;

    if (state === 'exposed' && fade.phase === 'idle') {
      const alarm = safety.check(t, headInBeamFrame());
      if (alarm) {
        logEvent(`pausa: ${alarm.detail}`);
        goToGround(alarm.reason === 'drop'
          ? 'Testa scesa di colpo: va tutto bene? Rialzati con calma.'
          : 'Sei uscito dall’area calibrata. Torna sull’asse.');
      }
    }
    // Appena entrati in uno stato a terra la posa della testa può essere ancora
    // quella iniziale (0, 0, 0): il pannello segue lo sguardo per mezzo secondo.
    if (NEUTRAL_STATES.has(state) && t - stateSince < 0.5) placePanelInFront();
    updateFade(dt);
    updateCursor();
    updatePanel();
    renderer.render(scene, camera);
  }

  // Un errore in un singolo frame non deve fermare il loop (vedi lettura del colpo).
  function tick() {
    diagnostics.frames += 1;
    if (renderer.xr.isPresenting) diagnostics.xrFrames += 1;
    try {
      drawFrame();
    } catch (error) {
      const message = `${error?.name || 'Error'}: ${error?.message || error}`;
      if (!diagnostics.errors.includes(message) && diagnostics.errors.length < 8) {
        diagnostics.errors.push(message);
        logEvent(`errore nel frame: ${message}`);
      }
      console.error('VR frame error:', error);
      try { renderer.render(scene, camera); } catch (_) {}
    }
  }

  resetDesktop();
  renderer.setAnimationLoop(tick);

  async function enterVR() {
    const clickAt = now();
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    Object.assign(diagnostics, {
      id: crypto.randomUUID(),
      experience: 'height',
      sessionStart: now(), frames: 0, xrFrames: 0, errors: [], events: [], xrFramesPerSecond: [],
      requestSessionMs: Math.round((now() - clickAt) * 1000),
      settings: structuredClone(settings),
    });
    framesAtLastTick = 0;
    lowFpsSeconds = 0;
    targetHz = null;
    logEvent(`sessione immersiva avviata (enabledFeatures: ${(session.enabledFeatures || []).join(', ') || 'n/d'})`);
    clearInterval(diagnosticsTimer);
    diagnosticsTimer = setInterval(() => {
      const fps = diagnostics.xrFrames - framesAtLastTick;
      diagnostics.xrFramesPerSecond.push(fps);
      if (diagnostics.xrFramesPerSecond.length > 120) diagnostics.xrFramesPerSecond.shift();
      framesAtLastTick = diagnostics.xrFrames;
      checkFrameRate(fps);
      emitDiagnostics();
    }, 1000);
    session.addEventListener('visibilitychange', () => logEvent(`visibilità: ${session.visibilityState}`));
    session.addEventListener('end', () => {
      logEvent('sessione terminata');
      clearInterval(diagnosticsTimer);
      emitDiagnostics();
      diagnostics.durationS = Math.round((now() - diagnostics.sessionStart) * 10) / 10;
      resetDesktop();
      onResize();
      onEnd?.({ diagnostics: structuredClone(diagnostics) });
    });

    // In VR si riparte sempre dall'introduzione: la calibrazione vale per una sessione.
    calibration = null;
    safety.disarm();
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    await renderer.xr.setSession(session);
    setState('intro');

    const rates = session.supportedFrameRates ? [...session.supportedFrameRates] : [];
    if (rates.includes(PREFERRED_HZ) && session.updateTargetFrameRate) {
      try {
        await session.updateTargetFrameRate(PREFERRED_HZ);
        targetHz = PREFERRED_HZ;
      } catch (error) {
        logEvent(`90 Hz non disponibili: ${error?.message || error}`);
      }
    }
    logEvent(`frequenze supportate: ${rates.join(', ') || 'n/d'} · attuale: ${session.frameRate ?? 'n/d'}`);
    emitDiagnostics();
  }

  // Le impostazioni del menu valgono subito nell'anteprima; in VR alla prossima salita.
  function configure(nextSettings) {
    Object.assign(settings, nextSettings || {});
    if (!renderer.xr.isPresenting) {
      resetDesktop();
    } else if (calibration && !calibration.seated) {
      world.setLayout(layoutFor(calibration));
    }
  }

  return {
    enterVR,
    configure,
    logEvent: text => { logEvent(text); emitDiagnostics(); },
    get state() { return state; },
  };
}

export async function isImmersiveVrSupported() {
  try {
    return Boolean(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
  } catch (_) {
    return false;
  }
}
