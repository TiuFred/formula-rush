import * as THREE from "three";
import { state } from "./state.js";
import { addBox, addMesh, makeMaterial, makeTextPanel } from "./materials.js";
import { alignedFootprintClearanceAt, cornerWideningAt, trackHalfWidthAt } from "./track.js";
import { createCrowdMeshes, pickShirtColor, SKIN_TONES, FLAG_VARIANTS } from "./crowd.js";
import { ROTATION_IDS } from "./sponsors.js";
import { INTERLAGOS_BRIDGE, INTERLAGOS_STANDS, INTERLAGOS_TOWER } from "./interlagosReal.js";

// Localização e cobertura: dados do OpenStreetMap e do mapa oficial do GP São
// Paulo, reunidos em interlagosReal.js (fontes, método e limites de fidelidade
// em docs/interlagos-2.0.md).
export { INTERLAGOS_STANDS };

/** Cores das cadeiras por setor: duas cores em listras diagonais de 5 assentos. */
const SEAT_PALETTES = {
  A: ["#28587e", "#e8e1cf"],
  B: ["#d9c04a", "#1f7a4d"],
  M: ["#28587e", "#f1c04b"],
  D: ["#b02a30", "#e8e1cf"],
  H: ["#1f7a4d", "#e8e1cf"],
  R: ["#28587e", "#d9c04a"],
  G: ["#28587e", "#2f9a9a"],
  PORTO: ["#e8e1cf", "#28587e"],
};

/** Fração das cadeiras ocupadas e fração de torcedores com bandeira. */
const CROWD_DENSITY = 0.64;
const FLAG_SHARE = 0.045;

const MARSHAL_POSTS = [[350, -1], [1010, 1], [1740, -1], [2380, 1], [3040, -1], [3730, 1]];

export function planInterlagosLandmarks(track) {
  // Passarela real (OSM): pilares em lane ±24, ou além do muro quando o escape é largo.
  const bridgeStation = INTERLAGOS_BRIDGE.s;
  const wallReach = Math.max(
    trackHalfWidthAt(bridgeStation) + cornerWideningAt(bridgeStation, -1),
    trackHalfWidthAt(bridgeStation) + cornerWideningAt(bridgeStation, 1),
  );
  const bridgeHalf = Math.max(INTERLAGOS_BRIDGE.span, wallReach + 2.5);
  const { rampLength } = INTERLAGOS_BRIDGE;
  const groundStructures = [
    { id: "bridge-left", s: bridgeStation, lane: -bridgeHalf, width: .65, depth: 3.5 },
    { id: "bridge-right", s: bridgeStation, lane: bridgeHalf, width: .65, depth: 3.5 },
    { id: "bridge-ramp-left", s: bridgeStation, lane: -(bridgeHalf + rampLength / 2), width: rampLength - 1, depth: 3.5 },
    { id: "bridge-ramp-right", s: bridgeStation, lane: bridgeHalf + rampLength / 2, width: rampLength - 1, depth: 3.5 },
    { id: "timing-tower", s: INTERLAGOS_TOWER.s, lane: INTERLAGOS_TOWER.lane, width: 4.8, depth: 4.8 },
  ];
  for (const [s, side] of MARSHAL_POSTS) {
    const lane = side * (trackHalfWidthAt(s) + 7.5);
    if (alignedFootprintClearanceAt(track, s, lane, 4.2, 5) >= 2) {
      groundStructures.push({ id: `marshal-${s}`, s, lane, width: 4.2, depth: 5 });
    }
  }
  return { bridgeStation, bridgeHalf, rampLength, groundStructures };
}

/** Valida toda a projeção da cobertura, não só o centro de cada arquibancada. */
export function planInterlagosStands(track) {
  const modules = [];
  for (const stand of INTERLAGOS_STANDS) {
    const depth = stand.rows * .82 + 3;
    // Cada módulo cobre 18 m centrados em `s`: os extremos ficam dentro de [start, end].
    for (let s = stand.start + 9; s <= stand.end - 9 + 1e-6; s += 18) {
      const lane = trackHalfWidthAt(s) + 12 + depth / 2;
      if (alignedFootprintClearanceAt(track, s, lane, depth + 3, 18) < 3) continue;
      modules.push({ ...stand, s, lane, depth, length: 17.8 });
    }
  }
  return modules;
}

function beam(a, b, radius, material, parent) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 5), material, 0, 0, 0, parent);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

