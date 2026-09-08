-- 0024 — link direto para a publicação no Meta (onde a mensagem/comentário está)
set search_path = listening, public, extensions;

alter table conversations add column if not exists external_url text;

drop function if exists fila_pending(uuid);
create function fila_pending(p_brand_id uuid)
returns table (
  conversation_id uuid, channel text, surface text, external_url text, message_id uuid, content text,
  response_id uuid, version int, response_text text, verdict text, verdict_reason text,
  classifier_out jsonb, created_at timestamptz
)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.channel::text, c.surface, c.external_url, m.id, m.content, r.id, r.version, r.content,
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

drop function if exists fila_awaiting_publish(uuid);
create function fila_awaiting_publish(p_brand_id uuid)
returns table (
  conversation_id uuid, channel text, surface text, external_thread_id text, external_url text,
  message_id uuid, content text, response_id uuid, version int, response_text text,
  verdict text, verdict_reason text, classifier_out jsonb, updated_at timestamptz
)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.channel::text, c.surface, c.external_thread_id, c.external_url, m.id, m.content, r.id, r.version, r.content,
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
