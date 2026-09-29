// Construção do "modelo de pista": converte o GeoJSON (coordenadas GPS reais
// de Interlagos) + dados de elevação em uma curva 3D fechada, e expõe
// funções para amostrar posição/orientação/largura/banking em qualquer ponto
// da pista (usadas tanto para desenhar a cena quanto para a física).
//
// Toda a matemática abaixo é idêntica à do bundle original (funções `eg`,
// `Qm`, `mo`, `_e`, `Hi`, `tg`, `ng`), só com nomes legíveis.

import * as THREE from "three";
import {
  TRACK_LENGTH,
  SECTOR_NAMES,
  FALLBACK_ELEVATION_SAMPLES,
  ELEVATION_SMOOTH,
  TRACK_WIDTH_SAMPLES,
  BANKING_SAMPLES,
  cornerWideningTable,
  DRS_ZONES,
} from "./constants.js";
import { smoothstepLookup, monotoneLookup } from "./mathUtils.js";

/** Meia-largura útil da pista (m) na distância `s`. */
export function trackHalfWidthAt(s) {
  return smoothstepLookup(TRACK_WIDTH_SAMPLES, s, TRACK_LENGTH);
}

/** Distância livre (m) entre um ponto do mundo e a borda mais próxima do asfalto. */
export function asphaltClearanceAt(track, x, z) {
  const nearest = track.nearest(x, z);
  return nearest.dist - nearest.halfWidth;
}

/**
 * Menor folga entre a pegada retangular de um objeto alinhado ao traçado e
 * qualquer trecho do asfalto. Valores negativos indicam uma obstrução.
 */
export function alignedFootprintClearanceAt(track, s, lane, width, depth) {
  const frame = track.at(s, lane);
  let clearance = Infinity;
  // Amostrar também o interior das arestas detecta outra perna da pista
  // cruzando uma placa comprida, mesmo quando seus quatro cantos estão livres.
  for (let lateralStep = -4; lateralStep <= 4; lateralStep++) {
    for (let longitudinalStep = -4; longitudinalStep <= 4; longitudinalStep++) {
      const lateral = (width * lateralStep) / 8;
      const longitudinal = (depth * longitudinalStep) / 8;
      const x = frame.p.x + frame.right.x * lateral + frame.t.x * longitudinal;
      const z = frame.p.z + frame.right.z * lateral + frame.t.z * longitudinal;
      clearance = Math.min(clearance, asphaltClearanceAt(track, x, z));
    }
  }
  return clearance;
}

/**
 * Cria um resolvedor de borda externa que evita duas falhas geométricas:
 * offset maior que o raio interno de uma curva e faixa lateral alcançando
 * outra perna próxima da pista. `extra` serve para runoff/terreno além do muro.
 */
export function createSafeTracksideOffset(track, trackLength) {
  const clearanceCache = new Map();
  const insideLimit = (side, s) => {
    // Usa o pico de curvatura numa janela curta, não só a derivada exata em
    // `s`. Hairpins com entrada muito rápida (Red Bull Ring/Yas) mudam de
    // raio dentro do próprio segmento do muro e um único ponto subestimava o
    // quanto o offset interno podia dobrar sobre a pista.
    let curvature = 0;
    for (let delta = -12; delta <= 12; delta += 4) {
      const dyaw = Math.atan2(
        Math.sin(track.at(s + delta + 4).yaw - track.at(s + delta - 4).yaw),
        Math.cos(track.at(s + delta + 4).yaw - track.at(s + delta - 4).yaw),
      );
      if (-side * dyaw > 0) curvature = Math.max(curvature, Math.abs(dyaw) / 8);
    }
    return curvature ? .82 / (curvature + 1e-6) : Infinity;
  };
  const legHalfGap = (s) => {
    const key = Math.round(s / 2);
    if (clearanceCache.has(key)) return clearanceCache.get(key);
    const p = track.at(s).p;
    let best = Infinity;
    for (let i = 0; i < track.samples.length; i++) {
      const arc = Math.abs(
        ((i * track.step - s) % trackLength + trackLength * 1.5) % trackLength - trackLength / 2,
      );
      if (arc <= 30) continue;
      const distance = Math.hypot(track.samples[i].x - p.x, track.samples[i].z - p.z);
      if (distance < arc * .7 && distance < best) best = distance;
    }
    const half = best / 2;
    clearanceCache.set(key, half);
    return half;
  };

  return (s, side, extra = 0) => {
    const asphalt = trackHalfWidthAt(s);
    const desired = asphalt + cornerWideningAt(s, side) + extra;
    const geometricLimit = Math.min(insideLimit(side, s), legHalfGap(s)) - .15;
    // 20 cm é a margem mínima do plano vertical do muro até o asfalto.
    return Math.max(asphalt + .2, Math.min(desired, geometricLimit));
  };
}

