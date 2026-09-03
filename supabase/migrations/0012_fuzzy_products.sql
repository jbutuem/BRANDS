-- 0012 — busca de produto tolerante a erro de digitação (Griu → Grill)
set search_path = listening, public, extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function search_products(p_brand_id uuid, p_query text, p_limit int default 8)
returns setof products
language sql stable set search_path = listening, public, extensions as $$
  with q as (select lower(unaccent(p_query)) as t),
  scored as (
    select p.*,
      greatest(
        case when p.codigo = p_query or p.ean = p_query then 1.0 else 0 end,
        case when to_tsvector('portuguese', p.name || ' ' || coalesce(p.line,'') || ' ' || coalesce(p.category,'')) @@ websearch_to_tsquery('portuguese', p_query) then 0.8 else 0 end,
        extensions.word_similarity(lower(unaccent(p.name)), (select t from q)),
        extensions.similarity(lower(unaccent(p.name)), (select t from q))
      ) as score
    from products p
    where p.brand_id = p_brand_id and p.brand_id in (select auth_brand_ids())
  )
  select id, brand_id, codigo, name, line, category, packaging, weight, shelf_life, ean, dun, ncm, units_per_box, applications, status, site_url, raw, updated_at
  from scored where score >= 0.35 order by score desc, status, name limit p_limit;
$$;
