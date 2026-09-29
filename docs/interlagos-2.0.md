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
interpolada do carro. Não existe atraso de perseguição nem alteração de FOV
com a velocidade. O botão de troca fica oculto e seu handler ignora a 2.0.
A preferência de câmera da versão clássica é restaurada ao sair.

## Cockpit e superfícies

O volante acompanha a direção e possui display atualizado a 10 Hz, com
velocidade, marcha indicada, tempo da volta e indicação de DRS/volta inválida.
Como a física não simula câmbio ou RPM, marcha e luzes de progressão são
derivadas da velocidade, com os mesmos limites do HUD. Botões e seletores
modelados no volante são decorativos, não novos comandos.

Carbono usa trama procedural com filtragem por derivadas para reduzir cintilação.
Asfalto recebe variação de tonalidade em escala maior; zebras e muros recebem
desgaste sutil. A faixa de borracha tem bordas suaves. As sombras continuam
em 2048 px, com uma área menor em torno do carro para melhorar a definição
sem aumentar a resolução. O shader do asfalto compartilhado é restaurado ao
voltar à versão clássica. Nenhuma nova textura fotográfica foi adicionada.
