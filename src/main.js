// Ponto de entrada do jogo. Faz a carga inicial (traçado + elevação),
// constrói a cena, liga toda a interatividade (menu, teclado/touch) e roda
// o loop principal (requestAnimationFrame): contagem regressiva, física em
// passo fixo (120 Hz), câmera, HUD e renderização.

import { state } from "./state.js";
import { applyCircuitProfile } from "./circuits.js";
import { byId, setVisible, tickNotice, showNotice } from "./dom.js";
import { buildTrackModel } from "./track.js";
import { buildScene, resizeRenderer } from "./scene.js";
import { setupGrid, applyRenderInterpolation } from "./car.js";
import { setupItemBoxes, advanceSimulation, endTimeTrial } from "./simulation.js";
import { updateCamera } from "./camera.js";
import { startReplay, stopReplay, updateReplay, seekReplay, toggleReplayPlayPause, cycleReplayCamera } from "./replay.js";
import { updateHud, setupMenuUI, updateLapCountUI, updateCircuitInfoUI, wireOptionGroup, openLeaderboardPanel, closeLeaderboardPanel } from "./ui.js";
import { attachInputHandlers, resetKeys, togglePause } from "./input.js";
import { openTimesPanel, closeTimesPanel } from "./timing.js";
import { recoverCar } from "./player.js";
import { useItem } from "./items.js";
import { engineAudio, beep, syncEngineAudioEnabled } from "./audio.js";
import { disposeObject3D } from "./materials.js";

/** Resultado da classificação (1 volta): ordem de largada da PRÓXIMA
 * corrida, consumido (zerado) assim que usado — ver startRace/finishQualifying. */
let qualifyingGridOrder = null;
/** Nº de voltas que o jogador realmente escolheu, guardado enquanto a
 * sessão de classificação (sempre 1 volta) está rolando. */
let qualifyingTargetLaps = null;

/** Inicia uma nova corrida a partir do menu (ou reinicia após o fim de uma). */
function startRace() {
  if (!state.track) return; // pista ainda não carregou
  updateLapCountUI(byId("lapCount").value);

  // Classificação ativada: a largada vinda do botão "COMEÇAR CORRIDA" é na
  // verdade a sessão de 1 volta que define o grid — guarda o nº de voltas
  // real e larga com state.qualifying=true (sem itens, sem limite normal de
  // voltas). Quando essa sessão termina, finishQualifying() (em animate())
  // chama startRace() de novo, já com state.qualifying=false e
  // `qualifyingGridOrder` preenchido — é ISSO que diferencia essa segunda
  // chamada da primeira (senão, como o toggle continua ligado, a corrida de
  // verdade dispararia OUTRA classificação, num loop infinito).
  const hasQualifyingResult = qualifyingGridOrder !== null;
  if (state.qualifyingEnabled && !state.timeTrial && !state.qualifying && !hasQualifyingResult) {
    qualifyingTargetLaps = state.lapCountSetting;
    state.qualifying = true;
  }

  // No contra-relógio não há limite de voltas: o jogador dirige até decidir
  // encerrar (botão "Encerrar contra-relógio" no menu de pausa).
  state.lapCountRace = state.qualifying ? 1 : state.timeTrial ? Infinity : state.lapCountSetting;
  state.timesPanelOpen = false;
  setVisible("timesPanel", false);

  // O resultado da classificação só vale para ESTA largada (a corrida de
  // verdade que vem depois dela) — consumido aqui, não sobrevive a um
  // "CORRER DE NOVO" sem reclassificar.
  const gridOrderForThisRace = state.qualifying ? null : qualifyingGridOrder;
  qualifyingGridOrder = null;
  setupGrid(gridOrderForThisRace);
  setupItemBoxes();

  // Classificação de verdade é o jogador SOZINHO na pista (como o
  // contra-relógio) — os bots continuam correndo a própria volta por
  // trás dos panos (mesma física/IA de sempre, pra ter um tempo realista
  // e formar o grid depois), só não aparecem nem colidem: ficam ocultos
  // (ver minimap.js, que já pula carros escondidos) e resolveCarCollisions
  // é pulado inteiro durante a classificação (ver simulation.js).
  if (state.qualifying) {
    for (const car of state.drivers) car.group.visible = car.isHuman;
  }

  // Replay cinematográfico: começa a gravar do zero a cada largada (a
  // classificação também grava a própria volta, mas ela é descartada aqui
  // quando a corrida de verdade começa de fato).
  state.replayFrames = [];
  state.replayTimer = 0;

  state.raceTime = 0;
  state.countdown = 3.6;
  state.gameState = "countdown";
  resetKeys();
  // (o estado de drift/câmera é zerado automaticamente: setupGrid() acima
  // já cria carros novos com esses campos zerados — ver car.js)

  document.body.classList.remove("configuring");
  document.body.classList.add("racing");
  setVisible("game");
  setVisible("aside", false);
  setVisible("start", false);
  setVisible("stageBottom", false);
  setVisible("finish", false);
  setVisible("pausePanel", false);
  setVisible("hud");
  setVisible("instruments");
  setVisible("touch");
  setVisible("miniMap");
  setVisible("countdown");
  setVisible("raceProgress");
  setVisible("lapTelemetry");
  setVisible("miniStandings", !state.timeTrial && !state.qualifying);
  setVisible("attackWarning", false);
  byId("raceStatus").textContent = state.qualifying
    ? "CLASSIFICAÇÃO · 1 VOLTA DEFINE O GRID"
    : state.timeTrial
      ? "CONTRA-RELÓGIO · SEM LIMITE DE VOLTAS"
      : state.lapCountRace + " VOLTAS · CORRIDA ARCADE";
  if (state.soundOn) syncEngineAudioEnabled(state.soundOn);
  resizeRenderer();
}

