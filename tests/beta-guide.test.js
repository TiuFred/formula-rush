import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, GUIDE, buildSpeedProfile, cornerSpeed, guideAction, maxYawRate, trackCurvature } from "../src/betaGuide.js";

test("velocidade de curva: reta é o teto; curva fechada é bem mais lenta que a aberta", () => {
  assert.equal(cornerSpeed(0), GUIDE.topSpeed);
  const wide = cornerSpeed(1 / 400);
  const tight = cornerSpeed(1 / 40);
  assert.ok(tight < wide && wide <= GUIDE.topSpeed);
  assert.ok(tight > 10 && tight < 40, `curva de 40 m: ${tight}`);
  // No limite, a guinada exigida cabe na que o carro consegue.
  assert.ok(tight / 40 <= maxYawRate(tight) + 1e-3);
});

test("o perfil começa a frear antes da curva, sem passar do que dá para frear", () => {
  const step = GUIDE.step;
  const curvature = new Array(900).fill(0);
  for (let i = 600; i < 615; i++) curvature[i] = 1 / 45;
  const { profile, limit } = buildSpeedProfile(curvature, { step });
  assert.equal(profile[0], GUIDE.topSpeed);
  assert.ok(profile[605] <= limit[605] + 1e-9);
  for (let i = 0; i < profile.length - 1; i++) {
    const drop = profile[i] ** 2 - profile[i + 1] ** 2;
    assert.ok(drop <= 2 * GUIDE.decel * step + 1e-6, `frenagem impossível em ${i}`);
  }
  assert.equal(profile[300], GUIDE.topSpeed, "longe da curva vale o teto");
  assert.ok(profile[585] < GUIDE.topSpeed, "deveria estar freando antes da curva");
  assert.ok(profile[599] < profile[585], "o permitido cai até a entrada da curva");
});

test("cores do guia: acelere, alivie ou freie conforme a velocidade", () => {
  const top = GUIDE.topSpeed;
  assert.equal(guideAction(60, top, top), ACTIONS.go, "reta aberta");
  assert.equal(guideAction(80, 50, 50), ACTIONS.brake, "acima do permitido");
  assert.equal(guideAction(48, 50, 50), ACTIONS.lift, "perto do limite de uma curva");
  assert.equal(guideAction(30, 50, 50), ACTIONS.go, "bem abaixo do limite");
  assert.equal(guideAction(top, top, top), ACTIONS.go, "no teto da reta não manda frear");
});

test("curvatura: reta dá zero, arco dá 1/raio e o circuito fecha", () => {
  const length = 1000;
  assert.ok(trackCurvature(() => 0, length).every((k) => k === 0));
  const radius = 100;
  const circle = trackCurvature((s) => s / radius, length * 0 + 2 * Math.PI * radius);
  for (const k of circle) assert.ok(Math.abs(k - 1 / radius) < 1e-3, `curvatura ${k}`);
});
