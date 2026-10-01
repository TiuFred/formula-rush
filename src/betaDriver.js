import * as THREE from "three";
import { addMesh } from "./materials.js";
import { GRIP_ANCHOR, HAND_FIT, HAND_SCALE } from "./betaWheel.js";

/**
 * Piloto da 2.0 visto de dentro: macacão, antebraços com cinemática inversa,
 * luvas articuladas e coxas, no espaço local do cockpit. O tecido do macacão vem
 * de uma textura real (ver `SUIT_TEXTURE`); o resto é gerado em canvas.
 */

const rad = THREE.MathUtils.degToRad;

/**
 * Sarja cinza-escura "Denim Fabric 05" (Poly Haven, CC0). Créditos em
 * public/assets/suit/CREDITS.md.
 */
export const SUIT_TEXTURE = {
  diffuse: "./assets/suit/denim_fabric_05_diff_1k.jpg",
  normal: "./assets/suit/denim_fabric_05_nor_gl_1k.jpg",
  rough: "./assets/suit/denim_fabric_05_rough_1k.jpg",
};

const canLoadImages = () => typeof window !== "undefined" && typeof Image !== "undefined";

/** Canvas com tecido gerado por código: base de cor, dependendo de `draw`. */
function canvasTexture(draw, width = 128, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

const textureLoader = new THREE.TextureLoader();

function loadTexture(url, srgb) {
  const texture = textureLoader.load(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Cópia do mapa com o próprio `repeat`: o carregamento é compartilhado, a repetição não. */
function repeated(texture, repeat) {
  const own = texture.clone();
  own.repeat.set(repeat[0], repeat[1]);
  own.needsUpdate = true;
  return own;
}

let suitMaps = null;

/** Carrega as três texturas do tecido uma vez e as compartilha (clone só do `repeat`). */
function loadSuitMaps() {
  suitMaps ??= {
    map: loadTexture(SUIT_TEXTURE.diffuse, true),
    normalMap: loadTexture(SUIT_TEXTURE.normal, false),
    roughnessMap: loadTexture(SUIT_TEXTURE.rough, false),
  };
  return suitMaps;
}

/**
 * Camurça elástica "Scuba Suede" (Poly Haven, CC0; créditos em public/assets/suit/CREDITS.md): só o
 * relevo e o brilho (normal e rugosidade) vão para a luva, de tecido técnico; a cor é pintada em canvas.
 */
export const GLOVE_TEXTURE = {
  normal: "./assets/suit/scuba_suede_nor_gl_1k.jpg",
  rough: "./assets/suit/scuba_suede_rough_1k.jpg",
};

let gloveMaps = null;

/** Dá à luva o relevo da camurça técnica; sem imagens (testes, falha de rede) fica só a pintura. */
function withGloveRelief(material, repeat) {
  if (!canLoadImages()) return material;
  gloveMaps ??= { normalMap: loadTexture(GLOVE_TEXTURE.normal, false), roughnessMap: loadTexture(GLOVE_TEXTURE.rough, false) };
  material.normalMap = repeated(gloveMaps.normalMap, repeat);
  material.roughnessMap = repeated(gloveMaps.roughnessMap, repeat);
  material.normalScale.set(0.8, 0.8);
  material.roughness = 1;
  return material;
}

/**
 * Macacão ignífugo. Com a textura real: sarja com relevo e brilho de tecido, tingida de
 * `tint`. Sem ela (testes, falha de rede) cai num acolchoado desenhado em canvas.
 * `repeat` = quantas vezes o tecido se repete em volta e ao longo da peça.
 */
export function suitMaterial(tint = [0.09, 0.14, 0.36], repeat = [3, 3]) {
  if (!canLoadImages()) {
    const map = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = "#1a2230";
      ctx.fillRect(0, 0, w, h);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  }
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1) });
  // A sarja é cinza (≈13% de reflectância); o multiplicador acima de 1 leva ao azul-marinho do macacão.
  material.color.setRGB(...tint);
  for (const [key, texture] of Object.entries(loadSuitMaps())) material[key] = repeated(texture, repeat);
  return material;
}

/** Tecido da luva: Nomex grafite com uma trama fina, mais o relevo da camurça técnica. */
export function gloveFabric(base = "#25282e", repeat = [6, 6]) {
  const map = canvasTexture((ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < size; i += 4) ctx.fillRect(i, 0, 1, size);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < size; i += 4) ctx.fillRect(0, i, size, 1);
  });
  map.repeat.set(repeat[0], repeat[1]);
  return withGloveRelief(new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0.02 }), [3, 5]);
}

