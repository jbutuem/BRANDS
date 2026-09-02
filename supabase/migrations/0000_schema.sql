-- 0000_schema.sql — schema dedicado + grants
create schema if not exists listening;
grant usage on schema listening to anon, authenticated, service_role;
alter default privileges in schema listening grant all on tables    to authenticated, service_role;
alter default privileges in schema listening grant all on sequences to authenticated, service_role;
alter default privileges in schema listening grant execute on functions to authenticated, service_role;
