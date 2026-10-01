import * as THREE from "three";
import { prefersReducedMotion } from "./accessibility.js";

// Ponto de vista no espaço local do carro, na altura dos olhos do piloto sob o
// halo. Não usar lerp de posição no mundo: isso faz o olho atravessar o capacete
// e o halo durante acelerações e curvas. Todo movimento de cabeça abaixo é
// calculado em espaço local e limitado a poucos centímetros e graus.
const BASE_EYE = { y: 1.03, z: -0.22 };
export const ONBOARD_EYE = new THREE.Vector3(0, BASE_EYE.y, BASE_EYE.z);

/**
 * Ajusta o olho ao carro 3D de terceiros: o piloto senta mais baixo (`drop`) e mais à
 * frente (`forward`), logo adiante da caixa de ar do motor, como num F1 de verdade.
 */
export function setCockpitFit({ drop = 0, forward = 0 } = {}) {
  ONBOARD_EYE.y = BASE_EYE.y - drop;
  ONBOARD_EYE.z = BASE_EYE.z + forward;
}
export const ONBOARD_PITCH = -0.05;
export const ONBOARD_FORWARD = new THREE.Vector3(0, Math.sin(ONBOARD_PITCH), Math.cos(ONBOARD_PITCH));
export const ONBOARD_FOV = 68;
const MIN_HORIZONTAL_FOV = 88;
let baseFov = ONBOARD_FOV;
let shakeScale = 1;

/** Ajustes do jogador: FOV vertical de base (graus) e intensidade do balanço da cabeça (0–1). */
export function configureOnboardCamera({ fov = ONBOARD_FOV, shake = 1 } = {}) {
  baseFov = fov;
  shakeScale = Math.min(1, Math.max(0, shake));
}
const MAX_FOV = 84;

/**
 * Em 16:9 o FOV vertical é ONBOARD_FOV. Em telas mais largas o vertical diminui
 * para manter o mesmo campo horizontal (ultrawide não estica a imagem); em telas
 * estreitas ele cresce até garantir ao menos MIN_HORIZONTAL_FOV.
 */
export function onboardFov(aspect = 16 / 9) {
  const safe = Math.max(aspect, 0.1);
  if (safe >= 16 / 9) {
    const half = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * (16 / 9);
    return THREE.MathUtils.radToDeg(2 * Math.atan(half / safe));
  }
  const horizontal = Math.tan(THREE.MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2));
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(horizontal / safe));
  return Math.min(MAX_FOV, Math.max(baseFov, needed));
}

const MAX_OFFSET = 0.045;
const FOV_KICK = 3.5;
const baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(new THREE.Vector3(), ONBOARD_FORWARD, new THREE.Vector3(0, 1, 0)),
);
const localUp = new THREE.Vector3(0, 1, 0);
const localEye = new THREE.Vector3();
const headTarget = new THREE.Vector3();
const yawQuat = new THREE.Quaternion();
const pitchQuat = new THREE.Quaternion();
const rollQuat = new THREE.Quaternion();
const localQuat = new THREE.Quaternion();
const xAxis = new THREE.Vector3(1, 0, 0);
const zAxis = new THREE.Vector3(0, 0, 1);

const clamp = THREE.MathUtils.clamp;

export function updateOnboardCamera(camera, car, dt = 0, clockTime = 0) {
  let rig = car.onboardCameraRig;
  if (!rig) {
    rig = { offset: new THREE.Vector3(), lateral: 0, longitudinal: 0 };
    car.onboardCameraRig = rig;
  }

  // Cargas sentidas pelo piloto. steer > 0 é curva à esquerda (yaw cresce para +x).
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  // Quem pede menos movimento ao sistema recebe só uma fração dos balanços da cabeça.
  const motion = Math.min(prefersReducedMotion() ? 0.25 : 1, shakeScale);
  const lateralTarget = clamp(((car.steer || 0) * speed) / 70, -1, 1) * motion;
  const longitudinalTarget = clamp((car.betaAcceleration || 0) / 30, -1, 1) * motion;
  const follow = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
  rig.lateral += (lateralTarget - rig.lateral) * follow;
  rig.longitudinal += (longitudinalTarget - rig.longitudinal) * follow;

  // Vibração do chassi cresce com a velocidade; impactos somam um tremor curto.
  const v = clamp(speed / 90, 0, 1) * motion;
  // Zebras e grama: trepidação mais forte e mais grave que a do asfalto.
  const edge = clamp(car.edgeRumble || 0, 0, 1) * clamp(speed / 25, 0, 1) * motion;
  const coarse = 1 + edge * 4;
  const rumbleX = (Math.sin(clockTime * 53) * 0.0008 + Math.sin(clockTime * 89 + 2) * 0.0004 + edge * Math.sin(clockTime * 31) * 0.0014) * v * coarse;
  const rumbleY = (Math.sin(clockTime * 71) * 0.0012 + Math.sin(clockTime * 37 + 1) * 0.0008 + edge * Math.sin(clockTime * 27 + 3) * 0.002) * v * coarse;
  const rawShake = Math.max(0, car.cameraShake || 0);
  const shake = rawShake * motion;
  const target = headTarget.set(
    -rig.lateral * 0.016 + rumbleX + Math.sin(clockTime * 67) * shake * 0.012,
    -Math.abs(rig.longitudinal) * 0.004 + rumbleY + Math.sin(clockTime * 53) * shake * 0.009,
    -rig.longitudinal * 0.018,
  );
  if (rawShake > 0) car.cameraShake = Math.max(0, rawShake - dt * 2);
  const smoothing = dt > 0 ? 1 - Math.exp(-dt * 18) : 1;
  rig.offset.lerp(target, smoothing);
  if (rig.offset.length() > MAX_OFFSET) rig.offset.setLength(MAX_OFFSET);

  // Rotação da cabeça: olha para dentro da curva, inclina com a carga lateral e
  // cabeceia levemente ao frear e acelerar.
  const yaw = rig.lateral * 0.085;
  const roll = rig.lateral * 0.028 + Math.sin(clockTime * 41) * 0.0012 * v;
  const pitch = rig.longitudinal * (rig.longitudinal < 0 ? 0.03 : 0.012) + rumbleY * 0.3;
  yawQuat.setFromAxisAngle(localUp, yaw);
  pitchQuat.setFromAxisAngle(xAxis, pitch);
  rollQuat.setFromAxisAngle(zAxis, roll);
  localQuat.copy(yawQuat).multiply(baseQuaternion).multiply(pitchQuat).multiply(rollQuat);

  localEye.copy(ONBOARD_EYE).add(rig.offset);
  camera.position.copy(localEye).applyQuaternion(car.group.quaternion).add(car.group.position);
  camera.quaternion.copy(car.group.quaternion).multiply(localQuat);
  camera.up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
  // Leve abertura do campo em alta velocidade (até +3,5°), suavizada.
  const kickTarget = clamp(speed / 94, 0, 1) * FOV_KICK * motion;
  rig.fovKick = (rig.fovKick ?? kickTarget) + (kickTarget - (rig.fovKick ?? kickTarget)) * follow;
  camera.fov = onboardFov(camera.aspect) + rig.fovKick;
  camera.near = 0.025;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  car.group.visible = true;
  for (const mesh of car.group.userData.hideOnboard ?? []) mesh.visible = false;
}
