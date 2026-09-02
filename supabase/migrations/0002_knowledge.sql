-- 0002_knowledge.sql — Base de conhecimento por marca (estruturada + vetorial)
-- Regra: TODA tabela tem brand_id NOT NULL e RLS. Sem exceção.
set search_path = listening, public, extensions;

create type contact_kind    as enum ('comercial', 'tecnico', 'sac');
create type document_status as enum ('processing', 'ready', 'error');
create type product_status  as enum ('ativo', 'lancamento', 'em_breve', 'descontinuado');

create table products (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  codigo        text,
  name          text not null,
  line          text,
  category      text,
  packaging     text,
  weight        text,
  shelf_life    text,
  ean           text,
  dun           text,
  ncm           text,
  units_per_box int,
  applications  text[] not null default '{}',
  status        product_status not null default 'ativo',
  site_url      text,
  raw           jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (brand_id, codigo)
);
create index on products (brand_id);
create index products_name_fts on products using gin (to_tsvector('portuguese', name));

create table product_nutrition (
  product_id    uuid primary key references products(id) on delete cascade,
  brand_id      uuid not null references brands(id) on delete cascade,
  portion       text,
  table_data    jsonb not null default '{}'::jsonb,
  allergens     text[] not null default '{}',
  claims        text[] not null default '{}',
  source_doc    uuid
);
create index on product_nutrition (brand_id);

-- Distribuidores: um distribuidor que atende duas marcas vira DUAS linhas
create table distributors (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  razao_social   text,
  fantasia       text not null,
  contato_nome   text,
  telefone       text,
  whatsapp       text,
  email          text,
  endereco       text,
  cidade         text,
  ufs            text[] not null default '{}',
  vendedor_kerry text,
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now()
);
create index on distributors (brand_id);
create index on distributors using gin (ufs);

create table internal_contacts (
  id        uuid primary key default gen_random_uuid(),
  brand_id  uuid not null references brands(id) on delete cascade,
  kind      contact_kind not null,
  name      text not null,
  email     text,
  phone     text,
  whatsapp  text,
  scope     text,
  is_active boolean not null default true
);
create index on internal_contacts (brand_id, kind);

create table recipes_tips (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  title       text not null,
  body        text not null,
  kind        text not null default 'dica',
  product_ids uuid[] not null default '{}',
  url         text,
  created_at  timestamptz not null default now()
);
create index on recipes_tips (brand_id);

create table documents (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  name          text not null,
  file_type     text not null,
  storage_path  text not null,
  status        document_status not null default 'processing',
  pages         int,
  chunk_count   int not null default 0,
  error         text,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on documents (brand_id, status);

create table document_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  brand_id    uuid not null references brands(id) on delete cascade,
  content     text not null,
  page        int,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(1536) not null
);
create index on document_chunks (brand_id);
create index on document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function enforce_chunk_brand()
returns trigger language plpgsql set search_path = listening, public, extensions as $$
begin
  if new.brand_id <> (select brand_id from documents where id = new.document_id) then
    raise exception 'document_chunks.brand_id divergente do documento';
  end if;
  return new;
end $$;
create trigger trg_chunk_brand before insert or update on document_chunks
  for each row execute function enforce_chunk_brand();

-- Busca vetorial: brand_id vem da sessão (servidor), nunca do cliente.
create or replace function match_chunks(
  p_brand_id  uuid,
  p_query     extensions.vector(1536),
  p_limit     int default 8,
  p_min_sim   float default 0.70
)
returns table (chunk_id uuid, document_id uuid, content text, page int, similarity float)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.document_id, c.content, c.page,
         1 - (c.embedding <=> p_query) as similarity
  from document_chunks c
  where c.brand_id = p_brand_id
    and c.brand_id in (select auth_brand_ids())
    and 1 - (c.embedding <=> p_query) >= p_min_sim
  order by c.embedding <=> p_query
  limit p_limit;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'products','product_nutrition','distributors','internal_contacts',
    'recipes_tips','documents','document_chunks'
  ] loop
    execute format('alter table listening.%I enable row level security', t);
    execute format($p$
      create policy %1$s_select on listening.%1$I
        for select using (brand_id in (select listening.auth_brand_ids()))$p$, t);
    execute format($p$
      create policy %1$s_write on listening.%1$I
        for all
        using      (listening.auth_has_brand_role(brand_id, array['admin','brand_manager']::listening.brand_role[]))
        with check (listening.auth_has_brand_role(brand_id, array['admin','brand_manager']::listening.brand_role[]))$p$, t);
  end loop;
end $$;
