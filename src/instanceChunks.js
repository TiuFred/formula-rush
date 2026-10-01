import * as THREE from "three";

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const color = new THREE.Color();

/**
 * Divide cada InstancedMesh grande em blocos espaciais (grade no plano XZ).
 *
 * Um InstancedMesh tem uma única esfera de culling que engloba todas as suas
 * instâncias; com multidão, árvores e prédios espalhados pelo circuito inteiro
 * ela nunca sai do campo de visão e a GPU processa tudo em todo quadro, também
 * no mapa de sombras. Em blocos, o Three.js descarta os que estão fora da
 * câmera e da luz. Geometria e material continuam compartilhados.
 *
 * Só serve para instâncias estáticas (matrizes definidas uma única vez).
 */
export function chunkInstancedMeshes(root, { cellSize = 360, minInstances = 300 } = {}) {
  const targets = [];
  root.traverse((object) => {
    if (object.isInstancedMesh && object.count >= minInstances && !object.userData.keepWhole) targets.push(object);
  });

  let created = 0;
  for (const mesh of targets) {
    const parent = mesh.parent;
    if (!parent) continue;
    const cells = new Map();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      const key = `${Math.floor(position.x / cellSize)},${Math.floor(position.z / cellSize)}`;
      const ids = cells.get(key);
      if (ids) ids.push(i);
      else cells.set(key, [i]);
    }
    if (cells.size < 2) continue;

    for (const ids of cells.values()) {
      const chunk = new THREE.InstancedMesh(mesh.geometry, mesh.material, ids.length);
      chunk.name = mesh.name;
      chunk.castShadow = mesh.castShadow;
      chunk.receiveShadow = mesh.receiveShadow;
      chunk.renderOrder = mesh.renderOrder;
      chunk.layers.mask = mesh.layers.mask;
      chunk.userData = { ...mesh.userData };
      chunk.position.copy(mesh.position);
      chunk.quaternion.copy(mesh.quaternion);
      chunk.scale.copy(mesh.scale);
      ids.forEach((id, n) => {
        mesh.getMatrixAt(id, matrix);
        chunk.setMatrixAt(n, matrix);
        if (mesh.instanceColor) {
          mesh.getColorAt(id, color);
          chunk.setColorAt(n, color);
        }
      });
      chunk.instanceMatrix.needsUpdate = true;
      if (chunk.instanceColor) chunk.instanceColor.needsUpdate = true;
      chunk.computeBoundingSphere();
      parent.add(chunk);
      created++;
    }
    parent.remove(mesh);
    mesh.dispose();
  }
  return created;
}
