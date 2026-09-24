// Sorteio e uso dos itens de caixa (turbo, míssil, óleo, escudo), e o efeito
// de ser atingido por um deles. Lógica de física/movimento de mísseis e
// manchas de óleo já em voo/no chão fica em simulation.js; aqui só o
// "disparo" inicial e o sorteio de qual item o carro recebe.

import * as THREE from "three";
import { state } from "./state.js";
import { ITEM_DEFS } from "./constants.js";
import { engineAudio } from "./audio.js";
import { showNotice } from "./dom.js";
import { addMesh, MATERIALS } from "./materials.js";

/** Nível de miniturbo (0-3) correspondente à carga de drift acumulada. */
export function driftLevel(charge) {
  return charge >= 2.4 ? 3 : charge >= 1.45 ? 2 : charge >= .65 ? 1 : 0;
}

/**
 * Tabela de pesos (%) de sorteio de item conforme a posição na corrida e a
 * distância (m) até o líder — quem está mais atrás/mais longe do líder tem
 * mais chance de itens ofensivos; o líder recebe principalmente defensivos.
 */
function itemWeightsFor(position, gapToLeader) {
  if (position >= 6 && gapToLeader > 60) return { turbo: 55, missile: 24, oil: 3, shield: 18 };
  if (position >= 4) return { turbo: 40, missile: 28, oil: 12, shield: 20 };
  if (position === 1) return { turbo: 15, missile: 8, oil: 42, shield: 35 };
  return { turbo: 29, missile: 25, oil: 23, shield: 23 };
}

/** Sorteia um item conforme os pesos de `itemWeightsFor`. */
export function pickItem(position, gapToLeader, rng = Math.random) {
  let roll = rng() * 100;
  for (const [item, weight] of Object.entries(itemWeightsFor(position, gapToLeader))) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return "shield";
}

/** Concede um item a `car` com base em sua posição atual na corrida. */
export function grantItem(car) {
  const ranked = [...state.drivers].sort((a, b) => b.progress - a.progress);
  const position = ranked.indexOf(car) + 1;
  const gapToLeader = ranked[0].progress - car.progress;
  car.item = pickItem(position, gapToLeader);
  if (car === state.player) {
    engineAudio.cue("pickup");
    const useHint = matchMedia("(pointer:coarse)").matches ? "TOQUE PARA USAR" : "ESPAÇO PARA USAR";
    showNotice("ITEM: " + ITEM_DEFS[car.item].name + " · " + useHint);
  }
}

/**
 * Usa o item atual de `car` (padrão: jogador). Míssil: procura o alvo válido
 * mais próximo à frente, sem limite de alcance. Se não houver nenhum carro à
 * frente (ex.: já é o 1º colocado), o item é DESCARTADO (não fica preso) para
 * o jogador poder pegar outro. Turbo/Escudo/Óleo sempre consomem o item.
 */
export function useItem(car = state.player) {
  if (state.gameState !== "race" || !car?.item || car.finish) return;
  const item = car.item;

  if (item === "missile") {
    const target = state.drivers
      .filter((d) => d !== car && !d.finish && d.progress > car.progress)
      .sort((a, b) => a.progress - b.progress)[0];
    if (!target) {
      if (car === state.player) showNotice("SEM ALVO · MÍSSIL DESCARTADO");
      car.item = null; // descarta em vez de prender o item (ex.: já em 1º lugar)
      return;
    }
    const mesh = addMesh(new THREE.ConeGeometry(.4, 1.6, 8), MATERIALS.red, car.x, car.group.position.y + 1, car.z);
    state.missiles.push({ mesh, s: car.s, lane: car.lane, target, owner: car, life: ITEM_DEFS.missile.duration, travel: 0 });
    if (car === state.player) {
      engineAudio.cue("missile");
      showNotice("ALVO: " + target.name.toUpperCase());
    }
  }

  if (item === "turbo") {
    car.boost = Math.max(car.boost, ITEM_DEFS.turbo.duration);
    car.boostPower = 1;
    if (car === state.player) {
      engineAudio.cue("boost");
      showNotice("TURBO · 2,7 s");
    }
  }

  if (item === "shield") {
    car.shield = ITEM_DEFS.shield.duration;
    if (car === state.player) {
      engineAudio.cue("shield");
      showNotice("ESCUDO · BLOQUEIA UM ATAQUE");
    }
  }

  if (item === "oil") {
    const frame = state.track.at(car.s - 7, car.lane);
    const mesh = addMesh(
      new THREE.CircleGeometry(2.1, 20),
      new THREE.MeshBasicMaterial({ color: "#121623", side: THREE.DoubleSide, transparent: true, opacity: .9 }),
      frame.p.x, frame.p.y + .24, frame.p.z
    );
    mesh.rotation.set(-Math.PI / 2 - Math.asin(frame.t.y), 0, 0);
    state.oilPatches.push({ mesh, s: car.s - 7, lane: car.lane, owner: car.id, life: ITEM_DEFS.oil.duration });
    if (car === state.player) showNotice("ÓLEO NA PISTA · 12 s");
  }

  car.item = null;
}

/**
 * Aplica o efeito de ser atingido (míssil ou óleo) em `car`: bloqueia com o
 * escudo se houver um ativo, senão aplica atordoamento (stun) e perda de
 * velocidade, com um período curto de invulnerabilidade em seguida.
 */
export function applyHit(car) {
  if (car.invulnerable > 0) return;
  if (car.shield > 0) {
    car.shield = 0;
    car.invulnerable = 1;
    if (car === state.player) {
      engineAudio.cue("shield");
      showNotice("ESCUDO BLOQUEOU O ATAQUE");
    }
    return;
  }
  car.stun = .9;
  car.speed *= .58;
  car.invulnerable = 2.5;
  car.boost = 0;
  if (car.isHuman) {
    car.driftCharge = 0;
    car.cameraShake = .8;
  }
  if (car === state.player) {
    engineAudio.cue("impact");
    showNotice("ATINGIDO! · PROTEÇÃO TEMPORÁRIA");
  }
}
