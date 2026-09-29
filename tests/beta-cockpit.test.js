import test from "node:test";
import assert from "node:assert/strict";
import { cockpitTelemetry } from "../src/betaCockpit.js";

test("cockpit uses HUD speed/gear thresholds without claiming engine RPM", () => {
  assert.equal(cockpitTelemetry({ speed: 0 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .49 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .5 }, 0).gear, 1);
  assert.equal(cockpitTelemetry({ speed: 43 / 3.6 }, 0).gear, 2);
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
