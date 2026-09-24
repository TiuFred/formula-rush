// Interface: atualização do HUD durante a corrida (posição, volta, tempo,
// velocidade, item, drift, minimapa...) e a configuração do menu (cores,
// dificuldade, número de voltas, assistência, linha de trajetória, som,
// câmera). O painel de "Tempos de volta" fica em timing.js.

import { state } from "./state.js";
import { TRACK_LENGTH, ITEM_DEFS, DRIVER_COLORS } from "./constants.js";
import { byId, setVisible, showNotice } from "./dom.js";
import { clamp, progressDelta } from "./mathUtils.js";
import { sectorNameAt } from "./track.js";
import { driftLevel } from "./items.js";
import { formatRaceClock, formatLapTime, clampLapCount } from "./timing.js";
import { drawTrackMap } from "./minimap.js";
import { engineAudio, syncEngineAudioEnabled } from "./audio.js";
import { setPlayerIdentity, setupGrid } from "./car.js";
import { getLeaderboard } from "./leaderboard.js";
import { resizeRenderer } from "./scene.js";

/**
 * Liga um grupo de botões de escolha única (`.option-btn` dentro do
 * elemento `id`) como se fosse um <select>: clicar marca ele como
 * "selected"/aria-pressed e desmarca os irmãos, e chama `onSelect(valor)`.
 * Usado para dificuldade, circuito e o seletor de piloto do painel de tempos.
 */
export function wireOptionGroup(id, onSelect, { guardMenu = false } = {}) {
  const group = byId(id);
  const buttons = [...group.querySelectorAll(".option-btn")];
  buttons.forEach((btn) => {
    btn.onclick = () => {
      if (guardMenu && state.gameState !== "menu") return;
      buttons.forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-pressed", b === btn);
      });
      onSelect(btn.dataset.value, btn);
    };
  });
}

/**
 * Liga um botão de alternância (`.toggle-btn`) como se fosse um checkbox:
 * clicar inverte `aria-pressed` e chama `onToggle(ligado?)`.
 */
export function wireToggle(id, onToggle, initial = false) {
  const btn = byId(id);
  let pressed = initial;
  btn.setAttribute("aria-pressed", pressed);
  btn.onclick = () => {
    pressed = !pressed;
    btn.setAttribute("aria-pressed", pressed);
    onToggle(pressed);
  };
}

/** Redesenha as linhas do ranking local para o circuito ativo. */
export function renderLeaderboard() {
  const entries = getLeaderboard(state.circuitId);
  byId("leaderboardRows").innerHTML = entries
    .map(
      (entry, i) =>
        '<div class="standing"><b>' + String(i + 1).padStart(2, "0") + "</b><span>" +
        entry.name + "</span><span>" + formatLapTime(entry.time) + "</span></div>"
    )
    .join("");
  setVisible("leaderboardEmpty", entries.length === 0);
}

/** Abre o painel de ranking local (sempre para o circuito ativo). */
export function openLeaderboardPanel() {
  renderLeaderboard();
  setVisible("leaderboardPanel");
}

/** Fecha o painel de ranking local. */
export function closeLeaderboardPanel() {
  setVisible("leaderboardPanel", false);
}

/** Atualiza o texto/estado do seletor de nº de voltas e o resumo de distância. */
export function updateLapCountUI(value) {
  state.lapCountSetting = clampLapCount(value);
  const laps = state.lapCountSetting;
  byId("lapCount").value = laps;
  byId("startLapCount").textContent = laps + (laps === 1 ? " VOLTA" : " VOLTAS");
  byId("distanceInfo").textContent =
    (TRACK_LENGTH * laps / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) +
    " km · " + laps + (laps === 1 ? " volta" : " voltas");
  byId("fewerLaps").disabled = laps === 1;
  byId("moreLaps").disabled = laps === 20;
}

/** Atualiza os textos do "cartão" do circuito (barra lateral) para o circuito dado. */
export function updateCircuitInfoUI(circuit) {
  byId("circuitTitle").textContent = circuit.label.toUpperCase();
  byId("circuitSubtitle").textContent = circuit.subtitle;
  byId("circuitFullName").textContent = circuit.fullName;
  byId("circuitKm").textContent = circuit.km;
  byId("circuitTurns").textContent = circuit.turns;
  byId("circuitDirection").textContent = circuit.direction;
  byId("circuitHeading").textContent = circuit.label;
  byId("circuitName").textContent = circuit.label.toUpperCase();
  updateLapCountUI(state.lapCountSetting); // "km · voltas" depende do comprimento da pista
}

