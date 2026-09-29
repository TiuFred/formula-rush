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
  /** "landing" | "menu" | "championship-setup" | "countdown" | "race" | "paused" | "finished".
   * Fluxo em 3 passos: "landing" é a tela de abertura (passo 1, dentro de
   * #start/#startLanding); "menu" é a configuração de corrida (passo 2,
   * #start/#startConfig + <aside>); "countdown"/"race"/"paused"/"finished"
   * são a corrida em si (passo 3, tela cheia — ver body.racing no CSS). */
  gameState: "landing",
  /** Estado ("race" ou "countdown") de onde a pausa foi acionada. */
  pausedFromState: "race",
  /** Tempo total de corrida decorrido, em segundos. */
  raceTime: 0,
  /** Tempo restante (s) até o apagão das 5 luzes vermelhas (decrescente,
   * cruza pra negativo no instante exato da largada — ver main.js/player.js
   * resolveLaunch). */
  countdown: 3.6,
  /** Duração total sorteada pra ESTA largada (luzes acendendo + espera
   * aleatória com tudo aceso) — guardado só pra saber quantas luzes acender
   * a cada instante (ver main.js). */
  countdownTotal: 3.6,
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
  /** Identificador de uma das pistas registradas em circuits.js. */
  circuitId: "interlagos",
  /** Contra-relógio: corrida solo, sem bots e sem itens. */
  timeTrial: false,
  /**
   * Experiência visual isolada "Formula Rush 2.0": Interlagos em
   * contra-relógio não ranqueado, sem alterar a versão 1.0 do circuito.
   */
  graphicsBeta: false,
  /** Classificação (1 volta) ativada no menu? Define o grid da PRÓXIMA corrida. */
  qualifyingEnabled: false,
  /** `true` durante a sessão de classificação em si (1 volta, sem itens) — ver main.js. */
  qualifying: false,
  /** Corrida noturna: céu escuro, holofotes na pista, faróis nos carros (ver scene.js/car.js). */
  nightMode: false,
  /** `null` fora do modo campeonato. Durante ele: `{calendar, round, points}` —
   * `calendar` é a lista fixa de circuitos (ver CHAMPIONSHIP_CALENDAR em
   * constants.js), `round` o índice da corrida atual (0-based), `points`
   * um mapa `id do piloto -> pontos acumulados`. Ver main.js/startChampionship. */
  championship: null,

  // --- Replay cinematográfico (ver replay.js) --------------------------
  /** Snapshots `{t, pos, quat}` do carro do jogador durante a corrida atual,
   * amostrados a cada REPLAY_SAMPLE_INTERVAL segundos (ver simulation.js). */
  replayFrames: [],
  /** Acumulador de tempo até a próxima amostra do replay. */
  replayTimer: 0,

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
  /** Zonas de bandeira amarela ativas (ver physics.js/triggerYellowFlag):
   * `{s, life, mesh}`, disparadas por colisões fortes. */
  yellowFlags: [],
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
  /** Cadeia de pós-processamento usada somente no modo gráfico 2.0. */
  composer: null,
  /** Luz solar móvel do modo 2.0, mantida perto do jogador para sombras nítidas. */
  betaSun: null,
  /** Mapa de iluminação procedural usado nos reflexos do modo 2.0. */
  betaEnvironment: null,

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
