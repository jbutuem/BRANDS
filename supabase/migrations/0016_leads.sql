-- 0016 + 0017 — público B2B/B2C, ofertas autorizadas e oportunidades (SEM dados pessoais)
set search_path = listening, public, extensions;

alter table brand_settings add column if not exists b2b_offers text[] not null default '{}';
update brand_settings s set b2b_offers = array['indicar o distribuidor mais próximo','enviar catálogo com códigos e embalagens','conectar com o consultor comercial da região','sugerir combinação de molhos para o cardápio']
from brands b where b.id = s.brand_id and b.slug = 'junior';
update brand_settings s set b2b_offers = array['indicar o distribuidor mais próximo','enviar catálogo e receitas com dosagem','conectar com o consultor comercial da região','sugerir cardápio de bebidas para a estação']
from brands b where b.id = s.brand_id and b.slug = 'dvg';
update brand_settings s set b2b_offers = array['indicar o distribuidor mais próximo','conectar com o consultor técnico-comercial da região']
from brands b where b.id = s.brand_id and b.slug = 'siber';

alter table conversations add column if not exists audience text not null default 'indefinido' check (audience in ('b2c','b2b','indefinido'));
alter table conversations add column if not exists business_type text;

-- Oportunidades: só perfil do negócio. Nenhum campo de contato de pessoa (decisão de produto: o cliente recebe o contato do comercial).
create type lead_status as enum ('novo','contatado','qualificado','convertido','perdido');
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  business_name   text,
  business_type   text,
  city            text,
  uf              text,
  interest        text[] not null default '{}',
  est_volume      text,
  commercial_sent boolean not null default false,   -- contato do comercial foi passado ao cliente na resposta
  status          lead_status not null default 'novo',
  assigned_to     uuid references internal_contacts(id),
  notes           text,
  channel         text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists leads_brand_status on leads (brand_id, status, created_at desc);
alter table leads enable row level security;
create policy leads_select on leads for select using (brand_id in (select auth_brand_ids()));
create policy leads_write on leads for all using (brand_id in (select auth_brand_ids())) with check (brand_id in (select auth_brand_ids()));

create view bi_leads with (security_invoker = true) as
select brand_id, date_trunc('week', created_at)::date as week, business_type, uf, status, count(*) as leads,
       count(*) filter (where commercial_sent) as commercial_sent
from leads group by 1,2,3,4,5;
