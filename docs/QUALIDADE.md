# Qualidade e segurança

## Verificação local

O comando obrigatório antes de publicar é:

```bash
npm run check
```

Ele executa, nesta ordem:

1. ESLint sobre o código-fonte, testes e configuração do Vite;
2. testes unitários com o runner nativo do Node;
3. verificação de formatação do HTML, CSS e README;
4. build de produção.

## Ranking

- Nomes são normalizados e inseridos na interface apenas com `textContent`.
- Tempos locais e remotos precisam estar entre 20 segundos e 15 minutos.
- Somente os oito identificadores de circuito conhecidos são aceitos.
- A tabela remota é somente leitura para clientes; escrita passa pela RPC.
- A RPC remove caracteres de controle e não herda permissão de execução da
  role pública.

O ranking continua sendo não autoritativo. Como toda a simulação roda no
navegador, uma pessoa pode chamar a RPC diretamente com um tempo plausível.
Um ranking antifraude requer autenticação, rate limiting e validação de corrida
em um serviço confiável — não apenas SQL ou código enviado ao navegador.

## Carregamento e bundle

A troca de circuito cancela a requisição anterior e usa um número sequencial
para ignorar respostas atrasadas. O perfil global só é aplicado depois que os
dois arquivos da pista foram recebidos e validados.

O SDK do Supabase é importado dinamicamente. Three.js fica isolado em um chunk
de vendor, permitindo cache entre versões que alterem somente o jogo.
