-- 0021 — Pessoas da marca (VIPs) para tratamento direcionado + veredito "reacao"
set search_path = listening, public, extensions;

create table if not exists brand_vips (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  name        text not null,
  aliases     text[] not null default '{}',
  role        text,
  org         text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists brand_vips_brand on brand_vips (brand_id) where is_active;
alter table brand_vips enable row level security;
create policy vips_select on brand_vips for select using (brand_id in (select auth_brand_ids()));
create policy vips_write on brand_vips for all
  using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check  (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));

alter type guardian_verdict add value if not exists 'reacao';