/** `sponsors` (opcional): acumulador de placas; cada módulo ganha placas na grade frontal. */
export function buildInterlagosStands(rng, sponsors = null) {
  const modules = planInterlagosStands(state.track);
  const concrete = makeMaterial("#9e9f98", { roughness: .95 });
  const steel = makeMaterial("#65716d", { metalness: .65, roughness: .48 });
  const roof = makeMaterial("#d5d5ca", { metalness: .25, roughness: .6 });
  const seatMaterial = makeMaterial("#ffffff", { roughness: .75 });
  const count = modules.reduce((sum, m) => sum + m.rows * 22, 0);
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(.46, .12, .49), seatMaterial, count);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(.09, .4, .49), seatMaterial, count);
  // Público animado no shader (ver crowd.js): torcedores comuns, porta-bandeiras e cabeças.
  const crowd = createCrowdMeshes({
    fans: count,
    bearers: Math.ceil(count * FLAG_SHARE * 1.5),
    flags: Math.ceil(count * FLAG_SHARE * 1.5),
  });
  const { fans, bearers, heads, flags } = crowd;
  const flagVariant = flags.geometry.attributes.aFlag.array;
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const point = new THREE.Vector3();
  let n = 0, p = 0, b = 0, h = 0;
  const labels = new Set();
  let boardCounter = 0;
  for (const module of modules) {
    const { s, lane, depth, rows, covered, id, length } = module;
    const frame = state.track.at(s, lane);
    const root = new THREE.Group();
    root.name = `interlagos-sector-${id}`;
    root.position.copy(frame.p);
    root.rotation.y = frame.yaw + Math.PI;
    root.userData.standFootprint = { s, lane, width: depth + 3, depth: 18 };
    state.scene.add(root);
    root.updateMatrixWorld(true);
    const front = -depth / 2;
    const height = rows * .42;
    const palette = SEAT_PALETTES[id] ?? SEAT_PALETTES.A;
    const labelHere = !labels.has(id);
    // Bancadas em degraus, corredores e pilares estruturais até o terreno.
    for (let row = 0; row < rows; row++) {
      const x = front + 1 + row * .82;
      const y = 1.2 + row * .42;
      addBox(.84, .22, length, concrete, x, y, 0, root);
      for (let col = 0; col < 22; col++) {
        if (col === 0 || col === 11) continue;
        const z = -8.1 + col * .74;
        point.set(x, y + .3, z).applyMatrix4(root.matrixWorld);
        dummy.position.copy(point);
        dummy.rotation.set(0, root.rotation.y, 0);
        dummy.updateMatrix();
        seats.setMatrixAt(n, dummy.matrix);
        color.set(palette[Math.floor((col + row * .5) / 5) % 2]).multiplyScalar(.9 + ((row * 7 + col * 13) % 5) * .025);
        seats.setColorAt(n, color);
        point.set(x + .22, y + .53, z).applyMatrix4(root.matrixWorld);
        dummy.position.copy(point); dummy.updateMatrix();
        backs.setMatrixAt(n, dummy.matrix);
        backs.setColorAt(n++, color);
        if (rng() > CROWD_DENSITY) continue;
        const bearer = rng() < FLAG_SHARE && b < flags.instanceMatrix.count;
        point.set(x, y + .69, z).applyMatrix4(root.matrixWorld);
        dummy.position.copy(point); dummy.updateMatrix();
        const body = bearer ? bearers : fans;
        const slot = bearer ? b++ : p++;
        body.setMatrixAt(slot, dummy.matrix);
        body.setColorAt(slot, color.set(pickShirtColor(rng())));
        if (bearer) {
          flags.setMatrixAt(slot, dummy.matrix);
          flagVariant[slot] = Math.floor(rng() * FLAG_VARIANTS.length);
        }
        dummy.position.y += .4; dummy.updateMatrix();
        heads.setMatrixAt(h, dummy.matrix);
        heads.setColorAt(h++, color.set(SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)]));
      }
    }
    for (const z of [-8.6, 8.6]) {
      for (const x of [front + .7, depth / 2 - 1]) {
        const top = x < 0 ? 1.1 : height + 1.6;
        addBox(.32, top + 8, .32, concrete, x, (top - 8) / 2, z, root);
      }
      beam([front, 2.1, z], [depth / 2, height + 2, z], .055, steel, root);
    }
    addBox(.12, 1.05, length, steel, front - .4, 1.4, 0, root);
    // Placas de patrocínio na grade frontal; o painel "SETOR" ocupa o centro do primeiro módulo.
    if (sponsors) {
      for (const z of [-5.95, 0, 5.95]) {
        if (z === 0 && labelHere) continue;
        sponsors.panel(root, ROTATION_IDS[boardCounter++ % ROTATION_IDS.length], [front - .5, 1.4, z], 5.8, .96, [-1, 0, 0]);
      }
    }
    if (covered) {
      const roofY = height + 4.1;
      const canopy = addBox(depth + 2.5, .13, 18.05, roof, 0, roofY, 0, root);
      canopy.rotation.z = .045;
      for (const z of [-8.6, 8.6]) {
        addBox(.22, roofY + 8, .22, steel, depth / 2, (roofY - 8) / 2, z, root);
        beam([front - 1, roofY - .8, z], [depth / 2, roofY - .8, z], .07, steel, root);
        for (let x = front; x < depth / 2; x += 2) {
          beam([x, roofY - .85, z], [x + 1, roofY - .05, z], .035, steel, root);
          beam([x + 1, roofY - .05, z], [x + 2, roofY - .85, z], .035, steel, root);
        }
      }
    }
    if (!labels.has(id)) {
      labels.add(id);
      const label = makeTextPanel(`SETOR ${id}`, id === "PORTO" ? 7 : 4, 1.1, "#173c35", "#f4ecdb");
      label.position.set(front - .48, covered ? height + 3.1 : 1.4, 0);
      label.rotation.y = -Math.PI / 2;
      root.add(label);
    }
  }
  for (const [mesh, total] of [[seats, n], [backs, n], [fans, p], [bearers, b], [flags, b], [heads, h]]) {
    mesh.count = total;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // A estrutura projeta sombra; milhares de assentos/pessoas não precisam
    // ser redesenhados no mapa de sombras a cada frame.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    state.scene.add(mesh);
  }
  flags.geometry.attributes.aFlag.needsUpdate = true;
}

