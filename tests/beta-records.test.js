import test from "node:test";
import assert from "node:assert/strict";
import { GHOST_STEP, GhostRecorder, ghostAt, isNewRecord, loadRecord, normalizeRecord, recordKey, saveRecord } from "../src/betaRecords.js";

const memory = () => {
  const store = new Map();
  return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), store };
};

function lap(seconds = 10) {
  const recorder = new GhostRecorder();
  for (let t = 0; t <= seconds + 0.5; t += 0.016) recorder.sample(t, t * 10, 1, 0, 0);
  return recorder.finish(seconds);
}

test("o recorde é separado por circuito e horário", () => {
  assert.notEqual(recordKey("interlagos", "day"), recordKey("interlagos", "sunset"));
  assert.notEqual(recordKey("interlagos", "day"), recordKey("indianapolis", "day"));
});

test("salva e recarrega o recorde; lixo e armazenamento quebrado viram null", () => {
  const storage = memory();
  const ghost = lap();
  assert.ok(saveRecord("interlagos", "day", { best: 72.5, ghost }, storage));
  assert.deepEqual(loadRecord("interlagos", "day", storage), { best: 72.5, ghost });
  assert.equal(loadRecord("interlagos", "sunset", storage), null);
  storage.setItem(recordKey("interlagos", "day"), "{não é json");
  assert.equal(loadRecord("interlagos", "day", storage), null);
  assert.equal(loadRecord("interlagos", "day", { getItem: () => { throw new Error("bloqueado"); } }), null);
  assert.equal(saveRecord("interlagos", "day", { best: 70, ghost: null }, { setItem: () => { throw new Error("cheio"); } }), false);
});

test("normalizeRecord descarta tempos e fantasmas inválidos", () => {
  assert.equal(normalizeRecord({ best: -3 }), null);
  assert.equal(normalizeRecord({ best: "x" }), null);
  assert.equal(normalizeRecord("lixo"), null);
  assert.equal(normalizeRecord({ best: 70, ghost: [1, 2, 3] }).ghost, null);
  assert.equal(normalizeRecord({ best: 70, ghost: Array(10).fill("a") }).ghost, null);
  assert.equal(normalizeRecord({ best: 70 }).best, 70);
});

test("só volta válida e mais rápida vira recorde", () => {
  assert.equal(isNewRecord(80, true, null), true);
  assert.equal(isNewRecord(79, true, { best: 80 }), true);
  assert.equal(isNewRecord(80, true, { best: 80 }), false);
  assert.equal(isNewRecord(81, true, { best: 80 }), false);
  assert.equal(isNewRecord(70, false, { best: 80 }), false, "volta invalidada nunca é recorde");
  assert.equal(isNewRecord(NaN, true, null), false);
});

test("o gravador amostra a cada passo e corta além da linha de chegada", () => {
  const ghost = lap(10);
  const times = ghost.filter((_, i) => i % 5 === 0);
  assert.ok(Math.abs(times[1] - times[0] - GHOST_STEP) < 0.03);
  assert.ok(times.at(-1) <= 10);
  assert.ok(times.length > 80 && times.length <= 101);
});

test("o fantasma interpola posição e termina com a volta", () => {
  const ghost = lap(10);
  const at = ghostAt(ghost, 5);
  assert.ok(Math.abs(at.x - 50) < 1.5, `x=${at.x}`);
  assert.equal(ghostAt(ghost, 11), null, "depois da volta não há fantasma");
  assert.equal(ghostAt(ghost, -1), null);
  assert.equal(ghostAt(null, 1), null);
  assert.equal(ghostAt([0, 0, 0, 0, 0], 0), null);
});

test("o fantasma gira pelo caminho mais curto na virada de ±π", () => {
  const ghost = [0, 0, 0, 0, 3.1, 1, 0, 0, 0, -3.1];
  const yaw = ghostAt(ghost, 0.5).yaw;
  assert.ok(Math.abs(Math.abs(yaw) - Math.PI) < 0.06, `yaw=${yaw}`);
});
