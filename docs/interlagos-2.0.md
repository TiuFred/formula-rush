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

O cockpit possui monocoque afunilado na cor do carro, revestimento interno,
filetes claros, coluna, paddles, engate rápido e punhos com costura. O halo foi
removido do modelo 2.0 para manter a visão aberta solicitada. O volante fica
mais baixo e distante, com uma matriz simétrica de botões, três seletores e
parafusos aparentes. O display é atualizado a 10 Hz com velocidade, marcha do
powertrain, progressão de giro, acelerador, tempo da volta e indicação de
DRS/volta inválida. Botões e seletores modelados no volante são decorativos,
não novos comandos.

Carbono usa trama procedural com filtragem por derivadas para reduzir cintilação.
Asfalto recebe variação de tonalidade em escala maior; zebras e muros recebem
desgaste sutil. A faixa de borracha tem bordas suaves. As sombras continuam
em 2048 px, com uma área menor em torno do carro para melhorar a definição
sem aumentar a resolução. O shader do asfalto compartilhado é restaurado ao
voltar à versão clássica. Nenhuma nova textura fotográfica foi adicionada.

## Revisão visual e dinâmica

O terreno da 2.0 usa uma malha mais densa e ondas contínuas amortecidas nas
proximidades do traçado. A iluminação ganhou sol mais alto e direcional,
sombras concentradas, menor preenchimento ambiente e exposição recalibrada.
O asfalto combina a textura-base existente com microrelevo gerado em runtime,
variação de agregado, remendos e faixa de borracha suavizada.

Foram acrescentados uma passarela elevada, pórtico de largada, torre de
cronometragem e postos de fiscais. Os apoios no solo são verificados contra
o corredor de asfalto; elementos que cruzam a pista ficam acima de 6,5 m.

A aceleração da 2.0 é independente da física arcade clássica. Ela possui
resposta progressiva de pedal, oito relações simuladas, corte breve de torque
nas trocas, curva de força, resistência aerodinâmica, frenagem dependente da
velocidade e limite aproximado de 340 km/h. Em teste plano, os valores-alvo
são cerca de 2,55 s para 0–100 km/h e 6,0 s para 0–200 km/h.
