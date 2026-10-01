# Interlagos 2.0 — referências do cenário

Referências consultadas em 29/09/2026:

- [Mapa e descrição oficial dos setores do GP São Paulo](https://f1saopaulo.com.br/arquibancadas/).
- [Mapa oficial publicado em agosto de 2026](https://f1saopaulo.com.br/wp-content/uploads/2026/08/Mapa-completo.webp).
- [Foto oficial da vista do setor M](https://f1saopaulo.com.br/wp-content/uploads/2024/10/arq-M-1.jpg): treliças da arquibancada, boxes e cobertura branca com mastros.
- [Foto oficial da vista do setor B](https://f1saopaulo.com.br/wp-content/uploads/2024/10/arq-b.jpg): centro operacional envidraçado e reta dos boxes.
- [Informações da Prefeitura sobre a pista e os boxes](https://autodromodeinterlagos.prefeitura.sp.gov.br/pistaoficial).

O cenário usa o traçado e a elevação existentes. Os setores A e G são
descobertos; B e M ficam na reta principal; D, H e R acompanham o S do Senna,
a Curva do Sol e o começo da Reta Oposta; G e Porto ficam junto ao fim da
Reta Oposta. Arquibancadas têm degraus, assentos, corredores, público,
pilares e, quando aplicável, cobertura e treliças. Os boxes recebem
membranas brancas, mastros, cabos e um centro operacional envidraçado.

## Limites de fidelidade

A disposição e as características vêm das referências acima, mas as medidas,
o número de filas, as estações no traçado e os detalhes estruturais são
estimados. Não há levantamento arquitetônico, fotogrametria ou modelo CAD
licenciado neste projeto. Portanto, esta é uma reconstrução de referência,
não uma réplica integral ou certificada em escala. As próprias referências
oficiais avisam que as estruturas temporárias mudam entre edições.
Áreas comerciais e de hospitalidade internas ainda não foram reproduzidas
integralmente. As fotos foram consultadas, não incorporadas como texturas.

As projeções de todos os módulos de arquibancada, incluindo suas coberturas,
são verificadas contra o asfalto antes da construção. A experiência clássica
continua usando o seu cenário original.

## Câmera

A 2.0 usa exclusivamente a câmera a bordo, calculada no espaço local da pose
interpolada do carro. O olho fica baixo, a ~20 cm acima da borda do cockpit e
da capa do painel, como nas câmeras de onboard das referências: o horizonte cai
perto de 45% da altura da tela, o volante ocupa o terço inferior e o halo
aparece como um aro largo que sobe para os cantos superiores, com pilar curto.
O FOV vertical é 68° em 16:9; em telas mais largas ele diminui para manter o
mesmo campo horizontal (ultrawide não estica a imagem) e em telas estreitas
cresce até garantir ao menos 88° horizontais (limite de 84° vertical). O botão
de troca fica oculto e seu handler ignora a 2.0. A preferência de câmera da
versão clássica é restaurada ao sair.

A cabeça reage ao carro, sempre em espaço local e com limites rígidos (olho a
no máximo 5 cm do ponto de repouso e rotação de poucos graus), para nunca
atravessar halo ou capacete:

- curva: a visão gira até ~5° para dentro da curva, inclina até ~1,6° e o olho
  é empurrado ~1,6 cm para fora, proporcionalmente a `steer × velocidade`;
- frenagem: a visão cabeceia até ~1,7° para baixo e o olho avança ~1,8 cm;
  ao acelerar o efeito é menor e no sentido oposto;
- velocidade: vibração fina do chassi, crescente até ~90 m/s, e abertura suave
  do FOV de até +3,5° (segue `speed / 94`);
- zebra e borda: `car.edgeRumble` (0 no centro da pista, 1 na borda ou fora, calculado
  em `player.js`) multiplica a vibração por até 5× com frequência mais grave;
- impactos: tremor curto e decrescente (`cameraShake`).

Esses movimentos são suavizados (constante ~5 Hz para as cargas, ~18 Hz para o
deslocamento). Em repouso a câmera fica exatamente no ponto de repouso.

## Cockpit e superfícies

O cockpit é um conjunto 3D dedicado, modelado a partir de referências de
onboard de F1 (halo largo com pilar, retrovisores sobre os pneus dianteiros,
volante com tela grande e painel baixo). Cada lateral do monocoque é um loft
contínuo com três materiais: revestimento interno, borda acolchoada e pintura.
Na altura do volante o cockpit abre e a borda fica abaixo das mãos, para que
volante e luvas fiquem inteiros à vista; à frente, um deck pintado se estende
até perto dos pneus. Scuttle, capa do painel e nariz formam uma superfície
única (`beta-center-body`).

Todas as malhas procedurais precisam de normais voltadas para fora: lofts
espelhados em x invertem o sentido dos triângulos, e com `DoubleSide` isso faz
o mapa de sombras escurecer a própria superfície. `loft()` recebe `flip` e o
teste de regressão confere o sinal das normais.

O halo é fino (aro oval de ~6 cm e pilar de ~5 cm). O ápice fica a ~12° acima do
horizonte e o pilar é curto, apoiado numa base metálica no scuttle; os braços
sobem para os lados e para trás, até as laterais do cockpit.

**Retrovisores.** Cada espelho mostra a vista traseira real, renderizada em uma
textura 384×160 a cada dois quadros (`renderBetaMirrors`). A direção da câmera
do espelho é o reflexo do olhar do piloto na normal do vidro, então a imagem
muda com o movimento da cabeça; a textura é espelhada em x. Durante o render o
mapa de sombras já calculado é reaproveitado (`shadowMap.autoUpdate = false`) e
os dois vidros ficam ocultos para evitar feedback.

**Pneus.** Pretos e lisos, sem inscrições. Os dianteiros são menores e mais
estreitos que os traseiros (escala 0,78 × 0,86), como num F1 real.

**Mãos e braços (versão anterior, substituída abaixo).** As luvas têm dorso, quatro dedos que contornam a pegada,
polegar e tecido procedural com pontos de silicone; o punho é claro e o
antebraço afina em direção ao pulso e mergulha para baixo do volante, de modo
que só um trecho curto aparece na tela. Os
antebraços são reposicionados entre o cotovelo e o pulso a cada frame.

**Volante.** `betaWheel.js` recria um volante de F1 moderno (inspirado no W11) do
zero, a partir de medidas tiradas de uma imagem de referência; nenhuma malha ou
textura de modelo de terceiros é usada. Chassi de carbono largo, display com
moldura, fileira de 15 LEDs de troca de marcha e 3 + 3 LEDs laterais (âmbar:
volta inválida à esquerda, DRS à direita), empunhaduras de borracha que descem
curvadas, botões impressos nos cantos (DRS, +10, N, PC, +1, PL), colunas de
balancins e botões ao lado do display e três seletores serrilhados com anéis
numerados. O desenho é feito em pixels de tela e convertido por `P()`; a placa
pintada (botões, rótulos, anéis) é uma textura gerada em canvas e o relevo é 3D.
O volante fica inclinado em direção ao piloto, gira até ~34° conforme a direção
e o display (800×500, 20 Hz) mostra velocidade, marcha, acelerador, tempo da
volta, status e barra de giro em 24 segmentos. As luvas seguem as empunhaduras
(`GRIP_ANCHOR`) e o punho vem de `wristLocal`. Botões e seletores são
decorativos, não novos comandos.

**Iluminação.** Luz hemisférica de preenchimento 0,62 e intensidade do mapa de
ambiente 0,85, para o lado do carro virado contra o sol não ficar preto; o
verniz da carenagem usa o mapa de ambiente com intensidade reduzida, pois em
ângulo rasante o reflexo do céu lavava a cor.

## Pós-processamento

Depois do `OutputPass` roda `betaPostFx.js`, uma gradação final: saturação
1,14, contraste 1,07, vinheta suave, aberração cromática discreta nas bordas e
um desfoque radial que só aparece acima de ~126 km/h (cresce com o quadrado da
velocidade e poupa o centro, onde está o ponto de fuga da pista). As coxas do
piloto convergem para os joelhos sob o volante. Os retrovisores pulam quadros
lentos (`dt > 34 ms`) para não agravar uma queda de FPS.

## Interface (HUD)

A 2.0 tem uma HUD própria no estilo das transmissões de F1 (`src/betaHud.js` e
`src/betaHud.css`); a HUD clássica fica escondida só nessa versão. Nenhum
logotipo ou marca registrada da F1 é usado, apenas a linguagem visual: painéis
escuros com cantos cortados, faixa vermelha, branco e roxo para melhor tempo.

- **Torre de tempos** (canto superior esquerdo): circuito e sessão, linha do
  piloto com a cor do carro e o tempo da volta atual, melhor volta (roxo) e última.
- **Faixa de volta** (topo, centro): número da volta e validade (vermelha quando
  o carro excede os limites da pista).
- **Aviso de volta completada**: tempo da volta e diferença para a melhor
  anterior, por 5 s (roxo se for a melhor volta, amarelo se for mais lenta).
- **Telemetria** (inferior esquerdo): 15 LEDs de rotação (iguais aos do volante),
  marcha, velocidade, barras de acelerador e freio e selo de DRS.
- **Setores e delta** (inferior direito): S1, S2 e S3 com tempo e cor (verde se
  igualou o melhor setor, amarelo se foi mais lento) e barra de delta ao vivo
  contra a melhor volta (verde à esquerda adiantado, vermelho à direita atrasado).
- Minimapa, botões, avisos, semáforo de largada, pausa e fim de corrida
  receberam o mesmo tratamento. Em telas até 760 px a HUD enxuga: some a coluna
  de setores e os pedais.

As atualizações são por quadro e só escrevem no DOM quando o valor muda. O
texto do jogador usa `textContent`; nada é inserido como HTML.

## Menu, ajustes e horário

Ao tocar em *Formula Rush 2.0* abre o menu de preparação (`src/betaMenu.js`):
controles, três dicas, ajustes, aviso legal, link de feedback e o botão LARGAR.
Marcar "Não mostrar este menu antes de largar" pula direto para a pista; os
ajustes continuam acessíveis em *Pausa → Ajustes e controles*. Durante a pausa,
Esc ou P fecham só o menu e não retomam a corrida.

Ajustes (`src/betaSettings.js`, salvos em `localStorage`; valores inválidos são
normalizados e armazenamento bloqueado não derruba o jogo):

| Ajuste | Opções | Efeito |
|---|---|---|
| Qualidade | baixo, médio, alto | *pixel ratio* máximo (1 / 1,5 / 2), MSAA (0 / 2 / 4), sombras (1024 / 2048 / 4096), bloom e frequência dos retrovisores. Celular começa em médio. |
| Horário | dia, pôr do sol | céu, reflexos, sol, luz de preenchimento, névoa e exposição |
| Câmbio | automático, manual | manual: `J` sobe e `H` reduz (ver "Câmbio (2.0)"); `G` alterna durante a corrida |
| Campo de visão | 60–80° | FOV vertical de base da câmera a bordo |
| Balanço da câmera | 0–100% | escala todo o movimento de cabeça (combina com *reduzir movimento* do sistema) |
| Velocidade | km/h, mph | HUD e display do volante |

Tudo se aplica ao vivo (`src/betaApply.js`): qualidade recria a resolução
adaptativa, o mapa de sombras e os alvos de MSAA; o horário refaz o céu e o
mapa de reflexos (PMREM) e religa os materiais que o guardam.

**Pôr do sol.** Sol a ~4° do horizonte, à frente do carro na largada, luz
alaranjada, sombras longas e névoa quente (`BETA_TIMES` em `betaNature.js`). O
tom frio aplicado às nuvens do dia é desligado pelo uniforme `uWarm`.

**Carregamento.** A barra do menu acompanha as etapas reais (traçado, pista,
autódromo, carro) e cede ao navegador entre elas para pintar o progresso.

**Feedback.** O botão abre um relato já preenchido com FPS médio, qualidade,
horário, tela, navegador e os últimos 3 erros (`src/betaDiagnostics.js`). Nada
é enviado sozinho. A URL padrão é a de *issues* do repositório no GitHub;
defina `VITE_FEEDBACK_URL` para usar outro formulário.

<<<<<<< ours
## Público animado e patrocinadores

**Público** (`src/crowd.js`). Cada torcedor é uma instância de uma malha
estática (tronco hexagonal com dois braços, cabeça octaédrica, ~44 triângulos).
A animação roda no vertex shader: a fase vem da posição da instância, então
nenhuma matriz é reescrita na CPU e os blocos espaciais de `instanceChunks.js`
continuam valendo. Cada pessoa pula no próprio ritmo, uma "ola" lenta atravessa
as arquibancadas e quem está a menos de ~140 m do carro do jogador se anima
mais, levantando os braços. Cerca de 4,5% levam bandeira (Brasil e três lisas)
e têm o braço direito sempre erguido. Camisetas e tons de pele vêm de paletas
(`SHIRT_COLORS`, `SKIN_TONES`); cadeiras têm listras diagonais por setor.
Com `prefers-reduced-motion` a amplitude vai a zero e o público fica parado. O
relógio é `state.clockTime`, que para na pausa.

**Patrocinadores** (`src/sponsors.js`). Marcas **fictícias**, inspiradas no tipo
de anunciante das transmissões de F1 (relógios, pneus, cerveja, companhias
aéreas, nuvem, logística, bancos...), com nomes e logotipos desenhados em
código; nada de marcas reais é reproduzido. Todas as placas partilham um atlas
de 20 células (18 marcas + as placas da casa "FORMULA RUSH" e "INTERLAGOS") e
viram uma única malha. Ficam coladas ao muro (blocos de 4–7 placas, contínuas
na reta dos boxes), na grade frontal de cada arquibancada, sobre os vãos das
garagens, no vidro da passarela e no pórtico de largada. Ao trocar uma marca,
edite `SPONSORS` e o respectivo desenho em `PAINTERS`.

## Posições medidas (OpenStreetMap)

As estruturas de Interlagos 2.0 usam coordenadas **medidas**, não estimadas à
mão, para os elementos que o OpenStreetMap descreve. Método (reprodutível):

1. Consulta Overpass na caixa do autódromo (`building=grandstand`,
   `leisure=bleachers`, `building=pavilion`, `bridge=yes`, `man_made=tower`,
   `highway=raceway` com os nomes das curvas e a pit lane), em 01/10/2026.
2. O traçado do jogo (`public/interlagos.geojson`) foi encaixado nas
   coordenadas do OSM por mínimos quadrados com escala uniforme: escala
   1,0009, erro médio de 17 cm e máximo de 81 cm entre os 171 pontos.
3. Cada polígono foi projetado em (`s`, `lane`) com `track.nearest`, a mesma
   função usada pelo jogo; o resultado está em `src/interlagosReal.js`.

O que mudou em relação à primeira reconstrução:

| Elemento | Antes | Agora (fonte) |
| --- | --- | --- |
| Setor A | s −650…−160 | s −638…−389, 15 filas (OSM `bleachers`) |
| Setor B | s −130…14 | s −100…0 (OSM `grandstand`) |
| Setor M | s 40…238, 21 filas | s 22…254, 26 filas: o maior setor, ≈25 m de profundidade (OSM `grandstand` "M") |
| Setor D | s 270…378 | s 274…352 (OSM `construction`) |
| Passarela | s 710 | s 262, pilares em lane ±24 e rampas até ±40 (OSM `bridge`) |
| Boxes | s −245…195 | s −8…392; a faixa é interrompida onde a rampa da passarela desce (OSM `pavilion`) |
| Centro de controle | s −275 | s −42, lane −35, junto ao início do complexo (prédio OSM de 1.236 m²) |
| Torre de cronometragem | s −115, junto à pista | s −224, lane +57, atrás do muro (OSM `tower`) |

Setores H, R, G e Porto não têm polígono no OSM; mantêm as posições do mapa
oficial. As alturas, o número de filas e os detalhes das estruturas continuam
estimados. Os vídeos de transmissão não foram usados (não são analisáveis
automaticamente); a única fonte visual externa foi o texto dos setores no site
oficial. Também corrigido: a placa "INTERLAGOS · SÃO PAULO" da passarela saía
espelhada, e a faixa com o nome da torre olhava para longe da pista.

**Patrocínios.** Placas contínuas na reta dos boxes e na Subida dos Boxes
(trechos mais mostrados pela TV), em blocos densos no lado de fora das curvas
e esparsas no resto. Painéis grandes sobre postes ficam atrás do muro, do lado
de fora das principais frenagens, sem cobrir as placas de distância e de nome
de curva. O alambrado agora cobre também a frente de todos os setores e é uma
única malha.

## Câmbio (2.0)

Menu de ajustes → CÂMBIO, ou a tecla `G` durante a corrida, alterna entre:

- **Automático** (padrão): o comportamento anterior, sem mudanças.
- **Manual**: `J` sobe e `H` reduz uma marcha (botões `+`/`−` no celular).

No manual o giro do motor é proporcional à velocidade na marcha engatada
(`rpmAt`). As luzes de troca (HUD e volante) só acendem na faixa alta do giro;
o número da marcha pisca perto do limite. No limite de giro o motor corta a
força até você subir. Marcha curta acelera mais e segura mais sem acelerar
(freio-motor); marcha longa em baixa rotação perde força. Para facilitar:
a embreagem patina na saída, uma redução que estouraria o motor (> 106% do
giro) é recusada com um tremor no número, e quase parado o câmbio reduz
sozinho (anti-stall). O som do motor segue o mesmo giro.
## Mãos e braços

Cada luva (`buildGlove` em `betaCockpit.js`) tem dorso perfurado com protetor
dos nós dos dedos na cor da equipe, quatro dedos de comprimentos diferentes que
contornam a borda externa da empunhadura (cada um com ponta e articulações),
polegar sobre a borda interna e punho reforçado. O braço usa cinemática inversa
de dois ossos (34 cm cada): o ombro é fixo, o pulso fica preso à luva, e o
cotovelo cai para fora e para baixo. Se o pulso passar do alcance, o braço
apenas estica. O antebraço tem punho claro e uma faixa na cor da equipe. A mão
acompanha o volante; `wristLocal`, `GRIP_ANCHOR` e `HAND_SCALE` (em
`betaWheel.js`) definem onde ela encosta na empunhadura.

## Carro 3D

A carroceria e as rodas vêm do modelo *F1 2022 {FREE!!}* (CC BY 4.0, créditos no
menu, no README e em `public/assets/cars/CREDITS.md`), carregado por
`src/betaCarModel.js`. O arquivo é baixado durante a barra de carregamento
(~3,5 MB, otimizado de 9 MB) e, se não chegar, a carroceria procedural antiga
continua valendo.

- **Encaixe:** escala 0,958, deslocamento (y 0,093; z −0,849): eixos em z = 1,47 e
  −1,54 (o jogo usa 1,45 e −1,52) e o pneu traseiro apoiado no chão.
- **Pintura:** o preto da carroceria (monocoque, laterais, capô do motor, asas) vira o
  material do jogador, então a cor escolhida continua valendo. O resto vira carbono
  escuro. Os pneus ficam pretos e lisos: o anel amarelo do composto é removido.
- **Rodas:** cada uma ganha um pivô no centro e gira em torno do eixo x. Os pneus
  dianteiros são ampliados 12% e descem 3 cm para tocar o chão como os traseiros.
- **Cockpit:** halo, painel, cabeça e volante do arquivo são removidos (o jogo tem os
  seus). O cockpit do jogo desce 0,28 m e o olho avança 0,1 m (`COCKPIT_DROP`,
  `COCKPIT_FORWARD`): neste carro o piloto senta bem mais baixo e à frente do que no
  modelo antigo, como num F1 real. Na visão de dentro, o monocoque e o capô do motor
  do arquivo ficam escondidos (cobririam braços e mãos); por fora continuam visíveis.
- **Medir o modelo:** `Box3.setFromObject` usa a caixa girada e exagera. Para testes, use
  `setFromObject(obj, true)`.

## Esquema de cores do carro

Para casar com a foto de referência (F1 2022 visto de cima), a carroceria do modelo
usa uma base clara perolada com o destaque na cor do jogador, em vez de pintura única:
bico e capô com a faixa central, halo inteiro, bordas das entradas de ar, laterais e
filete da asa dianteira e pontas e centro da asa traseira. O destaque é uma máscara por
vértice (`ACCENT_RULES` em `betaCarModel.js`) misturada no shader; assoalho, difusor e
suspensão ficam em carbono escuro. Halo, painel e volante do modelo aparecem só por fora
(`applyBetaCarView`); por dentro valem os do jogo. O número do carro é uma placa pequena
na asa traseira, e a luz de chuva traseira acende forte ao frear.

## Sem drift e sem turbo

Na 2.0 o drift (Shift) e o turbo estão desligados: `player.js` ignora Shift e a largada
perfeita não concede mais impulso. O botão de drift do toque some. O contra-relógio já
não tem itens, então nenhum turbo de caixa existe.

## Guia de pilotagem

`betaGuide.js` pinta no asfalto uma linha fina e translúcida (1,3 m) à frente do carro, até
280 m, no estilo da linha de corrida dos jogos de F1: sem paredes nem túnel, só uma linha
suave que some com a distância. **Verde** = acelere, **amarelo** = alivie o pé,
**vermelho** = freie. O alvo de velocidade de cada ponto vem da curvatura do traçado e da
capacidade real de esterço do carro (a mesma `maxYawRate` de `player.js`), com frenagem de
30 m/s² calculada de trás para a frente em duas voltas. A cor compara a velocidade atual com
a permitida naquele ponto: acima, vermelho; perto do limite de uma curva, amarelo; senão,
verde. A HUD repete o aviso em um selo pequeno (ACELERE, ALIVIE, FREIE). Pode ser desligado
em Ajustes (`guide`).
>>>>>>> theirs
