import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { tireBand, tireMaterial } from "./betaTire.js";

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

/**
 * Só na visão de dentro: o topo interno dos sidepods, ao lado do cockpit, escurece como o
 * carbono em volta do cockpit dos carros reais (no espaço do arquivo, como ACCENT_RULES).
 * Sem isso, a pintura clara ao sol vira uma parede branca ao lado do piloto.
 */
export const DARK_RULES = {
  // Rampas lineares (não degraus): a interpolação entre vértices dá uma borda limpa mesmo
  // em triângulos grandes. O sombreador corta em 0,5.
  Cube009: (x, y, z) => {
    const ramp = (value, width) => Math.min(1, Math.max(0, value / width));
    return Math.min(ramp(0.53 - Math.abs(x), 0.06), ramp(y - 0.38, 0.05), ramp(z + 0.1, 0.12), ramp(1.9 - z, 0.12));
  },
};

/**
 * Abertura do cockpit na visão de dentro. O monocoque do arquivo tem um convés (a chapa branca entre
 * a abertura e a borda do sidepod) na altura das mãos do piloto, e o cockpit do jogo é mais largo que
 * a abertura do modelo: o braço e a luva ficavam por baixo da chapa, atravessando-a. Por dentro vale
 * uma cópia da peça sem os triângulos desse convés; o cockpit do jogo fecha o espaço no lugar.
 * Medidas no espaço do carro: |x| entre as bordas, acima de `minY`, entre as duas pontas em z.
 */
export const COCKPIT_OPENING = { node: "Cube009", x: [0.15, 0.56], minY: 0.2, z: [-0.5, 0.8] };

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

/**
 * Borracha dos pneus: cinza-grafite com granulação fina e manchas de desgaste (as "marmoras" da
 * borracha usada). O ruído é calculado no espaço do objeto, então gira junto com a roda.
 */
function rubberMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#26272b", roughness: 0.82, metalness: 0 });
  material.customProgramCacheKey = () => "beta-car-rubber-1";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vRubberPoint;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvRubberPoint = position;",
    );
    shader.fragmentShader = `varying vec3 vRubberPoint;
float rubberHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rubberNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rubberHash(i), rubberHash(i + vec3(1,0,0)), f.x), mix(rubberHash(i + vec3(0,1,0)), rubberHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rubberHash(i + vec3(0,0,1)), rubberHash(i + vec3(1,0,1)), f.x), mix(rubberHash(i + vec3(0,1,1)), rubberHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float grain = rubberNoise(vRubberPoint * 520.0);
      float marble = rubberNoise(vRubberPoint * vec3(9.0, 9.0, 40.0));
      diffuseColor.rgb *= mix(0.72, 1.18, grain) * mix(0.8, 1.35, marble);`,
    ).replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (rubberNoise(vRubberPoint * 300.0) - 0.5) * 0.25, 0.5, 1.0);",
    );
  };
  return material;
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
  const dark = { value: 0 };
  material.userData.accent = uniform;
  material.userData.dark = dark;
  material.customProgramCacheKey = () => "beta-car-body-accent-3";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = uniform;
    shader.uniforms.uDark = dark;
    shader.vertexShader = `attribute float accentMask;\nattribute float darkMask;\nvarying float vAccent;\nvarying float vDark;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvAccent = accentMask;\nvDark = darkMask;",
    );
    shader.fragmentShader = `uniform vec3 uAccent;\nuniform float uDark;\nvarying float vAccent;\nvarying float vDark;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, smoothstep(0.35, 0.65, vAccent));\nfloat darkMix = smoothstep(0.35, 0.65, vDark) * uDark;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.05, 0.058), darkMix);",
    ).replace(
      "#include <lights_physical_fragment>",
      // Carbono fosco: sem verniz e áspero, senão o céu claro reflete em ângulo rasante e o preto vira branco.
      "#include <lights_physical_fragment>\nmaterial.roughness = mix(material.roughness, 0.8, darkMix);\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - darkMix;\n#endif",
    );
  };
  return material;
}

/** Grava uma máscara por vértice na geometria (uma vez; as instâncias dividem a mesma geometria). */
function bakeMask(mesh, root, rule, attribute) {
  const geometry = mesh.geometry;
  const flag = `${attribute}Baked`;
  if (geometry.userData[flag]) return;
  const position = geometry.attributes.position;
  const mask = new Float32Array(position.count);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    mask[i] = rule(point.x, point.y, point.z);
  }
  geometry.setAttribute(attribute, new THREE.BufferAttribute(mask, 1));
  geometry.userData[flag] = true;
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
  const onboardShown = [];
  for (const node of root.children) {
    const isBody = matches(node, NODES.body);
    const isWheel = matches(node, NODES.wheels);
    const isAccent = matches(node, NODES.accentFull);
    const hideOnboard = matches(node, NODES.onboardHidden) || matches(node, NODES.exteriorOnly);
    const key = Object.keys(ACCENT_RULES).find((name) => node.name.startsWith(name));
    const rule = isBody ? ACCENT_RULES[key] : null;
    const darkRule = isBody ? DARK_RULES[key] : null;
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
          if (rule) bakeMask(object, root, rule, "accentMask");
          if (darkRule) bakeMask(object, root, darkRule, "darkMask");
          object.material = body;
          if (node.name.startsWith(COCKPIT_OPENING.node)) {
            const opened = withCockpitOpening(object);
            if (opened) {
              onboardHidden.push(object);
              onboardShown.push(opened);
            }
          }
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
  for (const { pivot, side } of wheelPivots) paintTire(pivot, side, rubber);
  clipChassisFromTires(holder, wheelPivots);
  return { holder, wheelPivots, onboardHidden, onboardShown, bodyMaterial: body };
}

