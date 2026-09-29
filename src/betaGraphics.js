// Camada visual exclusiva do Formula Rush 2.0. Tudo neste módulo é
// deliberadamente opcional para que a experiência 1.0 permaneça intacta.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { state } from "./state.js";
import { TRACK_LENGTH } from "./constants.js";
import { addBox, makeMaterial } from "./materials.js";
import { alignedFootprintClearanceAt, asphaltClearanceAt, trackHalfWidthAt } from "./track.js";

const cloudDrift = [];

function configureTexture(texture, color = true) {
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, state.renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/** Iluminação de imagem procedural para reflexos da pintura, halo e metais. */
export function setupBetaEnvironment() {
  const generator = new THREE.PMREMGenerator(state.renderer);
  generator.compileEquirectangularShader();
  const room = new RoomEnvironment();
  state.betaEnvironment = generator.fromScene(room, .035).texture;
  state.scene.environment = state.betaEnvironment;
  room.dispose();
  generator.dispose();
}

function setInstance(mesh, index, dummy, x, y, z, sx, sy, sz, rotation = 0, color = null) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rotation, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  if (color) mesh.setColorAt(index, color);
}

/** Nuvens e vegetação fotográfica em planos cruzados, exclusivos de Interlagos 2.0. */
export function buildBetaAtmosphere(groundHeightAt, rng) {
  const loader = new THREE.TextureLoader();
  const cloudTexture = configureTexture(loader.load("./assets/beta/cloud-sprite.png"));
  const cloudMaterial = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: "#f4f7f8",
    transparent: true,
    opacity: .82,
    depthWrite: false,
    fog: true,
  });
  cloudDrift.length = 0;
  for (let i = 0; i < 22; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 360 + rng() * 680;
    const cloud = new THREE.Sprite(cloudMaterial);
    cloud.position.set(Math.cos(angle) * radius, 135 + rng() * 150, Math.sin(angle) * radius);
    const width = 95 + rng() * 145;
    cloud.scale.set(width, width * (.28 + rng() * .09), 1);
    cloud.userData.originX = cloud.position.x;
    cloud.userData.originZ = cloud.position.z;
    cloud.userData.speed = .7 + rng() * 1.15;
    cloud.userData.phase = rng() * Math.PI * 2;
    state.scene.add(cloud);
    cloudDrift.push(cloud);
  }

  const treeTexture = configureTexture(loader.load("./assets/beta/tree-billboard.png"));
  const treeMaterial = new THREE.MeshStandardMaterial({
    map: treeTexture,
    alphaTest: .32,
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
  const count = 190;
  const geometry = new THREE.PlaneGeometry(9, 12);
  geometry.translate(0, 6, 0);
  const treesA = new THREE.InstancedMesh(geometry, treeMaterial, count);
  const treesB = new THREE.InstancedMesh(geometry, treeMaterial, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts++ < count * 10) {
    const s = rng() * TRACK_LENGTH;
    const side = rng() > .5 ? 1 : -1;
    const lane = side * (trackHalfWidthAt(s) + 28 + rng() * 115);
    const p = state.track.at(s, lane).p;
    if (asphaltClearanceAt(state.track, p.x, p.z) < 22) continue;
    const base = groundHeightAt(p.x, p.z) - .15;
    const scale = .72 + rng() * .75;
    const rotation = rng() * Math.PI;
    tint.setHSL(.27 + rng() * .045, .34 + rng() * .17, .62 + rng() * .12);
    setInstance(treesA, placed, dummy, p.x, base, p.z, scale, scale, scale, rotation, tint);
    setInstance(treesB, placed, dummy, p.x, base, p.z, scale, scale, scale, rotation + Math.PI / 2, tint);
    placed++;
  }
  for (const trees of [treesA, treesB]) {
    trees.count = placed;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    trees.castShadow = true;
    trees.receiveShadow = false;
    state.scene.add(trees);
  }
}

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
  ctx.strokeStyle = "#9da6a5";
  ctx.lineWidth = 2;
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
  texture.repeat.set(2.4, 1);
  return texture;
}

/** Detalhes de autódromo: alambrado, marcas de frenagem, público e câmeras. */
export function buildBetaTrackDetails(rng) {
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

  // Pessoas simples, porém numerosas, dão escala às arquibancadas existentes.
  const bodyMaterial = makeMaterial("#ffffff", { roughness: .9, vertexColors: true });
  const headMaterial = makeMaterial("#c9926c", { roughness: 1, vertexColors: true });
  const maxPeople = 600;
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.13, .38, 3, 5), bodyMaterial, maxPeople);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 6, 4), headMaterial, maxPeople);
  const dummy = new THREE.Object3D();
  const shirt = new THREE.Color();
  const skin = new THREE.Color();
  const stations = [90, 160, 230, TRACK_LENGTH - 409, TRACK_LENGTH - 339, TRACK_LENGTH - 269, TRACK_LENGTH - 199, TRACK_LENGTH - 129];
  let person = 0;
  for (const s0 of stations) {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 15 && person < maxPeople; col++) {
        if (rng() < .14) continue;
        const frame = state.track.at(s0 - 23 + col * 3.25, -29 - row * 3);
        const y = frame.p.y + row * 1.25 + 2.05;
        shirt.setHSL(rng(), .58, .48 + rng() * .18);
        skin.setHSL(.055 + rng() * .045, .33 + rng() * .25, .48 + rng() * .3);
        setInstance(bodies, person, dummy, frame.p.x, y, frame.p.z, 1, 1, 1, frame.yaw, shirt);
        setInstance(heads, person, dummy, frame.p.x, y + .44, frame.p.z, 1, 1, 1, frame.yaw, skin);
        person++;
      }
    }
  }
  for (const mesh of [bodies, heads]) {
    mesh.count = person;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    state.scene.add(mesh);
  }

  const cameraMaterial = makeMaterial("#22282b", { metalness: .65, roughness: .3 });
  for (const s of [420, 1340, 2460, 3480]) {
    const side = Math.floor(s / 1000) % 2 ? -1 : 1;
    const lane = side * state.track.tracksideOffsetAt(s, side, 2.2);
    addAligned(s, lane, .15, 4.3, .15, post);
    const camera = addAligned(s, lane, .65, .35, .9, cameraMaterial, 4.05);
    camera.rotation.y += side * .35;
  }
}

export function updateBetaAtmosphere(time) {
  for (const cloud of cloudDrift) {
    cloud.position.x = cloud.userData.originX + Math.sin(time * .012 * cloud.userData.speed + cloud.userData.phase) * 34;
    cloud.position.z = cloud.userData.originZ + Math.cos(time * .009 * cloud.userData.speed + cloud.userData.phase) * 18;
  }
}
