import test from "node:test";
import assert from "node:assert/strict";
import { ENGINE_HZ, betaEngineVoice, betaTireVoice } from "../src/betaAudio.js";
import { DEADZONE, readGamepad, steerCurve } from "../src/gamepad.js";
import { maxYawRate } from "../src/handling.js";
import { maxYawRate as guideYawRate } from "../src/betaGuide.js";

const car = (patch) => ({ speed: 0, betaGear: 1, betaThrottle: 0, betaShiftTimer: 0, edgeRumble: 0, ...patch });

test("o motor sobe de tom com o giro e fica entre marcha lenta e corte", () => {
  const idle = betaEngineVoice(car({ speed: 0 }));
  const mid = betaEngineVoice(car({ speed: 15 }));
  const top = betaEngineVoice(car({ speed: 19.4 }));
  assert.ok(idle.freq >= ENGINE_HZ.idle && idle.freq < mid.freq && mid.freq < top.freq && top.freq <= ENGINE_HZ.redline);
});

test("a troca de marcha derruba o tom e corta o som", () => {
  const before = betaEngineVoice(car({ speed: 19.5, betaGear: 1 }));
  const after = betaEngineVoice(car({ speed: 19.5, betaGear: 2, betaShiftTimer: 0.05 }));
  assert.ok(after.freq < before.freq, "a marcha seguinte gira mais baixo à mesma velocidade");
  assert.equal(after.shifting, true);
  assert.ok(after.gain < 0.02);
});

test("pé no acelerador deixa o motor mais alto e mais aberto que pé levantado", () => {
  const lift = betaEngineVoice(car({ speed: 40, betaGear: 3, betaThrottle: 0 }));
  const flat = betaEngineVoice(car({ speed: 40, betaGear: 3, betaThrottle: 1 }));
  assert.ok(flat.gain > lift.gain);
  assert.ok(flat.cutoff > lift.cutoff);
});

test("a trepidação da zebra só soa em movimento e na borda", () => {
  assert.equal(betaTireVoice(car({ speed: 60, edgeRumble: 0 })).gain, 0);
  assert.equal(betaTireVoice(car({ speed: 0, edgeRumble: 1 })).gain, 0);
  assert.ok(betaTireVoice(car({ speed: 60, edgeRumble: 1 })).gain > betaTireVoice(car({ speed: 20, edgeRumble: 1 })).gain);
});

test("a zona morta do analógico zera o ruído e o fim do curso chega a ±1", () => {
  assert.equal(steerCurve(DEADZONE * 0.9), 0);
  assert.equal(steerCurve(-0.05), 0);
  assert.equal(steerCurve(1), 1);
  assert.equal(steerCurve(-1), -1);
  assert.ok(steerCurve(0.5) < 0.5, "curva suave perto do centro");
  assert.equal(steerCurve(NaN), 0);
});

test("o gamepad usa +1 para a esquerda como o resto do jogo", () => {
  const pad = (axes, pressed = []) => ({ connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
  assert.ok(readGamepad(pad([-1, 0])).steer > 0.9, "analógico à esquerda esterça à esquerda");
  assert.ok(readGamepad(pad([1, 0])).steer < -0.9);
  const input = readGamepad(pad([0, 0], [7, 5]));
  assert.equal(input.throttle, true);
  assert.equal(input.shiftUp, true);
  assert.equal(input.brake, false);
  assert.equal(readGamepad(null), null);
  assert.equal(readGamepad({ connected: false, axes: [], buttons: [] }), null);
});

test("o guia e a física usam a mesma taxa de guinada", () => {
  assert.equal(guideYawRate, maxYawRate);
  assert.equal(maxYawRate(0), 0);
  assert.ok(maxYawRate(30) > maxYawRate(90));
});
