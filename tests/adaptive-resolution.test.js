import test from "node:test";
import assert from "node:assert/strict";
import { createAdaptiveResolution } from "../src/adaptiveResolution.js";

const feed = (controller, dt, frames) => {
  let last = null;
  for (let i = 0; i < frames; i++) last = controller.update(dt) ?? last;
  return last;
};

test("baixa a resolução quando o jogo roda lento e respeita o mínimo", () => {
  const controller = createAdaptiveResolution({ max: 1.5, min: 0.75 });
  assert.equal(feed(controller, 1 / 30, 90), 1.375);
  for (let i = 0; i < 20; i++) feed(controller, 1 / 30, 90);
  assert.equal(controller.ratio, 0.75);
});

test("não mexe quando o desempenho está bom e sobe devagar com folga", () => {
  const controller = createAdaptiveResolution({ max: 1.5 });
  assert.equal(feed(controller, 1 / 60, 90 * 5), null);
  feed(controller, 1 / 25, 90);
  const lowered = controller.ratio;
  assert.ok(lowered < 1.5);
  assert.equal(feed(controller, 1 / 120, 90), null, "uma janela calma não basta");
  assert.equal(feed(controller, 1 / 120, 90), null);
  assert.ok(feed(controller, 1 / 120, 90) > lowered, "três janelas calmas sobem um degrau");
});

test("travadas isoladas (troca de aba) não derrubam a resolução", () => {
  const controller = createAdaptiveResolution({ max: 1.5 });
  controller.update(0.25);
  assert.equal(feed(controller, 1 / 20, 89), null);
  assert.equal(controller.ratio, 1.5);
});
