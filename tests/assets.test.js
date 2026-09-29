import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CIRCUITS, applyCircuitProfile } from "../src/circuits.js";
import {
  APEX_GRASS_PATCHES,
  CHAMPIONSHIP_CALENDAR,
  CHAMPIONSHIP_POINTS,
  ZEBRA_ZONES,
} from "../src/constants.js";
import {
  asphaltClearanceAt,
  buildTrackModel,
  createSafeTracksideOffset,
  trackHalfWidthAt,
} from "../src/track.js";

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

test("asfalto ampliado mantém corredor livre em todas as pistas", async () => {
  const expectedMinimumHalfWidth = {
    interlagos: 6.65,
    monza: 7.65,
    indianapolis: 9.75,
    monaco: 5.15,
    spa: 6.55,
  };

  for (const [id, circuit] of Object.entries(CIRCUITS)) {
    applyCircuitProfile(id);
    const geo = await readPublicJson(circuit.geojsonPath);
    const elevation = await readPublicJson(circuit.elevationPath);
    const track = buildTrackModel(geo, elevation);
    const safeTracksideOffset = createSafeTracksideOffset(track, circuit.trackLength);
    let minimumHalfWidth = Infinity;
    let minimumWallClearance = Infinity;
    let minimumWallToAnyAsphalt = Infinity;
    let minimumOtherLegClearance = Infinity;

    for (let s = 0; s < circuit.trackLength; s += 5) {
      minimumHalfWidth = Math.min(minimumHalfWidth, trackHalfWidthAt(s));
      for (const side of [-1, 1]) {
        const wallClearance = safeTracksideOffset(s, side) - trackHalfWidthAt(s);
        minimumWallClearance = Math.min(minimumWallClearance, wallClearance);
        const wall = track.at(s, side * safeTracksideOffset(s, side)).p;
        minimumWallToAnyAsphalt = Math.min(
          minimumWallToAnyAsphalt,
          asphaltClearanceAt(track, wall.x, wall.z),
        );
      }
    }

    // Confere também o meio de cada face do muro contínuo; assim o teste
    // cobre o segmento renderizado, não apenas seus pontos de controle.
    for (let s = 0; s < circuit.trackLength; s += 2) {
      for (const side of [-1, 1]) {
        const a = track.at(s, side * safeTracksideOffset(s, side)).p;
        const s1 = Math.min(s + 2, circuit.trackLength);
        const b = track.at(s1, side * safeTracksideOffset(s1, side)).p;
        minimumWallToAnyAsphalt = Math.min(
          minimumWallToAnyAsphalt,
          asphaltClearanceAt(track, (a.x + b.x) / 2, (a.z + b.z) / 2),
        );
      }
    }

    // Compara trechos separados por pelo menos 80 m de percurso. Isso pega
    // pernas vizinhas de hairpins sem confundir pontos contíguos da curva.
    for (let i = 0; i < track.samples.length; i += 4) {
      for (let j = i + 1; j < track.samples.length; j += 4) {
        const arc = Math.min((j - i) * track.step, circuit.trackLength - (j - i) * track.step);
        if (arc < 80) continue;
        const distance = Math.hypot(
          track.samples[i].x - track.samples[j].x,
          track.samples[i].z - track.samples[j].z,
        );
        const asphaltGap = distance - trackHalfWidthAt(i * track.step) - trackHalfWidthAt(j * track.step);
        minimumOtherLegClearance = Math.min(minimumOtherLegClearance, asphaltGap);
      }
    }

    assert.ok(
      minimumHalfWidth >= expectedMinimumHalfWidth[id] - 1e-9,
      `${id}: asfalto abaixo da nova largura mínima`,
    );
    assert.ok(minimumWallClearance >= 0.2 - 1e-9, `${id}: muro invade o próprio asfalto`);
    assert.ok(minimumWallToAnyAsphalt > 0.05, `${id}: muro invade outra perna do asfalto`);
    assert.ok(minimumOtherLegClearance > 1.5, `${id}: duas pernas do asfalto se sobrepõem`);

    // Zebras de escape são caixas baixas e compridas; confere os quatro
    // cantos contra qualquer perna da pista, inclusive o Bus Stop de Spa.
    for (const [start, end, side] of ZEBRA_ZONES) {
      for (let s = start; s < end; s += 8) {
        const width = safeTracksideOffset(s, side) - trackHalfWidthAt(s) - 3;
        if (width <= 0) continue;
        const lane = side * (trackHalfWidthAt(s) + 2 + width / 2);
        const frame = track.at(s, lane);
        for (const lateral of [-width / 2, width / 2]) {
          for (const longitudinal of [-4.05, 4.05]) {
            const x = frame.p.x + frame.right.x * lateral + frame.t.x * longitudinal;
            const z = frame.p.z + frame.right.z * lateral + frame.t.z * longitudinal;
            assert.ok(asphaltClearanceAt(track, x, z) > 0, `${id}: zebra invade o asfalto`);
          }
        }
      }
    }

    // As manchas decorativas junto ao ápice também têm volume físico. Seus
    // cantos devem permanecer fora do asfalto mesmo nas curvas mais fechadas.
    for (const s of APEX_GRASS_PATCHES) {
      for (let i = -3; i <= 3; i++) {
        const station = s + i * 2.5;
        const asphalt = trackHalfWidthAt(station);
        const available = safeTracksideOffset(station, 1) - asphalt;
        const width = Math.min(1.5, available - 1);
        if (width <= 0) continue;
        const frame = track.at(station, asphalt + .5 + width / 2);
        for (const lateral of [-width / 2, width / 2]) {
          for (const longitudinal of [-1.1, 1.1]) {
            const x = frame.p.x + frame.right.x * lateral + frame.t.x * longitudinal;
            const z = frame.p.z + frame.right.z * lateral + frame.t.z * longitudinal;
            assert.ok(asphaltClearanceAt(track, x, z) > 0, `${id}: detalhe de ápice invade o asfalto`);
          }
        }
      }
    }
  }
});
