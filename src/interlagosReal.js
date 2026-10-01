// Posições reais das estruturas de Interlagos, medidas sobre dados abertos.
//
// Fonte geométrica: OpenStreetMap (© colaboradores do OpenStreetMap, ODbL) —
// polígonos `building=grandstand`, `leisure=bleachers`, `building=pavilion`
// (complexo dos boxes), passarela (`bridge=yes`, `highway=footway`) e a torre
// (`man_made=tower`) do autódromo, consultados em 01/10/2026. O traçado do jogo
// (bacinger/f1-circuits) foi encaixado nas coordenadas do OSM por mínimos
// quadrados (escala 1,0009; erro médio de 17 cm, máximo de 81 cm), e cada
// polígono foi projetado em (estação `s`, deslocamento lateral `lane`) com a
// mesma função `track.nearest` usada pelo jogo. Lane positiva = direita do
// sentido de corrida (lado oposto aos boxes).
//
// Fonte descritiva: setores do site oficial do GP São Paulo
// (https://f1saopaulo.com.br/arquibancadas/): A na curva que leva à reta
// principal e à entrada dos boxes; B com vista do grid e do pódio; M na reta
// principal de frente para os boxes; D no S do Senna; H entre o S e a Curva do
// Sol; R na Curva do Sol/início da Reta Oposta; G no fim da Reta Oposta.
//
// Onde o OSM não tem dados (H, R, G, Porto) mantêm-se as posições do mapa
// oficial usadas antes. Medidas de altura e número de filas continuam estimadas.
// Detalhes e limites de fidelidade: docs/interlagos-2.0.md.

/** Setores de arquibancada. `start`/`end` em metros ao longo da pista (negativo = antes da linha). */
export const INTERLAGOS_STANDS = [
  // OSM leisure=bleachers: s 3671–3920, lane 19–34 (≈15 m de profundidade).
  { id: "A", start: -638, end: -389, rows: 15, covered: false },
  // OSM building=grandstand: s 4209–4310, lane 19–35.
  { id: "B", start: -100, end: 0, rows: 16, covered: true },
  // OSM building=grandstand (duas partes, "M"): s 21–254, lane 18–47 (≈25 m: o maior setor).
  { id: "M", start: 22, end: 254, rows: 26, covered: true },
  // OSM building=construction: s 274–352, lane 29–46 (curva junto ao S do Senna).
  { id: "D", start: 274, end: 352, rows: 16, covered: true },
  { id: "H", start: 420, end: 528, rows: 17, covered: true },
  { id: "R", start: 570, end: 714, rows: 18, covered: true },
  { id: "G", start: 770, end: 1238, rows: 22, covered: false },
  { id: "PORTO", start: 1280, end: 1352, rows: 18, covered: true },
];

/**
 * Passarela sobre a pista no início do S do Senna: OSM bridge=yes, s 259–267,
 * vão de lane −24 a +24 e rampas/escadas até lane ±40.
 */
export const INTERLAGOS_BRIDGE = { s: 262, span: 24, rampLength: 16 };

/** Torre OSM (man_made=tower): s 4085 (−224 m), lane +57, atrás dos setores A/B. */
export const INTERLAGOS_TOWER = { s: -224, lane: 57 };

/**
 * Complexo dos boxes: OSM building=pavilion, s −38…392, lane −68…−15 (≈430 m
 * ao longo do lado dos boxes, começando antes da linha de chegada).
 * `controlCenter` é o prédio isolado de 1.236 m² (s −64…−21, lane −52…−19)
 * junto ao início do complexo: centro de controle/torre da direção de prova.
 */
export const INTERLAGOS_PITS = {
  from: -8,
  to: 392,
  controlCenter: { s: -42, lane: -35, length: 40, depth: 28 },
};

/**
 * Trechos com placas de patrocínio contínuas, como nas transmissões: reta dos
 * boxes (A→S do Senna, com as arquibancadas) e a Subida dos Boxes. No resto da
 * volta as placas ficam do lado de fora das curvas, em blocos.
 */
export const INTERLAGOS_CONTINUOUS_SPONSOR_ZONES = [
  [-700, 470],
  [3560, 4309],
];

/** Frenagens principais, onde ficam os painéis grandes do lado de fora da curva. */
export const INTERLAGOS_HOARDING_STATIONS = [212, 1196, 1905, 2150, 2570, 2880, 3150, 3560];
