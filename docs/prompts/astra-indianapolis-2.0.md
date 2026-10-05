# Prompt para o Astra — Indianápolis na Formula Rush 2.0

Copie tudo abaixo da linha e entregue ao Astra.

---

## Missão

Adicionar o **Indianapolis Motor Speedway (oval de 2,5 milhas)** ao modo **Formula Rush 2.0**, com o mesmo nível de acabamento que Interlagos tem hoje: cockpit a bordo, HUD de transmissão, guia de pilotagem, recorde pessoal e fantasma, câmbio manual/automático, pôr do sol, arquibancadas com público animado e patrocinadores fictícios. A 2.0 hoje só roda em Interlagos; ao final, o jogador deve poder escolher entre os dois circuitos antes de largar.

O circuito **já existe na versão clássica (1.0)**: `src/circuits.js` (entrada `indianapolis`), `public/indianapolis.geojson` e `public/indianapolis-elevation.json`. **Reaproveite o traçado e a elevação; não os reescreva.** A 1.0 deve continuar **exatamente** como está.

## Leia antes de escrever qualquer código

1. `docs/interlagos-2.0.md` — descreve tudo o que a 2.0 faz (câmera, cockpit, HUD, câmbio, recorde/fantasma, público, patrocinadores, guia). É o contrato de qualidade.
2. `src/betaMode.js` — `BETA_CIRCUITS` é a lista de circuitos da 2.0 e `enterBetaState`/`exitBetaState` isolam o modo. `startGraphicsBeta(circuitId)` em `src/main.js` já aceita o circuito como parâmetro; hoje o botão da landing sempre passa `BETA_CIRCUITS[0]`.
3. `src/circuits.js`, entrada `indianapolis` (comprimento 4023 m, 4 curvas com banking de 0,16 rad, `scenery.theme: "speedway"`, lago no infield, `drsZones`, `itemBoxPositions`) e `docs/AUDITORIA.md` seção 13.4.
4. O que é específico de Interlagos e **precisa ser generalizado**:
   - `src/betaGraphics.js`, função `buildBetaTrackDetails`: tem estações fixas de Interlagos (zonas de frenagem `[255, 1085, 2215, 2920, 3655]`, câmeras de TV em `[420, 1340, 2460, 3480]`, faixa de alambrado calculada a partir de `INTERLAGOS_STANDS`) e chama `buildInterlagosStands` e `buildInterlagosLandmarks`.
   - `src/interlagosStructures.js` e `src/interlagosReal.js`: arquibancadas, passarela, torre e pit canopy medidos no OpenStreetMap para Interlagos.
   - `src/sponsors.js`: cartazes e rodízio de patrocinadores (todos fictícios; há uma marca "casa" `interlagos`).
   - `src/scene.js`, ramos `state.graphicsBeta` e o tema `speedway`.
   - `src/betaMenu.js`: o subtítulo do menu é definido por `openBetaMenu({ subtitle })`; a HUD lê o nome do circuito de `#circuitName`.
5. `src/renderProfile.js`, `src/betaGuide.js`, `src/betaRecords.js` e `src/betaGhost.js`: já são genéricos por circuito (o recorde é gravado por `circuitId` e horário). Confirme em vez de reescrever.

## O que entregar

### 1. Selecionar o circuito na 2.0
- Incluir `"indianapolis"` em `BETA_CIRCUITS` (`src/betaMode.js`).
- Adicionar um seletor **PISTA** (segmentado, como QUALIDADE e HORÁRIO) ao menu `src/betaMenu.js`, e fazer o botão LARGAR iniciar o circuito escolhido (`startGraphicsBeta(circuitId)`). Guardar a escolha em `betaSettings.js` (`circuit`, normalizado: valor desconhecido volta a `interlagos`) para valer também com "Não mostrar este menu".
- O subtítulo do menu, o nome na torre de tempos e a tela de carregamento devem mostrar o circuito certo.
- Ao sair da 2.0 e entrar de novo em outro circuito, nada do anterior pode vazar (cena, fantasma, recorde, guia).

### 2. Generalizar o cenário detalhado
- Substituir as constantes de Interlagos em `buildBetaTrackDetails` por uma **configuração por circuito** (por exemplo `betaScenery` em `src/circuits.js` ou um módulo `src/betaScenery.js`), com: estações de frenagem, posições das câmeras de TV, trechos de alambrado e arquibancadas. Interlagos passa a usar essa configuração com **os mesmos valores de hoje**; o resultado visual dele não pode mudar (compare capturas antes e depois).
- Se ajudar, renomeie `interlagosStructures.js` para algo neutro, mas mantenha os testes `tests/interlagos-structures.test.js` passando.

