// Construção de toda a geometria estática da pista e do cenário ao redor
// (grama, asfalto, meio-fios, guard-rails, arquibancadas, pórtico de largada,
// árvores, "morros" de fundo) + otimizações (mescla de meshes) + a linha de
// trajetória ideal. Tudo a partir do modelo de pista (track.js).
//
// Fidelidade: todas as constantes numéricas (posições, contagens, cores)
// são exatamente as do bundle original (função `dg` e auxiliares).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { state } from "./state.js";
import {
  TRACK_LENGTH, CORNER_NAME_SIGNS, DISTANCE_BOARD_STATIONS,
  ZEBRA_ZONES, APEX_GRASS_PATCHES, TRACK_NAME_PANEL_TEXT, SCENERY,
} from "./constants.js";
import {
  alignedFootprintClearanceAt,
  asphaltClearanceAt,
  createSafeTracksideOffset,
  trackHalfWidthAt,
  cornerWideningAt,
} from "./track.js";
import { wrapAngle } from "./mathUtils.js";
import { byId } from "./dom.js";
import { MATERIALS, makeMaterial, addMesh, addBox, makeTextPanel } from "./materials.js";
import {
  buildBetaAtmosphere,
  buildBetaTrackDetails,
  setupBetaEnvironment,
  updateBetaAtmosphere,
} from "./betaGraphics.js";

/** Escala dos elementos "de mundo" (terreno, dispersão de árvores/morros,
 * névoa, órbita da câmera do menu) em relação ao comprimento de referência
 * original (Interlagos, 4309 m) — assim um circuito mais longo (ex.: Monza)
 * ganha um cenário de fundo proporcionalmente maior. */
export function worldScale() {
  return TRACK_LENGTH / 4309;
}

/** Constrói uma faixa (ribbon) ao longo de toda a pista entre dois deslocamentos laterais. */
function buildRibbonMesh(leftOffsetFn, rightOffsetFn, material, yOffset = .02) {
  const track = state.track;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= track.N; i++) {
    const frame = track.at(i * track.step);
    [leftOffsetFn, rightOffsetFn].forEach((fn, edgeIdx) => {
      const offset = typeof fn === "function" ? fn(i * track.step) : fn;
      const p = frame.p.clone().addScaledVector(frame.right, offset);
      const yOff = Array.isArray(yOffset) ? yOffset[edgeIdx] : yOffset;
      positions.push(p.x, p.y + yOff, p.z);
      uvs.push(offset / 5, (i * track.step) / 5);
    });
    if (i < track.N) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(geometry, material);
}

