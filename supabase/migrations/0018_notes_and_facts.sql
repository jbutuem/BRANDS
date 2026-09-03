-- 0018 — anotações de aprendizado (fato/padrão/dica/correção) + fato "onde comprar" acolhedor
set search_path = listening, public, extensions;

create table if not exists brand_notes (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  kind       text not null check (kind in ('fato','padrao','dica','correcao')),
  title      text,
  body       text not null,
  is_active  boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(body,''))) stored
);
create index if not exists brand_notes_brand on brand_notes (brand_id, kind) where is_active;
create index if not exists brand_notes_tsv on brand_notes using gin (tsv);
alter table brand_notes enable row level security;
create policy brand_notes_select on brand_notes for select using (brand_id in (select auth_brand_ids()));
create policy brand_notes_write on brand_notes for all
  using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));

update brand_settings s set brand_facts = array_remove(array_remove(brand_facts,
  'Produtos destinados ao uso profissional em cafeterias, bares, restaurantes e food service; vendidos por distribuidores, não em varejo direto ao consumidor.'),
  'Produtos para food service (hamburguerias, restaurantes, padarias, hotéis, delivery), vendidos por distribuidores, não em varejo direto ao consumidor.')
  || array['Onde comprar: os produtos chegam ao mercado por distribuidores food service, atacadistas/atacarejos, revendas e marketplaces online. Consumidor final também encontra — indicar distribuidor/revenda da região quando houver e sugerir buscar pelo nome do produto em atacarejos e marketplaces. Nunca dizer que "não vendemos ao consumidor".']
from brands b where b.id = s.brand_id and b.slug in ('junior','dvg');
