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

/**
 * Redesenha as linhas do ranking do circuito ativo. Busca o ranking ONLINE
 * (Supabase) quando configurado, com fallback automático para o local — ver
 * getLeaderboard em leaderboard.js. Mostra um estado de carregamento
 * enquanto a busca online está em andamento (pode levar um instante).
 */
export async function renderLeaderboard() {
  const circuitAtRequest = state.circuitId;
  byId("leaderboardStatus").textContent = "Carregando ranking…";
  byId("leaderboardStatus").classList.remove("online");
  byId("leaderboardRows").innerHTML = "";
  setVisible("leaderboardEmpty", false);

  const { online, entries } = await getLeaderboard(circuitAtRequest);
  if (state.circuitId !== circuitAtRequest) return; // usuário trocou de circuito enquanto isso carregava

  byId("leaderboardStatus").textContent = online
    ? "RANKING ONLINE · GLOBAL ENTRE JOGADORES"
    : "RANKING LOCAL · SALVO SÓ NESTE NAVEGADOR";
  byId("leaderboardStatus").classList.toggle("online", online);
  byId("leaderboardRows").innerHTML = entries
    .map(
      (entry, i) =>
        '<div class="standing"><b>' + String(i + 1).padStart(2, "0") + "</b><span>" +
        entry.name + "</span><span>" + formatLapTime(entry.time) + "</span></div>"
    )
    .join("");
  setVisible("leaderboardEmpty", entries.length === 0);
}

/** Abre o painel de ranking (sempre para o circuito ativo). */
export function openLeaderboardPanel() {
  setVisible("leaderboardPanel");
  renderLeaderboard();
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
  byId("distanceInfo").textContent =
    (TRACK_LENGTH * laps / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) +
    " km · " + laps + (laps === 1 ? " volta" : " voltas");
  byId("fewerLaps").disabled = laps === 1;
  byId("moreLaps").disabled = laps === 20;
}

/** Atualiza os textos informativos do circuito (config em tela cheia + tracklabel durante a corrida). */
export function updateCircuitInfoUI(circuit) {
  byId("circuitKm").textContent = circuit.km;
  byId("circuitTurns").textContent = circuit.turns;
  byId("circuitDirection").textContent = circuit.direction;
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

  // Contra-relógio e classificação são mutuamente exclusivos (um é sozinho
  // na pista, sem sentido pra "definir grid"; o outro precisa dos outros
  // carros pra valer alguma coisa) — ativar um desliga o outro, disparando
  // o clique nele para manter o estado interno de wireToggle consistente.
  wireToggle("timeTrial", (on) => {
    if (state.gameState !== "menu") return;
    state.timeTrial = on;
    if (on && byId("qualifying").getAttribute("aria-pressed") === "true") byId("qualifying").click();
    if (state.track) {
      setupGrid();
      resizeRenderer();
    }
  }, state.timeTrial);

  wireToggle("qualifying", (on) => {
    if (state.gameState !== "menu") return;
    state.qualifyingEnabled = on;
    if (on && byId("timeTrial").getAttribute("aria-pressed") === "true") byId("timeTrial").click();
  }, state.qualifyingEnabled);

  byId("playerName").onchange = (e) => {
    const name = e.target.value.trim().slice(0, 16) || "Você";
    e.target.value = name;
    setPlayerIdentity(name, state.playerNumber);
  };
  byId("playerNumber").onchange = (e) => {
    const number = e.target.value.trim().slice(0, 2) || "07";
    e.target.value = number;
    setPlayerIdentity(state.playerName, number);
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
      if (state.player) state.player.body.color.set(color);
    };
    byId("colors").append(btn);
  });
}

/**
 * Redesenha o painel de "classificação em tempo real" (mini-standings): uma
 * janela de até 5 posições centrada no jogador (2 carros à frente, o
 * jogador, 2 atrás — ajustada nas bordas do grid), com o gap para o líder em
 * metros. Complementa o "GAP À FRENTE" (que só mostra o carro imediatamente
 * na frente) com uma visão mais larga do pelotão. Não faz sentido no
 * contra-relógio (não há outros carros).
 */
