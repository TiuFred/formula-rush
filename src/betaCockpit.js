import * as THREE from "three";
import { addBox, addMesh, makeMaterial } from "./materials.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";

const WHEEL_BASE_Y = 1.035;

export function cockpitTelemetry(car, raceTime) {
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  const powertrain = betaPowertrainTelemetry(car);
  const gear = speed < 0.5 ? "N" : powertrain.gear;
  return {
    speed: Math.round(speed * 3.6),
    gear,
    shift: gear === "N" ? 0 : powertrain.rpm,
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

/** Painel lateral contínuo, modelado especificamente para a vista do piloto. */
function cockpitSide(side, outerMaterial, innerMaterial, parent) {
  const sections = [
    { z: -0.78, inner: 0.27, outer: 0.55, top: 1.2, bottom: 0.79 },
    { z: -0.28, inner: 0.285, outer: 0.52, top: 1.18, bottom: 0.78 },
    { z: 0.24, inner: 0.27, outer: 0.47, top: 1.12, bottom: 0.77 },
    { z: 0.75, inner: 0.225, outer: 0.37, top: 0.99, bottom: 0.75 },
    { z: 1.32, inner: 0.16, outer: 0.25, top: 0.8, bottom: 0.69 },
  ];
  const positions = [];
  const linerPositions = [];
  for (const s of sections) {
    positions.push(
      side * s.outer, s.top, s.z,
      side * s.inner, s.top - 0.018, s.z,
      side * s.outer, s.bottom, s.z,
      side * s.inner, s.bottom, s.z,
    );
    linerPositions.push(
      side * s.inner, s.top - 0.012, s.z,
      side * s.inner, s.bottom, s.z,
    );
  }
  const indices = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 4;
    const b = a + 4;
    for (const [p, q] of [[0, 1], [2, 0], [1, 3], [3, 2]])
      indices.push(a + p, b + p, a + q, b + p, b + q, a + q);
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  addMesh(shell, outerMaterial, 0, 0, 0, parent);

  const linerIndices = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 2;
    linerIndices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
  }
  const liner = new THREE.BufferGeometry();
  liner.setAttribute("position", new THREE.Float32BufferAttribute(linerPositions, 3));
  liner.setIndex(linerIndices);
  liner.computeVertexNormals();
  addMesh(liner, innerMaterial, 0, 0, 0, parent);

  tube(sections.map((s) => [side * (s.inner + 0.02), s.top + 0.006, s.z]), 0.022, outerMaterial, parent, 28);
}

function wheelButton(parent, x, y, color) {
  const button = addMesh(
    new THREE.CylinderGeometry(0.014, 0.015, 0.014, 16),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.12, clearcoat: 0.45 }),
    x, y, -0.062, parent,
  );
  button.rotation.x = Math.PI / 2;
}

function wheelDial(parent, x, y, ringColor, metal) {
  addMesh(new THREE.TorusGeometry(0.027, 0.006, 8, 24), makeMaterial(ringColor, { roughness: 0.38 }), x, y, -0.061, parent);
  const dial = addMesh(new THREE.CylinderGeometry(0.019, 0.022, 0.019, 14), metal, x, y, -0.068, parent);
  dial.rotation.x = Math.PI / 2;
  addBox(0.004, 0.014, 0.005, makeMaterial("#f4eee0"), x, y + 0.008, -0.082, parent);
}

function buildDriverArms(parent, wheel, fabric, glove, cuff) {
  const forearms = new THREE.Group();
  forearms.name = "beta-driver-arms";
  parent.add(forearms);
  for (const side of [-1, 1]) {
    tube([
      [side * 0.42, 0.72, -0.22],
      [side * 0.36, 0.84, 0.14],
      [side * 0.26, 0.99, 0.48],
    ], 0.065, fabric, forearms, 24);
    tube([
      [side * 0.424, 0.735, -0.2],
      [side * 0.367, 0.855, 0.13],
      [side * 0.276, 1, 0.45],
    ], 0.009, cuff, forearms, 20).castShadow = false;

    const hand = new THREE.Group();
    hand.position.set(side * 0.285, 0, -0.01);
    hand.rotation.z = side * -0.08;
    wheel.add(hand);
    const palm = addMesh(new THREE.CapsuleGeometry(0.052, 0.105, 6, 12), glove, 0, 0, -0.035, hand);
    palm.rotation.z = side * -0.12;
    for (let finger = -1.5; finger <= 1.5; finger++) {
      const digit = addMesh(new THREE.CapsuleGeometry(0.012, 0.068, 4, 8), glove, side * -0.036, finger * 0.025, -0.005, hand);
      digit.rotation.x = 0.42;
    }
    addBox(0.104, 0.055, 0.075, cuff, 0, -0.09, 0.015, hand);
  }
  return forearms;
}

