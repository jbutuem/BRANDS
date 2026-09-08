-- 0022 — Aguardando confirmação de publicação (aprovado ≠ publicado de fato no Meta)
set search_path = listening, public, extensions;

alter table conversations add column if not exists published_at timestamptz;

create or replace function fila_awaiting_publish(p_brand_id uuid)
returns table (
  conversation_id uuid, channel text, surface text, external_thread_id text,
  message_id uuid, content text, response_id uuid, version int, response_text text,
  verdict text, verdict_reason text, classifier_out jsonb, updated_at timestamptz
)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.channel::text, c.surface, c.external_thread_id, m.id, m.content, r.id, r.version, r.content,
         r.verdict::text, r.verdict_reason, r.classifier_out, c.updated_at
  from conversations c
  join lateral (
    select * from messages mm where mm.conversation_id = c.id and mm.direction = 'in' order by mm.created_at desc limit 1
  ) m on true
  left join lateral (
    select * from responses rr where rr.message_id = m.id order by rr.version desc limit 1
  ) r on true
  where c.brand_id = p_brand_id and c.brand_id in (select auth_brand_ids())
    and c.status = 'respondida' and c.published_at is null
  order by c.updated_at desc
  limit 50;
$$;
grant execute on function fila_awaiting_publish(uuid) to authenticated;
