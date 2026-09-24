// Registro dos circuitos disponíveis. Cada entrada descreve: os arquivos de
// dados (GeoJSON do traçado real + elevação), metadados para a UI, e o
// "perfil" de tabelas específicas da pista (largura, banking, elevação de
// reserva, nomes de curva, posições de item, decorações). Trocar de
// circuito = chamar `applyCircuitProfile(id)`, que aplica esse perfil às
// constantes trocáveis em constants.js (ver o comentário no topo daquele
// arquivo) — nenhum outro módulo precisa saber que a pista mudou.

import {
  setTrackLength, setSectorNames, setFallbackElevationSamples,
  setTrackWidthSamples, setBankingSamples, setCornerWideningTable,
  setItemBoxPositions, setCornerNameSigns, setDistanceBoardStations,
  setZebraZones, setApexGrassPatches, setTrackNamePanelText,
} from "./constants.js";

export const CIRCUITS = {
  interlagos: {
    id: "interlagos",
    label: "Interlagos",
    subtitle: "BR / SÃO PAULO",
    fullName: "AUTÓDROMO JOSÉ CARLOS PACE",
    geojsonPath: "./interlagos.geojson",
    elevationPath: "./elevation.json",
    km: "4,309",
    turns: 15,
    direction: "ANTI-HORÁRIO",
    trackLength: 4309,
    sectorNames: [
      [0, "Reta dos Boxes"], [275, "S do Senna · T1"], [385, "S do Senna · T2"],
      [470, "Curva do Sol · T3"], [735, "Reta Oposta"], [1310, "Descida do Lago · T4"],
      [1480, "Descida do Lago · T5"], [1930, "Ferradura · T6–7"], [2215, "Laranjinha · T8"],
      [2360, "Pinheirinho · T9"], [2650, "Bico de Pato · T10"], [2860, "Mergulho · T11"],
      [3170, "Junção · T12"], [3300, "Café · T13"], [3550, "Subida dos Boxes · T14"],
      [3970, "Arquibancadas · T15"],
    ],
    widthSamples: [
      [0, 7.5], [260, 7.5], [460, 6.8], [900, 6.5], [1420, 6.4], [1820, 6.7],
      [2100, 6.2], [2400, 6], [2700, 6], [3040, 6.3], [3260, 6.4], [3590, 6.7],
      [3980, 7.5], [4309, 7.5],
    ],
    bankingSamples: [
      [0, 0], [250, .015], [340, .035], [410, -.025], [560, .04], [820, 0],
      [1280, 0], [1410, .025], [1650, 0], [1990, -.04], [2110, -.04],
      [2270, -.03], [2430, .035], [2650, -.03], [2740, -.035], [2930, .04],
      [3220, .03], [3420, .045], [3750, .065], [4000, .055], [4180, .012], [4309, 0],
    ],
    elevationSamples: [
      [0, 41], [275, 43], [342, 27], [428, 18], [726, 9], [1300, 7], [1498, 1],
      [1800, 18], [2088, 28], [2297, 26], [2423, 17], [2600, 20], [2719, 19],
      [2974, 8], [3235, 0], [3389, 8], [3620, 23], [3969, 38], [4309, 41],
    ],
    cornerWideningTable: function interlagosCornerWidening(s, side) {
      return [
        [0, 8], [230, 9], [340, side < 0 ? 25 : 11], [520, 13], [900, 8],
        [1310, side > 0 ? 23 : 12], [1510, 18], [1830, 10],
        [2040, side > 0 ? 19 : 9], [2250, 10], [2460, 10], [2730, 12],
        [2950, 12], [3200, side > 0 ? 22 : 12], [3430, 11], [3800, 8],
        [4309, 8],
      ];
    },
    itemBoxPositions: [680, 1090, 1730, 2120, 2480, 3070, 3690, 4090],
    cornerNameSigns: [
      [245, "S DO SENNA"], [1220, "DESCIDA DO LAGO"], [1880, "FERRADURA"],
      [2180, "LARANJINHA"], [2350, "PINHEIRINHO"], [2610, "BICO DE PATO"],
      [2890, "MERGULHO"], [3140, "JUNÇÃO"], [3470, "SUBIDA DOS BOXES"],
    ],
    distanceBoardStations: [305, 1360, 2020, 2270, 2700, 3240],
    zebraZones: [[260, 390, -1], [1270, 1490, 1], [1950, 2110, 1], [3150, 3290, 1]],
    apexGrassPatches: [340, 1380, 2040, 3220],
    trackNamePanelText: "INTERLAGOS",
  },

  monza: {
    id: "monza",
    label: "Monza",
    subtitle: "IT / MONZA",
    fullName: "AUTODROMO NAZIONALE MONZA",
    geojsonPath: "./monza.geojson",
    elevationPath: "./monza-elevation.json",
    km: "5,793",
    turns: 11,
    direction: "HORÁRIO",
    trackLength: 5793,
    // Curvas famosas de Monza, em distâncias APROXIMADAS (não medidas por
    // telemetria — o traçado geográfico é real, mas os marcadores de curva
    // são estimativas de proporção ao longo da volta; ver docs/AUDITORIA.md).
    sectorNames: [
      [0, "Reta Principal"], [300, "Variante del Rettifilo"], [850, "Curva Grande"],
      [1600, "Variante della Roggia"], [2200, "Lesmo 1"], [2450, "Lesmo 2"],
      [2700, "Serraglia (reta)"], [4250, "Variante Ascari"], [4700, "Reta Sul"],
      [5300, "Curva Parabolica"],
    ],
    // Monza é uma pista bem larga e praticamente plana: perfil simplificado
    // (sem a afinação curva a curva que a Interlagos tem).
    widthSamples: [[0, 7], [5793, 7]],
    bankingSamples: [[0, 0], [5793, 0]],
    elevationSamples: [
      [0, 2], [1500, 3], [3000, 1], [4300, 4], [5300, 2], [5793, 2],
    ],
    cornerWideningTable: function monzaCornerWidening(_s, _side) {
      return [[0, 3], [5793, 3]];
    },
    itemBoxPositions: [400, 1100, 1900, 2700, 3400, 4000, 4600, 5500],
    cornerNameSigns: [
      [300, "VARIANTE RETTIFILO"], [850, "CURVA GRANDE"], [1600, "VARIANTE ROGGIA"],
      [2200, "LESMO 1"], [2450, "LESMO 2"], [4250, "VARIANTE ASCARI"],
      [5300, "CURVA PARABOLICA"],
    ],
    distanceBoardStations: [],
    zebraZones: [],
    apexGrassPatches: [],
    trackNamePanelText: "MONZA",
  },

  indianapolis: {
    id: "indianapolis",
    label: "Indianápolis",
    subtitle: "EUA / INDIANA · OVAL",
    fullName: "INDIANAPOLIS MOTOR SPEEDWAY (OVAL)",
    geojsonPath: "./indianapolis.geojson",
    elevationPath: "./indianapolis-elevation.json",
    km: "4,023",
    turns: 4,
    direction: "ANTI-HORÁRIO",
    trackLength: 4023,
    // O OVAL de verdade da Indy 500 — não o traçado misto que a F1 usou de
    // 2000 a 2007. As medidas vêm das especificações oficiais reais do
    // autódromo: retas principal/oposta de 3.300 pés (1.005,8 m), as duas
    // "short chutes" de 660 pés (201,2 m) entre as curvas 1-2 e 3-4, e o
    // raio de curva resolvido para fechar em exatamente 2,5 milhas
    // (4.023,36 m) — ~256 m, cujo arco de 90° dá ~402 m, batendo com a
    // descrição real de "curvas de um quarto de milha". Ver docs/AUDITORIA.md.
    sectorNames: [
      [0, "Reta Principal (Largada)"], [1005, "Curva 1"],
      [1408, "Short Chute Norte"], [1609, "Curva 2"],
      [2012, "Contrarreta"], [3018, "Curva 3"],
      [3420, "Short Chute Sul"], [3621, "Curva 4"],
    ],
    // Indiana é geograficamente muito plana — o oval real não tem desnível.
    widthSamples: [[0, 9], [4023, 9]],
    // As 4 curvas reais são banked a 9°12' (~0,16 rad); as retas são planas.
    // Faixas de transição suave na entrada/saída de cada curva.
    bankingSamples: [
      [0, 0], [970, 0], [1030, .16], [1385, .16], [1440, 0],
      [1570, 0], [1630, .16], [1985, .16], [2040, 0],
      [2970, 0], [3030, .16], [3385, .16], [3440, 0],
      [3570, 0], [3630, .16], [3985, .16], [4023, 0],
    ],
    elevationSamples: [[0, 0], [4023, 0]],
    cornerWideningTable: function indyOvalCornerWidening(_s, _side) {
      return [[0, 2], [4023, 2]];
    },
    itemBoxPositions: [200, 500, 1300, 1800, 2300, 2600, 3200, 3800],
    cornerNameSigns: [
      [1005, "CURVA 1"], [1609, "CURVA 2"], [3018, "CURVA 3"], [3621, "CURVA 4"],
    ],
    distanceBoardStations: [],
    zebraZones: [],
    apexGrassPatches: [],
    trackNamePanelText: "INDY 500 OVAL",
  },
};

/**
 * Aplica o perfil do circuito `id` a todas as tabelas trocáveis em
 * constants.js. Deve ser chamada ANTES de `buildTrackModel`/`buildScene`.
 * Retorna a entrada do registro (metadados + caminhos dos arquivos de dados).
 */
export function applyCircuitProfile(id) {
  const circuit = CIRCUITS[id];
  if (!circuit) throw new Error("Circuito desconhecido: " + id);
  setTrackLength(circuit.trackLength);
  setSectorNames(circuit.sectorNames);
  setFallbackElevationSamples(circuit.elevationSamples);
  setTrackWidthSamples(circuit.widthSamples);
  setBankingSamples(circuit.bankingSamples);
  setCornerWideningTable(circuit.cornerWideningTable);
  setItemBoxPositions(circuit.itemBoxPositions);
  setCornerNameSigns(circuit.cornerNameSigns);
  setDistanceBoardStations(circuit.distanceBoardStations);
  setZebraZones(circuit.zebraZones);
  setApexGrassPatches(circuit.apexGrassPatches);
  setTrackNamePanelText(circuit.trackNamePanelText);
  return circuit;
}
