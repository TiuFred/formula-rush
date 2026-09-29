import * as THREE from "three";
import { addBox, addMesh, makeMaterial } from "./materials.js";

// O jogo não simula uma caixa de câmbio: marcha e luzes são indicações
// derivadas da velocidade, consistentes com o HUD, não telemetria de RPM.
export function cockpitTelemetry(car, raceTime) {
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  const kph = speed * 3.6;
  const gear = speed < .5 ? "N" : Math.min(8, Math.floor(kph / 43) + 1);
  return {
    speed: Math.round(kph), gear,
    shift: gear === "N" ? 0 : Math.min(1, (kph - (gear - 1) * 43) / 43),
    lap: Math.max(0, car.finish ? car.lastLap || 0 : raceTime - (car.lapStarted || 0)),
    status: car.currentLapValid === false ? "VOLTA INVALIDA" : car.drsActive ? "DRS ATIVO" : "TIME TRIAL",
  };
}

export function buildBetaCockpit(parent, carbon) {
  const wheel = new THREE.Group();
  wheel.name = "beta-steering-wheel";
  wheel.position.set(0, 1.31, .38);
  wheel.scale.setScalar(.55);
  parent.add(wheel);
  const rubber = makeMaterial("#181a1d", { roughness: .94 });
  const metal = makeMaterial("#6e767e", { metalness: .8, roughness: .32 });
  const outline = new THREE.Shape();
  outline.moveTo(-.2, .105);
  outline.lineTo(.2, .105);
  outline.quadraticCurveTo(.235, .095, .218, -.015);
  outline.lineTo(.16, -.115);
  outline.lineTo(-.16, -.115);
  outline.lineTo(-.218, -.015);
  outline.quadraticCurveTo(-.235, .095, -.2, .105);
  const frame = new THREE.ExtrudeGeometry(outline, { depth: .045, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .008, bevelThickness: .008, curveSegments: 8 });
  addMesh(frame, carbon, 0, 0, -.023, wheel);
  addBox(.3, .035, .09, carbon, 0, -.125, 0, wheel);
  for (const side of [-1, 1]) {
    const grip = addMesh(new THREE.CapsuleGeometry(.04, .17, 6, 12), rubber, side * .24, -.015, -.012, wheel);
    grip.rotation.z = side * -.16;
    addBox(.048, .15, .012, metal, side * .185, 0, .06, wheel);
    for (let row = 0; row < 3; row++) {
      const button = addMesh(new THREE.CylinderGeometry(.014, .015, .013, 12),
        makeMaterial(["#dc463c", "#53aec9", "#e6c445"][row], { roughness: .4 }),
        side * .176, .055 - row * .05, -.04, wheel);
      button.rotation.x = Math.PI / 2;
    }
    const dial = addMesh(new THREE.CylinderGeometry(.026, .026, .02, 16), metal, side * .09, -.09, -.042, wheel);
    dial.rotation.x = Math.PI / 2;
    addBox(.003, .015, .005, makeMaterial("#f1e5bc"), side * .09, -.083, -.055, wheel);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const display = addMesh(new THREE.PlaneGeometry(.282, .141),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, .017, -.05, wheel);
  display.rotation.y = Math.PI;
  display.castShadow = false;
  const data = { wheel, canvas, ctx: canvas.getContext("2d"), texture, lastUpdate: -Infinity };
  parent.userData.betaCockpit = data;
  return data;
}

export function updateBetaCockpit(car, raceTime, clockTime) {
  const data = car.group.userData.betaCockpit;
  if (!data) return;
  data.wheel.rotation.z = -THREE.MathUtils.clamp(car.steer || 0, -1, 1) * .65;
  if (clockTime >= data.lastUpdate && clockTime - data.lastUpdate < .1) return;
  data.lastUpdate = clockTime;
  const t = cockpitTelemetry(car, raceTime);
  const c = data.ctx;
  c.fillStyle = "#080f14";
  c.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i / 12 < t.shift ? (i < 5 ? "#68e28e" : i < 9 ? "#ffcf50" : "#67baff") : "#223039";
    c.fillRect(15 + i * 41, 12, 32, 14);
  }
  c.textAlign = "center";
  c.fillStyle = "#edf5f6";
  c.font = "bold 114px monospace";
  c.fillText(String(t.gear), 98, 144);
  c.font = "bold 62px monospace";
  c.fillText(String(t.speed).padStart(3, "0"), 337, 108);
  c.fillStyle = "#8dabb9";
  c.font = "22px monospace";
  c.fillText("GEAR", 98, 174);
  c.fillText("KM/H", 337, 139);
  const minutes = Math.floor(t.lap / 60);
  c.fillStyle = "#edf5f6";
  c.font = "26px monospace";
  c.fillText(`${minutes}:${(t.lap % 60).toFixed(2).padStart(5, "0")}`, 337, 178);
  c.fillStyle = t.status === "VOLTA INVALIDA" ? "#fa826d" : "#78dbaa";
  c.font = "bold 23px monospace";
  c.fillText(t.status, 256, 234);
  data.texture.needsUpdate = true;
}
