-- 0007 — busca por texto (português) no lugar de vetores; embedding vira opcional
set search_path = listening, public, extensions;
alter table document_chunks alter column embedding drop not null;
alter table document_chunks add column if not exists tsv tsvector
  generated always as (to_tsvector('portuguese', coalesce(content,''))) stored;
create index if not exists document_chunks_tsv on document_chunks using gin (tsv);
alter table golden_responses add column if not exists tsv tsvector
  generated always as (to_tsvector('portuguese', coalesce(question,''))) stored;
create index if not exists golden_responses_tsv on golden_responses using gin (tsv);

create or replace function search_chunks(p_brand_id uuid, p_query text, p_limit int default 8)
returns table (chunk_id uuid, document_id uuid, document_name text, content text, page int, rank real)
language sql stable set search_path = listening, public, extensions as $$
  select c.id, c.document_id, d.name, c.content, c.page,
         ts_rank(c.tsv, websearch_to_tsquery('portuguese', p_query)) as rank
  from document_chunks c join documents d on d.id = c.document_id
  where c.brand_id = p_brand_id
    and c.brand_id in (select auth_brand_ids())
    and c.tsv @@ websearch_to_tsquery('portuguese', p_query)
  order by rank desc limit p_limit;
$$;

create or replace function search_products(p_brand_id uuid, p_query text, p_limit int default 8)
returns setof products
language sql stable set search_path = listening, public, extensions as $$
  select * from products p
  where p.brand_id = p_brand_id
    and p.brand_id in (select auth_brand_ids())
    and (
      p.codigo = p_query
      or p.ean = p_query
      or to_tsvector('portuguese', p.name || ' ' || coalesce(p.line,'') || ' ' || coalesce(p.category,'')) @@ websearch_to_tsquery('portuguese', p_query)
      or p.name ilike '%' || p_query || '%'
    )
  order by p.status, p.name limit p_limit;
$$;

create or replace function distributors_by_uf(p_brand_id uuid, p_uf text)
returns setof distributors
language sql stable set search_path = listening, public, extensions as $$
  select * from distributors d
  where d.brand_id = p_brand_id
    and d.brand_id in (select auth_brand_ids())
    and d.is_active and upper(p_uf) = any(d.ufs)
  order by d.fantasia;
$$;

grant execute on function search_chunks(uuid,text,int), search_products(uuid,text,int), distributors_by_uf(uuid,text) to authenticated;
