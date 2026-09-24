// Captura de entrada: teclado (desktop) e botões de toque (mobile), guardado
// em `state.keys` (mapa tecla => pressionada?). Também cuida de pausar a
// corrida (tecla P/Esc, perda de foco da janela, aba oculta).

import { state } from "./state.js";
import { byId, setVisible } from "./dom.js";
import { recoverCar } from "./player.js";
import { useItem } from "./items.js";
import { openTimesPanel, closeTimesPanel } from "./timing.js";

/** Solta todas as teclas (usado ao pausar/perder foco, para não "grudar" uma tecla). */
export function resetKeys() {
  for (const key in state.keys) state.keys[key] = false;
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
    if (e.key === " ") useItem(state.player);
    if (["p", "P", "Escape"].includes(e.key)) togglePause();
    if (["r", "R"].includes(e.key) && state.gameState === "race") recoverCar(state.player);
    if (["c", "C"].includes(e.key) && state.gameState !== "menu") byId("cameraMode").click();
  }
}

/** Registra todos os listeners de teclado/toque/foco. Chamar uma única vez na inicialização. */
export function attachInputHandlers() {
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", (e) => (state.keys[e.key] = false));
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
