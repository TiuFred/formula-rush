// Medição controlada de render: Chrome local, preset médio, mesma resolução,
// 32 estações uniformes por volta, câmera a bordo, com/sem retrovisores.
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.QA_OUTPUT || "/tmp/formula-rush-indianapolis-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const results = {};
try {
  await page.addInitScript(() => localStorage.setItem("formula-rush.beta.settings.v1", JSON.stringify({ quality: "medium", shake: 0 })));
  await page.goto((process.env.QA_URL || "http://127.0.0.1:5173") + "/?fixedres");
  await page.waitForFunction(() => !document.querySelector("#startRace").disabled);
  for (const circuit of ["interlagos", "indianapolis"]) {
    await page.locator("#startBeta").click();
    await page.locator(`[data-key="circuit"] [data-value="${circuit}"]`).click();
    await page.locator("#bmConfirm").click();
    await page.locator("#betaMenu").waitFor({ state: "hidden", timeout: 120000 });
    results[circuit] = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      const { TRACK_LENGTH } = await import("/src/constants.js");
      const { syncCarVisual, applyRenderInterpolation } = await import("/src/car.js");
      const { updateCamera } = await import("/src/camera.js");
      const { renderBetaMirrors } = await import("/src/betaCockpit.js");
      const { updateBetaGraphics } = await import("/src/scene.js");
      state.gameState = "paused";
      const renderer = state.renderer, car = state.player, gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const report = { gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), pixelRatio: renderer.getPixelRatio(), modes: {} };
      const move = (s) => {
        const f = state.track.at(s); car.s = s; car.x = f.p.x; car.z = f.p.z; car.yaw = f.yaw; car.speed = 0; car.steer = 0;
        syncCarVisual(car); applyRenderInterpolation(1); updateCamera(0);
        state.betaSun.position.copy(car.group.position).addScaledVector(state.betaSun.position.clone().sub(state.betaSun.target.position).normalize(), 125);
        state.betaSun.target.position.copy(car.group.position);state.betaSun.target.updateMatrixWorld();
      };
      // Warm-up dos shaders e texturas, incluindo câmera de espelho.
      for (let i = 0; i < 8; i++) { move(i * TRACK_LENGTH / 8); updateBetaGraphics(1 / 60); state.composer.render(); }
      gl.finish();
      renderer.info.autoReset = false;
      for (const mirrors of [false, true]) {
        const samples = [];
        for (let i = 0; i < 32; i++) {
          move(i * TRACK_LENGTH / 32);
          renderer.info.reset();
          const start = performance.now();
          if (mirrors) renderBetaMirrors(renderer, state.scene, state.camera, car, 1 / 60, [state.betaGuide.mesh]);
          state.composer.render(); gl.finish();
          samples.push({ ms: performance.now() - start, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
        }
        const ms = samples.reduce((sum, s) => sum + s.ms, 0) / samples.length;
        report.modes[mirrors ? "mirrors" : "noMirrors"] = { meanMs: ms, equivalentRenderFps: 1000 / ms, meanCalls: samples.reduce((sum, s) => sum + s.calls, 0) / samples.length, meanTriangles: samples.reduce((sum, s) => sum + s.triangles, 0) / samples.length };
      }
      renderer.info.autoReset = true;
      // FPS de RAF separado da medida sincronizada acima. O caminho é a mesma
      // fração da volta para ambos os circuitos; animação/preset não são alterados.
      const frameTimes = [];
      await new Promise((resolve) => {
        let index = 0, previous;
        const tick = (now) => {
          if (previous !== undefined && index > 16) frameTimes.push(now - previous);
          previous = now; move((index % 64) * TRACK_LENGTH / 64);
          if (++index >= 80) resolve(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      report.rafFps = 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length);
      return report;
    });
    console.log(circuit, results[circuit]);
    await page.evaluate(async () => { (await import("/src/state.js")).state.gameState = "race"; });
    await page.locator("#pause").click(); await page.locator("#exit").click();
    await page.waitForFunction(() => !document.querySelector("#startRace").disabled, null, { timeout: 120000 });
  }
} finally { await browser.close(); }
await writeFile(`${output}/performance.json`, JSON.stringify(results, null, 2));
