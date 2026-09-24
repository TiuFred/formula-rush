// Física do carro do JOGADOR: lê o estado das teclas (state.keys, ver
// input.js), aplica aceleração/frenagem/direção, o mecanismo de drift ->
// miniturbo, detecção de colisão com o muro e chama o rastreamento de volta
// compartilhado (physics.js). Extraído 1:1 da função original `xg`.
//
// A função recebe `car`/`keys` como parâmetros (em vez de usar sempre
// `state.player`/`state.keys` implicitamente); o estado de drift/câmera
// fica guardado no PRÓPRIO carro (car.driftCharge, car.cameraShake etc.),
// não em `state.*` global.

import * as THREE from "three";
import { state } from "./state.js";
import { TRACK_LENGTH, DIFFICULTIES, DRIFT_BOOST_BY_LEVEL } from "./constants.js";
import { clamp, wrapAngle, progressDelta } from "./mathUtils.js";
import { trackHalfWidthAt, cornerWideningAt } from "./track.js";
import { advanceLapTracking } from "./physics.js";
import { driftLevel } from "./items.js";
import { engineAudio, beep } from "./audio.js";
import { showNotice } from "./dom.js";
import { addMesh } from "./materials.js";

/** Faísca visual de drift (cor conforme o nível de miniturbo carregado). */
function spawnDriftSpark(car, color) {
  if (state.driftParticles.length > 45) return;
  const mesh = addMesh(
    new THREE.SphereGeometry(.1, 4, 3),
    new THREE.MeshBasicMaterial({ color }),
    car.x + (Math.random() - .5) * 2,
    car.group.position.y + .3,
    car.z
  );
  state.driftParticles.push({
    mesh,
    life: .4,
    v: new THREE.Vector3((Math.random() - .5) * 3, 1, (Math.random() - .5) * 3),
  });
}

/** Reposiciona `car` (padrão: jogador 1) no centro da pista (tecla R / botão "recover"). */
export function recoverCar(car = state.player) {
  if (!car) return;
  const frame = state.track.at(car.s);
  car.x = frame.p.x;
  car.z = frame.p.z;
  car.yaw = frame.yaw;
  car.speed = 0;
  car.stun = 0;
  car.slip = 0;
  car.steer = 0;
  car.invulnerable = 2;
  car.boost = 0;
  car.driftCharge = 0;
  car.wasDrifting = false;
  car.cameraInitialized = false; // evita um "salto" suave indesejado da câmera
  showNotice("DE VOLTA À PISTA");
}

/**
 * Atualiza a física de um carro controlado por humano para um passo fixo
 * `dt` (1/120 s). `keys` é o mapa de teclas desse jogador especificamente
 * (state.keys para o jogador 1, state.keys2 para o jogador 2).
 */