/** Inclinação lateral (banking, em radianos) da pista na distância `s`. */
export function bankingAt(s) {
  return smoothstepLookup(BANKING_SAMPLES, s, TRACK_LENGTH);
}

/**
 * Elevação de RESERVA (perfil hardcoded) usada quando o elevation.json não
 * traz amostras reais suficientes. `s` é a distância percorrida (m).
 */
function fallbackElevationAt(s) {
  return (ELEVATION_SMOOTH ? monotoneLookup : smoothstepLookup)(FALLBACK_ELEVATION_SAMPLES, s, TRACK_LENGTH);
}

/**
 * Alargamento extra da pista em curvas na distância `s`, dependente do lado
 * (`side`: sinal do lado do carro, padrão 1 = direita). A tabela em si é
 * específica de cada circuito — ver `cornerWideningTable` em constants.js.
 */
export function cornerWideningAt(s, side = 1) {
  return smoothstepLookup(cornerWideningTable(s, side), s, TRACK_LENGTH);
}

/**
 * `true` se a distância `s` cai dentro de alguma zona de DRS do circuito
 * ATIVO (`DRS_ZONES` em constants.js). Zonas com `inicio > fim` "atravessam"
 * a linha de largada (ex.: reta dos boxes).
 */
export function drsZoneAt(s) {
  s = ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  return DRS_ZONES.some(([start, end]) => (start <= end ? s >= start && s <= end : s >= start || s <= end));
}