/** Parede vertical contínua que acompanha a curva sem os cortes de caixas longas. */
function buildTrackWallMesh(side, offsetAt, height, material) {
  const positions = [];
  const step = 2;
  for (let s = 0; s < TRACK_LENGTH; s += step) {
    const s1 = Math.min(s + step, TRACK_LENGTH);
    const aOffset = offsetAt(s, side);
    const bOffset = offsetAt(s1, side);
    if (aOffset == null || bOffset == null) continue;
    const a = state.track.at(s, side * aOffset);
    const b = state.track.at(s1, side * bOffset);
    if (asphaltClearanceAt(state.track, (a.p.x + b.p.x) / 2, (a.p.z + b.p.z) / 2) <= .05) continue;
    positions.push(
      a.p.x, a.p.y - .2, a.p.z,
      b.p.x, b.p.y - .2, b.p.z,
      b.p.x, b.p.y + height, b.p.z,
      a.p.x, a.p.y - .2, a.p.z,
      b.p.x, b.p.y + height, b.p.z,
      a.p.x, a.p.y + height, a.p.z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  addMesh(geometry, material);
}

/** Cria uma caixa alinhada ao traçado (posição+orientação) na estação `s`/pista lateral `lane`. */
export function addAlignedBox(s, lane, w, h, d, material, yOffset = 0) {
  const frame = state.track.at(s, lane);
  const mesh = addBox(w, h, d, material, frame.p.x, frame.p.y + yOffset + h / 2, frame.p.z);
  mesh.rotation.set(-Math.asin(frame.t.y), frame.yaw, -frame.bank, "YXZ");
  return mesh;
}

/** Gera uma textura de asfalto ruidosa (PRNG determinístico) e aplica ao material da pista. */
function generateAsphaltTexture(renderer, groundMaterial) {
  if (MATERIALS.road.map) MATERIALS.road.map.dispose(); // textura de uma troca de circuito anterior
  MATERIALS.road.map = null;
  MATERIALS.road.bumpMap = null;

  if (state.graphicsBeta) {
    const loader = new THREE.TextureLoader();
    const configure = (texture, repeatX, repeatY) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
      return texture;
    };
    const asphalt = configure(loader.load("./assets/beta/asphalt-albedo.jpg"), 1, 1);
    const grass = configure(loader.load("./assets/beta/grass-albedo.jpg"), 95, 95);
    MATERIALS.road.map = asphalt;
    MATERIALS.road.bumpMap = asphalt;
    MATERIALS.road.bumpScale = .055;
    MATERIALS.road.color.set("#d8d8d5");
    MATERIALS.road.roughness = .9;
    MATERIALS.road.metalness = 0;
    MATERIALS.road.needsUpdate = true;
    groundMaterial.map = grass;
    groundMaterial.bumpMap = grass;
    groundMaterial.bumpScale = .16;
    groundMaterial.roughness = 1;
    groundMaterial.needsUpdate = true;
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#4a5053";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 123;
  for (let i = 0; i < 8500; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 256;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 256;
    ctx.fillStyle = i % 2 ? "#545a5d" : "#414749";
    ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  MATERIALS.road.map = texture;
  MATERIALS.road.bumpMap = null;
  MATERIALS.road.bumpScale = 0;
  MATERIALS.road.color.set("#c7cdce");
  MATERIALS.road.roughness = .82;
  MATERIALS.road.needsUpdate = true;
}

/** Empurra um quadrilátero colorido (2 triângulos) entre as estações s0 e s1. Usado por meio-fios e linha de trajetória. */
function pushCurbQuad(positions, colors, s0, s1, innerOffsetFn, outerOffsetFn, color, yOffset) {
  const frames = [state.track.at(s0), state.track.at(s1)];
  const corners = [];
  for (const [frame, s] of [[frames[0], s0], [frames[1], s1]]) {
    for (const offset of [innerOffsetFn(s), outerOffsetFn(s)]) {
      const p = frame.p.clone().addScaledVector(frame.right, offset);
      p.y += yOffset;
      corners.push(p);
    }
  }
  for (const i of [0, 1, 2, 1, 3, 2]) {
    positions.push(corners[i].x, corners[i].y, corners[i].z);
    colors.push(color.r, color.g, color.b);
  }
}

function buildVertexColoredMesh(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return addMesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

/** Meio-fios (curbs) coloridos nas curvas — omitidos nos trechos retos. */
function buildCurbsMesh() {
  const positions = [];
  const colors = [];
  for (let s = 0; s < TRACK_LENGTH; s += 2) {
    if (Math.abs(wrapAngle(state.track.at(s + 7).yaw - state.track.at(s - 7).yaw)) < .012) continue;
    const palette = state.graphicsBeta ? ["#f2f0e8", "#b91f2e"] : ["#d9e8d6", "#d3e93e", "#268d64"];
    const color = new THREE.Color(palette[Math.floor(s / 4) % palette.length]);
    for (const side of [-1, 1]) {
      const inner = (x) => side * (trackHalfWidthAt(x) + .1);
      const outer = (x) => side * (trackHalfWidthAt(x) + 1.15);
      pushCurbQuad(positions, colors, s, Math.min(s + 2, TRACK_LENGTH), side > 0 ? inner : outer, side > 0 ? outer : inner, color, .13);
    }
  }
  buildVertexColoredMesh(positions, colors);
}

/** Linha de trajetória ideal (racing line), colorida por severidade da curva à frente. */
function buildRacingLineMesh() {
  const positions = [];
  const colors = [];
  for (let s = 0; s < TRACK_LENGTH; s += 13) {
    const a = state.track.at(s + 24);
    const b = state.track.at(s + 54);
    const turnAngle = Math.abs(wrapAngle(b.yaw - a.yaw));
    const color = new THREE.Color(turnAngle > .65 ? "#f49d5a" : turnAngle > .22 ? "#d9d86c" : "#97cb9a");
    const bias = -Math.sign(wrapAngle(b.yaw - a.yaw)) * Math.min(1.6, turnAngle * 2);
    pushCurbQuad(positions, colors, s, s + 5, () => bias - .15, () => bias + .15, color, .155);
  }
  state.racingLineMesh = buildVertexColoredMesh(positions, colors);
  state.racingLineMesh.material.transparent = true;
  state.racingLineMesh.material.opacity = .75;
  state.racingLineMesh.material.depthWrite = false;
  state.racingLineMesh.visible = byId("racingLine").getAttribute("aria-pressed") === "true";
}

/**
 * Torres de holofote ao longo da pista, só na corrida noturna — alternando
 * de lado a cada ~70m. O "cabeçote" usa MeshBasicMaterial (sempre "aceso",
 * não depende de luz de cena) em vez de uma luz dinâmica de verdade: com 23
 * carros já na cena, dezenas de THREE.Light reais custariam caro demais
 * pra um efeito que é só decorativo.
 */
function buildFloodlights() {
  const lampMaterial = new THREE.MeshBasicMaterial({ color: "#fff6d8" });
  for (let s = 0; s < TRACK_LENGTH; s += 70) {
    const side = Math.floor(s / 70) % 2 ? -1 : 1;
    const offset = side * state.track.tracksideOffsetAt(s, side, 9);
    const frame = state.track.at(s, offset);
    const tower = new THREE.Group();
    tower.position.copy(frame.p);
    tower.rotation.y = frame.yaw;
    state.scene.add(tower);
    addMesh(new THREE.CylinderGeometry(.35, .5, 16, 6), MATERIALS.metal, 0, 8, 0, tower);
    for (let i = -1; i <= 1; i++) {
      addBox(1.6, 1, .3, lampMaterial, i * 1.8, 16, -side * .6, tower);
    }
  }
}

/**
 * Elementos decorativos adicionais: zebras de escape, placas de distância,
 * placas com nome de curva, placa com o nome do circuito, grid de largada
 * numerado e arquibancadas (assentos instanciados). As listas de curvas
 * nomeadas/zebras/placas vêm do perfil do circuito ativo (constants.js) —
 * um circuito sem essas listas afinadas (ex.: Monza) simplesmente não
 * desenha esses detalhes específicos, mas mantém todo o resto.
 */
function buildTrackDecorations() {
  const sandBase = makeMaterial("#b6b49a");
  const sandDark = makeMaterial("#59685c");
  const gridPaint = makeMaterial("#507775", { metalness: .45, roughness: .28 });

  // Zebras de escape (run-off) em curvas específicas do circuito ativo.
  for (const [start, end, side] of ZEBRA_ZONES) {
    for (let s = start; s < end; s += 8) {
      const safeRunoff = state.track.tracksideOffsetAt(s, side) - trackHalfWidthAt(s);
      const width = safeRunoff - 3;
      if (width <= 0) continue;
      addAlignedBox(s, side * (trackHalfWidthAt(s) + 2 + width / 2), width, .08, 8.1, sandBase, -.12);
    }
  }

  // Placas de distância (100/150/200... até a curva) antes de curvas famosas.
  for (const s0 of DISTANCE_BOARD_STATIONS) {
    for (const distance of [150, 100, 50]) {
      const s = s0 - distance;
      const frame = state.track.at(s, trackHalfWidthAt(s) + 3.2);
      const panel = makeTextPanel(String(distance), 2.1, 1.6, "#f3f5e7", "#152723");
      panel.position.copy(frame.p);
      panel.position.y += 2.1;
      panel.rotation.y = frame.yaw + Math.PI;
      state.scene.add(panel);
      addAlignedBox(s, trackHalfWidthAt(s) + 3.2, .14, 1.5, .14, MATERIALS.metal);
    }
  }

  // Placas com o nome das curvas famosas.
  for (const [s, name] of CORNER_NAME_SIGNS) {
    const panelWidth = 9;
    const panelClearance = 1;
    const laneMagnitude = trackHalfWidthAt(s) + panelWidth / 2 + panelClearance;
    // Prefere o lado esquerdo tradicional, mas troca de lado quando outra
    // perna próxima do circuito ocuparia aquele espaço (Grand Hotel, Mônaco).
    const lane = [-laneMagnitude, laneMagnitude].find((candidate) =>
      alignedFootprintClearanceAt(state.track, s, candidate, panelWidth, .1) >= panelClearance - .05
    );
    if (lane == null) continue;
    const frame = state.track.at(s, lane);
    const panel = makeTextPanel(name, 9, 1.4);
    panel.position.copy(frame.p);
    panel.position.y += 2.8;
    panel.rotation.y = frame.yaw + Math.PI;
    state.scene.add(panel);
  }

  // Placa com o nome do circuito, na reta dos boxes.
  const namePanel = makeTextPanel(TRACK_NAME_PANEL_TEXT, 18, 1.5, "#142722", "#ddfa58");
  const startFrame = state.track.at(20);
  namePanel.position.copy(startFrame.p);
  namePanel.position.y += 8;
  namePanel.position.z -= .1;
  namePanel.rotation.y = startFrame.yaw + Math.PI;
  state.scene.add(namePanel);

  // Grid de largada numerado (23 posições marcadas no asfalto). O espaço entre
  // boxes (`SCENERY.pitBoxSpacing`) é 20 m nos autódromos grandes; Mônaco tem
  // uma reta dos boxes curta e usa boxes bem mais juntos (as dimensões ao
  // longo da pista escalam junto, `k`).
  if (SCENERY.pitBuilding) {
    const spacing = SCENERY.pitBoxSpacing;
    const k = spacing / 20;
    for (let i = 0; i < 23; i++) {
      const s = TRACK_LENGTH + (i - 12.25) * spacing;
      addAlignedBox(s, 24, 7, .08, 18 * k, MATERIALS.road, .06);
      addAlignedBox(s, 22.1, .18, .12, 8 * k, MATERIALS.white, .15);
      addAlignedBox(s, 26, 6, 1.5, 16 * k, gridPaint, 5.4);
      const numberFrame = state.track.at(s, 22);
      const numberPanel = makeTextPanel(String(i + 1).padStart(2, "0"), 3, .8);
      numberPanel.position.copy(numberFrame.p);
      numberPanel.position.y += 4.3;
      numberPanel.rotation.y = numberFrame.yaw + Math.PI / 2;
      state.scene.add(numberPanel);
    }
  }

  if (SCENERY.grandstands) {
    // Arquibancadas: assentos instanciados (720 assentos, 5 cores alternadas).
    // As 8 estações são relativas ao comprimento da pista (perto do início E
    // do fim da volta — que, no traçado circular, é a mesma linha de largada).
    const grandstandStations = GRANDSTAND_STATIONS();
    const seatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.44, .75, .4), makeMaterial("#eeefe0"), 720);
    let seatIndex = 0;
    const dummy = new THREE.Object3D();
    for (const s0 of grandstandStations) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 18; col++) {
          const frame = state.track.at(s0 - 25 + col * 2.8, -29 - row * 3);
          dummy.position.copy(frame.p);
          dummy.position.y += row * 1.25 + 1.45;
          dummy.rotation.y = frame.yaw;
          dummy.updateMatrix();
          seatMesh.setMatrixAt(seatIndex, dummy.matrix);
          const palette = SCENERY.seatColors ?? ["#d6ea55", "#f0e7d6", "#349e8e", "#293d62", "#eac170"];
          seatMesh.setColorAt(seatIndex, new THREE.Color(palette[(seatIndex * 7 + row) % palette.length]));
          seatIndex++;
        }
      }
    }
    seatMesh.instanceMatrix.needsUpdate = true;
    state.scene.add(seatMesh);
  }

  // Manchas de grama pintada perto de algumas curvas (detalhe visual extra).
  for (const s of APEX_GRASS_PATCHES) {
    for (let i = -3; i <= 3; i++) {
      const station = s + i * 2.5;
      const asphalt = trackHalfWidthAt(station);
      const available = state.track.tracksideOffsetAt(station, 1) - asphalt;
      const width = Math.min(1.5, available - 1);
      if (width <= 0) continue;
      const lane = asphalt + .5 + width / 2;
      addAlignedBox(station, lane, width, 1.4, 2.2, i % 2 ? MATERIALS.green : sandDark, 0);
    }
  }
}

