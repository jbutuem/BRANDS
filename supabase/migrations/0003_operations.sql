-- 0003_operations.sql — Operação e BI
-- Privacidade: NÃO existe tabela de contatos. Nenhum nome, handle, ID da Meta
-- ou telefone do cliente é persistido. messages.content recebe apenas texto já
-- passado pelo Scrubber (server-side).
set search_path = listening, public, extensions;

create type channel_kind     as enum ('instagram', 'facebook', 'whatsapp', 'outro');
create type conv_status      as enum ('aberta', 'respondida', 'encaminhada', 'encerrada');
create type intent_kind      as enum ('produto', 'onde_comprar', 'tecnica', 'engajamento', 'reclamacao', 'risco', 'outro');
create type guardian_verdict as enum ('aprovada', 'reescrita', 'escalar', 'bloqueada');
create type feedback_kind    as enum ('gostei', 'nao_gostei', 'copiada', 'regerada', 'enviada');

create table conversations (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands(id) on delete cascade,
  channel          channel_kind not null default 'instagram',
  status           conv_status not null default 'aberta',
  intent           intent_kind,
  region_uf        text,
  region_city      text,
  forwarded_to     uuid references internal_contacts(id),
  operator_id      uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on conversations (brand_id, created_at desc);
create index on conversations (brand_id, status);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  brand_id         uuid not null references brands(id) on delete cascade,
  direction        text not null check (direction in ('in','out')),
  content          text not null,
  scrub_report     jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index on messages (conversation_id, created_at);
create index on messages (brand_id);

create or replace function enforce_message_brand()
returns trigger language plpgsql set search_path = listening, public, extensions as $$
begin
  if new.brand_id <> (select brand_id from conversations where id = new.conversation_id) then
    raise exception 'messages.brand_id divergente da conversa';
  end if;
  return new;
end $$;
create trigger trg_message_brand before insert or update on messages
  for each row execute function enforce_message_brand();

create table responses (
  id               uuid primary key default gen_random_uuid(),
  message_id       uuid not null references messages(id) on delete cascade,
  brand_id         uuid not null references brands(id) on delete cascade,
  version          int not null default 1,
  content          text not null,
  sources          jsonb not null default '{}'::jsonb,
  classifier_out   jsonb not null default '{}'::jsonb,
  verdict          guardian_verdict not null,
  verdict_reason   text,
  rewrite_cycles   int not null default 0,
  model            text,
  tokens_in        int,
  tokens_out       int,
  latency_ms       int,
  created_at       timestamptz not null default now()
);
create index on responses (message_id, version);
create index on responses (brand_id, created_at desc);

create table feedback (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references responses(id) on delete cascade,
  brand_id     uuid not null references brands(id) on delete cascade,
  kind         feedback_kind not null,
  comment      text,
  user_id      uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on feedback (response_id);
create index on feedback (brand_id, kind);

create table golden_responses (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  question     text not null,
  answer       text not null,
  intent       intent_kind,
  embedding    extensions.vector(1536),
  promoted_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on golden_responses (brand_id);
create index on golden_responses using hnsw (embedding extensions.vector_cosine_ops);

create table knowledge_gaps (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  gap_type     text not null,
  detail       text,
  count        int not null default 1,
  last_seen    timestamptz not null default now(),
  unique (brand_id, gap_type, detail)
);

do $$
declare t text;
begin
  foreach t in array array[
    'conversations','messages','responses','feedback','golden_responses','knowledge_gaps'
  ] loop
    execute format('alter table listening.%I enable row level security', t);
    execute format($p$
      create policy %1$s_select on listening.%1$I
        for select using (brand_id in (select listening.auth_brand_ids()))$p$, t);
  end loop;
end $$;

create policy conversations_write on conversations
  for all using (brand_id in (select auth_brand_ids())) with check (brand_id in (select auth_brand_ids()));
create policy messages_write on messages
  for all using (brand_id in (select auth_brand_ids())) with check (brand_id in (select auth_brand_ids()));
create policy feedback_write on feedback
  for all using (brand_id in (select auth_brand_ids())) with check (brand_id in (select auth_brand_ids()));
create policy golden_write on golden_responses
  for all using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check  (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));

create view bi_daily_volume with (security_invoker = true) as
select brand_id, channel, intent, date_trunc('day', created_at)::date as day, count(*) as conversations
from conversations group by 1,2,3,4;

create view bi_response_quality with (security_invoker = true) as
select r.brand_id,
       date_trunc('week', r.created_at)::date as week,
       count(distinct r.id)                                               as responses,
       count(distinct r.id) filter (where r.verdict = 'aprovada')        as approved_first_pass,
       count(distinct r.id) filter (where r.verdict = 'escalar')         as escalated,
       count(f.id) filter (where f.kind = 'gostei')                      as liked,
       count(f.id) filter (where f.kind = 'nao_gostei')                  as disliked,
       count(f.id) filter (where f.kind in ('copiada','enviada'))        as used
from responses r left join feedback f on f.response_id = r.id
group by 1,2;

create view bi_top_gaps with (security_invoker = true) as
select brand_id, gap_type, detail, count, last_seen from knowledge_gaps order by count desc;

create view bi_regions with (security_invoker = true) as
select c.brand_id, c.region_uf, count(*) as asks,
       exists (select 1 from distributors d where d.brand_id = c.brand_id and c.region_uf = any(d.ufs)) as has_distributor
from conversations c where c.region_uf is not null group by 1,2;
