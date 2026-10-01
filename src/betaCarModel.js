import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Carro de F1 de terceiros: "F1 2022 {FREE!!}" por 3dblenderlol, CC BY 4.0
 * (https://creativecommons.org/licenses/by/4.0/). Créditos completos em
 * public/assets/cars/CREDITS.md e no menu da 2.0.
 *
 * O arquivo já vem em metros, com o nariz em +z. Os números abaixo encaixam o
 * modelo no carro do jogo (eixos em z = 1,45 e −1,52) e apoiam o pneu traseiro
 * no chão (y = 0).
 */
export const CAR_MODEL_URL = "./assets/cars/f1_2022.glb";

export const CAR_FIT = { scale: 0.958, y: 0.093, z: -0.849 };

/** Quanto o cockpit do jogo desce para casar com a altura real do piloto neste carro. */
export const COCKPIT_DROP = 0.28;

/** Quanto o olho avança: a cabeça fica logo à frente da caixa de ar do motor. */
export const COCKPIT_FORWARD = 0.1;

/** Nós do arquivo (prefixos) e o que fazer com cada um. */
export const NODES = {
  // Carroceria: base clara com detalhes na cor do jogador (ver ACCENT_RULES).
  body: ["Cube_3", "Cube009", "Cube008", "Cube006", "Cube015"],
  wheels: ["Cylinder_4", "Cylinder007", "Cylinder001", "Cylinder006"],
  // Halo inteiro na cor do jogador, como na foto de referência.
  accentFull: ["Cube005"],
  // Só aparecem por fora: o cockpit do jogo ocupa o lugar deles na visão de dentro.
  exteriorOnly: ["Cube005", "Cube047", "steering", "Cylinder003", "Cylinder004"],
  // Escondidos na visão de dentro: o monocoque cobriria braços e mãos, e a caixa de ar do
  // motor fica atrás do capacete.
  onboardHidden: ["Cube_3", "Cube008"],
};

/**
 * Onde a cor do jogador entra em cada peça, no espaço do arquivo (x lateral, y para cima,
 * z para a frente; o nariz termina em z ≈ 3,6). Devolve 1 para pintar o vértice com o
 * destaque e 0 para deixá-lo claro.
 */
export const ACCENT_RULES = {
  // Faixa central do bico e do capô, como o "1" e as listras do carro da foto.
  Cube_3: (x, y, z) => (Math.abs(x) < 0.05 && z > 2.0 ? 1 : 0),
  Cube008: (x) => (Math.abs(x) < 0.05 ? 1 : 0),
  // Borda de ataque das entradas de ar dos sidepods.
  Cube009: (_x, _y, z) => (z > 1.62 ? 1 : 0),
  // Asa dianteira: laterais e linhas finas entre os elementos, como as da foto.
  Cube006: (x) => (Math.abs(x) > 0.84 ? 1 : 0),
  // Asa traseira: pontas das laterais.
  Cube015: (x) => (Math.abs(x) > 0.5 || Math.abs(x) < 0.04 ? 1 : 0),
};

let loading = null;
let cached = null;

/** Baixa o GLB uma vez. Resolve com a cena original (nunca modificada). */
export function preloadCarModel(url = CAR_MODEL_URL) {
  loading ??= new GLTFLoader().loadAsync(url).then((gltf) => {
    cached = gltf.scene;
    return cached;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Cena já baixada, ou `null` enquanto o arquivo não chegou. */
export const carModelIfReady = () => cached;

const matches = (node, prefixes) => prefixes.some((prefix) => node.name.startsWith(prefix));

function rubberMaterial() {
  return new THREE.MeshStandardMaterial({ color: "#1b1b1e", roughness: 0.86, metalness: 0 });
}

function carbonMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: "#16181b", roughness: 0.42, metalness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
}

/**
 * Pintura clara com destaque: o atributo `accentMask` (0–1) de cada vértice mistura a base
 * com a cor do jogador. A cor vem do material de pintura do jogo, então acompanha a escolha.
 */
function bodyMaterial(accent) {
  const material = new THREE.MeshPhysicalMaterial({ color: "#e2e3e7", roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.12 });
  const uniform = { value: accent.clone() };
  material.userData.accent = uniform;
  material.customProgramCacheKey = () => "beta-car-body-accent-1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = uniform;
    shader.vertexShader = `attribute float accentMask;\nvarying float vAccent;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvAccent = accentMask;",
    );
    shader.fragmentShader = `uniform vec3 uAccent;\nvarying float vAccent;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, smoothstep(0.35, 0.65, vAccent));",
    );
  };
  return material;
}