/** Mescla meshes estáticos sem textura que compartilham material, reduzindo draw calls. */
function mergeStaticMeshesByMaterial() {
  const groups = new Map();
  state.scene.updateMatrixWorld(true);
  state.scene.traverse((mesh) => {
    if (mesh.isMesh && !mesh.isInstancedMesh && !Array.isArray(mesh.material) && !mesh.material.map) {
      let list = groups.get(mesh.material);
      if (!list) groups.set(mesh.material, (list = []));
      list.push(mesh);
    }
  });
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      return geo;
    });
    const totalVerts = geometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    let offset = 0;
    for (const geo of geometries) {
      positions.set(geo.attributes.position.array, offset);
      normals.set(geo.attributes.normal.array, offset);
      offset += geo.attributes.position.array.length;
      geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    addMesh(merged, material);
    for (const mesh of meshes) {
      mesh.parent.remove(mesh);
      mesh.geometry.dispose();
    }
  }
}

/**
 * Estações (m) das arquibancadas: por padrão as 3 logo depois da linha e as 5
 * antes dela — pensado pra uma reta dos boxes longa e limpa como a de
 * Interlagos. Circuitos com curva/chicane perto da linha (Spa: o Bus Stop
 * fica a ~340 m antes dela) definem `scenery.grandstandStations`.
 */
function GRANDSTAND_STATIONS() {
  return SCENERY.grandstandStations ?? [90, 160, 230, TRACK_LENGTH - 409, TRACK_LENGTH - 339, TRACK_LENGTH - 269, TRACK_LENGTH - 199, TRACK_LENGTH - 129];
}

/** `true` se (x, z) cai dentro do polígono (lista de pontos {x, z}) — teste de raio par/ímpar. */
function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Postes de iluminação de rua ao longo da pista (só em circuito de rua): um
 * a cada ~40 m, alternando os lados, sobre o muro. A luminária é MeshBasicMaterial
 * (sempre "acesa") — de dia é só um detalhe, de noite é o que dá cara de
 * Monte Carlo à noite.
 */
function buildStreetLamps() {
  const poleMaterial = makeMaterial("#33363a");
  const lampMaterial = new THREE.MeshBasicMaterial({ color: "#fff2c4" });
  const tunnel = SCENERY.tunnel;
  for (let s = 10; s < TRACK_LENGTH; s += 40) {
    if (tunnel && s > tunnel[0] - 10 && s < tunnel[1] + 10) continue;
    const side = Math.floor(s / 40) % 2 ? -1 : 1;
    const offset = side * state.track.tracksideOffsetAt(s, side, .8);
    addAlignedBox(s, offset, .18, 7, .18, poleMaterial, -.2);
    addAlignedBox(s, offset - side * .6, .9, .22, .5, lampMaterial, 6.7);
  }
}

/**
 * Túnel (Mônaco, sob o hotel): paredes escuras dos dois lados + teto, com
 * uma fileira de luminárias amarelas emissivas no teto. Pura decoração —
 * a física da pista não muda, e o teto fica alto o bastante (7 m) pra câmera
 * de perseguição passar por baixo sem cortar a cena.
 */
function buildTunnel(from, to) {
  const wallMaterial = makeMaterial("#3b3d40");
  const ceilingMaterial = makeMaterial("#2a2c2f");
  const lampMaterial = new THREE.MeshBasicMaterial({ color: "#ffd66b" });
  for (let s = from; s < to; s += 12) {
    const leftEdge = state.track.tracksideOffsetAt(s, -1, .9);
    const rightEdge = state.track.tracksideOffsetAt(s, 1, .9);
    addAlignedBox(s, -leftEdge, 1.2, 9, 12.4, wallMaterial, -.2);
    addAlignedBox(s, rightEdge, 1.2, 9, 12.4, wallMaterial, -.2);
    addAlignedBox(s, (rightEdge - leftEdge) / 2, leftEdge + rightEdge + 2.4, 1, 12.4, ceilingMaterial, 7.6);
    if (Math.floor(s / 12) % 2 === 0) addAlignedBox(s, 0, 1.4, .2, 3, lampMaterial, 7.35);
  }
}

/**
 * Quarteirões de Mônaco: prédios de cores mediterrâneas (creme, ocre, rosado)
 * com telhado vermelho fino, espalhados por toda a volta a partir de 40 m do
 * centro da pista (depois de calçada + muro), nunca dentro d'água. Prédios
 * com pegada de 12–28 m e 12–58 m de altura, levemente girados junto com a
 * rua pra não parecer caixa alinhada ao mundo.
 */
function buildCityBlocks(rng, groundHeightAt, inWater, waterY) {
  const walls = ["#e8dcc4", "#d9c3a0", "#efe6d6", "#c9d6d9", "#e3b98e", "#f1d9c6"].map((c) => makeMaterial(c));
  const roofMaterial = makeMaterial("#a4553f");
  const placed = [];
  let attempts = 0;
  while (placed.length < 640 && attempts++ < 14000) {
    const s = rng() * TRACK_LENGTH;
    const side = rng() < .5 ? -1 : 1;
    const lateral = trackHalfWidthAt(s) + cornerWideningAt(s, side) + 26 + rng() * rng() * 190;
    const frame = state.track.at(s, side * lateral);
    const { x, z } = frame.p;
    if (asphaltClearanceAt(state.track, x, z) < 28) continue;
    if (inWater(x, z)) continue;
    const base = groundHeightAt(x, z);
    if (base < waterY + 1) continue;
    if (placed.some((b) => Math.hypot(b.x - x, b.z - z) < 18)) continue;
    const w = 12 + rng() * 16;
    const d = 12 + rng() * 16;
    const h = 12 + rng() * rng() * 46;
    const yaw = frame.yaw + (rng() - .5) * .3;
    const body = addBox(w, h + 3, d, walls[Math.floor(rng() * walls.length)], x, base - 1.5 + (h + 3) / 2, z);
    body.rotation.y = yaw;
    const roof = addBox(w + .8, .9, d + .8, roofMaterial, x, base - 1.5 + h + 3.45, z);
    roof.rotation.y = yaw;
    placed.push({ x, z });
  }
}

/**
 * Floresta das Ardenas: milhares de pinheiros (troncos + duas camadas de copa)
 * como InstancedMesh — um draw call por camada em vez de milhares — em volta de
 * toda a pista, mais densos junto às bordas. A base de cada árvore segue a altura
 * do terreno (não a da pista, que fica ~5 m acima).
 */
function buildForest(rng, scale, groundHeightAt) {
  const COUNT = 2600;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .75, 1, 5), makeMaterial("#4b3d2f"), COUNT);
  const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), makeMaterial("#ffffff"), COUNT);
  const upper = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), makeMaterial("#ffffff"), COUNT);
  const dummy = new THREE.Object3D();
  const greens = ["#2f5d3b", "#356a41", "#28503a", "#3c7247"].map((c) => new THREE.Color(c));
  let n = 0;
  let attempts = 0;
  while (n < COUNT && attempts++ < COUNT * 6) {
    const s = rng() * TRACK_LENGTH;
    const side = rng() < .5 ? -1 : 1;
    const edge = trackHalfWidthAt(s) + cornerWideningAt(s, side);
    const lateral = edge + 5 + rng() * rng() * 260 * Math.max(.6, scale);
    const frame = state.track.at(s, side * lateral);
    const { x, z } = frame.p;
    if (asphaltClearanceAt(state.track, x, z) < 12) continue;
    const base = groundHeightAt(x, z) - .3;
    const trunkH = 5 + rng() * 6;
    const crown = 7 + rng() * 6;
    const radius = 2.6 + rng() * 2.4;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, trunkH, 1);
    dummy.position.set(x, base + trunkH / 2, z);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    dummy.scale.set(radius, crown, radius);
    dummy.position.set(x, base + trunkH + crown * .35, z);
    dummy.updateMatrix();
    lower.setMatrixAt(n, dummy.matrix);
    dummy.scale.set(radius * .65, crown * .8, radius * .65);
    dummy.position.set(x, base + trunkH + crown * .85, z);
    dummy.updateMatrix();
    upper.setMatrixAt(n, dummy.matrix);
    const tint = greens[Math.floor(rng() * greens.length)];
    lower.setColorAt(n, tint);
    upper.setColorAt(n, tint);
    n++;
  }
  for (const mesh of [trunks, lower, upper]) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    state.scene.add(mesh);
  }
}

