begin;

-- Time-off requests are business workflow records, not device observations.
-- Mobile clients supply durable action ids and intent metadata, while the
-- database remains authoritative for identity, eligibility, state, and
-- schedule projection.
alter table public.driver_time_off_request
  add column if not exists device_submission_id uuid,
  add column if not exists intent_confirmation jsonb,
  add column if not exists withdrawal_device_action_id uuid,
  add column if not exists withdrawal_intent_confirmation jsonb,
  add column if not exists withdrawn_at timestamptz;

create unique index if not exists driver_time_off_request_device_submission_uidx
  on public.driver_time_off_request(company_id, device_submission_id)
  where device_submission_id is not null;

create unique index if not exists driver_time_off_request_withdrawal_action_uidx
  on public.driver_time_off_request(company_id, withdrawal_device_action_id)
  where withdrawal_device_action_id is not null;

comment on column public.driver_time_off_request.device_submission_id is
  'Client-generated idempotency key for a single request submission.';
comment on column public.driver_time_off_request.intent_confirmation is
  'Audit metadata describing the client-side anti-accidental-action confirmation. It is not an authentication factor.';

create or replace function public.submit_driver_time_off_request(
  p_company_slug text,
  p_device_submission_id uuid,
  p_requested_dates date[],
  p_request_note text default null,
  p_intent_confirmation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_dates date[];
  v_today date;
  v_note text;
  v_existing public.driver_time_off_request%rowtype;
  v_request public.driver_time_off_request%rowtype;
  v_duplicate boolean := false;
begin
  if p_device_submission_id is null then
    raise exception 'DEVICE_SUBMISSION_ID_REQUIRED';
  end if;

  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  select coalesce(array_agg(distinct requested_date order by requested_date), '{}'::date[])
  into v_dates
  from unnest(coalesce(p_requested_dates, '{}'::date[])) requested_date
  where requested_date is not null;

  if cardinality(v_dates) < 1 then
    raise exception 'TIME_OFF_DATES_REQUIRED';
  end if;
  if cardinality(v_dates) > 15 then
    raise exception 'TIME_OFF_MAX_15_DAYS';
  end if;

  v_today := (
    now() at time zone coalesce(v_authority.terminal_timezone, 'America/New_York')
  )::date;
  if v_dates[1] < v_today + 10 then
    raise exception 'TIME_OFF_MIN_10_DAYS_NOTICE';
  end if;

  v_note := nullif(btrim(coalesce(p_request_note, '')), '');
  if length(v_note) > 500 then
    raise exception 'TIME_OFF_NOTE_MAX_500';
  end if;
  if p_intent_confirmation is null
     or jsonb_typeof(p_intent_confirmation) <> 'object' then
    raise exception 'INVALID_INTENT_CONFIRMATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_submission_id::text, 0)
  );

  select request.* into v_existing
  from public.driver_time_off_request request
  where request.company_id = v_authority.company_id
    and request.device_submission_id = p_device_submission_id;

  if found then
    if v_existing.profile_id <> v_authority.profile_id
       or v_existing.roster_member_id <> v_authority.roster_member_id
       or v_existing.requested_dates <> v_dates
       or coalesce(v_existing.request_note, '') <> coalesce(v_note, '') then
      raise exception 'TIME_OFF_SUBMISSION_ID_CONFLICT';
    end if;
    v_request := v_existing;
    v_duplicate := true;
  else
    insert into public.driver_time_off_request (
      company_id,
      roster_member_id,
      profile_id,
      requested_by_auth_user_id,
      requested_dates,
      start_date,
      end_date,
      day_count,
      status,
      request_note,
      device_submission_id,
      intent_confirmation
    ) values (
      v_authority.company_id,
      v_authority.roster_member_id,
      v_authority.profile_id,
      auth.uid(),
      v_dates,
      v_dates[1],
      v_dates[cardinality(v_dates)],
      cardinality(v_dates),
      'PENDING',
      v_note,
      p_device_submission_id,
      p_intent_confirmation
    )
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_submission', v_duplicate,
    'request', jsonb_build_object(
      'id', v_request.id,
      'requested_dates', v_request.requested_dates,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'day_count', v_request.day_count,
      'status', v_request.status,
      'request_note', v_request.request_note,
      'submitted_at', v_request.submitted_at,
      'updated_at', v_request.updated_at
    )
  );
end;
$$;

