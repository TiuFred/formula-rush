import * as THREE from "three";

/**
 * Texturas procedurais da 2.0, geradas em canvas na inicialização (sem arquivos).
 * Ruído sem emendas (a grade de valores dá a volta), então repetem sem costuras.
 * Cada função devolve `null` se o canvas não oferecer `createImageData` (ambiente
 * de testes), e quem chama usa um material liso no lugar.
 */

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Campo de ruído de valores com `cells` células por lado; repete sem emendas. */
function tileableNoise(size, cells, rng) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const field = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = lattice[(y0 % cells) * cells + (x0 % cells)];
      const b = lattice[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = lattice[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = lattice[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      field[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return field;
}

function createContext(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

/**
 * Asfalto: agregado miúdo (pedrinhas), grãos e ondulação suave. Devolve mapa de
 * normais e de rugosidade (canal G); pedras são mais lisas e a massa entre elas,
 * mais áspera.
 */
export function makeAsphaltMaps(size = 512) {
  const { canvas: normalCanvas, ctx: normalCtx } = createContext(size, size);
  const { canvas: roughCanvas, ctx: roughCtx } = createContext(size, size);
  const normalImage = normalCtx.createImageData?.(size, size);
  const roughImage = roughCtx.createImageData?.(size, size);
  if (!normalImage?.data || !roughImage?.data) return null;

  const rng = seeded(90210);
  const height = new Float32Array(size * size);
  const octaves = [
    [6, 0.1],
    [14, 0.14],
    [32, 0.2],
    [64, 0.26],
    [128, 0.3],
  ];
  for (const [cells, weight] of octaves) {
    const field = tileableNoise(size, cells, rng);
    for (let i = 0; i < height.length; i++) height[i] += field[i] * weight;
  }
  // Pedrinhas: calombos arredondados com raios variados (com volta nas bordas).
  const stones = Math.round(size * size * 0.006);
  for (let n = 0; n < stones; n++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = 1.6 + rng() * 3.4;
    const amount = 0.18 + rng() * 0.3;
    const reach = Math.ceil(radius);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy) / radius;
        if (d >= 1) continue;
        const x = (((Math.round(cx) + dx) % size) + size) % size;
        const y = (((Math.round(cy) + dy) % size) + size) % size;
        height[y * size + x] += Math.sqrt(1 - d * d) * amount;
      }
    }
  }

  const strength = 2.4;
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normalImage.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      normalImage.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      normalImage.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      normalImage.data[i + 3] = 255;
      const rough = THREE.MathUtils.clamp(0.95 - (height[y * size + x] - 0.55) * 0.35, 0.7, 1);
      roughImage.data[i] = roughImage.data[i + 1] = roughImage.data[i + 2] = rough * 255;
      roughImage.data[i + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);

  const normal = new THREE.CanvasTexture(normalCanvas);
  const roughness = new THREE.CanvasTexture(roughCanvas);
  for (const texture of [normal, roughness]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { normal, roughness };
}

/**
 * Pintura do monocoque: cor da equipe com faixa central branca, frisos escuros,
 * linhas de painel e um leve desgaste nas bordas. `stripe` = intervalo de v
 * (0–1 ao longo do perfil) onde fica a faixa; u (0–1) corre ao longo do carro.
 */
export function makeLiveryTexture(teamColor, stripe = [0.42, 0.58]) {
  const width = 1024;
  const height = 256;
  const { canvas, ctx } = createContext(width, height);
  ctx.fillStyle = teamColor;
  ctx.fillRect(0, 0, width, height);

  // Sombreado sutil do centro para as bordas (verniz mais denso no meio).
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, "rgba(0,0,0,0.10)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.05)");
  sheen.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const v0 = stripe[0] * height;
  const v1 = stripe[1] * height;
  ctx.fillStyle = "#f4f4ee";
  ctx.fillRect(0, v0, width, v1 - v0);
  ctx.fillStyle = "#171a1d";
  ctx.fillRect(0, v0 - 7, width, 3);
  ctx.fillRect(0, v1 + 4, width, 3);

  // Linhas de painel (juntas finas) e parafusos Dzus.
  ctx.fillStyle = "rgba(10,12,14,0.55)";
  for (const u of [0.18, 0.37, 0.62, 0.81]) ctx.fillRect(u * width, 0, 2, height);
  ctx.fillStyle = "rgba(10,12,14,0.5)";
  for (const u of [0.18, 0.37, 0.62, 0.81]) {
    for (let v = 18; v < height; v += 34) ctx.fillRect(u * width + 8, v, 3, 3);
  }
  // Chevrons escuros ao longo da faixa.
  ctx.fillStyle = "#171a1d";
  for (let i = 0; i < 6; i++) {
    const x = (0.08 + i * 0.16) * width;
    ctx.fillRect(x, v0 + 6, 18, 3);
    ctx.fillRect(x + 8, v0 + 10, 18, 3);
    ctx.fillRect(x, v1 - 12, 18, 3);
  }
  // Poeira e borracha: pontos escuros esparsos, mais densos nas bordas.
  const rng = seeded(4242);
  for (let i = 0; i < 1800; i++) {
    const v = rng();
    const edge = Math.abs(v - 0.5) * 2;
    if (rng() > 0.25 + edge * 0.75) continue;
    ctx.fillStyle = `rgba(20,22,24,${0.04 + rng() * 0.07})`;
    ctx.fillRect(rng() * width, v * height, 1 + rng() * 3, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Forro interno em alcantara: fibra curta, com micro-variação de brilho. */
export function makeAlcantaraTexture(base = "#14181b", { stitch = true } = {}) {
  const size = 256;
  const { canvas, ctx } = createContext(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rng = seeded(777);
  for (let i = 0; i < 9000; i++) {
    const light = rng() > 0.5;
    ctx.fillStyle = light ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1);
  }
  // Costura: duas linhas tracejadas a cada 64 px.
  if (stitch) ctx.fillStyle = "rgba(220,220,210,0.22)";
  for (let y = 0; stitch && y < size; y += 64) {
    for (let x = 0; x < size; x += 8) {
      ctx.fillRect(x, y + 30, 4, 1);
      ctx.fillRect(x, y + 34, 4, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