// ---- Kit de cenário dos autódromos com identidade própria ------------------

const _dummy = new THREE.Object3D();

/** Grava a instância `i` de um InstancedMesh (posição, escala, giro em Y e cor opcional). */
function setInstance(mesh, i, x, y, z, sx, sy, sz, rotY = 0, color = null) {
  _dummy.position.set(x, y, z);
  _dummy.rotation.set(0, rotY, 0);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(i, _dummy.matrix);
  if (color) mesh.setColorAt(i, color);
}

/** Fixa quantas instâncias de cada InstancedMesh valem e os adiciona à cena. */
function commitInstances(entries) {
  for (const [mesh, n] of entries) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    state.scene.add(mesh);
  }
}

/**
 * Sorteia até `count` pontos em volta da pista: `near` m depois do muro, com
 * densidade maior perto dele (`tightness` > 1 concentra) até `spread` m.
 * Rejeita o que cai na pista, em outra perna da volta ou na água, e chama
 * `place(x, z, frame, n)` pra cada ponto aceito.
 */
function scatterAlongTrack(rng, count, { near = 4, spread = 200, tightness = 2, clearance = 8, inWater = null }, place) {
  let n = 0;
  let attempts = 0;
  while (n < count && attempts++ < count * 8) {
    const s = rng() * TRACK_LENGTH;
    const side = rng() < .5 ? -1 : 1;
    const edge = trackHalfWidthAt(s) + cornerWideningAt(s, side);
    const lateral = edge + near + Math.pow(rng(), tightness) * spread;
    const frame = state.track.at(s, side * lateral);
    const { x, z } = frame.p;
    if (asphaltClearanceAt(state.track, x, z) < clearance) continue;
    const exclusion = SCENERY.stadium;
    if (exclusion && Math.hypot(x - exclusion.x, z - exclusion.z) < exclusion.exclusionRadius) continue;
    if (inWater?.(x, z)) continue;
    place(x, z, frame, n++);
  }
  return n;
}

/**
 * Interlagos / trópico paulista: palmeiras (tronco alto + copa achatada) e
 * árvores de copa redonda, com uns ipês amarelos e rosas no meio do verde.
 */
function buildTropicalVegetation(rng, scale, groundHeightAt, inWater) {
  const MAX = 1500;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.4, .6, 1, 5), makeMaterial("#6b5138"), MAX);
  const broad = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), makeMaterial("#ffffff"), MAX);
  const palms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 4), makeMaterial("#ffffff"), MAX);
  const greens = ["#3f8a3a", "#4a9a3f", "#33772f", "#58a848"].map((c) => new THREE.Color(c));
  const palmGreens = ["#2f7a34", "#3a8a3a"].map((c) => new THREE.Color(c));
  const ipeYellow = new THREE.Color("#e8c52a");
  const ipePink = new THREE.Color("#d86aa5");
  let t = 0, b = 0, p = 0;
  scatterAlongTrack(rng, MAX, { near: 5, spread: 230 * Math.max(.7, scale), tightness: 2.2, clearance: 9, inWater }, (x, z) => {
    const base = groundHeightAt(x, z) - .3;
    if (rng() < .24) {
      const h = 9 + rng() * 6;
      setInstance(trunks, t++, x, base + h / 2, z, .7 + rng() * .3, h, .7 + rng() * .3);
      setInstance(palms, p++, x, base + h + .4, z, 3.6 + rng(), 1.1, 3.6 + rng(), rng() * 6.28, palmGreens[Math.floor(rng() * 2)]);
    } else {
      const h = 3 + rng() * 3.5;
      const r = 3.4 + rng() * 2.8;
      const roll = rng();
      const color = roll < .06 ? ipeYellow : roll < .085 ? ipePink : greens[Math.floor(rng() * greens.length)];
      setInstance(trunks, t++, x, base + h / 2, z, 1, h, 1);
      setInstance(broad, b++, x, base + h + r * .55, z, r, r * .85, r, rng() * 6.28, color);
    }
  });
  commitInstances([[trunks, t], [broad, b], [palms, p]]);
}

/**
 * Bosque do Parque de Monza: árvores de folha caduca bem próximas da pista
 * (um "túnel" verde), algumas já em tons de outono.
 */
function buildWoodland(rng, scale, groundHeightAt, inWater) {
  const MAX = 3000;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .7, 1, 5), makeMaterial("#5a4634"), MAX);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), makeMaterial("#ffffff"), MAX);
  const crowns2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), makeMaterial("#ffffff"), MAX);
  const greens = ["#5d8a3c", "#6e9944", "#4f7a35", "#7aa04a"].map((c) => new THREE.Color(c));
  const autumn = ["#c9a23a", "#b8742a", "#a5872f"].map((c) => new THREE.Color(c));
  let n = 0;
  // 12 m considera também o raio máximo das copas, não apenas o tronco.
  scatterAlongTrack(rng, MAX, { near: 3, spread: 170 * Math.max(.7, scale), tightness: 2.4, clearance: 12, inWater }, (x, z) => {
    const base = groundHeightAt(x, z) - .3;
    const h = 4 + rng() * 5;
    const r = 3 + rng() * 3.4;
    const color = rng() < .2 ? autumn[Math.floor(rng() * autumn.length)] : greens[Math.floor(rng() * greens.length)];
    setInstance(trunks, n, x, base + h / 2, z, 1, h, 1);
    setInstance(crowns, n, x, base + h + r * .5, z, r, r * .8, r, rng() * 6.28, color);
    setInstance(crowns2, n, x + (rng() - .5) * r, base + h + r * 1.05, z + (rng() - .5) * r, r * .65, r * .55, r * .65, rng() * 6.28, color);
    n++;
  });
  commitInstances([[trunks, n], [crowns, n], [crowns2, n]]);
}

/**
 * Prédios distantes ao fundo (skyline de São Paulo, de Indianápolis): torres
 * de 14–34 m de lado espalhadas num arco. À noite as janelas "acendem"
 * (emissivo baixo), sem custo de luz dinâmica.
 */
function buildSkyline(rng, scale, cfg, night) {
  const materials = cfg.palette.map((c) => makeMaterial(c, night ? { emissive: c, emissiveIntensity: .35 } : {}));
  let placed = 0;
  let attempts = 0;
  while (placed < cfg.count && attempts++ < cfg.count * 8) {
    const angle = cfg.angle[0] + rng() * (cfg.angle[1] - cfg.angle[0]);
    const radius = (cfg.radius[0] + rng() * (cfg.radius[1] - cfg.radius[0])) * scale;
    const h = cfg.height[0] + rng() * rng() * (cfg.height[1] - cfg.height[0]);
    const w = 14 + rng() * 20;
    const d = 14 + rng() * 20;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Verifica o volume inteiro da torre, não apenas seu centro. No oval de
    // Indianápolis, um prédio do skyline podia cair sobre uma das curvas.
    if (asphaltClearanceAt(state.track, x, z) < Math.hypot(w, d) / 2 + 10) continue;
    const tower = addBox(w, h, d, materials[Math.floor(rng() * materials.length)], x, h / 2 - 8, z);
    tower.rotation.y = rng() * .6;
    placed++;
  }
}

/**
 * Placas de bandeira/patrocínio ao longo da cerca do lado esquerdo, no trecho
 * `from`→`to` (m; negativos contam antes da linha). Cada placa alterna texto e
 * estilo [fundo, letra].
 */
function buildBanners(cfg) {
  let i = 0;
  for (let s = cfg.from; s <= cfg.to; s += cfg.step, i++) {
    const [bg, fg] = cfg.styles[i % cfg.styles.length];
    const lane = -state.track.tracksideOffsetAt(s, -1, 2.5);
    const frame = state.track.at(s, lane);
    const panel = makeTextPanel(cfg.texts[i % cfg.texts.length], 9, 2.4, bg, fg);
    panel.position.copy(frame.p);
    panel.position.y += 2.8;
    panel.rotation.y = frame.yaw + Math.PI;
    state.scene.add(panel);
    for (const dz of [-3.6, 3.6]) {
      const post = state.track.at(s + dz, lane);
      addMesh(new THREE.CylinderGeometry(.08, .08, 3, 5), MATERIALS.metal, post.p.x, post.p.y + 1.5, post.p.z);
    }
  }
}

