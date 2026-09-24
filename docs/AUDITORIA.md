# Auditoria — Formula Rush: Interlagos

Este documento registra a auditoria feita nos arquivos enviados (versão publicada
recuperada) **antes** da reconstrução, e todas as decisões tomadas durante ela.

## 1. O que foi enviado

```
formula-rush-interlagos/
├── index.html            (8 KB, minificado em 3 linhas)
├── README.md              (mencionava apenas elevation.json como faltante)
└── assets/
    ├── game.js            (512.315 bytes, minificado, 3.828 linhas)
    └── styles.css         (20 KB, minificado em 1 linha)
```

Não havia `elevation.json` nem qualquer pasta de dados.

## 2. `game.js` é dois projetos em um arquivo só

O bundle é gerado pelo Vite e contém **dois blocos bem distintos, concatenados**:

| Intervalo de bytes | Conteúdo |
|---|---|
| `0` – `483.606` | **Three.js r170 completo**, vendorizado (classes de geometria, materiais, câmeras, luzes, o renderer WebGL etc.) |
| `483.606` – `522.315` (≈ 38 KB) | **Código do jogo em si** (tudo que é específico do Formula Rush) |

Isso foi confirmado de duas formas:
1. A marca `typeof __THREE_DEVTOOLS__ ...dispatchEvent(new CustomEvent("register",{detail:{revision:to}}))` (registro padrão do Three.js) aparece exatamente no byte 483.367, e o código do jogo (constante `Ft=4309`, nomes de curvas em português, etc.) começa logo em seguida.
2. Buscando por strings exclusivas do jogo (`"MÍSSIL"`, `"drift"`, `"rookie"`, nomes de curvas) elas só aparecem depois do byte 487.000 — nunca antes.

Ou seja: **o "seu" código tem só ~38 KB**, não 512 KB. Isso tornou viável reescrevê-lo por completo, função por função, com nomes legíveis — em vez de apenas reformatar o minificado.

O arquivo `assets/game.js.beautify` (interno, não entregue) foi usado como
referência de trabalho; o resultado final está em `src/*.js`.

## 3. Arquivos que estavam faltando

O `README.md` original avisava apenas sobre `elevation.json`. A auditoria encontrou
que **dois arquivos são buscados via `fetch()` e faltavam os dois**:

```js
const geo = await fetch("./interlagos.geojson");   // <- também faltava, e é o mais crítico
if (!geo.ok) throw Error("Pista indisponível");
const elevation = await fetch("./elevation.json");
if (!elevation.ok) throw Error("Elevação indisponível");
```

Sem qualquer um dos dois, o `fetch` recebe 404, a Promise resolve com `ok:false`,
uma `Error` é lançada, e a tela inicial mostra "RECARREGAR" com um aviso de que a
pista não pôde ser aberta — **o jogo nunca chega a rodar**. Nenhum dos dois é
opcional em termos de o site *funcionar*.

Nenhuma outra referência a arquivo externo existe: sem imagens, sem fontes locais,
sem áudio (o som do motor e os efeitos são 100% sintetizados via Web Audio API,
ver `src/audio.js`), sem `localStorage`. A única dependência externa é a fonte do
Google Fonts, no `styles.css` (`@import` para `fonts.googleapis.com`).

### 3.1 `interlagos.geojson` — reconstruído com 100% de fidelidade

O rodapé do `index.html` já cita a fonte: um link para
`https://github.com/bacinger/f1-circuits` (MIT). Esse repositório publica um
GeoJSON por circuito, em `circuits/<id>.geojson`. O de Interlagos é
`circuits/br-1940.geojson`, e seus metadados batem **exatamente** com a
constante `Ft = 4309` (comprimento em metros) usada no código:

```json
{"properties": {"id": "br-1940", "Name": "Autódromo José Carlos Pace - Interlagos",
  "length": 4309, "altitude": 765}, "geometry": {"type": "LineString", "coordinates": [...171 pontos...]}}
```

O arquivo foi baixado diretamente do GitHub (licença MIT) e colocado em
`public/interlagos.geojson` — é **o mesmo arquivo** que o site original usava
(mesmas 171 coordenadas, mesmo comprimento, primeiro ponto = último ponto
formando um laço fechado, exatamente como o código espera).

### 3.2 `elevation.json` — dispensável em conteúdo (o jogo já tem um plano B embutido)

Lendo a função que monta a pista (`eg` no minificado → `buildTrackModel` em
`src/track.js`), ela recebe o JSON da elevação e só usa `elevation.samples` **se
esse array tiver mais de 5 pontos**:

```js
let elevationFn = fallbackElevationAt;               // usado por padrão
if (elevation?.samples?.length > 5) {                // só troca se houver dados de verdade
  ... suaviza `elevation.samples` com uma média gaussiana ...
}
```

