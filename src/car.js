// Cria o modelo 3D low-poly do monoposto (usado tanto para o jogador quanto
// para os 7 bots) e o objeto de estado associado a cada carro. Também cuida
// de sincronizar a posição/rotação visual do carro com a física a cada frame,
// e de montar o grid de largada no início de cada corrida.

import * as THREE from "three";
import { state } from "./state.js";
import { TRACK_LENGTH, F1_DRIVERS_2026, DRIVER_COUNT } from "./constants.js";
import { MATERIALS, makeMaterial, addMesh, addBox, disposeObject3D, makeTextPanel, redrawTextPanel } from "./materials.js";
import { resetLapState } from "./timing.js";

/**
 * Constrói o grupo three.js do carro (carroceria, rodas, asas, halo, escudo
 * e chama de turbo — inicialmente ocultos) e o objeto de estado do carro.
 *
 * @param {string} color Cor do corpo do carro.
 * @param {number} index Índice do piloto (0 = jogador).
 */
export function createCar(color, index) {
  const group = new THREE.Group();
  state.scene.add(group);
  const bodyMaterial = makeMaterial(color, { metalness: .42, roughness: .3 });
  const wheels = [];

  // Carroceria: assoalho, sidepods, difusor, nariz, halo, cockpit...
  addBox(1.28, .48, 3, bodyMaterial, 0, .64, -.25, group);
  addBox(.48, .42, 2, bodyMaterial, 0, .53, 1.65, group);
  addBox(1.7, .22, 1.7, bodyMaterial, 0, .43, -.7, group);
  addBox(2.3, .12, .58, MATERIALS.black, 0, .29, 2.45, group);
  addBox(2, .18, .68, bodyMaterial, 0, 1.05, -2.02, group);
  addBox(.12, .75, .2, MATERIALS.black, -.8, .66, -2, group);
  addBox(.12, .75, .2, MATERIALS.black, .8, .66, -2, group);
  addBox(.72, .26, 1.02, MATERIALS.black, 0, .94, -.15, group);
  addMesh(new THREE.SphereGeometry(.24, 10, 8), MATERIALS.white, 0, 1.14, 0, group);

  // Halo (proteção do cockpit).
  const halo = addMesh(new THREE.TorusGeometry(.4, .047, 5, 16, Math.PI), MATERIALS.black, 0, 1.19, .14, group);
  halo.rotation.x = Math.PI / 2;
  addBox(.07, .35, .07, MATERIALS.black, 0, 1, .57, group);

  // Rodas (pneu + roda) nas 4 posições.
  for (const side of [-1, 1]) {
    for (const z of [-1.44, 1.5]) {
      const tire = addMesh(new THREE.CylinderGeometry(.39, .39, .4, 12), MATERIALS.tire, side, .4, z, group);
      tire.rotation.z = Math.PI / 2;
      wheels.push(tire);
      const rim = addMesh(new THREE.CylinderGeometry(.2, .2, .42, 10), MATERIALS.metal, side, .4, z, group);
      rim.rotation.z = Math.PI / 2;
    }
  }

  // Escudo (esfera wireframe, oculta até um item "shield" ser usado).
  const shieldMesh = addMesh(
    new THREE.SphereGeometry(2.8, 14, 10),
    new THREE.MeshBasicMaterial({ color: "#62e8ff", transparent: true, opacity: .16, wireframe: true }),
    0, .7, 0, group
  );
  shieldMesh.visible = false;

  // Chama de turbo (cone, oculto até o boost estar ativo).
  const flame = addMesh(new THREE.ConeGeometry(.38, 2, 8), new THREE.MeshBasicMaterial({ color: "#b6ff50" }), 0, .5, -3, group);
  flame.rotation.x = -Math.PI / 2;
  flame.visible = false;

  addBox(.15, .025, 3.2, MATERIALS.white, 0, .89, -.12, group);
  addBox(.16, .02, 1.4, MATERIALS.white, 0, .76, 1.52, group);
  for (const side of [-1, 1]) {
    addBox(.09, .34, .85, bodyMaterial, side * 1.13, .47, 2.4, group);
    addBox(.08, .45, .8, bodyMaterial, side * 1.03, 1.11, -2, group);
    addBox(.36, .12, .26, bodyMaterial, side * .87, 1.05, .7, group);
    addBox(.08, .27, .07, MATERIALS.black, side * .75, .92, .7, group);
  }

  // Sombra falsa (disco escuro semitransparente sob o carro).
  const shadow = addMesh(
    new THREE.PlaneGeometry(2.8, 5.8),
    new THREE.MeshBasicMaterial({ color: "#07130f", transparent: true, opacity: .22, depthWrite: false }),
    0, .015, 0, group
  );
  shadow.rotation.x = -Math.PI / 2;

  // Número do carro na traseira ("07" por padrão para o jogador, editável no
  // menu — ver setPlayerIdentity — e o número real de cada piloto de F1
  // para os bots, ver F1_DRIVERS_2026 em constants.js).
  const numberPanel = makeTextPanel(
    index === 0 ? state.playerNumber : F1_DRIVERS_2026[index - 1].number,
    1.1, .6, "#162119", "#f5f7e8"
  );
  numberPanel.position.set(0, 1.15, -2.4);
  numberPanel.rotation.y = Math.PI;
  group.add(numberPanel);

  return {
    group,
    body: bodyMaterial,
    wheels,
    numberPanel,
    steer: 0,
    slip: 0,
    driftHold: 0,
    avoidLane: 0,
    decision: 0,
    invulnerable: 0,
    wallCooldown: 0,
    boostPower: 0,
    shieldMesh,
    flame,
    id: index,
    name: index === 0 ? state.playerName : F1_DRIVERS_2026[index - 1].name,
    color,
    // Marca carros controlados por humano (usado por car.js/physics.js para
    // decidir quem "dirige de verdade" vs. quem segue a pista nos trilhos,
    // e pelo leaderboard local para saber quem registrar).
    isHuman: index === 0,
    s: 0,
    progress: 0,
    lane: 0,
    speed: 0,
    yaw: 0,
    x: 0,
    z: 0,
    boost: 0,
    shield: 0,
    stun: 0,
    item: null,
    finish: null,
    aiSkill: .88 + index * .023,
    itemTimer: 9 + index,
    boxCooldown: 0,
    // Limites de pista (só verificado/aplicado no contra-relógio, ver
    // player.js e physics.js): fica `false` assim que o carro exceder o
    // limite da pista em algum ponto da volta atual, invalidando-a para
    // fins de melhor volta/ranking. Reiniciado a cada nova volta.
    currentLapValid: true,
    lapValidity: [],
    // Estado de drift/miniturbo e de câmera — por carro (não em `state`
    // global).
    driftCharge: 0,
    driftDirection: 0,
    driftCooldown: 0,
    wasDrifting: false,
    lastDriftLevel: 0,
    cameraShake: 0,
    cameraInitialized: false,
    // Snapshots de pose usados só para RENDERIZAÇÃO (ver applyRenderInterpolation).
    // A física roda em passo fixo (120 Hz); a tela pode renderizar a uma taxa
    // diferente (144 Hz, VSync variável...). Sem isso, o carro "pula" de
    // posição em posição a cada tick de física em vez de deslizar suave —
    // é essa a causa do "bumping"/travadinha na câmera externa.
    renderPrevPos: new THREE.Vector3(),
    renderCurrPos: new THREE.Vector3(),
    renderPrevQuat: new THREE.Quaternion(),
    renderCurrQuat: new THREE.Quaternion(),
  };
}