/**
 * Dorso da luva pintado em canvas (UV de esfera: u = 0,5 é o centro do dorso e u = 0,25 a
 * direção dos dedos): malha perfurada, faixa na cor da equipe sobre os nós e um friso central.
 */
function gloveBackMaterial(teamColor) {
  const map = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#2a2d33";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    for (let y = 6; y < h; y += 10) {
      for (let x = (y / 10) % 2 ? 2 : 7; x < w; x += 10) {
        ctx.beginPath();
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Painel dos nós dos dedos e friso central, na cor da equipe.
    ctx.fillStyle = teamColor;
    ctx.fillRect(w * 0.285, h * 0.18, w * 0.05, h * 0.64);
    ctx.fillRect(w * 0.49, h * 0.2, w * 0.02, h * 0.6);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(w * 0.275, h * 0.18, w * 0.008, h * 0.64);
    ctx.fillRect(w * 0.335, h * 0.18, w * 0.008, h * 0.64);
  }, 512, 256);
  return withGloveRelief(new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.02 }), [4, 2]);
}

/**
 * Tubo de seção circular com raio variável e pontas arredondadas: serve para dedos
 * e polegar. `radius(t)` recebe t em 0–1 ao longo da curva.
 */
function sweep(points, radius, material, parent, { segments = 36, radial = 14, cap = 5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const frames = curve.computeFrenetFrames(segments, false);
  const rings = [];
  const ring = (center, r, i) => rings.push({ center, r, normal: frames.normals[i], binormal: frames.binormals[i] });
  const startPoint = curve.getPointAt(0);
  const endPoint = curve.getPointAt(1);
  const r0 = radius(0);
  const r1 = radius(1);
  for (let k = cap; k >= 1; k--) {
    const a = (k / cap) * (Math.PI / 2);
    ring(startPoint.clone().addScaledVector(frames.tangents[0], -r0 * Math.sin(a)), r0 * Math.cos(a), 0);
  }
  for (let i = 0; i <= segments; i++) ring(curve.getPointAt(i / segments), radius(i / segments), i);
  for (let k = 1; k <= cap; k++) {
    const a = (k / cap) * (Math.PI / 2);
    ring(endPoint.clone().addScaledVector(frames.tangents[segments], r1 * Math.sin(a)), r1 * Math.cos(a), segments);
  }
  const positions = [];
  const uvs = [];
  const indices = [];
  rings.forEach(({ center, r, normal, binormal }, ringIndex) => {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      uvs.push(j / radial, ringIndex / (rings.length - 1));
      positions.push(
        center.x + (normal.x * Math.cos(a) + binormal.x * Math.sin(a)) * r,
        center.y + (normal.y * Math.cos(a) + binormal.y * Math.sin(a)) * r,
        center.z + (normal.z * Math.cos(a) + binormal.z * Math.sin(a)) * r,
      );
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      indices.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(geometry, material, 0, 0, 0, parent);
}

// ---------------------------------------------------------------------------
// Luva, modelada para a mão ESQUERDA no referencial H: origem no centro do punho,
// +z do punho para os nós dos dedos (a direção do antebraço), +x o dorso da mão e
// +y o lado do polegar (indicador em cima). Os dedos se fecham para -x, como num
// punho em volta de uma empunhadura. A mão direita é o espelho (escala x = -1).
// ---------------------------------------------------------------------------
const DOME = { center: [0, 0, 0.05], radii: [0.0185, 0.043, 0.057] };
/** Onde cada dedo nasce na mão: o nó (articulação com a palma), no eixo x e z da luva. */
const KNUCKLE = { x: 0.003, z: 0.088 };

/**
 * Centro do arco que os dedos fazem, no referencial da luva e antes da escala: é o eixo da
 * empunhadura quando a luva a segura. Fica `HAND_FIT.curl` para o lado de dentro (-x) do nó.
 */
export function gripInHand(out = new THREE.Vector3()) {
  return out.set(KNUCKLE.x - HAND_FIT.curl, 0, KNUCKLE.z);
}

/**
 * Caminho de um dedo: sai do nó apontando para a frente e se enrola em volta de um círculo de raio
 * `curl` (as três falanges são cordas desse círculo), terminando de volta para o piloto.
 */
function fingerPath(y, lengths, curl) {
  const mcp = [KNUCKLE.x, y, KNUCKLE.z];
  const points = [[mcp[0] + 0.01, mcp[1], mcp[2] - 0.03], mcp.slice()];
  const arcs = lengths.map((length) => length / curl);
  let alpha = 0;
  let [x, , z] = mcp;
  lengths.forEach((length, i) => {
    // A corda aponta na direção média do arco que cobre: metade do arco anterior mais metade deste.
    alpha += ((i === 0 ? 0 : arcs[i - 1]) + arcs[i]) / 2;
    x -= Math.sin(alpha) * length;
    z += Math.cos(alpha) * length;
    points.push([x, y, z]);
  });
  return points;
}

/** Raio ao longo do dedo: afina para a ponta e marca as dobras com sulcos finos. */
function fingerRadius(base, joints) {
  return (t) => {
    let r = base * (1 - 0.18 * t);
    for (const j of joints) r *= 1 - 0.09 * Math.exp(-(((t - j) / 0.04) ** 2));
    return r;
  };
}

/** `grip`: quanto o arco deste dedo é mais apertado (< 1) ou mais aberto (> 1) que `HAND_FIT.curl`. */
export const FINGERS = [
  { y: 0.0335, lengths: [0.047, 0.027, 0.022], radius: 0.0098, grip: 0.99 },
  { y: 0.0112, lengths: [0.052, 0.031, 0.023], radius: 0.01, grip: 0.97 },
  { y: -0.0112, lengths: [0.047, 0.029, 0.022], radius: 0.0096, grip: 0.84 },
  { y: -0.0325, lengths: [0.039, 0.023, 0.019], radius: 0.0086, grip: 0.78 },
];

function buildGlove(mats, frame, name) {
  // Dorso: cúpula levemente achatada, com a pintura (perfuração, painel dos nós, friso).
  const back = addMesh(new THREE.SphereGeometry(1, 48, 28), mats.back, ...DOME.center, frame);
  back.scale.set(...DOME.radii);
  back.name = `beta-glove-back-${name}`;

  // Punho da luva: base elíptica que sai da boca do gauntlet e funde com o dorso.
  const wrist = addMesh(new THREE.SphereGeometry(1, 28, 18), mats.finger, 0, 0, 0.0, frame);
  wrist.scale.set(0.0235, 0.034, 0.036);
  wrist.name = `beta-glove-wrist-${name}`;

  FINGERS.forEach(({ y, lengths, radius, grip }, i) => {
    const path = fingerPath(y, lengths, HAND_FIT.curl * grip);
    const finger = sweep(path, fingerRadius(radius, [0.34, 0.7]), mats.finger, frame, { segments: 40 });
    finger.name = `beta-glove-finger-${name}-${i}`;
  });

  // Polegar: base junto à palma, duas falanges e a ponta dobrada sobre o indicador.
  const thumbBase = [0.004, 0.044, 0.026];
  const thumb = [thumbBase];
  let alpha = rad(14);
  let [x, y, z] = thumbBase;
  [[0.034, 30], [0.03, 44], [0.022, 36]].forEach(([length, bend]) => {
    x -= Math.sin(alpha) * length;
    z += Math.cos(alpha) * length;
    y += 0.004;
    thumb.push([x, y, z]);
    alpha += rad(bend);
  });
  const thumbMesh = sweep(thumb, (t) => 0.0116 * (1 - 0.2 * t) * (1 - 0.09 * Math.exp(-(((t - 0.55) / 0.045) ** 2))), mats.finger, frame, { segments: 28 });
  thumbMesh.name = `beta-glove-thumb-${name}`;
  // Volume do músculo do polegar na base da palma.
  const thenar = addMesh(new THREE.SphereGeometry(1, 16, 12), mats.finger, 0.0, 0.032, 0.03, frame);
  thenar.scale.set(0.014, 0.02, 0.028);
}

/**
 * Cadeia espelho > referencial da luva. O espelho dá a mão direita (escala x = -1); o referencial
 * é refeito a cada quadro a partir do volante (ver updateDriverArms).
 */
function handFrames(hand, side) {
  const mirror = new THREE.Group();
  mirror.name = "beta-hand-mirror";
  mirror.scale.set(side * HAND_SCALE, HAND_SCALE, HAND_SCALE);
  hand.add(mirror);
  const frame = new THREE.Group();
  frame.name = "beta-hand-frame";
  mirror.add(frame);
  return frame;
}

// ---------------------------------------------------------------------------
// Braços
// ---------------------------------------------------------------------------
const SHOULDER = { x: 0.22, y: 0.84, z: -0.16 };
const UPPER_ARM = 0.34;
const FOREARM = 0.34;
export const ARM_LENGTH = { upper: UPPER_ARM, fore: FOREARM };

/** Cilindro de altura 1 com perfil de raios (de baixo para cima). */
function limbGeometry(profile, segments = 32) {
  const points = profile.map(([t, r]) => new THREE.Vector2(r, t - 0.5));
  return new THREE.LatheGeometry(points, segments);
}

// Perfis com volume muscular: o antebraço é mais grosso perto do cotovelo e afina até o punho.
const FOREARM_PROFILE = [[0, 0.0405], [0.1, 0.0455], [0.28, 0.0475], [0.5, 0.0425], [0.72, 0.0355], [0.9, 0.0305], [1, 0.0295]];
const UPPER_PROFILE = [[0, 0.0525], [0.25, 0.0555], [0.55, 0.0495], [0.85, 0.0425], [1, 0.0405]];
const GAUNTLET_PROFILE = [[0, 0.0375], [0.55, 0.0375], [0.85, 0.041], [1, 0.0455]];

/**
 * `limits(z)` devolve a parede interna do cockpit nessa altura do carro ({ x: meia-largura, top: altura da borda,
 * floor: altura do piso }), usada para o cotovelo não atravessar o monocoque nem o piso quando o braço levanta ou desce
 * numa curva.
 */
export function buildDriverArms(parent, wheel, suit, teamColor, limits = null) {
  const arms = [];
  const mats = {
    back: gloveBackMaterial(teamColor),
    finger: gloveFabric("#25282e", [3, 3]),
    accent: new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.42, metalness: 0.05 }),
    cuff: new THREE.MeshStandardMaterial({ color: "#585d65", roughness: 0.7 }),
  };
  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    const forearm = addMesh(limbGeometry(FOREARM_PROFILE), suit, 0, 0, 0, parent);
    forearm.name = `beta-driver-arm-${name}`;
    const upper = addMesh(limbGeometry(UPPER_PROFILE), suit, 0, 0, 0, parent);
    upper.name = `beta-driver-upper-${name}`;
    const elbow = addMesh(new THREE.SphereGeometry(0.0455, 24, 16), suit, 0, 0, 0, parent);
    elbow.name = `beta-driver-elbow-${name}`;
    // Gauntlet: cano da luva que cobre a ponta da manga, com friso na cor da equipe.
    const band = addMesh(limbGeometry(GAUNTLET_PROFILE, 28), mats.cuff, 0, 0, 0, parent);
    band.name = `beta-driver-cuff-${name}`;
    const stripe = addMesh(new THREE.CylinderGeometry(0.0462, 0.0462, 0.009, 28), mats.accent, 0, 0, 0, parent);
    stripe.name = `beta-driver-stripe-${name}`;
    // Faixa fina da equipe no meio do antebraço.
    const sleeveStripe = addMesh(new THREE.CylinderGeometry(0.0445, 0.0445, 0.01, 28), mats.accent, 0, 0, 0, parent);
    sleeveStripe.name = `beta-driver-sleeve-stripe-${name}`;

    const hand = new THREE.Group();
    hand.name = `beta-hand-${name}`;
    parent.add(hand);
    const frame = handFrames(hand, side);
    buildGlove(mats, frame, name);

    arms.push({
      mesh: forearm,
      upper,
      elbowMesh: elbow,
      band,
      stripe,
      sleeveStripe,
      side,
      hand,
      frame,
      shoulder: new THREE.Vector3(side * SHOULDER.x, SHOULDER.y, SHOULDER.z),
      elbow: new THREE.Vector3(),
      wrist: new THREE.Vector3(),
      direction: new THREE.Vector3(side * 0.04, -0.12, 1).normalize(),
      limits,
      swing: 0,
    });
  }
  return arms;
}

