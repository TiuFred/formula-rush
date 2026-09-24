// Estado mutável central do jogo.
//
// O jogo original (bundle minificado) guardava tudo em variáveis `let` no
// escopo do módulo. Para dividir o código em arquivos sem reescrever a
// lógica, concentramos esse mesmo estado em UM objeto mutável (`state`),
// importado por quem precisar ler/alterar. Isso preserva o comportamento
// exato (mesmas variáveis, mesmos valores iniciais), só organiza melhor.
import { DRIVER_COLORS } from "./constants.js";

export const state = {
  // --- Ciclo de vida da corrida --------------------------------------
  /** "menu" | "countdown" | "race" | "paused" | "finished" */
  gameState: "menu",
  /** Estado ("race" ou "countdown") de onde a pausa foi acionada. */
  pausedFromState: "race",
  /** Tempo total de corrida decorrido, em segundos. */
  raceTime: 0,
  /** Contagem regressiva antes da largada, em segundos (decrescente). */
  countdown: 3.6,
  /** Nº de voltas escolhido no menu (1-20). */
  lapCountSetting: 3,
  /** Nº de voltas "travado" para a corrida em andamento. */
  lapCountRace: 3,
  /** Chave da dificuldade atual: "rookie" | "sport" | "pro". */
  difficultyKey: "sport",
  /** Assistência de direção ativada? */
  assistOn: true,
  /** Cor escolhida para o carro do jogador (uma de DRIVER_COLORS). */
  selectedColor: DRIVER_COLORS[0],
  /** Nome exibido do jogador (editável no menu). */
  playerName: "Você",
  /** Número exibido no carro do jogador (editável no menu). */
  playerNumber: "07",
  /** Circuito ativo: "interlagos" | "monza" | "indianapolis". */
  circuitId: "interlagos",
  /** Contra-relógio: corrida solo, sem bots e sem itens. */
  timeTrial: false,

  // --- Entidades da simulação ----------------------------------------
  /** Todos os carros (jogador + bots), na ordem de criação do grid. */
  drivers: [],
  /** Referência direta ao carro do jogador (drivers[0]). */
  player: null,
  /** Modelo de pista construído por buildTrackModel() (track.js). */
  track: null,
  /** Caixas de item na pista. */
  itemBoxes: [],
  /** Manchas de óleo ativas na pista. */
  oilPatches: [],
  /** Mísseis em voo. */
  missiles: [],
  /** Partículas visuais de faísca de drift. */
  driftParticles: [],
  /** Carros que já terminaram a corrida, em ordem de chegada. */
  finishOrder: [],

  // --- three.js ---------------------------------------------------------
  scene: null,
  camera: null,
  renderer: null,

  // --- Relógio / loop principal ---------------------------------------
  /** Tempo acumulado total (para animações como bob/vibração). */
  clockTime: 0,
  /** Timestamp (ms) do último frame do requestAnimationFrame. */
  lastFrameTime: 0,

  // --- Som ---------------------------------------------------------------
  soundOn: false,

  // --- Câmera --------------------------------------------------------------
  /** 0 = câmera externa (chase), 1 = câmera a bordo (cockpit). */
  cameraMode: 0,

  // --- Painéis de UI -------------------------------------------------------
  /** Painel de tempos de volta está aberto? */
  timesPanelOpen: false,
  /** Estava em corrida/contagem (não já pausado) antes de abrir o painel de tempos? */
  wasRacingBeforeTimes: false,

  /** Mesh da linha de trajetória (para poder mostrar/ocultar via checkbox). */
  racingLineMesh: null,

  // --- Entrada -------------------------------------------------------------
  /** Mapa de teclas atualmente pressionadas (chave `event.key` => bool). */
  keys: {},
};