/** Membranas brancas com mastros e cabos, baseadas nas fotos dos boxes. */
export function addPitCanopy(s, lane, parent = state.scene) {
  const frame = state.track.at(s, lane);
  const root = new THREE.Group();
  root.position.copy(frame.p);
  root.rotation.y = frame.yaw;
  parent.add(root);
  const material = makeMaterial("#eeeade", { roughness: .72, side: THREE.DoubleSide });
  const geometry = new THREE.PlaneGeometry(16, 19.8, 16, 16);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 8, z = pos.getZ(i) / 9.9;
    const peak = Math.pow(Math.max(0, 1 - Math.hypot(x, z) / 1.42), 1.6);
    pos.setY(i, 8.2 + peak * 4 + .4 * x);
  }
  geometry.computeVertexNormals();
  addMesh(geometry, material, 0, 0, 0, root);
  const cable = makeMaterial("#d4d6cd", { metalness: .6, roughness: .45 });
  beam([0, 6.7, 0], [0, 14.4, 0], .1, cable, root);
  for (const x of [-8, 8]) {
    for (const z of [-9.9, 9.9]) beam([0, 14.3, 0], [x, 8.2 + .4 * x / 8, z], .024, cable, root);
  }
}

function alignedRoot(s, lane = 0) {
  const frame = state.track.at(s, lane);
  const root = new THREE.Group();
  root.position.copy(frame.p);
  root.rotation.set(-Math.asin(frame.t.y), frame.yaw, -frame.bank, "YXZ");
  state.scene.add(root);
  return root;
}

/** Elementos de orientação vistos durante a volta: passarela, pórticos,
 * torre de cronometragem e postos de fiscais. Todos ficam fora do corredor
 * lateral ou a mais de 6,5 m do asfalto. */