const armUp = new THREE.Vector3(0, 1, 0);
const armAxis = new THREE.Vector3();
const armPole = new THREE.Vector3();
const armDirection = new THREE.Vector3();
const grip = new THREE.Vector3();
const post = new THREE.Vector3();

/** Orienta um cilindro de altura 1 (eixo Y) do ponto `from` ao ponto `to`. */
function placeLimb(mesh, from, to) {
  armDirection.copy(to).sub(from);
  const length = armDirection.length();
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(armUp, armDirection.normalize());
  mesh.scale.set(1, length, 1);
}

const wheelQuat = new THREE.Quaternion();
const fitQuat = new THREE.Quaternion();
const fitEuler = new THREE.Euler(0, 0, 0, "YXZ");
const wheelBasis = new THREE.Matrix4();
const fitBasis = new THREE.Matrix4();
const flip = new THREE.Matrix4();
const poseBasis = new THREE.Matrix4();
const inHand = new THREE.Vector3();

const swingSide = new THREE.Vector3();
const swingPole = new THREE.Vector3();
const swingElbow = new THREE.Vector3();
const probe = new THREE.Vector3();
const ARM_RADIUS = { upper: 0.055, fore: 0.046 };
/** Quantos passos de 10° o cotovelo pode se desviar da posição preferida, para cada lado. */
const SWING_STEPS = 10;

