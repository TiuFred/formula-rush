import * as THREE from "three";
import { addBox, addMesh, makeMaterial } from "./materials.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";

// O painel consome a telemetria do powertrain exclusivo da experiência 2.0.
export function cockpitTelemetry(car, raceTime) {
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  const kph = speed * 3.6;
  const powertrain = betaPowertrainTelemetry(car);
  const gear = speed < .5 ? "N" : powertrain.gear;
  return {
    speed: Math.round(kph), gear,
    shift: gear === "N" ? 0 : powertrain.rpm,
    throttle: powertrain.throttle,
    lap: Math.max(0, car.finish ? car.lastLap || 0 : raceTime - (car.lapStarted || 0)),
    status: car.currentLapValid === false ? "VOLTA INVALIDA" : car.drsActive ? "DRS ATIVO" : "TIME TRIAL",
  };
}

function taperedCockpitSide(side, material, parent) {
  const sections = [
    { z: -.42, inner: .31, outer: .49, y: 1.13, bottom: .91 },
    { z: .12, inner: .3, outer: .45, y: 1.09, bottom: .89 },
    { z: .72, inner: .245, outer: .36, y: .96, bottom: .84 },
    { z: 1.02, inner: .2, outer: .29, y: .86, bottom: .8 },
  ];
  const positions = [];
  for (const section of sections) {
    positions.push(
      side * section.outer, section.y, section.z,
      side * section.inner, section.y - .012, section.z,
      side * section.outer, section.bottom, section.z,
      side * section.inner, section.bottom, section.z,
    );
  }
  const indices = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 4, b = a + 4;
    for (const [p, q] of [[0, 1], [2, 0], [1, 3], [3, 2]]) {
      indices.push(a + p, b + p, a + q, b + p, b + q, a + q);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(geometry, material, 0, 0, 0, parent);
}

function wheelButton(parent, x, y, color) {
  const button = addMesh(
    new THREE.CylinderGeometry(.013, .014, .014, 16),
    makeMaterial(color, { roughness: .34, metalness: .1 }),
    x,
    y,
    -.063,
    parent,
  );
  button.rotation.x = Math.PI / 2;
  return button;
}

function wheelDial(parent, x, y, ringColor, metal) {
  const ring = addMesh(new THREE.TorusGeometry(.026, .006, 8, 24),
    makeMaterial(ringColor, { roughness: .42 }), x, y, -.061, parent);
  const dial = addMesh(new THREE.CylinderGeometry(.019, .022, .019, 14), metal, x, y, -.068, parent);
  dial.rotation.x = Math.PI / 2;
  addBox(.004, .014, .005, makeMaterial("#f4eee0"), x, y + .008, -.082, parent);
  return ring;
}

function cockpitTube(points, radius, material, parent) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return addMesh(new THREE.TubeGeometry(curve, 32, radius, 10, false), material, 0, 0, 0, parent);
}

