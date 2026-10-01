import { state } from "./state.js";
import { applyBetaTimeOfDay } from "./betaNature.js";
import { applyPixelRatio } from "./scene.js";
import { createAdaptiveResolution } from "./adaptiveResolution.js";
import { configureOnboardCamera } from "./onboardCamera.js";
import { getSettings, onSettingsChange, qualityPreset } from "./betaSettings.js";

/** Aplica o preset de qualidade a uma cena já aberta (a construção da cena lê o mesmo preset). */
export function applyQuality() {
  const { renderer, composer, betaSun: sun } = state;
  if (!state.graphicsBeta || !renderer) return;
  const preset = qualityPreset();
  const ratio = Math.min(devicePixelRatio, preset.pixelRatio);
  state.adaptiveResolution = createAdaptiveResolution({ max: ratio });
  applyPixelRatio(ratio);

  if (sun) {
    const size = Math.min(preset.shadow, renderer.capabilities.maxTextureSize);
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }
  if (composer) {
    const samples = Math.min(preset.msaa, renderer.capabilities.maxSamples);
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose();
      }
    }
    const bloom = composer.passes.find((pass) => pass.strength !== undefined && pass.radius !== undefined);
    if (bloom) bloom.enabled = preset.bloom;
  }
}

function applyCamera() {
  const { fov, shake } = getSettings();
  configureOnboardCamera({ fov, shake: shake / 100 });
}

/** Liga os ajustes à cena: chamar uma vez na inicialização. */
export function installBetaSettings() {
  applyCamera();
  onSettingsChange((now, before) => {
    if (now.fov !== before.fov || now.shake !== before.shake) applyCamera();
    if (state.graphicsBeta && now.quality !== before.quality) applyQuality();
    if (state.graphicsBeta && now.time !== before.time) applyBetaTimeOfDay(now.time);
  });
}
