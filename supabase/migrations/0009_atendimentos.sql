-- 0009 — atendimentos: referência do operador, resumo, última atividade; resposta enviada no fio
set search_path = listening, public, extensions;
alter table conversations add column if not exists label text;        -- referência livre do operador (sem nome)
alter table conversations add column if not exists summary text;      -- resumo gerado (anonimizado)
alter table conversations add column if not exists last_activity timestamptz not null default now();
create index if not exists conversations_open on conversations (brand_id, status, last_activity desc);
alter table messages add column if not exists response_id uuid references responses(id) on delete set null; -- qual versão foi enviada
