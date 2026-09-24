# Formula Rush — Interlagos

Arquivos reconstruídos a partir da versão publicada.

## Estrutura

- `index.html` — página principal
- `assets/game.js` — bundle JavaScript do jogo
- `assets/styles.css` — estilos
- `elevation.json` — **faltando**; o JavaScript publicado tenta carregar `./elevation.json`

## Observações

O arquivo `Texto colado.txt` enviado junto não faz parte do jogo. Ele contém código de challenge/proteção do Cloudflare e não é necessário no projeto.

O JavaScript é um bundle compilado/minificado. Portanto, ele funciona como código distribuído ao navegador, mas não preserva necessariamente a estrutura-fonte original (módulos, nomes de arquivos e comentários).

Para reproduzir a versão publicada com máxima fidelidade, obtenha também `elevation.json` e coloque-o na raiz, ao lado de `index.html`.
