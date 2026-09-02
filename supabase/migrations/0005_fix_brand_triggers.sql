-- 0005 — correção encontrada pelo teste de isolamento no banco real:
-- com RLS, o SELECT do documento/conversa de outra marca retorna NULL e `<>` não dispara.
-- `is distinct from` + security definer fecham a brecha.
set search_path = listening, public, extensions;

create or replace function enforce_chunk_brand()
returns trigger language plpgsql security definer set search_path = listening, public, extensions as $$
begin
  if new.brand_id is distinct from (select brand_id from documents where id = new.document_id) then
    raise exception 'document_chunks.brand_id divergente do documento (ou documento inexistente)';
  end if;
  return new;
end $$;

create or replace function enforce_message_brand()
returns trigger language plpgsql security definer set search_path = listening, public, extensions as $$
begin
  if new.brand_id is distinct from (select brand_id from conversations where id = new.conversation_id) then
    raise exception 'messages.brand_id divergente da conversa (ou conversa inexistente)';
  end if;
  return new;
end $$;
