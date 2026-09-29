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
  setZebraZones, setApexGrassPatches, setTrackNamePanelText, setDrsZones,
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
    // Reta dos boxes (atravessa a largada) e reta oposta — posições aproximadas.
    drsZones: [[4000, 260], [800, 1290]],
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
    // Reta principal (atravessa a largada) e a reta após a Curva Grande.
    drsZones: [[5350, 280], [900, 1550]],
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
    // Num oval, as duas retas praticamente inteiras valem como zona de DRS.
    drsZones: [[3650, 950], [2050, 2950]],
  },

  monaco: {
    id: "monaco",
    label: "Mônaco",
    subtitle: "MC / MONTE CARLO",
    fullName: "CIRCUIT DE MONACO",
    geojsonPath: "./monaco.geojson",
    elevationPath: "./monaco-elevation.json",
    km: "3,337",
    turns: 19,
    direction: "HORÁRIO",
    trackLength: 3337,
    // Circuito de rua real (traçado geográfico de bacinger/f1-circuits) —
    // distâncias das curvas famosas são proporções estimadas ao longo da
    // volta (mesma ressalva já feita pra Monza em docs/AUDITORIA.md), não
    // medição por telemetria.
    sectorNames: [
      [0, "Reta dos Boxes"], [150, "Sainte Devote · T1"], [400, "Subida Beau Rivage"],
      [650, "Massenet · T3"], [800, "Casino Square · T4"], [1000, "Mirabeau · T5"],
      [1150, "Grand Hotel Hairpin · T6"], [1300, "Portier · T8"], [1450, "Túnel"],
      [1900, "Nouvelle Chicane · T10-11"], [2100, "Tabac · T12"], [2300, "Piscina · T13-16"],
      [2750, "La Rascasse · T18"], [2950, "Antony Noghès · T19"],
    ],
    // Circuito de rua notoriamente estreito — bem mais apertado que os
    // outros, sobretudo nas chicanes (Piscina, Nouvelle Chicane) e na
    // Rascasse/Grand Hotel Hairpin.
    widthSamples: [
      [0, 8.5], [140, 7.8], [380, 8], [630, 7.6], [790, 7], [990, 6.8],
      [1140, 6], [1290, 6.8], [1450, 7.2], [1880, 6], [2090, 6.4],
      [2280, 6], [2740, 6.2], [2940, 7], [3337, 8.5],
    ],
    // Rua asfaltada com camber leve, sem banking de autódromo de verdade.
    bankingSamples: [[0, 0], [1450, .01], [1900, -.015], [2300, .01], [3337, 0]],
    // A característica mais marcante de Monte Carlo pra um circuito de rua:
    // sobe forte da largada (beira do porto) até o Casino Square (ponto
    // mais alto do traçado) e desce de novo até o túnel/piscina, na beira
    // d'água. Perfil estilizado a partir do desnível real conhecido do
    // circuito (~42 m), não uma amostragem SRTM ponto a ponto.
    elevationSamples: [
      [0, 5], [150, 6], [400, 18], [650, 30], [800, 42], [1000, 33],
      [1150, 24], [1300, 12], [1450, 6], [1900, 5], [2300, 4],
      [2750, 5], [2950, 5], [3337, 5],
    ],
    cornerWideningTable: function monacoCornerWidening(_s, _side) {
      return [
        [0, 4], [150, 10], [650, 6], [800, 8], [1000, 9], [1150, 16],
        [1300, 9], [1900, 12], [2100, 8], [2300, 11], [2750, 14],
        [2950, 8], [3337, 4],
      ];
    },
    itemBoxPositions: [500, 900, 1600, 2000, 2500, 3100],
    cornerNameSigns: [
      [150, "SAINTE DEVOTE"], [800, "CASINO"], [1150, "GRAND HOTEL HAIRPIN"],
      [1450, "TÚNEL"], [1900, "NOUVELLE CHICANE"], [2300, "PISCINA"],
      [2750, "LA RASCASSE"],
    ],
    distanceBoardStations: [],
    // Rua real: sem zebras de autódromo nem grama — é tudo asfalto e muro.
    zebraZones: [],
    apexGrassPatches: [],
    trackNamePanelText: "MONACO",
    // Só existe uma zona de DRS de verdade em Monaco: a reta dos boxes.
    drsZones: [[3050, 130]],
  },

  spa: {
    id: "spa",
    label: "Spa-Francorchamps",
    subtitle: "BE / ARDENAS",
    fullName: "CIRCUIT DE SPA-FRANCORCHAMPS",
    geojsonPath: "./spa.geojson",
    elevationPath: "./spa-elevation.json",
    km: "7,004",
    turns: 20,
    direction: "HORÁRIO",
    trackLength: 7004,
    // Traçado geográfico real (bacinger/f1-circuits); distâncias das curvas
    // famosas são proporções estimadas ao longo da volta, mesma ressalva
    // já feita pra Monza/Mônaco.
    sectorNames: [
      [0, "Reta Principal"], [350, "La Source · T1"], [700, "Eau Rouge"],
      [850, "Raidillon"], [1450, "Reta Kemmel"], [2100, "Les Combes · T5-7"],
      [2500, "Malmedy · T8"], [2750, "Bruxelles · T9"], [3600, "Pouhon · T10-11"],
      [4300, "Fagnes · T12-13"], [5100, "Stavelot · T14-15"], [5700, "Blanchimont · T16"],
      [6500, "Bus Stop · T17-20"],
    ],
    // Autódromo moderno, largo e rápido — mais largo que Interlagos na
    // maior parte da volta, afunilando só na Source e no Bus Stop.
    widthSamples: [
      [0, 12], [330, 9], [700, 11], [1450, 12], [2080, 9.5], [2500, 10.5],
      [3600, 12], [4300, 11], [5100, 11], [5700, 12], [6480, 9], [7004, 12],
    ],
    // Eau Rouge/Raidillon e Blanchimont/Pouhon têm banking real perceptível
    // (parte do que torna essas curvas tomáveis em alta velocidade).
    bankingSamples: [
      [0, 0], [700, .02], [850, .05], [1450, 0], [3600, .03],
      [5700, .04], [6480, 0], [7004, 0],
    ],
    // A marca registrada de Spa: ~100 m de desnível total, esculpido nas
    // colinas das Ardenas. Subida forte logo depois da Source (Eau
    // Rouge/Raidillon, o trecho mais famoso do calendário), pico perto de
    // Les Combes, descida longa até Pouhon/Stavelot, subida de novo até o
    // Bus Stop. Perfil estilizado a partir do desnível real conhecido do
    // circuito, não uma amostragem SRTM ponto a ponto.
    elevationSamples: [
      [0, 30], [350, 20], [700, 14], [850, 45], [1450, 52], [2100, 50],
      [2500, 38], [2750, 25], [3600, 10], [4300, 15], [5100, 20],
      [5700, 30], [6500, 35], [7004, 30],
    ],
    cornerWideningTable: function spaCornerWidening(_s, _side) {
      return [
        [0, 5], [350, 14], [850, 8], [2080, 13], [2500, 9], [2750, 10],
        [3600, 7], [5100, 9], [6480, 13], [7004, 5],
      ];
    },
    itemBoxPositions: [500, 1100, 1700, 2300, 3000, 3900, 4700, 5500, 6200],
    cornerNameSigns: [
      [350, "LA SOURCE"], [700, "EAU ROUGE"], [850, "RAIDILLON"],
      [2100, "LES COMBES"], [2750, "BRUXELLES"], [3600, "POUHON"],
      [5100, "STAVELOT"], [5700, "BLANCHIMONT"], [6500, "BUS STOP"],
    ],
    distanceBoardStations: [400, 1500, 3700, 5800],
    zebraZones: [[700, 950, 1], [3550, 3700, -1], [6450, 6600, 1]],
    apexGrassPatches: [850, 3600, 5700],
    trackNamePanelText: "SPA-FRANCORCHAMPS",
    // DRS real de Spa: reta principal (antes da Source) e reta de Kemmel
    // (depois de Raidillon).
    drsZones: [[6800, 250], [950, 1450]],
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
  setDrsZones(circuit.drsZones);
  return circuit;
}
