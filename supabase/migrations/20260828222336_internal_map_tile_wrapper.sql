begin;

create or replace function public.get_company_internal_map_tile(
  p_company_slug text,
  p_z integer,
  p_x integer,
  p_y integer
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select ref.get_company_internal_map_tile(p_company_slug, p_z, p_x, p_y)
$$;

revoke all on function public.get_company_internal_map_tile(text, integer, integer, integer)
  from public, anon;
grant execute on function public.get_company_internal_map_tile(text, integer, integer, integer)
  to authenticated, service_role;

commit;