const _syncEuler = new THREE.Euler();

/**
 * Atualiza a pose FÍSICA de referência de um carro (`renderCurrPos`/
 * `renderCurrQuat`) a partir de seu estado (`s`, `lane`, `progress`, `steer`,
 * `stun`). Chamada uma vez por TICK de física (até várias vezes por frame
 * de render, se o frame for lento) — quem efetivamente move o carro na tela
 * é `applyRenderInterpolation`, chamada uma vez por frame.
 * Para carros que não são o jogador, também recalcula x/z/yaw a partir de
 * `s`/`lane` (eles seguem a pista "nos trilhos" lateralmente).
 */
export function syncCarVisual(car) {
  const frame = state.track.at(car.s, car.lane);
  if (!car.isHuman) {
    car.x = frame.p.x;
    car.z = frame.p.z;
    car.yaw = frame.yaw;
  }
  car.renderCurrPos.set(car.x, frame.p.y + .18, car.z);
  _syncEuler.set(
    -Math.asin(frame.t.y),
    car.yaw,
    -frame.bank + (car.stun > 0 ? Math.sin(state.clockTime * 18) * .11 : -(car.steer || 0) * .018),
    "YXZ"
  );
  car.renderCurrQuat.setFromEuler(_syncEuler);
  for (const wheel of car.wheels) wheel.rotation.x = -car.progress / .39;
}

