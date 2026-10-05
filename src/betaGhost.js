import * as THREE from "three";
import { state } from "./state.js";
import { getSettings } from "./betaSettings.js";
import { GhostRecorder, ghostAt, isNewRecord, loadRecord, saveRecord } from "./betaRecords.js";
import { clamp } from "./mathUtils.js";
import { showNotice } from "./dom.js";

/**
 * Fantasma da melhor volta da 2.0: grava a volta do jogador, guarda a melhor
 * (por circuito e horário, em localStorage) e a reproduz como um carro
 * translúcido que larga junto com você. Esmaece perto do carro para nunca
 * tapar o cockpit.
 */

const FADE_NEAR = 3;
const FADE_FAR = 14;
const MAX_OPACITY = 0.42;

const session = { player: null, scene: null, key: null, lapsSeen: 0, recorder: new GhostRecorder(), mesh: null };
const pose = { x: 0, y: 0, z: 0, yaw: 0 };

function buildGhostMesh() {
  const material = new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: MAX_OPACITY, depthWrite: false });
  const group = new THREE.Group();
  const part = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  part(0.55, 0.42, 3.9, 0, 0.42, 0); // monocoque
  part(1.9, 0.08, 0.45, 0, 0.2, 2.35); // asa dianteira
  part(1.0, 0.5, 0.3, 0, 0.9, -2.2); // asa traseira
  for (const [x, z, w] of [[-0.9, 1.45, 0.3], [0.9, 1.45, 0.3], [-0.95, -1.5, 0.42], [0.95, -1.5, 0.42]]) part(w, 0.7, 0.7, x, 0.35, z);
  group.renderOrder = 3;
  group.userData.material = material;
  group.visible = false;
  return group;
}

function currentKey() {
  return `${state.circuitId}:${getSettings().time}`;
}

function reload() {
  session.key = currentKey();
  state.betaRecord = loadRecord(state.circuitId, getSettings().time);
}

function begin(player) {
  session.player = player;
  session.lapsSeen = player.completedLaps || 0;
  session.recorder.reset();
  state.betaRecordBroken = 0;
  reload();
  if (session.mesh && session.scene !== state.scene) session.mesh = null; // a cena foi refeita (outra pista)
  if (!session.mesh) session.mesh = buildGhostMesh();
  session.scene = state.scene;
  if (session.mesh.parent !== state.scene) state.scene.add(session.mesh);
}

function finishLap(player) {
  const lapTime = player.lastLap;
  const valid = player.lapValidity?.[player.completedLaps - 1];
  if (isNewRecord(lapTime, valid, state.betaRecord)) {
    const ghost = session.recorder.finish(lapTime);
    state.betaRecord = { best: lapTime, ghost: ghost.length ? ghost : null };
    state.betaRecordBroken = player.completedLaps;
    saveRecord(state.circuitId, getSettings().time, state.betaRecord);
    showNotice("NOVO RECORDE PESSOAL");
  }
  session.recorder.reset();
  session.lapsSeen = player.completedLaps;
}

/** Chamar uma vez por quadro, antes da HUD. */
export function updateBetaGhost() {
  const player = state.player;
  const mesh = session.mesh;
  if (!state.graphicsBeta || !player || !state.scene) {
    if (mesh) mesh.visible = false;
    session.player = null;
    return;
  }
  if (player !== session.player || session.scene !== state.scene) begin(player);
  if (session.key !== currentKey()) reload();
  if (state.gameState !== "race" || player.finish) {
    session.mesh.visible = false;
    return;
  }

  if (player.completedLaps > session.lapsSeen) finishLap(player);
  const lapTime = Math.max(0, state.raceTime - (player.lapStarted || 0));
  const p = player.group.position;
  session.recorder.sample(lapTime, p.x, p.y, p.z, player.yaw);

  const where = getSettings().ghost ? ghostAt(state.betaRecord?.ghost, lapTime, pose) : null;
  session.mesh.visible = Boolean(where);
  if (!where) return;
  session.mesh.position.set(where.x, where.y, where.z);
  session.mesh.rotation.y = where.yaw;
  const distance = Math.hypot(where.x - p.x, where.z - p.z);
  session.mesh.userData.material.opacity = MAX_OPACITY * clamp((distance - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0, 1);
}
