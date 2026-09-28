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
  // `other.group.visible`: na classificação os bots continuam correndo a
  // própria volta por trás dos panos (ver main.js/startRace), mas ficam
  // ocultos — não podem contar como "carro da frente" pra um DRS que o
  // jogador nunca veria (ele está sozinho na pista de propósito).
  const ahead = state.drivers
    .filter((other) => other !== car && !other.finish && other.group.visible && other.progress > car.progress)
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

/** Limiares de ENTRADA no contato (empurra fisicamente e pode contar como "toque novo"). */
const OVERLAP_PROGRESS_GAP = 4.3;
const OVERLAP_LANE_GAP = 2.1;
/** Limiares de SAÍDA do contato — maiores de propósito (histerese). */
const RELEASE_PROGRESS_GAP = 6.5;
const RELEASE_LANE_GAP = 2.7;

/**
 * Resolve sobreposições entre carros próximos (mesma pista, lanes próximas):
 * empurra cada um lateralmente para o lado oposto TODO tick enquanto
 * realmente sobrepostos (para eles não se atravessarem visualmente — isso
 * nunca tem penalidade nenhuma, é só física de "não ocupar o mesmo
 * lugar"), e aplica um "baque" (perda de velocidade + chacoalhão de
 * direção + câmera/som) proporcional à SEVERIDADE do impacto SÓ NA BORDA
 * DE SUBIDA do contato — só no instante em que os carros passam a se
 * tocar, nunca de novo enquanto o contato durar.
 *
 * Isso sozinho não bastava: dois carros correndo colados por vários
 * segundos (disputa de posição normalíssima numa corrida) têm o gap
 * naturalmente oscilando de um tick pro outro por causa da própria física
 * (aceleração, resposta de curva, drift) — com um limiar único, essa
 * oscilação cruza a fronteira "tocando"/"não tocando" dezenas de vezes por
 * segundo, e cada cruzamento contava como um toque NOVO, disparando o
 * baque repetidamente (foi isso que o smoke-test pegou: dezenas de quedas
 * de velocidade e o carro girando quase 180° em 5s de contato sustentado —
 * exatamente a sensação "horrível" relatada). Por isso os limiares de
 * ENTRADA (empurrar/contar toque novo) e de SAÍDA (voltar a permitir um
 * toque novo) são diferentes e mais largos na saída — histerese clássica
 * contra esse "chattering" na borda: uma vez tocando, só param de contar
 * como "em contato" quando realmente se afastarem, não em toda
 * micro-flutuação do gap.
 */
export function resolveCarCollisions(dt) {
  const drivers = state.drivers;
  const nowTouching = drivers.map(() => new Set());

  for (let i = 0; i < drivers.length; i++) {
    for (let j = i + 1; j < drivers.length; j++) {
      const a = drivers[i];
      const b = drivers[j];
      if (a.finish || b.finish) continue;
      const progressGap = Math.abs(a.progress - b.progress);
      const laneGap = a.lane - b.lane;
      const wasTouching = a.touching.has(b.id);

      const overlapping = progressGap < OVERLAP_PROGRESS_GAP && Math.abs(laneGap) < OVERLAP_LANE_GAP;
      const stillInReleaseZone = wasTouching && progressGap < RELEASE_PROGRESS_GAP && Math.abs(laneGap) < RELEASE_LANE_GAP;
      if (!overlapping && !stillInReleaseZone) continue; // realmente separados — nada a fazer, próximo par

      nowTouching[i].add(b.id);
      nowTouching[j].add(a.id);
      if (!overlapping) continue; // ainda na zona de histerese, mas não sobreposto: não empurra, não bate de novo

      const isNewContact = !wasTouching;
      const pushDir = laneGap === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(laneGap);
      const pushAmount = (OVERLAP_LANE_GAP - Math.abs(laneGap)) * .45;
      const relativeSpeed = Math.abs(a.speed - b.speed);
      const headOnFactor = 1 - progressGap / OVERLAP_PROGRESS_GAP; // 1 = quase no mesmo ponto da pista, 0 = quase não sobrepõe
      const impactSeverity = clamp(relativeSpeed / 40 + headOnFactor * .5, 0, 1);

      for (const [car, other, dir] of [[a, b, pushDir], [b, a, -pushDir]]) {
        car.lane = clamp(car.lane + pushAmount * dir, -trackHalfWidthAt(car.s) + 1.2, trackHalfWidthAt(car.s) - 1.2);
        if (car.isHuman) {
          const frame = state.track.at(car.s, car.lane);
          car.x = frame.p.x;
          car.z = frame.p.z;
        }
        if (isNewContact) {
          // O carro mais rápido dos dois "absorve" mais o choque (perde
          // mais velocidade) do que o mais lento, que é mais empurrado do
          // que frenado. Perda máxima de propósito moderada (22%, era 40%)
          // — mesmo só uma vez por toque, uma perda de até 40% da
          // velocidade NUM SÓ TICK (até ~40 m/s de queda instantânea a
          // alta velocidade, medido no smoke-test) já era brusca demais
          // pra um simples roçar entre carros disputando posição.
          const speedFactor = car.speed >= other.speed ? 1 : .55;
          car.speed *= 1 - clamp(impactSeverity * .22 * speedFactor, 0, .22);
          car.yaw += dir * impactSeverity * .08;
          car.cameraShake = Math.max(car.cameraShake, .1 + impactSeverity * .3);
          if (car === state.player && impactSeverity > .3) engineAudio.cue("impact");
        }
        syncCarVisual(car);
      }
    }
  }

  for (let i = 0; i < drivers.length; i++) drivers[i].touching = nowTouching[i];
}