export function updatePlayerPhysics(car, dt, keys = state.keys) {
  if (car.finish) return;
  const prevProgress = car.progress;

  const nearest = state.track.nearest(car.x, car.z, car.s);
  const onTrack = nearest.dist < nearest.halfWidth + .5;
  const throttle = keys.ArrowUp || keys.w || keys.W;
  const brake = keys.ArrowDown || keys.s || keys.S;
  const steerInput = (keys.ArrowLeft || keys.a || keys.A ? 1 : 0) - (keys.ArrowRight || keys.d || keys.D ? 1 : 0);

  car.steer += (steerInput - car.steer) * (1 - Math.exp(-dt * (steerInput ? 10 : 14)));
  car.driftCooldown = Math.max(0, car.driftCooldown - dt);

  const isDrifting =
    keys.Shift && Math.abs(car.steer) > .45 && car.speed > 17 && onTrack && car.stun <= 0 && car.driftCooldown === 0;

  // --- Longitudinal: aceleração, arrasto, gravidade na ladeira, penalidades. ---
  let accel = throttle ? 27 : -7;
  accel -= car.speed * car.speed * .0032;
  accel -= nearest.t.y * 9.81;
  if (brake) accel -= 53;
  if (!onTrack) accel -= car.speed * .62;
  if (car.stun > 0) accel -= 24;
  if (car.boost > 0) accel += 31;
  car.speed = clamp(car.speed + accel * dt, 0, car.boost > 0 ? 102 : 84);

  // --- Lateral: escorregamento (slip) durante o drift. ---
  const targetSlip = isDrifting ? car.steer * .23 : 0;
  car.slip += (targetSlip - car.slip) * (1 - Math.exp(-dt * (isDrifting ? 4 : 9)));

  const grip = DIFFICULTIES[state.difficultyKey].grip;
  const turnRate = (.2 + .98 / (1 + car.speed / 48)) * Math.min(car.speed / 11, 1);
  car.yaw += car.steer * turnRate * (isDrifting ? 1.24 : 1) * dt * (car.stun > 0 ? .25 : 1);

  // Assistência de direção: realinha suavemente com a direção da pista.
  const headingError = wrapAngle(nearest.yaw - car.yaw);
  if (state.assistOn && !steerInput && !isDrifting && onTrack && Math.abs(headingError) < .34) {
    car.yaw += headingError * dt * 1.1 * grip;
  }

  const movementYaw = car.yaw - car.slip;
  car.x += Math.sin(movementYaw) * car.speed * dt;
  car.z += Math.cos(movementYaw) * car.speed * dt;

  const updated = state.track.nearest(car.x, car.z, car.s);
  const progressStep = progressDelta(updated.s, car.s, TRACK_LENGTH);
  if (Math.abs(progressStep) < 20) car.progress += progressStep;
  car.s = updated.s;
  car.lane = updated.lane;

  // --- Limites de pista (só aplicado/verificado no contra-relógio): sair
  // do traçado marcado (além da linha, não do muro físico — uma checagem
  // mais rígida que a física de colisão logo abaixo) invalida a volta
  // atual para fins de melhor volta/ranking. Ver physics.js/advanceLapTracking.
  if (state.timeTrial && updated.dist > updated.halfWidth && car.currentLapValid) {
    car.currentLapValid = false;
    if (car === state.player) showNotice("LIMITES DE PISTA EXCEDIDOS · VOLTA INVÁLIDA");
  }

  // --- Colisão com o muro. ---
  const wallLimit = updated.halfWidth + cornerWideningAt(car.s, Math.sign(car.lane) || 1) - 1.6;
  if (updated.dist > wallLimit) {
    car.lane = Math.sign(updated.lane) * (wallLimit - .1);
    const wallFrame = state.track.at(car.s, car.lane);
    car.x = wallFrame.p.x;
    car.z = wallFrame.p.z;
    if (car.wallCooldown <= 0) {
      car.speed *= .72;
      car.wallCooldown = .5;
      car.cameraShake = .35;
      if (car === state.player) engineAudio.cue("impact");
    }
    car.yaw += wrapAngle(updated.yaw - car.yaw) * dt * 2;
    car.slip = 0;
  }

  // --- Carga de drift / miniturbo. ---
  if (isDrifting) {
    const direction = Math.sign(steerInput);
    if (!car.wasDrifting) {
      car.driftDirection = direction;
      car.driftCharge = 0;
      car.lastDriftLevel = 0;
    }
    if (direction === car.driftDirection) {
      car.driftCharge = Math.min(2.6, car.driftCharge + dt * Math.min(1.15, car.speed / 27));
      const level = driftLevel(car.driftCharge);
      if (level > car.lastDriftLevel) {
        car.lastDriftLevel = level;
        if (car === state.player) beep(450 + level * 180, .08);
      }
      if (Math.random() < .25) {
        spawnDriftSpark(car, level >= 3 ? "#c27bff" : level >= 2 ? "#ffbd48" : "#59ddff");
      }
    } else {
      car.driftCharge = Math.max(0, car.driftCharge - dt * 2);
    }
  }

  // Soltou o drift: concede o miniturbo correspondente ao nível carregado.
  if (car.wasDrifting && !isDrifting) {
    const level = driftLevel(car.driftCharge);
    if (level && onTrack && car.stun <= 0 && Math.abs(car.slip) < .4) {
      car.boost = Math.max(car.boost, DRIFT_BOOST_BY_LEVEL[level]);
      car.boostPower = level / 3;
      if (car === state.player) {
        engineAudio.cue("boost");
        showNotice(["", "MINITURBO", "SUPER MINITURBO", "ULTRA MINITURBO"][level] + "!");
      }
    }
    car.driftCharge = 0;
    car.driftCooldown = .22;
  }
  car.wasDrifting = isDrifting;

  advanceLapTracking(car, prevProgress, dt, car === state.player);
}
