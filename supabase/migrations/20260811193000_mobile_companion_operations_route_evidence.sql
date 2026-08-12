begin;

create or replace function public.mobile_companion_operations_route_evidence(
  p_company_slug text,
  p_route_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_timezone text;
  v_service_date date;
  v_route_key text;
  v_health jsonb;
  v_delivery_stops jsonb;
  v_packages jsonb;
  v_pickups jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_REQUIRED';
  end if;

  if not (
    core.mobile_companion_can_use_workspace(v_company_id, 'dispatch')
    or core.mobile_companion_can_use_workspace(v_company_id, 'delivery_window')
    or core.mobile_companion_can_use_workspace(v_company_id, 'planning')
    or core.mobile_companion_can_use_workspace(v_company_id, 'reports')
  ) then
    raise exception 'OPERATIONS_GRANT_REQUIRED';
  end if;

  select terminal.timezone
  into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;

  if nullif(btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;

  v_service_date := (pg_catalog.now() at time zone v_timezone)::date;
  v_route_key := nullif(btrim(p_route_key), '');

  if v_route_key is null then
    raise exception 'ROUTE_REQUIRED';
  end if;

  select to_jsonb(health)
  into v_health
  from public.operations_manifest_route_health_v health
  where health.company_id = v_company_id
    and health.service_date = v_service_date
    and lower(btrim(health.route_key)) = lower(v_route_key)
  order by
    coalesce(health.artifact_count, 0) desc,
    coalesce(health.delivery_package_count, 0) desc,
    coalesce(health.latest_processed_at, health.latest_captured_at) desc nulls last
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(stop)), '[]'::jsonb)
  into v_delivery_stops
  from public.operations_delivery_manifest_stop_v stop
  where stop.company_id = v_company_id
    and stop.service_date = v_service_date
    and lower(btrim(stop.route_key)) = lower(v_route_key);

  select coalesce(jsonb_agg(to_jsonb(manifest_package)), '[]'::jsonb)
  into v_packages
  from public.operations_delivery_manifest_package_v manifest_package
  where manifest_package.company_id = v_company_id
    and manifest_package.service_date = v_service_date
    and lower(btrim(manifest_package.route_key)) = lower(v_route_key);

  select coalesce(jsonb_agg(to_jsonb(pickup)), '[]'::jsonb)
  into v_pickups
  from public.operations_pickup_manifest_stop_v pickup
  where pickup.company_id = v_company_id
    and pickup.service_date = v_service_date
    and lower(btrim(pickup.route_key)) = lower(v_route_key);

  return jsonb_build_object(
    'company_id', v_company_id,
    'service_date', v_service_date,
    'timezone', v_timezone,
    'route_key', v_route_key,
    'health', v_health,
    'delivery_stops', v_delivery_stops,
    'packages', v_packages,
    'pickups', v_pickups
  );
end;
$$;

comment on function public.mobile_companion_operations_route_evidence(text, text) is
  'Returns server-dated, company-scoped delivery manifest evidence for the Operations mobile route drawer.';

revoke all on function public.mobile_companion_operations_route_evidence(text, text)
  from public, anon;

grant execute on function public.mobile_companion_operations_route_evidence(text, text)
  to authenticated, service_role;

commit;
