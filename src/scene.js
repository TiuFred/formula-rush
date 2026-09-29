// Construção de toda a geometria estática da pista e do cenário ao redor
// (grama, asfalto, meio-fios, guard-rails, arquibancadas, pórtico de largada,
// árvores, "morros" de fundo) + otimizações (mescla de meshes) + a linha de
// trajetória ideal. Tudo a partir do modelo de pista (track.js).
//
// Fidelidade: todas as constantes numéricas (posições, contagens, cores)
// são exatamente as do bundle original (função `dg` e auxiliares).

import * as THREE from "three";
import { state } from "./state.js";
import {
  TRACK_LENGTH, CORNER_NAME_SIGNS, DISTANCE_BOARD_STATIONS,
  ZEBRA_ZONES, APEX_GRASS_PATCHES, TRACK_NAME_PANEL_TEXT, SCENERY,
} from "./constants.js";
import { trackHalfWidthAt, cornerWideningAt } from "./track.js";
import { wrapAngle } from "./mathUtils.js";
import { byId } from "./dom.js";
import { MATERIALS, makeMaterial, addMesh, addBox, makeTextPanel } from "./materials.js";

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

/** Cria uma caixa alinhada ao traçado (posição+orientação) na estação `s`/pista lateral `lane`. */
export function addAlignedBox(s, lane, w, h, d, material, yOffset = 0) {
  const frame = state.track.at(s, lane);
  const mesh = addBox(w, h, d, material, frame.p.x, frame.p.y + yOffset + h / 2, frame.p.z);
  mesh.rotation.set(-Math.asin(frame.t.y), frame.yaw, -frame.bank, "YXZ");
  return mesh;
}