function buildSteeringWheel(parent, carbon, alcantara, metal) {
  const wheel = new THREE.Group();
  wheel.name = "beta-steering-wheel";
  wheel.position.set(0, WHEEL_BASE_Y, 0.59);
  wheel.scale.setScalar(0.79);
  parent.add(wheel);

  const outline = new THREE.Shape();
  outline.moveTo(-0.205, 0.142);
  outline.lineTo(0.205, 0.142);
  outline.lineTo(0.258, 0.08);
  outline.lineTo(0.228, -0.12);
  outline.lineTo(0.145, -0.165);
  outline.lineTo(-0.145, -0.165);
  outline.lineTo(-0.228, -0.12);
  outline.lineTo(-0.258, 0.08);
  outline.closePath();
  addMesh(new THREE.ExtrudeGeometry(outline, {
    depth: 0.052,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  }), carbon, 0, 0, -0.022, wheel);

  for (const side of [-1, 1]) {
    const grip = addMesh(new THREE.CapsuleGeometry(0.046, 0.2, 8, 16), alcantara, side * 0.292, -0.006, -0.012, wheel);
    grip.rotation.z = side * -0.11;
    addBox(0.095, 0.052, 0.055, carbon, side * 0.238, 0.082, 0, wheel).rotation.z = side * -0.12;
    addBox(0.095, 0.052, 0.055, carbon, side * 0.23, -0.095, 0, wheel).rotation.z = side * 0.12;
    const paddle = addMesh(new THREE.CapsuleGeometry(0.02, 0.13, 5, 10), metal, side * 0.205, -0.012, 0.082, wheel);
    paddle.rotation.z = side * -0.12;
  }

  const colors = ["#e2473d", "#4da9d1", "#e6bf3d", "#4fc47a"];
  for (let row = 0; row < 4; row++) {
    wheelButton(wheel, -0.202, 0.09 - row * 0.052, colors[row]);
    wheelButton(wheel, 0.202, 0.09 - row * 0.052, colors[(row + 2) % colors.length]);
  }
  wheelButton(wheel, -0.132, 0.118, "#e8c341");
  wheelButton(wheel, 0.132, 0.118, "#df4138");
  wheelDial(wheel, -0.108, -0.132, "#62b4cf", metal);
  wheelDial(wheel, 0, -0.137, "#e1c54e", metal);
  wheelDial(wheel, 0.108, -0.132, "#d65244", metal);

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 320;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  addBox(0.318, 0.145, 0.021, alcantara, 0, 0.027, -0.055, wheel).castShadow = false;
  const display = addMesh(new THREE.PlaneGeometry(0.296, 0.123), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, 0.028, -0.068, wheel);
  display.rotation.y = Math.PI;
  display.castShadow = false;

  const shiftLights = [];
  for (let i = 0; i < 12; i++) {
    const color = i < 5 ? "#27dc8a" : i < 9 ? "#ffd43b" : "#4da1ff";
    const material = new THREE.MeshStandardMaterial({ color: "#182126", emissive: color, emissiveIntensity: 0, roughness: 0.25 });
    const led = addMesh(new THREE.SphereGeometry(0.009, 10, 6), material, -0.1375 + i * 0.025, 0.112, -0.071, wheel);
    led.castShadow = false;
    shiftLights.push(led);
  }
  return { wheel, canvas, ctx: canvas.getContext("2d"), texture, shiftLights };
}

