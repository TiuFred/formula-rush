import * as THREE from "three";
import { addBox, addMesh, makeMaterial } from "./materials.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";

// O jogo não simula uma caixa de câmbio: marcha e luzes são indicações
// derivadas da velocidade, consistentes com o HUD, não telemetria de RPM.
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

export function buildBetaCockpit(parent, carbon) {
  const alcantara = makeMaterial("#111519", { roughness: 1 });
  const aluminum = makeMaterial("#727b82", { metalness: .88, roughness: .26 });
  // Banheiras laterais e painel frontal: fecham o vazio ao redor da câmera
  // sem bloquear a visão das rodas dianteiras e dos pontos de tangência.
  for (const side of [-1, 1]) {
    const rail = addBox(.075, .12, 1.12, carbon, side * .43, .985, .26, parent);
    rail.rotation.y = side * -.035;
    rail.rotation.z = side * -.055;
    addBox(.025, .075, .68, alcantara, side * .375, 1.025, .17, parent).rotation.z = side * -.06;
  }
  addBox(.62, .075, .22, carbon, 0, 1.075, .65, parent).rotation.x = -.08;
  addMesh(new THREE.CylinderGeometry(.022, .028, .21, 16), carbon, 0, 1.17, .48, parent).rotation.x = Math.PI / 2;

  const wheel = new THREE.Group();
  wheel.name = "beta-steering-wheel";
  wheel.position.set(0, 1.275, .48);
  wheel.scale.setScalar(.48);
  parent.add(wheel);
  const rubber = makeMaterial("#181a1d", { roughness: .94 });
  const metal = aluminum;
  for (const side of [-1, 1]) {
    const paddle = addMesh(new THREE.CapsuleGeometry(.022, .105, 5, 10), metal,
      side * .17, -.01, .075, wheel);
    paddle.rotation.z = side * -.2;
  }
  const outline = new THREE.Shape();
  outline.moveTo(-.205, .12);
  outline.lineTo(.205, .12);
  outline.quadraticCurveTo(.26, .09, .235, -.035);
  outline.lineTo(.16, -.13);
  outline.lineTo(-.16, -.13);
  outline.lineTo(-.235, -.035);
  outline.quadraticCurveTo(-.26, .09, -.205, .12);
  const frame = new THREE.ExtrudeGeometry(outline, { depth: .045, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .008, bevelThickness: .008, curveSegments: 8 });
  addMesh(frame, carbon, 0, 0, -.023, wheel);
  addBox(.305, .028, .09, carbon, 0, -.133, 0, wheel);
  for (const side of [-1, 1]) {
    const grip = addMesh(new THREE.CapsuleGeometry(.04, .17, 6, 12), rubber, side * .24, -.015, -.012, wheel);
    grip.rotation.z = side * -.16;
    // Costuras claras quebram o volume preto dos punhos em visão onboard.
    for (let stitch = -2; stitch <= 2; stitch++) {
      const seam = addBox(.012, .006, .073, makeMaterial("#b8b2a2", { roughness: .8 }),
        side * .24, stitch * .032, -.012, wheel);
      seam.rotation.z = side * -.16;
    }
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
  // Cubo central e parafuso de engate rápido.
  const hub = addMesh(new THREE.CylinderGeometry(.043, .043, .042, 20), aluminum, 0, -.082, -.045, wheel);
  hub.rotation.x = Math.PI / 2;
  const release = addMesh(new THREE.CylinderGeometry(.021, .021, .046, 16), makeMaterial("#d6b63b", { metalness: .55, roughness: .3 }), 0, -.082, -.071, wheel);
  release.rotation.x = Math.PI / 2;
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
  data.wheel.rotation.z = -THREE.MathUtils.clamp(car.steer || 0, -1, 1) * .48;
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
  c.fillStyle = "#273943";
  c.fillRect(255, 190, 190, 10);
  c.fillStyle = "#58c9a0";
  c.fillRect(255, 190, 190 * t.throttle, 10);
  c.fillStyle = "#8dabb9";
  c.font = "17px monospace";
  c.fillText("THROTTLE", 350, 219);
  const minutes = Math.floor(t.lap / 60);
  c.fillStyle = "#edf5f6";
  c.font = "26px monospace";
  c.fillText(`${minutes}:${(t.lap % 60).toFixed(2).padStart(5, "0")}`, 337, 178);
  c.fillStyle = t.status === "VOLTA INVALIDA" ? "#fa826d" : "#78dbaa";
  c.font = "bold 23px monospace";
  c.fillText(t.status, 118, 234);
  data.texture.needsUpdate = true;
}
