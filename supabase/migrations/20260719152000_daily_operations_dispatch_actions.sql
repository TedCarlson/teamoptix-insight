create or replace function public.get_daily_operations_dispatch_actions(
  p_company_id uuid,
  p_service_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_actions jsonb;
begin
  if not core.can_access_company(p_company_id) and not core.is_platform_owner() then
    raise exception 'Company access required.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'event_code', event.event_code,
        'event_label', event.event_label,
        'event_category', event.event_category,
        'route_key', event.route_key,
        'route_label', event.route_label,
        'seat', event.seat,
        'person_name', event.person_name,
        'from_route_key', event.from_route_key,
        'from_route_label', event.from_route_label,
        'to_route_key', event.to_route_key,
        'to_route_label', event.to_route_label,
        'note', event.note,
        'event_payload', event.event_payload,
        'created_at', event.created_at,
        'created_by_name', coalesce(
          nullif(btrim(profile.display_name), ''),
          nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), '')
        )
      )
      order by event.created_at, event.id
    ),
    '[]'::jsonb
  )
  into v_actions
  from core.dispatch_day day
  join core.dispatch_event event on event.dispatch_day_id = day.id
  left join core.profiles profile on profile.id = event.created_by_profile_id
  where day.company_id = p_company_id
    and day.dispatch_date = p_service_date;

  return v_actions;
end;
$$;

revoke all on function public.get_daily_operations_dispatch_actions(uuid, date) from public;
grant execute on function public.get_daily_operations_dispatch_actions(uuid, date) to authenticated;
grant execute on function public.get_daily_operations_dispatch_actions(uuid, date) to service_role;
