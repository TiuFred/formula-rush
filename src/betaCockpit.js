import * as THREE from "three";
import { addMesh, makeMaterial } from "./materials.js";
import { state } from "./state.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";
import { buildF1Wheel, DISPLAY, GRIP_ANCHOR, wristLocal } from "./betaWheel.js";
import { makeAlcantaraTexture, makeLiveryTexture } from "./betaTextures.js";
import { qualityPreset, speedUnit } from "./betaSettings.js";

const WHEEL_POS = new THREE.Vector3(0, 0.8, 0.54);
const WHEEL_SCALE = 1.0;
const WHEEL_TILT = 0.3;
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

function tube(points, radius, material, parent, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return addMesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), material, 0, 0, 0, parent);
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

/** Retrovisor de F1: carcaça de carbono, tampa pintada e vidro refletivo. */
function buildMirror(side, carbon, paint, parent) {
  const group = new THREE.Group();
  group.name = `beta-mirror-${side < 0 ? "left" : "right"}`;
  group.position.set(side * 0.72, 0.94, 0.84);
  group.rotation.y = side * 0.16;
  parent.add(group);

  const outline = new THREE.Shape();
  const w = 0.095;
  const h = 0.038;
  const r = 0.028;
  outline.moveTo(-w + r, -h);
  outline.lineTo(w - r, -h);
  outline.quadraticCurveTo(w, -h, w, -h + r);
  outline.lineTo(w, h - r);
  outline.quadraticCurveTo(w, h, w - r, h);
  outline.lineTo(-w + r, h);
  outline.quadraticCurveTo(-w, h, -w, h - r);
  outline.lineTo(-w, -h + r);
  outline.quadraticCurveTo(-w, -h, -w + r, -h);
  const housing = addMesh(new THREE.ExtrudeGeometry(outline, {
    depth: 0.045,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  }), carbon, 0, 0, -0.02, group);
  housing.name = `${group.name}-housing`;
  const cap = addMesh(new THREE.BoxGeometry(0.2, 0.012, 0.06), paint, 0, h + 0.008, 0.005, group);
  cap.rotation.x = -0.06;
  // Vidro: vista real traseira renderizada em textura pequena (ver renderBetaMirrors).
  const target = new THREE.WebGLRenderTarget(384, 160, { type: THREE.HalfFloatType, samples: 2 });
  target.texture.wrapS = THREE.RepeatWrapping;
  // O espelho inverte esquerda e direita.
  target.texture.repeat.x = -1;
  target.texture.offset.x = 1;
  const face = addMesh(
    new THREE.PlaneGeometry(w * 2 - 0.022, h * 2 - 0.018),
    new THREE.MeshBasicMaterial({ map: target.texture, fog: false }),
    0,
    0,
    -0.0345,
    group,
  );
  face.rotation.y = Math.PI;
  face.castShadow = false;
  face.receiveShadow = false;
  face.name = `${group.name}-glass`;
  face.geometry.addEventListener("dispose", () => target.dispose());
  group.userData.mirror = {
    target,
    face,
    camera: new THREE.PerspectiveCamera(26, 384 / 160, 0.05, 450),
  };
  tube([
    [side * 0.44, 0.82, 0.64],
    [side * 0.57, 0.88, 0.76],
    [side * 0.69, 0.93, 0.86],
  ], 0.014, carbon, parent, 12).name = `${group.name}-stalk`;
  return group;
}

/** Tecido técnico procedural (trama diagonal + pontos de silicone), só com fillRect. */
function fabricMaterial(base, weave, { repeat = [3, 3], roughness = 0.85, dots = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = weave;
  for (let i = 0; i < 64; i += 4) {
    ctx.fillRect(i, 0, 1, 64);
    ctx.fillRect(0, i, 64, 1);
  }
  if (dots) {
    ctx.fillStyle = "#3b4349";
    for (let y = 4; y < 64; y += 8) for (let x = 4; x < 64; x += 8) ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness });
}

