begin;

create or replace function public.mobile_companion_record_manager_action(
  p_company_slug text,
  p_phase text,
  p_event_code text,
  p_route_key text default null,
  p_route_label text default null,
  p_person_roster_member_id uuid default null,
  p_person_name text default null,
  p_seat text default null,
  p_from_route_key text default null,
  p_from_route_label text default null,
  p_to_route_key text default null,
  p_to_route_label text default null,
  p_note text default null,
  p_stop_count integer default null,
  p_event_payload jsonb default '{}'::jsonb
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
  v_phase text;
  v_code text;
  v_day core.dispatch_day%rowtype;
  v_type core.dispatch_event_type%rowtype;
  v_event core.dispatch_event%rowtype;
  v_requires_route boolean;
  v_requires_person boolean;
  v_requires_note boolean;
  v_allows_note boolean;
begin
  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;
  if v_profile_id is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_company_id is null then raise exception 'ACTIVE_COMPANY_REQUIRED'; end if;

  v_phase := upper(btrim(coalesce(p_phase, '')));
  v_code := upper(btrim(coalesce(p_event_code, '')));
  if v_phase not in ('DISPATCH', 'DELIVERY') then raise exception 'ACTION_PHASE_REQUIRED'; end if;

  if v_phase = 'DISPATCH' then
    if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
      raise exception 'DISPATCH_GRANT_REQUIRED';
    end if;
  elsif not (
    core.mobile_companion_can_use_workspace(v_company_id, 'dispatch')
    or core.mobile_companion_can_use_workspace(v_company_id, 'delivery_window')
  ) then
    raise exception 'DELIVERY_ACTION_GRANT_REQUIRED';
  end if;

  select terminal.timezone into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;
  if nullif(btrim(v_timezone), '') is null then raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED'; end if;
  v_service_date := (pg_catalog.now() at time zone v_timezone)::date;

  select event_type.* into v_type
  from core.dispatch_event_type event_type
  where event_type.event_code = v_code
    and event_type.is_active = true
    and event_type.entry_mode in ('manual', 'both')
    and (event_type.company_id = v_company_id or event_type.company_id is null)
  order by event_type.company_id nulls last
  limit 1;

  if v_phase = 'DELIVERY' and v_code not in (
    'DELIVERY_NOTE', 'DRIVER_ASSIST',
    'ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'ASSIGN_HELPER', 'UNASSIGN_HELPER', 'ASSIGN_TRAINEE', 'UNASSIGN_TRAINEE'
  ) then
    raise exception 'UNSUPPORTED_MOBILE_DELIVERY_ACTION';
  end if;
  if v_phase = 'DISPATCH'
     and v_type.id is null
     and v_code not in (
       'ADD_DRIVER', 'ADD_ROUTE', 'REMOVE_ROUTE', 'ARRIVED', 'UNDO_ARRIVED', 'CALL_OUT', 'NO_SHOW', 'LATE_ARRIVAL',
       'ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'ASSIGN_HELPER', 'UNASSIGN_HELPER', 'ASSIGN_TRAINEE', 'UNASSIGN_TRAINEE'
     ) then
    raise exception 'UNSUPPORTED_MOBILE_DISPATCH_ACTION';
  end if;
  if v_phase = 'DISPATCH' and coalesce(v_type.event_category, '') = 'DELIVERY' then
    raise exception 'DISPATCH_ACTION_CATEGORY_REQUIRED';
  end if;

  v_requires_route := (coalesce(v_type.requires_route, false) and v_code <> 'DRIVER_ASSIST') or v_code in (
    'ADD_ROUTE', 'REMOVE_ROUTE', 'ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'ASSIGN_HELPER', 'UNASSIGN_HELPER', 'ASSIGN_TRAINEE', 'UNASSIGN_TRAINEE'
  );
  v_requires_person := coalesce(v_type.requires_person, false) or v_code in (
    'ADD_DRIVER', 'ARRIVED', 'UNDO_ARRIVED', 'CALL_OUT', 'NO_SHOW', 'LATE_ARRIVAL', 'ASSIGN_DRIVER', 'ASSIGN_HELPER', 'ASSIGN_TRAINEE'
  );
  v_requires_note := coalesce(v_type.requires_note, false) or v_code in ('DELIVERY_NOTE', 'PASS_ROUTE_TO_CSA');
  v_allows_note := coalesce(v_type.allows_note, true) or v_requires_note;

  if v_requires_route and nullif(btrim(coalesce(p_route_key, '')), '') is null then raise exception 'ROUTE_REQUIRED'; end if;
  if v_requires_person and p_person_roster_member_id is null then raise exception 'PERSON_REQUIRED'; end if;
  if v_requires_note and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED'; end if;
  if not v_allows_note and nullif(btrim(coalesce(p_note, '')), '') is not null then raise exception 'NOTE_NOT_ALLOWED'; end if;
  if v_code in ('ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'ASSIGN_HELPER', 'UNASSIGN_HELPER', 'ASSIGN_TRAINEE', 'UNASSIGN_TRAINEE') then
    if lower(btrim(coalesce(p_seat, ''))) not in ('driver', 'helper', 'trainee') then raise exception 'ROUTE_SEAT_REQUIRED'; end if;
  end if;

  if p_person_roster_member_id is not null and not exists (
    select 1 from core.company_roster roster
    where roster.id = p_person_roster_member_id and roster.company_id = v_company_id
  ) then raise exception 'PERSON_OUTSIDE_COMPANY_SCOPE'; end if;

  if v_requires_route and v_code <> 'ADD_ROUTE' and not exists (
    select 1 from public.route_baseline route
    where route.company_id = v_company_id
      and route.is_active = true
      and route.effective_end is null
      and (
        route.id::text = p_route_key
        or lower(btrim(route.route_name)) = lower(btrim(p_route_key))
        or lower(btrim(coalesce(route.current_wa_num, ''))) = lower(btrim(p_route_key))
      )
  ) then raise exception 'ROUTE_OUTSIDE_COMPANY_SCOPE'; end if;

  if v_code = 'DRIVER_ASSIST' then
    if nullif(btrim(coalesce(p_from_route_key, '')), '') is null
       or nullif(btrim(coalesce(p_to_route_key, '')), '') is null then
      raise exception 'ASSISTING_AND_RECEIVING_ROUTES_REQUIRED';
    end if;
    if lower(btrim(p_from_route_key)) = lower(btrim(p_to_route_key)) then
      raise exception 'ASSISTING_AND_RECEIVING_ROUTES_MUST_DIFFER';
    end if;
    if p_stop_count is null or p_stop_count < 1 then raise exception 'POSITIVE_ASSIST_STOP_COUNT_REQUIRED'; end if;
    if exists (
      select 1 from (values (p_from_route_key), (p_to_route_key)) requested(route_key)
      where not exists (
        select 1 from public.route_baseline route
        where route.company_id = v_company_id
          and route.is_active = true
          and route.effective_end is null
          and (
            route.id::text = requested.route_key
            or lower(btrim(route.route_name)) = lower(btrim(requested.route_key))
            or lower(btrim(coalesce(route.current_wa_num, ''))) = lower(btrim(requested.route_key))
          )
      )
    ) then raise exception 'ROUTE_OUTSIDE_COMPANY_SCOPE'; end if;
  end if;

  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (v_company_id, v_service_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select dispatch_day.* into v_day
  from core.dispatch_day dispatch_day
  where dispatch_day.company_id = v_company_id
    and dispatch_day.dispatch_date = v_service_date
  for update;

  insert into core.dispatch_event (
    dispatch_day_id, event_type_id, event_code, event_label, event_category,
    route_key, route_label, person_roster_member_id, person_name, seat,
    from_route_key, from_route_label, to_route_key, to_route_label,
    note, event_payload, created_by_profile_id
  ) values (
    v_day.id,
    v_type.id,
    v_code,
    coalesce(v_type.event_label, initcap(replace(lower(v_code), '_', ' '))),
    coalesce(v_type.event_category, case when v_code in ('DELIVERY_NOTE', 'DRIVER_ASSIST') then 'DELIVERY' else 'DISPATCH' end),
    nullif(btrim(coalesce(p_route_key, '')), ''),
    nullif(btrim(coalesce(p_route_label, '')), ''),
    p_person_roster_member_id,
    nullif(btrim(coalesce(p_person_name, '')), ''),
    nullif(lower(btrim(coalesce(p_seat, ''))), ''),
    nullif(btrim(coalesce(p_from_route_key, '')), ''),
    nullif(btrim(coalesce(p_from_route_label, '')), ''),
    nullif(btrim(coalesce(p_to_route_key, '')), ''),
    nullif(btrim(coalesce(p_to_route_label, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'source', 'mobile_companion_manager',
      'phase', lower(v_phase),
      'service_date', v_service_date,
      'stop_count', p_stop_count
    ),
    v_profile_id
  ) returning * into v_event;

  update core.dispatch_day set updated_at = pg_catalog.now()
  where id = v_day.id returning * into v_day;

  return jsonb_build_object(
    'service_date', v_service_date,
    'selected_phase', lower(v_phase),
    'dispatch_day', to_jsonb(v_day),
    'event', to_jsonb(v_event)
  );
end;
$$;

comment on function public.mobile_companion_record_manager_action(
  text, text, text, text, text, uuid, text, text, text, text, text, text, text, integer, jsonb
) is 'Records a mobile manager action under the explicitly selected Dispatch or Delivery classification without using dispatch_day status as an option or write gate.';

revoke all on function public.mobile_companion_record_manager_action(
  text, text, text, text, text, uuid, text, text, text, text, text, text, text, integer, jsonb
) from public, anon;
grant execute on function public.mobile_companion_record_manager_action(
  text, text, text, text, text, uuid, text, text, text, text, text, text, text, integer, jsonb
) to authenticated, service_role;

commit;
