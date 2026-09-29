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

## 15. Correções da RTM (posição "X/8"), main menu, ranking online, HUD e física de colisões

### 15.1 Bug real corrigido: HUD de posição mostrava "X/8" com 23 carros na pista
Uma revisão geral do repositório (pedida pelo usuário) encontrou que o HUD
(`src/ui.js`, `updateHud`) e o texto inicial (`index.html`) ainda mostravam
"/8" como total de pilotos — resquício de antes da seção 14.4 (grid
expandido de 8 para 23 carros). Corrigido para usar `state.drivers.length`
dinamicamente em vez de um número fixo. Também foram removidos dois campos
mortos encontrados na mesma revisão: `car.leaderboardName` (nunca era
atribuído; `physics.js` já caía sempre no fallback `car.name`) e
`car.aiSkill` (calculado em `createCar` mas nunca lido em lugar nenhum).

### 15.2 Tela de título (main menu)
Adicionada uma tela de título de página inteira (`#titleScreen` em
`index.html`, estilo em `styles.css`), mostrada antes da tela de
configuração de corrida que já existia (barra lateral com circuito/
dificuldade/voltas/piloto). `state.gameState` ganhou um novo valor
`"title"` (era o estado inicial padrão "menu"; agora o padrão é "title").
Botão "JOGAR" leva ao "menu" (a configuração de corrida, sem mudança de
comportamento a partir daí); botão "RANKING ONLINE" abre o painel de
ranking direto da tela de título; o logo no header (`#brandHome`, antes um
`<a href="./">` que recarregava a página) agora é um botão que volta da
tela de configuração para a tela de título sem perder o circuito já
carregado — só funciona nesse sentido (não interrompe uma corrida em
andamento). A câmera de órbita do menu (`camera.js`) e o bloqueio de
atalhos de teclado (`input.js`) foram estendidos para tratar `"title"`
igual a `"menu"`.

Um bug foi pego e corrigido durante o teste manual no navegador: o painel
de ranking (`.modal`, z-index 7) abria **atrás** da tela de título
(z-index 20 na primeira versão) quando aberto direto da tela de título —
corrigido baixando o z-index da tela de título para 6 (abaixo de todos os
`.modal`, que continuam por cima de qualquer tela).

### 15.3 Ranking online (Supabase)
O projeto era 100% estático/sem backend (ver seção 13.1/13.3). A pedido do
usuário, o ranking (`src/leaderboard.js`) passou a tentar um ranking
ONLINE via Supabase antes de cair para o local:

- `src/supabaseClient.js`: cria o client a partir de
  `import.meta.env.VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; se essas
  variáveis não estiverem definidas (`.env.local`, ver
  `.env.local.example`), o client é `null` e todo o resto do jogo
  continua funcionando exatamente como antes (ranking só local).
- `docs/leaderboard-schema.sql`: schema a ser rodado manualmente pelo
  usuário no SQL Editor do próprio projeto Supabase (criar uma conta e um
  projeto ali é uma ação que só o usuário pode fazer). Decisão de design:
  a tabela `leaderboard_entries` não aceita INSERT/UPDATE/DELETE direto da
  role `anon` — toda escrita passa por uma função `submit_lap_time`
  (`security definer`) que só grava se o tempo novo for melhor que o já
  salvo para aquele (circuito, nome de piloto), com `on conflict ...
  where excluded.time_ms < ...`. Isso centraliza a regra "só grava se for
  recorde" no banco (uma única fonte da verdade) em vez de confiar só no
  cliente, e impede que alguém sobrescreva o tempo de outra pessoa com um
  valor pior.
- `recordLap()`/`getLeaderboard()` em `leaderboard.js` viraram `async`:
  `recordLap` sempre grava no local primeiro (síncrono, mesma linha de
  código de antes) e, se o online estiver configurado, também tenta
  enviar (erro de rede/config só gera um `console.warn`, nunca quebra o
  jogo); `getLeaderboard` tenta o online e cai para o local em caso de
  falha, retornando `{ online, entries }` para a UI poder indicar a
  origem. `src/ui.js` (`renderLeaderboard`) mostra um estado "Carregando…"
  e depois "RANKING ONLINE · GLOBAL ENTRE JOGADORES" ou "RANKING LOCAL ·
  SALVO SÓ NESTE NAVEGADOR" conforme o resultado.

**Limitação conhecida, documentada de propósito (não escondida)**: como é
um jogo inteiramente client-side sem validação de corrida no servidor, a
chave "anon" do Supabase — pública por natureza no próprio modelo do
Supabase, protegida por Row Level Security, não por sigilo — permite que
alguém tecnicamente chame `submit_lap_time()` direto com um tempo forjado,
sem ter jogado. Não há anti-cheat; é um ranking "por honestidade", só que
agora compartilhado entre navegadores/dispositivos em vez de só local.
Se isso importar no futuro, a mitigação exigiria validar a corrida no
servidor (ex.: assinar o resultado com dados da simulação), o que é uma
mudança de arquitetura maior, fora do escopo desta rodada.

### 15.4 HUD: mini-classificação em tempo real
Novo painel (`#miniStandings`, `updateMiniStandings` em `src/ui.js`): uma
janela de até 5 posições centrada no jogador (2 carros à frente, o
jogador, 2 atrás — ajustada nas bordas do grid), com o gap para o líder em
metros e um marcador da cor de cada carro. Atualizado junto com o resto do
HUD (~11×/s). Escondido no contra-relógio (não há outros carros) e em
telas estreitas (`max-width: 760px`) para não competir por espaço com os
controles de toque.

### 15.5 Física de colisões: severidade em vez de penalidade fixa
Pedido do usuário: a colisão carro-carro e a colisão com o muro pareciam
"pouco realistas" (sempre a mesma penalidade, independente de como o
choque aconteceu).

- **Carro-carro** (`resolveCarCollisions`, `physics.js`): a perda de
  velocidade e o "chacoalhão" de direção agora escalam com uma
  `impactSeverity` calculada a partir da velocidade relativa entre os dois
  carros e de quão alinhados eles estão no traçado (dois carros quase no
  mesmo ponto da pista = impacto mais "de frente", bem mais severo que só
  roçar as laterais). O carro mais rápido dos dois perde
  proporcionalmente mais velocidade (absorve mais o choque) que o mais
  lento. Um novo campo por carro, `car.collisionCooldown` (decai junto com
  `boost`/`shield`/etc. em `simulation.js`), garante que o "baque" (perda
  de velocidade, tremor de câmera, som) só é aplicado uma vez por contato,
  não a cada tick de física enquanto os carros continuam sobrepostos — o
  empurrão lateral em si (para eles não se atravessarem visualmente)
  continua todo tick, sem cooldown. Antes, uma colisão carro-carro era
  totalmente silenciosa e sem tremor de câmera (só o muro tinha isso);
  agora colisões fortes (`impactSeverity > .25`) também disparam
  `engineAudio.cue("impact")` para o jogador.