/** Luva de piloto: dorso, quatro dedos que contornam a pegada, polegar e punho. */
function buildGlove(side, glove, hand) {
  const knuckle = addMesh(new THREE.SphereGeometry(1, 20, 14), glove, 0, 0.012, -0.066, hand);
  knuckle.scale.set(0.052, 0.072, 0.03);
  knuckle.name = `beta-glove-back-${side < 0 ? "left" : "right"}`;
  const fingerRows = [0.056, 0.028, 0, -0.028];
  fingerRows.forEach((y, i) => {
    const curl = i * 0.004;
    const points = [
      [-0.03, y + 0.004, -0.07],
      [0.0, y + 0.006, -0.078 + curl],
      [0.04, y + 0.004, -0.07],
      [0.068, y, -0.034],
      [0.064, y - 0.004, 0.01],
      [0.04, y - 0.004, 0.042],
    ].map(([u, yy, z]) => new THREE.Vector3(side * u, yy, z));
    const finger = addMesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.0135 - i * 0.0004, 8, false),
      glove,
      0,
      0,
      0,
      hand,
    );
    finger.name = `beta-glove-finger-${side < 0 ? "left" : "right"}-${i}`;
  });
  const thumbPoints = [
    [-0.04, 0.05, -0.05],
    [-0.056, 0.078, -0.012],
    [-0.046, 0.098, 0.03],
  ].map(([u, y, z]) => new THREE.Vector3(side * u, y, z));
  addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(thumbPoints), 12, 0.0145, 8, false), glove, 0, 0, 0, hand);
}

function buildDriverArms(parent, wheel, fabric, glove, cuff) {
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = addMesh(
      new THREE.CylinderGeometry(0.027, 0.04, 1, 18),
      fabric,
      0,
      0,
      0,
      parent,
    );
    arm.name = `beta-driver-arm-${side < 0 ? "left" : "right"}`;
    const band = addMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 18), cuff, 0, 0, 0, parent);
    band.name = `beta-driver-cuff-${side < 0 ? "left" : "right"}`;
    arms.push({
      mesh: arm,
      band,
      side,
      base: new THREE.Vector3(side * 0.27, 0.4, 0.3),
      elbow: new THREE.Vector3(side * 0.27, 0.4, 0.3),
    });

    const hand = new THREE.Group();
    hand.position.set(side * GRIP_ANCHOR.x, GRIP_ANCHOR.y, GRIP_ANCHOR.z);
    hand.scale.setScalar(0.9);
    wheel.add(hand);
    buildGlove(side, glove, hand);
  }
  return arms;
}

const armUp = new THREE.Vector3(0, 1, 0);
const armWrist = new THREE.Vector3();
const armDirection = new THREE.Vector3();