create or replace function public.withdraw_driver_time_off_request(
  p_company_slug text,
  p_request_id uuid,
  p_device_action_id uuid,
  p_intent_confirmation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_request public.driver_time_off_request%rowtype;
  v_duplicate boolean := false;
begin
  if p_request_id is null or p_device_action_id is null then
    raise exception 'TIME_OFF_WITHDRAWAL_ID_REQUIRED';
  end if;
  if p_intent_confirmation is null
     or jsonb_typeof(p_intent_confirmation) <> 'object' then
    raise exception 'INVALID_INTENT_CONFIRMATION';
  end if;

  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select request.* into v_request
  from public.driver_time_off_request request
  where request.id = p_request_id
    and request.company_id = v_authority.company_id
    and request.profile_id = v_authority.profile_id
    and request.roster_member_id = v_authority.roster_member_id
  for update;

  if not found then
    raise exception 'TIME_OFF_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'WITHDRAWN'
     and v_request.withdrawal_device_action_id = p_device_action_id then
    v_duplicate := true;
  elsif v_request.status <> 'PENDING' then
    raise exception 'ONLY_PENDING_TIME_OFF_CAN_BE_WITHDRAWN';
  else
    update public.driver_time_off_request
    set status = 'WITHDRAWN',
        withdrawal_device_action_id = p_device_action_id,
        withdrawal_intent_confirmation = p_intent_confirmation,
        withdrawn_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_action', v_duplicate,
    'request_id', v_request.id,
    'status', v_request.status,
    'withdrawn_at', v_request.withdrawn_at
  );
end;
$$;