/**
 * Fecha a sessão de classificação: ordena os pilotos pelo tempo da volta
 * única (quem não terminou fica por último) e larga a corrida de verdade
 * já com esse grid. Chamada por animate() quando detecta que a
 * classificação acabou (todo mundo terminou, ou o tempo limite passou).
 */
function finishQualifying() {
  const order = [...state.drivers]
    .sort((a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity))
    .map((car) => car.id);
  qualifyingGridOrder = order;
  state.lapCountSetting = qualifyingTargetLaps;
  qualifyingTargetLaps = null;
  state.qualifying = false;
  const pole = state.drivers[order[0]];
  if (pole) showNotice((pole.isHuman ? "VOCÊ" : pole.name.toUpperCase()) + " NA POLE POSITION!");
  startRace();
}

/**
 * Passo 2 do fluxo pré-corrida: sai da tela de abertura ("landing", dentro
 * de `.game`, com a cena 3D ao fundo) e mostra a configuração — uma tela
 * cheia própria (`<aside>` reestilizada, sem nenhuma cena 3D/preview),
 * escondendo por completo a seção do jogo.
 */
function goToConfigStep() {
  state.gameState = "menu";
  document.body.classList.add("configuring");
  setVisible("game", false);
  setVisible("aside");
}

/** Passo 1: volta da configuração para a tela de abertura (só faz sentido a partir do passo 2). */
function backToLandingStep() {
  if (state.gameState !== "menu") return;
  state.gameState = "landing";
  document.body.classList.remove("configuring");
  setVisible("aside", false);
  setVisible("game");
  setVisible("start"); // pode ter sido escondido por uma corrida anterior (startRace())
  setVisible("stageBottom");
}

