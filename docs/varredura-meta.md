# Varredura Meta (`/api/meta/scan`)

## Por que ela existe

O webhook de comentários do Instagram não funciona hoje, e não é problema de
configuração. A documentação da Meta impõe dois requisitos independentes:

1. o app precisa estar em **Modo Ativo** para receber qualquer webhook;
2. o campo `comments` exige **Advanced Access**, que depende de App Review e
   verificação de negócio.

A leitura por API não tem nenhuma das duas restrições: Standard Access basta
para contas profissionais que a gente controla e adicionou ao painel do app.
Por isso a varredura é o que alimenta a Fila enquanto o App Review não sai.

O webhook continua de pé — verificado, assinado nas contas e com `meta_hits`
registrando toda invocação. Quando o Advanced Access sair, ele passa a cobrir o
tempo real e a varredura vira reconciliação. Esse é o desenho mais robusto de
qualquer forma: webhook perdido é perdido, varredura sempre reconcilia.

## Como chamar

```
POST /api/meta/scan
Header: x-scan-secret: <SCAN_SECRET>
```

Parâmetros opcionais na query:

- `trigger` — rótulo gravado em `scan_runs` (padrão `cron`)
- `brand` — uuid, varre só uma marca

Sem `SCAN_SECRET` configurado, o endpoint responde 401 para tudo. É
intencional: endpoint aberto que grava no banco não pode existir.

## O que ela faz

Para cada conexão ativa do Instagram:

- **Comentários** — mídias recentes com `comments_count > 0`, depois os
  comentários de cada uma (incluindo respostas aninhadas)
- **DMs** — conversas com `updated_time` acima da marca d'água, depois as
  mensagens de cada uma
- Descarta o que é da própria conta, passa pelo Scrubber e cria o item na Fila

Idempotência é por `meta_events (provider, event_id)` — a mesma chave do
webhook. Os dois caminhos podem ver o mesmo comentário sem duplicar.

## Marca d'água

`channel_connections.last_scanned_at` guarda até onde já varremos, com
**sobreposição de 10 minutos** para não perder evento na borda.

O primeiro run de cada conexão é um **backfill de 30 dias**, marcado em
`backfill_done_at`. É o que traz o histórico já parado nas contas — coisa que
o webhook, sendo push, nunca traria.

Em rate limit a marca d'água **não avança**: o ciclo seguinte repega o mesmo
intervalo em vez de pular mensagens.

## Diagnóstico

Cada execução vira uma linha em `listening.scan_runs`: mídias, comentários
vistos, DMs vistas, itens criados, desfecho e detalhe do erro. Mesma razão de
existir do `meta_hits` — enxergar o que aconteceu sem adivinhar.

## Agendador

O cron do Vercel **não serve** aqui: o time está no plano Hobby, onde cron roda
uma vez por dia e com precisão de ±59 min. Precisa de agendador externo
chamando o endpoint. Ordem de preferência:

1. **Supabase Cron** (pg_cron + pg_net) — já está em uso, aceita intervalo de
   minutos, faz a chamada do próprio banco. Exige guardar o `SCAN_SECRET` no
   Vault do Supabase.
2. **GitHub Actions** com `schedule` — grátis, mas atrasa bastante
3. **cron-job.org** ou **Upstash QStash**
4. **Vercel Pro** — resolve com uma linha no `vercel.json`

## Rate limit

Com 4 marcas e ciclo de 5 minutos dá 3–4 chamadas por marca por ciclo, bem
folgado. O cliente trata 429 e os códigos 4 e 17 (limite sinalizado no corpo)
como `RateLimited`, e o desfecho fica registrado em `scan_runs`.
