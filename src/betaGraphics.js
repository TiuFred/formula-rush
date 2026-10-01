// Estruturas de autódromo exclusivas da experiência 2.0.
import * as THREE from "three";
import { state } from "./state.js";
import { CORNER_NAME_SIGNS, DISTANCE_BOARD_STATIONS, TRACK_LENGTH } from "./constants.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { wrapAngle } from "./mathUtils.js";
import { addBox, makeMaterial, makeTextPanel } from "./materials.js";
import { alignedFootprintClearanceAt } from "./track.js";
export { setupBetaEnvironment, buildBetaAtmosphere } from "./betaNature.js";
import { buildInterlagosStands, buildInterlagosLandmarks, addPitCanopy } from "./interlagosStructures.js";
import {
  INTERLAGOS_BRIDGE,
  INTERLAGOS_CONTINUOUS_SPONSOR_ZONES,
  INTERLAGOS_HOARDING_STATIONS,
  INTERLAGOS_PITS,
  INTERLAGOS_STANDS,
} from "./interlagosReal.js";
import {
  BOARD,
  HOARDING,
  ROTATION_IDS,
  SponsorBoards,
  inStationRange,
  makeSponsorAtlas,
  planHoardings,
  planWallSponsors,
} from "./sponsors.js";

function addAligned(s, lane, width, height, depth, material, yOffset = 0) {
  const frame = state.track.at(s, lane);
  const mesh = addBox(width, height, depth, material, frame.p.x, frame.p.y + yOffset + height / 2, frame.p.z);
  mesh.rotation.set(-Math.asin(frame.t.y), frame.yaw, -frame.bank, "YXZ");
  return mesh;
}

function makeFenceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "#515c62";
  ctx.lineWidth = .75;
  for (let i = -128; i < 256; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 1.5);
  return texture;
}

/** Lado de fora (−1 esquerda, +1 direita) da curva que começa na estação `s`; 0 se for reta. */
function outsideOfCornerAt(s, window = 60) {
  const turn = wrapAngle(state.track.at(s + window).yaw - state.track.at(s - window).yaw);
  return Math.abs(turn) < .12 ? 0 : turn > 0 ? 1 : -1;
}

/**
 * Densidade das placas de muro: contínuas na reta dos boxes e na Subida dos
 * Boxes (onde a câmera de TV mais mostra); em blocos densos no lado de fora das
 * curvas, e esparsas no resto.
 */
function sponsorDensity(s, side) {
  if (INTERLAGOS_CONTINUOUS_SPONSOR_ZONES.some((zone) => inStationRange(s, zone, TRACK_LENGTH))) return "continuous";
  return outsideOfCornerAt(s + 20) === side ? "dense" : "sparse";
}

/** Faixa de uma placa que segue o muro: `points[k]` dá {p} nos extremos de cada trecho. */
function addStripBoard(sponsors, { points, side, bottom, height, brand }) {
  const bottoms = points.map(({ p }) => new THREE.Vector3(p.x, p.y + bottom, p.z));
  const tops = points.map(({ p }) => new THREE.Vector3(p.x, p.y + bottom + height, p.z));
  // Leitura da esquerda para a direita para quem anda na pista.
  if (side > 0) {
    bottoms.reverse();
    tops.reverse();
  }
  sponsors.strip(bottoms, tops, brand);
}

/** Painéis grandes atrás do muro nas frenagens, do lado de fora das curvas, sobre dois postes. */
function addHoardings(sponsors, postMaterial) {
  // Placas de distância ficam só à direita; os nomes das curvas podem estar dos dois lados.
  const distanceBoards = DISTANCE_BOARD_STATIONS.flatMap((s0) => [s0 - 150, s0 - 100, s0 - 50]);
  const nameSigns = CORNER_NAME_SIGNS.map(([s]) => s);
  const near = (list, s, margin) => list.some((o) => Math.abs(o - s) < HOARDING.length / 2 + margin);
  const plan = planHoardings(INTERLAGOS_HOARDING_STATIONS, {
    outsideSide: (s) => outsideOfCornerAt(s + 90, 90),
    wallOffsetAt: state.track.wallOffsetAt,
    blocked: (s, side) =>
      (side > 0 && near(distanceBoards, s, 3)) ||
      near(nameSigns, s, 6) ||
      INTERLAGOS_STANDS.some((stand) => s > stand.start - 12 && s < stand.end + 12),
  });
  for (const { s, side, offsets, brand } of plan) {
    const half = HOARDING.length / 2;
    const points = offsets.map((offset, k) =>
      state.track.at(s - half + (HOARDING.length * k) / HOARDING.segments, side * (offset + HOARDING.setback)));
    addStripBoard(sponsors, { points, side, bottom: HOARDING.clearance, height: HOARDING.height, brand });
    for (const along of [-half + .5, half - .5]) {
      const offset = offsets[along < 0 ? 0 : HOARDING.segments];
      addAligned(s + along, side * (offset + HOARDING.setback + .1), .14, HOARDING.clearance + HOARDING.height, .14, postMaterial);
    }
  }
  return plan.length;
}

