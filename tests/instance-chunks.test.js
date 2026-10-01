import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { chunkInstancedMeshes } from "../src/instanceChunks.js";

function crowd(count, area) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), count);
  mesh.castShadow = true;
  mesh.name = "multidao";
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(((i * 37) % 1000) * (area / 1000) - area / 2, 0, ((i * 91) % 1000) * (area / 1000) - area / 2);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color().setHSL((i % 100) / 100, 0.5, 0.5));
  }
  return mesh;
}

test("blocos preservam todas as instâncias, cores, nome e sombra", () => {
  const scene = new THREE.Scene();
  const mesh = crowd(2000, 2000);
  scene.add(mesh);
  const originalColors = [];
  const c = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getColorAt(i, c);
    originalColors.push(c.getHex());
  }

  const created = chunkInstancedMeshes(scene, { cellSize: 400 });
  const chunks = scene.children.filter((o) => o.isInstancedMesh);
  assert.equal(chunks.length, created);
  assert.ok(created > 4, "deveria ter dividido em vários blocos");
  assert.equal(scene.children.includes(mesh), false);
  assert.equal(chunks.reduce((sum, chunk) => sum + chunk.count, 0), 2000);
  const colors = [];
  for (const chunk of chunks) {
    assert.equal(chunk.name, "multidao");
    assert.equal(chunk.castShadow, true);
    assert.equal(chunk.geometry, mesh.geometry);
    assert.equal(chunk.material, mesh.material);
    for (let i = 0; i < chunk.count; i++) {
      chunk.getColorAt(i, c);
      colors.push(c.getHex());
    }
  }
  assert.deepEqual(colors.sort(), originalColors.sort());
});

test("bloco fora da câmera é descartado pelo frustum", () => {
  const scene = new THREE.Scene();
  scene.add(crowd(3000, 3000));
  chunkInstancedMeshes(scene, { cellSize: 300 });
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 400);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 5, -100);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  scene.updateMatrixWorld(true);
  const chunks = scene.children.filter((o) => o.isInstancedMesh);
  const visible = chunks.filter((chunk) => frustum.intersectsObject(chunk)).length;
  assert.ok(visible > 0 && visible < chunks.length / 2, `visíveis ${visible} de ${chunks.length}`);
});

test("malhas pequenas ou marcadas com keepWhole ficam intactas", () => {
  const scene = new THREE.Scene();
  const small = crowd(50, 2000);
  const whole = crowd(2000, 2000);
  whole.userData.keepWhole = true;
  scene.add(small, whole);
  assert.equal(chunkInstancedMeshes(scene), 0);
  assert.deepEqual(scene.children, [small, whole]);
});
