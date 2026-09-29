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
  setZebraZones, setApexGrassPatches, setTrackNamePanelText, setDrsZones, setScenery, setElevationSmooth,
} from "./constants.js";

/**
 * Monta `bankingSamples` a partir de [distância do ápice, banking]: cada
 * ápice vira um "morrinho" que sobe do zero uns 45 m antes e volta ao zero uns
 * 45 m depois (positivo = curva à esquerda, negativo = à direita). Só serve
 * pra ápices espaçados de pelo menos 2×45 m — os circuitos usam só assim.
 */
function bankingFromApexes(length, apexes, span = 45) {
  const out = [[0, 0]];
  for (const [s, bank] of apexes) {
    if (s - span > out.at(-1)[0]) out.push([s - span, 0]);
    out.push([s, bank]);
    out.push([s + span, 0]);
  }
  out.push([length, 0]);
  return out;
}

/** Acrescenta `extraPerSide` à meia-largura sem alterar as estações. */
function widenAsphalt(samples, extraPerSide) {
  return samples.map(([s, halfWidth]) => [s, halfWidth + extraPerSide]);
}

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
    // A tabela original derrubava 16 m em 67 m no S do Senna (~35% de rampa
    // de pico); agora ~12%, e a cúbica monótona tira o efeito "degrau".
    smoothElevation: true,
    sectorNames: [
      [0, "Reta dos Boxes"], [275, "S do Senna · T1"], [385, "S do Senna · T2"],
      [470, "Curva do Sol · T3"], [735, "Reta Oposta"], [1310, "Descida do Lago · T4"],
      [1480, "Descida do Lago · T5"], [1930, "Ferradura · T6–7"], [2215, "Laranjinha · T8"],
      [2360, "Pinheirinho · T9"], [2650, "Bico de Pato · T10"], [2860, "Mergulho · T11"],
      [3170, "Junção · T12"], [3300, "Café · T13"], [3550, "Subida dos Boxes · T14"],
      [3970, "Arquibancadas · T15"],
    ],
    // +0,65 m por lado: mais tolerante sem descaracterizar o traçado.
    widthSamples: widenAsphalt([
      [0, 7.5], [260, 7.5], [460, 6.8], [900, 6.5], [1420, 6.4], [1820, 6.7],
      [2100, 6.2], [2400, 6], [2700, 6], [3040, 6.3], [3260, 6.4], [3590, 6.7],
      [3980, 7.5], [4309, 7.5],
    ], .65),
    bankingSamples: [
      [0, 0], [250, .015], [340, .035], [410, -.025], [560, .04], [820, 0],
      [1280, 0], [1410, .025], [1650, 0], [1990, -.04], [2110, -.04],
      [2270, -.03], [2430, .035], [2650, -.03], [2740, -.035], [2930, .04],
      [3220, .03], [3420, .045], [3750, .065], [4000, .055], [4180, .012], [4309, 0],
    ],
    elevationSamples: [
      [0, 41], [275, 43], [360, 33], [470, 22], [726, 9], [1300, 7], [1498, 1],
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
    scenery: {
      theme: "tropical",
      // O "Lago" de Interlagos, do lado de dentro da Descida do Lago (T4–T5).
      harbor: { segments: [[1330, 1600]], depth: 140 },
      waterColor: "#3d8f97",
      seatColors: ["#ffdf00", "#0e7a3b", "#f0e7d6", "#1e4f9c", "#eac170"],
      banners: {
        texts: ["BRASIL", "SÃO PAULO", "INTERLAGOS", "GRANDE PRÊMIO"],
        styles: [["#0e7a3b", "#ffdf00"], ["#1e4f9c", "#f3f3ec"], ["#ffdf00", "#0e5a2c"]],
        from: -430, to: -70, step: 90,
      },
      // Skyline paulistana ao fundo, num arco atrás da reta oposta.
      skyline: {
        count: 90, radius: [720, 1000], angle: [.2, 2.6], height: [50, 240],
        palette: ["#8fb0c4", "#a9b9bd", "#d5d1c4", "#7d98ab", "#c4ced2"],
      },
    },
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
    // Distâncias medidas na própria curva do jogo (mesma spline e escala que a
    // física usa), a partir dos ápices reais: Rettifilo 595/675, Roggia
    // 1820/1895, Lesmo 1 ~2245, Lesmo 2 2570, Ascari 3635–3855, Parabolica
    // 4860–5015. (A tabela antiga, "proporções estimadas", errava a Ascari em
    // ~600 m, a Parabolica em ~450 m e a Rettifilo/Roggia em ~250 m.) Cada
    // entrada começa uns 60–70 m ANTES do ápice, como nos outros circuitos.
    sectorNames: [
      [0, "Reta Principal"], [530, "Variante del Rettifilo · T1-2"], [740, "Curva Grande · T3"],
      [1450, "Reta"], [1760, "Variante della Roggia · T4-5"], [1960, "Reta"],
      [2170, "Lesmo 1 · T6"], [2330, "Reta"], [2510, "Lesmo 2 · T7"], [2660, "Serraglia (reta)"],
      [3570, "Variante Ascari · T8-10"], [3900, "Reta Sul"], [4790, "Curva Parabolica · T11"],
      [5150, "Reta Principal"],
    ],
    // Monza é uma pista bem larga e praticamente plana: perfil simplificado
    // (sem a afinação curva a curva que a Interlagos tem).
    widthSamples: widenAsphalt([[0, 7], [5793, 7]], .65),
    bankingSamples: [[0, 0], [5793, 0]],
    elevationSamples: [
      [0, 2], [1500, 3], [3000, 1], [4300, 4], [5300, 2], [5793, 2],
    ],
    cornerWideningTable: function monzaCornerWidening(_s, _side) {
      return [[0, 3], [5793, 3]];
    },
    itemBoxPositions: [400, 1250, 1650, 2700, 3400, 4000, 4600, 5500],
    cornerNameSigns: [
      [595, "VARIANTE RETTIFILO"], [900, "CURVA GRANDE"], [1860, "VARIANTE ROGGIA"],
      [2245, "LESMO 1"], [2570, "LESMO 2"], [3755, "VARIANTE ASCARI"],
      [4900, "CURVA PARABOLICA"],
    ],
    distanceBoardStations: [],
    zebraZones: [],
    apexGrassPatches: [],
    trackNamePanelText: "MONZA",
    // Reta principal (atravessa a largada) e a reta Ascari → Parabolica.
    drsZones: [[5300, 540], [3920, 4760]],
    scenery: {
      theme: "woodland",
      // Arquibancadas vermelhas/brancas/verdes: as cores da Itália (e da Ferrari).
      seatColors: ["#c5212b", "#f2f2ea", "#0a7a3a", "#c5212b", "#2a2a2a"],
      banners: {
        texts: ["MONZA", "ITALIA", "AUTODROMO", "FORZA"],
        styles: [["#0a7a3a", "#f2f2ea"], ["#f2f2ea", "#c5212b"], ["#c5212b", "#f2f2ea"]],
        from: -430, to: -70, step: 90,
      },
    },
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
    widthSamples: widenAsphalt([[0, 9], [4023, 9]], .75),
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
    scenery: {
      theme: "speedway",
      // Arquibancadas próprias em volta do oval inteiro (ver buildSpeedwayComplex).
      grandstands: false,
      pitBuilding: false,
      // Lago do campo de golfe do infield, do lado esquerdo da reta oposta.
      harbor: { segments: [[2200, 2800]], depth: 100 },
      waterColor: "#3a8aa8",
      skyline: {
        count: 34, radius: [820, 1000], angle: [3.6, 5.2], height: [70, 210],
        palette: ["#8fa2b0", "#aab6bd", "#cfd0c8", "#7c8f9e"],
      },
    },
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
    smoothElevation: true,
    // Traçado real (bacinger/f1-circuits, MIT) girado pra o índice 0 ser a
    // LINHA DE LARGADA de verdade (reta dos boxes, logo depois do Antony
    // Noghès) — o ponto inicial do arquivo original é o Casino Square.
    // Distâncias das curvas medidas na própria curva do jogo (mesma spline e
    // escala que a física usa), não estimadas por proporção.
    sectorNames: [
      [0, "Reta dos Boxes"], [150, "Sainte Dévote · T1"], [270, "Subida de Beau Rivage"],
      [650, "Massenet · T3"], [820, "Casino Square · T4"], [960, "Descida de Mirabeau"],
      [1060, "Mirabeau Haute · T5"], [1180, "Grand Hotel Hairpin · T6"], [1270, "Mirabeau Bas · T7"],
      [1360, "Portier · T8"], [1470, "Túnel"], [1800, "Beira-Mar"],
      [1990, "Nouvelle Chicane · T10-11"], [2200, "Reta do Porto"], [2330, "Tabac · T12"],
      [2440, "Piscina · T13-16"], [2850, "La Rascasse · T17"], [3000, "Antony Noghès · T18-19"],
    ],
    // Meia-largura: rua de verdade (~10 m de asfalto), bem mais estreita que
    // qualquer autódromo — só alarga um pouco na reta dos boxes e no Grand
    // Hotel Hairpin (a curva mais lenta da F1, precisa de raio pra caber).
    // +0,45 m por lado: ganho moderado, preservando a folga entre as duas
    // pernas muito próximas do Grand Hotel Hairpin.
    widthSamples: widenAsphalt([
      [0, 6.4], [120, 6.2], [185, 5.4], [260, 5], [480, 5], [700, 5.1], [760, 5.1],
      [860, 5.6], [1000, 5], [1100, 5.2], [1250, 5.6], [1300, 5.1], [1410, 4.8],
      [1470, 5.2], [1790, 5.2], [2000, 4.8], [2030, 4.7], [2150, 4.8], [2200, 5.2],
      [2370, 4.9], [2480, 4.7], [2650, 4.7], [2800, 4.8], [2900, 5.4], [3070, 5.2],
      [3200, 6.2], [3337, 6.4],
    ], .45),
    // Asfalto de rua com camber suave — nada de banking de autódromo.
    bankingSamples: bankingFromApexes(3337, [
      [735, .015], [875, -.02], [1255, .03], [1415, -.02], [2030, .015], [2110, -.015], [2905, -.02],
    ]),
    // Do nível do porto (~5 m) até o Casino Square (~42 m, o ponto mais alto),
    // e de volta ao nível do mar na Beira-Mar/Piscina — os ~40 m de desnível
    // reais do circuito. A subida de Beau Rivage é forte no começo.
    elevationSamples: [
      [0, 5], [100, 5], [200, 7], [300, 17], [480, 27], [735, 36], [875, 42],
      [1105, 37], [1255, 30], [1415, 12], [1480, 7], [1780, 5], [2030, 4],
      [2380, 4], [2650, 4], [2905, 4], [3070, 5], [3337, 5],
    ],
    // Rua: muros/guard-rails próximos do asfalto. No lado interno do Grand
    // Hotel Hairpin, as duas pernas ficam a menos de 2 m uma da outra depois
    // da ampliação; ali o divisor acompanha a borda em vez de atravessar a
    // outra perna da pista.
    cornerWideningTable: function monacoCornerWidening(_s, side) {
      return side < 0
        ? [[0, 3.4], [1080, 3.4], [1130, .8], [1320, .8], [1380, 3.4], [3337, 3.4]]
        : [[0, 3.4], [3337, 3.4]];
    },
    // (nada perto da linha: as últimas fileiras do grid ocupam ~120 m antes dela)
    itemBoxPositions: [380, 560, 950, 1600, 1720, 2230, 3110, 3170],
    cornerNameSigns: [
      [200, "SAINTE DÉVOTE"], [735, "MASSENET"], [875, "CASINO"], [1255, "GRAND HOTEL"],
      [1415, "PORTIER"], [2030, "NOUVELLE CHICANE"], [2380, "TABAC"], [2650, "PISCINA"],
      [2905, "LA RASCASSE"],
    ],
    distanceBoardStations: [],
    // Rua real: sem zebras de brita nem gramados — só asfalto, guard-rail e muro.
    zebraZones: [],
    apexGrassPatches: [],
    trackNamePanelText: "MONACO",
    // Só existe uma zona de DRS de verdade em Mônaco: a reta dos boxes.
    drsZones: [[3090, 170]],
    scenery: {
      theme: "street",
      pitBoxSpacing: 10.5,
      grandstands: false,
      tunnel: [1490, 1790],
      // Port Hercule: fica DENTRO da grande volta, à esquerda da Beira-Mar
      // (reta do porto) e da perna da Piscina — dois quadriláteros de água.
      harbor: { segments: [[1800, 2330], [2330, 2860]], depth: 200 },
    },
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
    smoothElevation: true,
    // Traçado real (bacinger/f1-circuits); o ponto inicial do arquivo já é a
    // linha de largada. Distâncias medidas na própria curva do jogo.
    sectorNames: [
      [0, "Reta Principal"], [140, "La Source · T1"], [400, "Descida para Eau Rouge"],
      [860, "Eau Rouge · T2"], [980, "Raidillon · T3"], [1130, "Topo do Raidillon"],
      [1220, "Reta Kemmel"], [2200, "Les Combes · T4-6"], [2440, "Malmedy · T7"],
      [2600, "Descida do Rivage"], [2820, "Rivage · T8"], [3000, "Reta de Ligação"],
      [3090, "Curva 9"], [3300, "Descida para Pouhon"], [3600, "Pouhon · T10-11"],
      [4020, "Reta dos Fagnes"], [4300, "Fagnes · T12-13"], [4600, "Campus"],
      [4740, "Stavelot · T14-15"], [5150, "Reta de Blanchimont"], [5960, "Blanchimont · T16"],
      [6150, "Reta do Bus Stop"], [6520, "Bus Stop · T17-18"], [6740, "Reta dos Boxes"],
    ],
    // Autódromo moderno: ~13 m de pista (meia-largura ~6,5), um pouco mais
    // estreito no Eau Rouge/Bus Stop e bem largo na reta dos boxes.
    widthSamples: widenAsphalt([
      [0, 7.4], [150, 6.6], [245, 6.4], [330, 6.6], [800, 6.2], [905, 5.9], [1030, 6],
      [1150, 6.4], [1220, 6.8], [2150, 6.8], [2280, 6.2], [2360, 6.2], [2510, 6.4],
      [2895, 6.2], [3000, 6.6], [3155, 6.4], [3680, 6.6], [3900, 6.6], [4030, 6.8],
      [4380, 6.3], [4520, 6.3], [4650, 6.6], [4820, 6.4], [5040, 6.4], [5200, 6.7],
      [6060, 6.5], [6300, 6.7], [6560, 6.1], [6680, 6.1], [6760, 7.2], [7004, 7.4],
    ], .65),
    // Banking real de Eau Rouge/Raidillon, Pouhon, Stavelot e Blanchimont
    // (positivo = curva à esquerda, mesma convenção dos outros circuitos).
    bankingSamples: bankingFromApexes(7004, [
      [245, -.02], [905, .05], [1020, -.06], [1140, .03], [2280, -.03], [2360, .03],
      [2510, -.03], [2895, -.02], [3155, .02], [3690, .05], [3900, .04], [4380, -.03],
      [4520, .03], [4820, -.05], [5040, -.04], [6060, .05], [6585, -.02], [6665, .02],
    ]),
    // Marca registrada de Spa: ~60 m de desnível nas Ardenas. Cai da La Source
    // até o fundo do Eau Rouge, sobe ~35 m em ~250 m (Raidillon, ~15% de
    // rampa) e segue subindo pela Kemmel até Les Combes; desce até Pouhon e
    // Fagnes e sobe de novo até o Bus Stop.
    elevationSamples: [
      [0, 30], [245, 28], [500, 22], [700, 10], [905, 0], [1030, 16], [1170, 30],
      [1400, 40], [2000, 52], [2280, 58], [2510, 48], [2895, 36], [3155, 32],
      [3400, 26], [3680, 10], [3900, 6], [4380, 8], [4820, 14], [5040, 16],
      [5500, 24], [6060, 30], [6300, 34], [6600, 34], [7004, 30],
    ],
    // Escapes de asfalto/brita: enormes na La Source e no Rivage, apertados
    // no Eau Rouge/Raidillon (muro colado).
    cornerWideningTable: function spaCornerWidening(_s, _side) {
      return [
        [0, 9], [150, 12], [245, 20], [380, 11], [800, 8], [905, 6], [1020, 6],
        [1150, 8], [1250, 11], [2150, 12], [2280, 15], [2440, 12], [2600, 10],
        [2895, 20], [3100, 13], [3400, 10], [3690, 15], [3950, 12], [4300, 10],
        [4400, 13], [4520, 12], [4820, 16], [5050, 15], [5300, 10], [6060, 14],
        [6300, 10], [6560, 9], [6700, 8], [6800, 9], [7004, 9],
      ];
    },
    // (nada perto da linha: as últimas fileiras do grid ocupam ~120 m antes dela)
    itemBoxPositions: [480, 1250, 1650, 2050, 3350, 4150, 5350, 5650, 6250, 6780],
    cornerNameSigns: [
      [245, "LA SOURCE"], [905, "EAU ROUGE"], [1020, "RAIDILLON"], [2280, "LES COMBES"],
      [2510, "MALMEDY"], [2895, "RIVAGE"], [3690, "POUHON"], [4400, "FAGNES"],
      [4900, "STAVELOT"], [6060, "BLANCHIMONT"], [6600, "BUS STOP"],
    ],
    distanceBoardStations: [245, 2280, 2895, 4820, 6600],
    // Caixas de brita no lado de FORA de cada curva (sinal = lado do escape).
    zebraZones: [
      [170, 330, -1], [2200, 2320, -1], [2780, 2990, -1], [3580, 3820, 1],
      [4760, 5000, -1], [5960, 6160, 1], [6520, 6680, 1],
    ],
    apexGrassPatches: [2895, 4820, 6060],
    trackNamePanelText: "SPA-FRANCORCHAMPS",
    // DRS real de Spa: reta dos boxes (Bus Stop → La Source) e a Kemmel.
    drsZones: [[6760, 230], [1230, 2190]],
    scenery: {
      theme: "forest",
      // O padrão põe arquibancadas de 409 a 129 m ANTES da linha — em Spa isso
      // cai em cima do Bus Stop (6520–6680 m), com as arquibancadas no meio do
      // traçado. Aqui só ao longo da reta dos boxes de verdade (6790 → 146).
      grandstandStations: [6790, 6860, 6930, 6, 76, 146],
    },
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
  setScenery(circuit.scenery ?? {});
  setElevationSmooth(circuit.smoothElevation ?? false);
  return circuit;
}