- **Muro** (`updatePlayerPhysics`, `player.js`): a perda de velocidade
  fixa (28%, `car.speed *= .72`) foi substituída por uma severidade
  baseada no ângulo entre a direção REAL de movimento (heading menos o
  ângulo de slip do drift) e a tangente da pista no ponto do muro, e na
  velocidade do carro — um roçar quase paralelo à parede perde pouca
  velocidade; um encontro quase perpendicular perde bem mais que antes
  (até ~73% em vez de 28% fixo). O tremor de câmera e a velocidade de
  realinhamento do yaw após o impacto também escalam com essa severidade.

Validado com um script de smoke-test (Node, apagado depois — ver seção
"Como testar mudanças" no `CLAUDE.md`) que força repetidamente os dois
tipos de colisão por 30s simulados: ambos os cooldowns dispararam, sem
`NaN` nem exceções.

## 16. Fluxo de 3 passos (abertura → configuração em tela cheia → corrida em tela cheia)

Esta seção passou por duas iterações a pedido do usuário antes de chegar no
formato atual — registro as duas porque o "porquê" de cada rejeição molda
o design final.

**Iteração 1** (tela de título full-page cobrindo tudo com um gradiente
sólido): rejeitada — "não ficou legal", escondia a cena 3D que a tela de
configuração original mostrava como pano de fundo, ficando genérica.

**Iteração 2** (abertura e configuração como dois sub-painéis dentro do
mesmo `#start`, ambos sobre a cena 3D rodando no canvas): rejeitada
também — o pedido explícito foi "faça uma tela cheia de configurações,
sem essa tela da pista escrito (entrar na pista)": nem cena 3D, nem texto
de propaganda na tela de configuração, só formulário/controles.

**Design final** (confirmado por `AskUserQuestion` antes de implementar,
para não errar uma terceira vez):

1. **Abertura** (`state.gameState === "landing"`, valor inicial): `#start`
   dentro de `.game`, com a cena 3D ao fundo — igual à tela de configuração
   original de antes de tudo isso. Eyebrow/H1/parágrafo de marca + botão
   "JOGAR" (`goToConfigStep`) + "RANKING ONLINE".
2. **Configuração em tela cheia** (`state.gameState === "menu"`): a
   `<aside>` deixa de ser a barra lateral de 320px e passa a ser **a
   página inteira** — `body.configuring` (ver `styles.css`) esconde
   `.game` por completo (`display:none`) e vira `main` de uma coluna só;
   `<aside class="config-screen">` ganha `padding`/`max-width:640px`
   centralizado, sem nenhum canvas, sem cena 3D, sem cópia de marketing —
   só título estático "CONFIGURAR CORRIDA", os controles (circuito,
   dificuldade, voltas, toggles, piloto) e o botão "COMEÇAR CORRIDA"
   (texto escolhido pelo usuário nas perguntas de confirmação). Removidos
   do HTML: o cartão do circuito (`.circuit-card` + `<canvas id="map">` +
   nome completo do autódromo), a caixa de preview piloto (`.driver`), e o
   bloco de regras/dicas (`.rules`) — o usuário rejeitou explicitamente
   até manter um preview pequeno do traçado quando perguntado. O botão
   "← VOLTAR" (`backToLandingStep`, `position:fixed` no canto superior
   esquerdo) leva de volta à abertura.
3. **Corrida em tela cheia** (`"countdown"`/`"race"`/`"paused"`/
   `"finished"`): inalterado desde a iteração 1 — `body.racing` esconde
   `header`/`<aside>`/`footer`/`.stage-bottom` incondicionalmente e
   `.game` ocupa `100dvh` sem borda/padding. O "botão para retornar" aqui
   continua sendo PAUSA → "VOLTAR AO GRID" (`returnToMenu`, volta
   direto para a configuração em tela cheia, não para a abertura).

Como a `<canvas id="map">` do preview estático foi removida do HTML, a
chamada `drawTrackMap(byId("map"), false)` em `scene.js` (que quebraria
com `byId` retornando `null`) foi removida junto, e o import de
`drawTrackMap` nesse arquivo ficou órfão — também removido. `ui.js`
(`updateCircuitInfoUI`, os handlers de `playerName`/`playerNumber`/cores)
teve as referências aos elementos removidos (`circuitTitle`,
`circuitSubtitle`, `circuitFullName`, `circuitHeading`, `driverColor`,
`driverNameLabel`, `driverNumberLabel`) limpas — deixá-las quebraria com
`byId(...).textContent = ...` sobre `null`.

### Bug real encontrado durante o teste manual (não era cache do navegador)
Depois de trocar o texto do botão de "ENTRAR NA PISTA" para "COMEÇAR
CORRIDA" no `index.html`, o botão continuava mostrando o texto antigo no
navegador — inclusive em aba nova, com `fetch()` fresco confirmando que o
*servidor* já respondia com o texto certo. Causa raiz: `loadCircuit()` em
`main.js` reescreve `byId("startRace").innerHTML` via JavaScript
(`'ENTRAR NA PISTA <span>↗</span>'`) depois que o circuito termina de
carregar — isso sobrescrevia de volta o texto do HTML estático assim que
a página inicializava, então nenhum "cache" estava envolvido, era o
próprio app revertendo a mudança em runtime. Corrigido para escrever
`'COMEÇAR CORRIDA <span>↗</span>'` no mesmo lugar.

### Bug de visibilidade encontrado ao testar "← VOLTAR" após uma corrida
Fluxo: abertura → configuração → corrida → pausa → "VOLTAR AO GRID"
(volta para a configuração) → "← VOLTAR" (deveria voltar para a
abertura). Resultado: a abertura aparecia **sem** o texto do hero — só a
cena 3D e o header/footer. Causa: `startRace()` faz
`setVisible("start", false)` ao iniciar a corrida, mas `backToLandingStep()`
nunca revertia isso (só mexia em `.game`/`<aside>`), então `#start`
continuava com `class="hidden"` para sempre depois da primeira corrida.
Corrigido adicionando `setVisible("start")` (e `setVisible("stageBottom")`)
em `backToLandingStep()`.

Validado no navegador (dev server local, aba nova a cada teste para
descartar qualquer estado residual): os 3 passos, os dois botões de
"voltar" (config→abertura e pausa→config) e o ciclo completo
abertura→config→corrida→pausa→config→abertura, em desktop (1440×900) e
mobile (375×812). Física revalidada com um smoke-test de Node (apagado
depois) nos 3 circuitos após a remoção da chamada a `drawTrackMap` em
`scene.js` — sem `NaN` nem exceções.

## 17. Setores, DRS, drift ajustado, classificação, replay e correção do ranking online

Rodada com 6 pedidos do usuário: 3 setores por volta, classificação (1
volta define o grid), zonas de DRS, drift mais fácil/recompensador, replay
cinematográfico no fim da corrida, e o ranking online que não estava
funcionando.

