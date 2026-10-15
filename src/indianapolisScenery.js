// Reconstrução procedural estimada, sem levantamento arquitetônico nem ativos
// de terceiros. Referências descritivas oficiais IMS: docs/indianapolis-2.0.md.
// Estações seguem EXATAMENTE o oval já existente no jogo (largada em s=0).
import { alignedFootprintClearanceAt, trackHalfWidthAt } from "./track.js";

export const INDIANAPOLIS_STANDS = [
  { id: "PRINCIPAL", start: 0, end: 918, rows: 16, covered: true },
  { id: "T1", start: 972, end: 1422, rows: 6, covered: false },
  { id: "NORTE", start: 1422, end: 1602, rows: 4, covered: false },
  { id: "T2", start: 1602, end: 2016, rows: 6, covered: false },
  { id: "OPOSTA", start: 2016, end: 3006, rows: 4, covered: false },
  { id: "T3", start: 3006, end: 3420, rows: 6, covered: false },
  { id: "SUL", start: 3420, end: 3618, rows: 4, covered: false },
  { id: "T4", start: 3618, end: 4023, rows: 6, covered: false },
  { id: "INTERNA", start: 144, end: 900, rows: 12, covered: true, side: -1, setback: 53 },
];

export const INDIANAPOLIS_SCENERY = {
  // Blocos menores limitam as bancadas processadas pelos espelhos (far=320 m).
  instanceCellSize: 180,
  stands: INDIANAPOLIS_STANDS,
  brakingStations: [],
  cameraStations: [240, 1240, 2400, 3250],
  fences: [{ from: 0, to: 4023, sides: [1] }, { from: 0, to: 970, sides: [-1] }],
  continuousSponsorZones: [[0, 1005], [2012, 3018]],
  hoardingStations: [],
  house: "indianapolis",
};

/** Projeções conservadoras incluem beirais; coordenadas sempre dentro da volta. */
export function planIndianapolisStands(track) {
  const modules = [];
  for (const stand of INDIANAPOLIS_STANDS) {
    const depth = stand.rows * .82 + 3;
    const side = stand.side ?? 1;
    for (let s = stand.start + 9; s <= stand.end - 9; s += 18) {
      const lane = side * (trackHalfWidthAt(s) + (stand.setback ?? 12) + depth / 2);
      if (alignedFootprintClearanceAt(track, s, lane, depth + 3, 18.1) < 3) continue;
      modules.push({ ...stand, s, lane, depth, length: 17.8, side });
    }
  }
  return modules;
}

/** Apoios e caixas máximas usadas também pelo construtor e pelos testes. */
export function planIndianapolisLandmarks() {
  return [
    { id: "pagoda", s: 65, lane: -48, width: 24, depth: 28 },
    { id: "pylon", s: 105, lane: -24, width: 3, depth: 3 },
    { id: "bridge-inner", s: 945, lane: -19, width: 1, depth: 5 },
    { id: "bridge-outer", s: 945, lane: 19, width: 1, depth: 5 },
    { id: "stairs-inner", s: 945, lane: -30, width: 20, depth: 5 },
    { id: "stairs-outer", s: 945, lane: 30, width: 20, depth: 5 },
    ...Array.from({ length: 37 }, (_, i) => ({ id: `pit-${i}`, s: 150 + i * 20, lane: -33, width: 17, depth: 20 })),
  ];
}