E `fallbackElevationAt` usa uma tabela de 19 pontos `[distância_m, elevação_m]`
que já estava **hardcoded dentro do próprio bundle publicado** — ou seja, o jogo
sempre teve um perfil de elevação de reserva, com ou sem `elevation.json`.

Por isso, `public/elevation.json` foi criado como um **placeholder documentado**
com `"samples": []`. Isso faz o `fetch` funcionar (200 OK) e aciona
automaticamente o mesmíssimo fallback interno que o jogo já usava — o
comportamento fica **idêntico** ao original, sem inventar dado nenhum.

Se você preferir usar as amostras reais (variável `Bn` do bundle) como
`elevation.samples` de verdade, deixei um exemplo pronto em
`docs/elevation.samples-example.json` — funciona, mas passa a aplicar uma
suavização gaussiana extra sobre esses pontos, então o relevo fica *visualmente
muito parecido*, porém não mais garantidamente idêntico byte a byte ao original.
Por segurança, não é o comportamento padrão.

## 4. Código de infraestrutura/Cloudflare

Nenhum encontrado. Foi feita busca por `cloudflare`, `cf-ray`, `cf_chl`,
`turnstile`, `__cf`, `cdn-cgi`, `rocket-loader`, `challenge-platform`, `zaraz`
em `index.html`, `assets/game.js` e `assets/styles.css` — zero ocorrências. O
`README.md` original já mencionava que esse tipo de código estava em um arquivo
à parte ("Texto colado.txt"), que não fazia parte deste envio, então não havia
nada a remover aqui.

## 5. Possíveis bugs da recuperação do site publicado

Verificados especificamente:
- **Nenhum HTML/CSS truncado ou corrompido** — os três arquivos abrem e
  fecham corretamente (tags balanceadas, JSON/CSS válidos após formatação).
- **A única quebra funcional real** era a ausência dos dois arquivos de dados
  (seção 3), que impedia o jogo de sequer inicializar — não é uma corrupção de
  código, é a ausência de um recurso externo que o `index.html`/`game.js`
  sozinhos não carregam.
- Não há referências quebradas a seletores/ids inexistentes: todo `id` usado via
  `document.getElementById` no JS existe no HTML (com uma única exceção
  esperada: `#miniMap`, que o próprio jogo cria dinamicamente via
  `document.createElement` ao montar a cena — nunca esteve no HTML, de propósito).

## 6. Reconstrução modular — mapa de onde cada coisa foi parar

O bundle usava nomes de 1–2 letras (efeito da minificação). A tabela abaixo
mapeia as principais funções originais para o código novo, para quem quiser
comparar com o `assets/game.js` original em `original-bundle/`:

| Função original | Novo nome | Arquivo novo |
|---|---|---|
| `eg` | `buildTrackModel` | `src/track.js` |
| `Qm`, `mo`, `_e`, `Hi`, `tg`, `ng` | `fallbackElevationAt`, `smoothstepLookup`, `trackHalfWidthAt`, `cornerWideningAt`, `bankingAt`, `sectorNameAt` | `src/track.js`, `src/mathUtils.js` |
| `dg`, `ug`, `wc`, `hg`, `fg`, `pg`, `mg`, `Ms` | `buildScene`, `generateAsphaltTexture`, `pushCurbQuad`, `buildCurbsMesh`, `buildRacingLineMesh`, `buildTrackDecorations`, `mergeStaticMeshesByMaterial`, `resizeRenderer` | `src/scene.js` |
| `Uc` | `drawTrackMap` | `src/minimap.js` |
| `gg`, `Cc`, `Ss` | `createCar`, `setupGrid`, `syncCarVisual` | `src/car.js` |
| `xg`, `Dc`, `Sg` | `updatePlayerPhysics`, `recoverCar`, `spawnDriftSpark` | `src/player.js` |
| `Mg` | `updateBot` | `src/bots.js` |
| `Ic`, `Eg`(parte de colisão)/`Mc`+`Ss` | `finishRace`, `resolveCarCollisions`, `advanceLapTracking` | `src/physics.js` |
| `vg`, `_o`, `Nl`, `Ja`, `rg`, `sg` | `grantItem`, `useItem`, `applyHit`, `driftLevel`, `itemWeightsFor`, `pickItem` | `src/items.js` |
| `_g`, `Eg`, `yg` | `setupItemBoxes`, `advanceSimulation`, `showResults` | `src/simulation.js` |
| `lg`, `cg`, `Mc`, `Rn`, `Tg`, `Tc`, `bc`, `Ac` | `clampLapCount`, `resetLapState`, `checkLapCompletion`, `formatLapTime`, `formatRaceClock`, `renderLapTimesTable`, `openTimesPanel`, `closeTimesPanel` | `src/timing.js` |
| `ws`, `_i`, listeners de teclado/toque | `resetKeys`, `togglePause`, `attachInputHandlers` | `src/input.js` |
| `Ag` | `updateCamera` | `src/camera.js` |
| `As`, wiring do menu, `bg` | `updateLapCountUI`, `setupMenuUI`, `updateHud` | `src/ui.js` |
| `og` (classe de áudio) | `EngineAudio` | `src/audio.js` |
| `Pc`, `Lc`, `Nc`, `wg` | `startRace`, `returnToMenu`, `animate`, `bootstrap` | `src/main.js` |

