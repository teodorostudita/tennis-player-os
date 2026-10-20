// VR Lab — "Bounce prediction": rendering, input dei controller e anteprima desktop.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { COURT, positionAt, rayToGround } from './ballPhysics.js?v=1.3.0';
import { buildScene, setPath } from './court.js?v=1.3.0';
import { createPanel } from './hud.js?v=1.3.0';
import { createSeries } from './series.js?v=1.3.0';

const EYE_HEIGHT_DESKTOP = 1.7;
// L'osservatore sta 1 m dietro il centro della linea di fondo. Camera e controller
// vivono in un "rig" spostato di +z: le coordinate del campo e della fisica non cambiano.
export const OBSERVER_BEHIND_BASELINE_M = 1.0;
const RAY_LENGTH = 6;

export function describeDepth(cm) {
  if (Math.abs(cm) < 5) return 'profondità corretta';
  return cm > 0 ? `${Math.round(cm)} cm più lungo` : `${Math.round(-cm)} cm più corto`;
}

export function describeLateral(cm) {
  if (Math.abs(cm) < 5) return 'direzione corretta';
  return cm > 0 ? `${Math.round(cm)} cm a destra` : `${Math.round(-cm)} cm a sinistra`;
}

function occlusionLabel(occlusion) {
  if (!occlusion || occlusion.mode === 'none') return 'nessuna occlusione';
  const offset = Number(occlusion.offsetM || 0);
  if (Math.abs(offset) < 0.01) return 'occlusione alla rete';
  return offset > 0
    ? `occlusione ${offset.toFixed(1)} m dopo la rete`
    : `occlusione ${(-offset).toFixed(1)} m prima della rete`;
}

function createAudio() {
  let ctx = null;
  return {
    unlock() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') void ctx.resume();
      } catch (_) { ctx = null; }
    },
    // Solo il colpo di lancio: il suono del rimbalzo rivelerebbe la risposta.
    pop() {
      if (!ctx) return;
      const duration = 0.07;
      const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    },
  };
}

