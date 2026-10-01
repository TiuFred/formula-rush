import { state } from "./state.js";
import { byId } from "./dom.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";
import { formatLapTime } from "./timing.js";
import { TRACK_LENGTH } from "./constants.js";
import { speedUnit } from "./betaSettings.js";
import { recordFrame } from "./betaDiagnostics.js";

/**
 * HUD da 2.0 no estilo das transmissões de F1: torre de tempos, faixa de volta,
 * telemetria (velocidade, marcha, acelerador, freio, LEDs de rotação), setores,
 * delta e aviso de volta completada. O DOM é criado uma vez e só recebe texto e
 * estilos quando os valores mudam. Fora da 2.0 nada disso aparece (ver
 * betaHud.css). Nenhum logotipo ou marca registrada da F1 é usado.
 */

const LED_COUNT = 15;
const SECTORS = 3;
const BANNER_SECONDS = 5;

let root = null;
let refs = null;
let cache = new Map();
let trackedPlayer = null;
let tracked = null;

const SKELETON = `
  <div class="f1-tower">
    <div class="f1-tower-head"><b data-ref="circuit">INTERLAGOS</b><span data-ref="session">CONTRA-RELÓGIO</span></div>
    <div class="f1-row you"><i class="f1-pos">1</i><i class="f1-team"></i><b class="f1-tla" data-ref="tla">VOC</b><span class="f1-val" data-ref="current">0:00.000</span></div>
    <div class="f1-row"><i class="f1-pos">—</i><i class="f1-team purple"></i><b class="f1-tla">MELHOR</b><span class="f1-val purple-text" data-ref="best">—</span></div>
    <div class="f1-row"><i class="f1-pos">—</i><i class="f1-team dim"></i><b class="f1-tla">ÚLTIMA</b><span class="f1-val" data-ref="last">—</span></div>
  </div>

  <div class="f1-lapstrip" data-ref="strip"><span class="f1-lapno" data-ref="lapno">VOLTA 1</span><span class="f1-valid" data-ref="valid">VOLTA VÁLIDA</span></div>

  <div class="f1-banner" data-ref="banner" aria-live="polite">
    <div class="f1-banner-title" data-ref="bannerTitle">VOLTA 1</div>
    <div class="f1-banner-time" data-ref="bannerTime">1:12.345</div>
    <div class="f1-banner-delta" data-ref="bannerDelta">—</div>
  </div>

  <div class="f1-telemetry">
    <div class="f1-leds" data-ref="leds"></div>
    <div class="f1-tel-main">
      <div class="f1-gear"><small>MARCHA</small><b data-ref="gear">N</b></div>
      <div class="f1-speed"><b data-ref="speed">0</b><small data-ref="unit">KM/H</small></div>
      <div class="f1-pedals">
        <div class="f1-pedal thr"><small>ACEL</small><div class="f1-bar"><i data-ref="throttle"></i></div></div>
        <div class="f1-pedal brk"><small>FREIO</small><div class="f1-bar"><i data-ref="brake"></i></div></div>
      </div>
      <span class="f1-drs" data-ref="drs">DRS</span>
    </div>
  </div>

  <div class="f1-sectors">
    <div class="f1-sector-bars">
      <div class="f1-sector" data-ref="s0"><span>S1</span><b>—</b></div>
      <div class="f1-sector" data-ref="s1"><span>S2</span><b>—</b></div>
      <div class="f1-sector" data-ref="s2"><span>S3</span><b>—</b></div>
    </div>
    <div class="f1-delta">
      <small>DELTA</small>
      <div class="f1-delta-track"><i class="f1-delta-fill" data-ref="deltaFill"></i><u></u></div>
      <b data-ref="deltaText">—</b>
    </div>
  </div>
`;

function ensure() {
  if (root) return root;
  const host = document.getElementById("game");
  if (!host) return null;
  root = document.createElement("div");
  root.id = "f1hud";
  root.className = "f1-hud";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = SKELETON;
  host.append(root);
  refs = {};
  root.querySelectorAll("[data-ref]").forEach((el) => {
    refs[el.dataset.ref] = el;
  });
  for (let i = 0; i < LED_COUNT; i++) {
    const led = document.createElement("i");
    led.className = i < 5 ? "g" : i < 10 ? "r" : "b";
    refs.leds.append(led);
  }
  return root;
}

function setText(key, text) {
  if (cache.get(key) === text) return;
  cache.set(key, text);
  refs[key].textContent = text;
}

function setClass(key, name, on) {
  const id = key + "." + name;
  if (cache.get(id) === on) return;
  cache.set(id, on);
  refs[key].classList.toggle(name, on);
}

function setStyle(key, prop, value) {
  const id = key + ":" + prop;
  if (cache.get(id) === value) return;
  cache.set(id, value);
  refs[key].style.setProperty(prop, value);
}

/** "1:12.345" no formato de transmissão (sem zero à esquerda nos minutos). */
export function broadcastTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  return formatLapTime(seconds).replace(/^0/, "");
}

/** "+0.234" ou "−0.234" (sinal tipográfico), com três casas. */
export function signedDelta(seconds, digits = 3) {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "";
  return sign + Math.abs(seconds).toFixed(digits);
}