/**
 * Indianápolis Motor Speedway: arquibancadas contínuas em 3 camadas em volta de
 * TODO o oval (lado de fora), mais altas e cobertas na reta principal, a
 * Pagoda e o painel de posições no infield, faixa de tijolos na linha, um
 * bosque baixo depois das arquibancadas e o campo de golfe do infield.
 */
function buildSpeedwayComplex(rng, groundHeightAt, inWater) {
  // Caixa NIVELADA (só gira em Y): o oval tem banking de ~9° nas curvas, e o
  // addAlignedBox acompanharia a inclinação — arquibancada torta. A base é a
  // altura do muro; o primeiro andar desce 6 m pra encostar no terreno.
  const level = (s, lane, w, h, d, material, yOffset = 0) => {
    const side = Math.sign(lane) || 1;
    const base = state.track.at(s, side * (trackHalfWidthAt(s) + cornerWideningAt(s, side))).p.y;
    const f = state.track.at(s, lane);
    const mesh = addBox(w, h, d, material, f.p.x, base + yOffset + h / 2, f.p.z);
    mesh.rotation.y = f.yaw;
    return mesh;
  };
  const concrete = makeMaterial("#b8b8b0");
  const seatColors = ["#c8262c", "#f1f1ea", "#1f4f9c", "#e8c22a"].map((c) => makeMaterial(c));
  const roofMaterial = makeMaterial("#eeeeea");
  const front = (s) => s > TRACK_LENGTH - 520 || s < 520;
  for (let s = 0, k = 0; s < TRACK_LENGTH; s += 14, k++) {
    const edge = trackHalfWidthAt(s) + cornerWideningAt(s, 1) + 8;
    const tiers = front(s) ? 4 : 3;
    for (let tier = 0; tier < tiers; tier++) {
      const lateral = edge + 5 + tier * 8.6;
      level(s, lateral, 8.6, tier === 0 ? 8.8 : 2.8, 14.2, concrete, tier === 0 ? -6.4 : tier * 3.1 - .4);
      level(s, lateral - 1.2, 5.6, .5, 13.4, seatColors[(k + tier) % seatColors.length], tier * 3.1 + 2.4);
    }
    if (front(s)) level(s, edge + 5 + (tiers - 1) * 4.3, 34, .6, 14.2, roofMaterial, tiers * 3.1 + 5);
  }
  // lado do infield: arquibancadas baixas só junto à reta principal
  for (let s = TRACK_LENGTH - 420; s < TRACK_LENGTH + 320; s += 14) {
    const edge = trackHalfWidthAt(s) + cornerWideningAt(s, -1) + 8;
    for (let tier = 0; tier < 2; tier++) {
      level(s, -(edge + 5 + tier * 8.6), 8.6, tier === 0 ? 8.8 : 2.8, 14.2, concrete, tier === 0 ? -6.4 : tier * 3.1 - .4);
      level(s, -(edge + 5 + tier * 8.6 - 1.2), 5.6, .5, 13.4, seatColors[(Math.floor(s / 14) + tier) % 4], tier * 3.1 + 2.4);
    }
  }
  // Pagoda: torre de 5 andares afinando, com faixa de vidro e telhado vermelho
  const pagodaLane = -(trackHalfWidthAt(30) + cornerWideningAt(30, -1) + 34);
  const glass = makeMaterial("#2b3a4a", { metalness: .4, roughness: .25 });
  const white = makeMaterial("#e9e9e3");
  const red = makeMaterial("#b3282d");
  for (let floor = 0; floor < 5; floor++) {
    const w = 16 - floor * 2.2;
    level(30, pagodaLane, w, floor === 0 ? 11.2 : 5.2, w * .75, white, floor === 0 ? -6 : floor * 6.2);
    level(30, pagodaLane, w + .2, 1.6, w * .75 + .2, glass, floor * 6.2 + 1.8);
    level(30, pagodaLane, w + 1.6, .7, w * .75 + 1.6, red, floor * 6.2 + 5.3);
  }
  level(30, pagodaLane, .5, 7, .5, MATERIALS.metal, 31);
  // painel de posições (pylon): coluna alta com placa
  const pylonLane = -(trackHalfWidthAt(-45) + cornerWideningAt(-45, -1) + 16);
  level(-45, pylonLane, 2.4, 58, 2.4, makeMaterial("#22272d"), -6);
  const pylonFrame = state.track.at(-45, pylonLane);
  const board = makeTextPanel("INDY 500", 9, 2.6, "#f3f3ec", "#c8262c");
  board.position.copy(pylonFrame.p);
  board.position.y += 46;
  board.rotation.y = pylonFrame.yaw + Math.PI;
  state.scene.add(board);
  // faixa de tijolos na linha de chegada
  const bricks = makeMaterial("#9c4a34");
  addAlignedBox(3.4, 0, trackHalfWidthAt(3.4) * 2, .03, 1.1, bricks, .16);
  // bosque baixo atrás das arquibancadas (copas redondas), fora do infield/lago
  const MAX = 700;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.4, .6, 1, 5), makeMaterial("#5a4634"), MAX);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), makeMaterial("#ffffff"), MAX);
  const greens = ["#4d8a3a", "#5c9a44", "#437a34"].map((c) => new THREE.Color(c));
  let n = 0;
  scatterAlongTrack(rng, MAX, { near: 46, spread: 190, tightness: 1.6, clearance: 44, inWater }, (x, z) => {
    const base = groundHeightAt(x, z) - .3;
    const h = 4 + rng() * 4;
    const r = 3 + rng() * 3;
    setInstance(trunks, n, x, base + h / 2, z, 1, h, 1);
    setInstance(crowns, n, x, base + h + r * .5, z, r, r * .8, r, rng() * 6.28, greens[Math.floor(rng() * 3)]);
    n++;
  });
  commitInstances([[trunks, n], [crowns, n]]);
}

/** Hard Rock Stadium, dentro do complexo do circuito de Miami. */
function buildHardRockStadium(groundHeightAt, cfg) {
  const stadium = new THREE.Group();
  stadium.position.set(cfg.x, groundHeightAt(cfg.x, cfg.z), cfg.z);
  stadium.rotation.y = cfg.rotation ?? 0;
  state.scene.add(stadium);

  const concrete = makeMaterial("#d9ddd8");
  const dark = makeMaterial("#26343a");
  const aqua = makeMaterial("#38c8c6");
  const orange = makeMaterial("#e57838");
  const roof = makeMaterial("#f4f5ef", { metalness: .15, roughness: .45 });
  const field = makeMaterial("#3f8f4c");
  addBox(112, .4, 54, field, 0, .2, 0, stadium);
  addBox(122, .16, 2, MATERIALS.white, 0, .44, 0, stadium);

  for (const side of [-1, 1]) {
    addBox(28, 14, 122, dark, side * 70, 7, 0, stadium);
    addBox(22, 2.4, 112, side < 0 ? aqua : orange, side * 57, 15, 0, stadium);
    addBox(178, 12, 25, dark, 0, 6, side * 57, stadium);
    addBox(166, 2.4, 19, side < 0 ? orange : aqua, 0, 13, side * 47, stadium);
    addBox(30, 2.2, 150, roof, side * 94, 25, 0, stadium);
    addBox(218, 2.2, 28, roof, 0, 25, side * 67, stadium);
  }
  for (const x of [-96, 96]) {
    for (const z of [-69, 69]) {
      addMesh(new THREE.CylinderGeometry(1.2, 1.8, 27, 6), concrete, x, 13.5, z, stadium);
    }
  }
  const sign = makeTextPanel("HARD ROCK STADIUM", 48, 5, "#18272b", "#7de7df");
  sign.position.set(0, 19, -72);
  stadium.add(sign);
}

/** Hotel iluminado de Yas, com a passarela alta cruzando a pista. */
function buildYasHotel(s) {
  const glass = makeMaterial("#65cddd", { emissive: "#247d91", emissiveIntensity: .45, metalness: .25 });
  const shell = makeMaterial("#edf5f0", { metalness: .2, roughness: .35 });
  for (const side of [-1, 1]) {
    addAlignedBox(s, side * 34, 18, 30, 22, glass, -.2);
    addAlignedBox(s, side * 34, 21, 2, 25, shell, 29);
  }
  addAlignedBox(s, 0, 86, 7, 20, glass, 25);
  addAlignedBox(s, 0, 90, 1.2, 23, shell, 32);
}

