import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildBetaCockpit,
  cockpitTelemetry,
  renderBetaMirrors,
  updateBetaCockpit,
} from "../src/betaCockpit.js";
import { makeCarbonMaterial } from "../src/betaSurfaceMaterials.js";
import { wristLocal } from "../src/betaWheel.js";
import { buildBetaCar } from "../src/betaCar.js";
import { ONBOARD_FOV, updateOnboardCamera } from "../src/onboardCamera.js";

function installCanvasMock() {
  const previousDocument = globalThis.document;
  const context = new Proxy({}, {
    get(target, key) {
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
  return () => {
    globalThis.document = previousDocument;
  };
}

test("cockpit uses the 2.0 powertrain telemetry", () => {
  assert.equal(cockpitTelemetry({ speed: 0 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .49 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .5 }, 0).gear, 1);
  assert.equal(cockpitTelemetry({ speed: 43 / 3.6 }, 0).gear, 1);
  assert.equal(cockpitTelemetry({ speed: 25, betaGear: 2, betaThrottle: .7 }, 0).gear, 2);
  const fast = cockpitTelemetry({ speed: 120 }, 0);
  assert.equal(fast.gear, 8);
  assert.equal(fast.speed, 432);
  assert.equal(fast.shift, 1);
  assert.equal(cockpitTelemetry({ speed: NaN }, 0).speed, 0);
});

test("cockpit distinguishes live, finished and invalid laps", () => {
  const car = { speed: 30, lapStarted: 25, drsActive: true };
  assert.equal(cockpitTelemetry(car, 65).lap, 40);
  assert.equal(cockpitTelemetry(car, 65).status, "DRS ATIVO");
  assert.equal(cockpitTelemetry({ ...car, currentLapValid: false }, 65).status, "VOLTA INVALIDA");
  assert.equal(cockpitTelemetry({ ...car, finish: true, lastLap: 82.34 }, 200).lap, 82.34);
  assert.equal(cockpitTelemetry(car, 0).lap, 0);
});

test("driver arms remain connected to the steering wheel at full lock", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(
      parent,
      makeCarbonMaterial(),
      new THREE.MeshStandardMaterial({ color: "#d22b25" }),
    );
    const car = {
      group: parent,
      speed: 50,
      steer: 1,
      betaAcceleration: 0,
      betaGear: 5,
      betaThrottle: 1,
      currentLapValid: true,
    };
    for (let i = 0; i < 60; i++)
      updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
    parent.updateMatrixWorld(true);

    for (const arm of cockpit.arms) {
      assert.ok(arm.mesh.scale.y < 0.8, `antebraço virou uma viga (${arm.mesh.scale.y} m)`);
      const armEnd = new THREE.Vector3(0, 0.5, 0).applyMatrix4(
        arm.mesh.matrixWorld,
      );
      const expected = wristLocal(arm.side)
        .multiply(cockpit.wheel.scale)
        .applyEuler(cockpit.wheel.rotation)
        .add(cockpit.wheel.position);
      assert.ok(armEnd.distanceTo(expected) < 1e-9);
    }
  } finally {
    restoreDocument();
  }
});

test("onboard frame contains body sides, connected wheel and complete halo", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCar(
      group,
      new THREE.MeshPhysicalMaterial({ color: "#d22b25" }),
      [],
    );
    const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9, 0.025, 100);
    updateOnboardCamera(camera, { group, speed: 0 });
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    for (const name of [
      "beta-cockpit-shell-left",
      "beta-cockpit-shell-right",
      "beta-center-body",
      "beta-mirror-left",
      "beta-mirror-right",
      "beta-halo-crown",
    ]) {
      const object = group.getObjectByName(name);
      assert.ok(object, `${name} ausente`);
      assert.ok(frustum.intersectsBox(new THREE.Box3().setFromObject(object)), `${name} fora do enquadramento`);
    }

    const required = [
      "beta-steering-wheel",
      "beta-steering-column",
      "beta-steering-hub",
      "beta-halo-pillar",
    ];
    for (const name of required) {
      const object = group.getObjectByName(name);
      assert.ok(object, `${name} ausente`);
      const center = new THREE.Box3()
        .setFromObject(object)
        .getCenter(new THREE.Vector3())
        .project(camera);
      assert.ok(Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1, `${name} fora do enquadramento`);
    }

    const hidden = new Set(group.userData.hideOnboard);
    assert.equal(hidden.has(group.getObjectByName("beta-center-body")), false);
    const columnBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-steering-column"));
    const hubBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-steering-hub"));
    assert.ok(columnBox.intersectsBox(hubBox), "coluna não alcança o cubo do volante");
    const crownBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-halo-crown"));
    const pillarBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-halo-pillar"));
    assert.ok(crownBox.intersectsBox(pillarBox), "pilar não alcança o aro do halo");
  } finally {
    restoreDocument();
  }
});

test("superfícies do cockpit têm normais voltadas para fora (sem autossombra)", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCockpit(group, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    for (const name of [
      "beta-cockpit-shell-left",
      "beta-cockpit-shell-right",
      "beta-center-body",
      "beta-halo-crown",
      "beta-halo-pillar",
    ]) {
      const { position, normal } = group.getObjectByName(name).geometry.attributes;
      let top = 0;
      for (let i = 1; i < position.count; i++) if (position.getY(i) > position.getY(top)) top = i;
      assert.ok(normal.getY(top) > 0.3, `${name} com normais invertidas (y=${normal.getY(top)})`);
    }
  } finally {
    restoreDocument();
  }
});

test("retrovisores renderizam a vista traseira refletida e restauram o estado", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCockpit(group, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const scene = new THREE.Scene();
    scene.add(group);
    const eye = new THREE.PerspectiveCamera();
    eye.position.set(0, 1.3, -0.22);
    const renders = [];
    const previous = { id: "tela" };
    let current = previous;
    const renderer = {
      shadowMap: { autoUpdate: true },
      getRenderTarget: () => current,
      setRenderTarget: (target) => { current = target; },
      render: (_scene, camera) => {
        assert.equal(renderer.shadowMap.autoUpdate, false, "mapa de sombras recalculado");
        renders.push(camera.getWorldDirection(new THREE.Vector3()));
      },
    };
    let rendered = 0;
    for (let i = 0; i < 4; i++) {
      renderBetaMirrors(renderer, scene, eye, { group });
      rendered = renders.length;
    }
    assert.equal(rendered, 4, "deve renderizar os dois espelhos a cada dois quadros");
    for (const direction of renders) assert.ok(direction.z < -0.5, "espelho não olha para trás");
    assert.ok(renders.some((d) => d.x > 0.05) && renders.some((d) => d.x < -0.05), "espelhos não divergem");
    assert.equal(current, previous, "alvo de render não restaurado");
    assert.equal(renderer.shadowMap.autoUpdate, true);
    for (const mirror of group.getObjectByName("beta-mirror-left").parent.children) {
      if (mirror.name.endsWith("-glass")) assert.equal(mirror.visible, true);
    }
  } finally {
    restoreDocument();
  }
});
