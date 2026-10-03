import {
  FOV_RANGE,
  QUALITY_PRESETS,
  RACE_LAPS_RANGE,
  SPEED_UNITS,
  getSettings,
  onSettingsChange,
  updateSettings,
} from "./betaSettings.js";
import { feedbackUrl } from "./betaDiagnostics.js";

/**
 * Menu da 2.0 antes da largada (e durante a pausa): controles, ajustes e aviso
 * legal, no mesmo estilo da HUD. O DOM é montado uma vez; valores dinâmicos
 * entram por `textContent` ou propriedades, nunca como HTML.
 */

const CONTROLS = [
  ["↑  W", "Acelerar"],
  ["↓  S", "Frear"],
  ["←  →   A  D", "Esterçar"],
  ["J", "Subir marcha (câmbio manual)"],
  ["H", "Reduzir marcha (câmbio manual)"],
  ["G", "Alternar câmbio automático / manual"],
  ["ESPAÇO", "Segure na contagem e solte no apagão"],
  ["R", "Voltar ao centro da pista"],
  ["P  ESC", "Pausar"],
  ["T", "Tempos de volta"],
];

const GUIDE_LEGEND = [
  ["go", "VERDE", "acelere"],
  ["lift", "AMARELO", "alivie o pé"],
  ["brake", "VERMELHO", "freie"],
];

const TIPS = [
  "O DRS abre sozinho nas zonas marcadas e solta ao frear.",
  "Câmbio manual: suba com J perto das luzes de troca; H reduz, mas é recusado se o motor passaria do limite.",
  "Sair dos limites da pista invalida a volta (a HUD fica vermelha). No contra-relógio, só voltas válidas entram no ranking 2.0.",
  "No celular, use os botões na tela. Gire o aparelho para ver mais pista.",
];

const SEGMENTS = {
  mode: [
    ["race", "CORRIDA"],
    ["timeTrial", "CONTRA-RELÓGIO"],
  ],
  difficulty: [
    ["rookie", "ESTREANTE"],
    ["sport", "COMPETIDOR"],
    ["pro", "VETERANO"],
  ],
  quality: Object.entries(QUALITY_PRESETS).map(([value, preset]) => [value, preset.label]),
  time: [
    ["day", "DIA"],
    ["sunset", "PÔR DO SOL"],
  ],
  units: Object.entries(SPEED_UNITS).map(([value, unit]) => [value, unit.label]),
  transmission: [
    ["auto", "AUTOMÁTICO"],
    ["manual", "MANUAL"],
  ],
  guide: [
    [true, "LIGADO"],
    [false, "DESLIGADO"],
  ],
};

let root = null;
let mode = "launch";
let onConfirm = null;
let onClose = null;
let detachKeys = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function segmented(key, label) {
  const row = el("div", "bm-field");
  row.append(el("span", "bm-label", label));
  const group = el("div", "bm-segments");
  group.dataset.key = key;
  for (const [value, text] of SEGMENTS[key]) {
    const button = el("button", "bm-seg", text);
    button.type = "button";
    button.dataset.value = String(value);
    button.addEventListener("click", () => updateSettings({ [key]: typeof value === "boolean" ? value : value }));
    group.append(button);
  }
  row.append(group);
  return row;
}

function slider(key, label, min, max, step, format) {
  const row = el("div", "bm-field");
  row.append(el("span", "bm-label", label));
  const wrap = el("div", "bm-slider");
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.dataset.key = key;
  input.setAttribute("aria-label", label);
  const output = el("output");
  input.addEventListener("input", () => {
    updateSettings({ [key]: Number(input.value) });
    output.textContent = format(Number(input.value));
  });
  wrap.append(input, output);
  row.append(wrap);
  return row;
}

/** Seletor − N + do número de voltas da corrida. */
function lapStepper() {
  const row = el("div", "bm-field");
  row.dataset.raceOnly = "";
  row.append(el("span", "bm-label", "VOLTAS"));
  const wrap = el("div", "bm-stepper");
  const step = (delta) => updateSettings({ laps: getSettings().laps + delta });
  const less = el("button", "bm-seg", "−");
  less.type = "button";
  less.dataset.step = "-1";
  less.setAttribute("aria-label", "Menos voltas");
  less.addEventListener("click", () => step(-1));
  const value = el("output", "bm-laps");
  const more = el("button", "bm-seg", "+");
  more.type = "button";
  more.dataset.step = "1";
  more.setAttribute("aria-label", "Mais voltas");
  more.addEventListener("click", () => step(1));
  wrap.append(less, value, more);
  row.append(wrap);
  return row;
}

