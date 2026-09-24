// IA e física dos 7 carros adversários. Cada bot, a cada poucas décimas de
// segundo (conforme a dificuldade), decide uma "faixa alvo" (avoidLane)
// olhando a curva à frente, outros carros, manchas de óleo e caixas de item;
// depois persegue essa faixa suavemente enquanto ajusta a velocidade-alvo
// conforme a curvatura da pista à frente, tráfego, itens e estado (stun/boost).
//
// Extraído 1:1 da função original `Mg` — inclusive a ordem das checagens.

import { state } from "./state.js";
import { TRACK_LENGTH, DIFFICULTIES } from "./constants.js";
import { clamp, wrapAngle, progressDelta } from "./mathUtils.js";
import { trackHalfWidthAt } from "./track.js";
import { advanceLapTracking } from "./physics.js";
import { useItem } from "./items.js";
import { syncCarVisual } from "./car.js";

/** Atualiza a física/IA de um bot para um passo fixo `dt` (1/120 s). */
export function updateBot(car, dt) {
  // Carro já terminou a corrida: freia suavemente e sai de cena (sem mais IA).
  if (car.finish) {
    car.speed = Math.max(0, car.speed - 12 * dt);
    car.s = (car.s + car.speed * dt) % TRACK_LENGTH;
    car.lane += (trackHalfWidthAt(car.s) + 3 - car.lane) * (1 - Math.exp(-dt * .8));
    syncCarVisual(car);
    if (car.speed < .5) car.group.visible = false;
    return;
  }

  const prevProgress = car.progress;
  const frame = state.track.at(car.s);
  const difficulty = DIFFICULTIES[state.difficultyKey];

  // --- Decisão de faixa (a cada `difficulty.reaction` segundos, aprox.) ---
  car.decision -= dt;
  if (car.decision <= 0) {
    car.decision = difficulty.reaction * (.85 + car.id * .04);
    const upcomingTurn = wrapAngle(state.track.at(car.s + 60).yaw - frame.yaw);
    const apexBias = -Math.sign(upcomingTurn) * Math.min(2.4, Math.abs(upcomingTurn) * 4);
    const laneLimit = frame.halfWidth - 1.8;
    const laneOptions = [-laneLimit, -2.3, 0, 2.3, laneLimit];

    let bestCost = Infinity;
    let bestLane = apexBias;
    for (const candidate of laneOptions) {
      let cost = Math.abs(candidate - apexBias) * .55 + Math.abs(candidate - car.lane) * .28;
      for (const other of state.drivers) {
        if (other === car || other.finish) continue;
        const gap = other.progress - car.progress;
        if (gap > -7 && gap < 65) {
          cost += Math.max(0, 3.1 - Math.abs(other.lane - candidate)) * (gap < 16 ? 12 : 4);
        }
      }
      for (const oil of state.oilPatches) {
        const gap = progressDelta(oil.s, car.s, TRACK_LENGTH);
        if (gap > 0 && gap < 85) {
          cost += Math.max(0, 4 - Math.abs(oil.lane - candidate)) * 13;
        }
      }
      if (!car.item) {
        for (const box of state.itemBoxes) {
          const gap = progressDelta(box.s, car.s, TRACK_LENGTH);
          if (gap > 0 && gap < 70 && box.cooldown === 0) {
            cost -= Math.max(0, 2 - Math.abs(box.lane - candidate)) * 1.6;
          }
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestLane = candidate;
      }
    }
    car.avoidLane = clamp(bestLane, -laneLimit, laneLimit);
  }

  // --- Velocidade-alvo conforme a curvatura da pista à frente. ---
  let targetSpeed = 84 * difficulty.pace * (.97 + car.id * .008);
  for (const lookahead of [15, 35, 65, 110]) {
    const a = state.track.at(car.s + lookahead);
    const b = state.track.at(car.s + lookahead + 18);
    const curvature = Math.abs(wrapAngle(b.yaw - a.yaw)) / 18;
    const cornerSpeed = clamp(Math.sqrt(29 / Math.max(.003, curvature)), 24, 88) * difficulty.pace;
    targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed * cornerSpeed + 56 * Math.max(0, lookahead - 14)));
  }

  // --- Reage a um carro imediatamente à frente (tenta ultrapassar/evitar). ---
  const carAhead = state.drivers
    .filter((other) => other !== car && !other.finish && other.progress > car.progress && other.progress - car.progress < 30 && Math.abs(other.lane - car.lane) < 2.3)
    .sort((a, b) => a.progress - b.progress)[0];
  if (carAhead) {
    const gap = carAhead.progress - car.progress;
    if (gap < 18) {
      const overtakeLimit = frame.halfWidth - 1.5;
      const laneChoices = [-overtakeLimit, overtakeLimit];
      const trafficAt = (lane) =>
        state.drivers.filter((other) => other !== car && Math.abs(other.progress - car.progress) < 12 && Math.abs(other.lane - lane) < 2.3).length;
      laneChoices.sort((a, b) => trafficAt(a) - trafficAt(b) || Math.abs(a - car.lane) - Math.abs(b - car.lane));
      car.avoidLane = laneChoices[0];
      car.decision = Math.min(car.decision, .15);
    }
    if (gap < 10 && Math.abs(car.avoidLane - car.lane) < .8) {
      targetSpeed = Math.min(targetSpeed, Math.max(8, carAhead.speed + (gap - 6) * 2));
    }
  }

  // --- Persegue a faixa-alvo, a menos que outro carro já a ocupe melhor. ---
  const laneStep = clamp(car.avoidLane - car.lane, -dt * 3.8, dt * 3.8);
  const nextLane = car.lane + laneStep;
  const blocked = state.drivers.some(
    (other) =>
      other !== car && !other.finish &&
      Math.abs(other.progress - car.progress) < 4.5 &&
      Math.abs(other.lane - nextLane) < 1.9 &&
      Math.abs(other.lane - nextLane) < Math.abs(other.lane - car.lane)
  );
  if (!blocked) {
    car.lane = clamp(nextLane, -frame.halfWidth + 1.3, frame.halfWidth - 1.3);
  }

  // --- Detecção de "carro preso" (ex.: contra o muro) e manobra de escape. ---
  car.stuckTime = car.speed < 4 && car.stun <= 0 ? (car.stuckTime || 0) + dt : 0;
  if (car.stuckTime > 1.4) {
    car.decision = 0;
    car.avoidLane = clamp(car.lane + (car.id % 2 ? 3 : -3), -frame.halfWidth + 1.3, frame.halfWidth - 1.3);
    targetSpeed = Math.max(targetSpeed, 18);
  }

  if (car.boost > 0) targetSpeed = Math.min(104, targetSpeed + 22);
  if (car.stun > 0) targetSpeed = 13;

  car.speed += clamp(targetSpeed - car.speed, -48 * dt, difficulty.acceleration * dt);
  car.speed = clamp(car.speed - frame.t.y * 9.81 * dt, 0, 104);
  car.progress += car.speed * dt;
  car.s = (car.progress % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  car.itemTimer -= dt;

  // --- Decide se usa o item que está segurando. ---
  if (car.item && car.itemTimer <= 0) {
    const missileIncoming = state.missiles.some(
      (m) => m.target === car && progressDelta(car.s, m.s, TRACK_LENGTH) > 0 && progressDelta(car.s, m.s, TRACK_LENGTH) < 120
    );
    const carCloseBehind = state.drivers.some(
      (other) => other !== car && car.progress - other.progress > 0 && car.progress - other.progress < 45 && Math.abs(other.lane - car.lane) < 3
    );
    const upcomingTurnAngle = Math.abs(wrapAngle(state.track.at(car.s + 75).yaw - frame.yaw));
    const shouldUse =
      (car.item === "shield" && missileIncoming) ||
      (car.item === "oil" && carCloseBehind) ||
      (car.item === "turbo" && upcomingTurnAngle < .35) ||
      car.item === "missile";
    if (shouldUse) {
      useItem(car);
      car.itemTimer = 2 + difficulty.reaction;
    }
  }

  advanceLapTracking(car, prevProgress, dt, false);
}
