// Captura de entrada: teclado (desktop) e botões de toque (mobile), guardado
// em `state.keys` (mapa tecla => pressionada?). Também cuida de pausar a
// corrida (tecla P/Esc, perda de foco da janela, aba oculta).

import { state } from "./state.js";
import { byId, setVisible, showNotice } from "./dom.js";
import { recoverCar, resolveLaunch } from "./player.js";
import { useItem } from "./items.js";
import { openTimesPanel, closeTimesPanel } from "./timing.js";
import { queueGearShift } from "./betaPowertrain.js";
import { getSettings, updateSettings } from "./betaSettings.js";

/** Solta todas as teclas (usado ao pausar/perder foco, para não "grudar" uma tecla). */
export function resetKeys() {
  for (const key in state.keys) state.keys[key] = false;
  if (state.player) state.player.betaShiftQueue = 0;
}

/** Pede uma troca de marcha (+1 sobe, −1 desce). No automático só avisa como mudar para o manual. */
export function requestGearShift(direction) {
  if (!state.graphicsBeta || !["race", "countdown"].includes(state.gameState)) return;
  if (getSettings().transmission === "manual") queueGearShift(state.player, direction);
  else showNotice("CÂMBIO AUTOMÁTICO · TECLA G PARA O MANUAL");
}

/** Alterna câmbio automático/manual (tecla G e botão do menu). */
export function toggleTransmission() {
  if (!state.graphicsBeta) return;
  const manual = getSettings().transmission !== "manual";
  updateSettings({ transmission: manual ? "manual" : "auto" });
  showNotice(manual ? "CÂMBIO MANUAL · H REDUZ · J SOBE" : "CÂMBIO AUTOMÁTICO");
}

/** Alterna entre corrida/contagem regressiva e pausado. */
export function togglePause() {
  if (state.gameState === "race" || state.gameState === "countdown") {
    state.pausedFromState = state.gameState;
    state.gameState = "paused";
    resetKeys();
    setVisible("pausePanel");
    // O botão "Encerrar contra-relógio" só faz sentido nesse modo (nas
    // corridas normais, o jeito de sair é "VOLTAR AO GRID").
    setVisible("finishTimeTrial", state.timeTrial);
  } else if (state.gameState === "paused") {
    state.gameState = state.pausedFromState;
    setVisible("pausePanel", false);
  }
}

function handleKeyDown(e) {
  // Nenhum atalho de jogo faz sentido na tela de abertura, nem durante o
  // replay cinematográfico (T abriria o painel de tempos por cima da
  // câmera do replay; C mostraria um aviso de câmera que não existe ali —
  // a câmera do replay é fixa, controlada por replay.js).
  if (state.gameState === "landing" || state.gameState === "replay") return;
  if (e.repeat && ["t", "T", "p", "P", "c", "C", "Escape"].includes(e.key)) return;

  if (state.timesPanelOpen) {
    if (["Escape", "t", "T", "p", "P"].includes(e.key)) {
      e.preventDefault();
      closeTimesPanel();
    }
    return;
  }

  if (["t", "T"].includes(e.key) && state.gameState !== "menu") {
    e.preventDefault();
    openTimesPanel();
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key) && state.gameState !== "menu") {
    e.preventDefault();
  }

  if (!e.repeat) {
    state.keys[e.key] = true;
    // Na contagem regressiva, ESPAÇO é a "embreagem" (ver resolveLaunch em
    // player.js, disparada no keyup) — não usa item aí (nem faria sentido,
    // ninguém tem item antes da corrida começar).
    if (e.key === " " && state.gameState === "race") useItem(state.player);
    if (["p", "P", "Escape"].includes(e.key)) togglePause();
    if (["r", "R"].includes(e.key) && state.gameState === "race") recoverCar(state.player);
    if (["c", "C"].includes(e.key) && state.gameState !== "menu") byId("cameraMode").click();
    if (["j", "J"].includes(e.key)) requestGearShift(1);
    if (["h", "H"].includes(e.key)) requestGearShift(-1);
    if (["g", "G"].includes(e.key) && ["race", "countdown"].includes(state.gameState)) toggleTransmission();
  }
}

/** Registra todos os listeners de teclado/toque/foco. Chamar uma única vez na inicialização. */
export function attachInputHandlers() {
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", (e) => {
    state.keys[e.key] = false;
    if (e.key === " " && state.gameState === "countdown") resolveLaunch();
  });
  addEventListener("blur", () => {
    resetKeys();
    if (["race", "countdown"].includes(state.gameState)) togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && ["race", "countdown"].includes(state.gameState)) togglePause();
  });

  document.querySelectorAll("[data-key]").forEach((btn) => {
    btn.onpointerdown = (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      state.keys[btn.dataset.key] = true;
      btn.classList.add("pressed");
      if (btn.dataset.shift) requestGearShift(Number(btn.dataset.shift));
    };
    btn.onpointerup = btn.onpointercancel = () => {
      state.keys[btn.dataset.key] = false;
      btn.classList.remove("pressed");
    };
    btn.onlostpointercapture = () => {
      state.keys[btn.dataset.key] = false;
      btn.classList.remove("pressed");
    };
  });
}
