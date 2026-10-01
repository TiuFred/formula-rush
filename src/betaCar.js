import * as THREE from "three";
import { addMesh, addBox, makeMaterial } from "./materials.js";
import { buildBetaCockpit } from "./betaCockpit.js";
import { makeCarbonMaterial } from "./betaSurfaceMaterials.js";

/** Superfície contínua definida por seções: z, largura, altura e centro y. */
function bodyShell(sections, material, parent, x = 0) {
  const positions = [],
    indices = [];
  const sides = 24;
  for (const [z, width, height, y] of sections) {
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      positions.push(
        x + Math.cos(angle) * width,
        y + Math.sin(angle) * height,
        z,
      );
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return addMesh(geo, material, 0, 0, 0, parent);
}

function tube(points, radius, material, parent) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  return addMesh(
    new THREE.TubeGeometry(curve, 24, radius, 8, false),
    material,
    0,
    0,
    0,
    parent,
  );
}

export function buildBetaCar(group, paint, wheels) {
  const hideOnboard = [];
  paint.metalness = 0.3;
  paint.roughness = 0.27;
  paint.envMapIntensity = 0.95;
  const carbon = makeCarbonMaterial();
  const tireMaterial = makeMaterial("#2a2b2e", { roughness: 0.68 });
  const alloy = makeMaterial("#8a9298", { metalness: 0.86, roughness: 0.27 });
  const accent = makeMaterial("#eee9dc", { metalness: 0.25, roughness: 0.3 });
  const visorMaterial = new THREE.MeshPhysicalMaterial({
    color: "#212e44",
    metalness: 0.8,
    roughness: 0.16,
    clearcoat: 1,
  });

  // Assoalho recortado e difusor, em vez de uma caixa sob a carroceria.
  const outline = new THREE.Shape();
  outline.moveTo(-0.28, 2.35);
  for (const [x, z] of [
    [0.28, 2.35],
    [0.42, 1.05],
    [0.96, 0.55],
    [1.03, -1.22],
    [0.7, -2.25],
    [-0.7, -2.25],
    [-1.03, -1.22],
    [-0.96, 0.55],
    [-0.42, 1.05],
  ])
    outline.lineTo(x, z);
  outline.closePath();
  const floor = new THREE.ExtrudeGeometry(outline, {
    depth: 0.045,
    bevelEnabled: false,
  });
  floor.rotateX(Math.PI / 2);
  addMesh(floor, carbon, 0, 0.25, 0, group);

  // A casca central é dividida antes/depois do cockpit. Uma única superfície
  // fechada atravessava a banheira; ocultá-la resolvia o interior, mas também
  // fazia desaparecer nariz e laterais na visão do piloto.
  const rearBody = bodyShell(
    [
      [-1.65, 0.05, 0.04, 0.48],
      [-1.15, 0.33, 0.29, 0.62],
      [-0.7, 0.45, 0.31, 0.64],
    ],
    paint,
    group,
  );
  rearBody.name = "beta-rear-body";
  // Cobertura do motor estreita; o cockpit permanece aberto e legível.
  bodyShell(
    [
      [-1.9, 0.025, 0.02, 0.57],
      [-1.4, 0.19, 0.22, 0.66],
      [-0.95, 0.27, 0.36, 0.76],
      [-0.55, 0.21, 0.42, 0.83],
      [-0.4, 0.1, 0.18, 0.88],
    ],
    carbon,
    group,
  );
  for (const side of [-1, 1]) {
    bodyShell(
      [
        [-1.65, 0.025, 0.025, 0.37],
        [-1.25, 0.2, 0.12, 0.43],
        [-0.7, 0.33, 0.21, 0.5],
        [0, 0.35, 0.22, 0.56],
        [0.44, 0.28, 0.17, 0.6],
        [0.57, 0.2, 0.08, 0.6],
      ],
      paint,
      group,
      side * 0.61,
    );
    // Entrada de ar e lâmina lateral: recorte escuro dá profundidade ao sidepod.
    addBox(0.36, 0.17, 0.035, carbon, side * 0.64, 0.61, 0.574, group);
    addBox(0.03, 0.08, 1.46, accent, side * 0.97, 0.47, -0.55, group);
    for (const z of [-1.52, 1.45]) {
      // Pneus dianteiros de F1 são mais estreitos e de menor diâmetro que os traseiros.
      const front = z > 0;
      const axleX = front ? 0.97 : 1.03;
      const axleY = front ? 0.36 : 0.42;
      const wheel = new THREE.Group();
      wheel.position.set(side * axleX, axleY, z);
      if (front) wheel.scale.set(0.78, 0.86, 0.86);
      group.add(wheel);
      wheels.push(wheel);
      const profile = [
        new THREE.Vector2(0.26, -0.235),
        new THREE.Vector2(0.35, -0.23),
        new THREE.Vector2(0.405, -0.18),
        new THREE.Vector2(0.42, -0.11),
        new THREE.Vector2(0.42, 0.11),
        new THREE.Vector2(0.405, 0.18),
        new THREE.Vector2(0.35, 0.23),
        new THREE.Vector2(0.26, 0.235),
      ];
      const tire = addMesh(
        new THREE.LatheGeometry(profile, 48),
        tireMaterial,
        0,
        0,
        0,
        wheel,
      );
      tire.rotation.z = Math.PI / 2;
      const hub = addMesh(
        new THREE.CylinderGeometry(0.255, 0.255, 0.46, 32),
        carbon,
        0,
        0,
        0,
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      const ring = addMesh(
        new THREE.TorusGeometry(0.266, 0.009, 6, 48),
        alloy,
        side * 0.239,
        0,
        0,
        wheel,
      );
      ring.rotation.y = Math.PI / 2;
      for (let spoke = 0; spoke < 10; spoke++) {
        const angle = (spoke * Math.PI) / 5;
        const bar = addBox(
          0.012,
          0.028,
          0.2,
          alloy,
          side * 0.237,
          Math.sin(angle) * 0.115,
          Math.cos(angle) * 0.115,
          wheel,
        );
        bar.rotation.x = -angle;
      }
      const nut = addMesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.485, 6),
        alloy,
        0,
        0,
        0,
        wheel,
      );
      nut.rotation.z = Math.PI / 2;
      for (const y of [0.36, 0.61]) {
        tube(
          [
            [side * 0.3, y, z - 0.48],
            [side * 0.64, y - 0.025, z - 0.23],
            [side * (axleX - 0.04), axleY + 0.02, z],
          ],
          0.019,
          carbon,
          group,
        );
        tube(
          [
            [side * 0.3, y, z + 0.35],
            [side * 0.65, y - 0.015, z + 0.16],
            [side * (axleX - 0.04), axleY + 0.02, z],
          ],
          0.019,
          carbon,
          group,
        );
      }
    }
    addBox(0.045, 0.26, 0.58, paint, side * 1.18, 0.36, 2.31, group);
    addBox(0.045, 0.43, 0.67, paint, side * 1.02, 1.09, -2.1, group);
    addBox(0.055, 0.63, 0.13, carbon, side * 0.34, 0.68, -2.06, group);
  }
  // Perfil de asa abaulado, três elementos dianteiros e dois traseiros.
  for (let flap = 0; flap < 3; flap++) {
    const wing = addMesh(
      new THREE.BoxGeometry(2.35 - flap * 0.14, 0.045, 0.22),
      flap === 0 ? paint : carbon,
      0,
      0.27 + flap * 0.08,
      2.51 - flap * 0.19,
      group,
    );
    wing.rotation.x = -0.14;
  }
  for (let flap = 0; flap < 2; flap++) {
    const wing = addBox(
      2,
      0.065,
      0.3,
      flap ? paint : carbon,
      0,
      0.94 + flap * 0.2,
      -2.1 - flap * 0.14,
      group,
    );
    wing.rotation.x = 0.18;
  }
  for (let x = -0.6; x <= 0.6; x += 0.2)
    addBox(0.024, 0.18, 0.55, carbon, x, 0.3, -1.98, group);

  const helmet = addMesh(
    new THREE.SphereGeometry(0.225, 32, 20),
    accent,
    0,
    1.06,
    0.02,
    group,
  );
  helmet.scale.set(0.92, 1, 1);
  // A esfera parcial ocupa apenas a frente (+z) do capacete.
  const visor = addMesh(
    new THREE.SphereGeometry(0.227, 24, 10, 0.35, Math.PI - 0.7, 0.98, 0.45),
    visorMaterial,
    0,
    1.06,
    0.025,
    group,
  );
  group.userData.hideOnboard = [helmet, visor, ...hideOnboard];
  buildBetaCockpit(group, carbon, paint);
  const intake = addMesh(
    new THREE.TorusGeometry(0.12, 0.035, 8, 24),
    carbon,
    0,
    1.17,
    -0.45,
    group,
  );
  intake.scale.set(0.78, 1, 1);
  addBox(
    0.08,
    0.13,
    0.035,
    new THREE.MeshStandardMaterial({
      color: "#b62014",
      emissive: "#ff1708",
      emissiveIntensity: 2,
    }),
    0,
    0.47,
    -2.29,
    group,
  );
}
