// Ponto de entrada do jogo. Faz a carga inicial (traçado + elevação),
// constrói a cena, liga toda a interatividade (menu, teclado/touch) e roda
// o loop principal (requestAnimationFrame): contagem regressiva, física em
// passo fixo (120 Hz), câmera, HUD e renderização.

import { state } from "./state.js";
import { applyCircuitProfile } from "./circuits.js";
import { byId, setVisible, tickNotice } from "./dom.js";
import { buildTrackModel } from "./track.js";
import { buildScene, resizeRenderer } from "./scene.js";
import { setupGrid, applyRenderInterpolation } from "./car.js";
import { setupItemBoxes, advanceSimulation, endTimeTrial } from "./simulation.js";
import { updateCamera } from "./camera.js";
import { updateHud, setupMenuUI, updateLapCountUI, updateCircuitInfoUI, wireOptionGroup, openLeaderboardPanel, closeLeaderboardPanel } from "./ui.js";
import { attachInputHandlers, resetKeys, togglePause } from "./input.js";
import { openTimesPanel, closeTimesPanel } from "./timing.js";
import { recoverCar } from "./player.js";
import { useItem } from "./items.js";
import { engineAudio, beep, syncEngineAudioEnabled } from "./audio.js";
import { disposeObject3D } from "./materials.js";

/** Inicia uma nova corrida a partir do menu (ou reinicia após o fim de uma). */
function startRace() {
  if (!state.track) return; // pista ainda não carregou
  updateLapCountUI(byId("lapCount").value);
  // No contra-relógio não há limite de voltas: o jogador dirige até decidir
  // encerrar (botão "Encerrar contra-relógio" no menu de pausa).
  state.lapCountRace = state.timeTrial ? Infinity : state.lapCountSetting;
  state.timesPanelOpen = false;
  setVisible("timesPanel", false);

  setupGrid();
  setupItemBoxes();

  state.raceTime = 0;
  state.countdown = 3.6;
  state.gameState = "countdown";
  resetKeys();
  // (o estado de drift/câmera é zerado automaticamente: setupGrid() acima
  // já cria carros novos com esses campos zerados — ver car.js)

  document.body.classList.add("racing");
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
  setVisible("attackWarning", false);
  byId("raceStatus").textContent = state.timeTrial
    ? "CONTRA-RELÓGIO · SEM LIMITE DE VOLTAS"
    : state.lapCountRace + " VOLTAS · CORRIDA ARCADE";
  if (state.soundOn) syncEngineAudioEnabled(state.soundOn);
  resizeRenderer();
}

/** Volta ao menu principal (encerra a corrida atual sem completá-la). */
function returnToMenu() {
  state.gameState = "menu";
  state.timesPanelOpen = false;
  state.wasRacingBeforeTimes = false;
  resetKeys();
  document.body.classList.remove("racing");
  setVisible("start");
  setVisible("stageBottom");
  for (const id of ["finish", "pausePanel", "hud", "instruments", "touch", "miniMap", "countdown", "raceProgress", "attackWarning", "lapTelemetry", "timesPanel"]) {
    setVisible(id, false);
  }
  byId("raceStatus").textContent = "PRONTO PARA LARGAR";
  byId("driftFlash").classList.remove("active");
  if (state.player) state.player.cameraInitialized = false;
  resizeRenderer();
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
  wireOptionGroup("circuit", (value) => {
    loadCircuit(value);
  }, { guardMenu: true });
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

  // Interpola visualmente cada carro entre o último tick de física completo
  // e o atual (fração `physicsAccumulator/FIXED_STEP` ainda não simulada).
  // Sem isso, o carro só se move em "saltos" de 120 Hz e a câmera externa
  // (que segue suave a cada frame) parece "bumping"/travando nele.
  applyRenderInterpolation(state.gameState === "race" ? physicsAccumulator / FIXED_STEP : 1);

  if (state.gameState !== "paused") {
    tickNotice(dt);
    updateCamera(dt);
  }

  hudAccumulator += dt;
  if (hudAccumulator > .09 && state.gameState !== "menu") {
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
    byId("startRace").innerHTML = 'ENTRAR NA PISTA <span>↗</span>';
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
