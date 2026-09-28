// Replay cinematográfico: reproduz a pose gravada do carro do jogador (ver
// REPLAY_SAMPLE_INTERVAL/advanceSimulation em simulation.js), com uma barra
// de progresso arrastável (ver main.js, que traduz cliques/arrasto em
// seekReplay), play/pause, e duas câmeras que o próprio jogador escolhe:
// "onboard" (colada perto/baixo atrás do carro) e "transmissão" (o
// director-cut estilo F1 de TV, alternando corte a cada 6s entre uma câmera
// de perseguição e um drone orbital).
//
// Não é um novo "modo de jogo": é só uma troca temporária de quem move a
// câmera/o carro do jogador (ver main.js, animate() chama updateReplay em
// vez de updateCamera quando state.gameState === "replay"). A física real
// não roda durante o replay (main.js só entra no laço de física quando
// gameState === "race").

import * as THREE from "three";
import { state } from "./state.js";
import { clamp } from "./mathUtils.js";
import { byId, setVisible } from "./dom.js";
import { formatRaceClock } from "./timing.js";
import { REPLAY_SAMPLE_INTERVAL } from "./simulation.js";

let playbackClock = 0;
let paused = false;
/** "broadcast" (default, "transmissão") ou "onboard". */
let cameraMode = "broadcast";

const lookTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();

const HUD_ELEMENTS_TO_HIDE_DURING_REPLAY = [
  "hud", "instruments", "lapTelemetry", "miniStandings", "raceProgress", "attackWarning", "miniMap",
];

/** Duração total do replay gravado, em segundos. */
function replayDuration() {
  return (state.replayFrames.length - 1) * REPLAY_SAMPLE_INTERVAL;
}

export function startReplay() {
  if (state.replayFrames.length < 2) return;
  playbackClock = 0;
  paused = false;
  for (const car of state.drivers) car.group.visible = car.isHuman;
  setVisible("finish", false);
  setVisible("replayBar");
  setVisible("replayHud");
  for (const id of HUD_ELEMENTS_TO_HIDE_DURING_REPLAY) setVisible(id, false);

  byId("replayHudNumber").textContent = state.playerNumber;
  byId("replayHudNumber").style.background = state.selectedColor;
  byId("replayHudName").textContent = (state.player.name || "").toUpperCase();

  setReplayCamera("broadcast");
  updatePlayPauseUI();
  renderFrameAt(0);
}

export function stopReplay() {
  state.gameState = "finished";
  for (const car of state.drivers) car.group.visible = true;
  setVisible("replayBar", false);
  setVisible("replayHud", false);
  setVisible("finish");
}

/** Alterna play/pause; se estiver parado bem no fim, reinicia do começo. */
export function toggleReplayPlayPause() {
  if (paused && playbackClock >= replayDuration()) playbackClock = 0;
  paused = !paused;
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  byId("replayPlayPause").textContent = paused ? "▶" : "Ⅱ";
}

/** Pula para uma fração (0–1) da gravação — ver barra de progresso em main.js. */
export function seekReplay(fraction) {
  if (state.replayFrames.length < 2) return;
  playbackClock = clamp(fraction, 0, 1) * replayDuration();
  renderFrameAt(playbackClock);
}

/** Escolhe explicitamente a câmera do replay ("broadcast" ou "onboard"). */
export function setReplayCamera(mode) {
  cameraMode = mode;
  byId("replayCameraMode").textContent = mode === "onboard" ? "CÂMERA: ONBOARD" : "CÂMERA: TRANSMISSÃO";
}

/** Alterna entre as duas câmeras do replay. */
export function cycleReplayCamera() {
  setReplayCamera(cameraMode === "onboard" ? "broadcast" : "onboard");
}

