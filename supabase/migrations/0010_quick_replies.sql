-- 0010 — biblioteca de respostas prontas por marca (sazonais com período MM-DD)
-- (o seed inicial de Junior, DVG e SIBER foi aplicado direto no Project 01; ver histórico do banco)
set search_path = listening, public, extensions;

create table if not exists quick_replies (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  category   text not null,           -- reacoes | boas_vindas | agradecimento | engajamento | direcionamento | espera | encerramento | datas
  text       text not null,           -- pode usar {nome}
  season_from text,                   -- 'MM-DD' (só para datas)
  season_to   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists quick_replies_brand on quick_replies (brand_id, category) where is_active;
alter table quick_replies enable row level security;
create policy quick_replies_select on quick_replies for select using (brand_id in (select auth_brand_ids()));
create policy quick_replies_write on quick_replies for all
  using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));
