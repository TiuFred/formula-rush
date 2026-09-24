// Constantes do jogo. As tabelas específicas de UM circuito (comprimento,
// largura, banking, elevação de reserva, nomes de setor, posições de caixa
// de item, decorações) são exportadas como `let` (não `const`) com uma
// função "setX" ao lado: isso permite que src/circuits.js troque todo o
// "perfil" da pista ativa (ex.: Interlagos -> Monza) sem precisar tocar em
// nenhum outro arquivo — quem importar `{ TRACK_LENGTH }` etc. sempre lê o
// valor mais recente (bindings de módulo ES são "vivas").
//
// Os valores abaixo (perfil padrão = Interlagos) são extraídos 1:1 do bundle
// original; nenhum valor numérico da Interlagos foi alterado.

/** Comprimento do circuito ATIVO, em metros. */
export let TRACK_LENGTH = 4309;
export function setTrackLength(v) { TRACK_LENGTH = v; }

/** Número de pilotos em uma corrida normal (jogador + 7 bots). No contra-relógio, só 1. */
export const DRIVER_COUNT = 23;

/**
 * Nomes de setor/curva do circuito ATIVO, por distância (m) percorrida na
 * volta. Formato: [distanciaInicioDoSetor, nome].
 */
export let SECTOR_NAMES = [
  [0, "Reta dos Boxes"],
  [275, "S do Senna · T1"],
  [385, "S do Senna · T2"],
  [470, "Curva do Sol · T3"],
  [735, "Reta Oposta"],
  [1310, "Descida do Lago · T4"],
  [1480, "Descida do Lago · T5"],
  [1930, "Ferradura · T6–7"],
  [2215, "Laranjinha · T8"],
  [2360, "Pinheirinho · T9"],
  [2650, "Bico de Pato · T10"],
  [2860, "Mergulho · T11"],
  [3170, "Junção · T12"],
  [3300, "Café · T13"],
  [3550, "Subida dos Boxes · T14"],
  [3970, "Arquibancadas · T15"],
];
export function setSectorNames(v) { SECTOR_NAMES = v; }

/**
 * Perfil de elevação de RESERVA (fallback) do circuito ATIVO, usado quando
 * `elevation.json` não tem `samples` suficientes (5 ou menos). Para
 * Interlagos, estes são os mesmos pontos que estavam hardcoded dentro do
 * bundle publicado original. Formato: [distancia_m, elevacao_m].
 * Ver docs/AUDITORIA.md, seção 7, para detalhes.
 */
export let FALLBACK_ELEVATION_SAMPLES = [
  [0, 41], [275, 43], [342, 27], [428, 18], [726, 9], [1300, 7], [1498, 1],
  [1800, 18], [2088, 28], [2297, 26], [2423, 17], [2600, 20], [2719, 19],
  [2974, 8], [3235, 0], [3389, 8], [3620, 23], [3969, 38], [4309, 41],
];
export function setFallbackElevationSamples(v) { FALLBACK_ELEVATION_SAMPLES = v; }

/** Largura (m) da pista ATIVA em cada trecho, por distância. [distancia_m, meiaLargura_m] */
export let TRACK_WIDTH_SAMPLES = [
  [0, 7.5], [260, 7.5], [460, 6.8], [900, 6.5], [1420, 6.4], [1820, 6.7],
  [2100, 6.2], [2400, 6], [2700, 6], [3040, 6.3], [3260, 6.4], [3590, 6.7],
  [3980, 7.5], [4309, 7.5],
];
export function setTrackWidthSamples(v) { TRACK_WIDTH_SAMPLES = v; }

/**
 * Inclinação/rolagem lateral (banking, em radianos) da pista ATIVA, por
 * distância. [distancia_m, banking_rad]
 */
export let BANKING_SAMPLES = [
  [0, 0], [250, .015], [340, .035], [410, -.025], [560, .04], [820, 0],
  [1280, 0], [1410, .025], [1650, 0], [1990, -.04], [2110, -.04],
  [2270, -.03], [2430, .035], [2650, -.03], [2740, -.035], [2930, .04],
  [3220, .03], [3420, .045], [3750, .065], [4000, .055], [4180, .012], [4309, 0],
];
export function setBankingSamples(v) { BANKING_SAMPLES = v; }

/**
 * Alargamento extra da pista em curvas do circuito ATIVO, como função
 * `(distancia_m, lado) => metros`. Para Interlagos é a tabela original
 * (afinada curva a curva); para outros circuitos, uma função mais simples.
 */
export let cornerWideningTable = function interlagosCornerWidening(s, side) {
  return [
    [0, 8], [230, 9], [340, side < 0 ? 25 : 11], [520, 13], [900, 8],
    [1310, side > 0 ? 23 : 12], [1510, 18], [1830, 10],
    [2040, side > 0 ? 19 : 9], [2250, 10], [2460, 10], [2730, 12],
    [2950, 12], [3200, side > 0 ? 22 : 12], [3430, 11], [3800, 8],
    [4309, 8],
  ];
};
export function setCornerWideningTable(fn) { cornerWideningTable = fn; }

/** Posições (distância em m) das caixas de item ao longo do circuito ATIVO. */
export let ITEM_BOX_POSITIONS = [680, 1090, 1730, 2120, 2480, 3070, 3690, 4090];
export function setItemBoxPositions(v) { ITEM_BOX_POSITIONS = v; }

/** Placas com nome de curva do circuito ATIVO: [distancia_m, "NOME"]. */
export let CORNER_NAME_SIGNS = [
  [245, "S DO SENNA"],
  [1220, "DESCIDA DO LAGO"],
  [1880, "FERRADURA"],
  [2180, "LARANJINHA"],
  [2350, "PINHEIRINHO"],
  [2610, "BICO DE PATO"],
  [2890, "MERGULHO"],
  [3140, "JUNÇÃO"],
  [3470, "SUBIDA DOS BOXES"],
];
export function setCornerNameSigns(v) { CORNER_NAME_SIGNS = v; }