/** Placas coladas ao muro: seguem a curva do muro em `BOARD.segments` trechos. */
function addWallBoards(sponsors) {
  const { length, segments, height } = BOARD;
  const plan = planWallSponsors(TRACK_LENGTH, state.track.wallOffsetAt, { density: sponsorDensity });
  for (const { s, side, offsets, brand } of plan) {
    // 4 cm à frente do muro (lado da pista) para não brigar com a profundidade dele.
    const points = offsets.map((offset, k) => state.track.at(s + (length * k) / segments, side * (offset - .04)));
    addStripBoard(sponsors, { points, side, bottom: .08, height, brand });
  }
  return plan.length;
}

/** Funde os painéis do alambrado numa só malha (mesmo material, sombras como antes). */
function mergeFencePanels(panels, material) {
  if (panels.length < 2) return;
  state.scene.updateMatrixWorld(true);
  const parts = panels.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  const merged = new THREE.Mesh(mergeGeometries(parts), material);
  merged.name = "catch-fence";
  merged.castShadow = true;
  merged.receiveShadow = true;
  merged.userData.keepSeparate = true;
  state.scene.add(merged);
  for (const mesh of panels) {
    mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const part of parts) part.dispose();
}

/** Detalhes de autódromo: alambrado, marcas de frenagem, público e câmeras. */
export function buildBetaTrackDetails(rng) {
  const sponsors = new SponsorBoards();
  let pitBoard = 0;
  const pitAligned = (s, lane, ...args) => addAligned(s, -lane, ...args);
  const concrete = makeMaterial("#babcb7", { roughness: .92 });
  const glass = makeMaterial("#344c5b", { metalness: .65, roughness: .2 });
  const garage = makeMaterial("#292f34", { roughness: .9 });
  const pitRoad = makeMaterial("#5b6062", { roughness: .93 });
  const paint = makeMaterial("#e4dba9");
  const trim = makeMaterial("#2d5750", { roughness: .6 });
  // Módulos abertos de boxes, piso superior envidraçado e cobertura leve.
  // Extensão real (OSM): do fim do centro de controle até a saída dos boxes no S do Senna.
  for (let s = INTERLAGOS_PITS.from; s <= INTERLAGOS_PITS.to; s += 20) {
    if (alignedFootprintClearanceAt(state.track, s, -30, 17, 20) < 2) continue;
    // Deixa passar a rampa da passarela, que desce até o chão deste lado.
    if (Math.abs(s - INTERLAGOS_BRIDGE.s) < 12) continue;
    pitAligned(s, 30, 15, .3, 20, concrete, -.2);
    pitAligned(s, 37, .4, 6.8, 20, concrete);
    pitAligned(s, 30, 15, .28, 20, concrete, 3.9);
    pitAligned(s, 22.7, .12, 2.1, 19.2, glass, 4.3);
    addPitCanopy(s, -30);
    if (alignedFootprintClearanceAt(state.track, s, -16, 10, 20) > .5) {
      pitAligned(s, 16, 10, .025, 20, pitRoad, .12);
      pitAligned(s, 20.5, .12, .03, 20, paint, .15);
    }
    pitAligned(s, 22.4, .3, .34, 20, trim, 3.7);
    // Faixa de patrocinador sobre cada vão de garagem (um por lado do pilar central).
    for (const delta of [-4.85, 4.85]) {
      const brand = ROTATION_IDS[(pitBoard++ * 7 + 3) % ROTATION_IDS.length];
      const at = (k) => state.track.at(s + delta + (k - 1) * 3.7, -22.1).p;
      const bottoms = [0, 1, 2].map((k) => at(k).clone().setY(at(k).y + 2.45));
      sponsors.strip(bottoms, bottoms.map((p) => p.clone().setY(p.y + 1.2)), brand);
    }
    for (const delta of [-9.7, 0, 9.7]) {
      pitAligned(s + delta, 22.9, .35, 6.8, .25, concrete);
      pitAligned(s + delta, 30, 14, 3.9, .15, garage);
    }
    pitAligned(s, 35, .1, 3.6, 19.3, garage);
  }

  // Centro de controle envidraçado no início do complexo dos boxes (OSM: s −64…−21, lane −52…−19).
  const control = INTERLAGOS_PITS.controlCenter;
  const controlLane = -control.lane;
  if (alignedFootprintClearanceAt(state.track, control.s, control.lane, control.depth, control.length) >= 3) {
    pitAligned(control.s, controlLane, control.depth, 4, control.length, concrete);
    for (let floor = 0; floor < 3; floor++) {
      pitAligned(control.s, controlLane, control.depth, 2.5, control.length, glass, 4 + floor * 2.8);
      pitAligned(control.s, controlLane, control.depth + .4, .2, control.length + .3, concrete, 6.5 + floor * 2.8);
    }
    const sign = makeTextPanel("AUTÓDROMO JOSÉ CARLOS PACE", 22, 1.2, "#173c35", "#f0ebd9");
    const frame = state.track.at(control.s, control.lane + control.depth / 2 + .1);
    sign.position.copy(frame.p); sign.position.y += 4;
    sign.rotation.y = frame.yaw - Math.PI / 2;
    state.scene.add(sign);
  }

  const fence = new THREE.MeshStandardMaterial({
    map: makeFenceTexture(),
    transparent: true,
    alphaTest: .18,
    side: THREE.DoubleSide,
    metalness: .72,
    roughness: .42,
  });
  const post = makeMaterial("#777f80", { metalness: .75, roughness: .38 });
  // Alambrado de proteção em frente às arquibancadas e na reta dos boxes. Os painéis
  // são fundidos numa só malha: com textura o mesclador geral os deixaria como
  // centenas de chamadas de desenho.
  const fencePanels = [];
  const fenceFrom = Math.min(-700, ...INTERLAGOS_STANDS.map((stand) => stand.start - 20));
  const fenceTo = Math.max(470, ...INTERLAGOS_STANDS.map((stand) => stand.end + 20));
  for (let s = fenceFrom; s <= fenceTo; s += 18) {
    for (const side of [-1, 1]) {
      const offset = state.track.tracksideOffsetAt(s, side, .55);
      const lane = side * offset;
      if (alignedFootprintClearanceAt(state.track, s, lane, .035, 18.15) <= .05) continue;
      fencePanels.push(addAligned(s, lane, .035, 4.8, 18.15, fence, .05));
      addAligned(s, side * offset, .09, 5.1, .12, post, .05);
    }
  }
  mergeFencePanels(fencePanels, fence);

  const rubber = makeMaterial("#111315", { roughness: .8, transparent: true, opacity: .52, depthWrite: false });
  for (const brakingZone of [255, 1085, 2215, 2920, 3655]) {
    for (let i = 0; i < 15; i++) {
      const s = brakingZone - 100 + i * 6.2;
      const direction = state.track.at(s + 50).yaw - state.track.at(s + 15).yaw;
      const bias = -Math.sign(Math.sin(direction)) * Math.min(1.5, Math.abs(direction) * 2.2);
      for (const lane of [bias - 1.18, bias + 1.18]) {
        addAligned(s, lane + (rng() - .5) * .16, .18 + rng() * .08, .012, 6.5 + rng() * 2.5, rubber, .155);
      }
    }
  }

  buildInterlagosStands(rng, sponsors);
  buildInterlagosLandmarks(sponsors);
  addWallBoards(sponsors);
  addHoardings(sponsors, post);
  state.scene.add(sponsors.build(makeSponsorAtlas(state.renderer?.capabilities.getMaxAnisotropy() ?? 4)));

  const cameraMaterial = makeMaterial("#22282b", { metalness: .65, roughness: .3 });
  for (const s of [420, 1340, 2460, 3480]) {
    const side = Math.floor(s / 1000) % 2 ? -1 : 1;
    const lane = side * state.track.tracksideOffsetAt(s, side, 2.2);
    addAligned(s, lane, .15, 4.3, .15, post);
    const camera = addAligned(s, lane, .65, .35, .9, cameraMaterial, 4.05);
    camera.rotation.y += side * .35;
  }
}
