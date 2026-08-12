begin;

-- Mobile Companion observations remain the immutable source of truth. This
-- function is a bounded, server-owned read projection for mapping and route
-- analysis. It intentionally does not write the legacy payroll breadcrumb
-- table and it does not guess route, vehicle, carrier, delivery, or payroll
-- truth from device evidence.
create or replace function public.mobile_companion_breadcrumb_evidence(
  p_company_slug text,
  p_service_date date default null,
  p_roster_member_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_timezone text;
  v_service_date date;
  v_self_roster_id uuid;
  v_self_roster_count integer;
  v_can_manage boolean;
  v_total_points bigint;
  v_sessions jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

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
  join core.company_memberships membership
    on membership.company_id = company.id
   and membership.profile_id = v_profile_id
   and membership.membership_status = 'active'
  where company.company_slug = pg_catalog.lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_MEMBERSHIP_REQUIRED';
  end if;

  select terminal.timezone
  into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and pg_catalog.nullif(pg_catalog.btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;

  if pg_catalog.nullif(pg_catalog.btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;

  v_service_date := coalesce(
    p_service_date,
    (pg_catalog.now() at time zone v_timezone)::date
  );
  v_can_manage := core.mobile_companion_can_use_workspace(v_company_id, 'dispatch');

  if not v_can_manage then
    select count(*)
    into v_self_roster_count
    from core.company_roster roster
    where roster.company_id = v_company_id
      and roster.profile_id = v_profile_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL';

    if v_self_roster_count = 0 then
      raise exception 'ELIGIBLE_DRIVER_ROSTER_REQUIRED';
    end if;
    if v_self_roster_count <> 1 then
      raise exception 'AMBIGUOUS_DRIVER_ROSTER';
    end if;

    select roster.id
    into v_self_roster_id
    from core.company_roster roster
    where roster.company_id = v_company_id
      and roster.profile_id = v_profile_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL';

    if p_roster_member_id is not null and p_roster_member_id <> v_self_roster_id then
      raise exception 'BREADCRUMB_EVIDENCE_OUTSIDE_DRIVER_SCOPE';
    end if;
  elsif p_roster_member_id is not null and not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'ROSTER_MEMBER_OUTSIDE_COMPANY_SCOPE';
  end if;

  select count(*)
  into v_total_points
  from core.mobile_companion_observation_event event
  where event.company_id = v_company_id
    and event.service_date = v_service_date
    and event.event_type = 'LOCATION_CAPTURE'
    and (p_roster_member_id is null or event.roster_member_id = p_roster_member_id)
    and (v_can_manage or event.roster_member_id = v_self_roster_id);

  with bounded_points as (
    select
      event.id,
      event.roster_member_id,
      event.tracking_session_id,
      event.device_occurred_at,
      event.latitude,
      event.longitude,
      event.accuracy_meters,
      event.capture_method,
      event.server_disposition
    from core.mobile_companion_observation_event event
    where event.company_id = v_company_id
      and event.service_date = v_service_date
      and event.event_type = 'LOCATION_CAPTURE'
      and (p_roster_member_id is null or event.roster_member_id = p_roster_member_id)
      and (v_can_manage or event.roster_member_id = v_self_roster_id)
    order by event.device_occurred_at, event.id
    limit 5000
  ),
  session_bounds as (
    select
      event.roster_member_id,
      event.tracking_session_id,
      min(event.device_occurred_at) filter (where event.event_type = 'DUTY_STARTED') as device_started_at,
      max(event.device_occurred_at) filter (where event.event_type = 'DUTY_STOPPED') as device_stopped_at
    from core.mobile_companion_observation_event event
    where event.company_id = v_company_id
      and event.service_date = v_service_date
      and event.event_type in ('DUTY_STARTED', 'DUTY_STOPPED')
      and event.tracking_session_id in (
        select distinct point.tracking_session_id from bounded_points point
      )
    group by event.roster_member_id, event.tracking_session_id
  ),
  projected_sessions as (
    select
      point.roster_member_id,
      roster.full_name as driver_name,
      point.tracking_session_id,
      bounds.device_started_at,
      bounds.device_stopped_at,
      count(*) as point_count,
      min(point.device_occurred_at) as first_point_at,
      max(point.device_occurred_at) as last_point_at,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'observation_event_id', point.id,
          'device_occurred_at', point.device_occurred_at,
          'latitude', point.latitude,
          'longitude', point.longitude,
          'accuracy_meters', point.accuracy_meters,
          'capture_method', point.capture_method,
          'server_disposition', point.server_disposition
        )
        order by point.device_occurred_at, point.id
      ) as points
    from bounded_points point
    join core.company_roster roster on roster.id = point.roster_member_id
    left join session_bounds bounds
      on bounds.roster_member_id = point.roster_member_id
     and bounds.tracking_session_id = point.tracking_session_id
    group by
      point.roster_member_id,
      roster.full_name,
      point.tracking_session_id,
      bounds.device_started_at,
      bounds.device_stopped_at
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'roster_member_id', session.roster_member_id,
        'driver_name', session.driver_name,
        'tracking_session_id', session.tracking_session_id,
        'device_started_at', session.device_started_at,
        'device_stopped_at', session.device_stopped_at,
        'point_count', session.point_count,
        'first_point_at', session.first_point_at,
        'last_point_at', session.last_point_at,
        'route_resolution', 'UNRESOLVED',
        'route_key', null,
        'points', session.points
      )
      order by session.first_point_at, session.tracking_session_id
    ),
    '[]'::jsonb
  )
  into v_sessions
  from projected_sessions session;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'company_id', v_company_id,
    'service_date', v_service_date,
    'evidence_class', 'DEVICE_LOCATION_OBSERVATION',
    'truth_status', 'OBSERVATION_ONLY',
    'route_resolution', 'SERVER_OWNED_UNRESOLVED',
    'total_point_count', v_total_points,
    'returned_point_count', least(v_total_points, 5000),
    'truncated', v_total_points > 5000,
    'sessions', v_sessions,
    'generated_at', pg_catalog.now()
  );
end;
$$;

revoke all on function public.mobile_companion_breadcrumb_evidence(text, date, uuid)
  from public, anon;
grant execute on function public.mobile_companion_breadcrumb_evidence(text, date, uuid)
  to authenticated, service_role;

comment on function public.mobile_companion_breadcrumb_evidence(text, date, uuid)
is 'Bounded, authorized read projection of immutable Mobile Companion location observations. Route association remains unresolved and server-owned.';

commit;

notify pgrst, 'reload schema';
