import * as THREE from "three";
import { state } from "./state.js";
import { addBox, addMesh, makeMaterial, makeTextPanel } from "./materials.js";
import { alignedFootprintClearanceAt, trackHalfWidthAt } from "./track.js";

// Localização e cobertura: mapa e fotos oficiais do GP São Paulo.
// Estações e dimensões abaixo são aproximações ao GeoJSON, não levantamento CAD.
// Referências e limites de fidelidade: docs/interlagos-2.0.md.
export const INTERLAGOS_STANDS = [
  { id: "A", start: -650, end: -160, rows: 23, covered: false },
  { id: "B", start: -130, end: 14, rows: 17, covered: true },
  { id: "M", start: 40, end: 238, rows: 21, covered: true },
  { id: "D", start: 270, end: 378, rows: 16, covered: true },
  { id: "H", start: 420, end: 528, rows: 17, covered: true },
  { id: "R", start: 570, end: 714, rows: 18, covered: true },
  { id: "G", start: 770, end: 1238, rows: 22, covered: false },
  { id: "PORTO", start: 1280, end: 1352, rows: 18, covered: true },
];

const MARSHAL_POSTS = [[350, -1], [1010, 1], [1740, -1], [2380, 1], [3040, -1], [3730, 1]];

export function planInterlagosLandmarks(track) {
  const bridgeStation = 710;
  const bridgeHalf = trackHalfWidthAt(bridgeStation) + 8.5;
  const groundStructures = [
    { id: "bridge-left", s: bridgeStation, lane: -bridgeHalf, width: .65, depth: 3.5 },
    { id: "bridge-right", s: bridgeStation, lane: bridgeHalf, width: .65, depth: 3.5 },
    { id: "timing-tower", s: -115, lane: trackHalfWidthAt(-115) + 11, width: 4.8, depth: 4.8 },
  ];
  for (const [s, side] of MARSHAL_POSTS) {
    const lane = side * (trackHalfWidthAt(s) + 7.5);
    if (alignedFootprintClearanceAt(track, s, lane, 4.2, 5) >= 2) {
      groundStructures.push({ id: `marshal-${s}`, s, lane, width: 4.2, depth: 5 });
    }
  }
  return { bridgeStation, bridgeHalf, groundStructures };
}

/** Valida toda a projeção da cobertura, não só o centro de cada arquibancada. */
export function planInterlagosStands(track) {
  const modules = [];
  for (const stand of INTERLAGOS_STANDS) {
    const depth = stand.rows * .82 + 3;
    for (let s = stand.start; s < stand.end; s += 18) {
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

export function buildInterlagosStands(rng) {
  const modules = planInterlagosStands(state.track);
  const concrete = makeMaterial("#9e9f98", { roughness: .95 });
  const steel = makeMaterial("#65716d", { metalness: .65, roughness: .48 });
  const roof = makeMaterial("#d5d5ca", { metalness: .25, roughness: .6 });
  const seatMaterial = makeMaterial("#28587e", { roughness: .75 });
  const count = modules.reduce((sum, m) => sum + m.rows * 22, 0);
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(.46, .12, .49), seatMaterial, count);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(.09, .4, .49), seatMaterial, count);
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.14, .37, 1, 4), makeMaterial("#ffffff"), count);
  const heads = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.16), makeMaterial("#bd977c"), count);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const point = new THREE.Vector3();
  let n = 0, p = 0;
  const labels = new Set();
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
        point.set(x + .22, y + .53, z).applyMatrix4(root.matrixWorld);
        dummy.position.copy(point); dummy.updateMatrix();
        backs.setMatrixAt(n++, dummy.matrix);
        if (rng() > .48) continue;
        point.set(x, y + .69, z).applyMatrix4(root.matrixWorld);
        dummy.position.copy(point); dummy.updateMatrix();
        people.setMatrixAt(p, dummy.matrix);
        color.set(["#e0d8c9", "#cab447", "#253b57", "#36473c", "#a03930"][Math.floor(rng() * 5)]);
        people.setColorAt(p, color);
        dummy.position.y += .4; dummy.updateMatrix();
        heads.setMatrixAt(p++, dummy.matrix);
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
  for (const [mesh, total] of [[seats, n], [backs, n], [people, p], [heads, p]]) {
    mesh.count = total;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // A estrutura projeta sombra; milhares de assentos/pessoas não precisam
    // ser redesenhados no mapa de sombras a cada frame.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    state.scene.add(mesh);
  }
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
export function buildInterlagosLandmarks() {
  const concrete = makeMaterial("#b3b4ae", { roughness: .94 });
  const steel = makeMaterial("#4f5b5b", { metalness: .72, roughness: .4 });
  const glass = makeMaterial("#263e49", { metalness: .62, roughness: .18 });
  const green = makeMaterial("#174c40", { roughness: .62 });
  const lightOff = makeMaterial("#271b18", { roughness: .55 });

  // Passarela na aproximação do miolo, com apoios além das defensas.
  const { bridgeStation, bridgeHalf, groundStructures } = planInterlagosLandmarks(state.track);
  const bridge = alignedRoot(bridgeStation);
  addBox(bridgeHalf * 2, .72, 4.2, concrete, 0, 7.15, 0, bridge);
  addBox(bridgeHalf * 2, 1.65, .12, glass, 0, 8.28, -2.02, bridge);
  addBox(bridgeHalf * 2, 1.65, .12, glass, 0, 8.28, 2.02, bridge);
  for (const side of [-1, 1]) {
    addBox(.65, 7.5, 3.5, concrete, side * bridgeHalf, 3.55, 0, bridge);
    for (let y = 7.7; y < 9; y += .42) addBox(bridgeHalf * 2, .035, .035, steel, 0, y, side > 0 ? 2.09 : -2.09, bridge);
  }
  const bridgeSign = makeTextPanel("INTERLAGOS · SÃO PAULO", 14, 1.15, "#174c40", "#f4f0df");
  bridgeSign.position.set(0, 6.72, -2.14);
  bridge.add(bridgeSign);

  // Pórtico de largada e conjunto de cinco luzes sobre a reta principal.
  const gantryStation = -32;
  const gantry = alignedRoot(gantryStation);
  const gantryHalf = trackHalfWidthAt(gantryStation) + 3.2;
  for (const side of [-1, 1]) addBox(.24, 7.7, .32, steel, side * gantryHalf, 3.75, 0, gantry);
  addBox(gantryHalf * 2, .32, .4, steel, 0, 7.45, 0, gantry);
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
  towerLabel.position.set(-1.73, 7.2, 0);
  towerLabel.rotation.y = -Math.PI / 2;
  tower.add(towerLabel);
  for (let floor = 0; floor < 5; floor++) {
    addBox(.06, .05, 3.24, steel, -1.74, 2.5 + floor * 2, 0, tower);
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