- **Setores**: `timing.js` (`checkSectorCompletion`) trata fronteiras de
  setor como uma sequência contínua a cada `trackLength/3`, independente
  das fronteiras de volta (o fim do 3º setor É o fim da volta) — mesma
  técnica de interpolação sub-frame de `checkLapCompletion`. `bestSectors`
  guarda o melhor tempo de cada setor isoladamente (podem vir de voltas
  diferentes). HUD novo em `#lapTelemetry` (3 caixas S1/S2/S3, verde =
  igualou o melhor daquele setor).
- **DRS**: nova tabela por circuito `DRS_ZONES` (`constants.js`/
  `circuits.js`, aproximada como as outras tabelas decorativas) +
  `drsZoneAt(s)` (`track.js`) + `computeDrsActive(car)` (`physics.js`,
  compartilhada entre `player.js` e `bots.js` de propósito — sem isso o
  jogador teria uma vantagem que os bots não têm). Indicador "DRS" no HUD.
- **Drift**: limiares de acionamento reduzidos (`steer>.3`/`speed>12`, eram
  `.45`/`17`), carga mais rápida (`items.js`/`driftLevel` com limiares
  menores), boost maior (`DRIFT_BOOST_BY_LEVEL` de `[.7,1.3,2]` para
  `[1,1.8,2.8]`) e o limiar de `slip` que podia zerar o boost em silêncio
  ao soltar o Shift um instante antes do carro assentar foi relaxado
  (`.4`→`.65`) — essa era provavelmente a causa principal do miniturbo
  parecer "pouco recompensador": o jogador fazia tudo certo e as vezes não
  recebia nada.
- **Classificação**: `setupGrid()` (`car.js`) ganhou um parâmetro
  `gridOrder` opcional (array `posição → índice de identidade`); sem ele,
  mantém o comportamento padrão de sempre. `main.js` reutiliza quase toda a
  infraestrutura de corrida normal para a sessão de 1 volta
  (`state.qualifying=true`, `state.lapCountRace=1`, sem itens), e
  `animate()` detecta o fim dela (todos terminaram, ou 90s de limite) para
  então montar o grid real ordenado pelos tempos e iniciar a corrida de
  verdade. **Bug real pego e corrigido durante o teste no navegador**: como
  o toggle de classificação continua ligado, a chamada de `startRace()`
  feita pelo próprio fim da classificação disparava OUTRA classificação —
  loop infinito. Corrigido usando `qualifyingGridOrder !== null` (só
  preenchido na segunda chamada) para diferenciar "largada nova" de
  "largada da corrida que vem depois da classificação".
- **Replay cinematográfico**: `simulation.js` grava a pose do jogador a
  cada 0.1s (`REPLAY_SAMPLE_INTERVAL`) durante `advanceSimulation`; novo
  módulo `src/replay.js` reproduz isso com uma câmera que corta entre
  perseguição dramática e órbita a cada 6s. Não é um novo "modo de jogo" de
  verdade — é só main.js chamando `updateReplay` em vez de `updateCamera`
  quando `state.gameState === "replay"` (a física real não roda nesse
  estado). **Bug pego durante o teste**: o modal de resultado sempre cobriu
  o HUD de corrida (visualmente, com blur) sem precisar escondê-lo — o
  replay troca esse modal pela cena 3D e revelava o HUD congelado por
  baixo. Corrigido escondendo `hud`/`instruments`/`lapTelemetry`/
  `miniStandings`/`raceProgress`/`attackWarning`/`miniMap` explicitamente
  em `startReplay()`.
- **Ranking online "não funcionando"**: investigado antes de tentar
  qualquer coisa — a API do Supabase (leitura E escrita, via `curl`)
  respondia normalmente, e testar `recordLap`/`getLeaderboard` direto no
  console do navegador local também funcionava (`online: true`). O
  problema real estava só no site publicado no Vercel: alguém tinha feito
  um novo deploy (fora desta sessão) sem as variáveis
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` salvas permanentemente no
  projeto (só tinham sido passadas pontualmente num deploy anterior via
  `-b`) — esse novo deploy caía no fallback local. Corrigido salvando as
  duas variáveis via `vercel env add ... production` e refazendo o deploy;
  confirmado ao vivo em produção depois (`RANKING ONLINE · GLOBAL ENTRE
  JOGADORES`).

### Bug real adicional, pego numa revisão geral pedida pelo usuário (não relatado por ele)
A severidade de impacto da colisão carro-carro (seção 15.5) tinha um erro:
o comentário dizia que a perda de velocidade só seria aplicada "uma vez por
contato" (como o tremor de câmera/som), mas no código ela era recalculada e
multiplicada a CADA tick (120×/s) enquanto os carros continuassem
sobrepostos — uma decisão exponencial composta, não um evento único. Na
prática, dois carros correndo lado a lado por só 1s (situação comum numa
disputa de posição) perderiam ~87% da velocidade só por estarem próximos,
não por um impacto de fato. Corrigido: a perda de velocidade e o
"chacoalhão" de yaw agora só são aplicados quando `car.collisionCooldown`
libera (mesmo gate do tremor de câmera/som) — um baque de cada vez, não
uma sangria contínua. Validado com um smoke-test forçando o jogador a
ficar colado no carro da frente por 20s simulados: a velocidade mínima
durante o contato ficou em 15-39 m/s (dependendo do circuito) em vez de
desabar perto de zero.

Outros achados menores da revisão, corrigidos: dois `<label for=
"playerName">` diferentes na seção "SEU PILOTO" da configuração (trocado o
externo por um `<span>` não associado, com a mesma classe de estilo); "T"
(painel de tempos) e "C" (aviso de câmera) continuavam ativos durante o
replay, sem fazer sentido ali (a câmera do replay é fixa) — bloqueados
junto com o resto dos atalhos, igual à tela de abertura.

Validado: build limpo, cross-check de todo `byId(...)` usado no JS contra
os ids existentes no HTML (só `#miniMap`, criado dinamicamente, aparece
como "ausente" — o mesmo caso já documentado desde a auditoria original),
e um smoke-test de Node cobrindo setores/DRS/drift/colisão nos 3
circuitos sem `NaN` nem exceções.

## 18. Colisões "horríveis" — a causa raiz de verdade (a seção 17 não tinha resolvido)

O usuário testou a correção da seção 17 (baque só uma vez por contato, via
`car.collisionCooldown`) e relatou que continuava horrível. Motivo: gatear
por um COOLDOWN DE TEMPO (0.4s) não é a mesma coisa que gatear por um
EVENTO DE CONTATO — disputas de posição normais (dois carros correndo
colados por vários segundos, coisa comum numa corrida) faziam o baque
disparar de novo a cada 0.4s enquanto o contato durasse, e não só isso: a
magnitude de UM baque isolado também podia chegar a 40% da velocidade
NUM SÓ TICK (até ~40 m/s de queda instantânea, medido no smoke-test) —
brusco demais mesmo sem repetir.

