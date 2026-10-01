import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildCarFromModel, CAR_FIT, COCKPIT_DROP, COCKPIT_OPENING, NODES } from "../src/betaCarModel.js";

const file = new URL("../public/assets/cars/f1_2022.glb", import.meta.url);
const bytes = fs.readFileSync(file);
const source = await new Promise((resolve, reject) =>
  new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", (gltf) => resolve(gltf.scene), reject),
);
const paint = new THREE.MeshStandardMaterial({ color: "#d22b25" });

test("o carro encaixa nos eixos do jogo e apoia o pneu traseiro no chão", () => {
  const { holder } = buildCarFromModel(source, paint);
  holder.updateMatrixWorld(true);
  // `precise` mede os vértices; a caixa padrão usa a do objeto girada e exagera.
  const box = new THREE.Box3().setFromObject(holder, true);
  assert.ok(Math.abs(box.min.y) < 0.12, `chão em y=${box.min.y}`);
  assert.ok(box.min.z > -2.4 && box.max.z < 2.7, `comprimento fora do esperado (${box.min.z}..${box.max.z})`);
  assert.ok(box.max.x < 1.1 && box.min.x > -1.1, "largura maior que a do carro do jogo");
  assert.equal(CAR_FIT.scale < 1, true);
});

test("quatro pivôs de roda: giram no lugar, em torno do eixo x", () => {
  const { holder, wheelPivots } = buildCarFromModel(source, paint);
  assert.equal(wheelPivots.length, 4);
  assert.equal(wheelPivots.filter((w) => w.front).length, 2);
  assert.equal(new Set(wheelPivots.map((w) => w.side)).size, 2);
  for (const { pivot } of wheelPivots) {
    pivot.rotation.x = 0;
    holder.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(pivot).getCenter(new THREE.Vector3());
    for (const angle of [0.7, 2.1, -1.4, 4]) {
      pivot.rotation.x = angle;
      holder.updateMatrixWorld(true);
      const center = new THREE.Box3().setFromObject(pivot).getCenter(new THREE.Vector3());
      assert.ok(center.distanceTo(before) < 0.01, `roda saiu do lugar (${center.distanceTo(before)} m)`);
    }
  }
});

test("halo, painel e volante do arquivo ficam, mas só por fora; monocoque e capô do motor também somem por dentro", () => {
  const { holder, onboardHidden } = buildCarFromModel(source, paint);
  const nodes = new Map();
  holder.traverse((o) => o.parent?.name === "GLTF_SceneRootNode" && nodes.set(o.name, o));
  const hidden = new Set(onboardHidden);
  for (const prefix of [...NODES.exteriorOnly, ...NODES.onboardHidden]) {
    const node = [...nodes.entries()].find(([name]) => name.startsWith(prefix))?.[1];
    assert.ok(node, `${prefix} deveria continuar no carro`);
    node.traverse((o) => o.isMesh && assert.ok(hidden.has(o), `${prefix} deveria sumir na visão de dentro`));
  }
});

test("esquema de cores: carroceria clara com destaque na cor do jogador, halo na cor do jogador, resto escuro", () => {
  const { holder, bodyMaterial } = buildCarFromModel(source, paint);
  let masked = 0;
  let haloPainted = 0;
  let yellowLeft = 0;
  let blackLeft = 0;
  holder.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === bodyMaterial && o.geometry.attributes.accentMask) masked++;
    if (o.material === paint) haloPainted++;
    const hex = o.material.color?.getHex();
    if (hex === 0xe7c700) yellowLeft++;
    if (hex === 0x000000) blackLeft++;
  });
  assert.ok(masked >= 5, `peças da carroceria sem máscara de destaque (${masked})`);
  assert.ok(haloPainted >= 1, "halo deveria usar a pintura do jogador");
  assert.equal(yellowLeft, 0, "anel amarelo do composto deveria ter sumido");
  assert.equal(blackLeft, 0, "nada deveria ter ficado com o preto puro do arquivo");
  assert.ok(bodyMaterial.userData.accent.value.equals(paint.color), "o destaque deve seguir a cor do jogador");
  assert.ok(bodyMaterial.color.getHSL({}, THREE.SRGBColorSpace).l > 0.8, "a base da carroceria deveria ser clara");
});

test("a máscara de destaque pinta só parte de cada peça", () => {
  const { holder } = buildCarFromModel(source, paint);
  const stats = {};
  holder.traverse((o) => {
    const mask = o.isMesh && o.geometry.attributes.accentMask;
    if (!mask) return;
    let on = 0;
    for (let i = 0; i < mask.count; i++) on += mask.getX(i) > 0.5 ? 1 : 0;
    const node = (() => { let n = o; while (n.parent && n.parent.name !== "GLTF_SceneRootNode") n = n.parent; return n.name; })();
    stats[node] = { on, total: mask.count };
  });
  for (const [node, { on, total }] of Object.entries(stats)) {
    assert.ok(on > 0, `${node} sem nenhum vértice de destaque`);
    assert.ok(on < total * 0.6, `${node} quase todo pintado (${on}/${total})`);
  }
});

