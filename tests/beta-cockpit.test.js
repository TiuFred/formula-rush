import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildBetaCockpit,
  cockpitTelemetry,
  updateBetaCockpit,
} from "../src/betaCockpit.js";
import { makeCarbonMaterial } from "../src/betaSurfaceMaterials.js";
import { buildBetaCar } from "../src/betaCar.js";
import { updateOnboardCamera } from "../src/onboardCamera.js";

function installCanvasMock() {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {},
        fillText() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      }),
    }),
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
      const armEnd = new THREE.Vector3(0, 0.5, 0).applyMatrix4(
        arm.mesh.matrixWorld,
      );
      const expected = new THREE.Vector3(arm.side * 0.285, -0.015, -0.01)
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
    const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.025, 100);
    updateOnboardCamera(camera, { group, speed: 0 });
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const required = [
      "beta-cockpit-shell-left",
      "beta-cockpit-shell-right",
      "beta-center-body",
      "beta-steering-wheel",
      "beta-steering-column",
      "beta-steering-hub",
      "beta-halo-crown",
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
