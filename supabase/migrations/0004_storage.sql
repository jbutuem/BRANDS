-- 0004_storage.sql — Um bucket por marca. Policy espelha a RLS do banco.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b, b, false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/markdown']
from unnest(array['brand-siber','brand-junior','brand-dvg']) as b
on conflict (id) do nothing;

create or replace function listening.bucket_brand_id(p_bucket text)
returns uuid language sql stable set search_path = listening, public as $$
  select id from listening.brands where 'brand-' || slug = p_bucket;
$$;

create policy listening_storage_select on storage.objects
  for select using (listening.bucket_brand_id(bucket_id) in (select listening.auth_brand_ids()));
create policy listening_storage_insert on storage.objects
  for insert with check (listening.auth_has_brand_role(listening.bucket_brand_id(bucket_id), array['admin','brand_manager']::listening.brand_role[]));
create policy listening_storage_update on storage.objects
  for update using (listening.auth_has_brand_role(listening.bucket_brand_id(bucket_id), array['admin','brand_manager']::listening.brand_role[]));
create policy listening_storage_delete on storage.objects
  for delete using (listening.auth_has_brand_role(listening.bucket_brand_id(bucket_id), array['admin','brand_manager']::listening.brand_role[]));
