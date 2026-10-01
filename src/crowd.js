// Público das arquibancadas da 2.0: torcedores que pulam, levantam os braços e
// agitam bandeiras. Toda a animação roda no vertex shader (nenhuma matriz é
// reescrita na CPU): cada instância deriva a própria fase da posição, então
// continua sendo uma malha instanciada estática, compatível com os blocos
// espaciais de instanceChunks.js.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { prefersReducedMotion } from "./accessibility.js";

/** Camisetas: cores de equipes e da seleção, com pesos para o vermelho/branco dominarem. */
export const SHIRT_COLORS = [
  ["#c9303a", 4], // vermelho (equipe italiana)
  ["#e9e4d6", 6],
  ["#e8c83a", 3], // amarelo da seleção
  ["#2f8f55", 2],
  ["#ec8a2c", 2], // laranja (papaya)
  ["#26335f", 3],
  ["#3fb6aa", 2],
  ["#3f78d0", 2],
  ["#2b5f55", 2],
  ["#2a2e31", 3],
  ["#d9739b", 1],
];

export const SKIN_TONES = ["#f1c9a5", "#e8b894", "#d9a37c", "#b87b55", "#8a5a3b", "#5e3b26"];

/** Bandeiras (ordem = coluna na textura do atlas): Brasil, vermelha, azul e branca, verde-limão. */
export const FLAG_VARIANTS = ["brasil", "vermelha", "azul", "lima"];

const SHOULDER_Y = 0.2;
const ARM_Z = 0.17;

const uniforms = {
  uCrowdTime: { value: 0 },
  uCrowdPlayer: { value: new THREE.Vector3(1e5, 0, 1e5) },
  uCrowdAmp: { value: 1 },
};

/** Sorteia uma cor ponderada de `SHIRT_COLORS` a partir de um número em [0, 1). */
export function pickShirtColor(r) {
  const total = SHIRT_COLORS.reduce((sum, [, weight]) => sum + weight, 0);
  let acc = r * total;
  for (const [color, weight] of SHIRT_COLORS) {
    acc -= weight;
    if (acc < 0) return color;
  }
  return SHIRT_COLORS[0][0];
}

/** Atributo por vértice: 0 = tronco, ±1 = braço do lado z correspondente. */
function withArmAttribute(geometry, side) {
  const array = new Float32Array(geometry.attributes.position.count).fill(side);
  geometry.setAttribute("aArm", new THREE.BufferAttribute(array, 1));
  return geometry;
}

/**
 * Torcedor em pé: tronco hexagonal e dois braços triangulares pendurados nos
 * ombros (36 triângulos no total, menos que a cápsula que ele substitui).
 * Eixos locais: -x é a frente (para a pista), z é a largura dos ombros.
 */
export function buildFanGeometry() {
  const torso = withArmAttribute(new THREE.CylinderGeometry(0.15, 0.17, 0.6, 6, 1), 0);
  const parts = [torso];
  for (const side of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.05, 0.04, 0.34, 3, 1, true);
    arm.translate(0, SHOULDER_Y - 0.17, side * ARM_Z);
    parts.push(withArmAttribute(arm, side));
  }
  return mergeGeometries(parts);
}

export function buildHeadGeometry() {
  return new THREE.OctahedronGeometry(0.16);
}

/** Bandeira: mastro fino + pano 0,62 × 0,4 (a coluna do pano vai de u = 0 no mastro a u = 1 na ponta). */
export function buildFlagGeometry() {
  const pole = new THREE.BoxGeometry(0.025, 1.05, 0.025);
  pole.translate(0, 0.72, ARM_Z);
  pole.setAttribute("aCloth", new THREE.BufferAttribute(new Float32Array(pole.attributes.position.count), 1));
  const cloth = new THREE.PlaneGeometry(0.62, 0.4, 5, 1);
  cloth.rotateY(-Math.PI / 2);
  cloth.translate(0, 1.05, ARM_Z + 0.31 + 0.012);
  cloth.setAttribute("aCloth", new THREE.BufferAttribute(new Float32Array(cloth.attributes.position.count).fill(1), 1));
  return mergeGeometries([pole, cloth]);
}