Todas as constantes numéricas (velocidades, distâncias, cores, pesos de
sorteio de item etc.) foram copiadas **exatamente**, sem arredondar ou
"melhorar" nada — o pedido era preservar o comportamento, não redesenhar o jogo.

## 7. Verificação final de build

O projeto foi instalado (`npm install`) e compilado (`npm run build`) durante
esta reconstrução, sem nenhum erro:

```
✓ 24 modules transformed.
dist/index.html                   7.63 kB
dist/assets/index-*.css          16.68 kB
dist/assets/index-*.js          525.58 kB   (bem próximo dos 512 KB do bundle original)
✓ built in ~2.5s
```

Também foi conferido, por script, que:
- todo `import { x } from "./arquivo.js"` referencia algo que aquele arquivo
  realmente exporta (nenhum nome quebrado entre os módulos);
- todo `THREE.Xyz` usado (23 identificadores diferentes) existe de fato no
  pacote `three@0.170.0` instalado (a mesma versão do bundle original);
- todo `document.getElementById("xyz")` chamado do JS tem um elemento
  correspondente no `index.html` (com a única exceção esperada do `#miniMap`,
  criado dinamicamente).

Isso não substitui testar no navegador — só garante que não há nomes trocados,
imports quebrados ou API do Three.js incorreta.

## 8. Funcionalidades pedidas — conferidas uma a uma

| Funcionalidade | Onde está | Situação |
|---|---|---|
| Circuito de Interlagos (traçado real) | `public/interlagos.geojson` + `src/track.js` | ✅ mesmo traçado (bacinger/f1-circuits) |
| Relevo / subidas e descidas | `src/track.js` (`fallbackElevationAt`) | ✅ mesmo perfil hardcoded do original |
| Bots / IA | `src/bots.js` (`updateBot`) | ✅ decisão de faixa, evasão, ultrapassagem, "carro preso" |
| Aceleração dos bots | `src/constants.js` (`DIFFICULTIES.*.acceleration`) usado em `bots.js` | ✅ inalterada |
| Dificuldade (Estreante/Competidor/Veterano) | `src/constants.js` + seletor no menu (`src/ui.js`) | ✅ |
| Nº de voltas configurável (1–20) | `src/timing.js` (`clampLapCount`) + `src/ui.js` | ✅ |
| Tempos de volta | `src/timing.js` | ✅ cronometragem por sub-frame preservada |
| Classificação final | `src/simulation.js` (`showResults`) | ✅ |
| Drift | `src/player.js` | ✅ |
| Miniturbo (3 níveis) | `src/player.js` + `src/constants.js` (`DRIFT_BOOST_BY_LEVEL`) | ✅ |
| Itens (sorteio por posição) | `src/items.js` | ✅ |
| Míssil | `src/items.js` + `src/simulation.js` | ✅ |
| Óleo | `src/items.js` + `src/simulation.js` | ✅ |
| Escudo | `src/items.js` | ✅ |
| Controles de teclado | `src/input.js` | ✅ setas/WASD, Shift, Espaço, C, R, P, T |
| Controles mobile (toque) | `src/input.js` (`[data-key]`) | ✅ |
| Câmera (externa/cockpit) | `src/camera.js` | ✅ |
| Reposicionar carro (tecla R) | `src/player.js` (`recoverCar`) | ✅ |
| Pausa | `src/input.js` (`togglePause`) | ✅ |
| Minimapa | `src/minimap.js` | ✅ |
| HUD | `src/ui.js` (`updateHud`) | ✅ |
| Linha de trajetória | `src/scene.js` (`buildRacingLineMesh`) | ✅ com checkbox liga/desliga |
| Assistência de direção | `src/player.js` + checkbox no menu | ✅ |

## 9. O que É novo/melhorado (fora do escopo de "preservar")

Só duas coisas não-comportamentais, puramente de organização:
1. **`mergeStaticMeshesByMaterial`** (antes `mg`) continua existindo e fazendo
   exatamente o que fazia — mescla meshes estáticos para reduzir chamadas de
   desenho. Não é coisa nova, só preservei a otimização que já existia.
