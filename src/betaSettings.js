/**
 * Ajustes da 2.0, salvos no navegador. Tudo aqui é independente do Three.js e
 * do DOM (exceto `localStorage`, sempre dentro de try/catch), para ser testável.
 */

const KEY = "formula-rush.beta.settings.v1";

/** Cada preset define o que a GPU precisa fazer; os valores mais altos só entram em máquinas capazes. */
export const QUALITY_PRESETS = {
  low: { label: "BAIXO", pixelRatio: 1, msaa: 0, shadow: 1024, bloom: false, mirrorEvery: 3 },
  medium: { label: "MÉDIO", pixelRatio: 1.5, msaa: 2, shadow: 2048, bloom: true, mirrorEvery: 2 },
  high: { label: "ALTO", pixelRatio: 2, msaa: 4, shadow: 4096, bloom: true, mirrorEvery: 2 },
};

export const SPEED_UNITS = {
  kmh: { label: "KM/H", factor: 3.6 },
  mph: { label: "MPH", factor: 2.23694 },
};

export const TIMES_OF_DAY = ["day", "sunset"];

export const FOV_RANGE = [60, 80];

export function defaultSettings({ touch = false } = {}) {
  return { quality: touch ? "medium" : "high", fov: 68, shake: 100, units: "kmh", time: "day", skipIntro: false };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Aceita qualquer coisa vinda do armazenamento e devolve ajustes válidos. */
export function normalizeSettings(raw, base = defaultSettings()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const number = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : fallback);
  return {
    quality: source.quality in QUALITY_PRESETS ? source.quality : base.quality,
    fov: Math.round(clamp(number(source.fov, base.fov), FOV_RANGE[0], FOV_RANGE[1])),
    shake: Math.round(clamp(number(source.shake, base.shake), 0, 100)),
    units: source.units in SPEED_UNITS ? source.units : base.units,
    time: TIMES_OF_DAY.includes(source.time) ? source.time : base.time,
    skipIntro: typeof source.skipIntro === "boolean" ? source.skipIntro : base.skipIntro,
  };
}

let current = null;
const listeners = new Set();

function isTouchDevice() {
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

export function getSettings() {
  if (current) return current;
  const base = defaultSettings({ touch: isTouchDevice() });
  let stored;
  try {
    stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null");
  } catch {
    stored = null;
  }
  current = normalizeSettings(stored, base);
  return current;
}

/** Altera os ajustes, salva e avisa quem escuta. Devolve o novo estado. */
export function updateSettings(patch) {
  const previous = getSettings();
  current = normalizeSettings({ ...previous, ...patch }, previous);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Armazenamento bloqueado (aba privativa): os ajustes valem só nesta sessão.
  }
  for (const listener of listeners) listener(current, previous);
  return current;
}

export function onSettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const qualityPreset = () => QUALITY_PRESETS[getSettings().quality];
export const speedUnit = () => SPEED_UNITS[getSettings().units];

/** Só para testes: esquece o estado em memória. */
export function resetSettingsCache() {
  current = null;
  listeners.clear();
}