/** Coxas do piloto (cápsulas ao longo de z) e joelheiras, no espaço do cockpit; os braços desviam delas. */
const LEG = { x: 0.155, y: 0.6, z: -0.02, radius: 0.085, length: 0.72, knee: { x: 0.16, y: 0.63, z: 0.43, radius: 0.092 } };

/** O quanto o braço (dois segmentos) invade a parede, o piso ou as pernas com o cotovelo em `elbow`. */
function wallPenetration(arm, elbow) {
  let worst = 0;
  const check = (from, to, radius, samples) => {
    for (let i = 1; i <= samples; i++) {
      probe.lerpVectors(from, to, i / samples);
      const legX = Math.sign(arm.shoulder.x) * LEG.x;
      const alongLeg = Math.min(LEG.z + LEG.length / 2, Math.max(LEG.z - LEG.length / 2, probe.z));
      worst = Math.max(worst, LEG.radius + radius - Math.hypot(probe.x - legX, probe.y - LEG.y, probe.z - alongLeg));
      worst = Math.max(worst, LEG.knee.radius + radius - Math.hypot(probe.x - Math.sign(legX) * LEG.knee.x, probe.y - LEG.knee.y, probe.z - LEG.knee.z));
      const wall = arm.limits(probe.z);
      // A parede só existe abaixo da borda; acima dela o braço passa livre.
      if (probe.y - radius * 0.4 > wall.top) continue;
      worst = Math.max(worst, Math.abs(probe.x) + radius - wall.x);
      // Dentro do cockpit o piso também barra o braço, que não pode afundar nele quando a mão desce.
      if (Math.abs(probe.x) < wall.x) worst = Math.max(worst, wall.floor - (probe.y - radius));
    }
  };
  check(arm.shoulder, elbow, ARM_RADIUS.upper, 6);
  check(elbow, arm.wrist, ARM_RADIUS.fore, 6);
  return worst;
}

