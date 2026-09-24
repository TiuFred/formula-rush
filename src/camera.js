// Controle de câmera: órbita lenta ao redor da pista no menu, e câmera de
// perseguição (externa) ou a bordo (cockpit) durante a corrida, com
// suavização (lerp) e um leve tremor após impactos.

import * as THREE from "three";
import { state } from "./state.js";
import { worldScale } from "./scene.js";

/** Alvo de "olhar para" da câmera (suavizado entre frames). */
const lookTarget = new THREE.Vector3();

/** Atualiza a câmera para o frame atual. Chamar uma vez por frame com o `dt` real (não fixo). */
export function updateCamera(dt) {
  const camera = state.camera;

  if (state.gameState === "menu") {
    state.player.group.visible = true;
    const scale = worldScale();
    const angle = .23 + Math.sin(state.clockTime * .05) * .05;
    camera.position.set(920 * scale * Math.sin(angle), 850 * scale, 920 * scale * Math.cos(angle));
    camera.lookAt(0, 5, 0);
    camera.fov = 54;
    camera.updateProjectionMatrix();
    return;
  }

  const car = state.player;
  const frame = state.track.at(car.s);
  const cockpit = state.cameraMode === 1;

  // Direção "de fato" considerando o ângulo de escorregamento (evita uma
  // câmera nervosa demais durante o drift).
  const heading = car.yaw - car.slip * .35;
  const forward = new THREE.Vector3(Math.sin(heading), frame.t.y, Math.cos(heading)).normalize();

  const desiredPos = car.group.position.clone().addScaledVector(forward, cockpit ? .45 : -11.8);
  desiredPos.y += cockpit ? 1.32 : 5.3;

  const desiredLook = car.group.position.clone().addScaledVector(forward, cockpit ? 50 : 26);
  desiredLook.y += cockpit ? 1.2 : 1.1;

  car.group.visible = !cockpit;

  if (car.cameraInitialized) {
    camera.position.lerp(desiredPos, 1 - Math.exp(-dt * (cockpit ? 22 : 8)));
    lookTarget.lerp(desiredLook, 1 - Math.exp(-dt * 10));
  } else {
    camera.position.copy(desiredPos);
    lookTarget.copy(desiredLook);
    car.cameraInitialized = true;
  }

  // Tremor de câmera após impactos, decaindo com o tempo.
  car.cameraShake = Math.max(0, car.cameraShake - dt * 2);
  if (car.cameraShake > 0) {
    camera.position.x += Math.sin(state.clockTime * 65) * car.cameraShake * .13;
    camera.position.y += Math.sin(state.clockTime * 50) * car.cameraShake * .09;
  }

  camera.lookAt(lookTarget);
  camera.fov += ((cockpit ? 74 : 63) + (car.boost > 0 ? 6 : 0) - camera.fov) * (1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
}
