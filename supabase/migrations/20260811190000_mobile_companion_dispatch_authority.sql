begin;

-- Pass 2 management clients use the same grant vocabulary as the web app.
-- This helper keeps mobile RPCs from treating company membership alone as
-- authority to mutate an operational workspace.
create or replace function core.mobile_companion_can_use_workspace(
  p_company_id uuid,
  p_grant_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and (
      core.is_platform_owner()
      or exists (
        select 1
        from core.profiles profile
        join core.company_memberships membership
          on membership.profile_id = profile.id
         and membership.company_id = p_company_id
         and membership.membership_status = 'active'
        where profile.auth_user_id = auth.uid()
          and profile.profile_status = 'active'
          and (
            membership.relationship_type = 'admin'
            or exists (
              select 1
              from core.company_user_grant workspace_grant
              where workspace_grant.company_id = p_company_id
                and workspace_grant.profile_id = profile.id
                and workspace_grant.grant_key = p_grant_key
                and workspace_grant.is_active = true
            )
          )
      )
    );
$$;

revoke all on function core.mobile_companion_can_use_workspace(uuid, text)
  from public, anon, authenticated;

create or replace function public.mobile_companion_dispatch_workspace(
  p_company_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_terminal_id uuid;
  v_terminal_code text;
  v_timezone text;
  v_service_date date;
  v_day core.dispatch_day%rowtype;
  v_events jsonb;
  v_event_types jsonb;
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

  if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
    raise exception 'DISPATCH_GRANT_REQUIRED';
  end if;

  select terminal.terminal_id, terminal.terminal_code, terminal.timezone
  into v_terminal_id, v_terminal_code, v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;

  if v_terminal_id is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;

  v_service_date := (pg_catalog.now() at time zone v_timezone)::date;

  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (v_company_id, v_service_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select dispatch_day.*
  into v_day
  from core.dispatch_day dispatch_day
  where dispatch_day.company_id = v_company_id
    and dispatch_day.dispatch_date = v_service_date;

  select coalesce(
    jsonb_agg(to_jsonb(event) order by event.created_at),
    '[]'::jsonb
  )
  into v_events
  from core.dispatch_event event
  where event.dispatch_day_id = v_day.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event_type.id,
        'event_code', event_type.event_code,
        'event_label', event_type.event_label,
        'event_category', event_type.event_category,
        'requires_person', event_type.requires_person,
        'requires_route', event_type.requires_route,
        'allows_note', event_type.allows_note,
        'requires_note', event_type.requires_note,
        'sort_order', event_type.sort_order
      )
      order by event_type.sort_order, event_type.event_label
    ),
    '[]'::jsonb
  )
  into v_event_types
  from core.dispatch_event_type event_type
  where event_type.is_active = true
    and event_type.entry_mode in ('manual', 'both')
    and (event_type.company_id is null or event_type.company_id = v_company_id);

  return jsonb_build_object(
    'company_id', v_company_id,
    'profile_id', v_profile_id,
    'service_date', v_service_date,
    'terminal_id', v_terminal_id,
    'terminal_code', v_terminal_code,
    'timezone', v_timezone,
    'dispatch_day', to_jsonb(v_day),
    'events', v_events,
    'event_types', v_event_types
  );
end;
$$;

comment on function public.mobile_companion_dispatch_workspace(text) is
  'Returns the server-dated Dispatch management context for an authenticated administrator or user with an active dispatch grant.';

