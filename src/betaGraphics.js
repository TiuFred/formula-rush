// Estruturas de autódromo exclusivas da experiência 2.0.
import * as THREE from "three";
import { state } from "./state.js";
import { TRACK_LENGTH } from "./constants.js";
import { addBox, makeMaterial, makeTextPanel } from "./materials.js";
import { alignedFootprintClearanceAt } from "./track.js";
export { setupBetaEnvironment, buildBetaAtmosphere } from "./betaNature.js";
import { buildInterlagosStands, buildInterlagosLandmarks, addPitCanopy } from "./interlagosStructures.js";

function addAligned(s, lane, width, height, depth, material, yOffset = 0) {
  const frame = state.track.at(s, lane);
  const mesh = addBox(width, height, depth, material, frame.p.x, frame.p.y + yOffset + height / 2, frame.p.z);
  mesh.rotation.set(-Math.asin(frame.t.y), frame.yaw, -frame.bank, "YXZ");
  return mesh;
}

function makeFenceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "#515c62";
  ctx.lineWidth = .75;
  for (let i = -128; i < 256; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 1.5);
  return texture;
}

/** Detalhes de autódromo: alambrado, marcas de frenagem, público e câmeras. */
export function buildBetaTrackDetails(rng) {
  const pitAligned = (s, lane, ...args) => addAligned(s, -lane, ...args);
  const concrete = makeMaterial("#babcb7", { roughness: .92 });
  const glass = makeMaterial("#344c5b", { metalness: .65, roughness: .2 });
  const garage = makeMaterial("#292f34", { roughness: .9 });
  const pitRoad = makeMaterial("#5b6062", { roughness: .93 });
  const paint = makeMaterial("#e4dba9");
  const trim = makeMaterial("#2d5750", { roughness: .6 });
  // Módulos abertos de boxes, piso superior envidraçado e cobertura leve.
  for (let s = TRACK_LENGTH - 245; s < TRACK_LENGTH + 195; s += 20) {
    if (alignedFootprintClearanceAt(state.track, s, -30, 17, 20) < 2) continue;
    pitAligned(s, 30, 15, .3, 20, concrete, -.2);
    pitAligned(s, 37, .4, 6.8, 20, concrete);
    pitAligned(s, 30, 15, .28, 20, concrete, 3.9);
    pitAligned(s, 22.7, .12, 2.1, 19.2, glass, 4.3);
    addPitCanopy(s, -30);
    if (alignedFootprintClearanceAt(state.track, s, -16, 10, 20) > .5) {
      pitAligned(s, 16, 10, .025, 20, pitRoad, .12);
      pitAligned(s, 20.5, .12, .03, 20, paint, .15);
    }
    pitAligned(s, 22.4, .3, .34, 20, trim, 3.7);
    for (const delta of [-9.7, 0, 9.7]) {
      pitAligned(s + delta, 22.9, .35, 6.8, .25, concrete);
      pitAligned(s + delta, 30, 14, 3.9, .15, garage);
    }
    pitAligned(s, 35, .1, 3.6, 19.3, garage);
  }

  // Centro operacional envidraçado junto à extremidade do complexo de boxes.
  if (alignedFootprintClearanceAt(state.track, -275, -32, 18, 30) >= 3) {
    pitAligned(-275, 32, 18, 4, 30, concrete);
    for (let floor = 0; floor < 3; floor++) {
      pitAligned(-275, 32, 18, 2.5, 30, glass, 4 + floor * 2.8);
      pitAligned(-275, 32, 18.4, .2, 30.3, concrete, 6.5 + floor * 2.8);
    }
    const sign = makeTextPanel("AUTÓDROMO JOSÉ CARLOS PACE", 22, 1.2, "#173c35", "#f0ebd9");
    const frame = state.track.at(-275, -22.7);
    sign.position.copy(frame.p); sign.position.y += 4;
    sign.rotation.y = frame.yaw - Math.PI / 2;
    state.scene.add(sign);
  }

  const fence = new THREE.MeshStandardMaterial({
    map: makeFenceTexture(),
    transparent: true,
    alphaTest: .18,
    side: THREE.DoubleSide,
    metalness: .72,
    roughness: .42,
  });
  const post = makeMaterial("#777f80", { metalness: .75, roughness: .38 });
  for (let s = TRACK_LENGTH - 430; s < TRACK_LENGTH + 285; s += 18) {
    for (const side of [-1, 1]) {
      const offset = state.track.tracksideOffsetAt(s, side, .55);
      const lane = side * offset;
      if (alignedFootprintClearanceAt(state.track, s, lane, .035, 18.15) <= .05) continue;
      addAligned(s, lane, .035, 4.8, 18.15, fence, .05);
      addAligned(s, side * offset, .09, 5.1, .12, post, .05);
    }
  }

  const rubber = makeMaterial("#111315", { roughness: .8, transparent: true, opacity: .52, depthWrite: false });
  for (const brakingZone of [255, 1085, 2215, 2920, 3655]) {
    for (let i = 0; i < 15; i++) {
      const s = brakingZone - 100 + i * 6.2;
      const direction = state.track.at(s + 50).yaw - state.track.at(s + 15).yaw;
      const bias = -Math.sign(Math.sin(direction)) * Math.min(1.5, Math.abs(direction) * 2.2);
      for (const lane of [bias - 1.18, bias + 1.18]) {
        addAligned(s, lane + (rng() - .5) * .16, .18 + rng() * .08, .012, 6.5 + rng() * 2.5, rubber, .155);
      }
    }
  }

  buildInterlagosStands(rng);
  buildInterlagosLandmarks();

  const cameraMaterial = makeMaterial("#22282b", { metalness: .65, roughness: .3 });
  for (const s of [420, 1340, 2460, 3480]) {
    const side = Math.floor(s / 1000) % 2 ? -1 : 1;
    const lane = side * state.track.tracksideOffsetAt(s, side, 2.2);
    addAligned(s, lane, .15, 4.3, .15, post);
    const camera = addAligned(s, lane, .65, .35, .9, cameraMaterial, 4.05);
    camera.rotation.y += side * .35;
  }
}
