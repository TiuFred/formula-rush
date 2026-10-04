# Interlagos 2.0 — cenário, outubro de 2026

Esta revisão detalha a reconstrução procedural existente. O traçado GPS, as
elevações e as posições das arquibancadas são preservados. Só a experiência
2.0 usa os novos elementos.

## Referências consultadas em 02/10/2026

- [Descrição e localização dos setores do GP São Paulo](https://f1saopaulo.com.br/arquibancadas/).
- [Foto oficial vista do setor M](https://f1saopaulo.com.br/wp-content/uploads/2024/10/arq-M-1.jpg): assentos azuis, treliças, membranas curvas, mastros e cabos sobre os boxes.
- [Foto oficial vista do setor B](https://f1saopaulo.com.br/wp-content/uploads/2024/10/arq-b.jpg): fachada envidraçada, divisões dos vidros e equipamentos da área de boxes.
- [Foto oficial vista do setor G](https://f1saopaulo.com.br/wp-content/uploads/2024/10/arq-G.jpg): arquibancada descoberta, alambrado, telões no miolo e escapes verdes.

As fotos foram inspecionadas como referência; não são distribuídas como assets.
As dimensões das novas estruturas e as posições dos equipamentos temporários
são aproximações visuais, não um levantamento arquitetônico. Não se trata de
uma réplica fotogramétrica. A montagem do evento varia entre edições.

## Mudanças

- Arquibancadas: dois degraus por fila nos corredores, bordas amarelas,
  corrimãos, estrutura diagonal sob as bancadas, circulação e guarda-corpos
  traseiros, treliças frontais, terças e caixas de som suspensas. O setor M
  usa assentos azuis; público mais denso mantém animação no shader.
- Boxes: membranas brancas com contorno arqueado e apoios baixos nos cantos,
  mastros inclinados, cabos e bordas estruturais curvas. Materiais são
  compartilhados para permitir a fusão das malhas estáticas.
- Garagens: montantes de vidro, corrimãos, lâminas das portas, carrinhos de
  ferramentas, marcação de parada, faixa verde e consoles no muro dos boxes.
- Áreas externas: quiosques cobertos, organização de filas, postes e telões
  com informação estática. São uma composição aproximada do evento, não
  posições medidas. Os telões não exibem vídeo da corrida.
- Pista: escapes pintados acompanhando as curvas, extensões no topo do
  alambrado e taludes que encontram a altura do terreno. O pórtico duplicado
  da versão clássica deixa de aparecer na 2.0.
- Vegetação: exclusão das áreas de público, circulação e paddock.

## Verificação

Os testes de geometria conferem folga das estruturas em relação ao asfalto,
presença de todos os setores, normais da cobertura e exclusões de vegetação.
O cenário mantém instanciamento de cadeiras/público e fusão de estruturas
por material. Desempenho em celulares reais ainda precisa de medição.
