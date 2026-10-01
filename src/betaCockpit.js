import * as THREE from "three";
import { addMesh, makeMaterial } from "./materials.js";
import { state } from "./state.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";
import { buildF1Wheel, DISPLAY } from "./betaWheel.js";
import { buildDriverArms, buildDriverLegs, suitMaterial, updateDriverArms } from "./betaDriver.js";
import { makeAlcantaraTexture, makeLiveryTexture } from "./betaTextures.js";
import { qualityPreset, speedUnit } from "./betaSettings.js";

const WHEEL_POS = new THREE.Vector3(0, 0.77, 0.58);
const WHEEL_SCALE = 1.0;
const WHEEL_TILT = 0.34;
const WHEEL_BASE_Y = WHEEL_POS.y;
const WHEEL_LOCK = 0.6;

export function cockpitTelemetry(car, raceTime) {
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  const powertrain = betaPowertrainTelemetry(car);
  const gear = powertrain.label;
  return {
    speed: Math.round(speed * 3.6),
    gear,
    manual: powertrain.manual,
    shift: gear === "N" ? 0 : powertrain.shift,
    throttle: powertrain.throttle,
    lap: Math.max(0, car.finish ? car.lastLap || 0 : raceTime - (car.lapStarted || 0)),
    status: car.currentLapValid === false
      ? "VOLTA INVALIDA"
      : car.drsActive ? "DRS ATIVO" : "TIME TRIAL",
  };
}

/**
 * Tubo de seção oval com raios variáveis ao longo da curva. `rw` é o raio ao
 * longo de cross(up, tangente) e `rh` o raio ao longo de cross(tangente, lado).
 * Permite halo com perfil achatado e pilar que alarga ao encontrar o aro.
 */
function ribbonTube(points, rw, rh, material, parent, { segments = 64, radial = 14 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const positions = [];
  const indices = [];
  const worldUp = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    side.crossVectors(worldUp, tangent);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    normal.crossVectors(tangent, side).normalize();
    const w = rw(t);
    const h = rh(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      positions.push(
        p.x + side.x * Math.cos(a) * w + normal.x * Math.sin(a) * h,
        p.y + side.y * Math.cos(a) * w + normal.y * Math.sin(a) * h,
        p.z + side.z * Math.cos(a) * w + normal.z * Math.sin(a) * h,
      );
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      indices.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(geometry, material, 0, 0, 0, parent);
}

const linkUp = new THREE.Vector3(0, 1, 0);
function linkBetween(start, end, radius, material, parent, name) {
  const from = new THREE.Vector3(...start);
  const direction = new THREE.Vector3(...end).sub(from);
  const mesh = addMesh(
    new THREE.CylinderGeometry(radius, radius, 1, 16),
    material,
    0,
    0,
    0,
    parent,
  );
  mesh.name = name;
  mesh.position.copy(from).add(new THREE.Vector3(...end)).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(linkUp, direction.clone().normalize());
  mesh.scale.y = direction.length();
  return mesh;
}

/** Interpola suavemente chaves {z, ...valores} e devolve o valor em `z`. */
function sampleKeys(keys, z) {
  if (z <= keys[0].z) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const k = t * t * (3 - 2 * t);
      const out = { z };
      for (const key of Object.keys(a)) if (key !== "z") out[key] = a[key] + (b[key] - a[key]) * k;
      return out;
    }
  }
  return keys[keys.length - 1];
}

/**
 * Loft entre anéis de pontos com o mesmo número de vértices. `segmentGroups`
 * mapeia intervalos de segmentos do perfil a índices de material, para separar
 * revestimento interno, borda acolchoada e pintura na mesma malha.
 */
