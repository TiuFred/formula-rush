// Patrocinadores da 2.0. As marcas são FICTÍCIAS: inspiradas no estilo dos
// anunciantes que aparecem nas transmissões de F1, mas com nomes, cores e
// logotipos redesenhados aqui (nada é copiado de marcas reais). Todas as placas
// compartilham um atlas de textura e uma única malha (uma chamada de desenho).
import * as THREE from "three";
import { makeMaterial } from "./materials.js";

export const BOARD = { length: 5.4, height: 0.9, gap: 0.6, segments: 3 };
/** Painel grande atrás do muro, sobre dois postes (mesma proporção 6:1). */
export const HOARDING = { length: 10.8, height: 1.8, clearance: 1.4, setback: 2.6, segments: 4 };

const CELL = { w: 768, h: 128 };
const ATLAS_COLS = 4;

const FONT = '"Barlow Condensed", "Arial Narrow", Impact, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

/**
 * Catálogo. `kind: "house"` são as placas do próprio jogo/circuito; as demais
 * entram no rodízio de patrocinadores. A ordem define a célula no atlas.
 */
export const SPONSORS = [
  { id: "kronos", name: "KRONOS", sector: "relógios" },
  { id: "pirello", name: "PIRELLO", sector: "pneus" },
  { id: "heimken", name: "HEIMKEN", sector: "cerveja" },
  { id: "aramar", name: "ARAMAR", sector: "energia" },
  { id: "skyrates", name: "SKYRATES", sector: "aviação" },
  { id: "azw", name: "AZW CLOUD", sector: "nuvem" },
  { id: "dxh", name: "DXH EXPRESS", sector: "logística" },
  { id: "lumiere", name: "MAISON LUMIÈRE", sector: "moda" },
  { id: "msk", name: "MSK CRUZEIROS", sector: "cruzeiros" },
  { id: "novalen", name: "NOVALEN", sector: "tecnologia" },
  { id: "cloudforce", name: "CLOUDFORCE", sector: "software" },
  { id: "coinvault", name: "COINVAULT", sector: "cripto" },
  { id: "concha", name: "CONCHA", sector: "combustível" },
  { id: "monstar", name: "MONSTAR", sector: "energético" },
  { id: "duocard", name: "DUOCARD", sector: "pagamentos" },
  { id: "santamar", name: "SANTAMAR", sector: "banco" },
  { id: "petronova", name: "PETRONOVA", sector: "petróleo" },
  { id: "raybeam", name: "RAYBEAM", sector: "óculos" },
  { id: "formula-rush", name: "FORMULA RUSH", sector: "casa", kind: "house" },
  { id: "interlagos", name: "INTERLAGOS", sector: "casa", kind: "house" },
];

export const SPONSOR_INDEX = Object.fromEntries(SPONSORS.map((sponsor, index) => [sponsor.id, index]));
export const ROTATION_IDS = SPONSORS.filter((sponsor) => sponsor.kind !== "house").map((sponsor) => sponsor.id);
export const ATLAS_ROWS = Math.ceil(SPONSORS.length / ATLAS_COLS);

/** PRNG determinístico pequeno (mulberry32): o cenário não muda entre execuções. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ritmo de cada densidade: blocos de `run` placas separados por vãos de `gap` placas (faixas [min, máx]). */
const DENSITY = {
  dense: { run: [5, 8], gap: [1, 2] },
  sparse: { run: [2, 3], gap: [5, 8] },
};

/** `true` se a estação `s` está em [a, b] (m), contando a volta fechada: `a` pode ser negativo. */
export function inStationRange(s, [a, b], trackLength) {
  const along = (((s - a) % trackLength) + trackLength) % trackLength;
  return along <= b - a;
}

/**
 * Plano das placas coladas ao muro, uma passagem por lado. `density(s, lado)`
 * devolve "continuous" (placas encostadas, como na reta dos boxes), "dense",
 * "sparse" (blocos separados por vãos, como no resto da volta) ou "none".
 * Função pura: recebe `wallOffsetAt(s, lado)` (null onde não há muro) e
 * devolve placas com os deslocamentos laterais de cada ponto da fita.
 */