/** Liga toda a interatividade do menu (cores, dificuldade, voltas, assistências, som, câmera). */
export function setupMenuUI() {
  byId("sound").onclick = async () => {
    state.soundOn = !state.soundOn;
    await syncEngineAudioEnabled(state.soundOn);
    state.soundOn = engineAudio.enabled;
    byId("sound").textContent = state.soundOn ? "SOM ON" : "SOM OFF";
    byId("sound").setAttribute("aria-pressed", state.soundOn);
    byId("sound").setAttribute("aria-label", state.soundOn ? "Desativar som" : "Ativar som");
  };

  wireOptionGroup("difficulty", (value) => {
    state.difficultyKey = value;
  }, { guardMenu: true });

  wireToggle("assists", (on) => {
    state.assistOn = on;
  }, state.assistOn);

  byId("lapCount").onchange = (e) => {
    if (state.gameState === "menu") updateLapCountUI(e.target.value);
  };
  byId("moreLaps").onclick = () => {
    if (state.gameState === "menu") updateLapCountUI(state.lapCountSetting + 1);
  };
  byId("fewerLaps").onclick = () => {
    if (state.gameState === "menu") updateLapCountUI(state.lapCountSetting - 1);
  };

  wireToggle("racingLine", (on) => {
    if (state.racingLineMesh) state.racingLineMesh.visible = on;
  }, true);

  wireToggle("timeTrial", (on) => {
    if (state.gameState !== "menu") return;
    state.timeTrial = on;
    if (state.track) {
      setupGrid();
      resizeRenderer();
    }
  }, state.timeTrial);

  byId("playerName").onchange = (e) => {
    const name = e.target.value.trim().slice(0, 16) || "Você";
    e.target.value = name;
    setPlayerIdentity(name, state.playerNumber);
    byId("driverNameLabel").textContent = name;
  };
  byId("playerNumber").onchange = (e) => {
    const number = e.target.value.trim().slice(0, 2) || "07";
    e.target.value = number;
    setPlayerIdentity(state.playerName, number);
    byId("driverNumberLabel").textContent = number;
  };

  byId("cameraMode").onclick = () => {
    state.cameraMode = 1 - state.cameraMode;
    if (state.player) state.player.cameraInitialized = false;
    showNotice(state.cameraMode ? "CÂMERA A BORDO" : "CÂMERA EXTERNA");
  };

  DRIVER_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "swatch" + (color === state.selectedColor ? " selected" : "");
    btn.style.setProperty("--c", color);
    btn.setAttribute("aria-label", "Cor " + color);
    btn.setAttribute("aria-pressed", color === state.selectedColor);
    btn.onclick = () => {
      if (state.gameState !== "menu") return;
      state.selectedColor = color;
      document.querySelectorAll(".swatch").forEach((el) => {
        el.classList.toggle("selected", el === btn);
        el.setAttribute("aria-pressed", el === btn);
      });
      byId("driverColor").style.background = color;
      if (state.player) state.player.body.color.set(color);
    };
    byId("colors").append(btn);
  });
}

