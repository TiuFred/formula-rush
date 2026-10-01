import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ONBOARD_EYE, ONBOARD_FORWARD, ONBOARD_FOV, onboardFov, updateOnboardCamera } from "../src/onboardCamera.js";

const viewInCar = (camera, group) =>
  camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(group.quaternion.clone().invert());
const eyeInCar = (camera, group) =>
  camera.position.clone().sub(group.position).applyQuaternion(group.quaternion.clone().invert());

test("onboard parado mantém olho e direção exatos em qualquer pose do carro", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const helmet = new THREE.Object3D();
  group.userData.hideOnboard = [helmet];
  const car = { group, speed: 0 };
  for (let i = 0; i < 100; i++) {
    group.position.set(i * 13, Math.sin(i) * 30, i * -21);
    group.quaternion.setFromEuler(new THREE.Euler(Math.sin(i) * .3, i * .13, Math.cos(i) * .2, "YXZ"));
    updateOnboardCamera(camera, car);
    assert.ok(eyeInCar(camera, group).distanceTo(ONBOARD_EYE) < 1e-9, "câmera deslizou dentro do carro");
    assert.ok(viewInCar(camera, group).distanceTo(ONBOARD_FORWARD) < 1e-9);
    assert.ok(Math.abs(camera.fov - ONBOARD_FOV) < 1e-9);
    assert.equal(helmet.visible, false);
    assert.equal(group.visible, true);
  }
});

test("onboard em movimento fica limitado a poucos centímetros e graus", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 94, steer: 1, betaAcceleration: -40, cameraShake: 1 };
  let maxOffset = 0;
  let maxAngle = 0;
  for (let i = 0; i < 240; i++) {
    car.steer = i < 120 ? 1 : -1;
    car.betaAcceleration = i % 80 < 40 ? -40 : 18;
    group.position.set(i, 0, -i);
    group.quaternion.setFromEuler(new THREE.Euler(0, i * .02, 0, "YXZ"));
    updateOnboardCamera(camera, car, 1 / 60, i / 60);
    maxOffset = Math.max(maxOffset, eyeInCar(camera, group).distanceTo(ONBOARD_EYE));
    maxAngle = Math.max(maxAngle, viewInCar(camera, group).angleTo(ONBOARD_FORWARD));
    assert.ok(camera.fov >= ONBOARD_FOV - 1e-9 && camera.fov <= ONBOARD_FOV + 3.5 + 1e-9);
  }
  assert.ok(maxOffset > 0.005, "sem resposta de cabeça");
  assert.ok(maxOffset <= 0.05, `olho se afastou ${maxOffset} m`);
  assert.ok(maxAngle > 0.02, "sem olhar para dentro da curva");
  assert.ok(maxAngle < 0.14, `visão girou ${maxAngle} rad`);
});

test("onboard olha para dentro da curva e inclina para o mesmo lado", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 70, steer: 0.8, betaAcceleration: 0 };
  for (let i = 0; i < 120; i++) updateOnboardCamera(camera, car, 1 / 60, i / 60);
  assert.ok(viewInCar(camera, group).x > ONBOARD_FORWARD.x + 0.02, "esquerda é +x no carro");
  car.steer = -0.8;
  for (let i = 0; i < 240; i++) updateOnboardCamera(camera, car, 1 / 60, i / 60);
  assert.ok(viewInCar(camera, group).x < ONBOARD_FORWARD.x - 0.02);
});

test("onboard frena cabeceando para baixo e recua o olho ao acelerar", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 60, steer: 0, betaAcceleration: -35 };
  for (let i = 0; i < 120; i++) updateOnboardCamera(camera, car, 1 / 60, 0);
  const braking = viewInCar(camera, group);
  assert.ok(braking.y < ONBOARD_FORWARD.y - 0.01, "não cabeceou para baixo");
  assert.ok(eyeInCar(camera, group).z > ONBOARD_EYE.z, "olho não avançou ao frear");
});

test("FOV vertical é fixo em telas largas e amplia em telas estreitas", () => {
  assert.ok(Math.abs(onboardFov(16 / 9) - ONBOARD_FOV) < 1e-9);
  // Ultrawide mantém o mesmo campo horizontal em vez de esticar a imagem.
  const horizontal = (aspect) => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(onboardFov(aspect) / 2)) * aspect);
  assert.ok(onboardFov(21 / 9) < ONBOARD_FOV);
  assert.ok(Math.abs(horizontal(21 / 9) - horizontal(16 / 9)) < 1e-9);
  const narrow = onboardFov(1);
  assert.ok(narrow > ONBOARD_FOV && narrow <= 84);
  assert.ok(onboardFov(0.4) <= 84, "FOV vertical de celular em pé distorce a cena");
});

test("onboard 2.0 limita impactos sem deformar o enquadramento", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 82, steer: 0.7, betaAcceleration: -24, cameraShake: 0.4 };
  updateOnboardCamera(camera, car, 1 / 60, 0.13);
  assert.ok(eyeInCar(camera, group).distanceTo(ONBOARD_EYE) < 0.05);
  assert.ok(camera.fov > ONBOARD_FOV && camera.fov <= ONBOARD_FOV + 3.5 + 1e-9, "sem abertura de FOV com a velocidade");
  for (let i = 1; i < 90; i++) updateOnboardCamera(camera, car, 1 / 60, i / 60);
  assert.ok(car.cameraShake < 1e-10);
});

test("FOV abre com a velocidade e volta ao repouso parado", () => {
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 94 };
  for (let i = 0; i < 240; i++) updateOnboardCamera(camera, car, 1 / 60, i / 60);
  assert.ok(Math.abs(camera.fov - (ONBOARD_FOV + 3.5)) < 0.05);
  car.speed = 0;
  for (let i = 0; i < 480; i++) updateOnboardCamera(camera, car, 1 / 60, i / 60);
  assert.ok(Math.abs(camera.fov - ONBOARD_FOV) < 0.05);
});

test("zebra e borda da pista trepidam mais que o asfalto, sempre dentro do limite", () => {
  const amplitude = (edgeRumble) => {
    const group = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
    const car = { group, speed: 80, edgeRumble };
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      updateOnboardCamera(camera, car, 1 / 60, i / 60);
      peak = Math.max(peak, eyeInCar(camera, group).distanceTo(ONBOARD_EYE));
    }
    return peak;
  };
  const smooth = amplitude(0);
  const rough = amplitude(1);
  assert.ok(rough > smooth * 2, `zebra ${rough} vs asfalto ${smooth}`);
  assert.ok(rough <= 0.05);
});