/** Interpola a pose gravada em `clock` e atualiza carro + HUD + barra. Não mexe na câmera (ver applyReplayCamera). */
function renderFrameAt(clock) {
  const frames = state.replayFrames;
  const maxIndex = frames.length - 2;
  const rawIndex = clock / REPLAY_SAMPLE_INTERVAL;
  const index = clamp(Math.floor(rawIndex), 0, maxIndex);
  const alpha = clamp(rawIndex - index, 0, 1);
  const a = frames[index];
  const b = frames[index + 1];

  _pos.copy(a.pos).lerp(b.pos, alpha);
  _quat.copy(a.quat).slerp(b.quat, alpha);
  state.player.group.position.copy(_pos);
  state.player.group.quaternion.copy(_quat);

  const speed = a.speed + (b.speed - a.speed) * alpha;
  updateReplayHud(a, speed);
  updateScrubUI(clock);
}

/** Atualiza a HUD estilo transmissão de F1 (nome/número, volta, velocidade, marcha, DRS). */
function updateReplayHud(frame, speed) {
  // Contra-relógio não tem nº de voltas fixo (ver ui.js/updateHud) — mostra só a volta atual, sem "/total".
  byId("replayHudLap").textContent = state.timeTrial
    ? frame.lap
    : Math.min(frame.lap, state.lapCountRace) + "/" + state.lapCountRace;
  byId("replayHudSpeed").textContent = Math.round(speed * 3.6);
  byId("replayHudGear").textContent = speed < .5 ? "N" : Math.min(8, Math.floor(speed * 3.6 / 43) + 1);
  byId("replayHudDrs").classList.toggle("hidden", !frame.drsActive);
}

/** Atualiza a barra de progresso (que nem um player de vídeo) e os tempos. */
function updateScrubUI(clock) {
  const duration = replayDuration();
  const pct = duration > 0 ? clamp(clock / duration, 0, 1) * 100 : 0;
  byId("replayScrubFill").style.width = pct + "%";
  byId("replayScrubHandle").style.left = pct + "%";
  byId("replayTimeCurrent").textContent = formatRaceClock(clock);
  byId("replayTimeTotal").textContent = formatRaceClock(duration);
}

/**
 * Câmera "transmissão": o corte automático de diretor de TV de F1,
 * alternando a cada 6s entre uma câmera de perseguição baixa e um drone
 * orbital — deliberadamente diferente da câmera de corrida normal.
 */
function applyBroadcastCamera(dt, clock) {
  const camera = state.camera;
  const shot = Math.floor(clock / 6) % 2;
  if (shot === 0) {
    forward.set(0, 0, 1).applyQuaternion(_quat);
    const desired = _pos.clone().addScaledVector(forward, -6.5);
    desired.y += 1.7;
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    lookTarget.lerp(_pos.clone().addScaledVector(forward, 14).setY(_pos.y + 1), 1 - Math.exp(-dt * 8));
  } else {
    const angle = clock * .6;
    const desired = _pos.clone().add(new THREE.Vector3(Math.sin(angle) * 13, 4.5, Math.cos(angle) * 13));
    camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
    lookTarget.lerp(_pos, 1 - Math.exp(-dt * 8));
  }
  camera.fov += (58 - camera.fov) * (1 - Math.exp(-dt * 3));
}

/** Câmera "onboard": colada perto e baixo atrás do carro, sem cortes — como uma câmera de bordo de verdade. */
function applyOnboardCamera(dt) {
  const camera = state.camera;
  forward.set(0, 0, 1).applyQuaternion(_quat);
  const desired = _pos.clone().addScaledVector(forward, -3.2);
  desired.y += 1.15;
  camera.position.lerp(desired, 1 - Math.exp(-dt * 10));
  lookTarget.lerp(_pos.clone().addScaledVector(forward, 18).setY(_pos.y + 1), 1 - Math.exp(-dt * 10));
  camera.fov += (68 - camera.fov) * (1 - Math.exp(-dt * 3));
}

export function updateReplay(dt) {
  const duration = replayDuration();
  if (!paused) {
    playbackClock = Math.min(duration, playbackClock + dt);
    if (playbackClock >= duration) {
      paused = true;
      updatePlayPauseUI();
    }
  }
  renderFrameAt(playbackClock);

  if (cameraMode === "onboard") applyOnboardCamera(dt);
  else applyBroadcastCamera(dt, playbackClock);

  const camera = state.camera;
  camera.lookAt(lookTarget);
  camera.updateProjectionMatrix();
}
