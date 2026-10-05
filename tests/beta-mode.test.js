import test from "node:test";
import assert from "node:assert/strict";

const { state } = await import("../src/state.js");
const { BETA_CIRCUITS, enterBetaState, exitBetaState } = await import("../src/betaMode.js");
const { cameraProfile, sceneProfile } = await import("../src/renderProfile.js");

test("entrar na 2.0 impõe contra-relógio solo, câmera a bordo e sem turbo", () => {
  Object.assign(state, { cameraMode: 0, timeTrial: false, qualifyingEnabled: true, nightMode: true, alwaysTurbo: true, championship: { round: 1 } });
  const saved = enterBetaState(state);
  assert.equal(state.graphicsBeta, true);
  assert.equal(state.cameraMode, 1);
  assert.equal(state.timeTrial, true);
  assert.equal(state.qualifyingEnabled, false);
  assert.equal(state.nightMode, false);
  assert.equal(state.alwaysTurbo, false);
  assert.equal(state.championship, null);
  exitBetaState(state, saved);
});

test("sair da 2.0 devolve à 1.0 exatamente o que a entrada alterou", () => {
  Object.assign(state, { cameraMode: 0, timeTrial: false, qualifyingEnabled: true, qualifying: false, nightMode: true, alwaysTurbo: true });
  const saved = enterBetaState(state);
  state.betaRecord = { best: 80, ghost: null };
  state.betaRecordBroken = 2;
  state.analogSteer = 0.5;
  exitBetaState(state, saved);
  assert.equal(state.graphicsBeta, false);
  assert.equal(state.cameraMode, 0);
  assert.equal(state.timeTrial, false);
  assert.equal(state.qualifyingEnabled, true);
  assert.equal(state.nightMode, true);
  assert.equal(state.alwaysTurbo, true);
  assert.equal(state.betaRecord, null);
  assert.equal(state.betaRecordBroken, 0);
  assert.equal(state.analogSteer, null);
});

test("sair sem ter guardado nada cai nos padrões da 1.0, nunca no contra-relógio", () => {
  enterBetaState(state);
  exitBetaState(state, null);
  assert.equal(state.graphicsBeta, false);
  assert.equal(state.timeTrial, false);
  assert.equal(state.cameraMode, 0);
});

test("o perfil de render muda com o modo e a 1.0 não ganha efeitos da 2.0", () => {
  const classic = cameraProfile(false);
  const beta = cameraProfile(true);
  assert.equal(classic.speedFovMax.chase, 0);
  assert.equal(classic.speedFovMax.cockpit, 0);
  assert.ok(beta.speedFovMax.chase > 0);
  assert.ok(beta.chaseDistance > classic.chaseDistance, "chase da 2.0 é mais próxima");
  assert.equal(sceneProfile(false).terrainSegments, 74);
  assert.equal(sceneProfile(true).exposure(true), 0.9);
  assert.equal(sceneProfile(false).exposure(true), 0.95);
  state.graphicsBeta = true;
  assert.equal(cameraProfile().chaseBaseFov, 60);
  state.graphicsBeta = false;
  assert.equal(cameraProfile().chaseBaseFov, 63);
});

test("a lista de circuitos da 2.0 só tem circuitos registrados", async () => {
  const { CIRCUITS } = await import("../src/circuits.js");
  assert.ok(BETA_CIRCUITS.length >= 1);
  for (const id of BETA_CIRCUITS) assert.ok(CIRCUITS[id], `${id} não existe em CIRCUITS`);
});