create or replace function public.review_driver_time_off_request(
  p_company_slug text,
  p_request_id uuid,
  p_decision text,
  p_manager_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_reviewer_profile_id uuid;
  v_decision text;
  v_note text;
  v_request public.driver_time_off_request%rowtype;
  v_override_id uuid;
  v_inserted_override_id uuid;
  v_terminal_id uuid;
  v_requested_date date;
  v_span_start date;
  v_span_end date;
  v_commit jsonb;
  v_duplicate boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select profile.id into v_reviewer_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;

  v_decision := upper(btrim(coalesce(p_decision, '')));
  if v_decision not in ('APPROVED', 'DENIED') then
    raise exception 'INVALID_TIME_OFF_DECISION';
  end if;
  v_note := nullif(btrim(coalesce(p_manager_note, '')), '');
  if length(v_note) > 500 then
    raise exception 'TIME_OFF_NOTE_MAX_500';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select request.* into v_request
  from public.driver_time_off_request request
  where request.id = p_request_id
    and request.company_id = v_company_id
  for update;

  if not found then
    raise exception 'TIME_OFF_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = v_decision then
    v_duplicate := true;
    v_override_id := v_request.schedule_override_id;
  elsif v_request.status <> 'PENDING' then
    raise exception 'ONLY_PENDING_TIME_OFF_CAN_BE_REVIEWED';
  elsif v_decision = 'DENIED' then
    update public.driver_time_off_request
    set status = 'DENIED',
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_at = now(),
        manager_note = v_note,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    select terminal.terminal_id into v_terminal_id
    from public.company_terminal terminal
    where terminal.company_id = v_company_id
      and terminal.is_active = true
    order by terminal.created_at, terminal.terminal_id
    limit 1;
    v_terminal_id := coalesce(
      v_terminal_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    );

    -- Preserve selected-only requests. Each contiguous run becomes an
    -- override; gaps remain scheduled according to their existing facts.
    foreach v_requested_date in array v_request.requested_dates loop
      if v_span_start is null then
        v_span_start := v_requested_date;
        v_span_end := v_requested_date;
      elsif v_requested_date = v_span_end + 1 then
        v_span_end := v_requested_date;
      else
        insert into public.schedule_override (
          company_id, terminal_id, roster_member_id, override_type,
          start_date, end_date, route_name_override, source_request_id,
          is_active, manager_note
        ) values (
          v_company_id, v_terminal_id, v_request.roster_member_id, 'TIME_OFF',
          v_span_start, v_span_end, null, v_request.id, true, v_note
        ) returning id into v_inserted_override_id;
        v_override_id := coalesce(v_override_id, v_inserted_override_id);
        v_span_start := v_requested_date;
        v_span_end := v_requested_date;
      end if;
    end loop;

    if v_span_start is not null then
      insert into public.schedule_override (
        company_id, terminal_id, roster_member_id, override_type,
        start_date, end_date, route_name_override, source_request_id,
        is_active, manager_note
      ) values (
        v_company_id, v_terminal_id, v_request.roster_member_id, 'TIME_OFF',
        v_span_start, v_span_end, null, v_request.id, true, v_note
      ) returning id into v_inserted_override_id;
      v_override_id := coalesce(v_override_id, v_inserted_override_id);
    end if;

    update public.driver_time_off_request
    set status = 'APPROVED',
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_at = now(),
        manager_note = v_note,
        schedule_override_id = v_override_id,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;

    select public.paint_schedule_day_fact_for_roster_member(
      v_company_id,
      v_request.roster_member_id,
      v_request.start_date,
      70
    ) into v_commit;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_action', v_duplicate,
    'request_id', v_request.id,
    'decision', v_request.status,
    'schedule_override_id', v_override_id,
    'commit', coalesce(v_commit, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.submit_driver_time_off_request(
  text, uuid, date[], text, jsonb
) from public, anon;
grant execute on function public.submit_driver_time_off_request(
  text, uuid, date[], text, jsonb
) to authenticated, service_role;

revoke all on function public.withdraw_driver_time_off_request(
  text, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.withdraw_driver_time_off_request(
  text, uuid, uuid, jsonb
) to authenticated, service_role;

revoke all on function public.review_driver_time_off_request(
  text, uuid, text, text
) from public, anon;
grant execute on function public.review_driver_time_off_request(
  text, uuid, text, text
) to authenticated, service_role;

-- Admin demo requests are intentionally isolated from operational requests and
-- schedule overrides while still exercising the same native workflow.
create table core.mobile_companion_demo_time_off_request (
  id uuid primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  actor_profile_id uuid not null references core.profiles(id) on delete restrict,
  selected_roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  requested_dates date[] not null,
  start_date date not null,
  end_date date not null,
  day_count integer not null check (day_count between 1 and 15),
  status text not null default 'PENDING' check (status in ('PENDING', 'WITHDRAWN')),
  request_note text,
  intent_confirmation jsonb not null default '{}'::jsonb,
  withdrawal_device_action_id uuid,
  withdrawal_intent_confirmation jsonb,
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now()
);

create index mobile_companion_demo_time_off_lookup_idx
  on core.mobile_companion_demo_time_off_request(
    actor_profile_id, company_id, selected_roster_member_id, start_date
  );

create unique index mobile_companion_demo_time_off_withdrawal_action_uidx
  on core.mobile_companion_demo_time_off_request(
    company_id, withdrawal_device_action_id
  )
  where withdrawal_device_action_id is not null;

alter table core.mobile_companion_demo_time_off_request enable row level security;

create policy mobile_companion_demo_time_off_request_select_authorized
on core.mobile_companion_demo_time_off_request
for select to authenticated
using (
  actor_profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

grant select on core.mobile_companion_demo_time_off_request to authenticated;

create or replace function public.submit_mobile_companion_demo_time_off_request(
  p_company_slug text,
  p_roster_member_id uuid,
  p_device_submission_id uuid,
  p_requested_dates date[],
  p_request_note text default null,
  p_intent_confirmation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_timezone text;
  v_dates date[];
  v_today date;
  v_note text;
  v_request core.mobile_companion_demo_time_off_request%rowtype;
  v_duplicate boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid() and profile.profile_status = 'active'
  limit 1;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_actor_profile_id is null
     or v_company_id is null
     or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL'
  ) then
    raise exception 'ELIGIBLE_DEMO_DRIVER_REQUIRED';
  end if;

  select terminal.timezone into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id and terminal.is_active = true
  order by terminal.created_at, terminal.terminal_id
  limit 1;
  v_timezone := coalesce(v_timezone, 'America/New_York');

  select coalesce(array_agg(distinct requested_date order by requested_date), '{}'::date[])
  into v_dates
  from unnest(coalesce(p_requested_dates, '{}'::date[])) requested_date
  where requested_date is not null;

  v_today := (now() at time zone v_timezone)::date;
  v_note := nullif(btrim(coalesce(p_request_note, '')), '');
  if cardinality(v_dates) < 1 then raise exception 'TIME_OFF_DATES_REQUIRED'; end if;
  if cardinality(v_dates) > 15 then raise exception 'TIME_OFF_MAX_15_DAYS'; end if;
  if v_dates[1] < v_today + 10 then raise exception 'TIME_OFF_MIN_10_DAYS_NOTICE'; end if;
  if length(v_note) > 500 then raise exception 'TIME_OFF_NOTE_MAX_500'; end if;
  if p_device_submission_id is null then raise exception 'DEVICE_SUBMISSION_ID_REQUIRED'; end if;
  if p_intent_confirmation is null
     or jsonb_typeof(p_intent_confirmation) <> 'object' then
    raise exception 'INVALID_INTENT_CONFIRMATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_submission_id::text, 0)
  );
  select request.* into v_request
  from core.mobile_companion_demo_time_off_request request
  where request.id = p_device_submission_id;

  if found then
    if v_request.company_id <> v_company_id
       or v_request.actor_profile_id <> v_actor_profile_id
       or v_request.selected_roster_member_id <> p_roster_member_id
       or v_request.requested_dates <> v_dates
       or coalesce(v_request.request_note, '') <> coalesce(v_note, '') then
      raise exception 'TIME_OFF_SUBMISSION_ID_CONFLICT';
    end if;
    v_duplicate := true;
  else
    insert into core.mobile_companion_demo_time_off_request (
      id, company_id, actor_profile_id, selected_roster_member_id,
      requested_dates, start_date, end_date, day_count, request_note,
      intent_confirmation
    ) values (
      p_device_submission_id, v_company_id, v_actor_profile_id,
      p_roster_member_id, v_dates, v_dates[1],
      v_dates[cardinality(v_dates)], cardinality(v_dates), v_note,
      p_intent_confirmation
    ) returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_submission', v_duplicate,
    'request', to_jsonb(v_request) - 'company_id' - 'actor_profile_id'
  );
end;
$$;

create or replace function public.withdraw_mobile_companion_demo_time_off_request(
  p_company_slug text,
  p_roster_member_id uuid,
  p_request_id uuid,
  p_device_action_id uuid,
  p_intent_confirmation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_request core.mobile_companion_demo_time_off_request%rowtype;
  v_duplicate boolean := false;
begin
  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid() and profile.profile_status = 'active'
  limit 1;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_actor_profile_id is null
     or v_company_id is null
     or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;
  if p_device_action_id is null then raise exception 'TIME_OFF_WITHDRAWAL_ID_REQUIRED'; end if;
  if p_intent_confirmation is null
     or jsonb_typeof(p_intent_confirmation) <> 'object' then
    raise exception 'INVALID_INTENT_CONFIRMATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  select request.* into v_request
  from core.mobile_companion_demo_time_off_request request
  where request.id = p_request_id
    and request.company_id = v_company_id
    and request.actor_profile_id = v_actor_profile_id
    and request.selected_roster_member_id = p_roster_member_id
  for update;
  if not found then raise exception 'TIME_OFF_REQUEST_NOT_FOUND'; end if;

  if v_request.status = 'WITHDRAWN'
     and v_request.withdrawal_device_action_id = p_device_action_id then
    v_duplicate := true;
  elsif v_request.status <> 'PENDING' then
    raise exception 'ONLY_PENDING_TIME_OFF_CAN_BE_WITHDRAWN';
  else
    update core.mobile_companion_demo_time_off_request
    set status = 'WITHDRAWN',
        withdrawal_device_action_id = p_device_action_id,
        withdrawal_intent_confirmation = p_intent_confirmation,
        withdrawn_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_action', v_duplicate,
    'request_id', v_request.id,
    'status', v_request.status,
    'withdrawn_at', v_request.withdrawn_at
  );
end;
$$;

create or replace function public.mobile_companion_demo_time_off_requests(
  p_company_slug text,
  p_roster_member_id uuid
)
returns table (
  id uuid,
  requested_dates date[],
  start_date date,
  end_date date,
  day_count integer,
  status text,
  request_note text,
  manager_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actor_profile_id uuid;
begin
  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid() and profile.profile_status = 'active'
  limit 1;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_actor_profile_id is null
     or v_company_id is null
     or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;

  return query
  select
    request.id,
    request.requested_dates,
    request.start_date,
    request.end_date,
    request.day_count,
    request.status,
    request.request_note,
    null::text,
    request.submitted_at,
    null::timestamptz,
    request.updated_at
  from core.mobile_companion_demo_time_off_request request
  where request.company_id = v_company_id
    and request.actor_profile_id = v_actor_profile_id
    and request.selected_roster_member_id = p_roster_member_id
  order by request.start_date, request.submitted_at;
end;
$$;

revoke all on function public.submit_mobile_companion_demo_time_off_request(
  text, uuid, uuid, date[], text, jsonb
) from public, anon;
grant execute on function public.submit_mobile_companion_demo_time_off_request(
  text, uuid, uuid, date[], text, jsonb
) to authenticated, service_role;

revoke all on function public.withdraw_mobile_companion_demo_time_off_request(
  text, uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.withdraw_mobile_companion_demo_time_off_request(
  text, uuid, uuid, uuid, jsonb
) to authenticated, service_role;

revoke all on function public.mobile_companion_demo_time_off_requests(text, uuid)
  from public, anon;
grant execute on function public.mobile_companion_demo_time_off_requests(text, uuid)
  to authenticated, service_role;

commit;
