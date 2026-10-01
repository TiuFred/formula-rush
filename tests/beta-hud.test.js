import test from "node:test";
import assert from "node:assert/strict";

const { broadcastTime, signedDelta, sectorTone, liveDelta } = await import("../src/betaHud.js");
const { TRACK_LENGTH } = await import("../src/constants.js");

test("tempo de volta no formato de transmissão", () => {
  assert.equal(broadcastTime(72.345), "1:12.345");
  assert.equal(broadcastTime(1.025), "0:01.025");
  assert.equal(broadcastTime(null), "—");
  assert.equal(broadcastTime(NaN), "—");
  assert.equal(broadcastTime(600.5), "10:00.500");
});

test("delta usa sinal tipográfico e casas pedidas", () => {
  assert.equal(signedDelta(0.2346), "+0.235");
  assert.equal(signedDelta(-1.2, 2), "−1.20");
  assert.equal(signedDelta(0), "0.000");
});

test("tom do setor: pendente, melhor pessoal ou mais lento", () => {
  const last = [24.1, 29.8, null];
  const best = [24.1, 29.5, null];
  assert.equal(sectorTone(0, 2, last, best), "best");
  assert.equal(sectorTone(1, 2, last, best), "slow");
  assert.equal(sectorTone(2, 2, last, best), "pending");
});

test("delta ao vivo compara com a melhor volta na mesma fração da pista", () => {
  const player = { bestLap: 80, progress: TRACK_LENGTH * 2.5, lapStarted: 100, finish: null };
  assert.ok(Math.abs(liveDelta(player, 140)) < 1e-9, "metade da volta em 40 s é igual ao melhor");
  assert.ok(liveDelta(player, 142) > 1.99);
  assert.equal(liveDelta({ ...player, bestLap: null }, 140), null);
  assert.equal(liveDelta({ ...player, finish: 1 }, 140), null);
});
