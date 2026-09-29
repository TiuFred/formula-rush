import test from "node:test";
import assert from "node:assert/strict";

import { clamp, progressDelta, smoothstepLookup, wrapAngle } from "../src/mathUtils.js";
import {
  checkLapCompletion,
  checkSectorCompletion,
  clampLapCount,
  formatLapTime,
  resetLapState,
} from "../src/timing.js";
import { driftLevel, pickItem } from "../src/items.js";
import {
  isKnownCircuitId,
  isPlausibleLapTime,
  normalizePlayerName,
  normalizePlayerNumber,
} from "../src/validation.js";

test("utilitários matemáticos respeitam limites e pista circular", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-12);
  assert.equal(progressDelta(5, 95, 100), 10);
  assert.equal(progressDelta(95, 5, 100), -10);
  assert.equal(smoothstepLookup([[0, 0], [100, 10]], 50, 100), 5);
});

test("voltas e setores usam interpolação sub-frame", () => {
  const car = {};
  resetLapState(car);
  checkLapCompletion(car, 99, 101, 10, 1, 100, 3);
  assert.equal(car.completedLaps, 1);
  assert.equal(car.lastLap, 9.5);

  checkSectorCompletion(car, 32, 34, 4, 1, 100);
  assert.ok(Math.abs(car.lastSectors[0] - 3.666666666666666) < 1e-9);
});

test("formatação e limite de voltas são estáveis", () => {
  assert.equal(clampLapCount("21"), 20);
  assert.equal(clampLapCount("inválido"), 3);
  assert.equal(formatLapTime(61.2344), "01:01.234");
  assert.equal(formatLapTime(null), "—");
});

test("sorteio de item e níveis de drift cobrem as fronteiras", () => {
  assert.equal(driftLevel(0.49), 0);
  assert.equal(driftLevel(0.5), 1);
  assert.equal(driftLevel(1.1), 2);
  assert.equal(driftLevel(2), 3);
  assert.equal(pickItem(1, 0, () => 0), "turbo");
  assert.equal(pickItem(1, 0, () => 0.99), "shield");
  assert.equal(pickItem(8, 100, () => 0.6), "missile");
});

test("identidade e entradas de ranking são normalizadas", () => {
  assert.equal(normalizePlayerName("  Piloto\n  Seguro  "), "Piloto Seguro");
  assert.equal(normalizePlayerName(""), "Piloto");
  assert.equal(normalizePlayerName("__proto__"), "Piloto");
  assert.equal(Array.from(normalizePlayerName("12345678901234567")).length, 16);
  assert.equal(normalizePlayerNumber(" #42 "), "42");
  assert.equal(normalizePlayerNumber("7A1"), "71");
  assert.equal(normalizePlayerNumber("sem número"), "07");
  assert.equal(isKnownCircuitId("spa"), true);
  assert.equal(isKnownCircuitId("redBullRing"), true);
  assert.equal(isKnownCircuitId("miami"), true);
  assert.equal(isKnownCircuitId("yasMarina"), true);
  assert.equal(isKnownCircuitId("atalho"), false);
  assert.equal(isPlausibleLapTime(20), true);
  assert.equal(isPlausibleLapTime(19.999), false);
  assert.equal(isPlausibleLapTime(901), false);
});
