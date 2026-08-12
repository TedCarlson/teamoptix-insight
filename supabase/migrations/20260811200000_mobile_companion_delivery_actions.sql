begin;

create or replace function public.mobile_companion_record_delivery_event(
  p_company_slug text,
  p_event_code text,
  p_note text default null,
  p_from_route_key text default null,
  p_from_route_label text default null,
  p_to_route_key text default null,
  p_to_route_label text default null,
  p_stop_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_timezone text;
  v_service_date date;
  v_code text;
  v_day core.dispatch_day%rowtype;
  v_type core.dispatch_event_type%rowtype;
  v_event core.dispatch_event%rowtype;
begin
  select profile.id
  into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  if v_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
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
  ) then
    raise exception 'DELIVERY_ACTION_GRANT_REQUIRED';
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
  v_code := upper(btrim(coalesce(p_event_code, '')));

  if v_code not in ('DELIVERY_NOTE', 'DRIVER_ASSIST') then
    raise exception 'UNSUPPORTED_MOBILE_DELIVERY_ACTION';
  end if;

  if v_code = 'DELIVERY_NOTE' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'DELIVERY_CONTEXT_REQUIRED';
  end if;

  if v_code = 'DRIVER_ASSIST' then
    if nullif(btrim(coalesce(p_from_route_key, '')), '') is null
       or nullif(btrim(coalesce(p_to_route_key, '')), '') is null then
      raise exception 'ASSISTING_AND_RECEIVING_ROUTES_REQUIRED';
    end if;
    if lower(btrim(p_from_route_key)) = lower(btrim(p_to_route_key)) then
      raise exception 'ASSISTING_AND_RECEIVING_ROUTES_MUST_DIFFER';
    end if;
    if p_stop_count is null or p_stop_count < 1 then
      raise exception 'POSITIVE_ASSIST_STOP_COUNT_REQUIRED';
    end if;
  end if;

  select dispatch_day.*
  into v_day
  from core.dispatch_day dispatch_day
  where dispatch_day.company_id = v_company_id
    and dispatch_day.dispatch_date = v_service_date
  for update;

  if v_day.id is null or v_day.status <> 'LOCKED' then
    raise exception 'DELIVERY_PHASE_REQUIRED';
  end if;

  if v_code = 'DRIVER_ASSIST' and exists (
    select 1
    from (values (p_from_route_key), (p_to_route_key)) requested(route_key)
    where not exists (
      select 1
      from public.route_baseline route
      where route.company_id = v_company_id
        and route.is_active = true
        and route.effective_end is null
        and (
          route.id::text = requested.route_key
          or lower(btrim(route.route_name)) = lower(btrim(requested.route_key))
          or lower(btrim(coalesce(route.current_wa_num, ''))) = lower(btrim(requested.route_key))
        )
    )
  ) then
    raise exception 'ROUTE_OUTSIDE_COMPANY_SCOPE';
  end if;

  select event_type.*
  into v_type
  from core.dispatch_event_type event_type
  where event_type.event_code = v_code
    and event_type.is_active = true
    and (event_type.company_id = v_company_id or event_type.company_id is null)
  order by event_type.company_id nulls last
  limit 1;

  insert into core.dispatch_event (
    dispatch_day_id,
    event_type_id,
    event_code,
    event_label,
    event_category,
    from_route_key,
    from_route_label,
    to_route_key,
    to_route_label,
    note,
    event_payload,
    created_by_profile_id
  )
  values (
    v_day.id,
    v_type.id,
    v_code,
    coalesce(v_type.event_label, case when v_code = 'DRIVER_ASSIST' then 'Driver assist' else 'Delivery note' end),
    'DELIVERY',
    nullif(btrim(coalesce(p_from_route_key, '')), ''),
    nullif(btrim(coalesce(p_from_route_label, '')), ''),
    nullif(btrim(coalesce(p_to_route_key, '')), ''),
    nullif(btrim(coalesce(p_to_route_label, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object(
      'phase', 'delivery',
      'source', 'mobile_delivery_action_overlay',
      'service_date', v_service_date,
      'stop_count', p_stop_count
    ),
    v_profile_id
  )
  returning * into v_event;

  update core.dispatch_day
  set updated_at = pg_catalog.now()
  where id = v_day.id
  returning * into v_day;

  return jsonb_build_object(
    'service_date', v_service_date,
    'dispatch_day', to_jsonb(v_day),
    'event', to_jsonb(v_event)
  );
end;
$$;

comment on function public.mobile_companion_record_delivery_event(text, text, text, text, text, text, text, integer) is
  'Records grant-scoped post-handoff Delivery notes and driver-assist events from the Operations mobile action overlay.';

revoke all on function public.mobile_companion_record_delivery_event(text, text, text, text, text, text, text, integer)
  from public, anon;

grant execute on function public.mobile_companion_record_delivery_event(text, text, text, text, text, text, text, integer)
  to authenticated, service_role;

commit;
