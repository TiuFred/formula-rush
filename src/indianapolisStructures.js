// Cenário 2.0 estimado a partir da descrição oficial do IMS, consultada em
// 05/10/2026. Sem malhas, fotos, logotipos ou texturas externas. As posições
// adaptam-se à origem do oval legado; fidelidade e fontes em docs/indianapolis-2.0.md.
import * as THREE from "three";
import { state } from "./state.js";
import { addBox, addMesh, makeMaterial } from "./materials.js";
import { trackHalfWidthAt } from "./track.js";
import { buildDetailedStands, addPitCanopy } from "./interlagosStructures.js";
import { planIndianapolisStands, planIndianapolisLandmarks } from "./indianapolisScenery.js";
import { ROTATION_IDS } from "./sponsors.js";

function rootAt(s, lane = 0) {
  const frame = state.track.at(s, lane);
  const root = new THREE.Group();
  root.position.copy(frame.p);
  root.rotation.y = frame.yaw;
  state.scene.add(root);
  return root;
}

export function buildIndianapolisDetails(rng, sponsors) {
  buildDetailedStands(planIndianapolisStands(state.track), rng, sponsors, "indianapolis");
  const concrete = makeMaterial("#b9b9b2", { roughness: .92 });
  const steel = makeMaterial("#66737b", { metalness: .6, roughness: .45 });
  const glass = makeMaterial("#284453", { metalness: .5, roughness: .24 });
  const roof = makeMaterial("#d8d8ce", { metalness: .3, roughness: .5 });
  const dark = makeMaterial("#202a30", { roughness: .8 });
  const pitRoad = makeMaterial("#575b5c", { roughness: .95 });
  const paint = makeMaterial("#e5dfbf");
  const plans = planIndianapolisLandmarks();
  const pagodaPlan = plans.find((p) => p.id === "pagoda");
  const pagoda = rootAt(pagodaPlan.s, pagodaPlan.lane);
  pagoda.name = "indianapolis-pagoda";
  addBox(20, 7, 24, concrete, 0, 1, 0, pagoda);
  // Andares envidraçados, varandas e beirais progressivamente menores.
  for (let floor = 0; floor < 8; floor++) {
    const width = 21 - floor * 1.45;
    const depth = 25 - floor * 1.7;
    const y = 4.5 + floor * 3.8;
    addBox(width - 2, 3.1, depth - 2, glass, 0, y + 1.55, 0, pagoda);
    addBox(width + 1, .32, depth + 1, roof, 0, y + 3.25, 0, pagoda);
    addBox(width, .18, depth, concrete, 0, y, 0, pagoda);
    for (const z of [-depth / 2 + 1, depth / 2 - 1]) {
      for (const x of [-width / 2 + 1, 0, width / 2 - 1]) addBox(.18, 3.1, .18, steel, x, y + 1.55, z, pagoda);
    }
  }
  addBox(.2, 5, .2, steel, 0, 37, 0, pagoda);
  sponsors.panel(pagoda, "indianapolis", [-11.6, 5.5, 0], 21, 2, [-1, 0, 0]);

  const pylonPlan = plans.find((p) => p.id === "pylon");
  const pylon = rootAt(pylonPlan.s, pylonPlan.lane);
  addBox(2.5, 36, 2.5, dark, 0, 14, 0, pylon);
  for (let i = 0; i < 10; i++) {
    addBox(.05, .1, 2.2, paint, -1.28, 5 + i * 2.5, 0, pylon);
  }
  sponsors.panel(pylon, "formula-rush", [-1.3, 31, 0], 3.4, 1.1, [-1, 0, 0]);

  // Boxes e faixa de pit lane paralelos à reta, com canopy compartilhado.
  for (const [index, plan] of plans.filter((p) => p.id.startsWith("pit-")).entries()) {
    const pit = rootAt(plan.s, plan.lane);
    addBox(15, .4, 20, concrete, 0, 0, 0, pit);
    addBox(15, .3, 20, concrete, 0, 4, 0, pit);
    addBox(.4, 5.8, 20, concrete, 7.3, 2.9, 0, pit);
    addBox(.1, 1.5, 19.4, glass, -7.45, 5, 0, pit);
    for (const z of [-9.8, 0, 9.8]) addBox(15, 3.8, .22, dark, 0, 2, z, pit);
    addPitCanopy(plan.s, plan.lane);
    sponsors.panel(pit, ROTATION_IDS[index % ROTATION_IDS.length], [-7.6, 3.1, 0], 17, 1.1, [-1, 0, 0]);
    const road = rootAt(plan.s, -18);
    addBox(11, .025, 20, pitRoad, 0, .115, 0, road);
    for (const x of [-5.2, 5.2]) addBox(.12, .025, 20, paint, x, .14, 0, road);
  }

  // Passarela sobre o fim da reta. Pilares/escadas ocupam a lacuna das bancadas.
  const bridge = rootAt(plans.find((p) => p.id === "bridge-inner").s);
  bridge.name = "indianapolis-bridge";
  addBox(39, .6, 5, concrete, 0, 8.2, 0, bridge);
  for (const side of [-1, 1]) {
    addBox(1, 14, 4.4, concrete, side * 19, 1.2, 0, bridge);
    addBox(39, 1.8, .12, glass, 0, 9.3, side * 2.4, bridge);
    for (let step = 0; step < 28; step++) {
      addBox(.72, .25, 4.4, concrete, side * (20 + step * .7), 8 - step * .29, 0, bridge);
    }
  }
  sponsors.panel(bridge, "indianapolis", [0, 9.3, -2.5], 20, 1.5, [0, 0, -1]);

  // Faixa de uma jarda (0,9144 m), tijolos desenhados com geometria simples.
  const mortar = makeMaterial("#d1b59b", { roughness: 1 });
  const bricks = ["#9c4d36", "#b36a4a", "#8c4939", "#bc7756"].map((color) => makeMaterial(color, { roughness: .95 }));
  const line = rootAt(0);
  const half = trackHalfWidthAt(0);
  addBox(half * 2, .02, .9144, mortar, 0, .14, 0, line);
  for (let row = 0; row < 4; row++) {
    for (let x = -half + .2; x < half - .2; x += .4) {
      addBox(.38, .025, .21, bricks[(row + Math.floor((x + half) * 5)) % bricks.length], x, .16, -.3429 + row * .2286, line);
    }
  }

  // Sinalização da casa na reta e nas bancadas, com o mesmo atlas das demais placas.
  for (const s of [180, 520, 860, 1300, 1830, 3200, 3800]) {
    const panel = rootAt(s, 22);
    panel.rotation.y += Math.PI;
    sponsors.panel(panel, "indianapolis", [-.1, 6, 0], 14, 2.2, [-1, 0, 0]);
  }
}

/** Quatro greens e bunkers estimados no infield; o lago usa scenery.harbor. */
export function buildIndianapolisGolf(groundHeightAt) {
  const green = makeMaterial("#64844b", { roughness: 1 });
  const sand = makeMaterial("#d4c5a1", { roughness: 1 });
  const pole = makeMaterial("#d9dedb");
  for (const [s, lane] of [[2150, -180], [2350, -230], [2600, -180], [2800, -220]]) {
    const p = state.track.at(s, lane).p;
    for (const [dx, dz, radius, material] of [[0, 0, 30, green], [34, 9, 12, sand]]) {
      const geometry = new THREE.CircleGeometry(radius, 32);
      geometry.rotateX(-Math.PI / 2);
      const mesh = addMesh(geometry, material, p.x + dx, groundHeightAt(p.x + dx, p.z + dz) + .12, p.z + dz);
      mesh.scale.z = .65;
    }
    const y = groundHeightAt(p.x, p.z);
    addBox(.08, 2.5, .08, pole, p.x, y + 1.3, p.z);
    addBox(.7, .4, .02, pole, p.x + .35, y + 2.3, p.z);
  }
}