### 3. Cenário de Indianápolis (oval)
- **Arquibancadas** em volta do oval, com degraus, assentos, corredores, pilares e público animado (`src/crowd.js`). A reta principal tem as maiores (lado interno e externo); curvas 1–4 com arquibancadas contínuas atrás do muro externo.
- **Muro de concreto** externo contínuo e tela de proteção (alambrado) nas retas; faixa de grama interna; **linha de largada/chegada de tijolos** (o "Yard of Bricks") e pórtico de largada.
- **Pagoda / torre de controle** na reta principal, ponte de pedestres e **boxes** com pit lane paralelo à reta principal (use `addPitCanopy`).
- **Infield** com o lago e o campo de golfe já previstos em `scenery.harbor`.
- **Banking** das curvas: a câmera a bordo e o cockpit precisam acompanhar a inclinação (0,16 rad) sem tremer. Verifique `src/onboardCamera.js`.
- Patrocinadores: **somente marcas fictícias**, como já está em `src/sponsors.js`. Crie uma marca "casa" `indianapolis` (como `interlagos`) e distribua cartazes no muro e nas arquibancadas. **Não use logotipos nem nomes de marcas reais.**
- Sem malhas, texturas ou fotos de terceiros que não tenham licença livre. Se usar dados do OpenStreetMap, cite a fonte (ODbL) no cabeçalho do módulo, como `src/interlagosReal.js` faz, e registre em `docs/` data e limites de fidelidade. Medidas estimadas devem ser declaradas como estimadas.

### 4. Jogabilidade no oval
- O **guia de pilotagem** (`src/betaGuide.js`) deve funcionar no oval. As curvas têm raio ~256 m, então deve mostrar quase tudo verde; verifique se o perfil não sugere frear à toa. Ajuste somente o necessário e cubra com teste.
- **DRS**: confira `drsZones` na 2.0. **Setores**: confira os 3 setores e os nomes em `sectorNames`.
- **Limites de pista** e volta inválida: valide que o muro interno/externo e a grama não geram falsos positivos.
- **Câmbio** (automático e manual) e **áudio**: o carro passa a maior parte da volta perto da velocidade máxima; confira o som do motor e as luzes de troca nessa faixa.
- **Pôr do sol**: sol baixo, sombras longas das arquibancadas, sem artefatos de sombra na pista (veja a nota de normais em `docs/interlagos-2.0.md`).

### 5. Desempenho
- O oval tem arquibancadas contínuas: use geometria instanciada e os mesmos mecanismos de Interlagos (`instanceChunks.js`, mesclagem por material). Meta: **mesmo FPS médio que Interlagos** no preset MÉDIO, medido com a mesma máquina e o mesmo caminho de câmera.
- Os retrovisores renderizam a cena de novo (`renderBetaMirrors`); confirme que o custo não dobrou no oval.

## Regras

- **Não altere o comportamento da 1.0.** Antes de terminar, rode a 1.0 em Indianápolis e em Interlagos e confirme que está igual (turbo, drift, itens, bots, ranking).
- Não toque em `original-bundle/`.
- Siga o estilo do código existente: JavaScript em módulos, português nos comentários e na interface, constantes nomeadas, funções puras testáveis separadas do Three.js.
- **Este repositório pode estar sendo editado por outra pessoa ou sessão ao mesmo tempo.** Trabalhe em uma branch (`feat/indianapolis-2.0`) ou em um `git worktree` e faça commits pequenos. Não faça `git add -A` nem force push.
- Acessibilidade: respeite `prefers-reduced-motion` (veja `src/accessibility.js`) em qualquer movimento novo.

## Critérios de aceitação

1. `npm run check` passa (lint, testes, formatação e build).
2. Testes novos, no mínimo:
   - `BETA_CIRCUITS` só contém circuitos que existem em `CIRCUITS`, e a configuração de cenário existe para cada um.
   - Normalização do ajuste `circuit` (valor inválido → `interlagos`).
   - Recorde e fantasma separados por circuito (`recordKey`).
   - O plano das arquibancadas de Indianápolis: nenhuma estrutura invade o asfalto (reaproveite o padrão de `tests/interlagos-structures.test.js`) e as projeções ficam dentro do comprimento da pista.
   - O guia no oval não pede freada em nenhuma curva a plena velocidade.
3. Roda no navegador sem erros no console: escolher Indianápolis no menu, largar, completar 2 voltas, bater um recorde, ver o fantasma na volta seguinte, trocar para pôr do sol, voltar ao menu, entrar em Interlagos e depois voltar ao modo clássico.
4. Capturas de tela (dia e pôr do sol; cockpit na reta principal e dentro de uma curva) anexadas ao PR, mais uma comparação antes/depois de Interlagos provando que ele não mudou.
5. Documentação: nova seção em `docs/interlagos-2.0.md` (ou um `docs/indianapolis-2.0.md`) com referências consultadas e data, limites de fidelidade e como adicionar o próximo circuito; atualizar `README.md`.

## Como me devolver

Abra um PR descrevendo o que mudou, como foi verificado e o que ficou de fora. Diga com clareza o que **não** conseguiu verificar (por exemplo, desempenho em GPU real) em vez de deixar implícito.
