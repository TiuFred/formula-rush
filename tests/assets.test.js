import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CIRCUITS, applyCircuitProfile } from "../src/circuits.js";
import {
  APEX_GRASS_PATCHES,
  CHAMPIONSHIP_CALENDAR,
  CHAMPIONSHIP_POINTS,
  DISTANCE_BOARD_STATIONS,
  SCENERY,
  ZEBRA_ZONES,
} from "../src/constants.js";
import {
  alignedFootprintClearanceAt,
  asphaltClearanceAt,
  buildTrackModel,
  createSafeTracksideOffset,
  trackHalfWidthAt,
} from "../src/track.js";
import { CIRCUIT_IDS } from "../src/validation.js";

async function readPublicJson(relativePath) {
  const url = new URL("../public/" + relativePath.replace(/^\.\//, ""), import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

test("experiência 2.0 mantém entrada e texturas próprias", async () => {
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(index, /id="startBeta"/);
  assert.match(index, /FORMULA RUSH 2\.0/);

  for (const filename of ["asphalt-albedo.jpg", "grass-albedo.jpg"]) {
    const asset = await readFile(new URL("../public/assets/beta/" + filename, import.meta.url));
    assert.ok(asset.length > 100_000, `${filename}: textura beta ausente ou pequena demais`);
    assert.deepEqual([...asset.subarray(0, 2)], [0xff, 0xd8], `${filename}: JPEG inválido`);
  }
});

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.z > z) !== (b.z > z)) &&
        x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
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
  assert.deepEqual([...CIRCUIT_IDS].sort(), Object.keys(CIRCUITS).sort());
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
    redBullRing: 6.8,
    miami: 6.05,
    yasMarina: 6.9,
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
    let minimumAsphaltEdgeAdvance = Infinity;

    for (let s = 0; s < circuit.trackLength; s += 5) {
      minimumHalfWidth = Math.min(minimumHalfWidth, trackHalfWidthAt(s));
      for (const side of [-1, 1]) {
        const wallClearance = safeTracksideOffset(s, side) - trackHalfWidthAt(s);
        minimumWallClearance = Math.min(minimumWallClearance, wallClearance);
        const wall = track.at(s, side * safeTracksideOffset(s, side)).p;
        const renderedClearance = asphaltClearanceAt(track, wall.x, wall.z);
        if (renderedClearance > .05) {
          minimumWallToAnyAsphalt = Math.min(minimumWallToAnyAsphalt, renderedClearance);
        }
      }
    }

    // A borda do ribbon deve sempre avançar no sentido da pista. Se a
    // projeção ficar negativa, o triângulo virou do avesso e pode desaparecer
    // por back-face culling — o antigo defeito visto em quatro hairpins.
    for (let s = 0; s < circuit.trackLength; s += 2) {
      const center = track.at(s);
      for (const side of [-1, 1]) {
        const edge = track.at(s, side * trackHalfWidthAt(s)).p;
        const nextEdge = track.at(s + 2, side * trackHalfWidthAt(s + 2)).p;
        const advance =
          (nextEdge.x - edge.x) * center.t.x +
          (nextEdge.z - edge.z) * center.t.z;
        minimumAsphaltEdgeAdvance = Math.min(minimumAsphaltEdgeAdvance, advance);
      }
    }

    // Confere também o meio de cada face do muro contínuo; assim o teste
    // cobre o segmento renderizado, não apenas seus pontos de controle.
    for (let s = 0; s < circuit.trackLength; s += 2) {
      for (const side of [-1, 1]) {
        const a = track.at(s, side * safeTracksideOffset(s, side)).p;
        const s1 = Math.min(s + 2, circuit.trackLength);
        const b = track.at(s1, side * safeTracksideOffset(s1, side)).p;
        // O renderer omite pequenos trechos do muro no centro de hairpins
        // cujo raio interno é menor que o próprio asfalto.
        if (asphaltClearanceAt(track, a.x, a.z) <= .05 ||
            asphaltClearanceAt(track, b.x, b.z) <= .05) continue;
        const midpointClearance = asphaltClearanceAt(track, (a.x + b.x) / 2, (a.z + b.z) / 2);
        if (midpointClearance <= .05) continue;
        minimumWallToAnyAsphalt = Math.min(minimumWallToAnyAsphalt, midpointClearance);
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
    assert.ok(minimumAsphaltEdgeAdvance > 0, `${id}: borda do asfalto dobra sobre si mesma`);

    // Placas de curva são largas no eixo lateral. A posição antiga usava
    // apenas 4 m de afastamento para uma placa de 9 m e invadia 50 cm da
    // pista em todos os circuitos.
    for (const [s] of circuit.cornerNameSigns) {
      const panelWidth = 9;
      const laneMagnitude = trackHalfWidthAt(s) + panelWidth / 2 + 1;
      const bestClearance = Math.max(
        alignedFootprintClearanceAt(track, s, -laneMagnitude, panelWidth, .1),
        alignedFootprintClearanceAt(track, s, laneMagnitude, panelWidth, .1),
      );
      assert.ok(bestClearance >= .95, `${id}: placa de curva invade o asfalto`);
    }

    const assertPropClear = (label, s, lane, width, depth, margin = 0) => {
      const clearance = alignedFootprintClearanceAt(track, s, lane, width, depth);
      assert.ok(clearance > margin, `${id}: ${label} invade o asfalto (${clearance.toFixed(2)} m)`);
    };

    // Audita a pegada completa dos principais volumes fixos do cenário. Isso
    // cobre não só o centro do objeto, mas suas quinas e pontos intermediários.
    for (const station of DISTANCE_BOARD_STATIONS) {
      for (const distance of [150, 100, 50]) {
        const s = station - distance;
        assertPropClear("placa de distância", s, trackHalfWidthAt(s) + 3.2, 2.1, .14);
      }
    }
    if (SCENERY.tunnel) {
      for (let s = SCENERY.tunnel[0]; s < SCENERY.tunnel[1]; s += 12) {
        for (const side of [-1, 1]) {
          assertPropClear("parede do túnel", s, side * safeTracksideOffset(s, side, .9), 1.2, 12.4);
        }
      }
    }
    if (SCENERY.pitBuilding) {
      const spacing = SCENERY.pitBoxSpacing;
      const scale = spacing / 20;
      for (let i = 0; i < 23; i++) {
        const s = circuit.trackLength + (i - 12.25) * spacing;
        assertPropClear("garagem dos boxes", s, 24, 7, 18 * scale);
        assertPropClear("prédio dos boxes", s, 30, 15, 18.8 * scale);
      }
    }
    if (SCENERY.grandstands) {
      const stations = SCENERY.grandstandStations ?? [
        90, 160, 230, circuit.trackLength - 409, circuit.trackLength - 339,
        circuit.trackLength - 269, circuit.trackLength - 199, circuit.trackLength - 129,
      ];
      for (const s of stations) {
        for (let tier = 0; tier < 5; tier++) {
          assertPropClear("arquibancada", s, -29 - tier * 3, 3, 56);
        }
      }
    }
    if (SCENERY.yasHotelStation != null) {
      for (const side of [-1, 1]) {
        assertPropClear("torre do hotel", SCENERY.yasHotelStation, side * 34, 21, 25);
      }
    }
    if (SCENERY.banners) {
      for (let s = SCENERY.banners.from; s <= SCENERY.banners.to; s += SCENERY.banners.step) {
        assertPropClear("painel publicitário", s, -safeTracksideOffset(s, -1, 2.5), 9, .1);
      }
    }

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

    if (circuit.scenery?.stadium) {
      const { x, z } = circuit.scenery.stadium;
      assert.ok(
        asphaltClearanceAt(track, x, z) > Math.hypot(218, 150) / 2 + 5,
        `${id}: estádio próximo demais do asfalto`,
      );
    }

    // Lagos e marinas não podem cobrir outra perna do circuito.
    for (const [start, end] of circuit.scenery?.harbor?.segments ?? []) {
      const pieces = Math.max(1, Math.ceil((end - start) / 40));
      for (let piece = 0; piece < pieces; piece++) {
        const s0 = start + ((end - start) * piece) / pieces;
        const s1 = start + ((end - start) * (piece + 1)) / pieces;
        const f0 = track.at(s0);
        const f1 = track.at(s1);
        const p0 = track.at(s0, -(trackHalfWidthAt(s0) + 8)).p;
        const p1 = track.at(s1, -(trackHalfWidthAt(s1) + 8)).p;
        const q0 = p0.clone().addScaledVector(f0.right, -circuit.scenery.harbor.depth);
        const q1 = p1.clone().addScaledVector(f1.right, -circuit.scenery.harbor.depth);
        for (const sample of track.samples) {
          assert.equal(
            pointInPolygon(sample.x, sample.z, [p0, p1, q1, q0]),
            false,
            `${id}: água invade o asfalto`,
          );
        }
      }
    }
  }
});