Processo de diagnóstico (documentado porque o primeiro smoke-test escrito
deu resultado enganoso): um script forçando o jogador a ficar "colado" num
bot por 5s mostrou 69-84 quedas de velocidade e o carro girando quase
180°. Investigando, a causa era o PRÓPRIO SCRIPT DE TESTE: ele forçava só
`car.lane` sem atualizar `car.x`/`car.z` correspondentes — e
`updatePlayerPhysics` recalcula a lane a partir da posição x/z real via
`state.track.nearest(...)`, descartando a forçação a cada tick. Corrigido
o teste para posicionar x/z consistentes com a lane desejada (via
`state.track.at(s, lane)`, a mesma função que o próprio jogo usa) — só
então o teste ficou confiável o bastante pra guiar a correção de verdade.

### Correções aplicadas em `physics.js`/`player.js`

1. **Detecção por BORDA DE SUBIDA do contato, não por cooldown de tempo.**
   Cada carro guarda `car.touching` (um `Set` de ids de quem está tocando
   NESTE tick), recalculado do zero a cada chamada de
   `resolveCarCollisions` e comparado com o valor do tick anterior — o
   "baque" (perda de velocidade, chacoalhão, câmera, som) só dispara
   quando o par passa de "não tocando" para "tocando", nunca de novo
   enquanto o contato continuar, não importa por quantos segundos. O
   empurrão lateral (pra não se atravessarem visualmente) continua
   rodando todo tick, sem penalidade nenhuma associada.
2. **Histerese entre entrar e sair do contato.** Só isso ainda não bastava
   — testado com posição real (x/z corretos), o gap entre dois carros
   correndo colados naturalmente OSCILA de um tick pro outro (aceleração,
   resposta de curva, drift), cruzando repetidamente a fronteira de
   detecção (`progressGap<4.3 && |laneGap|<2.1`) mesmo sem os carros terem
   realmente se separado — cada cruzamento contava como toque novo. A
   correção: limiares de SAÍDA maiores que os de ENTRADA
   (`RELEASE_PROGRESS_GAP=6.5`/`RELEASE_LANE_GAP=2.7` vs
   `OVERLAP_PROGRESS_GAP=4.3`/`OVERLAP_LANE_GAP=2.1`) — uma vez tocando,
   só volta a contar como "separados" quando o gap abrir de verdade, não
   em toda micro-flutuação. Validado com dois testes diretos (medindo
   transições do `Set` de contato, não mais a queda de velocidade como
   proxy, que se provou um sinal ruidoso — flutuações normais de
   aceleração geram quedas de velocidade sem colisão nenhuma): contato
   sustentado real por 5s → exatamente 1 borda de subida; 10 ciclos de
   aproximar/afastar de verdade → exatamente 10 bordas de subida.
3. **Magnitude do baque isolado reduzida.** Carro-carro: perda máxima de
   velocidade num toque de 40%→22%, chacoalhão de yaw de até 0.1→0.08 rad
   por toque. Muro: 57%→40% no topo da faixa (a base, pra um roçar quase
   paralelo, também caiu de 12%→10%). A mesma técnica de borda de
   subida/sem repetição foi aplicada ao muro (`car.wallTouching`,
   substituindo o antigo `car.wallCooldown`, que ficou órfão e foi
   removido) — raspar numa zebra/muro por 1-2s (comum ao cortar uma curva)
   agora perde velocidade só uma vez, não a cada ~0.5s como antes.

### Validação
- 3 smoke-tests de Node dedicados: contato sustentado real (5s → 1 baque),
  toques distintos (10 ciclos → 10 bordas de subida, uma a uma), muro
  sustentado (2s → 1 baque).
- Corrida completa simulada (23 carros, IA orgânica dos bots, 90s × 3
  circuitos): sem `NaN`/exceções; maior queda de velocidade num único
  tick caiu de ~40 m/s para ~29 m/s (a métrica de "giro suspeito >90°/s"
  usada numa rodada intermediária do diagnóstico se mostrou um falso
  positivo — Interlagos/Monza têm curvas fechadas de verdade que exigem
  essa taxa de giro sem colisão nenhuma; Indianápolis, um oval quase sem
  curvas fechadas, teve 50× menos ocorrências, confirmando que não era um
  sinal de bug).
- Teste ao vivo no navegador (não só headless): jogador teleportado para
  sobrepor um bot em corrida real rodando de verdade, lido o estado
  imediatamente antes/depois via console — 1 baque (câmera chacoalhou
  0→0.25, velocidade caiu ~22%, batendo com o novo teto configurado), sem
  ficar preso batendo repetidamente, carros se separando normalmente
  depois.

## 19. Classificação: o jogador fica SOZINHO na pista de verdade

A seção 16 implementou a classificação reaproveitando a corrida normal com
os 23 carros (só sem itens) — o usuário corrigiu: classificação é 1 volta
SÓ do jogador, sem mais ninguém na pista, igual ao contra-relógio.

Solução: os bots continuam rodando a própria volta por trás dos panos —
mesma física/IA de sempre (`updateBot`, chamada normalmente em
`advanceSimulation`) — pra ter um tempo de volta realista e formar o grid
da corrida de verdade depois (é esse tempo simulado que entra no
`sort()` de `finishQualifying`, em `main.js`). Só que eles ficam:

- **Ocultos**: `car.group.visible = car.isHuman` logo depois de
  `setupGrid()`, em `startRace()` (só quando `state.qualifying`).
  `minimap.js` (`drawTrackMap`, modo `live`) já pula carros com
  `group.visible === false`, então o minimapa também mostra só o jogador.
- **Sem colisão**: `resolveCarCollisions(dt)` é pulado por completo durante
  a classificação (`simulation.js`) — o jogador nunca é tocado por um bot
  que ele nem consegue ver.
- **Sem DRS por causa deles**: `computeDrsActive` (`physics.js`) agora
  também exige `other.group.visible` pra contar como "carro da frente" —
  sem isso, o jogador podia ganhar (ou um bot perder) DRS por causa de um
  carro que nem está na tela.
- **HUD consistente com "sozinho"**: mini-classificação e "GAP À FRENTE"
  escondidos (`ui.js`, mesmo tratamento que já existia pro contra-relógio),
  e o painel de item mostra "SEM ITENS" em vez de "PEGUE UMA CAIXA" (não
  há caixas na classificação — `setupItemBoxes` já pulava a criação delas,
  só faltava a mensagem do HUD acompanhar).

Validado com um smoke-test dedicado: ao entrar em classificação, só o
carro do jogador (`id 0`) fica com `group.visible`; forçando o jogador a
sobrepor um bot de propósito, `player.touching` continua vazio e
`cameraShake` continua em 0 (nenhum baque, confirmando que a colisão
está mesmo desligada); os 22 bots terminam com `progress > 0`,
confirmando que a física/IA deles continua rodando normalmente nos
bastidores. Sem `NaN` nem exceções.

## 20. Replay: barra de progresso, HUD estilo F1 e câmera onboard/transmissão

O replay cinematográfico (seção 17) só tinha uma câmera automática que
cortava sozinha a cada 6s, sem jeito de pausar, voltar um trecho ou saber
velocidade/volta durante a reprodução. Pedido: uma barra de progresso
"que nem YouTube", uma HUD de telemetria "que nem F1 de verdade", e
escolha manual entre câmera onboard e a de transmissão (que passa a ser a
câmera padrão do replay).

