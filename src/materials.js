// Materiais compartilhados e pequenos helpers de criação/limpeza de meshes
// three.js, usados por scene.js e car.js.

import * as THREE from "three";
import { state } from "./state.js";

/** Cria um MeshStandardMaterial com roughness padrão 0.82 (estética "arcade"). */
export function makeMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .82, ...extra });
}

/** Paleta de materiais reutilizados em toda a pista/cenário. */
export const MATERIALS = {
  road: makeMaterial("#363d40"),
  line: makeMaterial("#e4e5cd"),
  green: makeMaterial("#346e49"),
  lime: makeMaterial("#daf951", { emissive: "#617819", emissiveIntensity: .35 }),
  red: makeMaterial("#e95754"),
  white: makeMaterial("#d7e3cf"),
  barrier: makeMaterial("#839c96"),
  grass: makeMaterial("#63886a"),
  black: makeMaterial("#101819"),
  tire: makeMaterial("#161c20"),
  metal: makeMaterial("#7b979a"),
  roof: makeMaterial("#d0dfda"),
};

/** Cria um Mesh a partir de geometria+material, posiciona e adiciona a `parent` (padrão: cena atual). */
export function addMesh(geometry, material, x = 0, y = 0, z = 0, parent = state.scene) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Atalho para addMesh com um BoxGeometry(w,h,d). */
export function addBox(w, h, d, material, x, y, z, parent = state.scene) {
  return addMesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
}

/**
 * Libera geometria/material de um Object3D (e de todos os seus filhos) e o
 * remove do pai. Materiais compartilhados da paleta MATERIALS nunca são
 * descartados (eles são reaproveitados entre corridas).
 */
export function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
      if (mat && !Object.values(MATERIALS).includes(mat)) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    }
  });
  obj.parent?.remove(obj);
}

/** Cria um mesh plano com um texto renderizado em canvas (placas, números, etc.). */
export function makeTextPanel(text, w, h, bg = "#102522", fg = "#eff9d7") {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 768, 192);
  ctx.fillStyle = fg;
  ctx.font = "bold 68px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 384, 100, 728);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
  );
  // Guardamos o canvas/contexto para poder redesenhar o texto depois (ver
  // redrawTextPanel) sem precisar recriar o mesh — usado para o número do
  // carro do jogador, que pode ser alterado no menu.
  mesh.userData.canvas = canvas;
  mesh.userData.ctx = ctx;
  mesh.userData.bg = bg;
  mesh.userData.fg = fg;
  return mesh;
}

/** Redesenha o texto de um painel criado por makeTextPanel, sem recriar o mesh. */
export function redrawTextPanel(mesh, text, bg = mesh.userData.bg, fg = mesh.userData.fg) {
  const { canvas, ctx } = mesh.userData;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = "bold 68px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, 100, canvas.width - 40);
  mesh.material.map.needsUpdate = true;
}
