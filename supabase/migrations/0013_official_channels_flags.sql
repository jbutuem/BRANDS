-- 0013 — canais oficiais para direcionamento, superfície (DM x comentário), flags de moderação, veredito "redirecionar"
set search_path = listening, public, extensions;

update brand_settings s set official_links = s.official_links || '{"faq":"https://www.junior.com.br/produtos","sac":"SAC Kerry Brasil — sac@kerry.com (dias úteis, 8h às 17h)","rotulo":"lista de ingredientes e alérgenos no rótulo de cada embalagem"}'::jsonb
from brands b where b.id = s.brand_id and b.slug = 'junior';
update brand_settings s set official_links = s.official_links || '{"faq":"https://davincigourmet.com.br/produtos","sac":"SAC Kerry Brasil — sac@kerry.com (dias úteis, 8h às 17h)","rotulo":"lista de ingredientes e alérgenos no rótulo de cada garrafa/pouch"}'::jsonb
from brands b where b.id = s.brand_id and b.slug = 'dvg';

alter table conversations add column if not exists surface text not null default 'dm' check (surface in ('dm','comment'));
alter table conversations add column if not exists flags text[] not null default '{}';
create index if not exists conversations_flags on conversations using gin (flags);
alter type guardian_verdict add value if not exists 'redirecionar';