Mudanças:

- **`simulation.js`**: cada frame gravado (a cada `REPLAY_SAMPLE_INTERVAL`)
  passou a levar `speed`, `lap` e `drsActive` do jogador além de
  `pos`/`quat` — sem isso a HUD do replay não tinha de onde tirar
  velocidade/marcha/volta/DRS.
- **`replay.js`**: reescrito para separar "avançar o relógio de reprodução"
  de "renderizar o frame num instante `clock` qualquer" (`renderFrameAt`).
  Isso é o que permite `seekReplay(fraction)` pular pra qualquer ponto sem
  depender da reprodução estar rolando, e `toggleReplayPlayPause` pausar
  sem perder posição. As duas câmeras (`applyBroadcastCamera` — o corte
  automático que já existia, virou o modo "transmissão" e continua
  default — e `applyOnboardCamera`, nova, colada bem perto/baixo atrás do
  carro) ficam num `cameraMode` escolhido só pelo jogador
  (`setReplayCamera`/`cycleReplayCamera`), nunca alternando sozinho.
- **`index.html`/`styles.css`**: nova barra arrastável (`#replayScrubTrack`)
  ligada em `main.js` via Pointer Events (cobre mouse e touch com o mesmo
  código, sem `<input type="range">` nativo — convenção de controles
  customizados do projeto) e uma HUD inferior (`#replayHud`) com
  número/nome do piloto, volta, velocidade, marcha e indicador de DRS.

Dois bugs pegos só testando de verdade (não só lendo o código):

1. **"VOLTA 1/Infinity"** — contra-relógio não tem número fixo de voltas
   (`state.lapCountRace === Infinity`), e a HUD nova mostrava
   `volta/Infinity` literalmente. Corrigido pra, no contra-relógio, mostrar
   só o número da volta (mesma convenção que `updateHud` já usa no HUD da
   corrida normal).
2. **Botão "FECHAR REPLAY" vazando da tela em 375px** — a barra de replay
   (label + botão de câmera + botão de fechar) não quebrava linha; num
   viewport de celular o terceiro botão saía do viewport, violando RN27.
   Corrigido com `flex-wrap` na linha de botões abaixo de 640px (RN27:
   funcionalidades críticas — incluindo o replay — têm que operar em
   mobile sem gerar scroll horizontal).

Testado num contra-relógio real no navegador (desktop e emulando 375×812):
scrub por clique atualiza carro/HUD/tempo corretamente, play/pause
congela e retoma do ponto certo, alternar câmera troca de fato o
comportamento (`CÂMERA: ONBOARD` ↔ `CÂMERA: TRANSMISSÃO`), "FECHAR REPLAY"
volta pra tela de resultado sem erros no console, e não há scroll
horizontal em 375px (`scrollWidth === clientWidth`).

## 21. Bandeiras amarelas, "embreagem" na largada, e o quali que demorava pra começar

Três pedidos numa tacada: bandeira amarela numa colisão forte, uma mecânica
de segurar/soltar ESPAÇO na largada (embreagem), e investigar por que a
classificação demorava um tempinho pra começar a corrida de verdade depois
da volta única.

**Bandeira amarela** (`physics.js`/`player.js`/`bots.js`/`simulation.js`):
reaproveita o `impactSeverity` que a colisão carro-carro (`resolveCarCollisions`)
e a colisão com o muro (`updatePlayerPhysics`) já calculavam — acima de
`.55` (o mesmo limiar que já definia um "baque" digno de nota), dispara
`triggerYellowFlag(s)`, que cria dois mastros com bandeira nas bordas da
pista (ou só renova o tempo de uma bandeira já ativa perto dali, sem
duplicar mastro) e guarda a zona em `state.yellowFlags`. Qualquer carro
(jogador ou bot) dentro do raio de 45m (`yellowFlagCapAt`) tem o teto de
velocidade reduzido pra 46 (de 84-108) e perde o bônus de DRS — jogador e
bots tratados igual, senão um bot causando o próprio incidente passaria
voando por ele. HUD: toast (`showNotice`, só na borda de entrada da zona)
+ banner persistente (`#yellowFlagWarning`, mesmo padrão do aviso de
míssil). Bandeiras expiram sozinhas (9s, renovável) e são
recriadas/limpas a cada largada em `setupItemBoxes()`, igual óleo/mísseis.

**Embreagem na largada** (`input.js`/`player.js`): ESPAÇO durante a
contagem regressiva parou de tentar usar item (só faz isso durante
`state.gameState === "race"` agora) e passou a ser a "embreagem" — uma
dica (`#countdownHint`, escondida em touch via `@media(pointer:coarse)`,
já que a mecânica é só teclado) pede pra segurar e soltar na largada.
`resolveLaunch()` (chamada no `keyup`) lê `state.countdown` no instante da
soltada: soltar ANTES do sinal (`countdown > 0`) é largada queimada —
`car.stun = .8` (o mesmo campo que já dá aquele "atordoado" de levar
item); soltar logo depois (até .35s) é largada perfeita —
`car.boost = 1.1` (reaproveita o campo de boost do miniturbo); mais tarde
que isso é largada normal, sem bônus nem penalidade — e quem nunca toca
em ESPAÇO também larga normal, de propósito (mecânica opcional, não
obrigatória). Validado direto via console: os três casos (`countdown=1.5`
→ stun .8; `countdown=-.1` → boost 1.1; `countdown=-1` → nenhum efeito)
batem exatamente com o esperado.

**Quali "demorando pra começar"**: bug real, não impressão — a condição em
`animate()` que fecha a classificação exigia `state.drivers.every(car =>
car.finish)`, ou seja, esperava os 22 BOTS (que o jogador nem consegue
ver, ver seção 19) terminarem a própria volta antes de seguir em frente,
com um teto de 90s. O jogador cruzava a linha e ficava parado na pista
sem nada pra fazer até isso acontecer. Trocado pra checar só
`state.player.finish` — a classificação agora termina assim que O JOGADOR
termina a volta dele; os bots que ainda não terminaram entram no grid da
corrida de verdade ordenados pelo `progress` atual (aproximação razoável
de quem chegaria primeiro), em vez de uma ordem arbitrária de empate. O
teto de 90s continua existindo só como rede de segurança. Validado no
navegador: teleportando o jogador pra 5m da linha às `raceTime≈21s` da
sessão de classificação, a corrida de verdade já estava ~1.8s andada (e
com um `countdown` novo já em curso) numa checagem ~1s de relógio real
depois — antes disso ficaria parado por um tempo imprevisível dependendo
do ritmo dos bots.

## 22. Quali largando ~100m atrás da linha, largada com 5 luzes (F1), boost recalibrado

Três ajustes na largada/classificação, pedidos juntos.