/** Volta à configuração de corrida (encerra a corrida atual sem completá-la, passo 3 -> passo 2). */
function returnToMenu() {
  // Se o jogador saiu no meio da própria sessão de classificação (em vez de
  // deixá-la terminar naturalmente), desfaz o estado dela por completo —
  // senão o nº de voltas escolhido ficaria "perdido" em qualifyingTargetLaps.
  if (state.qualifying) {
    state.lapCountSetting = qualifyingTargetLaps ?? state.lapCountSetting;
    qualifyingTargetLaps = null;
    state.qualifying = false;
  }
  qualifyingGridOrder = null;
  state.gameState = "menu";
  state.timesPanelOpen = false;
  state.wasRacingBeforeTimes = false;
  resetKeys();
  document.body.classList.remove("racing");
  document.body.classList.add("configuring");
  setVisible("game", false);
  setVisible("aside");
  for (const id of ["finish", "pausePanel", "hud", "instruments", "touch", "miniMap", "countdown", "raceProgress", "attackWarning", "lapTelemetry", "timesPanel", "miniStandings"]) {
    setVisible(id, false);
  }
  byId("raceStatus").textContent = "PRONTO PARA LARGAR";
  byId("driftFlash").classList.remove("active");
  if (state.player) state.player.cameraInitialized = false;
  resizeRenderer();
}

/**
 * Liga a barra de progresso do replay (arrastar/clicar pula pra qualquer
 * ponto da gravação, que nem um player de vídeo) via Pointer Events — cobre
 * mouse e touch com o mesmo código, sem precisar de um <input type="range">
 * nativo (ver convenção de controles customizados do projeto).
 */
function wireReplayScrubber() {
  const track = byId("replayScrubTrack");
  let dragging = false;
  const seekFromEvent = (e) => {
    const rect = track.getBoundingClientRect();
    seekReplay((e.clientX - rect.left) / rect.width);
  };
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    seekFromEvent(e);
  });
  window.addEventListener("pointermove", (e) => {
    if (dragging) seekFromEvent(e);
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
  });
}

/** Liga os botões que não são de configuração de menu (ver ui.js para esses). */
function wireLifecycleButtons() {
  byId("recover").onclick = () => {
    if (state.gameState === "race") recoverCar();
  };
  byId("startRace").onclick = startRace;
  byId("again").onclick = startRace;
  byId("back").onclick = returnToMenu;
  byId("exit").onclick = returnToMenu;
  byId("pause").onclick = togglePause;
  byId("resume").onclick = togglePause;
  byId("finishTimeTrial").onclick = () => {
    if (state.timeTrial && state.gameState === "paused") endTimeTrial();
  };
  byId("useItem").onclick = () => useItem();
  byId("viewTimes").onclick = byId("pausedTimes").onclick = byId("resultTimes").onclick = openTimesPanel;
  byId("closeTimes").onclick = closeTimesPanel;
  byId("viewLeaderboard").onclick = openLeaderboardPanel;
  byId("closeLeaderboard").onclick = closeLeaderboardPanel;
  byId("viewReplay").onclick = startReplay;
  byId("skipReplay").onclick = stopReplay;
  byId("replayPlayPause").onclick = toggleReplayPlayPause;
  byId("replayCameraMode").onclick = cycleReplayCamera;
  wireReplayScrubber();
  wireOptionGroup("circuit", (value) => {
    loadCircuit(value);
  }, { guardMenu: true });

  byId("goToConfig").onclick = goToConfigStep;
  byId("landingLeaderboard").onclick = openLeaderboardPanel;
  byId("backToLanding").onclick = backToLandingStep;
  byId("brandHome").onclick = backToLandingStep;
}

const FIXED_STEP = 1 / 120;
let physicsAccumulator = 0;
let hudAccumulator = 0;

