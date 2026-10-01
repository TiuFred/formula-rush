# Formula Rush — Grand Prix Arcade

Corrida arcade 3D (three.js) com **oito circuitos** (Interlagos, Monza,
Indianápolis, Mônaco, Spa-Francorchamps, Red Bull Ring, Miami e Yas Marina) — drift, miniturbo, itens
(turbo/míssil/óleo/escudo), 22 bots com IA usando os pilotos e cores reais
da F1 2026, câmera externa/cockpit, minimapa, cronometragem de voltas,
contra-relógio solo com regra de limites de pista, uma tela de título
(main menu) antes da configuração de corrida, e um **ranking de melhores
voltas** — online (Supabase, opcional) com fallback automático para local.

Este projeto foi **reconstruído a partir da versão publicada** (bundle
minificado) em uma estrutura modular e legível, pronta para abrir e continuar
desenvolvendo no VS Code. Veja **[docs/AUDITORIA.md](docs/AUDITORIA.md)** para o
relatório completo do que foi encontrado, o que estava faltando e como cada
coisa foi reconstruída.

## Rodando o projeto

Pré-requisito: [Node.js](https://nodejs.org) 20.19 ou 22.12+ (exigência do Vite 8; há um `.nvmrc` com a versão 22).

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

## Deploy

O projeto é 100% estático (HTML, JS e assets) e já está ligado à Vercel
(pasta `.vercel/`). Para publicar:

```bash
npm run check          # lint + testes + formatação + build; precisa passar
npx vercel --prod      # ou apenas dê push na main, se a integração com o GitHub estiver ativa
```

- `vercel.json` define cache longo e imutável para `/assets/*` (nomes com hash),
  cache de 1 h para os traçados `.json`/`.geojson` e cabeçalhos básicos de
  segurança (`nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`).
- Ranking online (opcional): defina `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto na Vercel
  (Settings → Environment Variables) e rode `docs/leaderboard-schema.sql` no
  Supabase. A chave _anon_ é pública por desenho; quem protege os dados são as
  políticas RLS do SQL. Sem essas variáveis o jogo usa só o ranking local.
- `.github/workflows/ci.yml` roda `npm run check` em cada push e pull request.

### Desempenho

- Malhas instanciadas grandes (multidão, árvores, prédios) são divididas em
  blocos espaciais de 360 m (`src/instanceChunks.js`), para que o Three.js
  descarte o que está fora da câmera e da luz. Na largada de Interlagos 2.0 isso
  reduziu os triângulos por quadro de ~3,15 M para ~1,36 M.
- A 2.0 ajusta a resolução sozinha (`src/adaptiveResolution.js`): desce o
  _pixel ratio_ se a média ficar abaixo de ~48 FPS e o devolve aos poucos quando há
  folga. Adicione `?fixedres` à URL para desligar.
- O plano distante da câmera da 2.0 acompanha o fim da névoa, e os retrovisores
  pulam quadros lentos.
- Quem usa `prefers-reduced-motion` recebe balanço de cabeça, tremor, abertura
  de FOV e desfoque de velocidade bastante reduzidos.
- Ajustes da 2.0 (qualidade, horário, câmbio, FOV, balanço, unidade) ficam no menu de
  preparação e na pausa. `VITE_FEEDBACK_URL` (opcional) define para onde vai o
  botão de feedback; sem ela, usa as _issues_ do repositório no GitHub.
- Se o navegador perder o contexto WebGL, o jogo avisa e recarrega ao restaurar.

### Qualidade gráfica (2.0)

- Renderiza até 2× o pixel ratio (telas retina), com MSAA 4× quando a GPU
  suporta, anisotropia máxima nas texturas e sombras de 4096 px no desktop
  (2048 em telas de toque). A resolução adaptativa recua se o quadro ficar lento.
- Asfalto com mapas procedurais de normal e rugosidade (`src/betaTextures.js`),
  sem emendas, que dão agregado e pedrinhas ao chão em vez de ruído plano.
- Pintura do cockpit com textura de librea (faixa, frisos, linhas de painel e
  parafusos); forro interno em alcantara com costura. Os perfis das laterais e
  do nariz são curvas suaves (Catmull-Rom), sem facetas.
- Arquibancadas com público animado no shader (pulos, braços para o alto,
  bandeiras e uma "ola") e placas de patrocinadores fictícios ao longo da pista
  (`src/crowd.js`, `src/sponsors.js`; detalhes em `docs/interlagos-2.0.md`).
- Pós-processamento final com nitidez, ruído anti-banding no céu e aberração
  cromática mais discreta.

### Créditos e licenças

Traçados dos circuitos: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT).
Posição das arquibancadas, dos boxes, da passarela e da torre de Interlagos na 2.0: medidas sobre dados do
[OpenStreetMap](https://www.openstreetmap.org/copyright) (© colaboradores do OpenStreetMap, licença ODbL) e sobre
o mapa oficial dos setores do GP São Paulo; ver `docs/interlagos-2.0.md`.
O volante, o halo, as luvas e demais peças do cockpit da 2.0 são modelados no
código. A carroceria e as rodas do carro da 2.0 usam o modelo
**F1 2022 {FREE!!}**, de [3dblenderlol](https://sketchfab.com/3dblenderlol),
licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
([fonte](https://sketchfab.com/3d-models/f1-2022-free-013c9e89d2244e37924031dfe4ccf4c3)),
reescalado, recolorido e otimizado; detalhes em
`public/assets/cars/CREDITS.md`. O crédito também aparece no menu da 2.0.

Antes de enviar mudanças, rode a barreira completa de qualidade:

```bash
npm run check      # lint + testes + formatação + build de produção
```

Os testes usam o runner nativo do Node (`node --test`). O SDK do Supabase é
carregado sob demanda, somente ao abrir ou gravar o ranking; Three.js fica em
um chunk próprio e cacheável.

## Estrutura do projeto

```
formula-rush/
├── index.html                 # HTML da página (mesma UI da versão original)
├── package.json
├── vite.config.js
├── public/                    # arquivos servidos como estão, na raiz
│   ├── interlagos.geojson     # traçado real de Interlagos, fonte: bacinger/f1-circuits (MIT)
│   ├── elevation.json         # ver docs/AUDITORIA.md § 3.2
│   ├── monza.geojson          # traçado real de Monza, mesma fonte
│   ├── monza-elevation.json   # ver docs/AUDITORIA.md § 3.2
│   ├── indianapolis.geojson       # oval real da Indy 500 (geometria calculada, ver docs/AUDITORIA.md)
│   ├── indianapolis-elevation.json
│   ├── monaco.geojson             # traçado de Mônaco
│   ├── monaco-elevation.json
│   ├── spa.geojson                # traçado de Spa-Francorchamps
│   ├── spa-elevation.json
│   ├── red-bull-ring.geojson
│   ├── red-bull-ring-elevation.json
│   ├── miami.geojson
│   ├── miami-elevation.json
│   ├── yas-marina.geojson
│   └── yas-marina-elevation.json
├── src/
│   ├── main.js                # ponto de entrada: inicialização + loop principal
│   ├── constants.js           # constantes do jogo (tabelas de pista trocáveis + grid da F1 2026)
│   ├── circuits.js             # registro e perfis dos oito circuitos
│   ├── leaderboard.js           # ranking de melhores voltas: online (Supabase) com fallback local
│   ├── supabaseClient.js       # client Supabase do ranking online (null se não configurado)
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

| Ação                                 | Teclado              | Toque                |
| ------------------------------------ | -------------------- | -------------------- |
| Acelerar / Frear                     | `↑` `↓` (ou `W` `S`) | botões na tela       |
| Direção                              | `←` `→` (ou `A` `D`) | botões na tela       |
| Drift                                | `Shift`              | botão "DRIFT"        |
| Usar item                            | `Espaço`             | toque no item no HUD |
| Subir / reduzir marcha (2.0, manual) | `J` / `H`            | botões `+` / `−`     |
| Câmbio automático ↔ manual (2.0)     | `G`                  | menu de ajustes      |
| Trocar câmera                        | `C`                  | botão "CÂMERA"       |
| Reposicionar na pista                | `R`                  | botão "↺"            |
| Pausar                               | `P` / `Esc`          | botão "Ⅱ"            |
| Tempos de volta                      | `T`                  | botão "VER TEMPOS"   |

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

## Ranking (online + local)

O botão "RANKING ONLINE" (tela de título) ou "VER RANKING DESTA PISTA"
(menu) mostra as melhores voltas por circuito, uma entrada por nome
digitado em "SEU PILOTO".

Por padrão, sem nenhuma configuração extra, o ranking é **local**
(salvo só no seu navegador, via `localStorage`) — funciona imediatamente,
sem depender de nada externo. Para ativar um ranking **online** (global
entre navegadores/dispositivos), configure um projeto gratuito no
[Supabase](https://supabase.com):

1. Crie um projeto e rode o SQL de
   [`docs/leaderboard-schema.sql`](docs/leaderboard-schema.sql) no SQL Editor dele.
2. Copie `.env.local.example` para `.env.local` e preencha com a Project URL
   e a chave `anon public` do seu projeto (em Project Settings → API).
3. Reinicie `npm run dev` (ou refaça o `npm run build`).

Sem essa configuração, o jogo funciona normalmente e usa só o ranking
local — nada quebra. Ver `docs/AUDITORIA.md` § 13.3 e § 15.3 para mais
detalhes (inclusive a limitação conhecida: como o jogo é 100% client-side,
não há validação de corrida no servidor — é um ranking "por honestidade").

O SQL rejeita circuitos desconhecidos, nomes vazios e tempos fora de 20 s a
15 min. A interface nunca interpreta nomes como HTML. Essas barreiras impedem
entradas inválidas e injeção de conteúdo, mas não transformam um jogo estático
em um sistema antifraude: validação competitiva exigiria um servidor
autoritativo para a corrida.

## Circuitos

O seletor "CIRCUITO" no menu troca a qualquer momento entre os oito traçados
(o traçado, o mapa e a órbita da câmera atualizam na hora). Os campos
"SEU PILOTO" (nome e número) mudam o que
aparece no seu carro, na classificação final e no painel de tempos.

## Grid de 23 carros: os 22 pilotos da F1 2026

Os 22 bots usam os nomes, números e cores reais dos carros da temporada de
F1 2026 (11 equipes, incluindo a estreia da Cadillac) — companheiros de
equipe compartilham a cor do carro, como na F1 de verdade. Ver
`docs/AUDITORIA.md` § 14.4 para as fontes e ressalvas.

## Créditos de dados

Os traçados GeoJSON, com exceção do oval calculado de Indianápolis, vêm do repositório
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT); a
Interlagos já era citada nos créditos da própria página do jogo.
