import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { CIRCUITS, applyCircuitProfile } from "../src/circuits.js";
import { BETA_CIRCUITS } from "../src/betaMode.js";
import { BETA_SCENERY } from "../src/betaScenery.js";
import { normalizeSettings } from "../src/betaSettings.js";
import { buildTrackModel, alignedFootprintClearanceAt, sectorNameAt, drsZoneAt } from "../src/track.js";
import { planIndianapolisStands, planIndianapolisLandmarks, INDIANAPOLIS_STANDS } from "../src/indianapolisScenery.js";
import { trackCurvature, buildSpeedProfile, guideAction, GUIDE, ACTIONS } from "../src/betaGuide.js";
import { recordKey, saveRecord, loadRecord } from "../src/betaRecords.js";
import { ONBOARD_EYE, configureOnboardCamera, updateOnboardCamera } from "../src/onboardCamera.js";
import { betaPowertrainTelemetry, betaGearAtSpeed } from "../src/betaPowertrain.js";
import { betaEngineVoice, ENGINE_HZ } from "../src/betaAudio.js";
import { computeDrsActive } from "../src/physics.js";
import { state } from "../src/state.js";

const load = async (file) => JSON.parse(await readFile(new URL("../public/" + file, import.meta.url), "utf8"));
applyCircuitProfile("indianapolis");
const track = buildTrackModel(await load("indianapolis.geojson"), await load("indianapolis-elevation.json"));

test("cada circuito 2.0 tem traçado e configuração completa de cenário", () => {
  assert.deepEqual(BETA_CIRCUITS, ["interlagos", "indianapolis"]);
  for (const id of BETA_CIRCUITS) {
    assert.ok(CIRCUITS[id]?.geojsonPath);
    const config = BETA_SCENERY[id];
    assert.ok(config.stands.length && config.fences.length && config.cameraStations.length);
    assert.ok(Array.isArray(config.brakingStations));
    assert.equal(config.house, id);
  }
  assert.deepEqual(BETA_SCENERY.interlagos.brakingStations, [255, 1085, 2215, 2920, 3655]);
  assert.deepEqual(BETA_SCENERY.interlagos.cameraStations, [420, 1340, 2460, 3480]);
  assert.deepEqual(BETA_SCENERY.interlagos.fences, [{ from: -700, to: 1372, sides: [-1, 1] }]);
});

test("circuito inválido volta a Interlagos mesmo com uma base Indianápolis", () => {
  assert.equal(normalizeSettings({ circuit: "indianapolis" }).circuit, "indianapolis");
  for (const circuit of [null, undefined, "monza", "__proto__", 7]) {
    assert.equal(normalizeSettings({ circuit }, { ...normalizeSettings({}), circuit: "indianapolis" }).circuit, "interlagos");
  }
});

test("recordes e trajetórias sobrevivem à alternância de circuito e horário sem se misturar", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  for (const [index, id] of BETA_CIRCUITS.entries()) {
    for (const [timeIndex, time] of ["day", "sunset"].entries()) {
      const record = { best: 50 + index * 20 + timeIndex, ghost: [0, index, 0, 0, 0, 1, 10 + index, 0, timeIndex, 0] };
      saveRecord(id, time, record, storage);
      assert.deepEqual(loadRecord(id, time, storage), record);
    }
  }
  assert.equal(data.size, 4);
  assert.notEqual(recordKey("indianapolis", "day"), recordKey("interlagos", "day"));
  assert.equal(loadRecord("interlagos", "day", storage).ghost[1], 0);
  assert.equal(loadRecord("indianapolis", "day", storage).ghost[1], 1);
});

test("bancadas contínuas do oval, coberturas e marcos ficam fora do asfalto e dentro da volta", () => {
  const modules = planIndianapolisStands(track);
  assert.deepEqual([...new Set(modules.map((m) => m.id))], INDIANAPOLIS_STANDS.map((s) => s.id));
  assert.ok(modules.length > 250);
  for (const m of modules) {
    assert.ok(m.s - 9 >= 0 && m.s + 9 <= 4023);
    assert.ok(alignedFootprintClearanceAt(track, m.s, m.lane, m.depth + 3, 18.1) >= 3, m.id);
    const projection = track.nearest(track.at(m.s, m.lane).p.x, track.at(m.s, m.lane).p.z);
    assert.ok(projection.s >= 0 && projection.s < 4023);
  }
  for (const m of planIndianapolisLandmarks()) {
    assert.ok(m.s >= 0 && m.s < 4023);
    assert.ok(alignedFootprintClearanceAt(track, m.s, m.lane, m.width, m.depth) >= 2, m.id);
  }
});

