import { clamp } from "./mathUtils.js";
import { betaPowertrainTelemetry } from "./betaPowertrain.js";

/**
 * Parâmetros do som de motor e dos pneus da 2.0, derivados do mesmo powertrain
 * que move o carro (marcha, rotação e acelerador de betaPowertrain.js), para o
 * áudio acompanhar o que o volante e a HUD mostram. Puro: sem WebAudio, testável.
 */

/** Faixa de frequência (Hz) da fundamental entre marcha lenta e o corte de giro. */
export const ENGINE_HZ = { idle: 95, redline: 310 };

/**
 * Som do motor. `freq` sobe com a rotação da marcha atual e cai a cada troca;
 * `gain` acompanha o acelerador (pé levantado = motor freando, mais baixo) e
 * some quase por completo durante o corte da troca (`shifting`).
 */
export function betaEngineVoice(car) {
  const { rpm, throttle } = betaPowertrainTelemetry(car);
  const shifting = (car.betaShiftTimer || 0) > 0;
  const load = 0.35 + throttle * 0.65;
  return {
    freq: ENGINE_HZ.idle + (ENGINE_HZ.redline - ENGINE_HZ.idle) * rpm ** 0.85,
    gain: shifting ? 0.012 : (0.03 + clamp(car.speed || 0, 0, 95) * 0.00055) * load,
    shifting,
    // Filtro mais aberto com o pé embaixo: o rosnado "abre" ao acelerar.
    cutoff: 900 + throttle * 1500 + rpm * 900,
  };
}

/**
 * Pneus: chiado agudo no drift (fora da 2.0) e trepidação grave nas zebras e
 * na grama, proporcional à velocidade. `edgeRumble` vem de player.js (0..1).
 */
export function betaTireVoice(car) {
  const speedFactor = clamp((car.speed || 0) / 60, 0, 1);
  const rumble = clamp(car.edgeRumble || 0, 0, 1) * speedFactor;
  return { gain: rumble * 0.17, cutoff: 260 + speedFactor * 220 };
}
