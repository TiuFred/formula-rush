import * as THREE from "three";

// Ponto de vista no espaço local do carro. Não usar lerp de posição no mundo:
// isso faz o olho atravessar o capacete e o halo durante acelerações e curvas.
export const ONBOARD_EYE = new THREE.Vector3(0, 1.335, -0.36);
export const ONBOARD_FORWARD = new THREE.Vector3(0, -0.115, 1).normalize();
export const ONBOARD_FOV = 64;
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const target = new THREE.Vector3();
const localEye = new THREE.Vector3();
const localForward = new THREE.Vector3();

export function updateOnboardCamera(camera, car, dt = 0, clockTime = 0) {
  let rig = car.onboardCameraRig;
  if (!rig) {
    rig = { offset: new THREE.Vector3(), fov: ONBOARD_FOV };
    car.onboardCameraRig = rig;
  }

  const acceleration = THREE.MathUtils.clamp(car.betaAcceleration || 0, -35, 18);
  const speedFactor = THREE.MathUtils.clamp((car.speed || 0) / 90, 0, 1);
  const shake = Math.max(0, car.cameraShake || 0);
  const targetOffset = new THREE.Vector3(
    (car.steer || 0) * 0.012 + Math.sin(clockTime * 37) * 0.0018 * speedFactor,
    Math.sin(clockTime * 48) * 0.0022 * speedFactor + Math.sin(clockTime * 73) * 0.0012 * speedFactor,
    -acceleration * 0.00115,
  );
  if (shake > 0) {
    targetOffset.x += Math.sin(clockTime * 67) * shake * 0.025;
    targetOffset.y += Math.sin(clockTime * 53) * shake * 0.018;
    car.cameraShake = Math.max(0, shake - dt * 2);
  }
  const smoothing = dt > 0 ? 1 - Math.exp(-dt * 13) : 0;
  rig.offset.lerp(targetOffset, smoothing);

  localEye.copy(ONBOARD_EYE).add(rig.offset);
  camera.position.copy(localEye).applyQuaternion(car.group.quaternion).add(car.group.position);
  localForward.copy(ONBOARD_FORWARD);
  localForward.x += (car.steer || 0) * 0.022;
  localForward.y -= acceleration * 0.0002;
  localForward.normalize();
  forward.copy(localForward).applyQuaternion(car.group.quaternion);
  up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
  camera.up.copy(up);
  target.copy(camera.position).addScaledVector(forward, 50);
  camera.lookAt(target);
  // Uma variação de apenas 2 graus comunica velocidade sem deformar o cockpit.
  const desiredFov = ONBOARD_FOV + speedFactor * 2;
  rig.fov += (desiredFov - rig.fov) * smoothing;
  camera.fov = rig.fov;
  camera.near = 0.025;
  camera.updateProjectionMatrix();
  car.group.visible = true;
  for (const mesh of car.group.userData.hideOnboard ?? []) mesh.visible = false;
}
