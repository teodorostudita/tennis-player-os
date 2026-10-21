// VR Lab — "Lettura del colpo": rendering, input dei controller e anteprima desktop.
// L'avversario animato sostituisce la lanciapalle; serie, fisica e occlusione
// lo usano solo tramite il contratto di opponent/opponentContract.js.
import * as THREE from 'three';
import { COURT, rayToGround } from './ballPhysics.js?v=1.3.7';
import { positionAt } from './ballFlight.js?v=1.3.7';
import { SHOTS, SOUND } from './physicsConfig.js?v=1.3.7';
import { OCCLUSION_MODES, normalizeOcclusionMode } from './occlusion.js?v=1.3.7';
import { buildScene, setPath } from './court.js?v=1.3.7';
import { createPanel } from './hud.js?v=1.3.7';
import { createSeries } from './series.js?v=1.3.7';
import { createMannequin } from './opponent/mannequin.js?v=1.3.7';

const EYE_HEIGHT_DESKTOP = 1.7;
// L'osservatore sta 2 m dietro il centro della linea di fondo. Camera e controller
// vivono in un "rig" spostato di +z: le coordinate del campo e della fisica non cambiano.
export const OBSERVER_BEHIND_BASELINE_M = 2.0;
// Grip tenuto premuto per interrompere la serie: evita interruzioni accidentali.
const INTERRUPT_HOLD_S = 0.5;
const RAY_LENGTH = 6;

export function describeDepth(cm) {
  if (Math.abs(cm) < 5) return 'profondità corretta';
  return cm > 0 ? `${Math.round(cm)} cm più lungo` : `${Math.round(-cm)} cm più corto`;
}

export function describeLateral(cm) {
  if (Math.abs(cm) < 5) return 'direzione corretta';
  return cm > 0 ? `${Math.round(cm)} cm a destra` : `${Math.round(-cm)} cm a sinistra`;
}

export function occlusionLabel(occlusion) {
  const mode = normalizeOcclusionMode(occlusion?.mode);
  return mode === 'none' ? 'nessuna occlusione' : `occlusione: ${OCCLUSION_MODES[mode].label.toLowerCase()}`;
}

// «Topspin · 2.600 rpm · 118 km/h» (rotazione negativa = backspin).
export function describeShot(trial) {
  const label = SHOTS[trial.shotType]?.label || trial.shotType || '—';
  const rpm = Math.abs(Math.round(trial.spinRpm / 50) * 50).toLocaleString('it-IT');
  const spin = trial.spinRpm < 0 ? `backspin ${rpm} rpm` : `${rpm} rpm`;
  return `${label} · ${spin} · ${Math.round(trial.speedKmh)} km/h`;
}

// «Topspin 45 cm (4) · Slice 60 cm (3)»
export function describeByShotType(byShotType = {}) {
  return Object.keys(SHOTS)
    .filter(type => byShotType[type])
    .map(type => `${SHOTS[type].label} ${Math.round(byShotType[type].meanErrorCm)} cm (${byShotType[type].count})`)
    .join(' · ');
}

// Suono "pock" della palla sulle corde, sintetizzato una volta sola: clic
// iniziale + risonanza delle corde (~1,45 kHz) + corpo della palla (~560 Hz).
// Rumore pseudo-casuale con seme fisso: il suono è identico a ogni colpo.
function impactBuffer(ctx) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.round(rate * 0.12), rate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) {
    const t = i / rate;
    data[i] = 0.55 * noise() * Math.exp(-t / 0.004)
      + 0.5 * Math.sin(2 * Math.PI * 1450 * t) * Math.exp(-t / 0.018)
      + 0.45 * Math.sin(2 * Math.PI * 560 * t) * Math.exp(-t / 0.035)
      + 0.2 * Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t / 0.008);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < data.length; i += 1) data[i] *= 0.95 / peak;
  return buffer;
}

