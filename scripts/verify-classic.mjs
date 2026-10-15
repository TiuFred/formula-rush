// Executar contra a base e a branch; os JSONs de simulação devem ser iguais.
import { writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};
try {
  for (const circuit of ["interlagos", "indianapolis"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // QA nunca publica voltas no ranking online, mesmo com .env.local presente.
    await page.route("**/*", (route) => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
    await page.goto(process.env.QA_URL || "http://127.0.0.1:5173");
    await page.waitForFunction(() => !document.querySelector("#startRace").disabled);
    await page.locator("#goToConfig").click();
    await page.locator(`#circuit [data-value="${circuit}"]`).click();
    await page.waitForFunction(() => !document.querySelector("#startRace").disabled);
    await page.locator("#startRace").click();
    report[circuit] = await page.evaluate(async (circuit) => {
      const { state } = await import("/src/state.js");
      const { setupGrid } = await import("/src/car.js");
      const { advanceSimulation, setupItemBoxes } = await import("/src/simulation.js");
      const { useItem } = await import("/src/items.js");
      const { recordLap } = await import("/src/leaderboard.js");
      const previousRandom = Math.random;
      let seed = 4721;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      try {
        state.gameState = "race"; state.raceTime = 0; state.clockTime = 0; state.lapCountRace = 3;
        state.keys = { ArrowUp: true }; state.analogSteer = null;
        setupGrid(); setupItemBoxes();
        const car = state.player;
        const result = { beta: state.graphicsBeta, drivers: state.drivers.length, itemBoxes: state.itemBoxes.length, driftSeen: false, snapshots: [] };
        for (let tick = 0; tick < 1200; tick++) {
          if (tick === 120) { car.item = "turbo"; useItem(); result.turbo = car.boost; }
          if (tick === 420) { car.item = "shield"; useItem(); result.shield = car.shield; }
          state.keys.Shift = tick >= 450 && tick < 510;
          state.keys.ArrowLeft = tick >= 450 && tick < 510;
          if (tick === 720) { car.item = "oil"; useItem(); result.oil = state.oilPatches.length; }
          if (tick === 900) { car.item = "missile"; useItem(); result.missiles = state.missiles.length; }
          state.clockTime += 1 / 120; advanceSimulation(1 / 120);
          result.driftSeen ||= car.wasDrifting;
          if ([359, 719, 1199].includes(tick)) result.snapshots.push(state.drivers.map((c) => ({ id: c.id, s: +c.s.toFixed(6), speed: +c.speed.toFixed(6), progress: +c.progress.toFixed(6) })));
        }
        state.gameState = "paused";
        result.rankImproved = await recordLap(circuit, "QA clássico", 85);
        result.rankRejected = !(await recordLap(circuit, "QA clássico", 86));
        result.localBest = JSON.parse(localStorage.getItem("formula-rush-leaderboard-v1"))[circuit]["QA clássico"].time;
        return result;
      } finally { Math.random = previousRandom; }
    }, circuit);
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(process.env.QA_REPORT || "/tmp/classic-current.json", JSON.stringify(report, null, 2));
console.log(Object.fromEntries(Object.entries(report).map(([id, data]) => [id, { ...data, snapshots: `${data.snapshots.length} snapshots de ${data.drivers} carros` }])));
