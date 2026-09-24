// Orquestra um passo fixo de simulação (advanceSimulation, chamado a 120 Hz
// pelo loop principal em main.js): física do jogador e dos bots, decaimento
// de timers (boost/escudo/stun/...), colisões entre carros, animação e
// coleta de caixas de item, vida útil de manchas de óleo e mísseis, e
// partículas de drift. Também monta as caixas de item no início da corrida
// e a tela de resultados ao final.

import * as THREE from "three";
import { state } from "./state.js";
import { TRACK_LENGTH, ITEM_BOX_POSITIONS, ITEM_DEFS, DIFFICULTIES } from "./constants.js";
import { clamp, progressDelta } from "./mathUtils.js";
import { updatePlayerPhysics } from "./player.js";
import { updateBot } from "./bots.js";
import { resolveCarCollisions } from "./physics.js";
import { grantItem, applyHit } from "./items.js";
import { addMesh, disposeObject3D } from "./materials.js";
import { byId, setVisible } from "./dom.js";
import { formatLapTime } from "./timing.js";
import { engineAudio } from "./audio.js";
import { CIRCUITS } from "./circuits.js";

/**
 * (Re)cria as caixas de item na pista e limpa óleo/mísseis/partículas de uma
 * corrida anterior. No contra-relógio (`state.timeTrial`), não há caixas de
 * item. Chamado por startRace() em main.js.
 */
export function setupItemBoxes() {
  for (const box of state.itemBoxes) disposeObject3D(box.mesh);
  for (const patch of state.oilPatches) disposeObject3D(patch.mesh);
  for (const missile of state.missiles) disposeObject3D(missile.mesh);
  for (const particle of state.driftParticles) disposeObject3D(particle.mesh);
  state.itemBoxes = [];
  state.oilPatches = [];
  state.missiles = [];
  state.driftParticles = [];

  if (state.timeTrial) return; // contra-relógio: sem itens

  for (const s of ITEM_BOX_POSITIONS) {
    for (const lane of [-4, 0, 4]) {
      const frame = state.track.at(s, lane);
      const group = new THREE.Group();
      state.scene.add(group);
      group.position.copy(frame.p);
      group.position.y += 1.6;

      const cube = addMesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshStandardMaterial({ color: "#d8ff64", emissive: "#809d1e", emissiveIntensity: .6, transparent: true, opacity: .8 }),
        0, 0, 0, group
      );
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: "#f6ffd6" }));
      group.add(outline);

      state.itemBoxes.push({ s, lane, mesh: group, cooldown: 0, baseY: group.position.y });
    }
  }
}