// settings: { trialCount, difficulty, occlusion: { mode, offsetM }, ballShadow }
// onSeriesComplete(session) → Promise<{ saved, queued?, error? }>
export function createBounceTrainer({ host, settings, onSeriesComplete, onEnd }) {
  // Contesto WebGL creato già xrCompatible: sul Quest Browser la conversione
  // tardiva (makeXRCompatible all'ingresso in VR) può lasciare la scena nera
  // finché non si preme il tasto Meta.
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, xrCompatible: true });
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(70, host.clientWidth / host.clientHeight, 0.05, 120);
  const rig = new THREE.Group();
  rig.position.set(0, 0, OBSERVER_BEHIND_BASELINE_M);
  camera.position.set(0, EYE_HEIGHT_DESKTOP, 0);
  rig.add(camera);
  camera.lookAt(0, 0.6, COURT.netZ - 2);

  const world = buildScene();
  const { scene, ball, ballShadow, launcher, actualMarker, predictedMarker, reticle, errorLine, visiblePath, hiddenPath } = world;
  scene.add(rig);

  const panel = createPanel({ width: 2.6, height: 1.3 });
  panel.mesh.position.set(0, 2.9, -4.5);
  panel.mesh.rotation.x = 0.25;
  scene.add(panel.mesh);

  const audio = createAudio();
  let series = createSeries({ settings });
  let saveStatus = '';
  let lastHudKey = '';

  // --- Input -------------------------------------------------------------
  const tempMatrix = new THREE.Matrix4();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const controllers = [];
  let activeController = null;
  const pointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  let pointerInside = false;

  const modelFactory = new XRControllerModelFactory();
  for (let i = 0; i < 2; i += 1) {
    const controller = renderer.xr.getController(i);
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    );
    ray.scale.z = RAY_LENGTH;
    controller.add(ray);
    controller.userData.ray = ray;
    controller.addEventListener('connected', event => {
      controller.userData.hand = event.data?.handedness || '';
      if (!activeController || controller.userData.hand === 'right') activeController = controller;
    });
    controller.addEventListener('disconnected', () => {
      if (activeController === controller) activeController = controllers.find(c => c !== controller) || null;
    });
    controller.addEventListener('selectstart', () => {
      activeController = controller;
      handleTrigger(groundHitFromController(controller), controller.userData.hand);
    });
    controller.addEventListener('squeezestart', () => {
      if (series.state === 'summary') renderer.xr.getSession()?.end();
    });
    rig.add(controller);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(modelFactory.createControllerModel(grip));
    rig.add(grip);
  }

  function groundHitFromController(controller) {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    rayOrigin.setFromMatrixPosition(controller.matrixWorld);
    rayDirection.set(0, 0, -1).applyMatrix4(tempMatrix);
    return rayToGround(rayOrigin, rayDirection);
  }

  function groundHitFromPointer() {
    raycaster.setFromCamera(pointer, camera);
    return rayToGround(raycaster.ray.origin, raycaster.ray.direction);
  }

  function currentAimHit() {
    if (renderer.xr.isPresenting) {
      return activeController ? groundHitFromController(activeController) : null;
    }
    return pointerInside ? groundHitFromPointer() : null;
  }

  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerInside = true;
  }
  function onPointerDown(event) {
    if (renderer.xr.isPresenting) return;
    onPointerMove(event);
    audio.unlock();
    handleTrigger(groundHitFromPointer(), 'mouse');
  }
  function onKeyDown(event) {
    if (renderer.xr.isPresenting || event.code !== 'Space') return;
    event.preventDefault();
    handleTrigger(pointerInside ? groundHitFromPointer() : null, 'keyboard');
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerleave', () => { pointerInside = false; });
  window.addEventListener('keydown', onKeyDown);

  function onResize() {
    if (renderer.xr.isPresenting) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }
  window.addEventListener('resize', onResize);

  // --- Logica ------------------------------------------------------------
  function now() {
    return performance.now() / 1000;
  }

  function handleTrigger(hit, hand) {
    const result = series.trigger(now(), hit, hand);
    if (!result) return;

    if (result.type === 'started' || result.type === 'next' || result.type === 'restarted') {
      if (result.type === 'restarted') saveStatus = '';
      prepareLaunch();
    } else if (result.type === 'predicted') {
      showFeedback(result.trial);
    } else if (result.type === 'completed') {
      clearFeedback();
      saveStatus = 'Salvataggio in corso…';
      const session = {
        ...result.session,
        settings: { ...result.session.settings, observerBehindBaselineM: OBSERVER_BEHIND_BASELINE_M },
      };
      Promise.resolve(onSeriesComplete?.(session))
        .then(outcome => {
          saveStatus = outcome?.saved
            ? 'Sessione salvata ✓'
            : 'Salvataggio non riuscito: sessione in coda, verrà ritentata';
        })
        .catch(() => {
          saveStatus = 'Salvataggio non riuscito';
        })
        .finally(() => { lastHudKey = ''; });
    }
    lastHudKey = '';
  }

  function prepareLaunch() {
    clearFeedback();
    const { launch } = series.current;
    launcher.position.set(launch.x0, 0, launch.z0 - 0.35);
    launcher.lookAt(launch.bounce.x, 0, launch.bounce.z);
    launcher.visible = true;
  }

  function clearFeedback() {
    for (const object of [actualMarker, predictedMarker, errorLine, visiblePath, hiddenPath]) {
      object.visible = false;
    }
  }

  function showFeedback(trial) {
    const { launch, tOcc } = series.current;
    actualMarker.position.set(trial.bounce.x, 0.006, trial.bounce.z);
    predictedMarker.position.set(trial.prediction.x, 0.007, trial.prediction.z);
    actualMarker.visible = true;
    predictedMarker.visible = true;

    const positions = errorLine.geometry.attributes.position;
    positions.setXYZ(0, trial.bounce.x, 0.01, trial.bounce.z);
    positions.setXYZ(1, trial.prediction.x, 0.01, trial.prediction.z);
    positions.needsUpdate = true;
    errorLine.geometry.computeBoundingSphere();
    errorLine.visible = true;

    const steps = 40;
    const cut = tOcc ?? launch.flightTime;
    const sample = (from, to) => Array.from({ length: steps + 1 }, (_, i) => positionAt(launch, from + ((to - from) * i) / steps));
    setPath(visiblePath, sample(0, cut));
    visiblePath.visible = true;
    if (tOcc != null) {
      setPath(hiddenPath, sample(tOcc, launch.flightTime));
      hiddenPath.visible = true;
    }
  }

  function updateHud(state) {
    const total = settings.trialCount;
    const done = series.trials.length;
    const key = `${state}|${done}|${saveStatus}`;
    if (key === lastHudKey) return;
    lastHudKey = key;

    panel.mesh.visible = state === 'ready' || state === 'feedback' || state === 'summary';
    if (state === 'ready') {
      panel.draw([
        { text: 'Dove rimbalza la palla?', size: 1.3, weight: 700 },
        { text: `Serie di ${total} lanci · ${occlusionLabel(settings.occlusion)}`, size: 0.75, color: '#c9d6ea' },
        { text: 'Punta il controller sul campo e premi il grilletto', size: 0.75, color: '#c9d6ea' },
        { text: 'Grilletto per iniziare', size: 0.95, color: '#ffe14d', weight: 700 },
      ]);
    } else if (state === 'feedback') {
      const trial = series.trials[done - 1];
      panel.draw([
        { text: `Lancio ${done}/${total}`, size: 0.8, color: '#c9d6ea' },
        { text: `Errore ${Math.round(trial.errorCm)} cm`, size: 1.6, weight: 800 },
        { text: `${describeDepth(trial.depthCm)} · ${describeLateral(trial.lateralCm)}`, size: 0.75, color: '#c9d6ea' },
        { text: 'verde = rimbalzo reale · arancio = tua previsione', size: 0.7, color: '#9fb1c9' },
        { text: done >= total ? 'Grilletto: riepilogo' : 'Grilletto: prossimo lancio', size: 0.85, color: '#ffe14d', weight: 700 },
      ]);
    } else if (state === 'summary') {
      const s = series.summary;
      panel.draw([
        { text: 'Serie completata', size: 1.1, weight: 700 },
        { text: `Errore medio ${Math.round(s.meanErrorCm)} cm · mediano ${Math.round(s.medianErrorCm)} cm`, size: 0.9, weight: 700 },
        { text: `Migliore ${Math.round(s.bestErrorCm)} cm · peggiore ${Math.round(s.worstErrorCm)} cm`, size: 0.7, color: '#c9d6ea' },
        { text: `Tendenza: ${describeDepth(s.meanDepthBiasCm)} · ${describeLateral(s.meanLateralBiasCm)}`, size: 0.7, color: '#c9d6ea' },
        { text: saveStatus, size: 0.7, color: saveStatus.includes('✓') ? '#3ddc84' : '#ffb36b' },
        { text: 'Grilletto: nuova serie · Grip o tasto Meta: esci', size: 0.75, color: '#ffe14d', weight: 700 },
      ]);
    }
  }

  function updateRays(state, hit) {
    for (const controller of controllers) {
      const ray = controller.userData.ray;
      ray.visible = renderer.xr.isPresenting;
      ray.scale.z = RAY_LENGTH;
      if (controller === activeController && state === 'aim' && hit) {
        rayOrigin.setFromMatrixPosition(controller.matrixWorld);
        ray.scale.z = rayOrigin.distanceTo(new THREE.Vector3(hit.x, 0, hit.z));
      }
    }
  }

  function tick() {
    const frame = series.update(now());
    if (frame.events.includes('launched')) {
      launcher.visible = true;
      audio.pop();
    }
    if (frame.state === 'aim' || frame.state === 'summary') launcher.visible = false;

    ball.visible = frame.ballVisible;
    ballShadow.visible = frame.ballVisible && Boolean(settings.ballShadow);
    if (frame.ballVisible) {
      ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z);
      ballShadow.position.set(frame.ball.x, 0.004, frame.ball.z);
    }

    const hit = frame.state === 'aim' ? currentAimHit() : null;
    reticle.visible = Boolean(hit);
    if (hit) reticle.position.set(hit.x, 0.008, hit.z);
    updateRays(frame.state, hit);

    updateHud(frame.state);
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(tick);

  async function enterVR() {
    audio.unlock();
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor'],
    });
    session.addEventListener('end', () => {
      camera.position.set(0, EYE_HEIGHT_DESKTOP, 0);
      camera.lookAt(0, 0.6, COURT.netZ - 2);
      onResize();
      onEnd?.({ trials: series.trials, summary: series.summary });
    });
    await renderer.xr.setSession(session);
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    renderer.dispose();
    renderer.domElement.remove();
  }

  function restart(nextSettings) {
    Object.assign(settings, nextSettings || {});
    series = createSeries({ settings });
    saveStatus = '';
    lastHudKey = '';
    clearFeedback();
    launcher.visible = false;
  }

  return {
    enterVR,
    restart,
    dispose,
    unlockAudio: () => audio.unlock(),
    get series() { return series; },
  };
}

export async function isImmersiveVrSupported() {
  try {
    return Boolean(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
  } catch (_) {
    return false;
  }
}