function createAudio() {
  let ctx = null;
  let buffer = null;
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const position = new THREE.Vector3();
  return {
    unlock() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') void ctx.resume();
        buffer = buffer || impactBuffer(ctx);
      } catch (_) { ctx = null; }
    },
    get state() { return ctx ? ctx.state : 'assente'; },
    // L'ascoltatore segue la testa: il suono arriva dalla posizione dell'avversario.
    updateListener(camera) {
      if (!ctx || ctx.state !== 'running') return;
      const listener = ctx.listener;
      const e = camera.matrixWorld.elements;
      position.setFromMatrixPosition(camera.matrixWorld);
      forward.set(-e[8], -e[9], -e[10]).normalize();
      up.set(e[4], e[5], e[6]).normalize();
      if (listener.positionX) {
        const t = ctx.currentTime;
        listener.positionX.setValueAtTime(position.x, t);
        listener.positionY.setValueAtTime(position.y, t);
        listener.positionZ.setValueAtTime(position.z, t);
        listener.forwardX.setValueAtTime(forward.x, t);
        listener.forwardY.setValueAtTime(forward.y, t);
        listener.forwardZ.setValueAtTime(forward.z, t);
        listener.upX.setValueAtTime(up.x, t);
        listener.upY.setValueAtTime(up.y, t);
        listener.upZ.setValueAtTime(up.z, t);
      } else {
        listener.setPosition(position.x, position.y, position.z);
        listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    },
    // Solo l'impatto della racchetta, identico per ogni tipo di colpo: il suono
    // del rimbalzo rivelerebbe la risposta. delayS = distanza / velocità del suono.
    impact(at, delayS = 0) {
      if (!ctx || !buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = SOUND.refDistance;
      panner.rolloffFactor = SOUND.rolloff;
      if (panner.positionX) {
        panner.positionX.value = at.x;
        panner.positionY.value = at.y;
        panner.positionZ.value = at.z;
      } else {
        panner.setPosition(at.x, at.y, at.z);
      }
      const gain = ctx.createGain();
      gain.gain.value = SOUND.volume;
      source.connect(panner).connect(gain).connect(ctx.destination);
      source.start(ctx.currentTime + Math.max(0, delayS));
    },
  };
}

