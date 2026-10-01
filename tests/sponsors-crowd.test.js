import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD,
  HOARDING,
  inStationRange,
  planHoardings,
  ROTATION_IDS,
  SPONSORS,
  SPONSOR_INDEX,
  planWallSponsors,
  seededRandom,
  sponsorUv,
} from "../src/sponsors.js";
import { buildFanGeometry, buildFlagGeometry, pickShirtColor, SHIRT_COLORS } from "../src/crowd.js";

const TRACK_LENGTH = 4309;

test("catálogo de patrocinadores: ids únicos, casa separada do rodízio e UV dentro do atlas", () => {
  assert.equal(new Set(SPONSORS.map((s) => s.id)).size, SPONSORS.length);
  assert.ok(ROTATION_IDS.length >= 12);
  assert.ok(!ROTATION_IDS.includes("formula-rush"));
  for (const id of Object.keys(SPONSOR_INDEX)) {
    const [u0, v0, u1, v1] = sponsorUv(id);
    assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1 && u0 < u1 && v0 < v1, `${id}: UV fora do atlas`);
  }
  assert.throws(() => sponsorUv("inexistente"));
});

test("as marcas são fictícias: nenhum nome coincide com anunciantes reais", () => {
  const real = ["ROLEX", "PIRELLI", "HEINEKEN", "ARAMCO", "EMIRATES", "AWS", "DHL", "LENOVO", "SALESFORCE", "SHELL", "MASTERCARD", "PETRONAS", "SANTANDER", "RAY-BAN", "MONSTER", "MSC"];
  for (const { name } of SPONSORS) {
    assert.ok(!real.some((brand) => name.toUpperCase().split(/\s+/).includes(brand)), `${name} é uma marca real`);
  }
});

test("plano de placas no muro é determinístico, sem sobreposição e respeita lacunas do muro", () => {
  const wall = (s, side) => (s > 1000 && s < 1100 ? null : 9 + side * 0);
  const density = (s) => (s >= TRACK_LENGTH - 430 || s <= 290 ? "continuous" : "sparse");
  const a = planWallSponsors(TRACK_LENGTH, wall, { density });
  const b = planWallSponsors(TRACK_LENGTH, wall, { density });
  assert.deepEqual(a, b);
  assert.ok(a.length > 150, `poucas placas: ${a.length}`);
  for (const side of [-1, 1]) {
    const mine = a.filter((board) => board.side === side).sort((x, y) => x.s - y.s);
    for (let i = 1; i < mine.length; i++) {
      assert.ok(mine[i].s - mine[i - 1].s >= BOARD.length + BOARD.gap - 1e-9, "placas se sobrepõem");
      assert.notEqual(mine[i].brand, mine[i - 1].brand, "mesma marca em placas vizinhas");
    }
    assert.ok(mine.every((board) => board.s + BOARD.length <= TRACK_LENGTH));
  }
  for (const board of a) {
    assert.equal(board.offsets.length, BOARD.segments + 1);
    assert.ok(board.offsets.every((offset) => offset != null));
    assert.ok(!(board.s + BOARD.length > 1000 && board.s < 1100), "placa sobre trecho sem muro");
    assert.ok(board.brand in SPONSOR_INDEX);
  }
  // Na reta dos boxes as placas são contínuas (sem os vãos do resto da volta).
  const pit = a.filter((board) => board.side === -1 && board.s <= 290).sort((x, y) => x.s - y.s);
  assert.ok(pit.length >= 40);
  const spaced = a.filter((board) => board.side === -1 && board.s > 400 && board.s < 3800);
  assert.ok(spaced.some((board, i) => i && board.s - spaced[i - 1].s > BOARD.length + BOARD.gap + 5), "trecho esparso tem vãos");
});

test("PRNG semeado repete a sequência", () => {
  const x = seededRandom(5), y = seededRandom(5);
  for (let i = 0; i < 5; i++) assert.equal(x(), y());
});

test("geometria do torcedor: braços marcados por lado e menos triângulos que a cápsula antiga", () => {
  const geometry = buildFanGeometry();
  const arm = geometry.attributes.aArm.array;
  assert.ok(arm.some((v) => v === 0) && arm.some((v) => v === 1) && arm.some((v) => v === -1));
  const triangles = geometry.index.count / 3;
  assert.ok(triangles <= 40, `${triangles} triângulos`);
});

test("bandeira tem mastro (aCloth 0) e pano (aCloth 1) com u de 0 a 1", () => {
  const geometry = buildFlagGeometry();
  const cloth = geometry.attributes.aCloth.array;
  assert.ok(cloth.some((v) => v === 0) && cloth.some((v) => v === 1));
  const uv = geometry.attributes.uv.array;
  const clothU = [...cloth].map((v, i) => (v === 1 ? uv[i * 2] : null)).filter((v) => v !== null);
  assert.equal(Math.min(...clothU), 0);
  assert.equal(Math.max(...clothU), 1);
});

test("sorteio de camisetas cobre a paleta e respeita os extremos", () => {
  assert.equal(pickShirtColor(0), SHIRT_COLORS[0][0]);
  assert.ok(SHIRT_COLORS.some(([color]) => color === pickShirtColor(0.999)));
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickShirtColor(i / 200));
  assert.equal(seen.size, SHIRT_COLORS.length);
});

test("trechos de estação contam a volta fechada", () => {
  assert.ok(inStationRange(10, [-700, 470], TRACK_LENGTH));
  assert.ok(inStationRange(TRACK_LENGTH - 100, [-700, 470], TRACK_LENGTH));
  assert.ok(!inStationRange(1000, [-700, 470], TRACK_LENGTH));
});

test("painéis grandes só entram do lado de fora, com muro e sem ocupação", () => {
  const wall = (s) => (s > 2000 && s < 2100 ? null : 9);
  const plan = planHoardings([100, 1000, 2050, 3000], {
    outsideSide: (s) => (s === 1000 ? 0 : s % 200 === 0 ? 1 : -1),
    wallOffsetAt: wall,
    blocked: (s, side) => s === 3000 && side !== 0,
  });
  assert.deepEqual(plan.map((h) => h.s), [100]);
  assert.equal(plan[0].offsets.length, HOARDING.segments + 1);
});