function loft(rings, materials, parent, segmentGroups, flip = false) {
  const count = rings[0].length;
  const positions = [];
  const uvs = [];
  const z0 = rings[0][0][2];
  const z1 = rings.at(-1)[0][2];
  for (const ring of rings) {
    // v = distância acumulada ao longo do perfil (0–1); u = posição ao longo do carro (0–1).
    const lengths = [0];
    for (let j = 1; j < ring.length; j++) {
      lengths.push(lengths[j - 1] + Math.hypot(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1]));
    }
    ring.forEach((p, j) => {
      positions.push(p[0], p[1], p[2]);
      uvs.push((p[2] - z0) / (z1 - z0 || 1), lengths[j] / (lengths.at(-1) || 1));
    });
  }
  const indices = [];
  const geometry = new THREE.BufferGeometry();
  for (const [from, to, material] of segmentGroups) {
    const groupStart = indices.length;
    for (let j = from; j < to; j++) {
      for (let i = 0; i < rings.length - 1; i++) {
        const a = i * count + j;
        const b = a + count;
        if (flip) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    geometry.addGroup(groupStart, indices.length - groupStart, material);
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(geometry, materials, 0, 0, 0, parent);
}

/**
 * Suaviza um perfil poligonal com Catmull-Rom uniforme, amostrando `perSpan[k]`
 * pontos em cada trecho. `breaks[k]` é o índice do ponto de controle k na saída.
 */
function smoothProfile(controls, perSpan) {
  const points = [];
  const breaks = [];
  const last = controls.length - 1;
  for (let k = 0; k < last; k++) {
    const p0 = controls[Math.max(0, k - 1)];
    const p1 = controls[k];
    const p2 = controls[k + 1];
    const p3 = controls[Math.min(last, k + 2)];
    breaks.push(points.length);
    for (let s = 0; s < perSpan[k]; s++) {
      const t = s / perSpan[k];
      const t2 = t * t;
      const t3 = t2 * t;
      points.push([0, 1].map((axis) => 0.5 * (2 * p1[axis] + (-p0[axis] + p2[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)));
    }
  }
  breaks.push(points.length);
  points.push(controls[last].slice());
  return { points, breaks };
}

const SIDE_KEYS = [
  { z: -0.95, xi: 0.28, xo: 0.5, yt: 1.02, yb: 0.55 },
  { z: -0.45, xi: 0.29, xo: 0.58, yt: 1.0, yb: 0.55 },
  { z: -0.05, xi: 0.3, xo: 0.6, yt: 0.93, yb: 0.55 },
  // Na zona do volante o cockpit abre e a borda fica na altura das mãos,
  // para volante e luvas ficarem inteiros à vista.
  { z: 0.25, xi: 0.4, xo: 0.62, yt: 0.85, yb: 0.55 },
  { z: 0.72, xi: 0.4, xo: 0.58, yt: 0.8, yb: 0.52 },
  { z: 0.98, xi: 0.3, xo: 0.52, yt: 0.78, yb: 0.5 },
  // Deck lateral: carenagem pintada que vai do cockpit até perto dos pneus,
  // como nas imagens de onboard (o piloto vê a cor do carro à frente).
  { z: 1.3, xi: 0.24, xo: 0.66, yt: 0.73, yb: 0.46 },
  { z: 1.62, xi: 0.17, xo: 0.56, yt: 0.66, yb: 0.42 },
];

const SIDE_SPANS = [3, 4, 4, 5, 5, 5, 5];

/** Altura do piso do cockpit (a bandeja de alcantara, ver `tubMesh`). */
export const COCKPIT_FLOOR = 0.52;

/** Parede interna do cockpit na posição z: meia-largura (x), altura da borda (top) e do piso (floor). */
export function cockpitWall(z) {
  const key = sampleKeys(SIDE_KEYS, z);
  return { x: key.xi, top: key.yt, floor: COCKPIT_FLOOR };
}

function sideControls(k) {
  const span = k.xo - k.xi;
  return [
    [k.xi, k.yb],
    [k.xi, k.yt - 0.035],
    [k.xi + 0.012, k.yt - 0.004],
    [k.xi + 0.045, k.yt + 0.012],
    [k.xi + span * 0.36, k.yt + 0.004],
    [k.xi + span * 0.72, k.yt - 0.05],
    [k.xo, k.yt - 0.17],
    [k.xo, k.yb],
  ];
}

/** Fração (0–1) do perfil onde começa e termina o topo da carenagem; é onde corre a faixa da pintura. */
function crestFractions() {
  const { points, breaks } = smoothProfile(sideControls(sampleKeys(SIDE_KEYS, 0.3)), SIDE_SPANS);
  const lengths = [0];
  for (let j = 1; j < points.length; j++) lengths.push(lengths[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
  return [lengths[breaks[3]] / lengths.at(-1), lengths[breaks[5]] / lengths.at(-1)];
}

/** Bordas do cockpit e laterais do monocoque: revestimento, acolchoado e pintura. */
function cockpitSide(side, materials, parent) {
  const rings = [];
  const steps = 120;
  let breaks = [];
  for (let i = 0; i <= steps; i++) {
    const z = SIDE_KEYS[0].z + ((SIDE_KEYS.at(-1).z - SIDE_KEYS[0].z) * i) / steps;
    const profile = smoothProfile(sideControls(sampleKeys(SIDE_KEYS, z)), SIDE_SPANS);
    breaks = profile.breaks;
    rings.push(profile.points.map(([x, y]) => [x * side, y, z]));
  }
  // Espelhar em x inverte o sentido dos triângulos; sem corrigir, a normal aponta para dentro
  // e o mapa de sombras escurece a própria superfície.
  const mesh = loft(rings, materials, parent, [[0, breaks[1], 0], [breaks[1], breaks[3], 1], [breaks[3], rings[0].length - 1, 2]], side < 0);
  mesh.name = `beta-cockpit-shell-${side < 0 ? "left" : "right"}`;
  return mesh;
}

const NOSE_KEYS = [
  { z: 0.66, w: 0.3, yt: 0.92, crown: 0.03, yb: 0.5 },
  { z: 0.92, w: 0.29, yt: 0.92, crown: 0.03, yb: 0.5 },
  { z: 1.28, w: 0.25, yt: 0.83, crown: 0.03, yb: 0.45 },
  { z: 1.8, w: 0.19, yt: 0.68, crown: 0.025, yb: 0.4 },
  { z: 2.25, w: 0.125, yt: 0.55, crown: 0.02, yb: 0.34 },
  { z: 2.58, w: 0.07, yt: 0.46, crown: 0.015, yb: 0.3 },
];

/** Scuttle, painel de instrumentos e nariz: uma única superfície contínua. */
function cockpitNose(material, parent) {
  const rings = [];
  for (let i = 0; i <= 90; i++) {
    const z = NOSE_KEYS[0].z + ((NOSE_KEYS.at(-1).z - NOSE_KEYS[0].z) * i) / 90;
    const k = sampleKeys(NOSE_KEYS, z);
    const controls = [
      [-k.w, k.yb],
      [-k.w, k.yt - 0.1],
      [-k.w * 0.88, k.yt - 0.025],
      [-k.w * 0.55, k.yt],
      [-k.w * 0.22, k.yt + k.crown * 0.9],
      [0, k.yt + k.crown],
      [k.w * 0.22, k.yt + k.crown * 0.9],
      [k.w * 0.55, k.yt],
      [k.w * 0.88, k.yt - 0.025],
      [k.w, k.yt - 0.1],
      [k.w, k.yb],
    ];
    rings.push(smoothProfile(controls, new Array(10).fill(3)).points.map(([x, y]) => [x, y, z]));
  }
  const mesh = loft(rings, material, parent, [[0, rings[0].length - 1, 0]]);
  mesh.name = "beta-center-body";
  return mesh;
}

/**
 * Contorno do retrovisor visto de trás: corpo mais alto na ponta externa, borda inferior
 * inclinada e cantos arredondados, como as carcaças aerodinâmicas dos F1. `sign` inverte o
 * lado (o contorno é desenhado com a ponta externa em +x) e `scale` encolhe em torno do centro.
 */
function mirrorShape(sign, scale = 1) {
  const shape = new THREE.Shape();
  const move = (x, y) => shape.moveTo(x * sign * scale, y * scale);
  const line = (x, y) => shape.lineTo(x * sign * scale, y * scale);
  const curve = (cx, cy, x, y) => shape.quadraticCurveTo(cx * sign * scale, cy * scale, x * sign * scale, y * scale);
  move(-0.082, -0.04);
  line(0.066, -0.047);
  curve(0.1, -0.05, 0.102, -0.012);
  line(0.104, 0.026);
  curve(0.105, 0.056, 0.072, 0.054);
  line(-0.07, 0.046);
  curve(-0.102, 0.044, -0.1, 0.014);
  line(-0.098, -0.014);
  curve(-0.098, -0.04, -0.082, -0.04);
  shape.closePath();
  return shape;
}

/** Geometria plana de uma forma com UV de 0 a 1 sobre a caixa dela (para a textura do vidro). */
function mirrorPane(sign, scale) {
  const geometry = new THREE.ShapeGeometry(mirrorShape(sign, scale), 14);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const position = geometry.attributes.position;
  const uv = [];
  for (let i = 0; i < position.count; i++) uv.push((position.getX(i) - min.x) / (max.x - min.x), (position.getY(i) - min.y) / (max.y - min.y));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Reflexo e vinheta sobre o vidro: brilho em diagonal e bordas levemente escurecidas. */
function mirrorSheenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const edge = ctx.createLinearGradient(0, 0, 256, 0);
  edge.addColorStop(0, "rgba(10,18,30,0.42)");
  edge.addColorStop(0.16, "rgba(10,18,30,0)");
  edge.addColorStop(0.84, "rgba(10,18,30,0)");
  edge.addColorStop(1, "rgba(10,18,30,0.42)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 256, 128);
  const rim = ctx.createLinearGradient(0, 0, 0, 128);
  rim.addColorStop(0, "rgba(10,18,30,0.34)");
  rim.addColorStop(0.2, "rgba(10,18,30,0)");
  rim.addColorStop(0.8, "rgba(10,18,30,0)");
  rim.addColorStop(1, "rgba(10,18,30,0.38)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, 256, 128);
  // Brilho de verniz em faixa diagonal.
  const sheen = ctx.createLinearGradient(0, 0, 256, 128);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.34, "rgba(255,255,255,0)");
  sheen.addColorStop(0.44, "rgba(210,230,255,0.16)");
  sheen.addColorStop(0.52, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Retrovisor de F1: carcaça de carbono aerodinâmica com cauda afilada, moldura de borracha,
 * vidro refletivo com brilho, tampa na cor da equipe, aleta superior e duas hastes de perfil
 * alar presas ao monocoque.
 */
function buildMirror(side, carbon, paint, parent) {
  const group = new THREE.Group();
  group.name = `beta-mirror-${side < 0 ? "left" : "right"}`;
  group.position.set(side * 0.76, 0.91, 0.86);
  group.rotation.y = side * 0.16;
  parent.add(group);

  const bevel = (size, thickness) => ({ bevelEnabled: true, bevelSegments: 5, bevelSize: size, bevelThickness: thickness, curveSegments: 10 });
  const housing = addMesh(new THREE.ExtrudeGeometry(mirrorShape(side), { depth: 0.032, ...bevel(0.011, 0.011) }), carbon, 0, 0, -0.02, group);
  housing.name = `${group.name}-housing`;
  // Cauda: a carcaça afina para trás, como o carenado de um F1.
  const tail = addMesh(new THREE.ExtrudeGeometry(mirrorShape(side, 0.74), { depth: 0.036, ...bevel(0.014, 0.016) }), carbon, 0, -0.004, 0.026, group);
  tail.name = `${group.name}-tail`;

  // Moldura de borracha ao redor do vidro.
  const seal = mirrorShape(side, 0.975);
  seal.holes.push(new THREE.Path(mirrorShape(side, 0.9).getPoints(24)));
  const sealMesh = addMesh(
    new THREE.ExtrudeGeometry(seal, { depth: 0.004, bevelEnabled: false, curveSegments: 14 }),
    new THREE.MeshStandardMaterial({ color: "#0b0d10", roughness: 0.6, metalness: 0.1 }),
    0,
    0,
    -0.0385,
    group,
  );
  sealMesh.name = `${group.name}-seal`;

  // Tampa superior na cor da equipe e aleta de carbono na ponta externa.
  const capShape = new THREE.Shape();
  capShape.moveTo(side * -0.098, 0);
  capShape.lineTo(side * 0.1, 0);
  capShape.quadraticCurveTo(side * 0.112, 0.03, side * 0.092, 0.058);
  capShape.lineTo(side * -0.09, 0.052);
  capShape.closePath();
  const cap = addMesh(new THREE.ExtrudeGeometry(capShape, { depth: 0.007, ...bevel(0.002, 0.002) }), paint, 0, 0.058, -0.012, group);
  cap.rotation.x = Math.PI / 2;
  cap.name = `${group.name}-cap`;
  const fin = addMesh(new THREE.BoxGeometry(0.004, 0.034, 0.05), carbon, side * 0.07, 0.066, 0.004, group);
  fin.rotation.z = side * -0.1;
  fin.name = `${group.name}-fin`;

  // Vidro: vista real traseira renderizada em textura pequena (ver renderBetaMirrors).
  const target = new THREE.WebGLRenderTarget(384, 192, { type: THREE.HalfFloatType, samples: 2 });
  target.texture.wrapS = THREE.RepeatWrapping;
  // O espelho inverte esquerda e direita.
  target.texture.repeat.x = -1;
  target.texture.offset.x = 1;
  const glassGeometry = mirrorPane(-side, 0.9);
  const face = addMesh(glassGeometry, new THREE.MeshBasicMaterial({ map: target.texture, fog: false }), 0, 0, -0.0345, group);
  face.rotation.y = Math.PI;
  face.castShadow = false;
  face.receiveShadow = false;
  face.name = `${group.name}-glass`;
  face.geometry.addEventListener("dispose", () => target.dispose());
  const sheen = addMesh(
    glassGeometry,
    new THREE.MeshBasicMaterial({ map: mirrorSheenTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    0,
    0,
    -0.0349,
    group,
  );
  sheen.rotation.y = Math.PI;
  sheen.castShadow = false;
  sheen.receiveShadow = false;
  sheen.name = `${group.name}-sheen`;
  group.userData.mirror = {
    target,
    face,
    camera: new THREE.PerspectiveCamera(26, 384 / 192, 0.05, 450),
  };

  // Duas hastes de perfil alar (corda ao longo de z, fina em y) ligando o monocoque à carcaça.
  const stay = (from, to, name) => {
    const strut = ribbonTube([from, to], () => 0.0155, () => 0.0048, carbon, parent, { segments: 12, radial: 12 });
    strut.name = name;
    return strut;
  };
  stay([side * 0.44, 0.82, 0.64], [side * 0.69, 0.885, 0.88], `${group.name}-stalk`);
  stay([side * 0.5, 0.775, 0.7], [side * 0.71, 0.87, 0.9], `${group.name}-stay`);
  return group;
}

function buildSteeringWheel(parent, carbon, metal) {
  const data = buildF1Wheel(parent, { metal });
  const { wheel } = data;
  wheel.position.copy(WHEEL_POS);
  wheel.rotation.x = WHEEL_TILT;
  wheel.scale.setScalar(WHEEL_SCALE);

  // Coluna, eixo e engate rápido tornam a ligação com o monocoque explícita.
  const hubY = WHEEL_POS.y - 0.03 * Math.sin(WHEEL_TILT);
  const hubZ = WHEEL_POS.z + 0.03 * Math.cos(WHEEL_TILT);
  const column = linkBetween(
    [0, hubY, hubZ],
    [0, 0.66, 0.98],
    0.03,
    carbon,
    parent,
    "beta-steering-column",
  );
  column.castShadow = true;
  const hub = addMesh(
    new THREE.CylinderGeometry(0.056, 0.046, 0.1, 20),
    metal,
    0,
    hubY,
    hubZ,
    parent,
  );
  hub.name = "beta-steering-hub";
  hub.rotation.x = Math.PI / 2 + WHEEL_TILT;
  return data;
}

export function buildBetaCockpit(parent, carbon, paint) {
  // Em ângulo rasante o verniz reflete o céu com força e "lava" a cor; o mapa de
  // ambiente é atribuído explicitamente para controlar essa reflexão. A cor da
  // equipe vem pintada na textura (faixa branca, frisos e linhas de painel).
  const teamColor = paint.color.getStyle();
  const paintOptions = {
    metalness: 0.12,
    roughness: 0.36,
    clearcoat: 0.8,
    clearcoatRoughness: 0.14,
    envMap: state.betaEnvironment,
    envMapIntensity: 0.7,
    side: THREE.DoubleSide,
  };
  const sideStripe = crestFractions();
  // Mesmo esquema do carro 3D: base clara com a faixa na cor do jogador.
  const shellPaint = new THREE.MeshPhysicalMaterial({ ...paintOptions, color: "#ebebeb", map: makeLiveryTexture("#e2e3e7", sideStripe, teamColor) });
  const nosePaint = new THREE.MeshPhysicalMaterial({ ...paintOptions, color: "#ebebeb", map: makeLiveryTexture("#e2e3e7", [0.44, 0.56], teamColor) });
  // Peças pequenas (tampas dos retrovisores) usam a cor lisa, sem a faixa.
  const plainPaint = new THREE.MeshPhysicalMaterial({ ...paintOptions, color: paint.color.clone().multiplyScalar(0.85) });
  const alcantara = makeMaterial("#111518", { roughness: 1, side: THREE.DoubleSide });
  // Forro das laterais: alcantara com costura, repetida em módulos de ~28 cm.
  const liningMap = makeAlcantaraTexture("#161b1f");
  liningMap.repeat.set(9, 3.4);
  const paddingMap = makeAlcantaraTexture("#1b2025", { stitch: false });
  paddingMap.repeat.set(9, 0.25);
  const lining = new THREE.MeshStandardMaterial({ map: liningMap, roughness: 0.95, side: THREE.DoubleSide });
  const padding = new THREE.MeshStandardMaterial({ map: paddingMap, roughness: 0.85, side: THREE.DoubleSide });
  const aluminum = makeMaterial("#7a858d", { metalness: 0.92, roughness: 0.22 });
  const suit = suitMaterial(undefined, [3, 4]);
  const haloCarbon = carbon.clone();
  haloCarbon.roughness = 0.34;

  const sideMaterials = [lining, padding, shellPaint];
  cockpitSide(-1, sideMaterials, parent);
  cockpitSide(1, sideMaterials, parent);
  cockpitNose(nosePaint, parent);

  // Capa do painel: carbono fosco curvo sobre o display, como nos monopostos reais.
  const hood = addMesh(new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), carbon, 0, 0.85, 0.82, parent);
  hood.scale.set(0.27, 0.07, 0.2);
  hood.name = "beta-dash-hood";

  // Banheira: piso escuro do cockpit.
  const tub = new THREE.Shape();
  tub.moveTo(-0.3, -0.95);
  tub.lineTo(0.3, -0.95);
  tub.lineTo(0.22, 0.85);
  tub.lineTo(-0.22, 0.85);
  tub.closePath();
  const tubMesh = addMesh(new THREE.ShapeGeometry(tub), alcantara, 0, COCKPIT_FLOOR, 0, parent);
  tubMesh.rotation.x = -Math.PI / 2;

  // Halo: aro fino e alto que sai da linha de visão. Os arcos laterais passam acima e para
  // fora do campo de visão e só o aro frontal e o pilar central aparecem, como nos jogos de F1.
  const crownPoints = [
    [-0.4, 1.0, -0.62],
    [-0.58, 1.16, -0.32],
    [-0.58, 1.3, 0.08],
    [-0.34, 1.36, 0.42],
    [0, 1.34, 0.62],
    [0.34, 1.36, 0.42],
    [0.58, 1.3, 0.08],
    [0.58, 1.16, -0.32],
    [0.4, 1.0, -0.62],
  ];
  const bulge = (t, amount) => amount * Math.exp(-(((t - 0.5) / 0.14) ** 2));
  const haloCrown = ribbonTube(
    crownPoints,
    (t) => 0.0165 + bulge(t, 0.004),
    (t) => 0.021 + bulge(t, 0.007),
    haloCarbon,
    parent,
    { segments: 96 },
  );
  haloCrown.name = "beta-halo-crown";
  // Pilar curto: nasce no painel e sobe só até o aro.
  const haloPillar = ribbonTube(
    [[0, 1.34, 0.62], [0, 1.2, 0.73], [0, 1.05, 0.86], [0, 0.93, 0.94]],
    (t) => 0.0175 + 0.011 * (1 - t) ** 2,
    (t) => 0.022 + 0.006 * (1 - t),
    haloCarbon,
    parent,
    { segments: 40 },
  );
  haloPillar.name = "beta-halo-pillar";
  const pillarBase = addMesh(new THREE.CylinderGeometry(0.05, 0.068, 0.026, 24), aluminum, 0, 0.925, 0.94, parent);
  pillarBase.name = "beta-halo-mount";

  const mirrors = [buildMirror(-1, carbon, plainPaint, parent), buildMirror(1, carbon, plainPaint, parent)];

  // Coxas e joelhos do piloto sob o volante: sem eles a área abaixo do volante parece vazia.
  buildDriverLegs(parent, suitMaterial(undefined, [3, 7]));

  const data = buildSteeringWheel(parent, carbon, aluminum);
  data.arms = buildDriverArms(parent, data.wheel, suit, teamColor, cockpitWall);
  updateDriverArms(data.arms, data.wheel);
  data.mirrors = mirrors;
  data.lastUpdate = -Infinity;
  parent.userData.betaCockpit = data;
  return data;
}

function drawTelemetry(data, telemetry) {
  const ctx = data.ctx;
  const { canvasW: W, canvasH: H } = DISPLAY;
  ctx.fillStyle = "#020405";
  ctx.fillRect(0, 0, W, H);
  const panel = ctx.createLinearGradient(0, 0, 0, H);
  panel.addColorStop(0, "#0f1b21");
  panel.addColorStop(1, "#04080a");
  ctx.fillStyle = panel;
  ctx.fillRect(10, 10, W - 20, H - 20);

  // Divisórias: colunas laterais e faixa da barra de giro.
  ctx.fillStyle = "#1c2b32";
  ctx.fillRect(238, 26, 3, 356);
  ctx.fillRect(560, 26, 3, 356);
  ctx.fillRect(24, 196, 200, 2);
  ctx.fillRect(576, 196, 200, 2);

  ctx.textAlign = "center";
  // Coluna esquerda: velocidade e acelerador.
  ctx.fillStyle = "#6f8d9b";
  ctx.font = "bold 24px monospace";
  ctx.fillText(telemetry.unit ?? "KM/H", 130, 56);
  ctx.fillStyle = "#f4f8f5";
  ctx.font = "bold 104px monospace";
  ctx.fillText(String(telemetry.speed), 130, 158);
  ctx.fillStyle = "#6f8d9b";
  ctx.font = "bold 24px monospace";
  ctx.fillText("ACEL", 130, 242);
  ctx.fillStyle = "#1b2c34";
  ctx.fillRect(30, 262, 200, 22);
  ctx.fillStyle = "#3fd08e";
  ctx.fillRect(30, 262, 200 * telemetry.throttle, 22);

  // Centro: marcha.
  ctx.fillStyle = "#6f8d9b";
  ctx.font = "bold 22px monospace";
  ctx.fillText(telemetry.manual ? "MARCHA · MANUAL" : "MARCHA", 400, 52);
  ctx.fillStyle = "#f7faf7";
  ctx.font = "bold 300px monospace";
  ctx.fillText(String(telemetry.gear), 400, 330);

  // Coluna direita: tempo de volta e situação.
  const minutes = Math.floor(telemetry.lap / 60);
  ctx.fillStyle = "#6f8d9b";
  ctx.font = "bold 24px monospace";
  ctx.fillText("VOLTA", 670, 56);
  ctx.fillStyle = "#f4f8f5";
  ctx.font = "bold 52px monospace";
  ctx.fillText(`${minutes}:${(telemetry.lap % 60).toFixed(2).padStart(5, "0")}`, 670, 128);
  ctx.fillStyle = telemetry.status === "VOLTA INVALIDA" ? "#ff6e5d" : telemetry.status === "DRS ATIVO" ? "#f4d13b" : "#64dc9e";
  ctx.font = "bold 28px monospace";
  ctx.fillText(telemetry.status, 670, 250);

  // Barra de giro em segmentos: verde, amarelo e vermelho.
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const on = i / segments < telemetry.shift;
    const tint = i < 12 ? "#2fcf82" : i < 19 ? "#f2cb35" : "#ef4b3d";
    ctx.fillStyle = on ? tint : "#18252b";
    ctx.fillRect(28 + i * 31.2, 408, 27, 64);
  }
}

export function updateBetaCockpit(car, raceTime, clockTime, dt = 1 / 60) {
  const data = car.group.userData.betaCockpit;
  if (!data) return;
  const steering = -THREE.MathUtils.clamp(car.steer || 0, -1, 1) * WHEEL_LOCK;
  const steeringBlend = 1 - Math.exp(-Math.max(0, dt) * 20);
  data.wheel.rotation.z += (steering - data.wheel.rotation.z) * steeringBlend;
  const acceleration = THREE.MathUtils.clamp(car.betaAcceleration || 0, -35, 18);
  data.wheel.position.y = WHEEL_BASE_Y - acceleration * 0.0003;
  updateDriverArms(data.arms, data.wheel);

  // Luz de chuva traseira acompanha o freio (e a desaceleração forte).
  const rainLight = car.group.userData.betaRainLight;
  if (rainLight) {
    const braking = state.keys.ArrowDown || state.keys.s || state.keys.S || (car.betaAcceleration || 0) < -14;
    rainLight.emissiveIntensity = braking ? 7 : 0.6;
  }
  const telemetry = cockpitTelemetry(car, raceTime);
  // O cálculo continua em km/h; só a exibição segue a unidade escolhida.
  const unit = speedUnit();
  telemetry.speed = Math.round(Math.max(0, Number.isFinite(car.speed) ? car.speed : 0) * unit.factor);
  telemetry.unit = unit.label;
  for (let i = 0; i < data.shiftLights.length; i++) {
    const active = i / data.shiftLights.length < telemetry.shift;
    const led = data.shiftLights[i];
    led.material.emissiveIntensity = active ? 4.8 : 0;
    led.material.color.set(active ? led.userData.on : "#182126");
  }
  // LEDs laterais: volta inválida (esquerda, âmbar) e DRS aberto (direita).
  const flags = [telemetry.status === "VOLTA INVALIDA", telemetry.status === "DRS ATIVO"];
  data.sideLights.forEach((led, i) => {
    const active = flags[i < 3 ? 0 : 1];
    led.material.emissiveIntensity = active ? 3.6 : 0;
    led.material.color.set(active ? led.userData.on : "#182126");
  });
  if (clockTime >= data.lastUpdate && clockTime - data.lastUpdate < 0.05) return;
  data.lastUpdate = clockTime;
  drawTelemetry(data, telemetry);
  data.texture.needsUpdate = true;
}

const mirrorNormal = new THREE.Vector3();
const mirrorSight = new THREE.Vector3();
const mirrorQuat = new THREE.Quaternion();
const mirrorLook = new THREE.Vector3();
let mirrorFrame = 0;

/**
 * Renderiza a vista traseira dos retrovisores. A direção é o reflexo do olhar
 * do piloto na normal do vidro, então o que aparece muda com a cabeça. Roda a
 * cada dois quadros e reaproveita o mapa de sombras já calculado.
 */
export function renderBetaMirrors(renderer, scene, camera, car, dt = 0) {
  const data = car.group.userData.betaCockpit;
  // Quadros lentos (dt alto) pulam os espelhos para não agravar a queda de FPS.
  if (!data?.mirrors || dt > 0.034 || mirrorFrame++ % qualityPreset().mirrorEvery) return;
  car.group.updateMatrixWorld(true);
  const previousTarget = renderer.getRenderTarget();
  const previousAutoUpdate = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  const faces = data.mirrors.map((mirror) => mirror.userData.mirror.face);
  for (const face of faces) face.visible = false;
  for (const mirror of data.mirrors) {
    const { target, camera: mirrorCamera } = mirror.userData.mirror;
    mirrorCamera.position.set(0, 0, -0.06);
    mirror.localToWorld(mirrorCamera.position);
    mirror.getWorldQuaternion(mirrorQuat);
    mirrorNormal.set(0, 0, -1).applyQuaternion(mirrorQuat);
    mirrorSight.copy(mirrorCamera.position).sub(camera.position).normalize();
    mirrorSight.addScaledVector(mirrorNormal, -2 * mirrorSight.dot(mirrorNormal));
    mirrorCamera.up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
    mirrorLook.copy(mirrorCamera.position).add(mirrorSight);
    mirrorCamera.lookAt(mirrorLook);
    renderer.setRenderTarget(target);
    renderer.render(scene, mirrorCamera);
  }
  for (const face of faces) face.visible = true;
  renderer.setRenderTarget(previousTarget);
  renderer.shadowMap.autoUpdate = previousAutoUpdate;
}
