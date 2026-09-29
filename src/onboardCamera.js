import * as THREE from "three";

// Ponto de vista no espaço local do carro. Não usar lerp de posição no mundo:
// isso faz o olho atravessar o capacete e o halo durante acelerações e curvas.
export const ONBOARD_EYE = new THREE.Vector3(0, 1.46, .08);
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const target = new THREE.Vector3();

export function updateOnboardCamera(camera, car) {
  camera.position.copy(ONBOARD_EYE).applyQuaternion(car.group.quaternion).add(car.group.position);
  forward.set(0, -.025, 1).applyQuaternion(car.group.quaternion);
  up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
  camera.up.copy(up);
  target.copy(camera.position).addScaledVector(forward, 50);
  camera.lookAt(target);
  // FOV fixo evita que o cockpit pareça expandir/encolher com a velocidade.
  camera.fov = 72;
  camera.near = .045;
  camera.updateProjectionMatrix();
  car.group.visible = true;
  for (const mesh of car.group.userData.hideOnboard ?? []) mesh.visible = false;
}
