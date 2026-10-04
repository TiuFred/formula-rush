import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyCircuitProfile } from "../src/circuits.js";
import { buildTrackModel, alignedFootprintClearanceAt } from "../src/track.js";
import { createPitCanopyGeometry, planInterlagosLandmarks, planInterlagosStands } from "../src/interlagosStructures.js";
import { planInterlagosVenue, interlagosVegetationBlocked } from "../src/interlagosVenue.js";

function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

test("membrana dos boxes tem bordas curvas, normais para cima e dimensões finitas", () => {
  const geometry = createPitCanopyGeometry();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  assert.equal(box.min.x, -8);
  assert.equal(box.max.x, 8);
  assert.ok(box.min.y >= 6.7 && box.max.y <= 11.5);
  const { position, normal } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    assert.ok(Number.isFinite(position.getY(i)));
    assert.ok(normal.getY(i) > 0, "membrana invertida");
  }
  geometry.dispose();
});

test("telões e áreas de circulação ficam fora do asfalto e árvores respeitam os setores", async () => {
  const load = async file => JSON.parse(await readFile(new URL("../public/" + file, import.meta.url), "utf8"));
  applyCircuitProfile("interlagos");
  const track = buildTrackModel(await load("interlagos.geojson"), await load("elevation.json"));
  const plan = planInterlagosVenue(track);
  assert.ok(plan.filter(item => item.kind === "screen").length >= 2);
  assert.ok(plan.filter(item => item.kind === "concourse").length >= 12);
  for (const item of plan) {
    assert.ok(alignedFootprintClearanceAt(track, item.s, item.lane, item.width, item.depth) >= 8);
  }
  assert.equal(interlagosVegetationBlocked(100, 40, 4309), true);
  assert.equal(interlagosVegetationBlocked(100, -65, 4309), true);
  assert.equal(interlagosVegetationBlocked(900, 45, 4309), true);
  assert.equal(interlagosVegetationBlocked(4309 - 500, 35, 4309), true);
  assert.equal(interlagosVegetationBlocked(900, 160, 4309), false);
  assert.equal(interlagosVegetationBlocked(2500, -100, 4309), false);
});

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