export function buildBetaCockpit(parent, carbon, paint) {
  const alcantara = makeMaterial("#0c0f12", { roughness: 1, side: THREE.DoubleSide });
  const shellPaint = paint.clone();
  shellPaint.side = THREE.DoubleSide;
  const aluminum = makeMaterial("#68737b", { metalness: .9, roughness: .24 });
  const stitch = makeMaterial("#d6d1c3", { roughness: .8 });
  const pinstripe = makeMaterial("#ede9dc", { roughness: .38, metalness: .18 });

  // Monocoque afunilado e simétrico, inspirado em cockpits reais: a pintura
  // envolve o piloto e o revestimento escuro fica voltado para dentro.
  for (const side of [-1, 1]) {
    taperedCockpitSide(side, shellPaint, parent);
    const liner = taperedCockpitSide(side, alcantara, parent);
    liner.scale.set(.965, .965, .94);
    liner.position.y = -.025;
    const rimPoints = [
      [side * .4, 1.18, -.35],
      [side * .36, 1.145, .14],
      [side * .28, 1.02, .7],
      [side * .22, .91, 1.02],
    ];
    const rimCurve = new THREE.CatmullRomCurve3(rimPoints.map((point) => new THREE.Vector3(...point)));
    addMesh(new THREE.TubeGeometry(rimCurve, 24, .028, 8, false), shellPaint, 0, 0, 0, parent);
    const stripeCurve = new THREE.CatmullRomCurve3(rimPoints.map(([x, y, z]) => new THREE.Vector3(x * 1.018, y - .034, z)));
    addMesh(new THREE.TubeGeometry(stripeCurve, 24, .006, 6, false), pinstripe, 0, 0, 0, parent);
  }
  // Fundo escuro da banheira: cobre a carroceria externa sob o piloto e
  // separa visualmente as duas bordas pintadas, como no cockpit de referência.
  const deckGeometry = new THREE.BufferGeometry();
  deckGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -.42, .94, -.72,
    .42, .94, -.72,
    -.235, .955, .82,
    .235, .955, .82,
  ], 3));
  deckGeometry.setIndex([0, 2, 1, 1, 2, 3]);
  deckGeometry.computeVertexNormals();
  addMesh(deckGeometry, carbon, 0, 0, 0, parent);
  addBox(.56, .055, .18, carbon, 0, .96, .78, parent).rotation.x = -.09;

  // Halo enquadrado a partir do ponto de vista do piloto: aro próximo à
  // borda superior e pilar central descendo até o nariz, como na referência.
  cockpitTube([
    [-.69, 1.485, .44],
    [-.36, 1.51, .5],
    [0, 1.52, .54],
    [.36, 1.51, .5],
    [.69, 1.485, .44],
  ], .011, carbon, parent);
  cockpitTube([
    [-.69, 1.485, .44],
    [-.55, 1.44, .06],
    [-.4, 1.38, -.36],
  ], .012, carbon, parent);
  cockpitTube([
    [.69, 1.485, .44],
    [.55, 1.44, .06],
    [.4, 1.38, -.36],
  ], .012, carbon, parent);
  cockpitTube([
    [0, .96, .82],
    [0, 1.24, .68],
    [0, 1.52, .54],
  ], .009, carbon, parent);
  addBox(.115, .045, .12, carbon, 0, .955, .8, parent).rotation.x = -.2;

  const wheel = new THREE.Group();
  wheel.name = "beta-steering-wheel";
  wheel.position.set(0, 1.04, .64);
  wheel.scale.setScalar(.68);
  parent.add(wheel);

  const outline = new THREE.Shape();
  outline.moveTo(-.205, .135);
  outline.lineTo(.205, .135);
  outline.lineTo(.245, .085);
  outline.lineTo(.218, -.105);
  outline.lineTo(.145, -.15);
  outline.lineTo(-.145, -.15);
  outline.lineTo(-.218, -.105);
  outline.lineTo(-.245, .085);
  outline.closePath();
  const frame = new THREE.ExtrudeGeometry(outline, {
    depth: .045,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: .007,
    bevelThickness: .007,
  });
  addMesh(frame, carbon, 0, 0, -.02, wheel);

  // Punhos separados e braços estruturais dão a silhueta de um volante real.
  for (const side of [-1, 1]) {
    const grip = addMesh(new THREE.CapsuleGeometry(.043, .18, 7, 14), alcantara,
      side * .285, -.005, -.01, wheel);
    grip.rotation.z = side * -.105;
    addBox(.09, .05, .05, carbon, side * .235, .075, 0, wheel).rotation.z = side * -.12;
    addBox(.09, .05, .05, carbon, side * .225, -.085, 0, wheel).rotation.z = side * .12;
    for (let seam = -2; seam <= 2; seam++) {
      const thread = addBox(.009, .006, .075, stitch, side * .285, seam * .037, -.012, wheel);
      thread.rotation.z = side * -.105;
    }
    const paddle = addMesh(new THREE.CapsuleGeometry(.019, .12, 5, 10), aluminum,
      side * .205, -.008, .075, wheel);
    paddle.rotation.z = side * -.12;
  }

  // Matriz de comandos intencionalmente simétrica, com função agrupada por cor.
  const colors = ["#e2473d", "#4da9d1", "#e6bf3d", "#4fc47a"];
  for (let row = 0; row < 4; row++) {
    wheelButton(wheel, -.194, .083 - row * .049, colors[row]);
    wheelButton(wheel, .194, .083 - row * .049, colors[(row + 2) % colors.length]);
  }
  wheelButton(wheel, -.13, .113, "#e8c341");
  wheelButton(wheel, .13, .113, "#df4138");
  wheelDial(wheel, -.105, -.116, "#62b4cf", aluminum);
  wheelDial(wheel, 0, -.12, "#e1c54e", aluminum);
  wheelDial(wheel, .105, -.116, "#d65244", aluminum);

  // Parafusos frontais e engate central reforçam a leitura mecânica.
  for (const [x, y] of [[-.224, .11], [.224, .11], [-.207, -.125], [.207, -.125]]) {
    const screw = addMesh(new THREE.CylinderGeometry(.006, .006, .008, 12), aluminum, x, y, -.064, wheel);
    screw.rotation.x = Math.PI / 2;
  }
  const release = addMesh(new THREE.CylinderGeometry(.018, .018, .025, 18),
    makeMaterial("#d7b83d", { metalness: .55, roughness: .3 }), 0, -.12, -.079, wheel);
  release.rotation.x = Math.PI / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 320;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const bezel = addBox(.306, .137, .018, alcantara, 0, .025, -.052, wheel);
  bezel.castShadow = false;
  const display = addMesh(
    new THREE.PlaneGeometry(.286, .117),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    0,
    .026,
    -.063,
    wheel,
  );
  display.rotation.y = Math.PI;
  display.castShadow = false;
  const data = { wheel, canvas, ctx: canvas.getContext("2d"), texture, lastUpdate: -Infinity };
  parent.userData.betaCockpit = data;
  return data;
}

