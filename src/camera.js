// Controle de câmera: órbita lenta ao redor da pista no menu, e câmera de
// perseguição (externa) ou a bordo (cockpit) durante a corrida, com
// suavização (lerp) e um leve tremor após impactos.

import * as THREE from "three";
import { state } from "./state.js";
import { worldScale } from "./scene.js";
import { updateOnboardCamera } from "./onboardCamera.js";

/** Alvo de "olhar para" da câmera (suavizado entre frames). */
const lookTarget = new THREE.Vector3();

/** Atualiza a câmera para o frame atual. Chamar uma vez por frame com o `dt` real (não fixo). */
export function updateCamera(dt) {
  const camera = state.camera;

  if (state.graphicsBeta && !["menu", "landing"].includes(state.gameState)) {
    updateOnboardCamera(camera, state.player, dt, state.clockTime);
    return;
  }
  camera.up.set(0, 1, 0);

  if (state.gameState === "menu" || state.gameState === "landing") {
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

  const chaseDistance = state.graphicsBeta ? -8.9 : -11.8;
  const desiredPos = car.group.position.clone().addScaledVector(forward, cockpit ? (state.graphicsBeta ? .14 : .45) : chaseDistance);
  desiredPos.y += cockpit ? (state.graphicsBeta ? 1.55 : 1.32) : state.graphicsBeta ? 3.35 : 5.3;

  const desiredLook = car.group.position.clone().addScaledVector(forward, cockpit ? 50 : 26);
  desiredLook.y += cockpit ? 1.2 : state.graphicsBeta ? .65 : 1.1;

  car.group.visible = !cockpit || state.graphicsBeta;

  if (car.cameraInitialized) {
    camera.position.lerp(desiredPos, 1 - Math.exp(-dt * (cockpit ? 22 : state.graphicsBeta ? 16 : 8)));
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

  // Vibração mínima de alta velocidade: dá textura ao movimento sem tornar
  // a perseguição instável ou desconfortável.
  if (state.graphicsBeta && !cockpit && car.speed > 35) {
    const vibration = Math.min(.035, (car.speed - 35) * .00055);
    camera.position.y += Math.sin(state.clockTime * 46) * vibration;
    camera.position.x += Math.sin(state.clockTime * 31) * vibration * .55;
  }

  camera.lookAt(lookTarget);
  const speedFov = state.graphicsBeta ? Math.min(cockpit ? 5 : 11, car.speed * (cockpit ? .045 : .1)) : 0;
  const baseFov = cockpit ? 74 : state.graphicsBeta ? 60 : 63;
  camera.fov += (baseFov + speedFov + (car.boost > 0 ? 6 : 0) - camera.fov) * (1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
}
