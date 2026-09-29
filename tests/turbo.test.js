import test from "node:test";
import assert from "node:assert/strict";
import { alwaysTurboEnabled, playerTurboSettings } from "../src/turbo.js";

test("sempre turbo amplia a velocidade apenas na versão 1.0", () => {
  const car = { boost: 0, underYellow: false, drsActive: false };
  const settings = { alwaysTurbo: true, graphicsBeta: false };
  assert.deepEqual(playerTurboSettings(car, settings, true), { accelerating: true, speedCap: 108 });
  assert.deepEqual(playerTurboSettings(car, settings, false), { accelerating: false, speedCap: 108 });
  assert.deepEqual(playerTurboSettings(car, { ...settings, graphicsBeta: true }, true), { accelerating: false, speedCap: 84 });
  assert.equal(alwaysTurboEnabled({ alwaysTurbo: false }), false);
  assert.equal(car.boost, 0);
});

test("turbo respeita bandeira amarela e mantém itens e DRS normais", () => {
  assert.equal(playerTurboSettings({ underYellow: true }, { alwaysTurbo: true }, true).speedCap, 46);
  assert.equal(playerTurboSettings({ boost: 1 }, {}, true).speedCap, 108);
  assert.equal(playerTurboSettings({ drsActive: true }, {}, true).speedCap, 90);
  assert.equal(playerTurboSettings({ boost: 0 }, {}, true).speedCap, 84);
});
