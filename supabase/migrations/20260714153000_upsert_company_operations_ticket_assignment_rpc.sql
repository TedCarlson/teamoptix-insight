create or replace function public.upsert_company_operations_ticket_assignment(
  p_company_id uuid,
  p_template_id uuid,
  p_assignment_status text,
  p_is_enabled boolean,
  p_generation_mode text,
  p_cadence_minutes integer,
  p_window_preset text,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_priority_override integer,
  p_route_scope text,
  p_route_limit integer,
  p_assignment_payload_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_assignment_id uuid;
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can edit ticket assignments.';
  end if;

  if p_company_id is null or p_template_id is null then
    raise exception 'Company and ticket template are required.';
  end if;

  if p_assignment_status is null or p_assignment_status <> all (array['draft', 'ready', 'active', 'paused', 'retired']) then
    raise exception 'Invalid assignment status.';
  end if;

  if p_generation_mode is null or p_generation_mode <> all (array['manual', 'scheduled', 'event_triggered']) then
    raise exception 'Invalid generation mode.';
  end if;

  if p_window_preset is null or p_window_preset <> all (array['SORT_DELIVERY_DAY', 'BUSINESS_DAY', 'CUSTOM', 'OFF']) then
    raise exception 'Invalid window preset.';
  end if;

  if p_route_scope is null or p_route_scope <> all (array['selected_routes', 'active_routes', 'full_active_route_set', 'route_batch']) then
    raise exception 'Invalid route scope.';
  end if;

  if p_cadence_minutes is not null and p_cadence_minutes <> all (array[15, 30, 60]) then
    raise exception 'Cadence must be blank, 15, 30, or 60.';
  end if;

  if p_priority_override is not null and (p_priority_override < 1 or p_priority_override > 999) then
    raise exception 'Priority override must be between 1 and 999.';
  end if;

  if p_route_limit is not null and p_route_limit < 1 then
    raise exception 'Route limit must be greater than zero.';
  end if;

  insert into core.company_operations_ticket_assignment (
    company_id,
    template_id,
    assignment_status,
    is_enabled,
    generation_mode,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    priority_override,
    route_scope,
    route_limit,
    assignment_payload_json,
    updated_at
  )
  values (
    p_company_id,
    p_template_id,
    p_assignment_status,
    coalesce(p_is_enabled, false),
    p_generation_mode,
    p_cadence_minutes,
    p_window_preset,
    p_start_time,
    p_end_time,
    p_priority_override,
    p_route_scope,
    p_route_limit,
    coalesce(p_assignment_payload_json, '{}'::jsonb),
    now()
  )
  on conflict (company_id, template_id)
  do update set
    assignment_status = excluded.assignment_status,
    is_enabled = excluded.is_enabled,
    generation_mode = excluded.generation_mode,
    cadence_minutes = excluded.cadence_minutes,
    window_preset = excluded.window_preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    priority_override = excluded.priority_override,
    route_scope = excluded.route_scope,
    route_limit = excluded.route_limit,
    assignment_payload_json = excluded.assignment_payload_json,
    updated_at = now()
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.upsert_company_operations_ticket_assignment(
  uuid,
  uuid,
  text,
  boolean,
  text,
  integer,
  text,
  time without time zone,
  time without time zone,
  integer,
  text,
  integer,
  jsonb
) from public;

grant execute on function public.upsert_company_operations_ticket_assignment(
  uuid,
  uuid,
  text,
  boolean,
  text,
  integer,
  text,
  time without time zone,
  time without time zone,
  integer,
  text,
  integer,
  jsonb
) to authenticated;

grant execute on function public.upsert_company_operations_ticket_assignment(
  uuid,
  uuid,
  text,
  boolean,
  text,
  integer,
  text,
  time without time zone,
  time without time zone,
  integer,
  text,
  integer,
  jsonb
) to service_role;
