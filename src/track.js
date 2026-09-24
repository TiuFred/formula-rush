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
  TRACK_WIDTH_SAMPLES,
  BANKING_SAMPLES,
  cornerWideningTable,
} from "./constants.js";
import { smoothstepLookup } from "./mathUtils.js";

/** Meia-largura útil da pista (m) na distância `s`. */
export function trackHalfWidthAt(s) {
  return smoothstepLookup(TRACK_WIDTH_SAMPLES, s, TRACK_LENGTH);
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
  return smoothstepLookup(FALLBACK_ELEVATION_SAMPLES, s, TRACK_LENGTH);
}

/**
 * Alargamento extra da pista em curvas na distância `s`, dependente do lado
 * (`side`: sinal do lado do carro, padrão 1 = direita). A tabela em si é
 * específica de cada circuito — ver `cornerWideningTable` em constants.js.
 */
export function cornerWideningAt(s, side = 1) {
  return smoothstepLookup(cornerWideningTable(s, side), s, TRACK_LENGTH);
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
  const samples = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, -1);
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