create or replace function public.mobile_companion_record_dispatch_event(
  p_company_slug text,
  p_event_code text,
  p_event_label text default null,
  p_event_category text default null,
  p_route_key text default null,
  p_route_label text default null,
  p_seat text default null,
  p_person_roster_member_id uuid default null,
  p_person_name text default null,
  p_from_route_key text default null,
  p_from_route_label text default null,
  p_to_route_key text default null,
  p_to_route_label text default null,
  p_note text default null,
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

  if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
    raise exception 'DISPATCH_GRANT_REQUIRED';
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

  if v_code not in (
    'ASSIGN_DRIVER',
    'UNASSIGN_DRIVER',
    'ARRIVED',
    'UNDO_ARRIVED',
    'CALL_OUT',
    'NO_SHOW',
    'LATE_ARRIVAL',
    'ADD_DRIVER',
    'ADD_ROUTE',
    'REMOVE_ROUTE'
  ) then
    raise exception 'UNSUPPORTED_MOBILE_DISPATCH_ACTION';
  end if;

  if v_code in ('ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'ADD_ROUTE', 'REMOVE_ROUTE')
     and nullif(btrim(coalesce(p_route_key, '')), '') is null then
    raise exception 'ROUTE_REQUIRED';
  end if;

  if v_code in ('ASSIGN_DRIVER', 'ARRIVED', 'UNDO_ARRIVED', 'CALL_OUT', 'NO_SHOW', 'LATE_ARRIVAL', 'ADD_DRIVER')
     and p_person_roster_member_id is null then
    raise exception 'PERSON_REQUIRED';
  end if;

  if p_person_roster_member_id is not null
     and not exists (
       select 1
       from core.company_roster roster
       where roster.id = p_person_roster_member_id
         and roster.company_id = v_company_id
     ) then
    raise exception 'PERSON_OUTSIDE_COMPANY_SCOPE';
  end if;

  if v_code in ('ASSIGN_DRIVER', 'UNASSIGN_DRIVER', 'REMOVE_ROUTE')
     and not exists (
       select 1
       from public.route_baseline route
       where route.company_id = v_company_id
         and route.is_active = true
         and route.effective_end is null
         and (
           route.id::text = p_route_key
           or lower(btrim(route.route_name)) = lower(btrim(p_route_key))
           or lower(btrim(coalesce(route.current_wa_num, ''))) = lower(btrim(p_route_key))
         )
     ) then
    raise exception 'ROUTE_OUTSIDE_COMPANY_SCOPE';
  end if;

  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (v_company_id, v_service_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select dispatch_day.*
  into v_day
  from core.dispatch_day dispatch_day
  where dispatch_day.company_id = v_company_id
    and dispatch_day.dispatch_date = v_service_date
  for update;

  if v_day.status = 'LOCKED' then
    raise exception 'DISPATCH_DAY_LOCKED';
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
    route_key,
    route_label,
    seat,
    person_roster_member_id,
    person_name,
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
    coalesce(nullif(btrim(p_event_label), ''), v_type.event_label, initcap(replace(lower(v_code), '_', ' '))),
    coalesce(nullif(btrim(p_event_category), ''), v_type.event_category, 'DISPATCH'),
    nullif(btrim(coalesce(p_route_key, '')), ''),
    nullif(btrim(coalesce(p_route_label, '')), ''),
    nullif(btrim(coalesce(p_seat, '')), ''),
    p_person_roster_member_id,
    nullif(btrim(coalesce(p_person_name, '')), ''),
    nullif(btrim(coalesce(p_from_route_key, '')), ''),
    nullif(btrim(coalesce(p_from_route_label, '')), ''),
    nullif(btrim(coalesce(p_to_route_key, '')), ''),
    nullif(btrim(coalesce(p_to_route_label, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'source', 'mobile_companion_manager',
      'service_date', v_service_date
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

comment on function public.mobile_companion_record_dispatch_event(
  text, text, text, text, text, text, text, uuid, text,
  text, text, text, text, text, jsonb
) is
  'Records a constrained, company-scoped Dispatch event for an authenticated administrator or user with an active dispatch grant.';

revoke all on function public.mobile_companion_dispatch_workspace(text)
  from public, anon;
grant execute on function public.mobile_companion_dispatch_workspace(text)
  to authenticated, service_role;

revoke all on function public.mobile_companion_record_dispatch_event(
  text, text, text, text, text, text, text, uuid, text,
  text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.mobile_companion_record_dispatch_event(
  text, text, text, text, text, text, text, uuid, text,
  text, text, text, text, text, jsonb
) to authenticated, service_role;

commit;
