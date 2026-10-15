# Indianápolis 2.0

O seletor **PISTA** da preparação oferece Interlagos e Indianápolis. A opção
`circuit` fica em `formula-rush.beta.settings.v1`; valores desconhecidos voltam
a Interlagos. “Não mostrar este menu” conserva a pista e ainda mostra o
carregamento. A pausa permite ajustar horário, qualidade e controles, mas a
troca de circuito exige voltar ao menu e largar novamente.

## Referências e fidelidade

Consultadas em **05/10/2026**:

- [IMS — About the Track](https://www.indianapolismotorspeedway.com/history/about-the-track): contexto histórico do autódromo.
- [IMS — Behind the Bricks: Track Conversion](https://www.indianapolismotorspeedway.com/news-multimedia/news/2023/08/31/behind-the-bricks-track-conversion): oval de 2,5 milhas e distinção do circuito misto.
- [IMS — preparação para o inverno](https://www.indianapolismotorspeedway.com/news-multimedia/news/2024/12/03/12-3-ims-winter-ims): quatro buracos de golfe no infield.
- Código e dados existentes: `src/circuits.js`, `public/indianapolis.geojson`,
  `public/indianapolis-elevation.json`, `docs/AUDITORIA.md`, seções 13.4 e 14.2.
  A seção 13.4 é histórica, sobre o circuito misto; a 14.2 descreve o oval atual.

O traçado, a elevação, a largura e o banking de 0,16 rad são reaproveitados sem
alterar os arquivos originais. **Todas as medidas e posições das novas estruturas
são estimadas**, adaptadas à origem do traçado do jogo: a linha está no início
da reta, não na posição topográfica exata do IMS. Filas, lotação, Pagoda,
passarela, boxes, greens e patrocinadores não constituem uma réplica arquitetônica.
A passarela é um elemento de cenário, não uma alegação de levantamento de uma
ponte existente. Não foram usados dados OSM novos, fotos, texturas ou malhas de
terceiros. As novas superfícies e placas são geradas em código. Os créditos
anteriores de Interlagos e do carro continuam no README e no menu.

## Cenário

`betaScenery.js` contém frenagens, câmeras, faixas de alambrado, bancadas,
patrocínios e placa da casa por circuito. Interlagos mantém as estações e a
ordem de construção anteriores. A célula da marca da casa no atlas é reutilizada
para Indianápolis, mantendo dimensões, UVs e resolução de Interlagos.

`indianapolisScenery.js` planeja módulos de 18 m com teste conservador da
projeção completa, incluindo coberturas. As bancadas maiores ficam dos dois
lados da reta principal; as externas seguem as quatro curvas. A lacuna na
estação 945 reserva espaço aos apoios e escadas da passarela.

`indianapolisStructures.js` constrói Pagoda, pylon, boxes com `addPitCanopy`,
pit lane, faixa de tijolos de 0,9144 m e quatro greens. O pórtico, os muros
contínuos, a grama e o lago usam a construção comum da cena. As bancadas se
apoiam na cota do muro, sem prolongar o banking até os assentos. O terreno
do oval é plano; o relevo decorativo de Interlagos permanece como antes.

Assentos e público usam `InstancedMesh`, animação de `crowd.js` e divisão
espacial de `instanceChunks.js`. Geometria estática é mesclada por material;
placas partilham um atlas e alambrados são fundidos. O público respeita
`prefers-reduced-motion`; as bandeiras do golfe são estáticas.

## Pilotagem e isolamento

O perfil do guia é calculado a partir do GeoJSON do oval, sem limite especial
por nome de circuito. A 94 m/s, todas as amostras permitem acelerar. A altura
lateral do guia acompanha o banking para não atravessar o asfalto.

DRS mantém as zonas legadas `[3650, 950]` e `[2050, 2950]`, inclusive a parte
da curva 4 presente na primeira zona; isto é uma regra arcade, não uma regra
de competição real. Os três setores cronometrados usam terços da volta. Os
nomes locais de retas e curvas continuam em `sectorNames`.

`recordKey(circuitId, time)` mantém recordes e trajetórias separados. Carros,
cena e guia são recriados ao largar em outra pista; o fantasma detecta a nova
cena e o novo jogador. A saída restaura o estado clássico por `exitBetaState`.
Não houve mudança em física, itens, bots, ranking, traçado ou elevação da 1.0.

## Como adicionar o próximo circuito

1. Reutilizar um perfil de `CIRCUITS` e seus arquivos de traçado/elevação.
2. Criar o plano puro de estruturas e uma entrada completa em `BETA_SCENERY`.
3. Registrar o construtor de detalhes em `buildBetaTrackDetails`. Reutilizar
   `buildDetailedStands`, `addPitCanopy`, público e atlas quando aplicável.
4. Incluir o id em `BETA_CIRCUITS`; seletor e normalização passam a aceitá-lo.
5. Testar folga de coberturas e apoios, limites de estações, guia no GeoJSON,
   banking, DRS, setores e alternância de recordes. Registrar fontes e estimativas.
6. Executar `npm run check`, comparar capturas de Interlagos e validar o fluxo
   no navegador, incluindo volta ao modo clássico e custo dos retrovisores.

## Verificação reproduzível

`npm run check` executa lint, testes, formatação e build. Os testes específicos
estão em `tests/indianapolis-beta.test.js`.

Com Vite rodando, o script `scripts/verify-indianapolis.mjs` usa Chrome e
Playwright para escolher a pista pela interface, pilotar três voltas pela
física real a 120 Hz (só pedais e direção), verificar recorde/fantasma, capturar
dia/pôr do sol e alternar para Interlagos e clássico. Playwright é uma ferramenta
opcional de QA, não dependência de produção:

```sh
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/verify-indianapolis.mjs
```

`QA_URL` muda o servidor e `QA_OUTPUT` muda o diretório das evidências (padrão:
`/tmp/formula-rush-indianapolis-qa`). O relatório distingue verificações
automatizadas de validação humana; simular voltas não comprova a sensação
de pilotagem em teclado, gamepad ou celular, nem qualidade subjetiva do áudio.