/** Loop principal (requestAnimationFrame): contagem, física fixa, câmera, HUD, render. */
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.25, Math.max(0, (now - state.lastFrameTime) / 1000) || .016);
  state.lastFrameTime = now;
  if (state.gameState !== "paused") state.clockTime += dt;

  if (state.gameState === "countdown") {
    const prevCeil = Math.ceil(state.countdown);
    state.countdown -= dt;
    const newCeil = Math.ceil(state.countdown);
    byId("countdown").textContent = state.countdown > 0 ? newCeil : "VAI!";
    if (newCeil !== prevCeil) beep(newCeil > 0 ? 450 : 900, .15);
    if (state.countdown < -.7) {
      state.gameState = "race";
      setVisible("countdown", false);
    }
  }

  if (state.gameState === "race") {
    physicsAccumulator += dt;
    while (physicsAccumulator >= FIXED_STEP && state.gameState === "race") {
      advanceSimulation(FIXED_STEP);
      physicsAccumulator -= FIXED_STEP;
    }
  } else {
    physicsAccumulator = 0;
  }

  // Classificação: termina quando todo mundo já cruzou a linha na volta
  // única, ou depois de um tempo limite generoso (carro travado/preso não
  // deve segurar a largada da corrida de verdade para sempre).
  if (state.qualifying && state.gameState === "race" &&
      (state.drivers.every((car) => car.finish) || state.raceTime > 90)) {
    finishQualifying();
  }

  // Interpola visualmente cada carro entre o último tick de física completo
  // e o atual (fração `physicsAccumulator/FIXED_STEP` ainda não simulada).
  // Sem isso, o carro só se move em "saltos" de 120 Hz e a câmera externa
  // (que segue suave a cada frame) parece "bumping"/travando nele.
  applyRenderInterpolation(state.gameState === "race" ? physicsAccumulator / FIXED_STEP : 1);

  if (state.gameState !== "paused") {
    tickNotice(dt);
    // Durante o replay, uma câmera cinematográfica dedicada assume o
    // controle (ver replay.js) em vez da câmera normal de corrida/menu.
    if (state.gameState === "replay") updateReplay(dt);
    else updateCamera(dt);
  }

  hudAccumulator += dt;
  if (hudAccumulator > .09 && state.gameState !== "menu" && state.gameState !== "landing") {
    updateHud();
    hudAccumulator = 0;
  }

  engineAudio.update(state.player, state.gameState === "race", state.player.wasDrifting);
  state.renderer.render(state.scene, state.camera);
}

/**
 * Carrega um circuito (busca GeoJSON + elevação, aplica o perfil de tabelas,
 * (re)constrói a cena e o grid) e inicia o loop principal se ainda não
 * estiver rodando. Chamado na inicialização e ao trocar de circuito no menu.
 */
async function loadCircuit(circuitId) {
  const isFirstLoad = !state.track;
  try {
    byId("startRace").disabled = true;
    const circuit = applyCircuitProfile(circuitId);
    state.circuitId = circuitId;
    byId("startRace").textContent = "PREPARANDO " + circuit.label.toUpperCase() + "…";

    const geoRes = await fetch(circuit.geojsonPath);
    if (!geoRes.ok) throw new Error("Pista indisponível");
    const elevationRes = await fetch(circuit.elevationPath);
    if (!elevationRes.ok) throw new Error("Elevação indisponível");

    if (!isFirstLoad) disposeObject3D(state.scene); // limpa a cena do circuito anterior
    state.track = buildTrackModel(await geoRes.json(), await elevationRes.json());
    buildScene();
    setupGrid();
    updateCircuitInfoUI(circuit);

    byId("startRace").disabled = false;
    byId("startRace").innerHTML = 'COMEÇAR CORRIDA <span>↗</span>';
    if (isFirstLoad) requestAnimationFrame(animate);
  } catch (err) {
    console.error(err);
    byId("startRace").textContent = "RECARREGAR";
    byId("startRace").disabled = false;
    byId("startRace").onclick = () => location.reload();
    byId("start").querySelector("p").textContent =
      "Não foi possível abrir a pista. Verifique se a aceleração gráfica está ativada e tente novamente.";
  }
}

setupMenuUI();
wireLifecycleButtons();
attachInputHandlers();
loadCircuit(state.circuitId);