/**
 * Posiciona o cotovelo no plano perpendicular ao eixo ombro-pulso. A direção preferida é para
 * fora e para baixo; se ela atravessar a parede do cockpit (braço levantado numa curva), gira em
 * torno do eixo até achar a posição que menos invade, e suaviza o giro para o cotovelo não saltar.
 */
function placeElbow(arm, axis, along, height, blend) {
  let target = 0;
  swingSide.crossVectors(axis, armPole);
  if (arm.limits) {
    let best = Infinity;
    // Só desvios moderados da posição preferida: girar o cotovelo para o meio do colo é pior que invadir um pouco a parede.
    for (let step = -SWING_STEPS; step <= SWING_STEPS; step++) {
      const angle = (step * Math.PI) / 18;
      swingPole.copy(armPole).multiplyScalar(Math.cos(angle)).addScaledVector(swingSide, Math.sin(angle));
      swingElbow.copy(arm.shoulder).addScaledVector(axis, along).addScaledVector(swingPole, height);
      // Cotovelo acima da borda do cockpit só se não houver outro jeito: parece asa de frango.
      const above = Math.max(0, swingElbow.y - arm.limits(swingElbow.z).top - 0.02);
      const cost = Math.max(0, wallPenetration(arm, swingElbow)) * 40 + above * 12 + Math.abs(angle) * 0.25 + Math.abs(angle - arm.swing) * 0.3;
      if (cost < best) {
        best = cost;
        target = angle;
      }
    }
    arm.swing += (target - arm.swing) * blend * 0.5;
  }
  swingPole.copy(armPole).multiplyScalar(Math.cos(arm.swing)).addScaledVector(swingSide, Math.sin(arm.swing));
  arm.elbow.copy(arm.shoulder).addScaledVector(axis, along).addScaledVector(swingPole, height);
}