/** Linha de subtítulo do menu: "INTERLAGOS · CORRIDA · 5 VOLTAS". */
function sessionLabel(settings) {
  if (settings.mode === "timeTrial") return "INTERLAGOS · CONTRA-RELÓGIO · RANKING 2.0";
  return `INTERLAGOS · CORRIDA · ${settings.laps} ${settings.laps === 1 ? "VOLTA" : "VOLTAS"}`;
}

function build() {
  root = el("div", "bm");
  root.id = "betaMenu";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "bmTitle");
  root.hidden = true;

  const panel = el("div", "bm-panel");

  const head = el("div", "bm-head");
  head.append(el("b", "bm-badge", "2.0 BETA"));
  const title = el("h2", "", "PREPARAÇÃO");
  title.id = "bmTitle";
  head.append(title, el("span", "bm-sub", ""));
  panel.append(head);

  const body = el("div", "bm-body");

  const session = el("section", "bm-col bm-session");
  session.append(el("h3", "", "SESSÃO"));
  const difficulty = segmented("difficulty", "ADVERSÁRIOS");
  difficulty.dataset.raceOnly = "";
  session.append(segmented("mode", "MODO"), lapStepper(), difficulty);
  const sessionNote = el("p", "bm-note");
  session.append(sessionNote);

  const controls = el("section", "bm-col");
  controls.append(el("h3", "", "CONTROLES"));
  const list = el("dl", "bm-controls");
  for (const [keys, action] of CONTROLS) {
    list.append(el("dt", "", keys), el("dd", "", action));
  }
  controls.append(list);
  const tips = el("ul", "bm-tips");
  for (const tip of TIPS) tips.append(el("li", "", tip));
  controls.append(tips);
  const legend = el("div", "bm-guide");
  legend.append(el("span", "bm-label", "GUIA NA PISTA"));
  for (const [tone, name, meaning] of GUIDE_LEGEND) {
    const item = el("span", `bm-guide-item ${tone}`);
    item.append(el("i"), el("b", "", name), document.createTextNode(" " + meaning));
    legend.append(item);
  }
  controls.append(legend);

  const settings = el("section", "bm-col");
  settings.append(el("h3", "", "AJUSTES"));
  settings.append(
    segmented("quality", "QUALIDADE"),
    segmented("time", "HORÁRIO"),
    segmented("transmission", "CÂMBIO"),
    slider("fov", "CAMPO DE VISÃO", FOV_RANGE[0], FOV_RANGE[1], 1, (v) => v + "°"),
    slider("shake", "BALANÇO DA CÂMERA", 0, 100, 5, (v) => v + "%"),
    segmented("units", "VELOCIDADE"),
    segmented("guide", "GUIA DE PILOTAGEM"),
  );
  const skip = el("label", "bm-check");
  const skipInput = el("input");
  skipInput.type = "checkbox";
  skipInput.dataset.key = "skipIntro";
  skipInput.addEventListener("change", () => updateSettings({ skipIntro: skipInput.checked }));
  skip.append(skipInput, el("span", "", "Não mostrar este menu antes de largar"));
  settings.append(skip);

  body.append(session, controls, settings);
  panel.append(body);

  const loading = el("div", "bm-loading");
  loading.hidden = true;
  loading.append(el("span", "bm-loading-label", "PREPARANDO"));
  const bar = el("div", "bm-loading-bar");
  bar.append(el("i"));
  loading.append(bar);
  panel.append(loading);

  const foot = el("div", "bm-foot");
  const legal = el(
    "p",
    "bm-legal",
    "Formula Rush é um projeto de fãs, sem vínculo com a Formula 1, a FIA ou qualquer equipe. Nomes e marcas pertencem aos seus donos; o visual apenas se inspira nas transmissões de F1.",
  );
  const credit = el("p", "bm-legal bm-credit");
  const creditLink = el("a", "", "F1 2022 {FREE!!}");
  creditLink.href = "https://sketchfab.com/3d-models/f1-2022-free-013c9e89d2244e37924031dfe4ccf4c3";
  creditLink.target = "_blank";
  creditLink.rel = "noopener noreferrer";
  const licenseLink = el("a", "", "CC BY 4.0");
  licenseLink.href = "https://creativecommons.org/licenses/by/4.0/";
  licenseLink.target = "_blank";
  licenseLink.rel = "noopener noreferrer";
  credit.append("Modelo do carro: ", creditLink, " por 3dblenderlol, ", licenseLink, ". Reescalado, recolorido e adaptado ao cockpit do jogo.");
  const legalBox = el("div", "bm-legal-box");
  legalBox.append(legal, credit);
  const actions = el("div", "bm-actions");
  const feedback = el("a", "bm-link", "ENVIAR FEEDBACK");
  feedback.target = "_blank";
  feedback.rel = "noopener noreferrer";
  feedback.addEventListener("click", () => {
    feedback.href = feedbackUrl({
      base: import.meta.env?.VITE_FEEDBACK_URL,
      settings: getSettings(),
      env: {
        screen: `${screen.width}x${screen.height}`,
        pixelRatio: window.devicePixelRatio,
        userAgent: navigator.userAgent,
      },
    });
  });
  feedback.href = "#";
  const confirm = el("button", "bm-go", "LARGAR");
  confirm.type = "button";
  confirm.id = "bmConfirm";
  confirm.addEventListener("click", () => onConfirm?.());
  actions.append(feedback, confirm);
  foot.append(legalBox, actions);
  panel.append(foot);

  root.append(panel);
  document.body.append(root);
  onSettingsChange(() => {
    if (!root.hidden) syncControls();
  });
}

