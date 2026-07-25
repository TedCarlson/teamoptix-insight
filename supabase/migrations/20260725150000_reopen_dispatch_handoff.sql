create or replace function public.dispatch_reopen_day(
  p_company_id uuid,
  p_dispatch_date date,
  p_note text,
  p_reopened_by_profile_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_day core.dispatch_day;
  v_event core.dispatch_event;
  v_previous_locked_at timestamptz;
begin
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'A reason is required to return the operation to Dispatch.';
  end if;

  select *
  into v_day
  from core.dispatch_day
  where company_id = p_company_id
    and dispatch_date = p_dispatch_date
  for update;

  if v_day.id is null then
    raise exception 'Dispatch day does not exist.';
  end if;

  if v_day.status <> 'LOCKED' then
    raise exception 'Dispatch day is not in Delivery.';
  end if;

  v_previous_locked_at := v_day.locked_at;

  update core.dispatch_day
  set
    status = 'ACTIVE',
    locked_at = null,
    locked_by_profile_id = null,
    updated_at = now()
  where id = v_day.id
  returning *
  into v_day;

  insert into core.dispatch_event (
    dispatch_day_id,
    event_code,
    event_label,
    event_category,
    note,
    event_payload,
    created_by_profile_id
  )
  values (
    v_day.id,
    'RETURN_TO_DISPATCH',
    'Returned to dispatch',
    'OPERATIONS',
    trim(p_note),
    jsonb_build_object(
      'source', 'operational_unit_action_overlay',
      'transition', 'DELIVERY_TO_DISPATCH',
      'previous_locked_at', v_previous_locked_at,
      'preserved_snapshot', true
    ),
    p_reopened_by_profile_id
  )
  returning *
  into v_event;

  return jsonb_build_object(
    'dispatch_day', to_jsonb(v_day),
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke all on function public.dispatch_reopen_day(uuid, date, text, uuid) from public;
grant execute on function public.dispatch_reopen_day(uuid, date, text, uuid) to authenticated;
grant execute on function public.dispatch_reopen_day(uuid, date, text, uuid) to service_role;
