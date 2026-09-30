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
import { cornerWideningAt } from "./track.js";
import { advanceLapTracking, computeDrsActive, yellowFlagCapAt, triggerYellowFlag } from "./physics.js";
import { driftLevel } from "./items.js";
import { engineAudio, beep } from "./audio.js";
import { showNotice } from "./dom.js";
import { addMesh } from "./materials.js";
import { playerTurboSettings } from "./turbo.js";
import { updateBetaPowertrain } from "./betaPowertrain.js";

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
 * Resolve a "embreagem" da largada: chamada por input.js quando o jogador
 * solta ESPAÇO durante a contagem regressiva (segurar ESPAÇO nela não faz
 * mais o carro usar item — ver input.js). Soltar ANTES do sinal verde
 * (state.countdown > 0, contagem ainda contando pros carros pararem) é
 * largada queimada — penalidade; soltar logo depois do sinal (dentro de uns
 * 0.35s) é largada perfeita — bônus; mais tarde que isso é uma largada
 * normal, sem bônus nem penalidade (e quem nunca encosta em ESPAÇO também
 * larga normal, de propósito — a mecânica é opcional).
 */
export function resolveLaunch() {
  const car = state.player;
  if (!car) return;
  if (state.countdown > 0) {
    // Largada queimada: penalidade um pouco mais dura que a largada
    // perfeita é generosa (stun mais longo + um corte imediato de
    // velocidade, simulando o carro "engasgando" ao soltar cedo demais).
    car.stun = 1;
    car.speed *= .8;
    showNotice("LARGADA QUEIMADA! · SOLTOU A EMBREAGEM CEDO DEMAIS");
    engineAudio.cue("impact");
  } else if (state.countdown > -.35) {
    // Bônus bem mais discreto que o de um miniturbo de verdade (era 1.1s,
    // quase um turbo inteiro) — a largada perfeita deve dar uma vantagem
    // sutil, não decidir a corrida por si só.
    car.boost = Math.max(car.boost, .35);
    showNotice("LARGADA PERFEITA!");
    engineAudio.cue("boost");
  }
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

  // Limiares de acionamento reduzidos (curva menos brusca e velocidade menor
  // já bastam para entrar em drift — antes exigia `steer > .45`/`speed > 17`,
  // o que na prática só disparava em curvas bem fechadas e rápidas).
  const isDrifting =
    keys.Shift && Math.abs(car.steer) > .3 && car.speed > 12 && onTrack && car.stun <= 0 && car.driftCooldown === 0;

  // --- Bandeira amarela: zona de cautela ao redor de um incidente forte
  // (ver triggerYellowFlag em physics.js) — sem DRS e com teto de
  // velocidade bem mais baixo, igual à regra real. Avisa o jogador só na
  // borda de entrada na zona (não a cada tick).
  const wasUnderYellow = car.underYellow;
  car.underYellow = yellowFlagCapAt(car.s);
  if (car.underYellow && !wasUnderYellow && car === state.player) {
    showNotice("BANDEIRA AMARELA · REDUZA A VELOCIDADE");
  }

  // --- DRS: pequeno bônus de reta se estiver colado no carro da frente
  // numa zona marcada do circuito (ver computeDrsActive em physics.js).
  car.drsActive = computeDrsActive(car) && !car.underYellow;

  // A 2.0 usa resposta de pedal, relações de marcha, corte de troca e arrasto
  // próprios. A física arcade da 1.0 permanece exatamente no caminho abaixo.
  if (state.graphicsBeta) {
    updateBetaPowertrain(car, {
      throttle,
      brake,
      grade: nearest.t.y,
      onTrack,
      stunned: car.stun > 0,
      drs: car.drsActive,
      underYellow: car.underYellow,
    }, dt);
  } else {
    let accel = throttle ? 27 : -7;
    accel -= car.speed * car.speed * .0032;
    accel -= nearest.t.y * 9.81;
    if (brake) accel -= 53;
    if (!onTrack) accel -= car.speed * .62;
    if (car.stun > 0) accel -= 24;
    const turbo = playerTurboSettings(car, state, throttle && !brake);
    if (turbo.accelerating) accel += 36;
    if (car.drsActive) accel += 14;
    car.speed = clamp(car.speed + accel * dt, 0, turbo.speedCap);
  }

  // --- Lateral: escorregamento (slip) durante o drift. Entrada mais rápida
  // (4 -> 6) para o carro "sentir" o drift assim que Shift é pressionado.
  const targetSlip = isDrifting ? car.steer * .23 : 0;
  car.slip += (targetSlip - car.slip) * (1 - Math.exp(-dt * (isDrifting ? 6 : 9)));

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

  // --- Colisão com o muro: a perda de velocidade depende da SEVERIDADE do
  // impacto (ângulo entre a direção real de movimento e a tangente da
  // pista no ponto do muro, e a velocidade no momento) — um roçar quase
  // paralelo à parede perde pouca velocidade; um encontro quase
  // perpendicular perde bem mais. Crucial: a perda só é aplicada na BORDA
  // DE SUBIDA do contato (`!car.wallTouching`), nunca repetidamente
  // enquanto o carro continuar encostado/raspando no muro (ex.: cortando
  // uma curva rente à zebra por 1-2s) — sem isso, ficar raspando no muro
  // por alguns segundos ia comendo a velocidade a cada ~0.5s, o que parecia
  // um bug de colisão "quebrada" mesmo sem um impacto de verdade se repetindo.
  const wallSide = Math.sign(car.lane) || 1;
  const visualWallOffset = state.track.wallOffsetAt?.(car.s, wallSide);
  const wallLimit = visualWallOffset === null
    ? Infinity
    : (visualWallOffset ?? updated.halfWidth + cornerWideningAt(car.s, wallSide)) - 1.6;
  if (updated.dist > wallLimit) {
    car.lane = Math.sign(updated.lane) * (wallLimit - .1);
    const wallFrame = state.track.at(car.s, car.lane);
    car.x = wallFrame.p.x;
    car.z = wallFrame.p.z;
    if (!car.wallTouching) {
      // Faixa moderada de propósito (10%-40%, era 12%-57%): mesmo só uma
      // vez por toque, o topo da faixa ainda precisa parecer um baque, não
      // uma freada abrupta que praticamente para o carro.
      const headingDiff = wrapAngle(movementYaw - updated.yaw);
      const impactSeverity = clamp(Math.abs(Math.sin(headingDiff)) * clamp(car.speed / 45, 0, 1), 0, 1);
      car.speed *= 1 - (.1 + impactSeverity * .3);
      car.cameraShake = .15 + impactSeverity * .4;
      if (car === state.player) engineAudio.cue("impact");
      if (impactSeverity > .55) triggerYellowFlag(car.s);
      car.wallTouching = true;
    }
    car.yaw += wrapAngle(updated.yaw - car.yaw) * dt * (2 + 4 * Math.min(1, car.speed / 40));
    car.slip = 0;
  } else {
    car.wallTouching = false;
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
      // Carrega mais rápido (cap de taxa maior, atinge o teto em velocidade
      // mais baixa) — os níveis (ver driftLevel em items.js) chegam bem
      // mais rápido do que antes.
      car.driftCharge = Math.min(2.6, car.driftCharge + dt * Math.min(1.4, car.speed / 22));
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
  // O limiar de `slip` para conceder o boost foi relaxado (.4 -> .65): antes,
  // soltar o Shift um instante antes do carro "assentar" completamente
  // zerava o boost inteiro em silêncio, mesmo com o nível certo carregado —
  // a causa mais provável do miniturbo parecer "pouco recompensador".
  if (car.wasDrifting && !isDrifting) {
    const level = driftLevel(car.driftCharge);
    if (level && onTrack && car.stun <= 0 && Math.abs(car.slip) < .65) {
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