export function planWallSponsors(trackLength, wallOffsetAt, { density = () => "sparse", seed = 7 } = {}) {
  const { length, gap, segments } = BOARD;
  const pitch = length + gap;
  const boards = [];
  for (const side of [-1, 1]) {
    const random = seededRandom(seed + side * 101);
    const between = ([min, max]) => min + Math.floor(random() * (max - min + 1));
    const order = [...ROTATION_IDS];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let runLeft = 0;
    let gapLeft = 0;
    let counter = side > 0 ? 5 : 0;
    for (let s = side > 0 ? 23 : 0; s + length <= trackLength; s += pitch) {
      const mode = density(s, side);
      if (mode === "none") {
        runLeft = 0;
        gapLeft = 0;
        continue;
      }
      if (mode !== "continuous") {
        if (gapLeft > 0) {
          gapLeft--;
          continue;
        }
        if (runLeft <= 0) runLeft = between(DENSITY[mode].run);
      }
      const offsets = [];
      for (let k = 0; k <= segments; k++) offsets.push(wallOffsetAt(s + (length * k) / segments, side));
      if (offsets.some((offset) => offset == null)) continue;
      counter++;
      const brand = counter % 9 === 0 ? "formula-rush" : order[counter % order.length];
      boards.push({ s, side, offsets, brand });
      if (mode !== "continuous" && --runLeft <= 0) gapLeft = between(DENSITY[mode].gap);
    }
  }
  return boards;
}

/**
 * Painéis grandes atrás do muro, do lado de fora das curvas de frenagem.
 * `outsideSide(s)` devolve −1/+1 (lado de fora) e `blocked(s, lado)` indica
 * estações ocupadas por outras placas nesse lado. Devolve só os que cabem.
 */
export function planHoardings(stations, { outsideSide, wallOffsetAt, blocked = () => false, seed = 11 }) {
  const random = seededRandom(seed);
  const order = [...ROTATION_IDS].sort((a, b) => (a < b ? -1 : 1));
  const plan = [];
  for (const s of stations) {
    const side = outsideSide(s);
    if (!side || blocked(s, side)) continue;
    const half = HOARDING.length / 2;
    const offsets = [];
    for (let k = 0; k <= HOARDING.segments; k++) offsets.push(wallOffsetAt(s - half + (HOARDING.length * k) / HOARDING.segments, side));
    if (offsets.some((offset) => offset == null)) continue;
    plan.push({ s, side, offsets, brand: order[Math.floor(random() * order.length)] });
  }
  return plan;
}

// --- Atlas ---------------------------------------------------------------