2. Comentários em português explicando cada bloco, já que o pedido era um
   projeto "legível" — isso não muda nenhum valor numérico nem fluxo de lógica.

Nada foi simplificado, removido ou "melhorado" silenciosamente.

## 10. Alterações pedidas após a entrega

- **Míssil sem limite de alcance**: o original só permitia mirar em carros até
  360 m à frente (`ITEM_DEFS.missile.range`); a pedido, essa restrição foi
  removida em `src/items.js` — agora o míssil mira em qualquer carro à frente,
  não importa a distância.
- **Míssil descartado quando não há alvo**: se não houver nenhum carro à
  frente (ex.: você já está em 1º lugar), o item agora é **descartado**
  automaticamente ao apertar Espaço, em vez de ficar preso — assim dá para
  pegar outro item na próxima caixa. Isso também corrige o mesmo problema
  para os bots (antes, um bot em 1º com míssil ficava com o item inutilizável
  para sempre).

## 11. Novas features (pedidas após a entrega)

### 11.1 Contra-relógio (time trial)
Corrida solo: sem os 7 bots e sem caixas de item, só você e o cronômetro.
Ativado por um checkbox no menu ("Contra-relógio"). `src/car.js` agora monta
o grid com 1 ou 8 carros dependendo de `state.timeTrial`, e
`src/simulation.js` não cria caixas de item nesse modo. A cronometragem de
volta (`src/timing.js`) e a tela de resultado continuam funcionando iguais —
o resultado só troca o texto do título para "Contra-relógio concluído!".

### 11.2 Nome e número do piloto
Dois campos no menu ("SEU PILOTO") deixam trocar o nome (até 16 caracteres)
e o número do carro (até 2 caracteres). `src/car.js` expõe
`setPlayerIdentity(nome, numero)`, que atualiza `state.playerName`/
`state.playerNumber`, o texto usado nas classificações/painel de tempos, e
redesenha a placa do número diretamente no carro 3D (sem precisar recriar o
carro — ver `redrawTextPanel` em `src/materials.js`).

### 11.3 Circuito de Monza
Segundo circuito selecionável no menu, com o traçado real (mesma fonte MIT
`bacinger/f1-circuits`, arquivo `circuits/it-1922.geojson`, comprimento real
5.793 m confirmado nos metadados). Para permitir trocar de circuito sem
duplicar todo o código de pista/cenário, as tabelas específicas de uma pista
(comprimento, largura, banking, elevação de reserva, nomes de curva,
posições de item, decorações) passaram de `const` para `let` em
`src/constants.js`, com uma função "setX" ao lado de cada uma — ver o
comentário no topo daquele arquivo. `src/circuits.js` é o novo registro
central: cada entrada descreve o perfil completo de um circuito, e
`applyCircuitProfile(id)` aplica esse perfil antes de (re)construir a pista.

Diferença importante de fidelidade: o perfil de Interlagos usa exatamente as
mesmas tabelas afinadas curva a curva do bundle original (nada mudou ali).
O perfil de Monza é deliberadamente mais simples — largura e banking
constantes, sem afinação por curva — porque não há dados de telemetria
equivalentes disponíveis publicamente; os nomes e posições das curvas
famosas de Monza (Variante Rettifilo, Curva Grande, Lesmos, Variante Ascari,
Parabolica) são posicionados por **distância aproximada**, não medida, e
isso está documentado nos comentários de `src/circuits.js`. O relevo de
Monza (quase plano) é uma simplificação razoável, já que a pista real é
conhecida por ter pouquíssima variação de altitude.

Elementos "universais" do cenário (asfalto, meio-fio, guard-rails, grid
quadriculado, arquibancadas, pórtico de largada, linha de trajetória) já
eram calculados a partir do formato da pista e continuam funcionando para
qualquer circuito; só precisaram ser expressos como deslocamento relativo ao
comprimento da pista (em vez de metros absolutos fixos) em alguns pontos de
`src/scene.js`. O tamanho do terreno, a dispersão de árvores/morros de fundo
e a órbita da câmera do menu também escalam proporcionalmente ao comprimento
do circuito ativo (`worldScale()` em `src/scene.js`).

### 11.4 UI com botões do próprio jogo (em vez de controles nativos do sistema)
Os `<select>` de dificuldade, circuito e piloto (painel de tempos), e os
`<input type="checkbox">` de assistência/linha de trajetória/contra-relógio,
foram trocados por botões estilizados com a fonte do jogo (Barlow Condensed)
e a paleta lima/verde-escuro, em vez dos controles genéricos do navegador/SO.
Dois padrões reutilizáveis novos em `src/ui.js`:
- `.option-group` / `.option-btn` — grupo de botões de escolha única
  (substitui `<select>`), com `wireOptionGroup(id, onSelect)`.