function syncControls() {
  const settings = getSettings();
  root.querySelectorAll(".bm-segments").forEach((group) => {
    group.querySelectorAll(".bm-seg").forEach((button) => {
      const active = button.dataset.value === String(settings[group.dataset.key]);
      button.classList.toggle("on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  });
  root.querySelectorAll('input[type="range"]').forEach((input) => {
    input.value = String(settings[input.dataset.key]);
    input.nextElementSibling.textContent = settings[input.dataset.key] + (input.dataset.key === "fov" ? "°" : "%");
  });
  root.querySelector('input[type="checkbox"]').checked = settings.skipIntro;
  root.querySelector(".bm-laps").textContent = String(settings.laps);
  root.querySelector('[data-step="-1"]').disabled = settings.laps <= RACE_LAPS_RANGE[0];
  root.querySelector('[data-step="1"]').disabled = settings.laps >= RACE_LAPS_RANGE[1];
  const race = settings.mode === "race";
  root.querySelectorAll("[data-race-only]").forEach((row) => (row.hidden = !race));
  root.querySelector(".bm-note").textContent = race
    ? "Você contra 9 pilotos da IA, largando do fundo do grid. Corridas não entram no ranking."
    : "Sozinho na pista, sem limite de voltas. Cada volta válida (dentro dos limites) vale para o ranking 2.0.";
  root.querySelector(".bm-sub").textContent = mode === "pause" ? "AJUSTES DURANTE A SESSÃO" : sessionLabel(settings);
  // A sessão só se escolhe antes da largada.
  root.querySelector(".bm-session").hidden = mode === "pause";
}

function trapKeys() {
  const handler = (event) => {
    if (root.hidden) return;
    if (["Escape", "p", "P"].includes(event.key) && mode === "pause") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeBetaMenu();
      return;
    }
    // Teclas de jogo não devem agir por trás do menu.
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "r", "R", "t", "T"].includes(event.key) && event.target?.tagName !== "INPUT") {
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}

/**
 * Abre o menu. `launch` mostra "LARGAR" (chama `confirm`); `pause` mostra
 * "VOLTAR" e fecha por conta própria (chama `close`).
 */
export function openBetaMenu({ mode: nextMode = "launch", confirm, close } = {}) {
  if (!root) build();
  mode = nextMode;
  onConfirm = () => {
    if (mode === "pause") closeBetaMenu();
    else confirm?.();
  };
  onClose = close ?? null;
  root.querySelector("#bmTitle").textContent = mode === "pause" ? "AJUSTES" : "PREPARAÇÃO";
  root.querySelector("#bmConfirm").textContent = mode === "pause" ? "VOLTAR" : "LARGAR";
  root.querySelector(".bm-loading").hidden = true;
  root.querySelector(".bm-body").hidden = false;
  root.querySelector(".bm-foot").hidden = false;
  syncControls();
  root.hidden = false;
  detachKeys?.();
  detachKeys = trapKeys();
  root.querySelector("#bmConfirm").focus({ preventScroll: true });
}

export function closeBetaMenu() {
  if (!root || root.hidden) return;
  root.hidden = true;
  detachKeys?.();
  detachKeys = null;
  const callback = onClose;
  onClose = null;
  callback?.();
}

export function isBetaMenuOpen() {
  return Boolean(root && !root.hidden);
}

/** Troca o menu pela barra de carregamento (a pista é montada de forma síncrona e pesada). */
export function showBetaLoading(percent, label) {
  if (!root || root.hidden) return;
  root.querySelector(".bm-body").hidden = true;
  root.querySelector(".bm-foot").hidden = true;
  const loading = root.querySelector(".bm-loading");
  loading.hidden = false;
  loading.querySelector(".bm-loading-label").textContent = label;
  loading.querySelector("i").style.transform = `scaleX(${Math.min(1, Math.max(0, percent / 100))})`;
}
