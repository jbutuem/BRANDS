-- 0019 — Fila persistente: identificador do tópico no Meta (evita duplicar em varreduras repetidas) + consulta de pendentes
set search_path = listening, public, extensions;

alter table conversations add column if not exists external_thread_id text;
create unique index if not exists conversations_external_thread on conversations (brand_id, external_thread_id) where external_thread_id is not null;

create or replace function fila_pending(p_brand_id uuid)
returns table (
  conversation_id uuid, channel text, surface text, message_id uuid, content text,
  response_id uuid, version int, response_text text, verdict text, verdict_reason text,
  classifier_out jsonb, created_at timestamptz
)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.channel::text, c.surface, m.id, m.content, r.id, r.version, r.content,
         r.verdict::text, r.verdict_reason, r.classifier_out, m.created_at
  from conversations c
  join lateral (
    select * from messages mm where mm.conversation_id = c.id and mm.direction = 'in' order by mm.created_at desc limit 1
  ) m on true
  left join lateral (
    select * from responses rr where rr.message_id = m.id order by rr.version desc limit 1
  ) r on true
  where c.brand_id = p_brand_id and c.brand_id in (select auth_brand_ids()) and c.status = 'aberta'
  order by m.created_at desc
  limit 50;
$$;
grant execute on function fila_pending(uuid) to authenticated;
