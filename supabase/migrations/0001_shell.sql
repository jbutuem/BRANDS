-- 0001_shell.sql — Shell hermético: marcas, membros, papéis e helpers de RLS
set search_path = listening, public, extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector" with schema extensions;

create type brand_role as enum ('admin', 'brand_manager', 'operator');

create table brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  site_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table brand_memberships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  brand_id    uuid not null references brands(id) on delete cascade,
  role        brand_role not null default 'operator',
  created_at  timestamptz not null default now(),
  primary key (user_id, brand_id)
);
create index on brand_memberships (brand_id);

create table brand_settings (
  brand_id        uuid primary key references brands(id) on delete cascade,
  persona         text not null default '',
  voice_dos       text[] not null default '{}',
  voice_donts     text[] not null default '{}',
  safety_rules    text[] not null default '{}',
  greeting        text,
  signature       text,
  official_links  jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Helpers de RLS (security definer: leem memberships sem cair na própria RLS)
create or replace function auth_brand_ids()
returns setof uuid
language sql stable security definer set search_path = listening, public, extensions as $$
  select brand_id from brand_memberships where user_id = auth.uid();
$$;

create or replace function auth_has_brand_role(p_brand uuid, p_roles brand_role[])
returns boolean
language sql stable security definer set search_path = listening, public, extensions as $$
  select exists (
    select 1 from brand_memberships
    where user_id = auth.uid() and brand_id = p_brand and role = any(p_roles)
  );
$$;

alter table brands            enable row level security;
alter table brand_memberships enable row level security;
alter table brand_settings    enable row level security;

create policy brands_select on brands
  for select using (id in (select auth_brand_ids()));

create policy memberships_select on brand_memberships
  for select using (
    user_id = auth.uid()
    or auth_has_brand_role(brand_id, array['admin']::brand_role[])
  );
create policy memberships_write on brand_memberships
  for all using (auth_has_brand_role(brand_id, array['admin']::brand_role[]))
  with check  (auth_has_brand_role(brand_id, array['admin']::brand_role[]));

create policy settings_select on brand_settings
  for select using (brand_id in (select auth_brand_ids()));
create policy settings_write on brand_settings
  for all using (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]))
  with check  (auth_has_brand_role(brand_id, array['admin','brand_manager']::brand_role[]));

insert into brands (slug, name, site_url) values
  ('siber',  'SIBER',            'https://www.siber.com.br'),
  ('junior', 'Junior',           'https://www.junior.com.br'),
  ('dvg',    'DaVinci Gourmet',  'https://davincigourmet.com.br');

insert into brand_settings (brand_id) select id from brands;
