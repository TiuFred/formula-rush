// Física/lógica compartilhada entre o carro do jogador (player.js) e os bots
// (bots.js): resolução de colisão carro-carro e o "pós-processamento" de
// cada tick (detectar volta completada, sincronizar visual, checar chegada).

import { state } from "./state.js";
import { TRACK_LENGTH, DRS_GAP_THRESHOLD } from "./constants.js";
import { trackHalfWidthAt, drsZoneAt } from "./track.js";
import { clamp } from "./mathUtils.js";
import { checkLapCompletion, checkSectorCompletion, formatLapTime } from "./timing.js";
import { showNotice } from "./dom.js";
import { syncCarVisual } from "./car.js";
import { recordLap } from "./leaderboard.js";
import { engineAudio } from "./audio.js";

/** Marca `car` como tendo terminado a corrida (usa o instante da última volta como tempo final). */
export function finishRace(car) {
  car.finish = car.lapStarted;
  car.speed = Math.min(car.speed, 45);
  state.finishOrder.push(car);
  state.finishOrder.sort((a, b) => a.finish - b.finish);
}

/**
 * DRS: `true` se `car` está numa zona de DRS do circuito ATIVO E perto
 * o bastante (< DRS_GAP_THRESHOLD metros de `progress`) do carro
 * imediatamente à frente — igual ao critério real (detecção de gap),
 * simplificado para não depender de um "ponto de detecção" fixo. Usado por
 * player.js e bots.js igualmente, para não dar vantagem exclusiva ao
 * jogador.
 */
export function computeDrsActive(car) {
  if (car.finish || !drsZoneAt(car.s)) return false;
  const ahead = state.drivers
    .filter((other) => other !== car && !other.finish && other.progress > car.progress)
    .sort((a, b) => a.progress - b.progress)[0];
  return !!ahead && ahead.progress - car.progress < DRS_GAP_THRESHOLD;
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

  // Setores: cronometragem independente da de volta (ver timing.js). Só
  // avisa o jogador (bots não têm HUD) e só quando um setor de fato fecha.
  const sectorsBefore = car.sectorsCompleted;
  checkSectorCompletion(car, prevProgress, car.progress, state.raceTime, dt, TRACK_LENGTH);
  if (car === state.player && car.sectorsCompleted > sectorsBefore) {
    const idx = (car.sectorsCompleted - 1) % 3;
    const isBest = car.lastSectors[idx] === car.bestSectors[idx];
    showNotice("SETOR " + (idx + 1) + " · " + formatLapTime(car.lastSectors[idx]) + (isBest ? " · MELHOR" : ""));
  }

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
    recordLap(state.circuitId, car.name, car.bestLap);
  }
  syncCarVisual(car);
  if (car.completedLaps >= state.lapCountRace && !car.finish) finishRace(car);
}

/**
 * Resolve sobreposições entre carros próximos (mesma pista, lanes próximas):
 * empurra cada um lateralmente para o lado oposto e aplica uma perda de
 * velocidade + "chacoalhão" de direção proporcionais à SEVERIDADE do impacto
 * (velocidade relativa entre os dois carros e o quão alinhados eles estão no
 * traçado — quase no mesmo ponto da pista = mais "de frente", bem mais
 * severo que só roçar as laterais). `car.collisionCooldown` garante que o
 * "baque" (perda de velocidade, câmera, som) só é aplicado uma vez por
 * contato, não a cada tick de física enquanto os carros continuam
 * sobrepostos (o empurrão lateral em si continua todo tick, para eles não
 * se atravessarem visualmente).
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
        const relativeSpeed = Math.abs(a.speed - b.speed);
        const headOnFactor = 1 - progressGap / 4.3; // 1 = quase no mesmo ponto da pista, 0 = quase não sobrepõe
        const impactSeverity = clamp(relativeSpeed / 40 + headOnFactor * .5, 0, 1);

        for (const [car, other, dir] of [[a, b, pushDir], [b, a, -pushDir]]) {
          // O empurrão lateral roda TODO tick (para os carros não se
          // atravessarem visualmente enquanto seguem sobrepostos), mas o
          // "baque" em si (perda de velocidade, chacoalhão de direção,
          // câmera, som) só é aplicado UMA VEZ por contato, gated pelo
          // mesmo cooldown — sem isso, dois carros correndo lado a lado por
          // só 1s (comum numa disputa de posição) perderiam a maior parte
          // da velocidade, já que a perda era composta a cada um dos 120
          // ticks/s enquanto durasse o contato.
          car.lane = clamp(car.lane + pushAmount * dir, -trackHalfWidthAt(car.s) + 1.2, trackHalfWidthAt(car.s) - 1.2);
          if (car.isHuman) {
            const frame = state.track.at(car.s, car.lane);
            car.x = frame.p.x;
            car.z = frame.p.z;
          }
          if (car.collisionCooldown <= 0) {
            // O carro mais rápido dos dois "absorve" mais o choque (perde
            // mais velocidade) do que o mais lento, que é mais empurrado do
            // que frenado.
            const speedFactor = car.speed >= other.speed ? 1 : .55;
            car.speed *= 1 - clamp(impactSeverity * .5 * speedFactor, 0, .6);
            car.yaw += dir * impactSeverity * .15;
            car.collisionCooldown = .4;
            car.cameraShake = Math.max(car.cameraShake, .12 + impactSeverity * .4);
            if (car === state.player && impactSeverity > .25) engineAudio.cue("impact");
          }
          syncCarVisual(car);
        }
      }
    }
  }
}