export function buildBetaCockpit(parent, carbon, paint) {
  const shellPaint = new THREE.MeshPhysicalMaterial({
    color: paint.color,
    metalness: 0.24,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
  const alcantara = makeMaterial("#090c0e", { roughness: 1, side: THREE.DoubleSide });
  const aluminum = makeMaterial("#7a858d", { metalness: 0.92, roughness: 0.22 });
  const safetyFabric = makeMaterial("#171b1e", { roughness: 0.96 });
  const glove = makeMaterial("#101417", { roughness: 0.82 });
  const cuff = makeMaterial("#ece9df", { roughness: 0.72 });

  cockpitSide(-1, shellPaint, alcantara, parent);
  cockpitSide(1, shellPaint, alcantara, parent);

  // Banheira e anteparo bloqueiam a carroceria externa sob o piloto.
  const tub = new THREE.Shape();
  tub.moveTo(-0.3, -0.76);
  tub.lineTo(0.3, -0.76);
  tub.lineTo(0.25, 0.76);
  tub.lineTo(-0.25, 0.76);
  tub.closePath();
  const tubMesh = addMesh(new THREE.ShapeGeometry(tub), carbon, 0, 0.755, 0, parent);
  tubMesh.rotation.x = -Math.PI / 2;
  addBox(0.58, 0.24, 0.055, alcantara, 0, 0.89, -0.7, parent).rotation.x = -0.14;

  for (const side of [-1, 1]) {
    const shoulder = addMesh(new THREE.CapsuleGeometry(0.085, 0.28, 6, 14), alcantara, side * 0.34, 1.05, -0.42, parent);
    shoulder.rotation.z = Math.PI / 2;
    tube([
      [side * 0.18, 0.82, -0.72],
      [side * 0.12, 0.79, -0.38],
      [side * 0.09, 0.8, -0.05],
    ], 0.027, makeMaterial(side < 0 ? "#e3bd29" : "#d13b32", { roughness: 0.7 }), parent, 18);
  }

  addBox(0.5, 0.075, 0.23, carbon, 0, 0.895, 0.77, parent).rotation.x = -0.1;
  for (const side of [-1, 1]) {
    tube([
      [side * 0.22, 0.87, 0.83],
      [side * 0.17, 0.76, 1.25],
      [side * 0.1, 0.65, 1.9],
    ], 0.018, shellPaint, parent, 24);
  }

  // Halo em três apoios, dimensionado a partir da posição dos olhos.
  tube([
    [-0.58, 1.43, 0.2],
    [-0.34, 1.475, 0.39],
    [0, 1.49, 0.47],
    [0.34, 1.475, 0.39],
    [0.58, 1.43, 0.2],
  ], 0.018, carbon, parent, 36);
  for (const side of [-1, 1]) {
    tube([
      [side * 0.58, 1.43, 0.2],
      [side * 0.5, 1.39, -0.16],
      [side * 0.4, 1.31, -0.54],
    ], 0.019, carbon, parent, 26);
  }
  tube([[0, 0.89, 0.84], [0, 1.19, 0.65], [0, 1.49, 0.47]], 0.016, carbon, parent, 26);
  const fairing = addMesh(new THREE.CapsuleGeometry(0.034, 0.26, 7, 14), shellPaint, 0, 1.08, 0.71, parent);
  fairing.rotation.x = -0.47;

  const data = buildSteeringWheel(parent, carbon, alcantara, aluminum);
  data.forearms = buildDriverArms(parent, data.wheel, safetyFabric, glove, cuff);
  data.lastUpdate = -Infinity;
  parent.userData.betaCockpit = data;
  return data;
}

function drawTelemetry(data, telemetry) {
  const c = data.ctx;
  c.fillStyle = "#05090c";
  c.fillRect(0, 0, 768, 320);
  const gradient = c.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "#16303b");
  gradient.addColorStop(0.03, "#071218");
  gradient.addColorStop(1, "#020405");
  c.fillStyle = gradient;
  c.fillRect(12, 12, 744, 296);
  c.textAlign = "center";
  c.fillStyle = "#75a1b5";
  c.font = "bold 21px monospace";
  c.fillText("FORMULA RUSH 2.0", 384, 38);
  c.fillStyle = "#f3f7f4";
  c.font = "bold 132px monospace";
  c.fillText(String(telemetry.gear), 280, 196);
  c.font = "bold 65px monospace";
  c.fillText(String(telemetry.speed).padStart(3, "0"), 566, 143);
  c.fillStyle = "#7894a2";
  c.font = "18px monospace";
  c.fillText("GEAR", 280, 225);
  c.fillText("KM/H", 566, 169);
  c.fillStyle = "#1b2c34";
  c.fillRect(451, 194, 229, 11);
  c.fillStyle = "#49cf94";
  c.fillRect(451, 194, 229 * telemetry.throttle, 11);
  c.fillStyle = "#7894a2";
  c.font = "15px monospace";
  c.fillText("THROTTLE", 565, 230);
  const minutes = Math.floor(telemetry.lap / 60);
  c.fillStyle = "#f3f7f4";
  c.font = "25px monospace";
  c.fillText(`${minutes}:${(telemetry.lap % 60).toFixed(2).padStart(5, "0")}`, 565, 270);
  c.fillStyle = telemetry.status === "VOLTA INVALIDA" ? "#ff6e5d" : "#64dc9e";
  c.font = "bold 18px monospace";
  c.fillText(telemetry.status, 190, 285);
}

export function updateBetaCockpit(car, raceTime, clockTime) {
  const data = car.group.userData.betaCockpit;
  if (!data) return;
  const steering = -THREE.MathUtils.clamp(car.steer || 0, -1, 1) * 0.34;
  data.wheel.rotation.z += (steering - data.wheel.rotation.z) * 0.32;
  data.forearms.rotation.z = data.wheel.rotation.z * 0.18;
  const acceleration = THREE.MathUtils.clamp(car.betaAcceleration || 0, -35, 18);
  data.wheel.position.y = WHEEL_BASE_Y - acceleration * 0.00045;

  const telemetry = cockpitTelemetry(car, raceTime);
  for (let i = 0; i < data.shiftLights.length; i++) {
    const active = i / data.shiftLights.length < telemetry.shift;
    data.shiftLights[i].material.emissiveIntensity = active ? 4.8 : 0;
    data.shiftLights[i].material.color.set(active ? "#dcefff" : "#182126");
  }
  if (clockTime >= data.lastUpdate && clockTime - data.lastUpdate < 0.05) return;
  data.lastUpdate = clockTime;
  drawTelemetry(data, telemetry);
  data.texture.needsUpdate = true;
}