/** Grava `accentMask` na geometria (uma vez; as instâncias dividem a mesma geometria). */
function bakeAccentMask(mesh, root, rule) {
  const geometry = mesh.geometry;
  if (geometry.userData.accentBaked) return;
  const position = geometry.attributes.position;
  const mask = new Float32Array(position.count);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    mask[i] = rule(point.x, point.y, point.z);
  }
  geometry.setAttribute("accentMask", new THREE.BufferAttribute(mask, 1));
  geometry.userData.accentBaked = true;
}

/**
 * Monta uma instância do carro a partir da cena baixada: clona, ajusta escala e
 * posição, recoloca a pintura do jogador e cria um pivô por roda para girá-las.
 * Devolve o grupo e os pivôs das rodas (frente esquerda, frente direita, etc.
 * conforme a ordem do arquivo).
 */
export function buildCarFromModel(source, paint) {
  const model = source.clone(true);
  const holder = new THREE.Group();
  holder.name = "beta-car-model";
  holder.scale.setScalar(CAR_FIT.scale);
  holder.position.set(0, CAR_FIT.y, CAR_FIT.z);
  holder.add(model);
  holder.updateMatrixWorld(true);

  const rubber = rubberMaterial();
  const carbon = carbonMaterial();
  const body = bodyMaterial(paint.color);
  const root = model.getObjectByName("GLTF_SceneRootNode") ?? model;
  root.updateMatrixWorld(true);

  const onboardHidden = [];
  for (const node of root.children) {
    const isBody = matches(node, NODES.body);
    const isWheel = matches(node, NODES.wheels);
    const isAccent = matches(node, NODES.accentFull);
    const hideOnboard = matches(node, NODES.onboardHidden) || matches(node, NODES.exteriorOnly);
    const key = Object.keys(ACCENT_RULES).find((name) => node.name.startsWith(name));
    const rule = isBody ? ACCENT_RULES[key] : null;
    node.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (hideOnboard) onboardHidden.push(object);
      const hex = object.material.color.getHex();
      if (isWheel) {
        // "Material" preta = borracha; o anel amarelo do composto vira borracha também (pneus lisos).
        if (hex === 0x000000 || hex === 0xe7c700) object.material = rubber;
      } else if (isAccent) {
        if (hex === 0x000000) object.material = paint;
      } else if (hex === 0x000000) {
        if (isBody) {
          if (rule) bakeAccentMask(object, root, rule);
          object.material = body;
        } else {
          object.material = carbon;
        }
      }
    });
  }

  // Um pivô no centro de cada roda, para girar em torno do eixo (x) sem sair do lugar.
  const wheelPivots = [];
  for (const node of [...root.children].filter((n) => matches(n, NODES.wheels))) {
    const box = new THREE.Box3().setFromObject(node);
    const center = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.name = "beta-car-wheel";
    holder.worldToLocal(center);
    pivot.position.copy(center);
    holder.add(pivot);
    pivot.attach(node);
    // O arquivo tem o pneu dianteiro menor e mais alto do que o traseiro: aumenta e desce um pouco
    // para os quatro tocarem o chão.
    const front = center.z > 1;
    if (front) {
      pivot.scale.setScalar(1.12);
      pivot.position.y -= 0.03;
    }
    wheelPivots.push({ pivot, front, side: Math.sign(center.x) });
  }
  return { holder, wheelPivots, onboardHidden, bodyMaterial: body };
}