**Quali largando longe da linha** (`car.js`/`setupGrid`): a posição de
largada só tratava `state.timeTrial` como "sozinho, centralizado, bem
perto da linha" (`progress = -10`) — a classificação caía no `else`
(matemática de fileira de grid: `progress = -10 - Math.floor(slot/2)*9`).
Como a classificação ainda não tem um grid definido na 1ª vez, a ordem
padrão bota o jogador no ÚLTIMO slot (22 de 23) — `progress ≈ -109`, ou
seja, quase 100m atrás da linha, dentro do 3º setor. Como o cronômetro da
única volta da classificação começa em `raceTime = 0` (não quando cruza a
linha), aquela arrancada inicial de quase 100m — feita saindo do zero, o
trecho mais lento de qualquer largada — já contava pro tempo da volta
antes mesmo do carro chegar na linha pela 1ª vez. Corrigido tratando
`state.qualifying` igual a `state.timeTrial` nessa checagem: agora a
classificação também larga centralizada, bem perto da linha, evitando
esse pedaço de tempo "perdido" antes da volta cronometrada nem começar de
verdade. Confirmado visualmente: o carro agora aparece exatamente ao lado
da linha quadriculada ao entrar em classificação, não mais dezenas de
metros atrás dela.

**5 luzes vermelhas em vez de contagem numérica** (`main.js`/`index.html`/
`styles.css`): a contagem "3, 2, 1, VAI!" virou o procedimento real de
largada da F1 — 5 luzes acendem uma a uma a cada `LIGHT_INTERVAL` (.7s),
ficam todas acesas por um tempo ALEATÓRIO (sorteado a cada largada, entre
`LIGHTS_HOLD_MIN`/`MAX` = .3–2.2s) e então apagam TODAS DE UMA VEZ — esse
apagão simultâneo é a própria largada, sem contagem previsível. Reaproveita
o mesmo `state.countdown` decrescente de antes (só troca o que é exibido:
`state.countdownTotal`, sorteado em `startRace()`, dá a duração total,
usada só pra saber quantas luzes acender a cada instante); o instante em
que `state.countdown` cruza 0 continua sendo exatamente o mesmo que
`resolveLaunch()` (seção 21) usa pra julgar largada queimada/perfeita —
nenhuma mudança na lógica da embreagem, só na duração (agora variável) e
na exibição (luzes em vez de número). Testado no navegador: as 5 luzes
acendem em sequência, ficam acesas, apagam juntas, e a corrida começa
exatamente nesse instante, sem erros no console.

**Boost recalibrado**: a largada perfeita dava `car.boost = 1.1` (quase um
miniturbo ULTRA inteiro, generoso demais pra uma mecânica de bônus opcional)
— reduzido pra `.35`, uma vantagem sutil. A largada queimada (`car.stun`)
subiu de `.8` pra `1` e ganhou um corte imediato de velocidade
(`car.speed *= .8`), tornando o erro um pouco mais punitivo (sem exagerar).

## 23. Bug real do quali: bots empilhados na mesma posição

A seção 22 corrigiu a posição de largada da classificação trocando a
condição de `state.timeTrial` pra `state.timeTrial || state.qualifying`
em `setupGrid` — só que essa condição vale pro `order.forEach` INTEIRO,
não só pro jogador. Resultado: TODOS os 23 carros (jogador + 22 bots)
recebiam exatamente `progress = -10, lane = 0` — empilhados no mesmo
ponto, já que `state.qualifying` é uma flag global, não por carro.
Colisão fica desligada na classificação (seção 19), então isso não
"batia" visualmente, mas os bots (que continuam correndo a própria volta
por trás dos panos, ocultos, pra formar o grid depois) começavam sua
IA/decisão de faixa todos a partir do mesmo ponto exato, o que é
claramente incorreto mesmo sem crash. Corrigido pra só o JOGADOR usar a
posição solo (`car.isHuman` na condição); os bots continuam na matemática
de fileira normal, cada um na sua posição de sempre.

## 24. Mônaco e Spa-Francorchamps, corrida noturna, modo campeonato

Pacote grande, três frentes.

**Dois circuitos novos** (`circuits.js`/`public/*.geojson`): traçados reais
de `bacinger/f1-circuits` (`mc-1929.geojson` = Circuito de Monaco, 3.337 km;
`be-1925.geojson` = Spa-Francorchamps, 7.004 km) — a mesma fonte MIT já
usada pros outros 3 circuitos. `buildTrackModel` (track.js) reescala a
curva pra bater exatamente com `TRACK_LENGTH` configurado, então o
comprimento real do traçado bruto não precisa ser perfeito. Os arquivos
`*-elevation.json` são o mesmo placeholder com `samples: []` que
Monza/Indianápolis já usam — sem isso, o perfil de elevação vem só da
tabela `elevationSamples` escrita à mão em `circuits.js` (curvas
famosas/desnível estilizados a partir de conhecimento real dos dois
traçados — subida forte de Monaco até o Casino Square, subida de Eau
Rouge/Raidillon em Spa —, não amostragem SRTM ponto a ponto; mesma
ressalva que Monza já tinha). Testado no navegador: os dois carregam sem
erro, mostram nome/km/curvas/direção corretos, e o carro começa no setor
esperado pra cada um.

**Corrida noturna** (`scene.js`/`car.js`/`state.nightMode`): um toggle na
configuração, aplicável a QUALQUER circuito (não uma "versão" separada de
cada um) — céu e névoa escuros, sol vira luar fraco, e a pista continua
visível/jogável por torres de holofote com cabeçote emissivo
(`MeshBasicMaterial`, sempre "aceso" sem depender de luz de cena) a cada
~70m, mais faróis nos carros (mesma técnica). Nenhuma luz dinâmica de
verdade foi adicionada — com 23 carros já na cena, dezenas de
`THREE.Light` custariam caro demais pra um efeito puramente decorativo.
Como a cena 3D é montada uma vez por circuito (`buildScene`, chamada por
`loadCircuit`), ligar o toggle com uma pista já carregada precisa
reconstruir a cena inteira (`disposeObject3D` + `buildScene` de novo) —
mesmo custo de trocar de circuito, só sem re-buscar o GeoJSON. Testado no
navegador: céu escuro, torres de holofote visíveis ao longo da pista,
minimapa/HUD/largada (as 5 luzes) funcionando normalmente, sem erros no
console.