/** Avança a simulação em um passo fixo `dt` (1/120 s). Chamado pelo loop principal. */
export function advanceSimulation(dt) {
  state.raceTime += dt;

  // Guarda a pose renderizada do tick ANTERIOR antes de mover qualquer
  // carro neste tick — é a base para a interpolação visual em car.js
  // (applyRenderInterpolation), que evita o "bumping" da câmera externa.
  for (const car of state.drivers) {
    car.renderPrevPos.copy(car.renderCurrPos);
    car.renderPrevQuat.copy(car.renderCurrQuat);
  }

  updatePlayerPhysics(state.player, dt, state.keys);

  for (const car of state.drivers) {
    if (!car.isHuman) updateBot(car, dt);
    for (const field of ["boost", "shield", "stun", "boxCooldown", "invulnerable", "wallCooldown"]) {
      car[field] = Math.max(0, car[field] - dt);
    }
    car.shieldMesh.visible = car.shield > 0;
    car.flame.visible = car.boost > 0;
    car.flame.scale.y = 1 + Math.sin(state.clockTime * 40) * .25;
  }

  resolveCarCollisions(dt);

  // Caixas de item: animação de flutuar/girar, e coleta pelo primeiro carro
  // elegível que passar perto o suficiente.
  for (const box of state.itemBoxes) {
    box.cooldown = Math.max(0, box.cooldown - dt);
    box.mesh.visible = box.cooldown === 0;
    box.mesh.rotation.y = state.clockTime;
    box.mesh.rotation.z = Math.sin(state.clockTime * 1.5) * .25;
    box.mesh.position.y = box.baseY + Math.sin(state.clockTime * 2) * .25;
    if (box.cooldown === 0) {
      for (const car of state.drivers) {
        if (!car.item && car.boxCooldown === 0 &&
            Math.abs(progressDelta(car.s, box.s, TRACK_LENGTH)) < 3.3 &&
            Math.abs(car.lane - box.lane) < 2) {
          grantItem(car);
          car.boxCooldown = 1.2;
          box.cooldown = 3.5;
          break;
        }
      }
    }
  }

  // Manchas de óleo: expiram sozinhas, ou ao atingir alguém (exceto quem a jogou).
  state.oilPatches = state.oilPatches.filter((patch) => {
    patch.life -= dt;
    for (const car of state.drivers) {
      if (car.id !== patch.owner &&
          Math.abs(progressDelta(car.s, patch.s, TRACK_LENGTH)) < 3 &&
          Math.abs(car.lane - patch.lane) < 2.5 &&
          car.stun === 0) {
        applyHit(car);
        patch.life = 0;
      }
    }
    if (patch.life <= 0) {
      disposeObject3D(patch.mesh);
      return false;
    }
    return true;
  });

  // Mísseis: perseguem o alvo (ajustando faixa lateral aos poucos) até acertar ou expirar.
  state.missiles = state.missiles.filter((missile) => {
    missile.life -= dt;
    const gapToTarget = progressDelta(missile.target.s, missile.s, TRACK_LENGTH);
    const step = ITEM_DEFS.missile.speed * dt;
    missile.s += step;
    missile.travel += step;
    missile.lane += clamp(missile.target.lane - missile.lane, -dt * 6, dt * 6);
    const frame = state.track.at(missile.s, missile.lane);
    missile.mesh.position.copy(frame.p);
    missile.mesh.position.y += 1;
    missile.mesh.rotation.set(Math.PI / 2, frame.yaw, 0);
    if (gapToTarget >= -2 && gapToTarget <= step + 3 && Math.abs(missile.lane - missile.target.lane) < 2.8) {
      applyHit(missile.target);
      missile.life = 0;
    }
    if (missile.life <= 0 || missile.target.finish) {
      disposeObject3D(missile.mesh);
      return false;
    }
    return true;
  });

  // Partículas de faísca de drift: sobem e somem.
  state.driftParticles = state.driftParticles.filter((particle) => {
    particle.life -= dt;
    particle.mesh.position.addScaledVector(particle.v, dt);
    if (particle.life <= 0) {
      state.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      return false;
    }
    return true;
  });

  if (state.player.finish && state.gameState === "race") showResults();
}

/**
 * Encerra o contra-relógio manualmente (botão "Encerrar contra-relógio" no
 * menu de pausa) e mostra a tela de resultado com os tempos da sessão.
 * Diferente de `finishRace` (que marca a chegada exatamente no cruzamento
 * da linha), aqui o jogador para no meio de uma volta — por isso o "tempo
 * final" mostrado é o relógio total da sessão, não o tempo de uma volta.
 */
export function endTimeTrial() {
  const player = state.player;
  player.finish = state.raceTime;
  state.finishOrder = [player];
  showResults();
}

/** Monta a tela de resultados (classificação final) ao término da corrida do jogador. */
export function showResults() {
  state.gameState = "finished";
  engineAudio.cue("finish");
  setVisible("pausePanel", false);
  setVisible("finish");
  setVisible("attackWarning", false);
  setVisible("touch", false);
  setVisible("countdown", false);

  const position = state.finishOrder.indexOf(state.player) + 1;
  byId("resultTitle").textContent = state.timeTrial
    ? "Contra-relógio concluído!"
    : position === 1 ? "Você venceu!" : position + "º lugar";
  const circuitLabel = (CIRCUITS[state.circuitId]?.label ?? "Pista").toUpperCase();
  const lapsLabel = state.timeTrial
    ? state.player.completedLaps + (state.player.completedLaps === 1 ? " VOLTA" : " VOLTAS")
    : state.lapCountRace + (state.lapCountRace === 1 ? " VOLTA" : " VOLTAS");
  byId("resultInfo").textContent =
    circuitLabel + " · " + lapsLabel + " · " +
    DIFFICULTIES[state.difficultyKey].label.toUpperCase() + " · " +
    formatLapTime(state.player.finish) + " · MELHOR " + formatLapTime(state.player.bestLap);

  const standings = [
    ...state.finishOrder,
    ...state.drivers.filter((d) => !d.finish).sort((a, b) => b.progress - a.progress),
  ];
  byId("standings").innerHTML = standings
    .map((d, i) =>
      '<div class="standing ' + (d === state.player ? "you" : "") + '"><b>' + String(i + 1).padStart(2, "0") +
      "</b><span>" + d.name + "</span><span>" +
      (d.finish ? formatLapTime(d.finish) : d.completedLaps + "/" + state.lapCountRace + " VOLTAS") +
      "</span></div>"
    )
    .join("");
}
