-- 0006 — bootstrap: o primeiro usuário a chamar esta função, quando ainda não
-- existe NENHUM membro no sistema, vira admin de todas as marcas.
-- Depois disso a função não faz nada (retorna false).
set search_path = listening, public, extensions;

create or replace function bootstrap_first_admin()
returns boolean
language plpgsql security definer set search_path = listening, public, extensions as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from brand_memberships) then return false; end if;
  insert into brand_memberships (user_id, brand_id, role)
  select auth.uid(), id, 'admin' from brands;
  return true;
end $$;
grant execute on function bootstrap_first_admin() to authenticated;
