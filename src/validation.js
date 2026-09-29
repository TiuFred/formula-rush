// Validações compartilhadas entre a identidade do jogador e o ranking.

export const CIRCUIT_IDS = Object.freeze([
  "interlagos",
  "monza",
  "indianapolis",
  "monaco",
  "spa",
]);

/**
 * Normaliza nomes sem interpretar HTML. Caracteres de controle são removidos,
 * espaços são compactados e o limite é aplicado por caractere Unicode.
 */
export function normalizePlayerName(value, fallback = "Piloto") {
  const normalized = String(value ?? "")
    // A faixa é intencional: controles ASCII viram espaços antes da compactação.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const limited = Array.from(normalized || fallback).slice(0, 16).join("");
  return ["__proto__", "prototype", "constructor"].includes(limited.toLowerCase()) ? fallback : limited;
}

/** Normaliza o número do carro para um ou dois algarismos. */
export function normalizePlayerNumber(value, fallback = "07") {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 2);
  return digits || fallback;
}

export function isKnownCircuitId(value) {
  return CIRCUIT_IDS.includes(value);
}

/** Barreira de sanidade; não pretende substituir validação autoritativa. */
export function isPlausibleLapTime(seconds) {
  return Number.isFinite(seconds) && seconds >= 20 && seconds <= 15 * 60;
}
