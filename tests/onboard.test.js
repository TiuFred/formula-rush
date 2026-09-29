import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ONBOARD_EYE, updateOnboardCamera } from "../src/onboardCamera.js";

test("onboard mantém o olho fixo no carro sob aceleração, inclinação e curvas", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const helmet = new THREE.Object3D();
  group.userData.hideOnboard = [helmet];
  const car = { group, speed: 0 };
  for (let i = 0; i < 100; i++) {
    car.speed = i;
    group.position.set(i * 13, Math.sin(i) * 30, i * -21);
    group.quaternion.setFromEuler(new THREE.Euler(Math.sin(i) * .3, i * .13, Math.cos(i) * .2, "YXZ"));
    updateOnboardCamera(camera, car);
    const localEye = camera.position.clone().sub(group.position).applyQuaternion(group.quaternion.clone().invert());
    assert.ok(localEye.distanceTo(ONBOARD_EYE) < 1e-10, "câmera deslizou dentro do carro");
    const view = camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(group.quaternion.clone().invert());
    assert.ok(view.distanceTo(new THREE.Vector3(0, -.025, 1).normalize()) < 1e-10);
    assert.equal(camera.fov, 72);
    assert.equal(helmet.visible, false);
    assert.equal(group.visible, true);
  }
});