// settings: { trialCount, difficulty, occlusion: { mode }, shotWeights, ballShadow }
// onSeriesComplete(session) → Promise<{ saved, queued?, error? }>
export function createBounceTrainer({ host, settings, onSeriesComplete, onEnd, onDiagnostics }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  const { scene, ball, ballShadow, actualMarker, predictedMarker, reticle, errorLine, visiblePath, hiddenPath } = world;
  scene.add(rig);
  const opponent = createMannequin();
  scene.add(opponent.object3d);
  const newSeries = () => createSeries({ settings, prepareShot: opponent.prepare });

  const panel = createPanel({ width: 2.6, height: 1.3 });
  panel.mesh.position.set(0, 2.9, -4.5);
  panel.mesh.rotation.x = 0.25;
  scene.add(panel.mesh);

  const audio = createAudio();
  let series = newSeries();
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

  // Controller disegnati localmente: niente modelli 3D scaricati da CDN esterne
  // all'ingresso in VR (sospettati di bloccare il rendering sul Quest).
  const controllerMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.5 });
  const controllerTipMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14d });
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
      // Il grilletto è un gesto dell'utente: riattiva l'audio se il visore l'ha sospeso.
      audio.unlock();
      activeController = controller;
      handleTrigger(groundHitFromController(controller), controller.userData.hand);
    });
    controller.addEventListener('squeezestart', () => {
      if (series.state === 'summary') {
        renderer.xr.getSession()?.end();
        return;
      }
      controller.userData.squeezeSince = now();
    });
    controller.addEventListener('squeezeend', () => {
      controller.userData.squeezeSince = null;
    });
    rig.add(controller);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 12), controllerMaterial);
    handle.rotation.x = Math.PI / 2 - 0.5;
    handle.position.set(0, -0.02, 0.03);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), controllerTipMaterial);
    tip.position.set(0, 0, -0.03);
    grip.add(handle, tip);
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
    if (renderer.xr.isPresenting) return;
    if (event.code === 'Escape') {
      handleInterrupt();
      return;
    }
    if (event.code !== 'Space') return;
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
      clearFeedback();
    } else if (result.type === 'predicted') {
      showFeedback(result.trial);
    } else if (result.type === 'completed') {
      onCompleted(result);
    } else if (result.type === 'cancelled') {
      clearFeedback();
    }
    lastHudKey = '';
  }

  function handleInterrupt() {
    const result = series.interrupt(now());
    if (!result) return;
    if (result.type === 'completed') onCompleted(result);
    else clearFeedback();
    lastHudKey = '';
  }

  function checkGripHold() {
    for (const controller of controllers) {
      const since = controller.userData.squeezeSince;
      if (since != null && now() - since >= INTERRUPT_HOLD_S) {
        controller.userData.squeezeSince = null;
        handleInterrupt();
      }
    }
  }

  function onCompleted(result) {
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

  function clearFeedback() {
    for (const object of [actualMarker, predictedMarker, errorLine, visiblePath, hiddenPath]) {
      object.visible = false;
    }
  }

  function showFeedback(trial) {
    const { shot, occ } = series.current;
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

    // Traiettoria vista (bianca) e nascosta (tratteggiata), con un tratto dopo
    // il rimbalzo per mostrare l'effetto della rotazione.
    const steps = 48;
    const end = shot.flightTime + 0.35;
    const cut = occ == null ? end : Math.min(end, Math.max(0, occ));
    const sample = (from, to) => Array.from({ length: steps + 1 }, (_, i) => positionAt(shot.trajectory, from + ((to - from) * i) / steps));
    if (cut > 0) {
      setPath(visiblePath, sample(0, cut));
      visiblePath.visible = true;
    }
    if (cut < end) {
      setPath(hiddenPath, sample(cut, end));
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
        { text: 'Leggi il dritto: dove rimbalza?', size: 1.2, weight: 700 },
        { text: `Serie di ${total} colpi · ${occlusionLabel(settings.occlusion)}`, size: 0.75, color: '#c9d6ea' },
        { text: 'Punta il controller sul campo e premi il grilletto', size: 0.75, color: '#c9d6ea' },
        { text: 'Grilletto per iniziare · grip tenuto premuto: interrompi', size: 0.85, color: '#ffe14d', weight: 700 },
      ]);
    } else if (state === 'feedback') {
      const trial = series.trials[done - 1];
      panel.draw([
        { text: `Colpo ${done}/${total}`, size: 0.8, color: '#c9d6ea' },
        { text: `Errore ${Math.round(trial.errorCm)} cm`, size: 1.5, weight: 800 },
        { text: describeShot(trial), size: 0.85, color: '#ffffff', weight: 700 },
        { text: `${describeDepth(trial.depthCm)} · ${describeLateral(trial.lateralCm)}`, size: 0.75, color: '#c9d6ea' },
        { text: 'verde = rimbalzo reale · arancio = tua previsione', size: 0.7, color: '#9fb1c9' },
        { text: done >= total ? 'Grilletto: riepilogo' : 'Grilletto: prossimo colpo · grip tenuto: interrompi', size: 0.8, color: '#ffe14d', weight: 700 },
      ]);
    } else if (state === 'summary') {
      const s = series.summary;
      panel.draw([
        { text: s.interrupted ? `Serie interrotta · ${s.trialCount}/${s.plannedTrialCount} colpi` : 'Serie completata', size: 1.1, weight: 700 },
        { text: `Errore medio ${Math.round(s.meanErrorCm)} cm · mediano ${Math.round(s.medianErrorCm)} cm`, size: 0.9, weight: 700 },
        { text: `Migliore ${Math.round(s.bestErrorCm)} cm · peggiore ${Math.round(s.worstErrorCm)} cm`, size: 0.7, color: '#c9d6ea' },
        { text: `Per colpo: ${describeByShotType(s.byShotType)}`, size: 0.7, color: '#ffffff', weight: 700 },
        { text: `Tendenza: ${describeDepth(s.meanDepthBiasCm)} · ${describeLateral(s.meanLateralBiasCm)}`, size: 0.7, color: '#c9d6ea' },
        { text: saveStatus, size: 0.7, color: saveStatus.includes('✓') ? '#3ddc84' : '#ffb36b' },
        { text: 'Grilletto: nuova serie · Grip: esci dalla VR', size: 0.75, color: '#ffe14d', weight: 700 },
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

  // Diagnostica della sessione VR, mostrata nella pagina all'uscita.
  // Inviata a onDiagnostics ogni secondo durante la sessione: se la pagina viene
  // chiusa o si blocca resta comunque l'ultimo stato.
  const diagnostics = { frames: 0, xrFrames: 0, errors: [], events: [], xrFramesPerSecond: [] };
  let diagnosticsTimer = null;
  let framesAtLastTick = 0;
  function logEvent(text) {
    const at = diagnostics.sessionStart ? ((now() - diagnostics.sessionStart).toFixed(2) + ' s') : 'pre';
    diagnostics.events.push(`${at} · ${text}`);
    if (diagnostics.events.length > 60) diagnostics.events.shift();
  }
  function emitDiagnostics() {
    if (!diagnostics.id) return;
    diagnostics.elapsedS = Math.round((now() - diagnostics.sessionStart) * 100) / 100;
    diagnostics.seriesState = series.state;
    try { onDiagnostics?.(structuredClone(diagnostics)); } catch (_) {}
  }
  renderer.domElement.addEventListener('webglcontextlost', () => { logEvent('webglcontextlost'); emitDiagnostics(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => logEvent('webglcontextrestored'));

  // Un errore in un singolo frame non deve fermare il loop: senza frame il
  // Quest mostra il passthrough e la sessione resta "appesa".
  function tick() {
    diagnostics.frames += 1;
    if (renderer.xr.isPresenting) {
      diagnostics.xrFrames += 1;
      if (diagnostics.xrFrames === 1) {
        logEvent('primo frame VR');
        emitDiagnostics();
      }
    }
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

  let audioLogged = false;
  function playImpact() {
    const contact = series.current?.shot?.contact;
    if (!contact) return;
    camera.getWorldPosition(listenerPosition);
    const distance = listenerPosition.distanceTo(contactVector.set(contact.x, contact.y, contact.z));
    audio.impact(contact, distance / SOUND.speedOfSound);
    if (!audioLogged && renderer.xr.isPresenting) {
      audioLogged = true;
      logEvent(`audio all'impatto: ${audio.state}`);
    }
  }
  const listenerPosition = new THREE.Vector3();
  const contactVector = new THREE.Vector3();

  function drawFrame() {
    checkGripHold();
    const frame = series.update(now());
    if (frame.events.includes('impact')) playImpact();

    opponent.setVisible(frame.opponent.visible);
    if (frame.opponent.visible) opponent.pose(frame.opponent);

    ball.visible = frame.ball.visible;
    ballShadow.visible = frame.ball.visible && Boolean(settings.ballShadow);
    if (frame.ball.visible) {
      const p = frame.ball.position;
      ball.position.set(p.x, p.y, p.z);
      ballShadow.position.set(p.x, 0.004, p.z);
    }

    const hit = frame.state === 'aim' ? currentAimHit() : null;
    reticle.visible = Boolean(hit);
    if (hit) reticle.position.set(hit.x, 0.008, hit.z);
    updateRays(frame.state, hit);

    updateHud(frame.state);
    renderer.render(scene, camera);
    audio.updateListener(camera);
  }

  renderer.setAnimationLoop(tick);

  async function enterVR() {
    audio.unlock();
    const clickAt = now();
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    Object.assign(diagnostics, {
      id: crypto.randomUUID(),
      sessionStart: now(), frames: 0, xrFrames: 0, errors: [], events: [], xrFramesPerSecond: [],
      requestSessionMs: Math.round((now() - clickAt) * 1000),
      settings: structuredClone(settings),
    });
    framesAtLastTick = 0;
    logEvent(`sessione immersiva avviata (requestSession ${diagnostics.requestSessionMs} ms, enabledFeatures: ${(session.enabledFeatures || []).join(', ') || 'n/d'})`);
    clearInterval(diagnosticsTimer);
    diagnosticsTimer = setInterval(() => {
      diagnostics.xrFramesPerSecond.push(diagnostics.xrFrames - framesAtLastTick);
      if (diagnostics.xrFramesPerSecond.length > 120) diagnostics.xrFramesPerSecond.shift();
      framesAtLastTick = diagnostics.xrFrames;
      emitDiagnostics();
    }, 1000);
    session.addEventListener('visibilitychange', () => logEvent(`visibilità: ${session.visibilityState}`));
    session.addEventListener('inputsourceschange', event => {
      for (const source of event.added || []) logEvent(`controller collegato: ${source.handedness} (${(source.profiles || []).join(', ')})`);
      for (const source of event.removed || []) logEvent(`controller scollegato: ${source.handedness}`);
    });
    session.addEventListener('end', () => {
      logEvent('sessione terminata');
      clearInterval(diagnosticsTimer);
      emitDiagnostics();
      diagnostics.durationS = Math.round((now() - diagnostics.sessionStart) * 10) / 10;
      camera.position.set(0, EYE_HEIGHT_DESKTOP, 0);
      camera.lookAt(0, 0.6, COURT.netZ - 2);
      onResize();
      onEnd?.({ trials: series.trials, summary: series.summary, diagnostics: structuredClone(diagnostics) });
    });
    try {
      await renderer.xr.setSession(session);
      logEvent(`setSession completato (reference space ${renderer.xr.getReferenceSpace() ? 'ok' : 'assente'})`);
    } catch (error) {
      logEvent(`setSession fallito: ${error?.message || error}`);
      emitDiagnostics();
      throw error;
    }
    emitDiagnostics();
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
    series = newSeries();
    saveStatus = '';
    lastHudKey = '';
    clearFeedback();
  }

  return {
    enterVR,
    logEvent: text => { logEvent(text); emitDiagnostics(); },
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