/** Atualiza todo o HUD (chamado por main.js a cada ~0.09s durante a corrida). */
export function updateHud() {
  const player = state.player;
  const standings = [...state.drivers].sort((a, b) =>
    a.finish && b.finish ? a.finish - b.finish : a.finish ? -1 : b.finish ? 1 : b.progress - a.progress
  );
  const position = standings.indexOf(player) + 1;

  byId("position").innerHTML = state.timeTrial
    ? '<span style="font-size:.55em">CONTRA-RELÓGIO</span>'
    : position + "<span>/8</span>";
  byId("lap").innerHTML = state.timeTrial
    ? (player.completedLaps + 1) + "<span>VOLTA</span>"
    : Math.min(state.lapCountRace, player.completedLaps + 1) + "<span>/" + state.lapCountRace + "</span>";
  byId("timer").textContent = formatRaceClock(state.raceTime);
  byId("currentLapTime").textContent = formatLapTime(player.finish ? player.lastLap : Math.max(0, state.raceTime - player.lapStarted));
  byId("currentLapTime").classList.toggle("invalid-lap", state.timeTrial && !player.currentLapValid);
  byId("lastLapTime").textContent = formatLapTime(player.lastLap);
  byId("bestLapTime").textContent = formatLapTime(player.bestLap);
  byId("speed").textContent = Math.round(player.speed * 3.6);
  byId("gear").textContent = player.speed < .5 ? "N" : Math.min(8, Math.floor(player.speed * 3.6 / 43) + 1);

  // Gap (em metros) para o carro imediatamente à frente — só faz sentido
  // com outros carros na pista (corrida normal, não contra-relógio).
  if (state.timeTrial || state.drivers.length < 2) {
    setVisible("gapBox", false);
  } else {
    const carAhead = state.drivers
      .filter((d) => d !== player && d.progress > player.progress)
      .sort((a, b) => a.progress - b.progress)[0];
    setVisible("gapBox", true);
    if (!carAhead) {
      byId("gapLabel").textContent = "LÍDER";
      byId("gapValue").textContent = "—";
    } else {
      byId("gapLabel").textContent = "GAP À FRENTE";
      byId("gapValue").textContent = Math.round(carAhead.progress - player.progress) + " m";
    }
  }

  // Ritmo em tempo real: compara o tempo já gasto nesta volta com o tempo
  // "esperado" na mesma distância da sua melhor volta (previsão de delta,
  // como em jogos de corrida "de verdade"). Só dá pra calcular a partir da
  // 2ª volta em diante (precisa de uma melhor volta de referência).
  if (player.bestLap && !player.finish) {
    const lapFraction = ((player.progress % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH / TRACK_LENGTH;
    const expectedTime = player.bestLap * lapFraction;
    const currentLapElapsed = state.raceTime - player.lapStarted;
    const delta = currentLapElapsed - expectedTime;
    const paceEl = byId("paceDelta");
    paceEl.textContent = (delta > 0 ? "+" : "") + delta.toFixed(2) + " s";
    paceEl.classList.toggle("ahead", delta < 0);
    paceEl.classList.toggle("behind", delta > 0);
  } else {
    const paceEl = byId("paceDelta");
    paceEl.textContent = "—";
    paceEl.classList.remove("ahead", "behind");
  }

  const level = driftLevel(player.driftCharge);
  const driftColor = level >= 3 ? "#c783ff" : level >= 2 ? "#ffc24d" : "#58dfff";
  byId("driftFill").style.width = clamp(player.driftCharge / 2.6 * 100, 0, 100) + "%";
  byId("driftFill").style.background = driftColor;
  byId("driftLabel").textContent = player.boost > 0
    ? "TURBO ATIVO"
    : player.wasDrifting
      ? ["CARREGANDO", "MINITURBO · SOLTE", "SUPER · SOLTE", "ULTRA · SOLTE"][level]
      : "SEGURE SHIFT NAS CURVAS";

  const itemInfo = state.timeTrial
    ? { icon: "—", name: "SEM ITENS" }
    : player.item ? ITEM_DEFS[player.item] : { icon: "◇", name: "PEGUE UMA CAIXA" };
  byId("itemIcon").textContent = itemInfo.icon;
  byId("itemName").textContent = itemInfo.name;
  byId("useItem").disabled = !player.item;

  const gradePercent = state.track.at(player.s).t.y * 100;
  byId("raceStatus").textContent =
    sectorNameAt(player.s) + (Math.abs(gradePercent) > 2 ? " · " + (gradePercent > 0 ? "↗" : "↘") + " " + Math.abs(gradePercent).toFixed(0) + "%" : "");
  byId("raceProgress").firstElementChild.style.width = state.timeTrial
    ? clamp(((player.progress % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH) / TRACK_LENGTH * 100, 0, 100) + "%"
    : clamp(player.progress / (TRACK_LENGTH * state.lapCountRace) * 100, 0, 100) + "%";
  byId("driftFlash").classList.toggle("active", player.boost > 0);

  const underAttack = state.gameState === "race" && state.missiles.some(
    (m) => m.target === player && progressDelta(player.s, m.s, TRACK_LENGTH) > 0 && progressDelta(player.s, m.s, TRACK_LENGTH) < 200
  );
  setVisible("attackWarning", underAttack);
  drawTrackMap(byId("miniMap"), true);

}