export function updateBetaCockpit(car, raceTime, clockTime) {
  const data = car.group.userData.betaCockpit;
  if (!data) return;
  data.wheel.rotation.z = -THREE.MathUtils.clamp(car.steer || 0, -1, 1) * .42;
  if (clockTime >= data.lastUpdate && clockTime - data.lastUpdate < .1) return;
  data.lastUpdate = clockTime;
  const t = cockpitTelemetry(car, raceTime);
  const c = data.ctx;
  c.fillStyle = "#080f14";
  c.fillRect(0, 0, 768, 320);
  c.textAlign = "center";
  c.fillStyle = "#5e7885";
  c.font = "bold 22px monospace";
  c.fillText("RACE", 384, 31);
  for (let i = 0; i < 15; i++) {
    c.fillStyle = i / 15 < t.shift ? (i < 6 ? "#57d98b" : i < 11 ? "#ffd14d" : "#61aaff") : "#17242b";
    c.fillRect(17 + i * 49, 43, 39, 12);
  }
  c.fillStyle = "#edf5f6";
  c.font = "bold 126px monospace";
  c.fillText(String(t.gear), 300, 190);
  c.font = "bold 66px monospace";
  c.fillText(String(t.speed).padStart(3, "0"), 572, 139);
  c.fillStyle = "#8dabb9";
  c.font = "19px monospace";
  c.fillText("GEAR", 300, 218);
  c.fillText("KM/H", 572, 164);
  c.fillStyle = "#273943";
  c.fillRect(462, 190, 218, 10);
  c.fillStyle = "#58c9a0";
  c.fillRect(462, 190, 218 * t.throttle, 10);
  c.fillStyle = "#8dabb9";
  c.font = "16px monospace";
  c.fillText("THROTTLE", 571, 221);
  const minutes = Math.floor(t.lap / 60);
  c.fillStyle = "#edf5f6";
  c.font = "25px monospace";
  c.fillText(`${minutes}:${(t.lap % 60).toFixed(2).padStart(5, "0")}`, 571, 262);
  c.fillStyle = t.status === "VOLTA INVALIDA" ? "#fa826d" : "#78dbaa";
  c.font = "bold 19px monospace";
  c.fillText(t.status, 190, 282);
  data.texture.needsUpdate = true;
}
