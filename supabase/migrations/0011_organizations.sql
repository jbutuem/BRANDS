-- 0011 — camada cliente (organizations) → marcas; canais conectados; fila de aprovação
set search_path = listening, public, extensions;

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  cnpj        text,
  dpa_signed_at date,                 -- cláusula/contrato de tratamento de dados (LGPD)
  retention_days int not null default 365,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table brands add column if not exists org_id uuid references organizations(id);
insert into organizations (slug, name) values ('kerry-brasil', 'Kerry Brasil') on conflict (slug) do nothing;
update brands set org_id = (select id from organizations where slug = 'kerry-brasil') where org_id is null;
alter table brands alter column org_id set not null;

alter table organizations enable row level security;
create policy organizations_select on organizations for select
  using (id in (select b.org_id from brands b where b.id in (select auth_brand_ids())));

-- Canais conectados por marca (Fase 1: Meta / TikTok / WhatsApp). Tokens nunca ficam aqui em claro.
create table if not exists channel_connections (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  provider      text not null check (provider in ('instagram','facebook','whatsapp','tiktok')),
  external_id   text not null,
  display_name  text,
  status        text not null default 'pending' check (status in ('pending','active','revoked','error')),
  mode          text not null default 'approval' check (mode in ('approval','auto')),
  auto_intents  text[] not null default '{}',
  token_ref     text,
  connected_by  uuid references auth.users(id),
  connected_at  timestamptz not null default now(),
  last_event_at timestamptz,
  unique (provider, external_id)
);
create index if not exists channel_connections_brand on channel_connections (brand_id);
alter table channel_connections enable row level security;
create policy channel_connections_select on channel_connections for select using (brand_id in (select auth_brand_ids()));
create policy channel_connections_write on channel_connections for all
  using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));

alter table conversations add column if not exists source text not null default 'manual' check (source in ('manual','webhook'));
alter table conversations add column if not exists channel_connection_id uuid references channel_connections(id);
alter table responses add column if not exists sent_at timestamptz;
alter table responses add column if not exists send_error text;