/** Pano das bandeiras num atlas 5 × 1 (as quatro bandeiras + uma célula cinza para o mastro). */
export function makeFlagAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  const cell = (index, paint) => {
    ctx.save();
    ctx.translate(index * 64, 0);
    ctx.beginPath();
    ctx.rect(0, 0, 64, 40);
    ctx.clip();
    paint();
    ctx.restore();
  };
  cell(0, () => {
    ctx.fillStyle = "#119a47";
    ctx.fillRect(0, 0, 64, 40);
    ctx.fillStyle = "#f6d21c";
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.lineTo(60, 20);
    ctx.lineTo(32, 36);
    ctx.lineTo(4, 20);
    ctx.fill();
    ctx.fillStyle = "#1e4f9c";
    ctx.beginPath();
    ctx.arc(32, 20, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4f2e6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 25, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  });
  cell(1, () => {
    ctx.fillStyle = "#d0202a";
    ctx.fillRect(0, 0, 64, 40);
    ctx.fillStyle = "#f4f2e6";
    ctx.fillRect(0, 16, 64, 8);
  });
  cell(2, () => {
    ctx.fillStyle = "#1f4f9c";
    ctx.fillRect(0, 0, 64, 40);
    ctx.fillStyle = "#f4f2e6";
    ctx.fillRect(0, 0, 64, 13);
    ctx.fillRect(0, 27, 64, 13);
  });
  cell(3, () => {
    ctx.fillStyle = "#d5fc51";
    ctx.fillRect(0, 0, 64, 40);
    ctx.fillStyle = "#173c35";
    ctx.fillRect(0, 30, 64, 10);
    ctx.fillRect(0, 0, 64, 5);
  });
  cell(4, () => {
    ctx.fillStyle = "#5a5f60";
    ctx.fillRect(0, 0, 64, 40);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Movimento comum a todas as peças. A fase vem da posição XZ da instância (o
 * corpo e a cabeça do mesmo torcedor concordam). Quem está perto do carro do
 * jogador vibra mais, e uma "ola" lenta atravessa as arquibancadas.
 */
const MOTION_VERTEX = /* glsl */ `
  vec3 crowdPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float crowdH = fract(sin(dot(crowdPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float crowdH2 = fract(crowdH * 17.31);
  float crowdNear = smoothstep(140.0, 15.0, distance(crowdPos, uCrowdPlayer));
  float crowdWave = pow(0.5 + 0.5 * sin(uCrowdTime * 0.55 - dot(crowdPos.xz, vec2(0.7, 0.7)) * 0.035), 6.0);
  float crowdExcite = clamp(0.12 + 0.9 * crowdNear + 0.55 * crowdWave + CROWD_BONUS, 0.0, 1.0);
  float crowdRate = 3.2 + crowdH * 2.6;
  float crowdPhase = uCrowdTime * crowdRate + crowdH * 6.2831;
  float crowdBeat = max(0.0, sin(crowdPhase));
  float crowdSoft = 0.5 + 0.5 * sin(crowdPhase);
  float crowdSeated = crowdH2 < 0.18 ? 0.2 : 1.0;
  float crowdHop = crowdBeat * crowdBeat * (0.035 + 0.26 * crowdExcite) * crowdSeated * uCrowdAmp;
`;

const HEADER = /* glsl */ `
  uniform float uCrowdTime;
  uniform vec3 uCrowdPlayer;
  uniform float uCrowdAmp;
`;

function applyUniforms(shader) {
  shader.uniforms.uCrowdTime = uniforms.uCrowdTime;
  shader.uniforms.uCrowdPlayer = uniforms.uCrowdPlayer;
  shader.uniforms.uCrowdAmp = uniforms.uCrowdAmp;
}

function motionMaterial(base, key, patch) {
  const material = new THREE.MeshStandardMaterial(base);
  material.onBeforeCompile = (shader) => {
    applyUniforms(shader);
    shader.vertexShader = patch(shader.vertexShader.replace("#include <common>", "#include <common>" + HEADER));
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Corpo (tronco + braços). `bearer` mantém o braço direito erguido, segurando a bandeira. */
export function makeFanMaterial({ bearer = false } = {}) {
  const bonus = bearer ? "0.3" : "0.0";
  return motionMaterial({ color: "#ffffff", roughness: 0.9 }, bearer ? "crowd-bearer" : "crowd-fan", (vertex) =>
    vertex
      .replace("#include <common>", "#include <common>\nattribute float aArm;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #define CROWD_BONUS ${bonus}
        ${MOTION_VERTEX}
        if (aArm != 0.0) {
          float raise = clamp((crowdExcite - 0.18) * 3.0, 0.0, 1.0) * (1.4 + 1.3 * crowdSoft) * step(0.3, crowdH2);
          raise += 0.12 * crowdSoft * uCrowdAmp;
          ${bearer ? "if (aArm > 0.0) raise = 2.6 + 0.3 * crowdSoft * uCrowdAmp;" : ""}
          float theta = -aArm * raise;
          vec3 pivot = vec3(0.0, ${SHOULDER_Y.toFixed(2)}, aArm * ${ARM_Z.toFixed(2)});
          vec3 d = transformed - pivot;
          transformed = pivot + vec3(d.x, d.y * cos(theta) - d.z * sin(theta), d.y * sin(theta) + d.z * cos(theta));
        }
        transformed.y += crowdHop;`,
      ),
  );
}

export function makeHeadMaterial() {
  return motionMaterial({ color: "#ffffff", roughness: 0.85 }, "crowd-head", (vertex) =>
    vertex.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #define CROWD_BONUS 0.0
      ${MOTION_VERTEX}
      transformed.y += crowdHop;`,
    ),
  );
}

export function makeFlagMaterial(map) {
  return motionMaterial({ map, roughness: 0.8, side: THREE.DoubleSide }, "crowd-flag", (vertex) =>
    vertex
      .replace("#include <common>", "#include <common>\nattribute float aFlag;\nattribute float aCloth;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vMapUv = vec2((uv.x + (aCloth > 0.5 ? aFlag : 4.0)) / 5.0, uv.y);`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #define CROWD_BONUS 0.3
        ${MOTION_VERTEX}
        float flutter = aCloth > 0.5 ? sin(uCrowdTime * 9.0 + position.z * 11.0 + crowdH * 6.0) * 0.05 * uv.x * uCrowdAmp : 0.0;
        transformed.x += flutter;
        transformed.y += crowdHop + (aCloth > 0.5 ? 0.04 * crowdSoft * uCrowdAmp : 0.0);`,
      ),
  );
}

/**
 * Cria as malhas do público. Devolve `{ fans, bearers, heads, flags }` já com a
 * capacidade pedida; quem chama preenche matrizes/cores e ajusta `.count`.
 * `flags` tem um atributo instanciado `aFlag` (coluna do atlas).
 */
export function createCrowdMeshes({ fans, bearers, flags }) {
  const fanGeometry = buildFanGeometry();
  const make = (geometry, material, count, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  };
  const heads = make(buildHeadGeometry(), makeHeadMaterial(), fans + bearers, "crowd-heads");
  const fanMesh = make(fanGeometry, makeFanMaterial(), fans, "crowd-fans");
  const bearerMesh = make(fanGeometry, makeFanMaterial({ bearer: true }), bearers, "crowd-bearers");
  const flagMesh = make(buildFlagGeometry(), makeFlagMaterial(makeFlagAtlas()), flags, "crowd-flags");
  flagMesh.geometry.setAttribute("aFlag", new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, flags)), 1));
  // As bandeiras são poucas: ficam inteiras (sem blocos) e guardam o atributo `aFlag`.
  flagMesh.userData.keepWhole = true;
  return { fans: fanMesh, bearers: bearerMesh, heads, flags: flagMesh };
}

/** Atualiza o relógio e o carro de referência. Chamar uma vez por quadro, com `state.clockTime`. */
export function updateCrowd(clockTime, playerPosition) {
  uniforms.uCrowdTime.value = clockTime;
  if (playerPosition) uniforms.uCrowdPlayer.value.copy(playerPosition);
  uniforms.uCrowdAmp.value = prefersReducedMotion() ? 0 : 1;
}
