import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildCarFromModel, CAR_FIT, COCKPIT_DROP, NODES } from "../src/betaCarModel.js";

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
