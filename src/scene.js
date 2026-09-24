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
  ZEBRA_ZONES, APEX_GRASS_PATCHES, TRACK_NAME_PANEL_TEXT,
} from "./constants.js";
import { trackHalfWidthAt, cornerWideningAt } from "./track.js";
import { wrapAngle } from "./mathUtils.js";
import { byId } from "./dom.js";
import { MATERIALS, makeMaterial, addMesh, addBox, makeTextPanel } from "./materials.js";
import { drawTrackMap } from "./minimap.js";

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

  // Grid de largada numerado (23 posições marcadas no asfalto).
  for (let i = 0; i < 23; i++) {
    const s = TRACK_LENGTH - 245 + i * 20;
    addAlignedBox(s, 24, 7, .08, 18, MATERIALS.road, .06);
    addAlignedBox(s, 22.1, .18, .12, 8, MATERIALS.white, .15);
    addAlignedBox(s, 26, 6, 1.5, 16, gridPaint, 5.4);
    const numberFrame = state.track.at(s, 22);
    const numberPanel = makeTextPanel(String(i + 1).padStart(2, "0"), 3, .8);
    numberPanel.position.copy(numberFrame.p);
    numberPanel.position.y += 4.3;
    numberPanel.rotation.y = numberFrame.yaw + Math.PI / 2;
    state.scene.add(numberPanel);
  }

  // Arquibancadas: assentos instanciados (720 assentos, 5 cores alternadas).
  // As 8 estações são relativas ao comprimento da pista (perto do início E
  // do fim da volta — que, no traçado circular, é a mesma linha de largada).
  const grandstandStations = [90, 160, 230, TRACK_LENGTH - 409, TRACK_LENGTH - 339, TRACK_LENGTH - 269, TRACK_LENGTH - 199, TRACK_LENGTH - 129];
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
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color("#a9c8c7");
  state.scene.fog = new THREE.Fog("#a9c8c7", 700 * scale, 1900 * scale);
  state.camera = new THREE.PerspectiveCamera(60, 1, .2, 2500 * Math.max(1, scale));
  state.renderer = new THREE.WebGLRenderer({
    canvas: byId("race"),
    antialias: true,
    powerPreference: "high-performance",
  });
  state.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.15;

  state.scene.add(new THREE.HemisphereLight("#d7f0ff", "#556c39", 2.6));
  const sun = new THREE.DirectionalLight("#fff2d1", 2.5);
  sun.position.set(-300, 700, 100);
  state.scene.add(sun);

  // Terreno: grande plano cujo relevo segue (com suavização por distância
  // inversa) a elevação de amostras da pista, formando um "vale" ao redor
  // dela (terreno ~5m abaixo do nível médio da pista).
  const ground = new THREE.PlaneGeometry(2100 * scale, 2100 * scale, 74, 74);
  ground.rotateX(-Math.PI / 2);
  const groundPos = ground.attributes.position;
  const referencePoints = state.track.samples.filter((_, i) => i % 18 === 0);
  for (let i = 0; i < groundPos.count; i++) {
    const x = groundPos.getX(i);
    const z = groundPos.getZ(i);
    let weightedY = 0;
    let weightSum = 0;
    for (const ref of referencePoints) {
      const weight = 1 / Math.pow(35 + Math.hypot(x - ref.x, z - ref.z), 4);
      weightedY += ref.y * weight;
      weightSum += weight;
    }
    groundPos.setY(i, weightedY / weightSum - 5);
  }
  ground.computeVertexNormals();
  addMesh(ground, MATERIALS.grass);
  generateAsphaltTexture(state.renderer);

  // Deslocamento lateral de "borda externa" (largura + alargamento em curva
  // + padding extra opcional), parametrizado por lado (-1 esquerda / 1 direita).
  const outerEdge = (side, extra = 0) => (s) => side * (trackHalfWidthAt(s) + cornerWideningAt(s, side) + extra);

  buildRibbonMesh(outerEdge(-1, 15), outerEdge(-1), MATERIALS.grass, [-11, -.2]);
  buildRibbonMesh(outerEdge(1), outerEdge(1, 15), MATERIALS.grass, [-.2, -11]);
  buildRibbonMesh(outerEdge(-1), outerEdge(1), MATERIALS.green, -.2);
  buildRibbonMesh((s) => -trackHalfWidthAt(s), trackHalfWidthAt, MATERIALS.road, .1);
  buildRibbonMesh((s) => -trackHalfWidthAt(s) + .04, (s) => -trackHalfWidthAt(s) + .23, MATERIALS.line, .12);
  buildRibbonMesh((s) => trackHalfWidthAt(s) - .23, (s) => trackHalfWidthAt(s) - .04, MATERIALS.line, .12);
  buildCurbsMesh();

  // Guard-rails com postes de suporte a cada 3 segmentos.
  for (let s = 0; s < TRACK_LENGTH; s += 12) {
    for (const side of [-1, 1]) {
      addAlignedBox(s, side * (trackHalfWidthAt(s) + cornerWideningAt(s, side)), 1, 1, 12.2, MATERIALS.barrier, -.2);
      if (Math.floor(s / 12) % 3 === 0) {
        addAlignedBox(s, side * (trackHalfWidthAt(s) + cornerWideningAt(s, side)), .15, 3, .15, MATERIALS.metal);
      }
    }
  }

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

  // Estrutura de telhado das arquibancadas (23 vãos).
  for (let i = 0; i < 23; i++) {
    const s = TRACK_LENGTH - 245 + i * 20;
    addAlignedBox(s, 30, 15, 5.8, 18.8, MATERIALS.roof, -.4);
    addAlignedBox(s, 22.4, .12, 3.5, 14, MATERIALS.black, .1);
    addAlignedBox(s, 22.2, .2, .6, 15, MATERIALS.lime, 4);
  }

  // Paredes de fundo das arquibancadas (faixas coloridas em camadas), nas
  // extremidades reta dos boxes / área de largada (mesmas estações dos assentos).
  const wallColors = [makeMaterial("#c4d93e"), makeMaterial("#429b92"), makeMaterial("#eef1dc")];
  for (const s of [90, 160, 230, TRACK_LENGTH - 409, TRACK_LENGTH - 339, TRACK_LENGTH - 269, TRACK_LENGTH - 199, TRACK_LENGTH - 129]) {
    for (let i = 0; i < 5; i++) {
      addAlignedBox(s, -29 - i * 3, 3, 1.5, 56, wallColors[i % 3], i * 1.25);
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

  // PRNG determinístico (Park-Miller) para árvores e morros de fundo — o
  // cenário fica sempre idêntico entre execuções (não usa Math.random aqui).
  let seed = 17;
  const rng = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);

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

  // "Morros" de fundo (caixas simples atrás da área de largada).
  for (let i = 0; i < 65; i++) {
    const x = (rng() - .5) * 1900 * scale;
    const z = -880 * scale - rng() * 260;
    const h = 15 + rng() * 90;
    addBox(15 + rng() * 30, h, 15 + rng() * 30, makeMaterial(i % 2 ? "#91a9a9" : "#7b9699"), x, h / 2, z);
  }

  buildTrackDecorations();
  mergeStaticMeshesByMaterial();
  buildRacingLineMesh();

  // Mapa estático de pré-visualização (barra lateral do menu).
  drawTrackMap(byId("map"), false);

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
