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
    rig = { offset: new THREE.Vector3() };
    car.onboardCameraRig = rig;
  }

  const shake = Math.max(0, car.cameraShake || 0);
  const targetOffset = new THREE.Vector3();
  if (shake > 0) {
    targetOffset.x = Math.sin(clockTime * 67) * shake * 0.012;
    targetOffset.y = Math.sin(clockTime * 53) * shake * 0.009;
    car.cameraShake = Math.max(0, shake - dt * 2);
  }
  const smoothing = dt > 0 ? 1 - Math.exp(-dt * 18) : 0;
  rig.offset.lerp(targetOffset, smoothing);

  localEye.copy(ONBOARD_EYE).add(rig.offset);
  camera.position.copy(localEye).applyQuaternion(car.group.quaternion).add(car.group.position);
  localForward.copy(ONBOARD_FORWARD);
  forward.copy(localForward).applyQuaternion(car.group.quaternion);
  up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
  camera.up.copy(up);
  target.copy(camera.position).addScaledVector(forward, 50);
  camera.lookAt(target);
  // FOV fixo mantém halo, volante e pneus estáveis durante toda a volta.
  camera.fov = ONBOARD_FOV;
  camera.near = 0.025;
  camera.updateProjectionMatrix();
  car.group.visible = true;
  for (const mesh of car.group.userData.hideOnboard ?? []) mesh.visible = false;
}