export function buildInterlagosLandmarks(sponsors = null) {
  const concrete = makeMaterial("#b3b4ae", { roughness: .94 });
  const steel = makeMaterial("#4f5b5b", { metalness: .72, roughness: .4 });
  const glass = makeMaterial("#263e49", { metalness: .62, roughness: .18 });
  const green = makeMaterial("#174c40", { roughness: .62 });
  const lightOff = makeMaterial("#271b18", { roughness: .55 });

  // Passarela na aproximação do miolo, com apoios além das defensas.
  const { bridgeStation, bridgeHalf, rampLength, groundStructures } = planInterlagosLandmarks(state.track);
  const bridge = alignedRoot(bridgeStation);
  addBox(bridgeHalf * 2, .72, 4.2, concrete, 0, 7.15, 0, bridge);
  addBox(bridgeHalf * 2, 1.65, .12, glass, 0, 8.28, -2.02, bridge);
  addBox(bridgeHalf * 2, 1.65, .12, glass, 0, 8.28, 2.02, bridge);
  for (const side of [-1, 1]) {
    addBox(.65, 7.5, 3.5, concrete, side * bridgeHalf, 3.55, 0, bridge);
    for (let y = 7.7; y < 9; y += .42) addBox(bridgeHalf * 2, .035, .035, steel, 0, y, side > 0 ? 2.09 : -2.09, bridge);
  }
  // Rampas/escadas até o chão nos dois lados (OSM: bridge=yes + highway=steps, lane 24–40).
  const rampRise = 7.15, rampRun = rampLength;
  const rampAngle = Math.atan2(rampRise, rampRun), rampSpan = Math.hypot(rampRise, rampRun);
  for (const side of [-1, 1]) {
    const x = -side * (bridgeHalf + rampRun / 2);
    const ramp = addBox(rampSpan, .34, 3.2, concrete, x, rampRise / 2 + .1, 0, bridge);
    ramp.rotation.z = side * rampAngle;
    for (const edge of [-1.5, 1.5]) {
      const rail = addBox(rampSpan, .06, .06, steel, x, rampRise / 2 + 1.2, edge, bridge);
      rail.rotation.z = ramp.rotation.z;
    }
    for (let step = 1; step < 14; step++) {
      const t = step / 14;
      addBox(.05, .05, 3.2, steel, -side * (bridgeHalf + rampRun * t), rampRise * (1 - t) + .3, 0, bridge);
    }
  }
  const bridgeSign = makeTextPanel("INTERLAGOS · SÃO PAULO", 14, 1.15, "#174c40", "#f4f0df");
  bridgeSign.position.set(0, 6.72, -2.14);
  bridgeSign.rotation.y = Math.PI; // texto legível por quem se aproxima (−z); sem isso saía espelhado
  bridge.add(bridgeSign);
  if (sponsors) {
    // Faixa de patrocinadores no vidro frontal da passarela, de frente para quem se aproxima.
    const pitch = 6.3;
    const total = Math.floor((bridgeHalf * 2 - 2) / pitch);
    for (let i = 0; i < total; i++) {
      sponsors.panel(bridge, ROTATION_IDS[(i * 5 + 2) % ROTATION_IDS.length], [(i - (total - 1) / 2) * pitch, 8.3, -2.1], 5.9, .98, [0, 0, -1]);
    }
  }

  // Pórtico de largada e conjunto de cinco luzes sobre a reta principal.
  const gantryStation = -32;
  const gantry = alignedRoot(gantryStation);
  const gantryHalf = trackHalfWidthAt(gantryStation) + 3.2;
  for (const side of [-1, 1]) addBox(.24, 7.7, .32, steel, side * gantryHalf, 3.75, 0, gantry);
  addBox(gantryHalf * 2, .32, .4, steel, 0, 7.45, 0, gantry);
  if (sponsors) {
    // Dois painéis pendurados dos dois lados das luzes de largada.
    for (const [x, id] of [[-5.3, "formula-rush"], [5.3, "kronos"]]) sponsors.panel(gantry, id, [x, 6.95, -.24], 6, 1, [0, 0, -1]);
  }
  for (let lamp = 0; lamp < 5; lamp++) {
    const housing = addMesh(new THREE.CylinderGeometry(.25, .25, .22, 18), lightOff,
      (lamp - 2) * .68, 7.05, -.03, gantry);
    housing.rotation.x = Math.PI / 2;
  }

  // Torre vertical de cronometragem voltada para a reta e boxes.
  const towerPlan = groundStructures.find((item) => item.id === "timing-tower");
  const tower = alignedRoot(towerPlan.s, towerPlan.lane);
  addBox(3.4, 18, 3.2, concrete, 0, 9, 0, tower);
  addBox(4.2, 5.4, 4.4, glass, 0, 14.7, 0, tower);
  addBox(4.7, .28, 4.8, green, 0, 17.6, 0, tower);
  const towerLabel = makeTextPanel("INTERLAGOS", 2.8, 9.6, "#102c27", "#f2ead1");
  // A face com o nome olha para a pista (a torre fica à direita; +x local aponta para a esquerda).
  towerLabel.position.set(1.73, 7.2, 0);
  towerLabel.rotation.y = Math.PI / 2;
  tower.add(towerLabel);
  for (let floor = 0; floor < 5; floor++) {
    addBox(.06, .05, 3.24, steel, 1.74, 2.5 + floor * 2, 0, tower);
  }

  // Postos de fiscais acrescentam escala e pontos reconhecíveis sem invadir a pista.
  for (const plan of groundStructures.filter((item) => item.id.startsWith("marshal-"))) {
    const post = alignedRoot(plan.s, plan.lane);
    addBox(4.2, .28, 5, concrete, 0, .12, 0, post);
    addBox(3.5, 2.25, 4.2, green, 0, 1.35, 0, post);
    addBox(3.15, 1.15, .08, glass, 0, 1.65, -2.13, post);
    addBox(4.65, .2, 5.35, concrete, 0, 2.58, 0, post);
  }
}
