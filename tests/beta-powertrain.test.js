import test from "node:test";
import assert from "node:assert/strict";
import { betaGearAtSpeed, updateBetaPowertrain } from "../src/betaPowertrain.js";

const input = { throttle: true, brake: false, grade: 0, onTrack: true, stunned: false, drs: false, underYellow: false };

test("powertrain 2.0 acelera progressivamente e troca oito marchas", () => {
  const car = { speed: 0, betaThrottle: 0, betaGear: 1, betaShiftTimer: 0 };
  updateBetaPowertrain(car, input, 1 / 120);
  assert.ok(car.betaThrottle > 0 && car.betaThrottle < 0.1);
  for (let i = 0; i < 20 * 120; i++) updateBetaPowertrain(car, input, 1 / 120);
  assert.ok(car.speed > 80 && car.speed <= 94.5);
  assert.equal(car.betaGear, 8);
  assert.equal(betaGearAtSpeed(0), 1);
  assert.equal(betaGearAtSpeed(90), 8);
});

test("powertrain 2.0 respeita freio, pista e bandeira amarela", () => {
  const car = { speed: 70, betaThrottle: 1, betaGear: 7, betaShiftTimer: 0 };
  const braking = updateBetaPowertrain(car, { ...input, throttle: false, brake: true }, .1);
  assert.ok(braking.acceleration < -35);
  car.speed = 60;
  updateBetaPowertrain(car, { ...input, underYellow: true }, .1);
  assert.equal(car.speed, 46);
  car.speed = 30;
  const offTrack = updateBetaPowertrain(car, { ...input, onTrack: false }, .1);
  assert.ok(offTrack.acceleration < 0);
});