**Modo campeonato** (`main.js`/`simulation.js`/`state.championship`):
calendário fixo de 5 corridas (`CHAMPIONSHIP_CALENDAR` em constants.js —
os 5 circuitos, 1 corrida cada), pontuação real da F1 (`CHAMPIONSHIP_POINTS`,
25-18-15-12-10-8-6-4-2-1) acumulada corrida a corrida num mapa
`id do piloto -> pontos`. Um botão novo na tela de abertura
("MODO CAMPEONATO") pula direto pra 1ª corrida (sem passar pela
configuração — contra-relógio/classificação são desligados de propósito,
não fazem sentido dentro de uma temporada pontuada). Ao terminar cada
corrida, `showResults()` (simulation.js) soma os pontos e troca a tela de
resultado normal pela classificação do campeonato + botão
"PRÓXIMA CORRIDA" (troca "CORRER DE NOVO"/"CONFIGURAR CORRIDA", que
abandonariam a temporada de propósito — sair por ali limpa
`state.championship`, e isso é intencional: não dá pra "pausar" o
campeonato pra correr uma avulsa e retomar depois). Pego e corrigido
durante o teste: o rótulo "CAMPEONATO · CORRIDA X/5" foi escrito primeiro
em `#raceStatus`, que `updateHud()` (ui.js) sobrescreve a cada ~90ms com o
nome do setor atual — o texto sumia quase instantaneamente. Movido pro
`#circuitName` (só tocado na largada e na troca de circuito), onde
realmente fica visível.

Testado no navegador: iniciar o campeonato carrega Interlagos e começa a
corrida corretamente, com "INTERLAGOS · CAMPEONATO 1/5" persistente no
rótulo, sem erros no console. A soma de pontos/avanço de corrida em si
(`showResults`/`advanceChampionship`) foi validada por revisão de código
(matemática simples sobre `standings`, já teimosamente exercitada pelo
resto do jogo) — completar uma corrida inteira dirigindo de verdade não
foi possível neste ciclo de testes automatizados (o foco do navegador
alternava sozinho durante a automação, pausando a corrida repetidamente),
então esse elo específico merece uma segunda checada jogando manualmente.

## 25. Mônaco e Spa refeitos do zero

As duas pistas da seção 24 saíram ruins — os erros eram estruturais, não de
acabamento. Diagnóstico (medido com o próprio motor do jogo: `buildTrackModel`
em Node, amostrando yaw a cada 5 m; e plotando os traçados em SVG):

- **Mônaco largava no lugar errado.** O ponto 0 do GeoJSON de
  `bacinger/f1-circuits` é o *Casino Square*, não a linha de largada. Portão,
  grid, boxes, nomes de curva, DRS e caixas de item estavam todos deslocados
  ~840 m. Corrigido girando o arquivo (`public/monaco.geojson`, com um vértice
  interpolado exato) pra o índice 0 ser a linha, na reta dos boxes logo depois
  do Antony Noghès. Spa já vinha com o ponto 0 na linha (confirmado: a La Source
  está a ~245 m e o Bus Stop a ~337 m antes).
- **Larguras 2× maiores que o real.** As tabelas são de MEIA-largura; usei 6–8,5
  em Mônaco (17 m de pista, numa rua de ~10 m) e até 12 em Spa (24 m). Agora
  Mônaco fica em ~4,7–6,4 e Spa em ~5,9–7,4.
- **Escapes de grama numa pista de rua.** `cornerWideningTable` de Mônaco tinha
  até 16 m de "escape" — na verdade são muros a ~2 m. Agora 3,4 m constante.
- **Nomes/distâncias das curvas eram proporções chutadas.** Substituídos pelas
  posições medidas na curva do jogo (ex.: Sainte Dévote em 200 m, Massenet em
  ~735, Casino em 875, Grand Hotel Hairpin em 1255, Rascasse em 2905; Spa: La
  Source 245, Eau Rouge 905, Raidillon 1020, Kemmel 1220–2200, Les Combes
  2280–2510, Rivage 2895, Pouhon 3690/3900, Fagnes 4380/4520, Stavelot
  4820/5040, Blanchimont 6060, Bus Stop 6585/6665). Banking, elevação (Raidillon
  ~15% de rampa, Beau Rivage ~10%), DRS reais e as zonas de brita por
  curva foram refeitos em cima disso; itens saem da região do grid.
- **Cenário genérico de autódromo em cima de uma rua e de uma floresta.** Novo
  `SCENERY` (constants.js, `scenery` em cada circuito): `theme` `street` (Mônaco:
  calçada + muro de concreto branco, ~640 prédios mediterrâneos de telhado
  vermelho, postes de luz, túnel com teto/luminárias em 1490–1790 m, o Port
  Hercule como água à esquerda da Beira-Mar/Piscina, paredões rochosos ao
  fundo, céu azul) e `forest` (Spa: ~2600 pinheiros em `InstancedMesh`, colinas
  cônicas em volta, escapes de asfalto, céu fechado das Ardenas). Interlagos,
  Monza e Indianápolis não mudam (`theme: "park"` é o padrão). Boxes/garagens
  passaram a ter espaçamento configurável (`pitBoxSpacing`; Mônaco usa 10,5 m
  porque a reta dos boxes é curta).

Validação: simulação headless dos 22 bots (mesma física/IA do jogo) fecha a 1ª
volta em Mônaco em 72,6–79,4 s (a real é ~72 s) e em Spa em 121–130 s, sem NaN
nem carro travado; visual conferido no navegador com câmera livre em vários
pontos (grid, Sainte Dévote, entrada do túnel, Beira-Mar, Piscina, La Source,
Eau Rouge/Raidillon, Rivage). Um bug pego no caminho: o terreno de rua com
queda de só 1,5 m ficava POR CIMA da pista nas ladeiras (a IDW mistura alturas
vizinhas) e escondia o asfalto na entrada do túnel — voltou pra 5 m, com uma
rampa curta entre a calçada e o terreno.

## 26. Mônaco: "bugs de elevação"; Spa: arquibancadas no meio do traçado

**Mônaco — três causas somadas** (medidas em Node, sem depender de olho):

1. *Perfil de elevação em degraus.* `smoothstepLookup` zera a inclinação em
   CADA amostra da tabela: o perfil vira patamar → rampa ~1,5× mais íngreme
   → patamar, e a física usa a inclinação (`t.y * 9.81`) — o carro acelerava
   e "engasgava" aos trancos. Novo `monotoneLookup` (cúbica monótona de
   Fritsch–Carlson, `mathUtils.js`), opt-in por circuito (`smoothElevation`,
   só Mônaco/Spa; os autódromos originais não mudam). Rampa máxima de Mônaco
   caiu de 16,9% pra 12,8% (a real é ~12%); Spa de 21,8% pra ~19% (Raidillon
   também foi suavizado na tabela).
2. *Terreno "furando" a pista.* O terreno era uma média ponderada das alturas
   de TODA a pista; em Mônaco duas partes da volta ficam a dezenas de metros
   uma da outra a 30 m de diferença (Beira-Mar × Casino) e o terreno subia
   por cima de calçada e asfalto (603 pontos de teste com terreno acima da
   calçada, até 21 m). Agora, em rua, o terreno nunca passa da altura do pé de
   nenhum trecho da pista e só sobe depois de ~38 m (0 pontos de teste).
3. *Calçada/rampa se dobrando nos hairpins.* Faixa lateral com deslocamento
   maior que o raio da curva (Grand Hotel Hairpin: raio ~13 m) dobra sobre si
   mesma, e as duas pernas de um hairpin (a alturas diferentes) tinham as
   calçadas invadindo o asfalto da outra: paredões/lajes soltas a 5–10 m do
   carro. Achado com `Raycaster` + os vértices do triângulo atingido. Em
   rua/floresta, cada borda lateral agora pára em 0,8× o raio (lado de dentro
   da curva) e na metade da distância até a outra perna mais próxima.

