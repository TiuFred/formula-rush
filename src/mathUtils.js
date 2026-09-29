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
 * Interpolação cúbica MONÓTONA (Fritsch–Carlson) sobre a mesma tabela
 * [distância, valor] de `smoothstepLookup`, também cíclica. Diferença crucial:
 * o smoothstep zera a inclinação em CADA amostra (o perfil vira degraus:
 * plano na amostra, ~1,5× mais íngreme entre elas) — péssimo pra elevação com
 * muitas amostras (a física usa a inclinação e o carro "engasga"/acelera aos
 * trancos). A cúbica monótona mantém a inclinação contínua e nunca ultrapassa
 * os valores das amostras (sem "ondas" entre elas).
 */
export function monotoneLookup(table, distance, trackLength) {
  distance = (distance % trackLength + trackLength) % trackLength;
  const n = table.length;
  const slope = [];
  for (let i = 0; i < n - 1; i++) slope.push((table[i + 1][1] - table[i][1]) / (table[i + 1][0] - table[i][0]));
  const tangent = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) { tangent[i] = (3 * a / h) * slope[i]; tangent[i + 1] = (3 * b / h) * slope[i]; }
  }
  for (let i = 1; i < n; i++) {
    if (distance <= table[i][0]) {
      const x0 = table[i - 1][0];
      const dx = table[i][0] - x0;
      const t = (distance - x0) / dx;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * table[i - 1][1] + (t3 - 2 * t2 + t) * dx * tangent[i - 1] +
        (-2 * t3 + 3 * t2) * table[i][1] + (t3 - t2) * dx * tangent[i];
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