/** Nome do setor/curva correspondente à distância `s`. */
export function sectorNameAt(s) {
  s = (s % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  return SECTOR_NAMES.filter((entry) => entry[0] <= s).at(-1)[1];
}

/**
 * Constrói o modelo 3D da pista a partir do GeoJSON do traçado (coordenadas
 * GPS) e, opcionalmente, de amostras reais de elevação.
 *
 * @param {object} geojson    Conteúdo de public/interlagos.geojson
 *                            (FeatureCollection; usa features[0]).
 * @param {object} [elevation] Conteúdo de public/elevation.json.
 *                            Se `elevation.samples` tiver MAIS de 5 pontos
 *                            [distancia_m, elevacao_m], eles são usados (com
 *                            suavização gaussiana). Caso contrário, usa-se o
 *                            perfil de reserva (fallbackElevationAt).
 */
export function buildTrackModel(geojson, elevation) {
  const rawCoords = geojson.features[0].geometry.coordinates.slice(0, -1);
  const origin = rawCoords[0];

  // Converte lon/lat (graus) em metros num plano local (equirretangular),
  // centrado na latitude do primeiro ponto.
  let points = rawCoords.map(
    ([lon, lat]) =>
      new THREE.Vector3(
        (lon - origin[0]) * 111320 * Math.cos((origin[1] * Math.PI) / 180),
        0,
        -(lat - origin[1]) * 111320
      )
  );

  // Distância acumulada real (m) ao longo da polilinha original.
  const cumulativeDist = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeDist[i] = cumulativeDist[i - 1] + points[i].distanceTo(points[i - 1]);
  }
  const rawLength = cumulativeDist.at(-1) + points.at(-1).distanceTo(points[0]);

  // Escolhe a função de elevação: amostras reais (suavizadas) ou fallback.
  let elevationFn = fallbackElevationAt;
  if (elevation?.samples?.length > 5) {
    const samples = elevation.samples;
    const baseline = Math.min(...samples.map((pair) => pair[1]));
    const lookupRaw = (s) => {
      s = (s % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
      for (let i = 1; i < samples.length; i++) {
        if (s <= samples[i][0]) {
          const t = (s - samples[i - 1][0]) / (samples[i][0] - samples[i - 1][0]);
          return samples[i - 1][1] * (1 - t) + samples[i][1] * t - baseline;
        }
      }
      return samples[0][1] - baseline;
    };
    // Suavização gaussiana (janela de ±4 amostras espaçadas de 12 m).
    elevationFn = (s) => {
      let weighted = 0;
      let weightSum = 0;
      for (let k = -4; k <= 4; k++) {
        const w = Math.exp((-k * k) / 5);
        weighted += lookupRaw(s + k * 12) * w;
        weightSum += w;
      }
      return weighted / weightSum;
    };
  }

  // Aplica a elevação a cada ponto, reparametrizando a distância real (m)
  // para a escala "canônica" TRACK_LENGTH usada pelo resto do jogo.
  points.forEach((p, i) => {
    p.y = elevationFn((cumulativeDist[i] / rawLength) * TRACK_LENGTH);
  });

  // Centraliza o traçado em (0, y, 0) no plano XZ.
  const bounds = new THREE.Box3().setFromPoints(points);
  const center = bounds.getCenter(new THREE.Vector3());
  points.forEach((p) => {
    p.x -= center.x;
    p.z -= center.z;
  });

  // Curva fechada (Catmull-Rom centrípeta) e reescala para exatamente
  // TRACK_LENGTH metros de comprimento.
  let curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  curve.arcLengthDivisions = 12000;
  const scale = TRACK_LENGTH / curve.getLength();
  points.forEach((p) => p.multiplyScalar(scale));
  curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  curve.arcLengthDivisions = 12000;

  const SAMPLE_COUNT = TRACK_LENGTH === 4309 ? 2154 : Math.round(TRACK_LENGTH / 2);
  let samples = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, -1);

  // GeoJSONs públicos descrevem curvas apertadas com poucos vértices. Mesmo
  // com Catmull-Rom, isso pode produzir um pico de curvatura menor que a
  // meia-largura da pista: a borda interna então volta sobre si mesma e alguns
  // triângulos do asfalto somem por ficarem invertidos. Suavizar a polilinha
  // já densamente amostrada arredonda só esses picos (janela efetiva ~7 m),
  // preservando o desenho geral e a metragem oficial de cada circuito.
  for (let pass = 0; pass < 12; pass++) {
    samples = samples.map((point, i) =>
      samples[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT].clone().multiplyScalar(.25)
        .addScaledVector(point, .5)
        .addScaledVector(samples[(i + 1) % SAMPLE_COUNT], .25)
    );
  }
  curve = new THREE.CatmullRomCurve3(samples, true, "centripetal");
  curve.arcLengthDivisions = 12000;
  const smoothedScale = TRACK_LENGTH / curve.getLength();
  samples.forEach((p) => p.multiplyScalar(smoothedScale));
  curve = new THREE.CatmullRomCurve3(samples, true, "centripetal");
  curve.arcLengthDivisions = 12000;
  samples = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, -1);
  const step = TRACK_LENGTH / SAMPLE_COUNT;

  /**
   * Amostra a pista na distância `s` (m), com deslocamento lateral opcional
   * `lane` (m, positivo/negativo = direita/esquerda do sentido de corrida).
   * Retorna posição, tangente, vetor lateral, banking, meia-largura e yaw.
   */
  function at(s, lane = 0) {
    let normalized = ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH / step;
    const idx = Math.floor(normalized);
    const a = samples[idx];
    const b = samples[(idx + 1) % SAMPLE_COUNT];
    const localT = normalized - idx;
    const position = a.clone().lerp(b, localT);
    const tangent = b.clone().sub(a).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const bank = bankingAt(s);
    right.y = Math.tan(bank);
    position.addScaledVector(right, lane);
    return {
      p: position,
      t: tangent,
      right,
      bank,
      halfWidth: trackHalfWidthAt(s),
      yaw: Math.atan2(tangent.x, tangent.z),
    };
  }

  /**
   * Encontra o ponto mais próximo da pista para a posição mundial (x, z).
   * `hintS`, se fornecido, restringe a busca a uma janela ao redor dessa
   * distância (muito mais rápido; usado a cada frame de física).
   */
  function nearest(x, z, hintS) {
    let bestDistSq = Infinity;
    let bestParam = 0;
    const testSegment = (i) => {
      i = (i + SAMPLE_COUNT) % SAMPLE_COUNT;
      const a = samples[i];
      const b = samples[(i + 1) % SAMPLE_COUNT];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const distSq = (x - px) ** 2 + (z - pz) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestParam = i + t;
      }
    };
    if (hintS === undefined) {
      for (let i = 0; i < SAMPLE_COUNT; i++) testSegment(i);
    } else {
      const hintIdx = Math.floor(hintS / step);
      for (let d = -45; d <= 45; d++) testSegment(hintIdx + d);
    }
    const s = bestParam * step;
    const frame = at(s);
    return {
      s,
      dist: Math.sqrt(bestDistSq),
      lane: (x - frame.p.x) * frame.right.x + (z - frame.p.z) * frame.right.z,
      ...frame,
    };
  }

  return { samples, at, nearest, step, N: SAMPLE_COUNT, curve, center };
}
