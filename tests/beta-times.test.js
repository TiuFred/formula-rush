import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BETA_TIMES } from "../src/betaNature.js";
import { TIMES_OF_DAY } from "../src/betaSettings.js";

test("todo horário escolhível tem os mesmos parâmetros definidos", () => {
  const keys = Object.keys(BETA_TIMES.day).sort();
  for (const mode of TIMES_OF_DAY) {
    assert.deepEqual(Object.keys(BETA_TIMES[mode]).sort(), keys, `horário ${mode} incompleto`);
  }
});

test("o pôr do sol tem o sol mais baixo, mais quente e à frente do carro", () => {
  const elevation = (time) => Math.asin(new THREE.Vector3(...time.sun).normalize().y);
  const { day, sunset } = BETA_TIMES;
  assert.ok(elevation(sunset) < elevation(day) / 3, "sol deveria estar bem mais baixo");
  assert.ok(sunset.sun[2] > 0, "o sol precisa estar à frente (+z) para o céu ficar alaranjado");
  const warmth = (hex) => {
    const c = new THREE.Color(hex);
    return c.r - c.b;
  };
  assert.ok(warmth(sunset.sunColor) > warmth(day.sunColor));
  assert.ok(warmth(sunset.fog) > warmth(day.fog));
  assert.equal(sunset.warm, 1);
  assert.equal(day.warm, 0);
});