/** Estações (distância em m) antes de curvas onde placas de "100/150/200 m" aparecem. */
export let DISTANCE_BOARD_STATIONS = [305, 1360, 2020, 2270, 2700, 3240];
export function setDistanceBoardStations(v) { DISTANCE_BOARD_STATIONS = v; }

/** Trechos [inicio_m, fim_m, lado] com zebra de escape (areia/grama listrada). */
export let ZEBRA_ZONES = [
  [260, 390, -1],
  [1270, 1490, 1],
  [1950, 2110, 1],
  [3150, 3290, 1],
];
export function setZebraZones(v) { ZEBRA_ZONES = v; }

/** Estações (distância em m) com manchas de grama pintada extra nos ápices. */
export let APEX_GRASS_PATCHES = [340, 1380, 2040, 3220];
export function setApexGrassPatches(v) { APEX_GRASS_PATCHES = v; }

/** Texto do painel grande com o nome do circuito, perto da largada. */
export let TRACK_NAME_PANEL_TEXT = "INTERLAGOS";
export function setTrackNamePanelText(v) { TRACK_NAME_PANEL_TEXT = v; }

/**
 * Presets de dificuldade dos bots.
 * pace: velocidade-alvo relativa · acceleration: m/s² máx · reaction: tempo de
 * decisão (s, menor = mais reativo) · grip: multiplicador de assistência de curva.
 */
export const DIFFICULTIES = {
  rookie: { label: "Estreante", pace: .65, acceleration: 24, reaction: .7, grip: 1.2 },
  sport: { label: "Competidor", pace: .82, acceleration: 27, reaction: .4, grip: 1.08 },
  pro: { label: "Veterano", pace: .97, acceleration: 29, reaction: .22, grip: 1 },
};

/** Definições dos itens de caixa. */
export const ITEM_DEFS = {
  turbo: { icon: "ϟ", name: "TURBO", duration: 2.7 },
  // "range" removido de propósito: o míssil não tem mais limite de alcance
  // (mira em qualquer carro à frente, veja items.js).
  missile: { icon: "↑", name: "MÍSSIL", speed: 112, duration: 7 },
  oil: { icon: "●", name: "ÓLEO", duration: 12 },
  shield: { icon: "⬡", name: "ESCUDO", duration: 5 },
};

/** Multiplicador de boost por nível de miniturbo (0 = sem drift, 3 = ultra). */
export const DRIFT_BOOST_BY_LEVEL = [0, .7, 1.3, 2];

/** Paleta de cores selecionáveis para o monoposto do jogador. */
export const DRIVER_COLORS = ["#dcff59", "#ff4545", "#ff922e", "#31d9ce", "#6393ff", "#eee9df"];

/**
 * Os 22 pilotos da temporada de F1 2026 (grid de largada do ano, 11 equipes
 * — inclui a estreia da Cadillac, 11ª equipe, e da Audi assumindo a antiga
 * Sauber). Confirmado por busca em fontes atuais em set/2026. Cor = cor
 * predominante da pintura real do carro daquela equipe em 2026 (times têm
 * carros com a MESMA pintura para os 2 pilotos, como na F1 de verdade — o
 * número no carro é o que diferencia). Números são os números de disputa
 * mais conhecidos de cada piloto; alguns dos pilotos mais novos (estreantes/
 * trocas recentes) são estimativas de melhor esforço, não garantidos.
 * Ver docs/AUDITORIA.md.
 */
export const F1_DRIVERS_2026 = [
  { name: "L. Norris", team: "McLaren", number: "1", color: "#FF8000" },
  { name: "O. Piastri", team: "McLaren", number: "81", color: "#FF8000" },
  { name: "C. Leclerc", team: "Ferrari", number: "16", color: "#E8002D" },
  { name: "L. Hamilton", team: "Ferrari", number: "44", color: "#E8002D" },
  { name: "M. Verstappen", team: "Red Bull", number: "33", color: "#1B3F8B" },
  { name: "I. Hadjar", team: "Red Bull", number: "6", color: "#1B3F8B" },
  { name: "G. Russell", team: "Mercedes", number: "63", color: "#27F4D2" },
  { name: "K. Antonelli", team: "Mercedes", number: "12", color: "#27F4D2" },
  { name: "F. Alonso", team: "Aston Martin", number: "14", color: "#229971" },
  { name: "L. Stroll", team: "Aston Martin", number: "18", color: "#229971" },
  { name: "A. Albon", team: "Williams", number: "23", color: "#00A3E0" },
  { name: "C. Sainz", team: "Williams", number: "55", color: "#00A3E0" },
  { name: "N. Hülkenberg", team: "Audi", number: "27", color: "#9C9FA3" },
  { name: "G. Bortoleto", team: "Audi", number: "5", color: "#9C9FA3" },
  { name: "P. Gasly", team: "Alpine", number: "10", color: "#2293D1" },
  { name: "F. Colapinto", team: "Alpine", number: "43", color: "#2293D1" },
  { name: "E. Ocon", team: "Haas", number: "31", color: "#B6060C" },
  { name: "O. Bearman", team: "Haas", number: "87", color: "#B6060C" },
  { name: "L. Lawson", team: "Racing Bulls", number: "30", color: "#3652A3" },
  { name: "A. Lindblad", team: "Racing Bulls", number: "41", color: "#3652A3" },
  { name: "S. Pérez", team: "Cadillac", number: "11", color: "#1A1A1A" },
  { name: "V. Bottas", team: "Cadillac", number: "77", color: "#1A1A1A" },
];