/** Atraso (+) ou adiantamento (−) estimado em relação à melhor volta, na distância já percorrida. */
export function liveDelta(player, raceTime) {
  if (!player.bestLap || player.finish) return null;
  const lapFraction = ((((player.progress % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) / TRACK_LENGTH);
  return raceTime - player.lapStarted - player.bestLap * lapFraction;
}

/** Classe de cor de um setor: pendente, melhor pessoal (verde) ou mais lento (amarelo). */
export function sectorTone(index, doneThisLap, lastSectors, bestSectors) {
  if (index >= doneThisLap) return "pending";
  return lastSectors[index] !== null && lastSectors[index] === bestSectors[index] ? "best" : "slow";
}

function resetFor(player) {
  trackedPlayer = player;
  tracked = { completed: player.completedLaps || 0, previousBest: player.bestLap ?? null, bannerLeft: 0, brake: 0, throttle: 0 };
  cache = new Map();
}

function showBanner(player, previousBest) {
  const lapNo = player.completedLaps;
  const isBest = previousBest === null || player.lastLap < previousBest - 1e-6;
  setText("bannerTitle", "VOLTA " + lapNo + (player.lapValidity?.[lapNo - 1] === false ? " · INVALIDADA" : ""));
  setText("bannerTime", broadcastTime(player.lastLap));
  const text = previousBest === null ? "PRIMEIRA VOLTA" : isBest ? "MELHOR VOLTA · " + signedDelta(player.lastLap - previousBest) : signedDelta(player.lastLap - previousBest);
  setText("bannerDelta", text);
  setClass("banner", "best", isBest && previousBest !== null);
  setClass("banner", "slow", previousBest !== null && !isBest);
  tracked.bannerLeft = BANNER_SECONDS;
}

/** Chamar uma vez por quadro. `dt` em segundos. */
export function updateBetaHud(dt) {
  const visible = state.graphicsBeta && ["countdown", "race", "paused"].includes(state.gameState);
  if (!ensure()) return;
  if (!state.graphicsBeta) {
    if (root.dataset.on) delete root.dataset.on;
    return;
  }
  root.dataset.on = visible ? "1" : "";
  if (!visible) return;

  recordFrame(dt);
  const player = state.player;
  if (!player) return;
  if (player !== trackedPlayer) resetFor(player);

  const raceTime = state.raceTime;
  const lapElapsed = Math.max(0, raceTime - (player.lapStarted || 0));

  // Torre de tempos.
  setText("circuit", byId("circuitName")?.textContent?.split("·")[0].trim() || "INTERLAGOS");
  setText("tla", (state.playerName || "VOCÊ").normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3).toUpperCase());
  setStyle("tla", "--c", player.color || "#dcff59");
  root.style.setProperty("--team", player.color || "#dcff59");
  setText("current", broadcastTime(player.finish ? player.lastLap : lapElapsed));
  setText("best", broadcastTime(player.bestLap ?? null));
  setText("last", broadcastTime(player.lastLap ?? null));
  const invalid = state.timeTrial && player.currentLapValid === false;
  setClass("current", "invalid", invalid);

  // Faixa de volta.
  setText("lapno", "VOLTA " + (player.completedLaps + 1));
  setText("valid", invalid ? "VOLTA INVALIDADA" : "VOLTA VÁLIDA");
  setClass("valid", "invalid", invalid);

  // Volta completada: aviso com tempo e diferença para a melhor anterior.
  if (player.completedLaps > tracked.completed) {
    showBanner(player, tracked.previousBest);
    tracked.previousBest = player.bestLap ?? tracked.previousBest;
  }
  tracked.completed = player.completedLaps;
  if (tracked.bannerLeft > 0) tracked.bannerLeft = Math.max(0, tracked.bannerLeft - dt);
  setClass("banner", "show", tracked.bannerLeft > 0);

  // Telemetria.
  const telemetry = betaPowertrainTelemetry(player);
  const unit = speedUnit();
  setText("speed", String(Math.round(player.speed * unit.factor)));
  setText("unit", unit.label);
  setText("gear", player.speed < 0.5 ? "N" : String(telemetry.gear));
  const brakeTarget = state.keys.ArrowDown || state.keys.s || state.keys.S ? 1 : 0;
  const blend = 1 - Math.exp(-dt * 16);
  tracked.throttle += (telemetry.throttle - tracked.throttle) * blend;
  tracked.brake += (brakeTarget - tracked.brake) * blend;
  setStyle("throttle", "--v", tracked.throttle.toFixed(3));
  setStyle("brake", "--v", tracked.brake.toFixed(3));
  const lit = Math.round(telemetry.rpm * LED_COUNT);
  if (cache.get("leds") !== lit) {
    cache.set("leds", lit);
    [...refs.leds.children].forEach((led, i) => led.classList.toggle("on", i < lit));
  }
  setClass("drs", "on", Boolean(player.drsActive));

  // Setores.
  const done = player.sectorsCompleted % SECTORS;
  for (let i = 0; i < SECTORS; i++) {
    const tone = sectorTone(i, done, player.lastSectors ?? [], player.bestSectors ?? []);
    const key = "s" + i;
    setClass(key, "best", tone === "best");
    setClass(key, "slow", tone === "slow");
    setClass(key, "pending", tone === "pending");
    refs[key].lastElementChild.textContent = tone === "pending" ? "—" : formatLapTime(player.lastSectors[i]).replace(/^00:/, "");
  }

  // Delta ao vivo contra a melhor volta.
  const delta = liveDelta(player, raceTime);
  if (delta === null) {
    setText("deltaText", "—");
    setStyle("deltaFill", "--d", "0");
    setClass("deltaText", "ahead", false);
    setClass("deltaText", "behind", false);
  } else {
    setText("deltaText", signedDelta(delta, 2));
    setStyle("deltaFill", "--d", Math.max(-1, Math.min(1, delta / 2)).toFixed(3));
    setClass("deltaText", "ahead", delta < 0);
    setClass("deltaText", "behind", delta > 0);
  }
}
