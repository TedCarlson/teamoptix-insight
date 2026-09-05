begin;

-- Blackout dates are operational annotations, so they stay in the existing
-- dated dispatch ledger instead of introducing a second calendar authority.
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
    'BLACKOUT_DATE',
    'Blackout date',
    'OPERATIONS',
    'system',
    false,
    false,
    false,
    true,
    false,
    true,
    18,
    'auto'
  ),
  (
    null,
    'UNDO_BLACKOUT_DATE',
    'Blackout removed',
    'OPERATIONS',
    'system',
    false,
    false,
    false,
    true,
    false,
    true,
    19,
    'auto'
  )
on conflict do nothing;

create or replace function public.operations_blackout_dates(
  p_company_slug text,
  p_start_date date,
  p_end_date date
)
returns table (
  blackout_date date,
  event_id uuid,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'A valid blackout date range is required.';
  end if;

  if p_end_date - p_start_date > 370 then
    raise exception 'Blackout date queries are limited to 371 days.';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  if not core.can_access_company(v_company_id) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select distinct on (day.dispatch_date)
    day.dispatch_date as blackout_date,
    event.id as event_id,
    coalesce(
      nullif(btrim(event.event_payload ->> 'driver_message'), ''),
      'This date is part of a blackout period. If you have a persistent need for time off, please contact your leadership team directly.'
    ) as message,
    event.created_at
  from core.dispatch_day day
  join core.dispatch_event event
    on event.dispatch_day_id = day.id
   and event.event_code = 'BLACKOUT_DATE'
  where day.company_id = v_company_id
    and day.dispatch_date between p_start_date and p_end_date
    and not exists (
      select 1
      from core.dispatch_event reversal
      where reversal.dispatch_day_id = day.id
        and reversal.event_code = 'UNDO_BLACKOUT_DATE'
        and reversal.event_payload ->> 'reverses_event_id' = event.id::text
    )
  order by day.dispatch_date, event.created_at desc, event.id desc;
end;
$$;

comment on function public.operations_blackout_dates(text, date, date) is
  'Returns active blackout annotations from the dated operations ledger for an authorized company member.';

revoke all on function public.operations_blackout_dates(text, date, date)
  from public, anon;
grant execute on function public.operations_blackout_dates(text, date, date)
  to authenticated, service_role;

create or replace function public.set_operations_blackout_dates(
  p_company_id uuid,
  p_dates date[],
  p_action text,
  p_message text default null,
  p_created_by_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dates date[];
  v_date date;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_message text := coalesce(
    nullif(btrim(coalesce(p_message, '')), ''),
    'This date is part of a blackout period. If you have a persistent need for time off, please contact your leadership team directly.'
  );
  v_active_event core.dispatch_event%rowtype;
  v_result jsonb;
  v_changed integer := 0;
begin
  if not core.can_use_company_workspace(p_company_id, 'dispatch') then
    raise exception 'Dispatch access is required.' using errcode = '42501';
  end if;

  if v_action not in ('SET', 'REMOVE') then
    raise exception 'Blackout action must be SET or REMOVE.';
  end if;

  if length(v_message) > 300 then
    raise exception 'Blackout guidance is limited to 300 characters.';
  end if;

  select coalesce(array_agg(distinct selected_date order by selected_date), '{}'::date[])
  into v_dates
  from unnest(coalesce(p_dates, '{}'::date[])) selected(selected_date)
  where selected_date is not null;

  if cardinality(v_dates) < 1 then
    raise exception 'Select at least one blackout date.';
  end if;

  if cardinality(v_dates) > 371 then
    raise exception 'Blackout updates are limited to 371 dates at a time.';
  end if;

  foreach v_date in array v_dates loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_company_id::text || ':' || v_date::text, 0)
    );

    select event.*
    into v_active_event
    from core.dispatch_day day
    join core.dispatch_event event on event.dispatch_day_id = day.id
    where day.company_id = p_company_id
      and day.dispatch_date = v_date
      and event.event_code = 'BLACKOUT_DATE'
      and not exists (
        select 1
        from core.dispatch_event reversal
        where reversal.dispatch_day_id = day.id
          and reversal.event_code = 'UNDO_BLACKOUT_DATE'
          and reversal.event_payload ->> 'reverses_event_id' = event.id::text
      )
    order by event.created_at desc, event.id desc
    limit 1;

    if v_action = 'REMOVE' then
      if v_active_event.id is not null then
        perform public.dispatch_record_event_unchecked(
          p_company_id,
          v_date,
          'UNDO_BLACKOUT_DATE',
          'Blackout removed',
          'OPERATIONS',
          null, null, null, null, null, null, null, null, null,
          'Blackout removed from the Operations Calendar.',
          jsonb_build_object(
            'source', 'operations_calendar',
            'reverses_event_id', v_active_event.id,
            'reverses_event_code', 'BLACKOUT_DATE'
          ),
          p_created_by_profile_id
        );
        v_changed := v_changed + 1;
      end if;
    elsif v_active_event.id is null
       or coalesce(v_active_event.event_payload ->> 'driver_message', '') <> v_message then
      if v_active_event.id is not null then
        perform public.dispatch_record_event_unchecked(
          p_company_id,
          v_date,
          'UNDO_BLACKOUT_DATE',
          'Blackout guidance updated',
          'OPERATIONS',
          null, null, null, null, null, null, null, null, null,
          'Prior blackout guidance replaced from the Operations Calendar.',
          jsonb_build_object(
            'source', 'operations_calendar',
            'reverses_event_id', v_active_event.id,
            'reverses_event_code', 'BLACKOUT_DATE'
          ),
          p_created_by_profile_id
        );
      end if;

      select public.dispatch_record_event_unchecked(
        p_company_id,
        v_date,
        'BLACKOUT_DATE',
        'Blackout date',
        'OPERATIONS',
        null, null, null, null, null, null, null, null, null,
        'Blackout set from the Operations Calendar.',
        jsonb_build_object(
          'source', 'operations_calendar',
          'driver_message', v_message
        ),
        p_created_by_profile_id
      )
      into v_result;
      v_changed := v_changed + 1;
    end if;

    v_active_event := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'selected_count', cardinality(v_dates),
    'changed_count', v_changed
  );