/** Gera uma textura de asfalto ruidosa (PRNG determinístico) e aplica ao material da pista. */
function generateAsphaltTexture(renderer) {
  if (MATERIALS.road.map) MATERIALS.road.map.dispose(); // textura de uma troca de circuito anterior
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
  MATERIALS.road.color.set("#c7cdce");
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
    const color = new THREE.Color(["#d9e8d6", "#d3e93e", "#268d64"][Math.floor(s / 4) % 3]);
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
    const offset = side * (trackHalfWidthAt(s) + cornerWideningAt(s, side) + 9);
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
      const width = cornerWideningAt(s, side) - 3;
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
    const frame = state.track.at(s, -trackHalfWidthAt(s) - 4);
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
          seatMesh.setColorAt(seatIndex, new THREE.Color(["#d6ea55", "#f0e7d6", "#349e8e", "#293d62", "#eac170"][(seatIndex * 7 + row) % 5]));
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
      const yOffset = trackHalfWidthAt(s) + cornerWideningAt(s, 1) - 1.2;
      addAlignedBox(s + i * 2.5, yOffset, 1.5, 1.4, 2.2, i % 2 ? MATERIALS.green : sandDark, 0);
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
    const offset = side * (trackHalfWidthAt(s) + cornerWideningAt(s, side) + .8);
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
    const edge = trackHalfWidthAt(s) + cornerWideningAt(s, 1) + .9;
    for (const side of [-1, 1]) addAlignedBox(s, side * edge, 1.2, 9, 12.4, wallMaterial, -.2);
    addAlignedBox(s, 0, edge * 2 + 2.4, 1, 12.4, ceilingMaterial, 7.6);
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
    if (state.track.nearest(x, z).dist < trackHalfWidthAt(s) + 28) continue;
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
    if (state.track.nearest(x, z).dist < trackHalfWidthAt(s) + 12) continue;
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

/** Ajusta o tamanho do renderer/câmera ao tamanho atual do elemento <canvas>. */
export function resizeRenderer() {
  if (!state.renderer) return;
  const w = byId("race").clientWidth;
  const h = byId("race").clientHeight;
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
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
  state.scene = new THREE.Scene();
  // Céu/névoa por ambiente: Mediterrâneo azul em Mônaco, tempo fechado nas
  // Ardenas. Noturna: céu quase negro (nunca preto puro — cidade/estádio ao
  // redor sempre reflete um pouco de luz) e névoa mais curta/escura, pra não
  // "queimar" o preto do céu na distância como a névoa diurna faria.
  const daySky = street ? "#9ccbea" : forest ? "#a3b2b6" : "#a9c8c7";
  state.scene.background = new THREE.Color(night ? "#050810" : daySky);
  state.scene.fog = new THREE.Fog(
    night ? "#050810" : daySky,
    (night ? 260 : forest ? 420 : 700) * scale,
    (night ? 1000 : forest ? 1500 : 1900) * scale
  );
  state.camera = new THREE.PerspectiveCamera(60, 1, .2, 2500 * Math.max(1, scale));
  state.renderer = new THREE.WebGLRenderer({
    canvas: byId("race"),
    antialias: true,
    powerPreference: "high-performance",
  });
  state.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = night ? .95 : 1.15;

  // De noite, o "sol" vira luar (bem mais fraco e frio) — a pista em si é
  // iluminada por holofotes emissivos (ver buildFloodlights abaixo), não
  // por luzes dinâmicas de verdade (custaria caro com 23 carros na cena).
  state.scene.add(new THREE.HemisphereLight("#d7f0ff", "#556c39", night ? .55 : 2.6));
  const sun = new THREE.DirectionalLight(night ? "#9db8ff" : "#fff2d1", night ? .4 : 2.5);
  sun.position.set(-300, 700, 100);
  state.scene.add(sun);

  // Materiais por ambiente. Autódromo ("park", o visual original): gramado
  // + faixa verde de escape. Rua ("street"): tudo pavimento, sem grama. Floresta:
  // gramado mais denso e escapes de asfalto.
  const groundMaterial = street ? makeMaterial("#7d786c") : forest ? makeMaterial("#4c7449") : MATERIALS.grass;
  const runoffMaterial = street ? makeMaterial("#666a6d") : forest ? makeMaterial("#626b6a") : MATERIALS.green;
  const sidewalkMaterial = makeMaterial("#8e8a7f");
  const wallMaterial = street ? makeMaterial("#ece9e0") : MATERIALS.barrier;

  // Porto de Mônaco (só rua com `harbor`): quadriláteros de água na margem
  // ESQUERDA dos trechos indicados (a Port Hercule fica dentro da grande
  // volta, do lado esquerdo da Beira-Mar e da perna da Piscina), estendidos
  // `depth` m pra dentro.
  const waterPolys = [];
  let waterY = 0;
  if (street && SCENERY.harbor) {
    let ySum = 0, yCount = 0;
    for (const [a, b] of SCENERY.harbor.segments) {
      const fa = state.track.at(a);
      const fb = state.track.at(b);
      const p0 = state.track.at(a, -(trackHalfWidthAt(a) + 8)).p;
      const p1 = state.track.at(b, -(trackHalfWidthAt(b) + 8)).p;
      const q0 = p0.clone().addScaledVector(fa.right, -SCENERY.harbor.depth);
      const q1 = p1.clone().addScaledVector(fb.right, -SCENERY.harbor.depth);
      waterPolys.push([p0, p1, q1, q0]);
      ySum += fa.p.y + fb.p.y;
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
  generateAsphaltTexture(state.renderer);

  for (const poly of waterPolys) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    addMesh(geo, new THREE.MeshStandardMaterial({ color: night ? "#0c2238" : "#2f86b3", roughness: .3, metalness: .15 }), 0, waterY, 0);
  }

  // Deslocamento lateral de "borda externa" (largura + alargamento em curva
  // + padding extra opcional), parametrizado por lado (-1 esquerda / 1 direita).
  // Nas curvas FECHADAS (hairpins), a borda do lado de DENTRO não pode passar
  // do raio da curva: um deslocamento lateral maior que o raio "dobra" a faixa
  // por cima dela mesma e cria lajes de terreno/calçada flutuando a alturas
  // erradas no meio da curva (era o "bug de elevação" no Grand Hotel Hairpin
  // de Mônaco e nos hairpins de Spa). Só em rua/floresta — os autódromos
  // originais mantêm a geometria de sempre.
  const guardInside = street || forest;
  const insideLimit = (side, s) => {
    if (!guardInside) return Infinity;
    const dyaw = wrapAngle(state.track.at(s + 4).yaw - state.track.at(s - 4).yaw);
    if (-side * dyaw <= 0) return Infinity; // lado de fora da curva
    return .8 / (Math.abs(dyaw) / 8 + 1e-6); // .8 × raio
  };
  // Outro problema parecido: as duas pernas de um hairpin (ou a Beira-Mar e o
  // Casino, em Mônaco) passam a poucas dezenas de metros uma da outra em
  // ALTURAS diferentes — calçada + rampa de uma perna avançavam por cima do
  // asfalto da outra, formando paredões/lajes soltas a 5–10 m do carro. Cada
  // faixa lateral pára na metade da distância até o outro trecho mais próximo
  // (amostras a >30 m de percurso mas a <70% disso em linha reta = "outra
  // perna", não a própria pista seguindo em frente).
  const clearanceCache = new Map();
  const legHalfGap = (s) => {
    if (!guardInside) return Infinity;
    const key = Math.round(s / 2);
    if (clearanceCache.has(key)) return clearanceCache.get(key);
    const p = state.track.at(s).p;
    let best = Infinity;
    const samples = state.track.samples;
    for (let i = 0; i < samples.length; i++) {
      const arc = Math.abs(((i * state.track.step - s) % TRACK_LENGTH + TRACK_LENGTH * 1.5) % TRACK_LENGTH - TRACK_LENGTH / 2);
      if (arc <= 30) continue;
      const d = Math.hypot(samples[i].x - p.x, samples[i].z - p.z);
      if (d < arc * .7 && d < best) best = d;
    }
    const half = best / 2;
    clearanceCache.set(key, half);
    return half;
  };
  const outerEdge = (side, extra = 0) => (s) => {
    const wall = trackHalfWidthAt(s) + cornerWideningAt(s, side);
    const offset = wall + (typeof extra === "function" ? extra(s) : extra);
    return side * Math.min(offset, Math.max(wall, Math.min(insideLimit(side, s), legHalfGap(s))));
  };
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
  buildRibbonMesh((s) => -trackHalfWidthAt(s) + .04, (s) => -trackHalfWidthAt(s) + .23, MATERIALS.line, .12);
  buildRibbonMesh((s) => trackHalfWidthAt(s) - .23, (s) => trackHalfWidthAt(s) - .04, MATERIALS.line, .12);
  buildCurbsMesh();

  // Guard-rails com postes de suporte a cada 3 segmentos (em rua: muro de
  // concreto mais alto e contínuo, sem postes).
  for (let s = 0; s < TRACK_LENGTH; s += 12) {
    for (const side of [-1, 1]) {
      const wallOffset = side * (trackHalfWidthAt(s) + cornerWideningAt(s, side));
      addAlignedBox(s, wallOffset, 1, street ? 1.5 : 1, 12.2, wallMaterial, -.2);
      if (!street && Math.floor(s / 12) % 3 === 0) {
        addAlignedBox(s, wallOffset, .15, 3, .15, MATERIALS.metal);
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
  addBox(.7, 8, .7, MATERIALS.metal, -10, 4, 0, gantry);
  addBox(.7, 8, .7, MATERIALS.metal, 10, 4, 0, gantry);
  addBox(21, 2, .7, MATERIALS.black, 0, 8, 0, gantry);
  for (let i = 0; i < 5; i++) addBox(.6, .6, .8, MATERIALS.lime, -3 + i * 1.5, 8, 0, gantry);

  // PRNG determinístico (Park-Miller) para árvores, prédios e morros de fundo
  // — o cenário fica sempre idêntico entre execuções (não usa Math.random aqui).
  let seed = 17;
  const rng = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);

  if (street) {
    buildCityBlocks(rng, groundHeightAt, inWater, waterY);
  } else if (forest) {
    buildForest(rng, scale, groundHeightAt);
  } else {
    const trunkMaterial = makeMaterial("#5a6550");
    const foliageMaterial = makeMaterial("#315a46");
    for (let i = 0; i < 140; i++) {
      const x = (rng() - .5) * 1700 * scale;
      const z = (rng() - .5) * 1700 * scale;
      const nearest = state.track.nearest(x, z);
      if (nearest.dist < 32) continue; // evita árvores em cima da pista
      const baseY = nearest.p.y - 1;
      const trunkHeight = 5 + rng() * 9;
      addMesh(new THREE.CylinderGeometry(.65, .9, trunkHeight, 5), trunkMaterial, x, baseY + trunkHeight / 2, z);
      addMesh(new THREE.ConeGeometry(4 + rng() * 3, 10, 6), foliageMaterial, x, baseY + trunkHeight, z);
    }
  }

  // Fundo distante. Autódromo: "morros" de caixas atrás da largada. Rua:
  // paredões rochosos e altos (Mônaco é espremida contra a montanha).
  // Floresta: colinas cônicas cobertas de mata em volta de toda a volta.
  if (forest) {
    const hillMaterials = [makeMaterial("#3f6644"), makeMaterial("#365a3d"), makeMaterial("#4a7049")];
    for (let i = 0; i < 46; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = (780 + rng() * 240) * scale;
      const r = 90 + rng() * 120;
      const h = 70 + rng() * 120;
      addMesh(new THREE.ConeGeometry(r, h, 7), hillMaterials[i % 3], Math.cos(angle) * radius, h / 2 - 20, Math.sin(angle) * radius);
    }
  } else {
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
