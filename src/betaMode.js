/**
 * Entrada e saída do modo 2.0 sobre o `state`. Só mexe em campos do estado
 * (sem DOM nem Three.js), então é testável, e a saída restaura exatamente o
 * que a entrada alterou: a 1.0 nunca herda câmera, contra-relógio ou noite da 2.0.
 */

/** Circuitos disponíveis na 2.0. Para incluir um, ver docs/prompts/astra-indianapolis-2.0.md. */
export const BETA_CIRCUITS = ["interlagos", "indianapolis"];

/** Campos que a 2.0 sobrescreve e a 1.0 precisa recuperar ao sair. */
const SAVED_FIELDS = ["cameraMode", "timeTrial", "qualifyingEnabled", "qualifying", "nightMode", "alwaysTurbo"];

/** Liga a 2.0: contra-relógio solo, câmera a bordo, sem classificação, noite nem turbo. Devolve o que restaurar. */
export function enterBetaState(state) {
  const saved = Object.fromEntries(SAVED_FIELDS.map((key) => [key, state[key]]));
  state.cameraMode = 1;
  state.graphicsBeta = true;
  state.championship = null;
  state.timeTrial = true;
  state.qualifyingEnabled = false;
  state.qualifying = false;
  state.nightMode = false;
  state.alwaysTurbo = false;
  state.analogSteer = null;
  return saved;
}

/** Desliga a 2.0 e devolve o estado da 1.0 como estava antes de `enterBetaState`. */
export function exitBetaState(state, saved) {
  state.graphicsBeta = false;
  state.championship = null;
  state.betaRecord = null;
  state.betaRecordBroken = 0;
  state.analogSteer = null;
  Object.assign(state, saved ?? { cameraMode: 0, timeTrial: false, qualifyingEnabled: false, qualifying: false, nightMode: false, alwaysTurbo: false });
}