end;
$$;

comment on function public.set_operations_blackout_dates(uuid, date[], text, text, uuid) is
  'Atomically sets, updates, or reverses blackout annotations in the dated operations ledger.';

revoke all on function public.set_operations_blackout_dates(uuid, date[], text, text, uuid)
  from public, anon;
grant execute on function public.set_operations_blackout_dates(uuid, date[], text, text, uuid)
  to authenticated, service_role;

create or replace function core.reject_driver_time_off_blackout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blackout_date date;
  v_message text;
begin
  select
    requested.requested_date,
    coalesce(
      nullif(btrim(event.event_payload ->> 'driver_message'), ''),
      'This date is part of a blackout period. If you have a persistent need for time off, please contact your leadership team directly.'
    )
  into v_blackout_date, v_message
  from unnest(new.requested_dates) requested(requested_date)
  join core.dispatch_day day
    on day.company_id = new.company_id
   and day.dispatch_date = requested.requested_date
  join core.dispatch_event event
    on event.dispatch_day_id = day.id
   and event.event_code = 'BLACKOUT_DATE'
  where not exists (
    select 1
    from core.dispatch_event reversal
    where reversal.dispatch_day_id = day.id
      and reversal.event_code = 'UNDO_BLACKOUT_DATE'
      and reversal.event_payload ->> 'reverses_event_id' = event.id::text
  )
  order by requested.requested_date, event.created_at desc, event.id desc
  limit 1;

  if v_blackout_date is not null then
    raise exception '%', format(
      'TIME_OFF_BLACKOUT_DATE|%s|%s',
      v_blackout_date,
      replace(v_message, '|', ' ')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists driver_time_off_request_reject_blackout
  on public.driver_time_off_request;
create trigger driver_time_off_request_reject_blackout
before insert or update of company_id, requested_dates
on public.driver_time_off_request
for each row
execute function core.reject_driver_time_off_blackout();

comment on function core.reject_driver_time_off_blackout() is
  'Enforces Operations Calendar blackout dates at the authoritative time-off request write boundary.';

revoke all on function core.reject_driver_time_off_blackout()
  from public, anon, authenticated;

commit;
