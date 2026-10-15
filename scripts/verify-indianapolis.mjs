// QA no navegador real. Requer Vite rodando e Playwright instalado fora do
// projeto ou como dependência local. Não usa hooks em produção.
// PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/verify-indianapolis.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.QA_OUTPUT || "/tmp/formula-rush-indianapolis-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const report = { browser: browser.version(), errors };
try {
  await page.addInitScript(() => localStorage.setItem("formula-rush.beta.settings.v1", JSON.stringify({ quality: "medium", shake: 0 })));
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5173");
  await page.locator("#startRace").waitFor({ state: "attached" });
  await page.waitForFunction(() => !document.querySelector("#startRace").disabled);
  await page.evaluate(async () => { window.qa = { state: (await import("/src/state.js")).state }; });
  async function launch(circuit) {
    await page.locator("#startBeta").click();
    await page.locator(`[data-key="circuit"] [data-value="${circuit}"]`).click();
    assert.match(await page.locator("#bmSub").innerText(), circuit === "indianapolis" ? /INDIANÁPOLIS/ : /INTERLAGOS/);
    await page.locator("#bmConfirm").click();
    await page.locator("#betaMenu").waitFor({ state: "hidden", timeout: 120000 });
    await page.waitForFunction(() => window.qa.state.gameState === "race", null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.qa.state.circuitId), circuit);
    assert.match(await page.locator('[data-ref="circuit"]').innerText(), circuit === "indianapolis" ? /INDIANÁPOLIS/ : /INTERLAGOS/);
  }
  async function leave() {
    await page.evaluate(() => { window.qa.state.gameState = "race"; });
    await page.locator("#pause").click();
    await page.locator("#exit").click();
    await page.waitForFunction(() => !window.qa.state.graphicsBeta && window.qa.state.gameState === "landing" && !document.querySelector("#startRace").disabled, null, { timeout: 120000 });
  }
  await launch("indianapolis");
  console.log("Indianápolis carregada; pilotando pela física a 120 Hz…");
  report.laps = await page.evaluate(async () => {
    const { state } = window.qa;
    const { advanceSimulation } = await import("/src/simulation.js");
    const { applyRenderInterpolation } = await import("/src/car.js");
    const { updateBetaGhost } = await import("/src/betaGhost.js");
    const { maxYawRate } = await import("/src/handling.js");
    const { updateSettings } = await import("/src/betaSettings.js");
    updateSettings({ transmission: "auto" });
    state.gameState = "race";
    state.keys.ArrowUp = true;
    const car = state.player;
    let maxLane = 0, ghostSeen = false, drsSeen = false;
    // Só pedais e direção; nenhuma posição, volta, validade ou tempo é fabricado.
    for (let i = 0; i < 26000 && car.completedLaps < 3; i++) {
      const target = state.track.at(car.s + Math.max(10, car.speed * .65)).p;
      const heading = Math.atan2(target.x - car.x, target.z - car.z);
      const error = Math.atan2(Math.sin(heading - car.yaw), Math.cos(heading - car.yaw));
      state.analogSteer = Math.max(-1, Math.min(1, error * 3.2 / Math.max(.2, maxYawRate(car.speed))));
      advanceSimulation(1 / 120);
      applyRenderInterpolation(1);
      updateBetaGhost();
      drsSeen ||= car.drsActive;
      maxLane = Math.max(maxLane, Math.abs(car.lane));
      if (car.completedLaps >= 1) ghostSeen ||= state.scene.children.some((o) => o.userData.material?.transparent && o.visible);
    }
    state.keys.ArrowUp = false;
    state.analogSteer = null;
    state.gameState = "paused";
    return { completed: car.completedLaps, validity: car.lapValidity, best: state.betaRecord?.best, ghostSamples: state.betaRecord?.ghost?.length / 5, sectors: car.lastSectors, maxLane, ghostSeen, drsSeen };
  });
  console.log(report.laps);
  assert.equal(report.laps.completed, 3);
  assert.ok(report.laps.validity.every(Boolean));
  assert.ok(report.laps.best > 0 && report.laps.ghostSamples > 100 && report.laps.ghostSeen);
  assert.ok(report.laps.sectors.every((s) => s > 0));
  assert.ok(report.laps.drsSeen);
  async function capture(time, station, label) {
    await page.evaluate(async ({ time, station }) => {
      const { state } = window.qa;
      (await import("/src/betaSettings.js")).updateSettings({ time });
      if (time === "sunset" && state.betaSun.color.getHexString() === "fff0d1") throw new Error("Horário não foi aplicado à luz");
      const { syncCarVisual, applyRenderInterpolation } = await import("/src/car.js");
      const { updateCamera } = await import("/src/camera.js");
      const { updateBetaGraphics } = await import("/src/scene.js");
      state.gameState = "paused"; state.clockTime = 0;
      const car = state.player, f = state.track.at(station);
      car.s = station; car.x = f.p.x; car.z = f.p.z; car.yaw = f.yaw; car.speed = 0; car.steer = 0; car.betaAcceleration = 0;
      syncCarVisual(car); applyRenderInterpolation(1); updateCamera(0); updateBetaGraphics(1 / 60);
      state.composer.render();
    }, { time, station });
    await page.screenshot({ path: `${output}/indianapolis-${time}-${label}.png` });
  }
  for (const time of ["day", "sunset"]) {
    await capture(time, 0, "straight");
    await capture(time, 1210, "turn");
  }
  console.log("Capturas de dia e pôr do sol salvas.");
  await leave();
  await launch("interlagos");
  report.interlagosReset = await page.evaluate(() => ({ record: window.qa.state.betaRecord, laps: window.qa.state.player.completedLaps, guide: !!window.qa.state.betaGuide, pagoda: !!window.qa.state.scene.getObjectByName("indianapolis-pagoda") }));
  assert.equal(report.interlagosReset.record, null);
  assert.equal(report.interlagosReset.laps, 0);
  assert.equal(report.interlagosReset.pagoda, false);
  await leave();
  report.classicReset = await page.evaluate(() => ({ beta: window.qa.state.graphicsBeta, record: window.qa.state.betaRecord, guide: window.qa.state.betaGuide, composer: !!window.qa.state.composer }));
  assert.deepEqual(report.classicReset, { beta: false, record: null, guide: null, composer: false });
  // Preferência persistida também governa a entrada que pula o menu.
  await page.evaluate(async () => (await import("/src/betaSettings.js")).updateSettings({ circuit: "indianapolis", skipIntro: true, time: "day" }));
  await page.locator("#startBeta").click();
  await page.waitForFunction(() => window.qa.state.circuitId === "indianapolis" && window.qa.state.gameState === "race", null, { timeout: 120000 });
  report.skipIntro = await page.evaluate(() => ({ circuit: window.qa.state.circuitId, record: window.qa.state.betaRecord?.best }));
  assert.equal(report.skipIntro.circuit, "indianapolis");
  assert.equal(report.skipIntro.record, report.laps.best);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