/**
 * A luva segura a empunhadura e gira com o volante: o dedo nunca entra na borracha em nenhum
 * ângulo, porque o encaixe é fixo. O pulso fica onde a luva o deixa e o braço (dois ossos) é
 * resolvido até ele por cinemática inversa: o cotovelo cai para fora e para baixo, desviando da
 * parede do cockpit; se o pulso estiver além do alcance, o braço apenas estica.
 */
export function updateDriverArms(arms, wheel) {
  wheelQuat.setFromEuler(wheel.rotation);
  wheelBasis.makeRotationFromQuaternion(wheelQuat);
  fitQuat.setFromEuler(fitEuler.set(HAND_FIT.pitch, HAND_FIT.yaw, HAND_FIT.roll));
  fitBasis.makeRotationFromQuaternion(fitQuat);
  gripInHand(inHand).multiplyScalar(HAND_SCALE);
  for (const arm of arms) {
    const s = arm.side;
    // Ponto de pegada no centro da empunhadura, do volante para o cockpit.
    grip.set(s * (GRIP_ANCHOR.x + HAND_FIT.post.x), GRIP_ANCHOR.y + HAND_FIT.post.y, GRIP_ANCHOR.z + HAND_FIT.post.z)
      .multiply(wheel.scale).applyEuler(wheel.rotation).add(wheel.position);
    // Referencial da luva no espaço da mão esquerda (a direita é espelhada em x): gira com o volante.
    flip.makeScale(s, 1, 1);
    poseBasis.copy(flip).multiply(wheelBasis).multiply(flip).multiply(fitBasis);
    arm.frame.quaternion.setFromRotationMatrix(poseBasis);
    // O centro do arco dos dedos cai no ponto de pegada: o pulso é esse ponto menos o caminho até ele.
    post.copy(inHand).applyMatrix4(poseBasis);
    post.x *= s;
    arm.wrist.copy(grip).sub(post);

    armAxis.copy(arm.wrist).sub(arm.shoulder);
    const reach = Math.min(armAxis.length(), UPPER_ARM + FOREARM - 1e-4);
    armAxis.normalize();
    const along = (reach * reach + UPPER_ARM * UPPER_ARM - FOREARM * FOREARM) / (2 * reach);
    const height = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - along * along));
    armPole.set(s * 0.9, -0.55, -0.2);
    armPole.addScaledVector(armAxis, -armPole.dot(armAxis)).normalize();
    placeElbow(arm, armAxis, along, height, 1);
    arm.direction.copy(arm.wrist).sub(arm.elbow).normalize();

    placeLimb(arm.upper, arm.shoulder, arm.elbow);
    placeLimb(arm.mesh, arm.elbow, arm.wrist);
    arm.elbowMesh.position.copy(arm.elbow);
    arm.frame.position.set(arm.wrist.x * s, arm.wrist.y, arm.wrist.z).divideScalar(HAND_SCALE);
    // Gauntlet cobrindo o fim da manga, friso na boca da luva e faixa no antebraço.
    arm.band.quaternion.copy(arm.mesh.quaternion);
    arm.band.scale.set(1, 0.085, 1);
    arm.band.position.copy(arm.wrist).addScaledVector(arm.direction, -0.034);
    arm.stripe.quaternion.copy(arm.mesh.quaternion);
    arm.stripe.position.copy(arm.wrist).addScaledVector(arm.direction, -0.074);
    arm.sleeveStripe.quaternion.copy(arm.mesh.quaternion);
    arm.sleeveStripe.position.copy(arm.wrist).addScaledVector(arm.direction, -0.17);
  }
}

/** Coxas do piloto até os joelhos sob o volante. */
export function buildDriverLegs(parent, suit) {
  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    const thigh = addMesh(new THREE.CapsuleGeometry(LEG.radius, LEG.length, 10, 24), suit, side * LEG.x, LEG.y, LEG.z, parent);
    thigh.rotation.x = Math.PI / 2 - 0.05;
    thigh.rotation.z = side * 0.03;
    thigh.name = `beta-driver-thigh-${name}`;
    // Joelheira: volume acolchoado na ponta da coxa.
    const knee = addMesh(new THREE.SphereGeometry(LEG.knee.radius, 22, 16), suit, side * LEG.knee.x, LEG.knee.y, LEG.knee.z, parent);
    knee.scale.set(1, 0.9, 1.05);
    knee.name = `beta-driver-knee-${name}`;
  }
}