- `.toggle-btn` — botão liga/desliga com um "switch" desenhado em CSS
  (substitui checkbox), com `wireToggle(id, onToggle, inicial)`.

Um detalhe de correção durante essa troca: a visibilidade inicial da linha
de trajetória (`src/scene.js`) lia `.checked` de um `<input>` que não existe
mais — ajustado para ler o novo atributo `aria-pressed` do botão.

## 12. Ajustes pedidos após a entrega anterior

### 12.1 Câmera externa "travando"/bumping
Causa raiz: a física roda em passo fixo de 120 Hz (`advanceSimulation`), mas
a tela é desenhada a qualquer taxa de atualização do monitor. Antes, a
posição visual de cada carro (`car.group.position`) só era atualizada
DENTRO de um tick de física — ou seja, em telas mais rápidas que 120 Hz (ou
mesmo só por variação de tempo entre frames), vários frames de render
mostravam a MESMA posição antes do próximo tick "pular" para a posição
seguinte. Como a câmera externa interpola suavemente a cada frame só para
perseguir um alvo que se move em saltos discretos, o resultado percebido é
esse "bumping".

Correção: cada carro agora guarda um snapshot da pose do tick anterior e da
pose do tick atual (`renderPrevPos`/`renderCurrPos`/`renderPrevQuat`/
`renderCurrQuat` em `src/car.js`). A cada FRAME de render (não a cada tick de
física), `applyRenderInterpolation(alpha)` em `src/car.js` — chamada por
`src/main.js` logo após o laço de física — interpola a posição/rotação
REAL do objeto three.js entre esses dois snapshots, com `alpha` = fração do
próximo tick já decorrida no acumulador de física. O snapshot "anterior" é
capturado no início de cada tick, em `src/simulation.js`.

### 12.2 Contra-relógio sem limite de voltas
`state.lapCountRace` passa a ser `Infinity` quando `state.timeTrial` está
ativo (em `startRace`, `src/main.js`), então a corrida nunca termina por
conta própria. Um botão novo, "ENCERRAR CONTRA-RELÓGIO", aparece no menu de
pausa só nesse modo (`src/input.js` mostra/oculta conforme `state.timeTrial`
sempre que o jogo é pausado) e chama `endTimeTrial()` (`src/simulation.js`),
que registra o tempo total da sessão e mostra a tela de resultado com os
tempos de volta registrados até então. O HUD (posição, volta, barra de
progresso) foi ajustado para não tentar dividir por `Infinity`.

### 12.3 Otimizações válidas nas duas pistas
- **Minimapa**: o contorno da pista (2.154 pontos em Interlagos, 2.897 em
  Monza) era rotacionado/projetado e redesenhado do zero a cada atualização
  do HUD (~11×/segundo durante a corrida). Agora isso é calculado uma única
  vez por circuito e cacheado como um `Path2D` (`src/minimap.js`);
  só os pontinhos dos carros são recalculados a cada chamada. A economia é
  proporcional ao comprimento da pista — maior em Monza, por ser mais longa.
- **Bug real encontrado e corrigido**: trocar de circuito no menu chamava
  `buildScene()` de novo, que criava um NOVO `<canvas id="miniMap">` sem
  remover o anterior — cada troca de pista deixava um elemento órfão
  acumulado no DOM. Corrigido em `src/scene.js` (remove o antigo antes de
  criar o novo).

### 12.4 HUD potencializado
Dois indicadores novos, em `src/ui.js`:
- **Gap à frente** (metros): no HUD principal, mostra a distância até o
  carro imediatamente à frente (ou "LÍDER" se você estiver em 1º). Some no
  contra-relógio, onde não há ninguém mais na pista.
