import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyCircuitProfile } from "../src/circuits.js";
import { buildTrackModel, alignedFootprintClearanceAt } from "../src/track.js";
import { planInterlagosLandmarks, planInterlagosStands } from "../src/interlagosStructures.js";

function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

test("setores de Interlagos ficam no exterior do circuito e coberturas não invadem o asfalto", async () => {
  const load = async file => JSON.parse(await readFile(new URL("../public/" + file, import.meta.url), "utf8"));
  applyCircuitProfile("interlagos");
  const track = buildTrackModel(await load("interlagos.geojson"), await load("elevation.json"));
  const modules = planInterlagosStands(track);
  assert.deepEqual([...new Set(modules.map(m => m.id))].sort(), ["A", "B", "D", "G", "H", "M", "PORTO", "R"]);
  for (const module of modules) {
    const { s, lane, depth } = module;
    assert.ok(alignedFootprintClearanceAt(track, s, lane, depth + 3, 18) >= 3, `${module.id}: cobertura obstrui pista`);
    assert.equal(inside(track.at(s, lane).p, track.samples), false, `${module.id}: arquibancada colocada no lado dos boxes`);
  }
});

test("apoios dos novos marcos de Interlagos ficam fora do asfalto", async () => {
  const load = async file => JSON.parse(await readFile(new URL("../public/" + file, import.meta.url), "utf8"));
  applyCircuitProfile("interlagos");
  const track = buildTrackModel(await load("interlagos.geojson"), await load("elevation.json"));
  const plan = planInterlagosLandmarks(track);
  assert.ok(plan.bridgeHalf > track.at(plan.bridgeStation).halfWidth + 8);
  for (const item of plan.groundStructures) {
    assert.ok(alignedFootprintClearanceAt(track, item.s, item.lane, item.width, item.depth) >= 2,
      `${item.id}: estrutura térrea invade o asfalto`);
  }
});