function fit(ctx, text, x, y, maxWidth, { size = 80, weight = 800, color = "#fff", align = "left", italic = false, family = FONT, spacing = 0 } = {}) {
  let px = size;
  const apply = () => {
    ctx.font = `${italic ? "italic " : ""}${weight} ${px}px ${family}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  };
  apply();
  while (ctx.measureText(text).width > maxWidth && px > 12) {
    px -= 2;
    apply();
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return px;
}

function star(ctx, cx, cy, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function parallelogram(ctx, x, y, w, h, skew) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w + skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

const PAINTERS = {
  kronos(ctx) {
    ctx.fillStyle = "#0b3a29";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#e0bd5a";
    ctx.beginPath();
    ctx.moveTo(74, 86);
    ctx.lineTo(66, 40);
    ctx.lineTo(90, 62);
    ctx.lineTo(110, 30);
    ctx.lineTo(130, 62);
    ctx.lineTo(154, 40);
    ctx.lineTo(146, 86);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(74, 92, 72, 8);
    for (const x of [66, 110, 154]) {
      ctx.beginPath();
      ctx.arc(x, x === 110 ? 28 : 38, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    fit(ctx, "KRONOS", 200, 58, 420, { size: 82, weight: 800, color: "#e0bd5a", spacing: 8 });
    fit(ctx, "PRECISÃO SUÍÇA · DESDE 1905", 200, 100, 420, { size: 24, weight: 600, color: "#b9d4c2", spacing: 3 });
  },
  pirello(ctx) {
    ctx.fillStyle = "#0e0e0e";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#e01e26";
    parallelogram(ctx, 30, 22, 26, 84, 18);
    ctx.fillStyle = "#ffd51a";
    parallelogram(ctx, 68, 22, 10, 84, 18);
    fit(ctx, "PIRELLO", 110, 64, 460, { size: 100, weight: 900, color: "#ffd51a", italic: true, spacing: 2 });
    ctx.strokeStyle = "#f4f4f0";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(674, 64, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(674 + Math.cos(a) * 14, 64 + Math.sin(a) * 14);
      ctx.lineTo(674 + Math.cos(a) * 28, 64 + Math.sin(a) * 28);
      ctx.stroke();
    }
  },
  heimken(ctx) {
    ctx.fillStyle = "#0a6a2e";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#f4f2e6";
    star(ctx, 98, 66, 46, 20);
    ctx.fillStyle = "#e41b23";
    star(ctx, 98, 66, 36, 15);
    fit(ctx, "HEIMKEN", 168, 66, 520, { size: 92, weight: 800, color: "#f4f2e6", spacing: 4 });
    ctx.fillStyle = "#f4f2e6";
    ctx.fillRect(168, 104, 520, 4);
  },
  aramar(ctx) {
    ctx.fillStyle = "#f6f8f6";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ["#0b5ab7", "#1e86d6", "#37b34a"].forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(104 + i * 4, 70, 20 + i * 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
    const gradient = ctx.createLinearGradient(190, 0, 640, 0);
    gradient.addColorStop(0, "#0b5ab7");
    gradient.addColorStop(1, "#1f9d57");
    fit(ctx, "ARAMAR", 190, 60, 470, { size: 92, weight: 800, color: gradient, spacing: 6 });
    fit(ctx, "ENERGIA PARA SEGUIR EM FRENTE", 192, 104, 470, { size: 24, weight: 600, color: "#5b6b66", spacing: 2 });
  },
  skyrates(ctx) {
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#e8c778";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(40, 86 - i * 6);
      ctx.quadraticCurveTo(100, 76 - i * 18, 176, 28 + i * 12);
      ctx.quadraticCurveTo(110, 66 - i * 8, 40, 86 - i * 6 + 4);
      ctx.fill();
    }
    fit(ctx, "SKYRATES", 210, 62, 480, { size: 88, weight: 800, color: "#fff7ea", spacing: 5 });
    fit(ctx, "VOE ALÉM · SÃO PAULO ↔ DOHA", 212, 104, 470, { size: 22, weight: 600, color: "#f6c9ce", spacing: 3 });
  },
  azw(ctx) {
    ctx.fillStyle = "#232f3e";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    fit(ctx, "azw", 70, 54, 260, { size: 96, weight: 800, color: "#ffffff", spacing: 2 });
    fit(ctx, "cloud", 262, 54, 360, { size: 96, weight: 500, color: "#ff9900" });
    ctx.strokeStyle = "#ff9900";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(70, 98);
    ctx.quadraticCurveTo(220, 128, 380, 90);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(366, 78);
    ctx.lineTo(384, 90);
    ctx.lineTo(364, 102);
    ctx.stroke();
    fit(ctx, "INFRAESTRUTURA EM NUVEM", 700, 104, 300, { size: 22, weight: 600, color: "#9fb0c3", align: "right", spacing: 2 });
  },
  dxh(ctx) {
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#d40511";
    for (let i = 0; i < 3; i++) parallelogram(ctx, 24 + i * 22, 28 + i * 2, 12, 72 - i * 4, 14);
    fit(ctx, "DXH", 110, 66, 260, { size: 112, weight: 900, color: "#d40511", italic: true, spacing: 2 });
    fit(ctx, "EXPRESS", 400, 74, 300, { size: 60, weight: 800, color: "#d40511", italic: true, spacing: 4 });
    ctx.fillStyle = "#d40511";
    ctx.fillRect(400, 100, 300, 6);
  },
  lumiere(ctx) {
    ctx.fillStyle = "#2b1a12";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "rgba(224, 189, 90, 0.10)";
    for (let y = 8; y < CELL.h; y += 26) {
      for (let x = (y / 26) % 2 ? 12 : 0; x < CELL.w; x += 26) star(ctx, x, y, 5, 2, 4);
    }
    ctx.strokeStyle = "#e0bd5a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(88, 64, 40, 0, Math.PI * 2);
    ctx.stroke();
    fit(ctx, "ML", 88, 66, 60, { size: 46, weight: 700, color: "#e0bd5a", family: SERIF, align: "center" });
    fit(ctx, "MAISON LUMIÈRE", 150, 56, 540, { size: 66, weight: 700, color: "#f1d98f", family: SERIF, spacing: 4 });
    fit(ctx, "PARIS · ALTA COSTURA", 152, 100, 440, { size: 24, weight: 600, color: "#c9a66a", spacing: 5 });
  },
  msk(ctx) {
    ctx.fillStyle = "#0b2a6b";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      for (let x = 0; x <= CELL.w; x += 16) ctx.lineTo(x, 106 + i * 6 + Math.sin(x / 22 + i) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = "#f2c24b";
    star(ctx, 84, 62, 44, 12, 8);
    ctx.fillStyle = "#0b2a6b";
    ctx.beginPath();
    ctx.arc(84, 62, 10, 0, Math.PI * 2);
    ctx.fill();
    fit(ctx, "MSK", 150, 56, 250, { size: 104, weight: 900, color: "#ffffff", spacing: 4 });
    fit(ctx, "CRUZEIROS", 380, 66, 320, { size: 62, weight: 700, color: "#f2c24b", spacing: 6 });
  },
  novalen(ctx) {
    ctx.fillStyle = "#e2231a";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    fit(ctx, "NOVALEN", 60, 62, 560, { size: 100, weight: 900, color: "#ffffff", spacing: 6 });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(612, 34, 66, 66);
    ctx.fillStyle = "#e2231a";
    ctx.fillRect(660, 34, 18, 22);
    fit(ctx, "TECNOLOGIA PARA TODOS", 700, 110, 300, { size: 18, weight: 600, color: "#ffd9d6", align: "right", spacing: 2 });
  },
  cloudforce(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, CELL.h);
    gradient.addColorStop(0, "#1fa9e0");
    gradient.addColorStop(1, "#0c7cb8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#ffffff";
    for (const [x, y, r] of [[70, 74, 24], [104, 56, 32], [142, 70, 26], [172, 80, 18]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(70, 74, 102, 24);
    fit(ctx, "cloudforce", 210, 64, 480, { size: 92, weight: 700, color: "#ffffff", italic: true });
  },
  coinvault(ctx) {
    ctx.fillStyle = "#031b4e";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.strokeStyle = "#4ea1ff";
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      ctx.lineTo(96 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(96, 64, 16, Math.PI * 0.25, Math.PI * 1.75);
    ctx.stroke();
    fit(ctx, "COINVAULT", 168, 60, 460, { size: 86, weight: 800, color: "#ffffff", spacing: 4 });
    fit(ctx, ".exchange", 170, 104, 300, { size: 26, weight: 600, color: "#4ea1ff", spacing: 2 });
  },
  concha(ctx) {
    ctx.fillStyle = "#ffd500";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#dd1d21";
    ctx.beginPath();
    ctx.moveTo(96, 106);
    ctx.bezierCurveTo(40, 100, 28, 50, 60, 28);
    ctx.bezierCurveTo(80, 18, 112, 18, 132, 28);
    ctx.bezierCurveTo(164, 50, 152, 100, 96, 106);
    ctx.fill();
    ctx.strokeStyle = "#ffd500";
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(96, 104);
      ctx.lineTo(96 + i * 20, 26);
      ctx.stroke();
    }
    fit(ctx, "CONCHA", 190, 56, 400, { size: 100, weight: 900, color: "#dd1d21", spacing: 6 });
    fit(ctx, "ENERGIA QUE MOVE O BRASIL", 192, 104, 420, { size: 26, weight: 700, color: "#3a2a00", spacing: 2 });
  },
  monstar(ctx) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#78be20";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(52 + i * 30, 22);
      ctx.lineTo(74 + i * 30, 22);
      ctx.lineTo(60 + i * 30, 106);
      ctx.lineTo(44 + i * 30, 106);
      ctx.closePath();
      ctx.fill();
    }
    fit(ctx, "MONSTAR", 170, 58, 480, { size: 96, weight: 900, color: "#78be20", spacing: 4 });
    fit(ctx, "E N E R G Y", 174, 104, 300, { size: 26, weight: 700, color: "#e9efe4", spacing: 4 });
  },
  duocard(ctx) {
    ctx.fillStyle = "#151a22";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#c8102e";
    ctx.beginPath();
    ctx.arc(80, 64, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8920f";
    ctx.beginPath();
    ctx.arc(122, 64, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    fit(ctx, "duocard", 190, 62, 480, { size: 96, weight: 700, color: "#f4f4f0", spacing: 2 });
    fit(ctx, "PAGUE COMO QUISER", 700, 104, 260, { size: 20, weight: 600, color: "#7f8b9b", align: "right", spacing: 2 });
  },
  santamar(ctx) {
    ctx.fillStyle = "#e60000";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(94, 64, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e60000";
    ctx.beginPath();
    ctx.moveTo(94, 28);
    ctx.bezierCurveTo(124, 54, 124, 84, 94, 98);
    ctx.bezierCurveTo(68, 84, 72, 62, 94, 28);
    ctx.fill();
    fit(ctx, "SANTAMAR", 162, 58, 500, { size: 88, weight: 800, color: "#ffffff", spacing: 4 });
    fit(ctx, "BANCO", 164, 104, 200, { size: 26, weight: 700, color: "#ffc9c9", spacing: 8 });
  },
  petronova(ctx) {
    ctx.fillStyle = "#00a19b";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(94, 64, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(74, 88);
    ctx.lineTo(74, 40);
    ctx.lineTo(114, 88);
    ctx.lineTo(114, 40);
    ctx.stroke();
    fit(ctx, "PETRONOVA", 164, 60, 520, { size: 90, weight: 800, color: "#ffffff", spacing: 4 });
    fit(ctx, "ENERGIA DO FUTURO", 166, 104, 360, { size: 24, weight: 600, color: "#c8f1ee", spacing: 4 });
  },
  raybeam(ctx) {
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.strokeStyle = "#f4f4f0";
    ctx.lineWidth = 7;
    for (const x of [72, 142]) {
      ctx.beginPath();
      ctx.roundRect(x - 28, 40, 56, 44, 14);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(100, 56);
    ctx.quadraticCurveTo(107, 48, 114, 56);
    ctx.stroke();
    fit(ctx, "RAYBEAM", 210, 62, 440, { size: 96, weight: 900, color: "#f4f4f0", italic: true, spacing: 4 });
    ctx.fillStyle = "#d4252b";
    ctx.fillRect(652, 52, 44, 24);
  },
  "formula-rush"(ctx) {
    ctx.fillStyle = "#0e2420";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    ctx.fillStyle = "#d5fc51";
    ctx.beginPath();
    ctx.roundRect(38, 24, 80, 80, 14);
    ctx.fill();
    fit(ctx, "FR", 78, 66, 64, { size: 62, weight: 900, color: "#0e2420", italic: true, align: "center" });
    ctx.fillStyle = "#0e2420";
    ctx.fillRect(48, 94, 60, 5);
    fit(ctx, "FORMULA RUSH", 150, 58, 520, { size: 92, weight: 900, color: "#d5fc51", italic: true, spacing: 3 });
    fit(ctx, "GRAND PRIX ARCADE", 152, 104, 400, { size: 26, weight: 600, color: "#e8ead6", spacing: 6 });
  },
  interlagos(ctx) {
    ctx.fillStyle = "#173c35";
    ctx.fillRect(0, 0, CELL.w, CELL.h);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        ctx.fillStyle = (row + col) % 2 ? "#f4ecdb" : "#173c35";
        ctx.fillRect(34 + col * 14, 24 + row * 20, 14, 20);
      }
    }
    fit(ctx, "INTERLAGOS", 150, 58, 480, { size: 92, weight: 900, color: "#f4ecdb", spacing: 6 });
    fit(ctx, "SÃO PAULO · BRASIL", 152, 104, 400, { size: 26, weight: 600, color: "#d5fc51", spacing: 6 });
  },
};

/** Moldura comum: filete escuro, brilho de LED no topo e o filete lima do jogo embaixo. */
function finish(ctx) {
  const gloss = ctx.createLinearGradient(0, 0, 0, CELL.h);
  gloss.addColorStop(0, "rgba(255,255,255,0.16)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, CELL.w, CELL.h);
  ctx.strokeStyle = "#0b1412";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, CELL.w, CELL.h);
  ctx.fillStyle = "#d5fc51";
  ctx.fillRect(8, CELL.h - 11, CELL.w - 16, 3);
}

function paintAtlas(ctx) {
  SPONSORS.forEach((sponsor, index) => {
    ctx.save();
    ctx.translate((index % ATLAS_COLS) * CELL.w, Math.floor(index / ATLAS_COLS) * CELL.h);
    ctx.beginPath();
    ctx.rect(0, 0, CELL.w, CELL.h);
    ctx.clip();
    PAINTERS[sponsor.id](ctx);
    finish(ctx);
    ctx.restore();
  });
}

/** Cria a textura do atlas. As fontes do jogo (Barlow) são carregadas de forma assíncrona: redesenha quando chegarem. */
export function makeSponsorAtlas(maxAnisotropy = 4) {
  const canvas = document.createElement("canvas");
  canvas.width = CELL.w * ATLAS_COLS;
  canvas.height = CELL.h * ATLAS_ROWS;
  const ctx = canvas.getContext("2d");
  paintAtlas(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  document.fonts?.load(`800 64px "Barlow Condensed"`).then(() => {
    paintAtlas(ctx);
    texture.needsUpdate = true;
  }).catch(() => {});
  return texture;
}

export function makeSponsorMaterial(texture) {
  return makeMaterial("#ffffff", {
    map: texture,
    roughness: 0.55,
    // Placas de LED continuam legíveis na sombra e no pôr do sol.
    emissive: "#ffffff",
    emissiveMap: texture,
    emissiveIntensity: 0.3,
    // As placas ficam 4 cm à frente do muro: o offset evita cintilação à distância.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** UV (u0, v0, u1, v1) da célula do patrocinador, com meio pixel de folga contra vazamento entre células. */
export function sponsorUv(id) {
  const index = SPONSOR_INDEX[id];
  if (index == null) throw new Error(`patrocinador desconhecido: ${id}`);
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const eu = 0.5 / (CELL.w * ATLAS_COLS);
  const ev = 0.5 / (CELL.h * ATLAS_ROWS);
  return [
    col / ATLAS_COLS + eu,
    1 - (row + 1) / ATLAS_ROWS + ev,
    (col + 1) / ATLAS_COLS - eu,
    1 - row / ATLAS_ROWS - ev,
  ];
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _long = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Acumula placas (fitas e painéis) e entrega UMA malha com o atlas. */
export class SponsorBoards {
  constructor() {
    this.positions = [];
    this.uvs = [];
    this.count = 0;
  }

  /**
   * Fita de `n` segmentos. Os pontos já vêm na ordem de leitura (u crescente) e
   * o lado visível é o de `longo × cima` (regra da mão direita).
   */
  strip(bottoms, tops, id) {
    const [u0, v0, u1, v1] = sponsorUv(id);
    const n = bottoms.length - 1;
    for (let i = 0; i < n; i++) {
      const ua = u0 + ((u1 - u0) * i) / n;
      const ub = u0 + ((u1 - u0) * (i + 1)) / n;
      const a = bottoms[i], b = bottoms[i + 1], c = tops[i + 1], d = tops[i];
      this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      this.uvs.push(ua, v0, ub, v0, ub, v1, ua, v0, ub, v1, ua, v1);
    }
    this.count++;
  }

  /**
   * Painel plano num grupo (`root`): centro local `center`, `width` na horizontal,
   * `normal` local horizontal apontando para quem deve ler. O texto lê da
   * esquerda para a direita para esse observador.
   */
  panel(root, id, center, width, height, normal) {
    root.updateMatrixWorld(true);
    _c.set(...normal).normalize();
    // Direita do observador: (-normal) × cima.
    _long.copy(_c).negate().cross(UP).normalize();
    const mid = _a.set(...center);
    const half = _b.copy(_long).multiplyScalar(width / 2);
    const bottoms = [mid.clone().sub(half).setY(center[1] - height / 2), mid.clone().add(half).setY(center[1] - height / 2)];
    const tops = bottoms.map((p) => p.clone().setY(center[1] + height / 2));
    for (const p of [...bottoms, ...tops]) root.localToWorld(p);
    this.strip(bottoms, tops, id);
  }

  build(texture) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, makeSponsorMaterial(texture));
    mesh.name = "sponsor-boards";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.keepSeparate = true;
    return mesh;
  }
}
