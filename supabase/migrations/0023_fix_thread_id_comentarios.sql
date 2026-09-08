-- 0023 — id do tópico não é único global para comentários (é do post, não do comentário individual)
set search_path = listening, public, extensions;

drop index if exists conversations_external_thread;
create unique index if not exists conversations_external_thread_dm on conversations (brand_id, external_thread_id) where external_thread_id is not null and surface = 'dm';
create index if not exists conversations_external_thread_any on conversations (brand_id, external_thread_id) where external_thread_id is not null;