/**
 * Cópia da peça sem os triângulos da abertura do cockpit (ver COCKPIT_OPENING), escondida até a visão
 * de dentro, ou `null` se a peça não passa por ali. Divide material e atributos com a original.
 * Chamar com a matriz do mundo da peça já atualizada: as medidas são no espaço do carro.
 */
function withCockpitOpening(mesh) {
  const { x, minY, z } = COCKPIT_OPENING;
  const position = mesh.geometry.attributes.position;
  const source = mesh.geometry.index ? mesh.geometry.index.array : Array.from({ length: position.count }, (_, i) => i);
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const centroid = new THREE.Vector3();
  const kept = [];
  for (let t = 0; t < source.length; t += 3) {
    centroid.set(0, 0, 0);
    corners.forEach((corner, k) => centroid.add(corner.fromBufferAttribute(position, source[t + k]).applyMatrix4(mesh.matrixWorld)));
    centroid.multiplyScalar(1 / 3);
    const inside = Math.abs(centroid.x) > x[0] && Math.abs(centroid.x) < x[1] && centroid.y > minY && centroid.z > z[0] && centroid.z < z[1];
    if (!inside) kept.push(source[t], source[t + 1], source[t + 2]);
  }
  if (kept.length === source.length) return null;
  const copy = mesh.clone();
  copy.geometry = mesh.geometry.clone();
  copy.geometry.setIndex(kept);
  copy.name = `${mesh.name}-cockpit-open`;
  copy.visible = false;
  mesh.parent.add(copy);
  return copy;
}

/**
 * O maior pedaço de borracha da roda é o pneu: troca a borracha simples pelo material do pneu, que
 * desenha banda e inscrições, e orienta as letras para fora do carro nos dois lados.
 */
function paintTire(pivot, side, rubber) {
  let tire = null;
  pivot.traverse((mesh) => {
    if (mesh.isMesh && mesh.material === rubber && (!tire || mesh.geometry.attributes.position.count > tire.geometry.attributes.position.count)) tire = mesh;
  });
  if (!tire) return;
  tire.updateWorldMatrix(true, false);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(tire.matrixWorld);
  tire.material = tireMaterial({ band: tireBand(tire.geometry), out: Math.sign(axis.x * side) || 1 });
}

/** Folga entre a face interna do pneu e a borda cortada da peça do chassi. */
const TIRE_GAP = 0.004;

/**
 * O pneu dianteiro foi aumentado para tocar o chão e passou a engolir carenagens do chassi junto
 * à roda, que apareciam atravessando a borracha. Aqui os triângulos que ficam inteiros dentro da
 * zona do pneu (além da face interna, na faixa da roda e um pouco acima do topo, fora do cubo
 * onde chegam os braços da suspensão) são removidos, e os vértices dos triângulos que cruzam a
 * face são encostados nela. O corte fica escondido contra a lateral do pneu. Trabalha numa cópia
 * da geometria; a cena baixada continua intacta.
 */
export function clipChassisFromTires(holder, wheelPivots) {
  holder.updateMatrixWorld(true);
  const zones = wheelPivots.map(({ pivot }) => {
    const box = new THREE.Box3().setFromObject(pivot);
    const center = box.getCenter(new THREE.Vector3());
    const side = Math.sign(center.x);
    return {
      side,
      limit: (side > 0 ? box.min.x : box.max.x) - side * TIRE_GAP,
      cy: center.y,
      cz: center.z,
      radius: Math.min(box.max.y - box.min.y, box.max.z - box.min.z) / 2,
      pivot,
    };
  });
  const point = new THREE.Vector3();
  const inZone = (zone) => {
    if ((point.x - zone.limit) * zone.side <= 0) return false;
    const dy = point.y - zone.cy;
    const dz = point.z - zone.cz;
    return Math.abs(dz) < zone.radius + 0.1 && dy < zone.radius + 0.2 && Math.hypot(dy, dz) > zone.radius * 0.3;
  };
  holder.traverse((mesh) => {
    if (!mesh.isMesh || zones.some((zone) => zone.pivot.getObjectById(mesh.id))) return;
    const position = mesh.geometry.attributes.position;
    // Zona (índice) de cada vértice que cai dentro de um pneu; -1 fora.
    const hit = new Int8Array(position.count).fill(-1);
    let any = false;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const found = zones.findIndex(inZone);
      if (found >= 0) {
        hit[i] = found;
        any = true;
      }
    }
    if (!any) return;
    const source = mesh.geometry.index ? Array.from(mesh.geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
    const kept = [];
    for (let t = 0; t < source.length; t += 3) {
      if (hit[source[t]] >= 0 && hit[source[t + 1]] >= 0 && hit[source[t + 2]] >= 0) continue;
      kept.push(source[t], source[t + 1], source[t + 2]);
    }
    const copy = Float32Array.from({ length: position.count * 3 }, (_, k) => position.getComponent(Math.floor(k / 3), k % 3));
    const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    for (const i of new Set(kept)) {
      if (hit[i] < 0) continue;
      // Triângulo que cruza a face do pneu: o vértice de dentro é encostado na face.
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      point.x = zones[hit[i]].limit;
      point.applyMatrix4(toMesh);
      copy.set([point.x, point.y, point.z], i * 3);
    }
    const geometry = mesh.geometry.clone();
    geometry.setAttribute("position", new THREE.BufferAttribute(copy, 3));
    geometry.setIndex(kept);
    mesh.geometry = geometry;
  });
}