- **Ritmo** (delta em tempo real): no painel de telemetria de volta, compara
  o tempo já gasto na volta atual com o tempo esperado na mesma distância da
  sua melhor volta (previsão de delta, como em jogos de corrida "de
  verdade") — fica verde se você está mais rápido que sua melhor volta, e
  vermelho se está mais lento. Só aparece a partir de quando existe uma
  melhor volta de referência (ou seja, da 2ª volta em diante).

### 12.5 Validação
Como não há navegador com WebGL neste ambiente, a validação foi por: (a)
`npm run build` sem erros; (b) scripts de verificação cruzada (todo import
nomeado resolve para algo exportado; todo `THREE.*` usado existe no pacote
`three@0.170.0`; todo `document.getElementById` usado no JS tem elemento
correspondente no HTML, com a única exceção esperada do `#miniMap`
dinâmico); (c) uma simulação de 40 segundos corridos (2.400 ticks de física)
em Node, para os dois circuitos e os dois modos (corrida normal e
contra-relógio), incluindo coleta de item e encerramento manual do
contra-relógio, sem exceções e sem `NaN` na posição final. Ainda assim,
recomenda-se testar no navegador — em especial a sensação da câmera externa
após a correção do item 12.1, que é PRECISAMENTE o tipo de coisa que só se
sente jogando.

## 13. Multiplayer local, ranking local e Indianápolis (ver seção 14)

> **O multiplayer local descrito nesta seção foi REMOVIDO** a pedido do
> usuário logo depois de entregue ("ficou horrível") — ver seção 14.1 para
> o que foi desfeito. O resto desta seção (ranking local, Indianápolis)
> continua válido; só ficou desatualizada a parte de Indianápolis, que na
> época era o traçado misto da F1 (2000-2007) — a seção 14.2 substitui isso
> pelo oval real da Indy 500. Mantida abaixo como registro histórico.

### 13.1 Sobre o que "multiplayer" significa aqui — leia isto primeiro
Este projeto é um **site estático sem servidor/backend** (Vite + Three.js,
roda inteiramente no navegador). Um multiplayer "de verdade" — pessoas em
computadores diferentes, cada uma na sua casa — exige um servidor de
sincronização (WebSocket/WebRTC, estado compartilhado, etc.), o que está
fora do escopo do que esse projeto é hoje. Isso teria que ser um serviço
separado, hospedado à parte.

O que foi implementado é **multiplayer LOCAL**: 2 pessoas no MESMO
computador, no MESMO teclado, dividindo a tela. É uma feature inteiramente
client-side, coerente com a arquitetura atual.

### 13.2 Como o multiplayer local funciona
- Checkbox "Multiplayer local (2 jogadores)" no menu — mutuamente exclusivo
  com o contra-relógio (ativar um desliga o outro automaticamente, já que
  um é "a dois" e o outro é solo).
- O jogador 2 assume a vaga que seria do primeiro bot (`state.drivers[1]`);
  os outros 6 bots continuam normalmente.
- **Controles do jogador 2**: W/A/S/D (acelerar/frear/virar), Ctrl esquerdo
  (drift), E (usar item), Q (reposicionar na pista). O jogador 1 continua
  com setas + Shift + Espaço + R, sem mudança.
- **Um bug real evitado, não só uma decisão de design**: se o jogador 2
  usasse letras simples (`event.key`, "w"/"a"/"s"/"d"), havia um problema
  real —
  o navegador reporta `event.key` como MAIÚSCULO sempre que Shift está
  pressionado no momento, mesmo em outra tecla. Ou seja, se o jogador 1
  estivesse segurando Shift (fazendo drift) exatamente quando o jogador 2
  apertasse "w", o evento chegaria como `"W"`, não `"w"`, e quebraria o
  jogador 2 bem no momento em que o jogador 1 mais dirifta. A correção:
  `src/input.js` guarda as teclas do jogador 2 em `state.keys2`, indexado
  por `event.code` (a tecla FÍSICA, ex. `"KeyW"`), que não muda com o
  estado do Shift. Um mapa (`P2_KEY_MAP`) traduz esses códigos para os
  mesmos nomes lógicos que `player.js` já entende (`"ArrowUp"`, `"Shift"`
  etc.), então nenhuma lógica de física precisou saber que existe um
  "jogador 2" — ela só recebe um `keys` diferente.
- **Refatoração necessária para isso funcionar de verdade**: o drift
  (`driftCharge`, `driftCooldown`, `wasDrifting`...) e o estado de câmera
  (`cameraShake`, `cameraInitialized`) eram guardados em `state.*`
  GLOBAL — ou seja, um único carro "dono" desse estado. Com 2 jogadores
  isso quebraria de forma sutil e feia (o drift de um interferiria no do
  outro). Esses campos foram movidos para PROPRIEDADES DO PRÓPRIO CARRO
  (`car.driftCharge` etc., ver `src/car.js`), e `src/player.js` foi
  generalizado de `updatePlayerPhysics()` (sempre `state.player`) para
  `updatePlayerPhysics(car, dt, keys)` — a MESMA função roda para os dois
  jogadores, cada um com seu próprio estado.
- **Câmera dividida**: duas câmeras (`state.camera`, `state.camera2`),
  cada uma com seu próprio "alvo de olhar" suavizado (não podiam
  compartilhar o mesmo `Vector3` — ver `src/camera.js`). O jogador 2
  sempre usa câmera externa (sem opção de cockpit, para simplificar).
  `src/main.js` renderiza a cena DUAS vezes por frame, uma para cada
  metade da tela, usando `setViewport`/`setScissor` do WebGL — não são
  dois canvases, é o mesmo canvas dividido.
- **HUD do jogador 2** é intencionalmente mínimo (posição, volta,
  velocidade, num cantinho da tela) — sem painel de item/drift/tempos de
  volta dedicados. Efeitos sonoros e avisos ("MINITURBO!", "ATINGIDO!")
  também continuam só para o jogador 1. É uma limitação de escopo
  consciente, documentada aqui.
- Controles de toque (mobile) são desativados no multiplayer — não faz
  sentido dividir a tela de um celular entre 2 pessoas com teclado nenhum.

### 13.3 Ranking local ("leaderboard")
Pela mesma razão da seção 13.1 (sem servidor), não existe um leaderboard
GLOBAL entre jogadores de máquinas diferentes. O que existe
(`src/leaderboard.js`) é um ranking salvo no `localStorage` do PRÓPRIO
navegador: uma entrada por NOME digitado em "SEU PILOTO", por circuito. Toda
vez que um carro humano (jogador 1 ou 2) bate sua própria melhor volta
salva, ela é registrada. Um botão "VER RANKING DESTA PISTA" no menu mostra
as entradas do circuito ativo, da mais rápida para a mais lenta. Nomes
iguais usados por pessoas diferentes NO MESMO navegador se sobrescrevem
entre si — não há contas nem autenticação, só o nome digitado.

### 13.4 Circuito de Indianápolis
Terceiro circuito, mesma fonte MIT (`bacinger/f1-circuits`,
`circuits/us-1909.geojson`) — o traçado real de 13 curvas usado pelo GP dos
EUA de Fórmula 1 entre 2000 e 2007 (4.192 km, confirmado nos metadados do
próprio arquivo). Indiana é geograficamente muito plana, então o perfil de
elevação de reserva é essencialmente zero — é um fato real, não uma
simplificação. O banking (inclinação) da curva final é baseado no valor
real conhecido da curva 1 do oval (9°11', a mesma curva icônica onde os
carros de F1 ficavam em aceleração total por até 25 segundos antes da reta
principal). Os nomes/posições das demais curvas (Curva 1, Sweeper, Retão
Hulman Boulevard...) seguem a mesma lógica de aproximação já usada em Monza
— geografia real, marcadores de curva estimados.

### 13.5 Validação
Além do processo já descrito nas seções anteriores (build, cross-checks de
import/id/THREE.*), esta rodada incluiu uma simulação real de 20 segundos
corridos, nos TRÊS circuitos, com multiplayer local ativo (jogador 1 e
jogador 2 acelerando e virando ao mesmo tempo, 6 bots), confirmando: nenhuma
exceção, nenhuma posição `NaN`, os dois jogadores avançam de forma
independente, e o ranking local grava corretamente uma volta melhor e
rejeita uma pior para o mesmo nome. Também foi confirmado por inspeção que
o mapa de teclas do jogador 2 usa `event.code` (imune ao bug de
maiúscula/Shift descrito na seção 13.2), não `event.key`.

## 14. Remoção do multiplayer, oval real de Indianápolis, limites de pista, grid da F1 2026

### 14.1 Multiplayer local removido
A pedido do usuário ("ficou horrível"), o multiplayer local (tela dividida,
2 jogadores) foi completamente removido: `state.multiplayer`/`player2`/
`keys2`/`camera2`, o botão no menu, a divisória visual, o mini-HUD do
jogador 2, a renderização em duas câmeras (`setViewport`/`setScissor`) e o
mapa de teclas do jogador 2 (`P2_KEY_MAP` em `input.js`) — tudo removido.
Uma varredura (`grep -rni "multiplayer\|player2\|keys2\|camera2"`) em todo
o `src/` e `index.html` confirma que não sobrou nada, exceto comentários
que já foram limpos.

O que **não** foi revertido, por ser uma melhoria de arquitetura válida
independente do multiplayer: o estado de drift (`driftCharge` etc.) e de
câmera (`cameraShake`, `cameraInitialized`) continua guardado por CARRO
(`car.driftCharge` etc.) em vez de em `state.*` global, e `player.js`
continua generalizado para `updatePlayerPhysics(car, dt, keys)` — hoje
sempre chamada só com `state.player`/`state.keys`, mas o código fica mais
correto e mais fácil de entender assim (o carro "dono" do seu próprio
estado), sem custo nenhum de complexidade adicional agora que só há um
jogador.

### 14.2 Indianápolis agora é o OVAL real da Indy 500
Antes, "Indianápolis" usava o traçado misto que a Fórmula 1 correu de 2000
a 2007 (parte do infield + 1 curva do oval). A pedido do usuário, trocado
pelo **oval de verdade** (2,5 milhas, o mesmo circuito da Indy 500).

Esse traçado não existe no repositório `bacinger/f1-circuits` que uso para
os outros circuitos (é um repositório só de traçados de F1, e a F1 nunca
correu o oval puro). Em vez de inventar uma forma aproximada, a geometria
foi **calculada a partir das especificações oficiais reais** do autódromo:
- Reta principal e reta oposta: 3.300 pés (1.005,84 m) cada
- As duas "short chutes" (entre curvas 1-2 e 3-4): 660 pés (201,17 m) cada
- Raio das 4 curvas: resolvido algebricamente para o total fechar em
  exatamente 2,5 milhas (4.023,36 m) → ≈256,14 m, cujo arco de 90° dá
  ≈402,3 m — batendo em cheio com a descrição real de "curvas de um quarto
  de milha" do autódromo (confirmado por cálculo, não por citação de
  terceiros: ver `docs`/o script usado, reproduzido no histórico do chat).

