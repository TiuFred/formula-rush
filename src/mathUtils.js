// Utilitários matemáticos pequenos e puros, usados em várias partes do jogo.

/** Restringe `value` ao intervalo [min, max]. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Normaliza um ângulo (radianos) para o intervalo [-PI, PI]. */
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Interpolação suave (smoothstep) genérica sobre uma tabela ordenada de pontos
 * [distancia, valor], tratando `distance` como cíclico ao longo de `trackLength`.
 */
export function smoothstepLookup(table, distance, trackLength) {
  distance = (distance % trackLength + trackLength) % trackLength;
  for (let i = 1; i < table.length; i++) {
    if (distance <= table[i][0]) {
      let t = (distance - table[i - 1][0]) / (table[i][0] - table[i - 1][0]);
      t = t * t * (3 - 2 * t);
      return table[i - 1][1] + (table[i][1] - table[i - 1][1]) * t;
    }
  }
  return table[0][1];
}

/**
 * Distância sinalizada mais curta de `b` até `a` ao longo de um percurso
 * circular de comprimento `trackLength` (usado para comparar posições de
 * carros/itens ao redor da pista, considerando a volta).
 */
export function progressDelta(a, b, trackLength) {
  return (a - b + trackLength * 1.5) % trackLength - trackLength / 2;
}
