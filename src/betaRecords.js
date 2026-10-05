/**
 * Recorde pessoal e fantasma da 2.0, salvos no navegador por circuito e horário
 * (dia e pôr do sol têm aderência diferente, então recordes separados). Sem
 * DOM nem Three.js: o armazenamento fica sempre em try/catch e tudo é testável.
 */

const PREFIX = "formula-rush.beta.record.v1";
/** Intervalo (s) entre amostras do fantasma. */
export const GHOST_STEP = 0.1;
/** Campos por amostra no vetor achatado: t, x, y, z, yaw. */
const STRIDE = 5;
/** Teto de amostras (~10 min de volta) para não estourar a cota do armazenamento. */
const MAX_SAMPLES = 6000;

export const recordKey = (circuitId, time) => `${PREFIX}.${circuitId}.${time}`;

/** Aceita qualquer coisa vinda do armazenamento; devolve `{ best, ghost }` válido ou `null`. */
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const best = Number(raw.best);
  if (!Number.isFinite(best) || best <= 0) return null;
  const ghost = Array.isArray(raw.ghost) && raw.ghost.length >= STRIDE * 2 && raw.ghost.length % STRIDE === 0 && raw.ghost.length <= MAX_SAMPLES * STRIDE && raw.ghost.every(Number.isFinite) ? raw.ghost : null;
  return { best, ghost };
}

export function loadRecord(circuitId, time, storage = globalThis.localStorage) {
  try {
    return normalizeRecord(JSON.parse(storage?.getItem(recordKey(circuitId, time)) ?? "null"));
  } catch {
    return null;
  }
}

export function saveRecord(circuitId, time, record, storage = globalThis.localStorage) {
  try {
    storage?.setItem(recordKey(circuitId, time), JSON.stringify({ best: record.best, ghost: record.ghost }));
    return true;
  } catch {
    return false; // Armazenamento bloqueado ou cheio: o recorde vale só nesta sessão.
  }
}

/** Uma volta é novo recorde se for válida e mais rápida que o recorde guardado. */
export function isNewRecord(lapTime, valid, record) {
  return valid !== false && Number.isFinite(lapTime) && lapTime > 0 && (!record || lapTime < record.best - 1e-6);
}

/** Grava a posição do carro a cada GHOST_STEP segundos de volta. */
export class GhostRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    this.data = [];
    this.nextAt = 0;
  }

  /** `lapTime`: segundos desde o início da volta atual. Amostra no máximo uma vez por passo. */
  sample(lapTime, x, y, z, yaw) {
    if (lapTime < this.nextAt || this.data.length >= MAX_SAMPLES * STRIDE) return;
    this.nextAt = lapTime + GHOST_STEP;
    const r = (v, k) => Math.round(v * k) / k;
    this.data.push(r(lapTime, 100), r(x, 10), r(y, 100), r(z, 10), r(yaw, 100));
  }

  /** Vetor achatado da volta, cortado em `lapTime` (descarta amostras além da linha de chegada). */
  finish(lapTime) {
    const out = [];
    for (let i = 0; i < this.data.length; i += STRIDE) {
      if (this.data[i] > lapTime) break;
      out.push(...this.data.slice(i, i + STRIDE));
    }
    return out;
  }
}

/** Posição do fantasma em `lapTime` (interpolada), ou `null` se a volta já acabou/ainda não há dados. */
export function ghostAt(ghost, lapTime, out = { x: 0, y: 0, z: 0, yaw: 0 }) {
  if (!ghost || ghost.length < STRIDE * 2 || lapTime < 0) return null;
  const last = ghost.length - STRIDE;
  if (lapTime > ghost[last]) return null;
  // Busca binária pela amostra anterior a lapTime.
  let lo = 0;
  let hi = last / STRIDE;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ghost[mid * STRIDE] <= lapTime) lo = mid;
    else hi = mid;
  }
  const a = lo * STRIDE;
  const b = Math.min(a + STRIDE, last);
  const span = ghost[b] - ghost[a];
  const k = span > 1e-9 ? (lapTime - ghost[a]) / span : 0;
  out.x = ghost[a + 1] + (ghost[b + 1] - ghost[a + 1]) * k;
  out.y = ghost[a + 2] + (ghost[b + 2] - ghost[a + 2]) * k;
  out.z = ghost[a + 3] + (ghost[b + 3] - ghost[a + 3]) * k;
  // Interpola o ângulo pelo caminho mais curto.
  let dyaw = ghost[b + 4] - ghost[a + 4];
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  out.yaw = ghost[a + 4] + dyaw * k;
  return out;
}