test("guia usa o GeoJSON real do oval: nenhuma curva pede freada a plena velocidade", () => {
  const curvature = trackCurvature((s) => track.at(s).yaw, 4023);
  const { profile, limit } = buildSpeedProfile(curvature);
  for (let i = 0; i < profile.length; i++) {
    assert.equal(guideAction(GUIDE.topSpeed, profile[i], limit[i]), ACTIONS.go, `s=${i * GUIDE.step}`);
  }
});

test("projeção dos limites do oval não invalida o asfalto; grama fica além da borda", () => {
  for (let s = 0; s < 4023; s += 8) {
    for (const side of [-1, 1]) {
      const half = track.at(s).halfWidth;
      for (const offset of [-.3, .3]) {
        const p = track.at(s, side * (half + offset)).p;
        const near = track.nearest(p.x, p.z, s);
        assert.equal(near.dist > near.halfWidth, offset > 0, `s=${s}, lado=${side}`);
      }
    }
  }
});

test("DRS e nomes de trechos seguem o perfil legado", () => {
  assert.ok(drsZoneAt(500));
  assert.ok(drsZoneAt(2500));
  assert.equal(drsZoneAt(1500), false);
  assert.match(sectorNameAt(1200), /Curva 1/);
  assert.match(sectorNameAt(1800), /Curva 2/);
  assert.match(sectorNameAt(3200), /Curva 3/);
  assert.match(sectorNameAt(3800), /Curva 4/);
});

test("DRS abre no treino solo 2.0, fecha ao frear e preserva a regra clássica", () => {
  const previous = { graphicsBeta: state.graphicsBeta, keys: state.keys, drivers: state.drivers };
  const car = { s: 500, progress: 500, finish: null };
  try {
    state.graphicsBeta = true; state.keys = {}; state.drivers = [car];
    assert.equal(computeDrsActive(car), true);
    for (const key of ["ArrowDown", "s", "S", "GamepadDown"]) {
      state.keys = { [key]: true };
      assert.equal(computeDrsActive(car), false);
    }
    state.keys = {}; car.s = 1500;
    assert.equal(computeDrsActive(car), false);
    car.s = 500; state.graphicsBeta = false;
    assert.equal(computeDrsActive(car), false, "clássico solo não ganha DRS");
    state.drivers.push({ progress: 501, group: { visible: true } });
    assert.equal(computeDrsActive(car), true);
  } finally { Object.assign(state, previous); }
});

test("câmera acompanha banking sem deslocamento relativo ou salto nas transições", () => {
  configureOnboardCamera({ shake: 0 });
  const car = { group: new THREE.Group(), speed: 94 };
  const camera = new THREE.PerspectiveCamera(68, 16 / 9);
  let previous;
  for (let s = 950; s <= 1460; s++) {
    const f = track.at(s);
    car.group.position.copy(f.p);
    car.group.rotation.set(-Math.asin(f.t.y), f.yaw, -f.bank, "YXZ");
    updateOnboardCamera(camera, car, 1 / 120, 0);
    const eye = camera.position.clone().sub(car.group.position).applyQuaternion(car.group.quaternion.clone().invert());
    assert.ok(eye.distanceTo(ONBOARD_EYE) < 1e-8);
    if (previous) assert.ok(previous.angleTo(camera.quaternion) < .015);
    previous = camera.quaternion.clone();
  }
  configureOnboardCamera();
});

test("giro, LEDs e motor ficam estáveis na oitava à velocidade máxima do oval", () => {
  for (const manual of [true, false]) {
    const car = { speed: 94, betaGear: betaGearAtSpeed(94), betaManual: manual, betaThrottle: 1 };
    const telemetry = betaPowertrainTelemetry(car);
    assert.equal(telemetry.gear, 8);
    assert.ok(telemetry.rpm > .95 && telemetry.rpm <= 1);
    assert.ok(telemetry.shift > .8 && telemetry.shift <= 1);
    const voice = betaEngineVoice(car);
    assert.ok(voice.freq > ENGINE_HZ.redline * .95 && voice.freq <= ENGINE_HZ.redline);
    assert.ok(Number.isFinite(voice.gain) && voice.gain > 0);
  }
});
