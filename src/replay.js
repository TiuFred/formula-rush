// Replay cinematográfico: reproduz a pose gravada do carro do jogador (ver
// REPLAY_SAMPLE_INTERVAL/advanceSimulation em simulation.js) com uma câmera
// que corta entre dois enquadramentos dramáticos, alternando a cada 6s de
// replay — bem diferente da câmera de corrida normal, de propósito.
//
// Não é um novo "modo de jogo": é só uma troca temporária de quem move a
// câmera/o carro do jogador (ver main.js, animate() chama updateReplay em
// vez de updateCamera quando state.gameState === "replay"). A física real
// não roda durante o replay (main.js só entra no laço de física quando
// gameState === "race").

import * as THREE from "three";
import { state } from "./state.js";
import { clamp } from "./mathUtils.js";
import { setVisible } from "./dom.js";
import { REPLAY_SAMPLE_INTERVAL } from "./simulation.js";

let playbackClock = 0;
const lookTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/** Elementos do HUD de corrida que normalmente ficam por baixo do modal
 * `#finish` (coberto por ele, então nunca precisou de setVisible próprio ao
 * terminar a corrida) — mas o replay TROCA o modal pela cena 3D, então
 * precisa escondê-los explicitamente, senão aparecem por cima da câmera
 * cinematográfica com dados congelados da corrida (posição 0 km/h etc.). */
const HUD_ELEMENTS_TO_HIDE_DURING_REPLAY = [
  "hud", "instruments", "lapTelemetry", "miniStandings", "raceProgress", "attackWarning", "miniMap",
];

/** Inicia o replay a partir do início da gravação da corrida atual. */
export function startReplay() {
  if (state.replayFrames.length < 2) return; // nada de útil gravado
  playbackClock = 0;
  state.gameState = "replay";
  // Só o carro do jogador tem pose gravada — os outros ficam ocultos
  // durante o replay para não confundir (eles ficariam congelados no lugar
  // onde a corrida terminou, o que pareceria um bug, não um replay).
  for (const car of state.drivers) car.group.visible = car.isHuman;
  setVisible("finish", false);
  setVisible("replayBar");
  for (const id of HUD_ELEMENTS_TO_HIDE_DURING_REPLAY) setVisible(id, false);
}

/** Encerra o replay (fim natural da gravação, ou "PULAR REPLAY") e volta para a tela de resultado. */
export function stopReplay() {
  state.gameState = "finished";
  for (const car of state.drivers) car.group.visible = true;
  setVisible("replayBar", false);
  setVisible("finish");
}

/**
 * Chamada uma vez por FRAME (não em passo fixo — é só reprodução visual de
 * dados já gravados) enquanto `state.gameState === "replay"`. Interpola a
 * pose do jogador entre as duas amostras mais próximas de `playbackClock` e
 * posiciona a câmera num dos dois enquadramentos cinematográficos.
 */
export function updateReplay(dt) {
  const frames = state.replayFrames;
  playbackClock += dt;

  const maxIndex = frames.length - 2;
  const rawIndex = playbackClock / REPLAY_SAMPLE_INTERVAL;
  if (rawIndex >= maxIndex + 1) {
    stopReplay();
    return;
  }
  const index = Math.min(maxIndex, Math.floor(rawIndex));
  const alpha = clamp(rawIndex - index, 0, 1);
  const a = frames[index];
  const b = frames[index + 1];

  _pos.copy(a.pos).lerp(b.pos, alpha);
  _quat.copy(a.quat).slerp(b.quat, alpha);
  state.player.group.position.copy(_pos);
  state.player.group.quaternion.copy(_quat);

  const camera = state.camera;
  const shot = Math.floor(playbackClock / 6) % 2;
  if (shot === 0) {
    // Perseguição dramática: mais baixa e mais perto que a câmera de corrida normal.
    forward.set(0, 0, 1).applyQuaternion(_quat);
    const desired = _pos.clone().addScaledVector(forward, -6.5);
    desired.y += 1.7;
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    lookTarget.lerp(_pos.clone().addScaledVector(forward, 14).setY(_pos.y + 1), 1 - Math.exp(-dt * 8));
  } else {
    // Órbita lenta ao redor do carro, de um ângulo que muda com o tempo.
    const angle = playbackClock * .6;
    const desired = _pos.clone().add(new THREE.Vector3(Math.sin(angle) * 13, 4.5, Math.cos(angle) * 13));
    camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
    lookTarget.lerp(_pos, 1 - Math.exp(-dt * 8));
  }
  camera.lookAt(lookTarget);
  camera.fov += (58 - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
}
