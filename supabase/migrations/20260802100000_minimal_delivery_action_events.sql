insert into core.dispatch_event_type (
  company_id,
  event_code,
  event_label,
  event_category,
  source,
  requires_person,
  requires_route,
  requires_assignment,
  allows_note,
  requires_note,
  is_active,
  sort_order,
  entry_mode
)
values
  (
    null,
    'DELIVERY_NOTE',
    'Delivery note',
    'DELIVERY',
    'system',
    false,
    false,
    false,
    true,
    true,
    true,
    200,
    'manual'
  ),
  (
    null,
    'DRIVER_ASSIST',
    'Driver assist',
    'DELIVERY',
    'system',
    false,
    true,
    false,
    false,
    false,
    true,
    210,
    'manual'
  )
on conflict (event_code) where company_id is null
do update set
  event_label = excluded.event_label,
  event_category = excluded.event_category,
  source = excluded.source,
  requires_person = excluded.requires_person,
  requires_route = excluded.requires_route,
  requires_assignment = excluded.requires_assignment,
  allows_note = excluded.allows_note,
  requires_note = excluded.requires_note,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  entry_mode = excluded.entry_mode;

create or replace function public.dispatch_record_event(
  p_company_id uuid,
  p_dispatch_date date,
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
  p_event_payload jsonb default '{}'::jsonb,
  p_created_by_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_day core.dispatch_day;
  v_type core.dispatch_event_type;
  v_event core.dispatch_event;
begin
  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (p_company_id, p_dispatch_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select *
  into v_day
  from core.dispatch_day
  where company_id = p_company_id
    and dispatch_date = p_dispatch_date;

  if p_event_code = 'DELIVERY_NOTE'
    and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Delivery note is required.';
  end if;

  if p_event_code = 'DRIVER_ASSIST' then
    if nullif(trim(coalesce(p_from_route_key, '')), '') is null
      or nullif(trim(coalesce(p_to_route_key, '')), '') is null
      or p_from_route_key = p_to_route_key then
      raise exception 'Driver assist requires different assisting and receiving routes.';
    end if;

    if coalesce(p_event_payload ->> 'stop_count', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Driver assist stop count must be a positive whole number.';
    end if;
  end if;

  select *
  into v_type
  from core.dispatch_event_type
  where event_code = p_event_code
    and is_active = true
    and (company_id = p_company_id or company_id is null)
  order by company_id nulls last
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
    p_event_code,
    coalesce(nullif(trim(p_event_label), ''), v_type.event_label, p_event_code),
    coalesce(nullif(trim(p_event_category), ''), v_type.event_category, 'DISPATCH'),
    p_route_key,
    p_route_label,
    p_seat,
    p_person_roster_member_id,
    p_person_name,
    p_from_route_key,
    p_from_route_label,
    p_to_route_key,
    p_to_route_label,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_event_payload, '{}'::jsonb),
    p_created_by_profile_id
  )
  returning *
  into v_event;

  update core.dispatch_day
  set updated_at = now()
  where id = v_day.id;

  return jsonb_build_object(
    'dispatch_day', to_jsonb(v_day),
    'event', to_jsonb(v_event)
  );
end;
$$;