/**
 * Aplica, à posição/rotação REAIS do objeto three.js de cada carro, a
 * interpolação entre a pose do tick de física anterior e a do tick atual
 * (`alpha` = fração do próximo tick já "decorrida" no acumulador de física).
 * Chamada uma vez por FRAME de render (não por tick de física) — é isso que
 * faz o carro deslizar suave entre ticks de 120 Hz em vez de "pular" de
 * posição em posição (o "bumping" visto pela câmera externa).
 */
export function applyRenderInterpolation(alpha) {
  for (const car of state.drivers) {
    car.group.position.copy(car.renderPrevPos).lerp(car.renderCurrPos, alpha);
    car.group.quaternion.copy(car.renderPrevQuat).slerp(car.renderCurrQuat, alpha);
  }
}

/**
 * Atualiza o nome e o número exibidos para o carro do jogador — pode ser
 * chamada em qualquer momento (menu ou durante a corrida); redesenha a
 * placa do número no próprio carro sem precisar recriá-lo.
 */
export function setPlayerIdentity(name, number) {
  state.playerName = name || "Você";
  state.playerNumber = number || "07";
  const player = state.player;
  if (!player) return;
  player.name = state.playerName;
  if (player.numberPanel) redrawTextPanel(player.numberPanel, state.playerNumber);
}

/**
 * (Re)monta o grid de largada. Em corrida normal: descarta os carros de uma
 * corrida anterior (se houver) e cria os 23 pilotos (você + os 22 pilotos
 * da F1 2026) posicionados em suas respectivas posições de largada
 * escalonadas. No contra-relógio (`state.timeTrial`), cria só o carro do
 * jogador, sozinho na linha de largada.
 */
export function setupGrid() {
  for (const car of state.drivers) disposeObject3D(car.group);
  state.drivers = [];
  state.finishOrder = [];

  const count = state.timeTrial ? 1 : DRIVER_COUNT;
  for (let i = 0; i < count; i++) {
    const color = i === 0 ? state.selectedColor : F1_DRIVERS_2026[i - 1].color;
    const car = createCar(color, i);
    resetLapState(car);

    if (state.timeTrial) {
      // Sozinho na pista: parte centralizado, logo antes da linha de largada.
      car.progress = -10;
      car.s = (car.progress + TRACK_LENGTH) % TRACK_LENGTH;
      car.lane = 0;
    } else {
      // Posição no grid: o jogador larga na última fileira; os bots ocupam
      // as fileiras à frente. 2 carros por fileira, alternando lado esquerdo/direito.
      const slot = i === 0 ? count - 1 : i - 1;
      car.progress = -10 - Math.floor(slot / 2) * 9;
      car.s = (car.progress + TRACK_LENGTH) % TRACK_LENGTH;
      car.lane = slot % 2 ? -2.8 : 2.8;
    }

    const frame = state.track.at(car.s, car.lane);
    car.x = frame.p.x;
    car.z = frame.p.z;
    car.yaw = frame.yaw;
    car.group.position.copy(frame.p);
    car.group.rotation.y = car.yaw;
    // Inicializa os snapshots de renderização com a pose de largada, para
    // não haver um "salto" visual do (0,0,0) até a posição real no 1º frame.
    car.renderPrevPos.copy(car.group.position);
    car.renderCurrPos.copy(car.group.position);
    car.renderPrevQuat.copy(car.group.quaternion);
    car.renderCurrQuat.copy(car.group.quaternion);
    state.drivers.push(car);
  }
  state.player = state.drivers[0];
}