/** Palmeiras esparsas e iluminação do complexo desértico de Yas Marina. */
function buildDesertScenery(rng, scale, groundHeightAt, inWater) {
  const MAX = 220;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .55, 1, 5), makeMaterial("#806743"), MAX);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 4), makeMaterial("#ffffff"), MAX);
  const greens = ["#427844", "#4d8748", "#376c3c"].map((c) => new THREE.Color(c));
  let n = 0;
  scatterAlongTrack(rng, MAX, { near: 16, spread: 260 * Math.max(.7, scale), tightness: 1.6, clearance: 12, inWater }, (x, z) => {
    const base = groundHeightAt(x, z) - .3;
    const h = 7 + rng() * 6;
    setInstance(trunks, n, x, base + h / 2, z, .8, h, .8);
    setInstance(crowns, n, x, base + h + .4, z, 3.3, 1, 3.3, rng() * 6.28, greens[n % greens.length]);
    n++;
  });
  commitInstances([[trunks, n], [crowns, n]]);
}

/** Ajusta o tamanho do renderer/câmera ao tamanho atual do elemento <canvas>. */
export function resizeRenderer() {
  if (!state.renderer) return;
  const w = byId("race").clientWidth;
  const h = byId("race").clientHeight;
  state.renderer.setSize(w, h, false);
  state.composer?.setSize(w, h);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

/** Mantém a janela de sombras do beta concentrada ao redor do carro. */
export function updateBetaGraphics() {
  if (!state.graphicsBeta || !state.betaSun || !state.player) return;
  const target = state.player.group.position;
  state.betaSun.position.set(target.x - 58, target.y + 92, target.z - 38);
  state.betaSun.target.position.copy(target);
  state.betaSun.target.updateMatrixWorld();
  updateBetaAtmosphere(state.clockTime);
}

/**
 * Monta toda a cena: luzes, terreno, pista, meio-fios, guard-rails,
 * pórtico de largada, decorações e cenário de fundo (árvores/morros).
 * Deve ser chamada uma única vez, depois que `state.track` já existe.
 */
export function buildScene() {
  const scale = worldScale();
  const night = state.nightMode;
  const street = SCENERY.theme === "street";
  const forest = SCENERY.theme === "forest";
  const tropical = SCENERY.theme === "tropical";
  const woodland = SCENERY.theme === "woodland";
  const speedway = SCENERY.theme === "speedway";
  const alpine = SCENERY.theme === "alpine";
  const desert = SCENERY.theme === "desert";
  state.scene = new THREE.Scene();
  // Céu/névoa por ambiente: Mediterrâneo azul em Mônaco, tempo fechado nas
  // Ardenas. Noturna: céu quase negro (nunca preto puro — cidade/estádio ao
  // redor sempre reflete um pouco de luz) e névoa mais curta/escura, pra não
  // "queimar" o preto do céu na distância como a névoa diurna faria.
  const daySky = state.graphicsBeta ? "#83b7d2" : street ? "#9ccbea" : forest ? "#a3b2b6" : tropical ? "#a3d0e2" : woodland ? "#c3d0cd" : speedway ? "#a6c8e8" : desert ? "#8fc8df" : alpine ? "#a9c6dc" : "#a9c8c7";
  state.scene.background = new THREE.Color(night ? "#050810" : daySky);
  state.scene.fog = new THREE.Fog(
    night ? "#050810" : daySky,
    (night ? 260 : forest ? 420 : woodland ? 380 : 700) * scale,
    (night ? 1000 : forest ? 1500 : woodland ? 1400 : 1900) * scale
  );
  state.camera = new THREE.PerspectiveCamera(60, 1, .2, 2500 * Math.max(1, scale));
  state.composer?.dispose();
  state.composer = null;
  state.renderer?.dispose();
  state.renderer = new THREE.WebGLRenderer({
    canvas: byId("race"),
    antialias: true,
    powerPreference: "high-performance",
  });
  state.renderer.setPixelRatio(Math.min(devicePixelRatio, state.graphicsBeta ? 1.5 : 1.7));
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = state.graphicsBeta ? 1.08 : night ? .95 : 1.15;
  state.renderer.shadowMap.enabled = state.graphicsBeta;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (state.graphicsBeta) setupBetaEnvironment();

  // De noite, o "sol" vira luar (bem mais fraco e frio) — a pista em si é
  // iluminada por holofotes emissivos (ver buildFloodlights abaixo), não
  // por luzes dinâmicas de verdade (custaria caro com 23 carros na cena).
  state.scene.add(new THREE.HemisphereLight("#d7f0ff", state.graphicsBeta ? "#52613d" : "#556c39", state.graphicsBeta ? 1.35 : night ? .55 : 2.6));
  const sun = new THREE.DirectionalLight(night ? "#9db8ff" : state.graphicsBeta ? "#fff1cf" : "#fff2d1", state.graphicsBeta ? 3.4 : night ? .4 : 2.5);
  sun.position.set(-300, 700, 100);
  state.scene.add(sun);
  state.scene.add(sun.target);
  state.betaSun = null;
  if (state.graphicsBeta) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -58;
    sun.shadow.camera.right = sun.shadow.camera.top = 58;
    sun.shadow.camera.near = 8;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -.00035;
    sun.shadow.normalBias = .035;
    state.betaSun = sun;

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color("#327dac") },
          horizonColor: { value: new THREE.Color("#d6e4e4") },
          groundColor: { value: new THREE.Color("#9eb09a") },
        },
        vertexShader: "varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=normalize(world.xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec3 vWorld; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor; void main(){ float h=clamp(vWorld.y, -1.0, 1.0); vec3 c=h>0.0?mix(horizonColor,topColor,pow(h,.55)):mix(horizonColor,groundColor,min(1.0,-h*3.0)); gl_FragColor=vec4(c,1.0); }",
      }),
    );
    sky.frustumCulled = false;
    state.scene.add(sky);
  }

  // Materiais por ambiente. Autódromo ("park", o visual original): gramado
  // + faixa verde de escape. Rua ("street"): tudo pavimento, sem grama. Floresta:
  // gramado mais denso e escapes de asfalto.
  const groundMaterial = street ? makeMaterial("#7d786c") : forest ? makeMaterial("#4c7449")
    : tropical ? makeMaterial("#5c9647") : woodland ? makeMaterial("#6b8f40") : speedway ? makeMaterial("#79a552")
      : desert ? makeMaterial("#b99a61") : alpine ? makeMaterial("#67924e") : MATERIALS.grass;
  const runoffMaterial = street ? makeMaterial("#666a6d") : forest || desert ? makeMaterial("#626b6a") : MATERIALS.green;
  const sidewalkMaterial = makeMaterial("#8e8a7f");
  const wallMaterial = street ? makeMaterial("#ece9e0") : speedway ? makeMaterial("#dcdcd6") : MATERIALS.barrier;
  // As duas laterais usam a mesma ordem de vértices; DoubleSide garante que
  // a face voltada para a pista permaneça visível nos dois lados.
  wallMaterial.side = THREE.DoubleSide;

  // Porto de Mônaco (só rua com `harbor`): quadriláteros de água na margem
  // ESQUERDA dos trechos indicados (a Port Hercule fica dentro da grande
  // volta, do lado esquerdo da Beira-Mar e da perna da Piscina), estendidos
  // `depth` m pra dentro.
  const waterPolys = [];
  let waterY = 0;
  if (SCENERY.harbor) {
    let ySum = 0, yCount = 0;
    // Cada trecho é fatiado em quadriláteros de ≤40 m, cada um com as próprias
    // normais nas duas pontas: um quadrilátero único de ponta a ponta "torce"
    // (vira uma gravata-borboleta de área ~0) quando a pista faz uma curva
    // fechada no meio do trecho, como o T4–T5 de Interlagos.
    for (const [a, b] of SCENERY.harbor.segments) {
      const pieces = Math.max(1, Math.ceil((b - a) / 40));
      for (let i = 0; i < pieces; i++) {
        const s0 = a + ((b - a) * i) / pieces;
        const s1 = a + ((b - a) * (i + 1)) / pieces;
        const f0 = state.track.at(s0);
        const f1 = state.track.at(s1);
        const p0 = state.track.at(s0, -(trackHalfWidthAt(s0) + 8)).p;
        const p1 = state.track.at(s1, -(trackHalfWidthAt(s1) + 8)).p;
        const q0 = p0.clone().addScaledVector(f0.right, -SCENERY.harbor.depth);
        const q1 = p1.clone().addScaledVector(f1.right, -SCENERY.harbor.depth);
        waterPolys.push([p0, p1, q1, q0]);
      }
      ySum += state.track.at(a).p.y + state.track.at(b).p.y;
      yCount += 2;
    }
    waterY = ySum / yCount - 1.6;
  }
  const inWater = (x, z) => waterPolys.some((poly) => pointInPolygon(x, z, poly));

  // Terreno: grande plano cujo relevo segue (com suavização por distância
  // inversa) a elevação de amostras da pista, formando um "vale" ao redor
  // dela (terreno ~5m abaixo do nível médio da pista).
  const ground = new THREE.PlaneGeometry(2100 * scale, 2100 * scale, 74, 74);
  ground.rotateX(-Math.PI / 2);
  const groundPos = ground.attributes.position;
  const referencePoints = state.track.samples.filter((_, i) => i % 18 === 0);
  const groundDrop = 5;
  // Em rua a volta tem trechos PERTO um do outro em alturas bem diferentes
  // (Mônaco: a Beira-Mar a ~6 m e o Casino a ~40 m, a poucas dezenas de
  // metros) — a média ponderada de TODA a pista puxava o terreno pra cima e
  // ele "furava" calçada e asfalto de outro trecho (o "bug de elevação").
  // Aqui o terreno nunca passa da altura do pé de NENHUM trecho da pista
  // (calçada + rampa ocupam até ~38 m da borda, sempre acima do terreno) e só
  // sobe depois disso, numa encosta de ~24° — um penhasco de verdade em vez de
  // um terreno atravessando a rua.
  const capByRoad = street;
  const groundHeightAt = (x, z) => {
    let weightedY = 0;
    let weightSum = 0;
    for (const ref of referencePoints) {
      const weight = 1 / Math.pow(35 + Math.hypot(x - ref.x, z - ref.z), 4);
      weightedY += ref.y * weight;
      weightSum += weight;
    }
    const average = weightedY / weightSum - groundDrop;
    if (!capByRoad) return average;
    let cap = Infinity;
    for (const p of state.track.samples) {
      const d = Math.hypot(x - p.x, z - p.z);
      cap = Math.min(cap, p.y - 6.5 + Math.max(0, d - 38) * .45);
    }
    return Math.min(average, cap);
  };
  for (let i = 0; i < groundPos.count; i++) {
    const x = groundPos.getX(i);
    const z = groundPos.getZ(i);
    // Fundo do porto: o terreno afunda sob a água pra ela aparecer.
    groundPos.setY(i, inWater(x, z) ? waterY - 3 : groundHeightAt(x, z));
  }
  ground.computeVertexNormals();
  addMesh(ground, groundMaterial);
  generateAsphaltTexture(state.renderer, groundMaterial);

  if (waterPolys.length) {
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: night ? "#0c2238" : SCENERY.waterColor,
      roughness: .3,
      metalness: .15,
      side: THREE.DoubleSide,
    });
    for (const poly of waterPolys) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      addMesh(geo, waterMaterial, 0, waterY, 0);
    }
  }

  // Todas as bordas externas usam o mesmo resolvedor geométrico. Ele limita
  // offsets no lado interno de hairpins e entre pernas próximas, impedindo
  // runoff, terreno e muro de dobrarem por cima de outro trecho de asfalto.
  const safeTracksideOffset = createSafeTracksideOffset(state.track, TRACK_LENGTH);
  const wallOffsetAt = (s, side) => {
    const offset = safeTracksideOffset(s, side);
    const point = state.track.at(s, side * offset).p;
    return asphaltClearanceAt(state.track, point.x, point.z) > .05 ? offset : null;
  };
  state.track.wallOffsetAt = wallOffsetAt;
  state.track.tracksideOffsetAt = safeTracksideOffset;
  const outerEdge = (side, extra = 0) => (s) =>
    side * safeTracksideOffset(s, side, typeof extra === "function" ? extra(s) : extra);
  const inHarbor = (s) => SCENERY.harbor?.segments.some(([a, b]) => s >= a && s <= b);

  if (street) {
    // Calçada plana dos dois lados (12 m; só 6 m de cais no lado do porto),
    // seguida de uma descida curta até o terreno — os prédios ficam logo
    // depois, como nas ruas de Monte Carlo.
    const inner = (side) => (s) => (side < 0 && inHarbor(s) ? 6 : 12);
    const outer = (side) => (s) => (side < 0 && inHarbor(s) ? 16 : 26);
    const edgeAt = (side, extra) => outerEdge(side, extra);
    buildRibbonMesh(edgeAt(-1, inner(-1)), outerEdge(-1), sidewalkMaterial, -.25);
    buildRibbonMesh(outerEdge(1), edgeAt(1, inner(1)), sidewalkMaterial, -.25);
    buildRibbonMesh(edgeAt(-1, outer(-1)), edgeAt(-1, inner(-1)), groundMaterial, [-6, -.25]);
    buildRibbonMesh(edgeAt(1, inner(1)), edgeAt(1, outer(1)), groundMaterial, [-.25, -6]);
  } else {
    buildRibbonMesh(outerEdge(-1, 15), outerEdge(-1), groundMaterial, [-11, -.2]);
    buildRibbonMesh(outerEdge(1), outerEdge(1, 15), groundMaterial, [-.2, -11]);
  }
  buildRibbonMesh(outerEdge(-1), outerEdge(1), runoffMaterial, -.2);
  buildRibbonMesh((s) => -trackHalfWidthAt(s), trackHalfWidthAt, MATERIALS.road, .1);
  if (state.graphicsBeta) {
    const rubber = makeMaterial("#151719", {
      roughness: .72,
      transparent: true,
      opacity: .34,
      depthWrite: false,
    });
    const grooveBias = (s) => {
      const turn = wrapAngle(state.track.at(s + 58).yaw - state.track.at(s + 18).yaw);
      return -Math.sign(turn) * Math.min(1.35, Math.abs(turn) * 2.1);
    };
    buildRibbonMesh((s) => grooveBias(s) - 1.65, (s) => grooveBias(s) + 1.65, rubber, .115);
  }
  buildRibbonMesh((s) => -trackHalfWidthAt(s) + .04, (s) => -trackHalfWidthAt(s) + .23, MATERIALS.line, .12);
  buildRibbonMesh((s) => trackHalfWidthAt(s) - .23, (s) => trackHalfWidthAt(s) - .04, MATERIALS.line, .12);
  buildCurbsMesh();

  // Parede contínua: acompanha a curva ponto a ponto. As antigas caixas de
  // 12,2 m cortavam o interior de chicanes/hairpins como uma corda e chegavam
  // a atravessar o asfalto mesmo quando o centro da caixa estava fora dele.
  for (const side of [-1, 1]) {
    buildTrackWallMesh(side, wallOffsetAt, street ? 1.5 : 1, wallMaterial);
  }
  if (!street) {
    for (let s = 0; s < TRACK_LENGTH; s += 36) {
      for (const side of [-1, 1]) {
        const wallOffset = wallOffsetAt(s, side);
        if (wallOffset != null) addAlignedBox(s, side * wallOffset, .15, 3, .15, MATERIALS.metal);
      }
    }
  }

  if (SCENERY.tunnel) buildTunnel(SCENERY.tunnel[0], SCENERY.tunnel[1]);
  if (street) buildStreetLamps();
  if (night) buildFloodlights();

  // Grid quadriculado (xadrez) próximo à linha de largada.
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 14; row++) {
      addAlignedBox(col * .9, row - 6.5, 1, .02, .9, (col + row) % 2 ? MATERIALS.black : MATERIALS.white, .15);
    }
  }

  // Marcadores brancos alternados na aproximação da linha de chegada.
  for (let i = 0; i < 16; i++) {
    const s = TRACK_LENGTH - 10 - i * 7;
    addAlignedBox(s, (i % 2 ? 1 : -1) * 3, 2.4, .015, .18, MATERIALS.white, .16);
  }

  // Estrutura de telhado dos boxes/arquibancadas (23 vãos, mesmo espaçamento
  // dos boxes de largada — ver SCENERY.pitBoxSpacing).
  if (SCENERY.pitBuilding) {
    const spacing = SCENERY.pitBoxSpacing;
    const k = spacing / 20;
    for (let i = 0; i < 23; i++) {
      const s = TRACK_LENGTH + (i - 12.25) * spacing;
      addAlignedBox(s, 30, 15, 5.8, 18.8 * k, MATERIALS.roof, -.4);
      addAlignedBox(s, 22.4, .12, 3.5, 14 * k, MATERIALS.black, .1);
      addAlignedBox(s, 22.2, .2, .6, 15 * k, MATERIALS.lime, 4);
    }
  }

  // Paredes de fundo das arquibancadas (faixas coloridas em camadas), nas
  // extremidades reta dos boxes / área de largada (mesmas estações dos assentos).
  if (SCENERY.grandstands) {
    const wallColors = [makeMaterial("#c4d93e"), makeMaterial("#429b92"), makeMaterial("#eef1dc")];
    for (const s of GRANDSTAND_STATIONS()) {
      for (let i = 0; i < 5; i++) {
        addAlignedBox(s, -29 - i * 3, 3, 1.5, 56, wallColors[i % 3], i * 1.25);
      }
    }
  }

  // Pórtico de largada (start gantry) com 5 luzes.
  const gantryFrame = state.track.at(20);
  const gantry = new THREE.Group();
  gantry.position.copy(gantryFrame.p);
  gantry.rotation.y = gantryFrame.yaw;
  state.scene.add(gantry);
  // Os postes acompanham a largura real da pista. O antigo ±10 m ficaria
  // sobre a borda do asfalto de Indianápolis depois da ampliação.
  const gantryPostOffset = Math.max(10, trackHalfWidthAt(20) + 2);
  addBox(.7, 8, .7, MATERIALS.metal, -gantryPostOffset, 4, 0, gantry);
  addBox(.7, 8, .7, MATERIALS.metal, gantryPostOffset, 4, 0, gantry);
  addBox(gantryPostOffset * 2 + 1, 2, .7, MATERIALS.black, 0, 8, 0, gantry);
  for (let i = 0; i < 5; i++) addBox(.6, .6, .8, MATERIALS.lime, -3 + i * 1.5, 8, 0, gantry);

  // PRNG determinístico (Park-Miller) para árvores, prédios e morros de fundo
  // — o cenário fica sempre idêntico entre execuções (não usa Math.random aqui).
  let seed = 17;
  const rng = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);

  if (street) {
    buildCityBlocks(rng, groundHeightAt, inWater, waterY);
  } else if (forest) {
    buildForest(rng, scale, groundHeightAt);
  } else if (tropical) {
    buildTropicalVegetation(rng, scale, groundHeightAt, inWater);
  } else if (woodland) {
    buildWoodland(rng, scale, groundHeightAt, inWater);
  } else if (speedway) {
    buildSpeedwayComplex(rng, groundHeightAt, inWater);
  } else if (desert) {
    buildDesertScenery(rng, scale, groundHeightAt, inWater);
  } else {
    const trunkMaterial = makeMaterial("#5a6550");
    const foliageMaterial = makeMaterial("#315a46");
    for (let i = 0; i < 140; i++) {
      const x = (rng() - .5) * 1700 * scale;
      const z = (rng() - .5) * 1700 * scale;
      const nearest = state.track.nearest(x, z);
      if (nearest.dist - nearest.halfWidth < 24) continue; // mantém copa e tronco longe do asfalto
      const baseY = nearest.p.y - 1;
      const trunkHeight = 5 + rng() * 9;
      addMesh(new THREE.CylinderGeometry(.65, .9, trunkHeight, 5), trunkMaterial, x, baseY + trunkHeight / 2, z);
      addMesh(new THREE.ConeGeometry(4 + rng() * 3, 10, 6), foliageMaterial, x, baseY + trunkHeight, z);
    }
  }

  if (SCENERY.stadium) buildHardRockStadium(groundHeightAt, SCENERY.stadium);
  if (SCENERY.yasHotelStation != null) buildYasHotel(SCENERY.yasHotelStation);

  if (SCENERY.skyline) buildSkyline(rng, scale, SCENERY.skyline, night);
  if (SCENERY.banners) buildBanners(SCENERY.banners);

  if (state.graphicsBeta) {
    buildBetaAtmosphere(groundHeightAt, rng);
    buildBetaTrackDetails(rng);
  }

  // Fundo distante. Autódromo: "morros" de caixas atrás da largada. Rua:
  // paredões rochosos e altos (Mônaco é espremida contra a montanha).
  // Floresta: colinas cônicas cobertas de mata em volta de toda a volta.
  // Trópico: morros arredondados e verdes. Bosque de Monza e oval de
  // Indianápolis: planície (sem morros).
  if (forest || alpine) {
    const hillMaterials = [makeMaterial("#3f6644"), makeMaterial("#365a3d"), makeMaterial("#4a7049")];
    for (let i = 0; i < (alpine ? 58 : 46); i++) {
      const angle = rng() * Math.PI * 2;
      const radius = (780 + rng() * 240) * scale;
      const r = (alpine ? 140 : 90) + rng() * (alpine ? 180 : 120);
      const h = (alpine ? 110 : 70) + rng() * (alpine ? 210 : 120);
      addMesh(new THREE.ConeGeometry(r, h, 7), hillMaterials[i % 3], Math.cos(angle) * radius, h / 2 - 20, Math.sin(angle) * radius);
    }
  } else if (desert) {
    const duneMaterials = [makeMaterial("#c5a568"), makeMaterial("#ad8d58"), makeMaterial("#d0b47a")];
    for (let i = 0; i < 38; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = (760 + rng() * 260) * scale;
      const dune = addMesh(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), duneMaterials[i % 3], Math.cos(angle) * radius, -18, Math.sin(angle) * radius);
      dune.scale.set(120 + rng() * 130, 22 + rng() * 38, 90 + rng() * 110);
    }
  } else if (tropical) {
    const hillMaterials = [makeMaterial("#4b7d45"), makeMaterial("#3f6f3f"), makeMaterial("#5a8a4a")];
    for (let i = 0; i < 40; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = (760 + rng() * 260) * scale;
      const r = 130 + rng() * 150;
      const hill = addMesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMaterials[i % 3], Math.cos(angle) * radius, -12, Math.sin(angle) * radius);
      hill.scale.set(r, 30 + rng() * 55, r);
    }
  } else if (!woodland && !speedway) {
    const massifColors = street ? ["#a39a89", "#8b8373"] : ["#91a9a9", "#7b9699"];
    for (let i = 0; i < (street ? 90 : 65); i++) {
      const x = (rng() - .5) * 1900 * scale;
      const z = -880 * scale - rng() * 260;
      const h = (street ? 40 : 15) + rng() * (street ? 150 : 90);
      addBox(15 + rng() * 30, h, 15 + rng() * 30, makeMaterial(massifColors[i % 2]), x, h / 2, z);
    }
  }

  buildTrackDecorations();
  mergeStaticMeshesByMaterial();
  buildRacingLineMesh();

  if (state.graphicsBeta) {
    state.racingLineMesh.visible = false;
    const composer = new EffectComposer(state.renderer);
    composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    composer.addPass(new RenderPass(state.scene, state.camera));
    const ssao = new SSAOPass(state.scene, state.camera, 1, 1);
    ssao.kernelRadius = 7;
    ssao.minDistance = .0025;
    ssao.maxDistance = .075;
    composer.addPass(ssao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .22, .55, .82));
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; c=(c-.5)*1.055+.5; float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,1.08); float d=distance(vUv,vec2(.5)); c*=1.0-smoothstep(.34,.78,d)*.24; gl_FragColor=vec4(c,1.0); }",
    }));
    composer.addPass(new OutputPass());
    state.composer = composer;
  }

  // Minimapa dinâmico exibido durante a corrida (canvas extra sobreposto).
  // Se já existir um de uma troca de circuito anterior, remove-o primeiro —
  // senão acumularíamos um <canvas id="miniMap"> órfão por troca de pista.
  document.getElementById("miniMap")?.remove();
  const miniMap = document.createElement("canvas");
  miniMap.id = "miniMap";
  miniMap.width = 360;
  miniMap.height = 280;
  miniMap.className = "hidden";
  miniMap.style.cssText =
    "position:absolute;right:20px;top:130px;width:150px;height:117px;z-index:3;background:#10231dcc;border:1px solid #ffffff26;border-radius:8px;pointer-events:none";
  document.querySelector(".game").append(miniMap);

  new ResizeObserver(resizeRenderer).observe(byId("race").parentElement);
  resizeRenderer();
}
