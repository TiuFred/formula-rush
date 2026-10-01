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

**Mãos e braços.** As luvas têm dorso, quatro dedos que contornam a pegada,
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