function updateDriverArms(arms, wheel) {
  for (const arm of arms) {
    armWrist
      .copy(wristLocal(arm.side))
      .multiply(wheel.scale)
      .applyEuler(wheel.rotation)
      .add(wheel.position);
    // O cotovelo acompanha parte do movimento da mão: o antebraço não vira uma viga ao esterçar.
    arm.elbow.copy(arm.base).lerp(armWrist, 0.25);
    armDirection.copy(armWrist).sub(arm.elbow);
    const length = armDirection.length();
    arm.mesh.position.copy(arm.elbow).add(armWrist).multiplyScalar(0.5);
    arm.mesh.quaternion.setFromUnitVectors(armUp, armDirection.normalize());
    arm.mesh.scale.set(1, length, 1);
    // Punho claro logo atrás da luva, alinhado ao antebraço.
    arm.band.quaternion.copy(arm.mesh.quaternion);
    arm.band.position.copy(armWrist).addScaledVector(armDirection, -0.035);
  }
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
  const shellPaint = new THREE.MeshPhysicalMaterial({ ...paintOptions, color: "#ebebeb", map: makeLiveryTexture(teamColor, sideStripe) });
  const nosePaint = new THREE.MeshPhysicalMaterial({ ...paintOptions, color: "#ebebeb", map: makeLiveryTexture(teamColor, [0.44, 0.56]) });
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
  const safetyFabric = fabricMaterial("#1c2128", "#252c34", { repeat: [4, 6], roughness: 0.92 });
  const glove = fabricMaterial("#262b31", "#1d2226", { repeat: [1, 1], roughness: 0.66, dots: true });
  const cuff = makeMaterial("#e9e5d8", { roughness: 0.75 });
  const haloCarbon = carbon.clone();
  haloCarbon.roughness = 0.34;

  const sideMaterials = [lining, padding, shellPaint];
  cockpitSide(-1, sideMaterials, parent);
  cockpitSide(1, sideMaterials, parent);
  cockpitNose(nosePaint, parent);

  // Capa do painel: carbono fosco curvo sobre o display, como nos monopostos reais.
  const hood = addMesh(new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), carbon, 0, 0.875, 0.78, parent);
  hood.scale.set(0.27, 0.07, 0.2);
  hood.name = "beta-dash-hood";

  // Banheira: piso escuro do cockpit.
  const tub = new THREE.Shape();
  tub.moveTo(-0.3, -0.95);
  tub.lineTo(0.3, -0.95);
  tub.lineTo(0.22, 0.85);
  tub.lineTo(-0.22, 0.85);
  tub.closePath();
  const tubMesh = addMesh(new THREE.ShapeGeometry(tub), alcantara, 0, 0.52, 0, parent);
  tubMesh.rotation.x = -Math.PI / 2;

  // Halo: aro oval que alarga no centro e encontra o pilar frontal.
  const crownPoints = [
    [-0.42, 1.0, -0.6],
    [-0.56, 1.14, -0.3],
    [-0.5, 1.23, 0.1],
    [-0.27, 1.2, 0.4],
    [0, 1.175, 0.55],
    [0.27, 1.2, 0.4],
    [0.5, 1.23, 0.1],
    [0.56, 1.14, -0.3],
    [0.42, 1.0, -0.6],
  ];
  const bulge = (t, amount) => amount * Math.exp(-(((t - 0.5) / 0.14) ** 2));
  const haloCrown = ribbonTube(
    crownPoints,
    (t) => 0.022 + bulge(t, 0.006),
    (t) => 0.03 + bulge(t, 0.01),
    haloCarbon,
    parent,
    { segments: 96 },
  );
  haloCrown.name = "beta-halo-crown";
  // Pilar curto: nasce no painel e sobe só até o aro, como nas imagens de referência.
  const haloPillar = ribbonTube(
    [[0, 1.175, 0.55], [0, 1.06, 0.74], [0, 0.97, 0.88], [0, 0.91, 0.94]],
    (t) => 0.024 + 0.014 * (1 - t) ** 2,
    (t) => 0.03 + 0.008 * (1 - t),
    haloCarbon,
    parent,
    { segments: 40 },
  );
  haloPillar.name = "beta-halo-pillar";
  const pillarBase = addMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 20), aluminum, 0, 0.945, 0.94, parent);
  pillarBase.name = "beta-halo-mount";

  const mirrors = [buildMirror(-1, carbon, plainPaint, parent), buildMirror(1, carbon, plainPaint, parent)];

  // Coxas do piloto convergindo para os joelhos sob o volante: sem elas a área
  // abaixo do volante parece vazia.
  for (const side of [-1, 1]) {
    const thigh = addMesh(new THREE.CapsuleGeometry(0.085, 0.72, 8, 16), safetyFabric, side * 0.155, 0.6, -0.02, parent);
    thigh.rotation.x = Math.PI / 2 - 0.05;
    thigh.rotation.z = side * 0.03;
    thigh.name = `beta-driver-thigh-${side < 0 ? "left" : "right"}`;
  }

  const data = buildSteeringWheel(parent, carbon, aluminum);
  data.arms = buildDriverArms(parent, data.wheel, safetyFabric, glove, cuff);
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