test("a descida do cockpit corresponde à altura de um piloto real", () => {
  assert.ok(COCKPIT_DROP > 0.2 && COCKPIT_DROP < 0.4);
});

test("nenhuma peça do chassi atravessa a face interna dos pneus", () => {
  const { holder, wheelPivots } = buildCarFromModel(source, paint);
  holder.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  for (const { pivot } of wheelPivots) {
    const box = new THREE.Box3().setFromObject(pivot);
    const center = box.getCenter(new THREE.Vector3());
    const side = Math.sign(center.x);
    const inner = side > 0 ? box.min.x : box.max.x;
    const radius = Math.min(box.max.y - box.min.y, box.max.z - box.min.z) / 2;
    let inside = 0;
    holder.traverse((mesh) => {
      if (!mesh.isMesh || pivot.getObjectById(mesh.id) || mesh.parent?.name === "beta-car-wheel" || mesh.parent?.parent?.name === "beta-car-wheel") return;
      const position = mesh.geometry.attributes.position;
      // Só valem os vértices ainda usados por algum triângulo (os cortados não aparecem).
      const used = new Set(mesh.geometry.index ? mesh.geometry.index.array : Array.from({ length: position.count }, (_, k) => k));
      for (const i of used) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const radial = Math.hypot(point.y - center.y, point.z - center.z);
        // 1,5 cm de tolerância dentro da borracha; o cubo (onde chegam os braços) fica de fora.
        if ((point.x - inner) * side > 0.015 && (point.x - center.x) * side < 0 && radial > radius * 0.55 && radial < radius * 0.95) inside++;
      }
    });
    assert.equal(inside, 0, `${inside} vértices do chassi dentro do pneu em x=${center.x.toFixed(2)}`);
  }
});

test("visão de dentro: o convés do monocoque é recortado na abertura do cockpit e por fora a peça fica inteira", () => {
  const { holder, onboardHidden, onboardShown } = buildCarFromModel(source, paint);
  holder.updateMatrixWorld(true);
  assert.ok(onboardShown.length >= 1, "deveria haver uma cópia recortada para a visão de dentro");
  const { x, minY, z } = COCKPIT_OPENING;
  const hidden = new Set(onboardHidden);
  const centroid = new THREE.Vector3();
  const corner = new THREE.Vector3();
  for (const open of onboardShown) {
    assert.equal(open.visible, false, "a cópia só aparece por dentro");
    const original = open.parent.children.find((child) => child.name === open.name.replace("-cockpit-open", ""));
    assert.ok(original && hidden.has(original), "a peça original deveria sumir por dentro");
    assert.ok(open.geometry.index.count < original.geometry.index.count, "a cópia deveria ter menos triângulos");
    const position = open.geometry.attributes.position;
    const index = open.geometry.index;
    for (let t = 0; t < index.count; t += 3) {
      centroid.set(0, 0, 0);
      for (let k = 0; k < 3; k++) centroid.add(corner.fromBufferAttribute(position, index.getX(t + k)).applyMatrix4(open.matrixWorld));
      centroid.multiplyScalar(1 / 3);
      const inside = Math.abs(centroid.x) > x[0] && Math.abs(centroid.x) < x[1] && centroid.y > minY && centroid.z > z[0] && centroid.z < z[1];
      assert.ok(!inside, `triângulo do convés ficou na abertura (${centroid.toArray()})`);
    }
  }
});

test("pneus: cada roda ganha o material do pneu, com as letras viradas para fora dos dois lados", () => {
  const { wheelPivots } = buildCarFromModel(source, paint);
  const outs = new Set();
  for (const { pivot, side } of wheelPivots) {
    const tires = [];
    pivot.traverse((o) => o.isMesh && o.material.customProgramCacheKey?.() === "beta-car-tire-1" && tires.push(o));
    assert.equal(tires.length, 1, "cada roda tem um pneu com o material novo");
    const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>" };
    tires[0].material.onBeforeCompile(shader);
    const { uBand, uOut } = shader.uniforms;
    assert.ok(uBand.value.x > 0 && uBand.value.y > uBand.value.x, "raios da parede lateral inválidos");
    outs.add(`${side}:${uOut.value}`);
    assert.ok(shader.fragmentShader.includes("tPerturb"), "relevo da banda não foi aplicado");
  }
  // O eixo local do pneu aponta para um lado diferente em cada roda: a orientação das letras compensa.
  assert.ok(outs.size === 4 || [...outs].every((entry) => /:(1|-1)$/.test(entry)));
});