function updateMiniStandings(standings, player) {
  if (state.timeTrial || state.qualifying || standings.length < 2) {
    setVisible("miniStandings", false);
    return;
  }
  setVisible("miniStandings", true);
  const leaderProgress = standings[0].progress;
  const windowSize = Math.min(5, standings.length);
  const playerIndex = standings.indexOf(player);
  const start = clamp(playerIndex - 2, 0, standings.length - windowSize);

  byId("miniStandings").innerHTML = standings
    .slice(start, start + windowSize)
    .map((d, i) => {
      const pos = start + i + 1;
      const gap = pos === 1 ? "LÍDER" : "−" + Math.max(0, Math.round(leaderProgress - d.progress)) + " m";
      return (
        '<div class="mini-standing' + (d === player ? " you" : "") + '">' +
        "<b>" + String(pos).padStart(2, "0") + "</b>" +
        '<i style="--c:' + d.color + '"></i>' +
        "<span>" + d.name + "</span>" +
        "<small>" + gap + "</small></div>"
      );
    })
    .join("");
}

/** Atualiza todo o HUD (chamado por main.js a cada ~0.09s durante a corrida). */
export function updateHud() {
  const player = state.player;
  const standings = [...state.drivers].sort((a, b) =>
    a.finish && b.finish ? a.finish - b.finish : a.finish ? -1 : b.finish ? 1 : b.progress - a.progress
  );
  const position = standings.indexOf(player) + 1;
  updateMiniStandings(standings, player);

  byId("position").innerHTML = state.qualifying
    ? '<span style="font-size:.55em">CLASSIFICAÇÃO</span>'
    : state.timeTrial
      ? '<span style="font-size:.55em">CONTRA-RELÓGIO</span>'
      : position + "<span>/" + state.drivers.length + "</span>";
  byId("lap").innerHTML = state.timeTrial
    ? (player.completedLaps + 1) + "<span>VOLTA</span>"
    : Math.min(state.lapCountRace, player.completedLaps + 1) + "<span>/" + state.lapCountRace + "</span>";
  byId("timer").textContent = formatRaceClock(state.raceTime);
  byId("currentLapTime").textContent = formatLapTime(player.finish ? player.lastLap : Math.max(0, state.raceTime - player.lapStarted));
  byId("currentLapTime").classList.toggle("invalid-lap", state.timeTrial && !player.currentLapValid);
  byId("lastLapTime").textContent = formatLapTime(player.lastLap);
  byId("bestLapTime").textContent = formatLapTime(player.bestLap);
  byId("speed").textContent = Math.round(player.speed * 3.6);
  setVisible("drsIndicator", player.drsActive);
  byId("gear").textContent = player.speed < .5 ? "N" : Math.min(8, Math.floor(player.speed * 3.6 / 43) + 1);

  // Gap (em metros) para o carro imediatamente à frente — só faz sentido
  // com outros carros VISÍVEIS na pista (corrida normal; não no
  // contra-relógio nem na classificação, onde o jogador está sozinho).
  if (state.timeTrial || state.qualifying || state.drivers.length < 2) {
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

  // Setores (S1/S2/S3): mostra o tempo dos setores já cruzados NESTA volta
  // (verde se igualou o melhor já feito naquele setor) e um placeholder para
  // os que ainda não chegaram. `sectorsCompleted` é contínuo (não reinicia
  // por volta — ver timing.js), então "quantos setores já fechei nesta
  // volta" é sempre o resto da divisão por 3.
  const doneThisLap = player.sectorsCompleted % 3;
  for (let i = 0; i < 3; i++) {
    const box = byId("sectorBox" + i);
    const done = i < doneThisLap;
    box.textContent = done ? formatLapTime(player.lastSectors[i]).replace(/^00:/, "") : "S" + (i + 1);
    box.classList.toggle("done", done);
    box.classList.toggle("best", done && player.lastSectors[i] === player.bestSectors[i]);
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

  const itemInfo = state.timeTrial || state.qualifying
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
