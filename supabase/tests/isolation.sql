-- isolation.sql — Teste de isolamento entre marcas. Roda no CI a cada PR.
-- Falha (RAISE EXCEPTION) se um usuário só-Junior enxergar qualquer coisa de DVG.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql
set search_path = listening, public, extensions;
begin;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'op.junior@test.local','authenticated','authenticated')
on conflict (id) do nothing;

insert into brand_memberships (user_id, brand_id, role)
select '11111111-1111-1111-1111-111111111111'::uuid, id, 'brand_manager'::brand_role from brands where slug = 'junior';

-- Dados de DVG (o que NÃO pode vazar)
insert into products (brand_id, codigo, name) select id, '20521550', 'Xarope Amaretto 750 ml' from brands where slug = 'dvg';
insert into distributors (brand_id, fantasia, ufs) select id, 'Dellys DF', array['DF','GO','MT','TO','MS'] from brands where slug = 'dvg';
insert into documents (id, brand_id, name, file_type, storage_path, status)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, id, 'Catálogo DVG', 'pdf', 'x.pdf', 'ready' from brands where slug = 'dvg';
insert into document_chunks (document_id, brand_id, content, embedding)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, id, 'Xarope Amaretto', (select array_fill(0.01::float4, array[1536])::extensions.vector) from brands where slug = 'dvg';
insert into conversations (id, brand_id, channel) select 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, id, 'instagram' from brands where slug = 'dvg';
insert into messages (conversation_id, brand_id, direction, content) select 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, id, 'in', 'msg dvg' from brands where slug = 'dvg';

-- Controle positivo (o usuário Junior DEVE ver)
insert into products (brand_id, codigo, name) select id, '20582782', 'Maionese Grill 350 g' from brands where slug = 'junior';

-- Assume identidade: usuário só-Junior
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare n int; junior uuid := (select id from listening.brands where slug = 'junior');
begin
  select count(*) into n from listening.products where codigo = '20582782';
  if n <> 1 then raise exception 'CONTROLE falhou'; end if;
  select count(*) into n from listening.brands where slug = 'dvg';            if n > 0 then raise exception 'VAZAMENTO brands'; end if;
  select count(*) into n from listening.products where codigo = '20521550';  if n > 0 then raise exception 'VAZAMENTO products'; end if;
  select count(*) into n from listening.distributors where 'TO' = any(ufs);  if n > 0 then raise exception 'VAZAMENTO distributors'; end if;
  select count(*) into n from listening.documents;                            if n > 0 then raise exception 'VAZAMENTO documents'; end if;
  select count(*) into n from listening.document_chunks;                      if n > 0 then raise exception 'VAZAMENTO chunks'; end if;
  select count(*) into n from listening.conversations;                        if n > 0 then raise exception 'VAZAMENTO conversations'; end if;
  select count(*) into n from listening.messages;                             if n > 0 then raise exception 'VAZAMENTO messages'; end if;
  begin
    insert into listening.document_chunks (document_id, brand_id, content, embedding)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, junior, 'chunk forjado', (select array_fill(0.01::float4, array[1536])::extensions.vector));
    raise exception 'VAZAMENTO chunk cross-brand aceito';
  exception when others then if sqlerrm like 'VAZAMENTO%' then raise; end if; end;
  begin
    insert into listening.messages (conversation_id, brand_id, direction, content)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, junior, 'in', 'msg forjada');
    raise exception 'VAZAMENTO message cross-brand aceita';
  exception when others then if sqlerrm like 'VAZAMENTO%' then raise; end if; end;
  raise notice 'ISOLAMENTO OK — 10 verificações';
end $$;
rollback;