A forma (retângulo com os 4 cantos arredondados por esses arcos) foi gerada
em metros locais e convertida para coordenadas lon/lat reais usando a MESMA
projeção equirretangular inversa que `track.js` já usa no sentido contrário
— ancorada nas coordenadas reais do autódromo (≈39.7950°N, 86.2347°O) — e
salva como `public/indianapolis.geojson` no mesmo formato dos outros
circuitos (nada mudou em `track.js`). Banking real de 9°12' (~0,16 rad) foi
aplicado às 4 curvas (as retas são planas, fato real); elevação zero (fato
real — Indiana é geograficamente muito plana). Validado: as dimensões finais
da forma gerada batem exatamente com o cálculo (713,7 m × 1.518,0 m).

### 14.3 Limites de pista no contra-relógio
Cada carro tem agora `car.currentLapValid` (volta atual) e
`car.lapValidity` (histórico por volta). Em `player.js`, sempre que
`state.timeTrial` está ativo e o carro ultrapassa o limite MARCADO da pista
(`nearest.dist > nearest.halfWidth` — a linha branca, não o muro físico,
que só empurra o carro de volta um pouco depois disso), a volta atual é
marcada inválida e um aviso aparece uma vez ("LIMITES DE PISTA EXCEDIDOS").

Em `physics.js` (`advanceLapTracking`), no momento em que essa volta é
concluída: se ela foi marcada inválida, a atualização de `bestLap` que
`checkLapCompletion` acabou de fazer é **desfeita** (volta ao valor
anterior) — ou seja, uma volta inválida nunca vira sua melhor volta, mesmo
que o tempo cronometrado fosse melhor. Isso também significa que ela nunca
é enviada ao ranking local (`recordLap` só dispara quando `bestLap` muda de
verdade). O HUD mostra o tempo da volta atual em vermelho
(`.invalid-lap`) enquanto ela estiver inválida, e o painel de tempos marca
voltas inválidas com ⚠️ e "INVÁLIDA" em vez de mostrar a diferença de tempo.

