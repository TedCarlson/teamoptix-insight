begin;

create or replace function public.record_platform_service_checks(p_checks jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  inserted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  insert into core.platform_service_check_run (
    service_key, check_key, check_name, started_at, completed_at, status,
    latency_ms, status_code, error_code, error_message, metadata
  )
  select
    row_data->>'service_key',
    row_data->>'check_key',
    row_data->>'check_name',
    coalesce((row_data->>'started_at')::timestamptz, now()),
    (row_data->>'completed_at')::timestamptz,
    row_data->>'status',
    (row_data->>'latency_ms')::integer,
    (row_data->>'status_code')::integer,
    row_data->>'error_code',
    row_data->>'error_message',
    coalesce(row_data->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_checks) as row_data;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.record_platform_service_checks(jsonb) from public, anon, authenticated;
grant execute on function public.record_platform_service_checks(jsonb) to service_role;

create or replace view public.platform_service_check_run_v
with (security_invoker = true)
as
select
  id, service_key, check_key, check_name, started_at, completed_at, status,
  latency_ms, status_code, error_code, error_message, source, metadata, created_at
from core.platform_service_check_run;

grant select on public.platform_service_check_run_v to authenticated, service_role;

commit;
