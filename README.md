# Formula Rush — Interlagos

Corrida arcade 3D (three.js) com **três circuitos reais** (Interlagos,
Monza e o oval da Indy 500 em Indianápolis) — drift, miniturbo, itens
(turbo/míssil/óleo/escudo), 22 bots com IA usando os pilotos e cores reais
da F1 2026, câmera externa/cockpit, minimapa, cronometragem de voltas,
contra-relógio solo com regra de limites de pista, e um **ranking local**
das melhores voltas.

Este projeto foi **reconstruído a partir da versão publicada** (bundle
minificado) em uma estrutura modular e legível, pronta para abrir e continuar
desenvolvendo no VS Code. Veja **[docs/AUDITORIA.md](docs/AUDITORIA.md)** para o
relatório completo do que foi encontrado, o que estava faltando e como cada
coisa foi reconstruída.

## Rodando o projeto

Pré-requisito: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (por padrão
`http://localhost:5173`). É isso — o traçado de Interlagos e o relevo já vêm
inclusos em `public/`.

Para gerar uma versão de produção (arquivos estáticos otimizados):

```bash
npm run build      # gera a pasta dist/
npm run preview    # serve a pasta dist/ localmente, para conferir o build
```

## Estrutura do projeto

```
formula-rush-interlagos/
├── index.html                 # HTML da página (mesma UI da versão original)
├── package.json
├── vite.config.js
├── public/                    # arquivos servidos como estão, na raiz
│   ├── interlagos.geojson     # traçado real de Interlagos, fonte: bacinger/f1-circuits (MIT)
│   ├── elevation.json         # ver docs/AUDITORIA.md § 3.2
│   ├── monza.geojson          # traçado real de Monza, mesma fonte
│   ├── monza-elevation.json   # ver docs/AUDITORIA.md § 3.2
│   ├── indianapolis.geojson       # oval real da Indy 500 (geometria calculada, ver docs/AUDITORIA.md)
│   └── indianapolis-elevation.json
├── src/
│   ├── main.js                # ponto de entrada: inicialização + loop principal
│   ├── constants.js           # constantes do jogo (tabelas de pista trocáveis + grid da F1 2026)
│   ├── circuits.js             # registro de circuitos (Interlagos, Monza, Indianápolis)
│   ├── leaderboard.js           # ranking local (localStorage) de melhores voltas
│   ├── state.js                # estado mutável central (compartilhado entre os módulos)
│   ├── mathUtils.js            # clamp, wrapAngle, interpolação, etc.
│   ├── dom.js                  # helpers de DOM (mostrar/ocultar, avisos)
│   ├── track.js                 # modelo da pista: leitura do GeoJSON/elevação e amostragem
│   ├── materials.js             # materiais three.js e helpers de mesh
│   ├── scene.js                 # construção de toda a cena 3D (pista, cenário)
│   ├── minimap.js                # desenho do mapa (preview e minimapa dinâmico)
│   ├── car.js                    # modelo 3D do carro + grid de largada (23 carros)
│   ├── player.js                 # física/controle do carro do jogador
│   ├── bots.js                    # IA e física dos 22 adversários
│   ├── physics.js                 # física compartilhada (colisões, progresso de volta, limites de pista)
│   ├── items.js                    # sorteio e uso de itens (turbo/míssil/óleo/escudo)
│   ├── simulation.js               # loop de simulação por tick + tela de resultado
│   ├── timing.js                    # cronometragem de voltas + painel de tempos
│   ├── input.js                     # teclado, toque e pausa
│   ├── camera.js                     # câmera (menu, externa, cockpit)
│   ├── ui.js                          # HUD + configuração do menu
│   ├── audio.js                        # motor de áudio procedural (Web Audio API)
│   └── styles.css                      # estilos (formatados; conteúdo idêntico ao original)
├── docs/
│   ├── AUDITORIA.md            # relatório completo da auditoria
│   └── elevation.samples-example.json  # amostras de elevação alternativas (opcional)
└── original-bundle/            # cópia intacta dos arquivos originais enviados, como referência
    ├── index.html
    ├── README-original.md
    └── assets/
        ├── game.js
        └── styles.css
```

## Controles

| Ação | Teclado | Toque |
|---|---|---|
| Acelerar / Frear | `↑` `↓` (ou `W` `S`) | botões na tela |
| Direção | `←` `→` (ou `A` `D`) | botões na tela |
| Drift | `Shift` | botão "DRIFT" |
| Usar item | `Espaço` | toque no item no HUD |
| Trocar câmera | `C` | botão "CÂMERA" |
| Reposicionar na pista | `R` | botão "↺" |
| Pausar | `P` / `Esc` | botão "Ⅱ" |
| Tempos de volta | `T` | botão "VER TEMPOS" |

## Contra-relógio e limites de pista
Marque "Contra-relógio" no menu para correr sozinho, sem bots e sem caixas
de item — só você contra o cronômetro, sem limite de voltas. Quando quiser
parar, pause (`P`/`Esc`) e clique em "ENCERRAR CONTRA-RELÓGIO" para ver seus
tempos.

Nesse modo vale a **regra de limites de pista**: se você sair do traçado
marcado (além da linha branca) em algum ponto da volta, ela fica inválida —
não vira sua melhor volta e não entra no ranking, mesmo que o tempo
cronometrado tivesse sido bom. O tempo da volta atual fica vermelho no HUD
enquanto ela estiver inválida, e o painel de tempos marca voltas inválidas
com ⚠️.

## Ranking local
O botão "VER RANKING DESTA PISTA" no menu mostra as melhores voltas salvas
no seu navegador (uma por nome digitado em "SEU PILOTO", por circuito). Não
é global entre jogadores de máquinas diferentes — é um ranking local
(localStorage), não um serviço online. Ver `docs/AUDITORIA.md` § 13.3.

## Circuitos
O seletor "CIRCUITO" no menu troca a qualquer momento entre Interlagos,
Monza e o oval da Indy 500 (o traçado, o mapa e a órbita da câmera
atualizam na hora). Os campos "SEU PILOTO" (nome e número) mudam o que
aparece no seu carro, na classificação final e no painel de tempos.

## Grid de 23 carros: os 22 pilotos da F1 2026
Os 22 bots usam os nomes, números e cores reais dos carros da temporada de
F1 2026 (11 equipes, incluindo a estreia da Cadillac) — companheiros de
equipe compartilham a cor do carro, como na F1 de verdade. Ver
`docs/AUDITORIA.md` § 14.4 para as fontes e ressalvas.

## Créditos de dados

O traçado (`public/interlagos.geojson`, `public/monza.geojson` e
`public/indianapolis.geojson`) vem do repositório
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT); a
Interlagos já era citada nos créditos da própria página do jogo.
