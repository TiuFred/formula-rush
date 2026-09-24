// Física/lógica compartilhada entre o carro do jogador (player.js) e os bots
// (bots.js): resolução de colisão carro-carro e o "pós-processamento" de
// cada tick (detectar volta completada, sincronizar visual, checar chegada).

import { state } from "./state.js";
import { TRACK_LENGTH } from "./constants.js";
import { trackHalfWidthAt } from "./track.js";
import { clamp } from "./mathUtils.js";
import { checkLapCompletion, formatLapTime } from "./timing.js";
import { showNotice } from "./dom.js";
import { syncCarVisual } from "./car.js";
import { recordLap } from "./leaderboard.js";

/** Marca `car` como tendo terminado a corrida (usa o instante da última volta como tempo final). */
export function finishRace(car) {
  car.finish = car.lapStarted;
  car.speed = Math.min(car.speed, 45);
  state.finishOrder.push(car);
  state.finishOrder.sort((a, b) => a.finish - b.finish);
}

/**
 * Deve ser chamada ao final da atualização de física de cada carro a cada
 * tick: detecta se uma volta foi completada (opcionalmente mostrando um
 * aviso, usado só para o jogador), sincroniza o visual e verifica chegada.
 */
export function advanceLapTracking(car, prevProgress, dt, notify = false) {
  const lapsBefore = car.completedLaps;
  const bestLapBefore = car.bestLap;
  checkLapCompletion(car, prevProgress, car.progress, state.raceTime, dt, TRACK_LENGTH, state.lapCountRace);

  const lapJustCompleted = car.completedLaps > lapsBefore;
  if (lapJustCompleted) {
    const wasValid = car.currentLapValid;
    car.lapValidity.push(wasValid);
    // Limites de pista (só relevante no contra-relógio, ver player.js): uma
    // volta com excursão além do traçado marcado não conta como recorde —
    // desfaz a atualização de melhor volta que checkLapCompletion acabou de
    // fazer, se essa volta tiver se tornado a nova "melhor".
    if (state.timeTrial && !wasValid) {
      car.bestLap = bestLapBefore;
      if (car === state.player) showNotice("VOLTA " + car.completedLaps + " INVALIDADA · LIMITES DE PISTA");
    } else if (notify && car.completedLaps < state.lapCountRace) {
      showNotice("VOLTA " + car.completedLaps + " · " + formatLapTime(car.lastLap));
    }
    car.currentLapValid = true; // reinicia para a próxima volta
  }

  // Ranking local: só carros controlados por humanos entram no leaderboard
  // (bots não "contam" tempos). Registra sempre que uma nova melhor volta é
  // batida, usando o nome configurado para aquele piloto.
  if (car.isHuman && car.bestLap !== bestLapBefore) {
    recordLap(state.circuitId, car.leaderboardName ?? car.name, car.bestLap);
  }
  syncCarVisual(car);
  if (car.completedLaps >= state.lapCountRace && !car.finish) finishRace(car);
}

/**
 * Resolve sobreposições entre carros próximos (mesma pista, lanes próximas):
 * empurra cada um lateralmente para o lado oposto e reduz levemente a
 * velocidade de ambos (simula o contato/roçar entre monopostos).
 */
export function resolveCarCollisions(dt) {
  const drivers = state.drivers;
  for (let i = 0; i < drivers.length; i++) {
    for (let j = i + 1; j < drivers.length; j++) {
      const a = drivers[i];
      const b = drivers[j];
      if (a.finish || b.finish) continue;
      const progressGap = Math.abs(a.progress - b.progress);
      const laneGap = a.lane - b.lane;
      if (progressGap < 4.3 && Math.abs(laneGap) < 2.1) {
        const pushDir = laneGap === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(laneGap);
        const pushAmount = (2.1 - Math.abs(laneGap)) * .45;
        for (const [car, dir] of [[a, pushDir], [b, -pushDir]]) {
          car.lane = clamp(car.lane + pushAmount * dir, -trackHalfWidthAt(car.s) + 1.2, trackHalfWidthAt(car.s) - 1.2);
          if (car.isHuman) {
            const frame = state.track.at(car.s, car.lane);
            car.x = frame.p.x;
            car.z = frame.p.z;
          }
          car.speed *= Math.exp(-dt * 1.1);
          syncCarVisual(car);
        }
      }
    }
  }
}