**Spa — arquibancadas.** O padrão põe 5 arquibancadas de 409 a 129 m ANTES da
linha (pensado pra reta longa de Interlagos); em Spa isso cai em cima do Bus
Stop (6520–6680 m). Novo `scenery.grandstandStations`; Spa agora só tem
arquibancadas ao longo da reta dos boxes de verdade (6790 → 146 m).

Validado: a simulação dos 22 bots continua fechando a volta (Mônaco
73,3–79,6 s, Spa 120,8–129,0 s); câmera livre no hairpin de Mônaco e na reta
dos boxes/Rivage de Spa sem as lajes nem as arquibancadas no traçado.

## 27. Revisão de Interlagos, Monza e Indianápolis

Mesma auditoria feita em Mônaco/Spa (seção 25–26): corpos reais medidos com
o motor do jogo em Node (yaw a cada 5 m), rampas, simulação headless dos 22
bots, e checagem de dobras de faixa lateral nos hairpins.

**Indianápolis — sem achados.** Oval limpo: 4 curvas de ~256 m de raio, retas
[20–990], [1430–1595], [2030–3000], [3440–3605] batendo com a tabela, elevação
plana, sem dobras nem pernas próximas; bots fecham a volta em 56–62 s.

**Monza — tabela de curvas errada (corrigido).** A geometria bate com a real
(chicane Rettifilo 595/675, Roggia 1820/1895, Lesmo 1 ~2245, Lesmo 2 2570,
Ascari 3635–3855, Parabolica 4860–5015), mas a tabela "por proporção" estava
errada em até 600 m (Ascari em 4250 em vez de ~3600; Parabolica em 5300 em
vez de ~4850; Rettifilo em 300 em vez de ~530; Roggia em 1600 em vez de
~1760): o nome da curva no HUD, as placas e a zona de DRS (que cobria a Curva
Grande e não a reta Ascari→Parabolica) estavam desalinhados. Refeitas as
entradas de setor, placas, DRS (`[5300,540]` reta dos boxes e `[3920,4760]`
Ascari→Parabolica) e uma caixa de item que caía dentro da Roggia (1900 → 1650).
*Não alterado (escolha de design, não bug):* escapes de só 3 m em todas as
curvas (o comentário original já dizia "perfil simplificado") — em Monza real
os muros ficam bem mais longe; vale reavaliar.

**Interlagos — rampa absurda no S do Senna (corrigido).** A tabela de
elevação derrubava 16 m em 67 m (275→342 m): ~35% de rampa de pico (a real
passa de ~12% só em trechos curtos), efeito ampliado pelo smoothstep por
segmento. Trocada por 275→360→470 m (43 → 33 → 22 m) e `smoothElevation`
ligado: rampa máxima 34,7% → 15,4%. Os demais nomes/DRS/itens/largura
conferem (as entradas de setor ficam ~70–100 m antes do ápice medido, mesma
convenção das pistas novas).

**Todas — faixas laterais dobrando nos hairpins (corrigido).** A proteção
da seção 26 (borda interna limitada a 0,8× o raio da curva e à metade da
distância até a outra perna) agora vale pra todos os temas: 8 trechos de
Interlagos (S do Senna R=31 m com faixa de 44 m, Bico de Pato R=21 m com
33 m…) e 4 de Monza (chicane Rettifilo R=10 m com 25 m…) tinham a faixa
maior que o raio. Só age onde a faixa realmente dobraria.

Validação: bots fecham a 1ª volta em Interlagos 82–87 s, Monza 93–103 s,
Indianápolis 56–62 s (sem NaN nem travados); câmera livre em Monza
(chicane Rettifilo) e Interlagos (Bico de Pato) sem artefatos nem erros de
console.

## 28. Cenário próprio pra Interlagos, Monza e Indianápolis

As três pistas originais usavam o mesmo cenário genérico (gramado, ~140
árvores esparsas iguais, "morros" de caixas, arquibancadas de cores fixas).
Agora cada uma tem identidade própria, no mesmo esquema de `SCENERY` da
seção 25 (novos temas em `scenery.theme`; o tema `park` continua sendo o
padrão pra quem não define nada):

- **Interlagos (`tropical`)**: ~1500 árvores em `InstancedMesh` —
  palmeiras (tronco alto + copa achatada) e copas redondas, com uns ipês
  amarelos e rosas no meio; morros verdes arredondados em volta; skyline
  paulistana (90 torres em arco ao fundo — à noite as janelas ganham
  emissivo baixo); o Lago de verdade, dentro da Descida do Lago (T4–T5);
  arquibancadas nas cores do Brasil e placas "BRASIL / SÃO PAULO /
  INTERLAGOS / GRANDE PRÊMIO" ao longo da reta dos boxes.
- **Monza (`woodland`)**: o Parque de Monza — ~3000 árvores de folha caduca
  bem coladas na pista (um "corredor" verde, ~20% já em tons de outono),
  céu enevoado da Lombardia, sem morros (é planície); arquibancadas
  vermelhas/brancas/verdes e placas em tricolor ("MONZA / ITALIA /
  AUTODROMO / FORZA").
- **Indianápolis (`speedway`)**: arquibancadas contínuas de 3 camadas
  (4 e com cobertura na reta principal) em volta de TODO o oval, mais
  arquibancadas baixas no infield junto da reta; a Pagoda (5 andares com
  faixa de vidro e telhado vermelho) e o painel de posições no infield;
  faixa de tijolos na linha de chegada; lago do campo de golfe no infield;
  bosque baixo depois das arquibancadas e skyline de Indianápolis.
  As caixas do complexo usam uma variante *nivelada* de `addAlignedBox`
  (o oval tem banking de ~9° e a versão normal inclinaria as arquibancadas).

Infra nova em `scene.js`: `scatterAlongTrack` (sorteia pontos em volta da
pista, denso perto do muro, rejeitando pista/outra perna/água) + `setInstance`
/ `commitInstances`; o antigo "porto" de Mônaco virou `scenery.harbor`
genérico (água = lago em Interlagos/Indy) com `waterColor`; cadeiras
(`seatColors`), placas (`banners`) e skyline (`skyline`) configuráveis.

Bug pego no teste visual: o lago de Interlagos não aparecia — o
quadrilátero único de ponta a ponta "torcia" numa gravata-borboleta de área
~0 porque a pista faz uma curva de ~130° no meio do trecho (T4–T5). A água
agora é montada em fatias de ≤40 m, cada uma com as normais das próprias
pontas (validado em Node: nenhuma amostra da pista cai dentro da água em
Interlagos, Indianápolis nem Mônaco; em Mônaco isso exigiu reduzir a
profundidade do porto de 300 pra 200 m e parar o trecho antes do hairpin da
Rascasse, senão as fatias alagavam a subida de Beau Rivage).
