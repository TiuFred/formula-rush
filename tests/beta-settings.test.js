import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const settings = await import("../src/betaSettings.js");
const diagnostics = await import("../src/betaDiagnostics.js");

test("normaliza lixo do armazenamento para valores válidos", () => {
  const base = settings.defaultSettings();
  const clean = settings.normalizeSettings({ quality: "ultra", fov: 500, shake: -9, units: "ft", time: "noite", skipIntro: "sim" }, base);
  assert.deepEqual(clean, { ...base, fov: 80, shake: 0 });
  assert.deepEqual(settings.normalizeSettings(null, base), base);
  assert.equal(settings.normalizeSettings({ fov: "abc" }, base).fov, base.fov);
  assert.equal(settings.normalizeSettings({ fov: null }, base).fov, base.fov);
});

test("câmbio aceita só automático ou manual e começa no automático", () => {
  const base = settings.defaultSettings();
  assert.equal(base.transmission, "auto");
  assert.equal(settings.normalizeSettings({ transmission: "manual" }, base).transmission, "manual");
  assert.equal(settings.normalizeSettings({ transmission: "cvt" }, base).transmission, "auto");
});

test("celular começa em qualidade média e desktop em alta", () => {
  assert.equal(settings.defaultSettings({ touch: true }).quality, "medium");
  assert.equal(settings.defaultSettings().quality, "high");
});

test("atualizar salva, avisa os ouvintes e sobrevive a um novo carregamento", () => {
  settings.resetSettingsCache();
  const seen = [];
  settings.onSettingsChange((now, before) => seen.push([before.time, now.time]));
  settings.updateSettings({ time: "sunset", units: "mph", fov: 75 });
  assert.deepEqual(seen, [["day", "sunset"]]);
  settings.resetSettingsCache();
  const reloaded = settings.getSettings();
  assert.equal(reloaded.time, "sunset");
  assert.equal(reloaded.units, "mph");
  assert.equal(reloaded.fov, 75);
  assert.equal(settings.speedUnit().label, "MPH");
});

test("armazenamento quebrado não derruba os ajustes", () => {
  settings.resetSettingsCache();
  store.set("formula-rush.beta.settings.v1", "{não é json");
  assert.equal(settings.getSettings().time, "day");
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error("cheio");
  };
  assert.equal(settings.updateSettings({ units: "mph" }).units, "mph");
  globalThis.localStorage.setItem = original;
});

test("presets sobem de custo de baixo para alto", () => {
  const { low, medium, high } = settings.QUALITY_PRESETS;
  assert.ok(low.pixelRatio < medium.pixelRatio && medium.pixelRatio < high.pixelRatio);
  assert.ok(low.shadow < medium.shadow && medium.shadow < high.shadow);
  assert.ok(low.mirrorEvery > medium.mirrorEvery);
});

test("relato de feedback traz diagnóstico e usa a URL base informada", () => {
  diagnostics.resetDiagnostics();
  for (let i = 0; i < 60; i++) diagnostics.recordFrame(1 / 30);
  diagnostics.recordError("Falha A");
  diagnostics.recordError("Falha A");
  for (const n of ["B", "C", "D"]) diagnostics.recordError("Falha " + n);
  const url = new URL(diagnostics.feedbackUrl({ base: "https://exemplo.com/novo", settings: settings.getSettings(), env: { screen: "1920x1080", pixelRatio: 2, userAgent: "TestBrowser" } }));
  assert.equal(url.origin + url.pathname, "https://exemplo.com/novo");
  const body = url.searchParams.get("body");
  assert.match(body, /FPS médio: (29|30)/);
  assert.match(body, /TestBrowser/);
  assert.doesNotMatch(body, /Falha A/, "só os 3 erros mais recentes");
  assert.match(body, /Falha D/);
  assert.match(url.searchParams.get("title"), /Beta 2\.0/);
});
