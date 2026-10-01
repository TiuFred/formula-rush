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

import { betaPowertrainTelemetry, displayGear, queueGearShift, rpmAt } from "../src/betaPowertrain.js";

const manual = { ...input, transmission: "manual" };
const run = (car, seconds, inp = manual) => {
  for (let i = 0; i < seconds * 120; i++) updateBetaPowertrain(car, inp, 1 / 120);
};

test("câmbio manual só troca com o pedido do jogador e respeita os limites 1–8", () => {
  const car = { speed: 0, betaThrottle: 0, betaGear: 1, betaShiftTimer: 0 };
  run(car, 6);
  assert.equal(car.betaGear, 1, "o manual não sobe sozinho");
  assert.ok(car.speed > 15 && car.speed <= 20.5, "limitador segura a 1ª marcha: " + car.speed);
  queueGearShift(car, 1);
  updateBetaPowertrain(car, manual, 1 / 120);
  assert.equal(car.betaGear, 2);
  for (let i = 0; i < 20; i++) {
    queueGearShift(car, 1);
    run(car, 0.2);
  }
  assert.equal(car.betaGear, 8);
  for (let i = 0; i < 20; i++) {
    queueGearShift(car, -1);
    updateBetaPowertrain(car, { ...manual, throttle: false }, 1 / 120);
  }
  assert.ok(car.betaGear >= 1);
  const low = { speed: 0, betaGear: 1, betaShiftTimer: 0 };
  queueGearShift(low, -1);
  updateBetaPowertrain(low, manual, 1 / 120);
  assert.equal(low.betaGear, 1);
});

test("manual recusa redução que estouraria o motor e reduz sozinho quase parado", () => {
  const car = { speed: 60, betaGear: 5, betaShiftTimer: 0, betaThrottle: 0 };
  queueGearShift(car, -1);
  updateBetaPowertrain(car, { ...manual, throttle: false }, 1 / 120);
  assert.equal(car.betaGear, 5, "reduzir 5→4 a 60 m/s passaria do limite da 4ª (52,5 m/s)");
  assert.ok(betaPowertrainTelemetry(car).denied);
  car.speed = 54;
  queueGearShift(car, -1);
  updateBetaPowertrain(car, { ...manual, throttle: false }, 1 / 120);
  assert.equal(car.betaGear, 4);
  const slow = { speed: 2, betaGear: 5, betaShiftTimer: 0, betaThrottle: 0 };
  for (let i = 0; i < 10; i++) updateBetaPowertrain(slow, { ...manual, throttle: false }, 1 / 120);
  assert.ok(slow.betaGear < 5, "anti-stall");
});

test("manual: marcha curta acelera mais, marcha longa menos, e o freio-motor segura o carro", () => {
  const accelIn = (gear) => {
    const car = { speed: 18, betaGear: gear, betaShiftTimer: 0, betaThrottle: 1 };
    return updateBetaPowertrain(car, manual, 1 / 120).acceleration;
  };
  assert.ok(accelIn(2) > accelIn(5));
  const coast = (gear) => {
    const car = { speed: 18, betaGear: gear, betaShiftTimer: 0, betaThrottle: 0 };
    return updateBetaPowertrain(car, { ...manual, throttle: false }, 1 / 120).acceleration;
  };
  assert.ok(coast(2) < coast(4), "marcha mais curta freia mais");
});

test("voltar ao automático reencontra a marcha da velocidade e o automático ignora pedidos", () => {
  const car = { speed: 60, betaGear: 2, betaShiftTimer: 0, betaThrottle: 1, betaManual: true };
  updateBetaPowertrain(car, input, 1 / 120);
  assert.equal(car.betaGear, betaGearAtSpeed(60));
  queueGearShift(car, 1);
  const before = car.betaGear;
  updateBetaPowertrain(car, input, 1 / 120);
  assert.equal(car.betaGear, before);
  assert.equal(car.betaShiftQueue, 0);
});

test("telemetria: giro proporcional à velocidade, luzes só na faixa alta, N só no automático", () => {
  assert.equal(rpmAt(3, 41.5), 1);
  assert.ok(rpmAt(3, 20.75) > 0.49 && rpmAt(3, 20.75) < 0.51);
  assert.equal(betaPowertrainTelemetry({ speed: 20, betaGear: 4 }).shift, 0);
  assert.ok(betaPowertrainTelemetry({ speed: 51, betaGear: 4 }).shift > 0.8);
  assert.equal(displayGear({ speed: 0 }), "N");
  assert.equal(displayGear({ speed: 0, betaGear: 1, betaManual: true }), 1);
});
