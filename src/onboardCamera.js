import * as THREE from "three";

// Ponto de vista no espaço local do carro. Não usar lerp de posição no mundo:
// isso faz o olho atravessar o capacete e o halo durante acelerações e curvas.
export const ONBOARD_EYE = new THREE.Vector3(0, 1.5, -.16);
export const ONBOARD_FORWARD = new THREE.Vector3(0, -.045, 1).normalize();
export const ONBOARD_FOV = 68;
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const target = new THREE.Vector3();

export function updateOnboardCamera(camera, car) {
  camera.position.copy(ONBOARD_EYE).applyQuaternion(car.group.quaternion).add(car.group.position);
  forward.copy(ONBOARD_FORWARD).applyQuaternion(car.group.quaternion);
  up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
  camera.up.copy(up);
  target.copy(camera.position).addScaledVector(forward, 50);
  camera.lookAt(target);
  // FOV fixo evita que o cockpit pareça expandir/encolher com a velocidade.
  camera.fov = ONBOARD_FOV;
  camera.near = .035;
  camera.updateProjectionMatrix();
  car.group.visible = true;
  for (const mesh of car.group.userData.hideOnboard ?? []) mesh.visible = false;
}
