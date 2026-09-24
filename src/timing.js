// Cronometragem de voltas: reset por corrida, detecção de cruzamento da
// linha de largada/chegada (com interpolação sub-frame para precisão),
// formatação de tempos e o painel "Tempos de volta" (UI).

import { state } from "./state.js";
import { byId, setVisible } from "./dom.js";
import { togglePause } from "./input.js";
import { wireOptionGroup } from "./ui.js";

/** Garante um número inteiro de voltas entre 1 e 20 (padrão 3 se inválido). */
export function clampLapCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(20, Math.round(n))) : 3;
}

/** Reinicia os dados de volta de um carro (chamado ao montar o grid). */
export function resetLapState(car) {
  car.laps = [];
  car.completedLaps = 0;
  car.lapStarted = 0;
  car.lastLap = null;
  car.bestLap = null;
  car.currentLapValid = true;
  car.lapValidity = [];
}

/**
 * Verifica se `car` cruzou uma ou mais fronteiras de volta entre
 * `prevProgress` e `car.progress` neste frame, interpolando o instante exato
 * do cruzamento dentro do `dt` para manter os tempos precisos mesmo com
 * passo de física fixo.
 */
export function checkLapCompletion(car, prevProgress, newProgress, raceTimeNow, dt, trackLength, totalLaps) {
  if (newProgress <= prevProgress) return;
  while (car.completedLaps < totalLaps) {
    const lapBoundary = (car.completedLaps + 1) * trackLength;
    if (prevProgress >= lapBoundary || newProgress < lapBoundary) break;
    const crossTime = raceTimeNow - dt + (dt * (lapBoundary - prevProgress)) / (newProgress - prevProgress);
    const lapDuration = crossTime - car.lapStarted;
    car.laps.push(lapDuration);
    car.completedLaps++;
    car.lapStarted = crossTime;
    car.lastLap = lapDuration;
    car.bestLap = car.bestLap === null ? lapDuration : Math.min(car.bestLap, lapDuration);
  }
}

/** Formata segundos como "mm:ss.mmm" (tempo de volta). "—" se inválido. */
export function formatLapTime(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const min = Math.floor(totalMs / 60000);
  const sec = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** Formata segundos como "mm:ss.s" (cronômetro geral da corrida, no HUD). */
export function formatRaceClock(seconds) {
  return Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toFixed(1).padStart(4, "0");
}

/** Id do piloto atualmente selecionado no painel de tempos. */
let selectedDriverId = 0;

/** Redesenha a tabela de voltas do piloto selecionado no painel de tempos. */
export function renderLapTimesTable() {
  const driver = state.drivers[selectedDriverId] || state.drivers[0];
  if (!driver) return;
  const lapsLabel = Number.isFinite(state.lapCountRace) ? " / " + state.lapCountRace + " voltas" : " voltas (sem limite)";
  byId("timingSummary").textContent =
    driver.completedLaps + lapsLabel + " · Melhor " + formatLapTime(driver.bestLap);
  byId("lapRows").innerHTML = driver.laps
    .map((lap, i) => {
      const isFastest = lap === driver.bestLap;
      const isInvalid = driver.lapValidity[i] === false;
      const diff = isInvalid ? "INVÁLIDA" : isFastest ? "MELHOR" : "+" + (lap - driver.bestLap).toFixed(3) + " s";
      return (
        '<tr class="' + (isFastest ? "fastest" : "") + (isInvalid ? " invalid" : "") + '"><td>' +
        String(i + 1).padStart(2, "0") + (isFastest ? " ★" : isInvalid ? " ⚠" : "") +
        "</td><td>" + formatLapTime(lap) + "</td><td>" + diff + "</td></tr>"
      );
    })
    .join("");
  setVisible("timingEmpty", driver.laps.length === 0);
}

/** Abre o painel "Tempos de volta" (pausa a corrida automaticamente, se estiver rolando). */
export function openTimesPanel() {
  if (state.gameState === "menu") return;
  state.wasRacingBeforeTimes = state.gameState === "race" || state.gameState === "countdown";
  if (state.wasRacingBeforeTimes) togglePause();
  setVisible("pausePanel", false);
  state.timesPanelOpen = true;

  selectedDriverId = 0;
  byId("timingDriver").innerHTML = state.drivers
    .map((d, i) => '<button type="button" class="option-btn' + (i === 0 ? " selected" : "") +
      '" data-value="' + d.id + '" aria-pressed="' + (i === 0) + '">' + d.name + "</button>")
    .join("");
  wireOptionGroup("timingDriver", (value) => {
    selectedDriverId = Number(value);
    renderLapTimesTable();
  });
  renderLapTimesTable();
  setVisible("timesPanel");
  byId("closeTimes").focus();
}

/** Fecha o painel "Tempos de volta", retomando a corrida ou o menu de pausa conforme o caso. */
export function closeTimesPanel() {
  setVisible("timesPanel", false);
  state.timesPanelOpen = false;
  if (state.wasRacingBeforeTimes && state.gameState === "paused") {
    togglePause();
  } else if (state.gameState === "paused") {
    setVisible("pausePanel");
  }
  state.wasRacingBeforeTimes = false;
}