Testado com um teste focado que força uma volta "mais rápida" a ser
inválida e confirma que ela NÃO vira recorde nem aparece no leaderboard —
só uma volta legitimamente válida e mais rápida depois disso é que assume o
recorde. Ver o teste no histórico de trabalho desta sessão.

Escopo: a regra só é verificada/aplicada no contra-relógio, como pedido —
corridas normais continuam sem invalidação de volta.

### 14.4 Grid com os 22 pilotos da F1 2026
`DRIVER_COUNT` passou de 8 para 23 (você + os 22 pilotos). Os dados
(`F1_DRIVERS_2026` em `constants.js`) foram confirmados por busca em
fontes atuais (setembro de 2026): grid oficial da temporada 2026, 11
equipes — a novidade é a estreia da Cadillac como 11ª equipe (com Sérgio
Pérez e Valtteri Bottas) e da Audi assumindo a antiga Sauber, o que expande
o grid de 20 para 22 pilotos pela primeira vez em anos. Times, como na F1
de verdade, têm os DOIS carros com a mesma cor (o número no carro é o que
diferencia os companheiros de equipe) — cores tiradas das liveries de 2026
reveladas entre janeiro e fevereiro daquele ano (ex.: McLaren papaya,
Ferrari vermelho, Audi prata/titânio, Cadillac preto/branco, Alpine azul
elétrico da BWT). Os NÚMEROS de disputa de cada piloto são majoritariamente
números de carreira já bem conhecidos (ex.: Hamilton #44, Verstappen #33,
Piastri #81); para pilotos mais novos/trocas recentes de equipe, alguns
números são estimativa de melhor esforço — isso está marcado no comentário
do próprio array em `constants.js`.

A fórmula de posição no grid de largada (`car.js`, `setupGrid`) foi
generalizada de `i === 0 ? 7 : i - 1` (fixa para 8 carros) para
`i === 0 ? count - 1 : i - 1` (qualquer tamanho de grid), então o jogador
sempre larga na última fileira, agora entre 23 carros em vez de 8.

Validado: simulação real de 15s nos três circuitos com os 23 carros na
pista (nenhum `NaN`, nomes/ordem conferidos do primeiro ao último piloto).
