import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CIRCUITS } from "../src/circuits.js";
import { CHAMPIONSHIP_CALENDAR, CHAMPIONSHIP_POINTS } from "../src/constants.js";

async function readPublicJson(relativePath) {
  const url = new URL("../public/" + relativePath.replace(/^\.\//, ""), import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

test("todos os circuitos possuem traçado fechado e elevação válida", async () => {
  for (const [id, circuit] of Object.entries(CIRCUITS)) {
    const geo = await readPublicJson(circuit.geojsonPath);
    const elevation = await readPublicJson(circuit.elevationPath);
    const coordinates = geo.features?.[0]?.geometry?.coordinates;

    assert.ok(Array.isArray(coordinates) && coordinates.length > 20, `${id}: traçado ausente`);
    assert.deepEqual(coordinates[0], coordinates.at(-1), `${id}: traçado não está fechado`);
    assert.ok(Array.isArray(elevation.samples), `${id}: elevation.samples ausente`);
    assert.ok(circuit.trackLength > 3000, `${id}: comprimento inválido`);
  }
});

test("calendário referencia circuitos existentes e pontuação é decrescente", () => {
  assert.equal(new Set(CHAMPIONSHIP_CALENDAR).size, CHAMPIONSHIP_CALENDAR.length);
  for (const id of CHAMPIONSHIP_CALENDAR) assert.ok(CIRCUITS[id], `circuito desconhecido: ${id}`);
  assert.equal(CHAMPIONSHIP_POINTS.length, 10);
  for (let i = 1; i < CHAMPIONSHIP_POINTS.length; i++) {
    assert.ok(CHAMPIONSHIP_POINTS[i] < CHAMPIONSHIP_POINTS[i - 1]);
  }
});
