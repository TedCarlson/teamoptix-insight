begin;

create table core.driver_tracking_session (
  id uuid primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid not null references core.profiles(id) on delete restrict,
  person_id uuid null,
  roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  service_date date not null,
  source text not null default 'MOBILE_COMPANION',
  device_started_at timestamptz not null,
  device_ended_at timestamptz null,
  session_status text not null default 'OPEN',
  session_payload jsonb not null default '{}'::jsonb,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_tracking_session_source_ck
    check (source = 'MOBILE_COMPANION'),
  constraint driver_tracking_session_status_ck
    check (session_status in ('OPEN', 'CLOSED')),
  constraint driver_tracking_session_bounds_ck
    check (
      (session_status = 'OPEN' and device_ended_at is null)
      or
      (
        session_status = 'CLOSED'
        and device_ended_at is not null
        and device_ended_at >= device_started_at
      )
    )
);

comment on table core.driver_tracking_session is
  'Duty-scoped Mobile Companion tracking envelope. It is device evidence and does not establish payroll, vehicle, carrier, or delivery truth.';

create index driver_tracking_session_company_date_idx
  on core.driver_tracking_session(company_id, service_date, device_started_at);

create index driver_tracking_session_roster_date_idx
  on core.driver_tracking_session(roster_member_id, service_date, device_started_at);

create table core.driver_breadcrumb_batch (
  id uuid primary key,
  tracking_session_id uuid not null references core.driver_tracking_session(id) on delete restrict,
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid not null references core.profiles(id) on delete restrict,
  roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  source text not null default 'MOBILE_COMPANION',
  device_created_at timestamptz not null,
  payload_digest text not null,
  submitted_point_count integer not null,
  accepted_point_count integer not null default 0,
  duplicate_point_count integer not null default 0,
  rejected_point_count integer not null default 0,
  batch_status text not null,
  acknowledgment jsonb not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint driver_breadcrumb_batch_source_ck
    check (source = 'MOBILE_COMPANION'),
  constraint driver_breadcrumb_batch_status_ck
    check (batch_status in ('ACKNOWLEDGED', 'PARTIAL', 'REJECTED')),
  constraint driver_breadcrumb_batch_count_ck
    check (
      submitted_point_count between 1 and 100
      and accepted_point_count >= 0
      and duplicate_point_count >= 0
      and rejected_point_count >= 0
      and accepted_point_count + duplicate_point_count + rejected_point_count
        = submitted_point_count
    ),
  constraint driver_breadcrumb_batch_digest_ck
    check (payload_digest ~ '^[0-9a-f]{64}$')
);

comment on table core.driver_breadcrumb_batch is
  'Immutable Mobile Companion synchronization batch. A repeated id and payload returns the persisted acknowledgment; changed content is rejected.';

create index driver_breadcrumb_batch_session_received_idx
  on core.driver_breadcrumb_batch(tracking_session_id, received_at);

create index driver_breadcrumb_batch_company_received_idx
  on core.driver_breadcrumb_batch(company_id, received_at);

alter table core.driver_breadcrumb_point
  add column tracking_session_id uuid null
    references core.driver_tracking_session(id) on delete restrict,
  add column breadcrumb_batch_id uuid null
    references core.driver_breadcrumb_batch(id) on delete restrict
    deferrable initially deferred,
  add column capture_method text null;

alter table core.driver_breadcrumb_point
  add constraint driver_breadcrumb_point_latitude_ck
    check (latitude between -90 and 90) not valid,
  add constraint driver_breadcrumb_point_longitude_ck
    check (longitude between -180 and 180) not valid,
  add constraint driver_breadcrumb_point_accuracy_ck
    check (accuracy_meters is null or accuracy_meters >= 0) not valid,
  add constraint driver_breadcrumb_point_capture_method_ck
    check (
      capture_method is null
      or capture_method in ('FOREGROUND_GPS', 'SYNTHETIC_TEST')
    ),
  add constraint driver_breadcrumb_point_mobile_contract_ck
    check (
      source <> 'MOBILE_COMPANION'
      or (
        tracking_session_id is not null
        and breadcrumb_batch_id is not null
        and device_captured_at is not null
        and tracking_context = 'DUTY_TRACKING'
        and capture_method in ('FOREGROUND_GPS', 'SYNTHETIC_TEST')
      )
    ) not valid;

comment on column core.driver_breadcrumb_point.tracking_session_id is
  'Required duty-session envelope for MOBILE_COMPANION observations.';
comment on column core.driver_breadcrumb_point.breadcrumb_batch_id is
  'Device-generated immutable synchronization batch for MOBILE_COMPANION observations.';
comment on column core.driver_breadcrumb_point.capture_method is
  'Foreground GPS or synthetic test capture only in MC-1; no background capture method is accepted.';

create index driver_breadcrumb_point_session_device_idx
  on core.driver_breadcrumb_point(tracking_session_id, device_captured_at)
  where tracking_session_id is not null;

create index driver_breadcrumb_point_batch_idx
  on core.driver_breadcrumb_point(breadcrumb_batch_id)
  where breadcrumb_batch_id is not null;

alter table core.driver_tracking_session enable row level security;
alter table core.driver_breadcrumb_batch enable row level security;

create policy driver_tracking_session_select_authorized
on core.driver_tracking_session
for select to authenticated
using (
  profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

create policy driver_breadcrumb_batch_select_authorized
on core.driver_breadcrumb_batch
for select to authenticated
using (
  profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

grant select on core.driver_tracking_session to authenticated;
grant select on core.driver_breadcrumb_batch to authenticated;

-- Mobile provenance cannot be governed while an authenticated caller may
-- insert an arbitrary source, company, or roster directly. Browser and mobile
-- writers use the server-owned RPCs below instead.
revoke insert on table core.driver_breadcrumb_point from authenticated;
drop policy if exists driver_breadcrumb_point_insert_self
  on core.driver_breadcrumb_point;

drop policy if exists driver_breadcrumb_point_select_access
  on core.driver_breadcrumb_point;

create policy driver_breadcrumb_point_select_authorized
on core.driver_breadcrumb_point
for select to authenticated
using (
  profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

create or replace function core.resolve_authenticated_driver_authority(
  p_company_slug text
)
returns table (
  company_id uuid,
  profile_id uuid,
  person_id uuid,
  roster_member_id uuid,
  terminal_timezone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_profile_id uuid;
  v_roster_count integer;
  v_roster_member_id uuid;
  v_person_id uuid;
  v_timezone text;
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
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_MEMBERSHIP_REQUIRED';
  end if;

  select count(*)
  into v_roster_count
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.profile_id = v_profile_id
    and roster.employment_status in ('Active', 'Trainee')
    and roster.roster_record_kind = 'INTERNAL';

  if v_roster_count = 0 then
    raise exception 'ELIGIBLE_DRIVER_ROSTER_REQUIRED';
  end if;

  if v_roster_count <> 1 then
    raise exception 'AMBIGUOUS_DRIVER_ROSTER';
  end if;

  select roster.id, roster.person_id
  into v_roster_member_id, v_person_id
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.profile_id = v_profile_id
    and roster.employment_status in ('Active', 'Trainee')
    and roster.roster_record_kind = 'INTERNAL';

  select terminal.timezone
  into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
  order by terminal.created_at, terminal.terminal_id
  limit 1;

  if nullif(btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;

  return query
  select
    v_company_id,
    v_profile_id,
    v_person_id,
    v_roster_member_id,
    v_timezone;
end;
$$;

revoke all on function core.resolve_authenticated_driver_authority(text)
  from public, anon, authenticated;

create or replace function public.record_driver_web_activity(
  p_company_slug text,
  p_event_type text,
  p_device_occurred_at timestamptz default null,
  p_event_payload jsonb default '{}'::jsonb,
  p_location jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_event_type text;
  v_device_time timestamptz;
  v_service_date date;
  v_event core.driver_activity_event%rowtype;
  v_latitude numeric;
  v_longitude numeric;
  v_accuracy numeric;
  v_location_time timestamptz;
  v_breadcrumb_recorded boolean := false;
begin
  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  v_event_type := upper(btrim(coalesce(p_event_type, '')));

  if not exists (
    select 1
    from core.driver_activity_event_type event_type
    where event_type.event_type = v_event_type
      and event_type.is_active = true
      and event_type.is_driver_action = true
  ) then
    raise exception 'UNKNOWN_OR_INACTIVE_DRIVER_EVENT_TYPE';
  end if;

  if p_event_payload is null or jsonb_typeof(p_event_payload) <> 'object' then
    raise exception 'EVENT_PAYLOAD_MUST_BE_AN_OBJECT';
  end if;

  v_device_time := coalesce(p_device_occurred_at, now());
  v_service_date := (v_device_time at time zone v_authority.terminal_timezone)::date;

  insert into core.driver_activity_event (
    company_id,
    profile_id,
    person_id,
    roster_member_id,
    service_date,
    event_type,
    device_occurred_at,
    source,
    event_payload
  )
  values (
    v_authority.company_id,
    v_authority.profile_id,
    v_authority.person_id,
    v_authority.roster_member_id,
    v_service_date,
    v_event_type,
    v_device_time,
    'DRIVER_WEB',
    p_event_payload
  )
  returning * into v_event;

  if p_location is not null and p_location <> 'null'::jsonb then
    if jsonb_typeof(p_location) <> 'object' then
      raise exception 'LOCATION_MUST_BE_AN_OBJECT';
    end if;

    v_latitude := nullif(p_location->>'latitude', '')::numeric;
    v_longitude := nullif(p_location->>'longitude', '')::numeric;
    v_accuracy := nullif(p_location->>'accuracy_meters', '')::numeric;
    v_location_time := coalesce(
      nullif(p_location->>'device_captured_at', '')::timestamptz,
      v_device_time
    );

    if v_latitude is null or v_latitude not between -90 and 90 then
      raise exception 'INVALID_LATITUDE';
    end if;

    if v_longitude is null or v_longitude not between -180 and 180 then
      raise exception 'INVALID_LONGITUDE';
    end if;

    if v_accuracy is not null and v_accuracy < 0 then
      raise exception 'INVALID_ACCURACY';
    end if;

    insert into core.driver_breadcrumb_point (
      company_id,
      profile_id,
      person_id,
      roster_member_id,
      service_date,
      device_captured_at,
      latitude,
      longitude,
      accuracy_meters,
      source,
      tracking_context,
      source_activity_event_id,
      breadcrumb_payload
    )
    values (
      v_authority.company_id,
      v_authority.profile_id,
      v_authority.person_id,
      v_authority.roster_member_id,
      v_service_date,
      v_location_time,
      v_latitude,
      v_longitude,
      v_accuracy,
      'DRIVER_WEB',
      v_event_type,
      v_event.id,
      jsonb_build_object(
        'event_type', v_event_type,
        'source_surface', 'driver_home',
        'evidence_class', 'DEVICE_LOCATION_OBSERVATION'
      )
    );

    v_breadcrumb_recorded := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'service_date', v_event.service_date,
      'occurred_at', v_event.occurred_at
    ),
    'breadcrumb_recorded', v_breadcrumb_recorded
  );
end;
$$;

revoke all on function public.record_driver_web_activity(
  text, text, timestamptz, jsonb, jsonb
) from public, anon;

grant execute on function public.record_driver_web_activity(
  text, text, timestamptz, jsonb, jsonb
) to authenticated, service_role;

create or replace function public.sync_driver_tracking_session(
  p_company_slug text,
  p_session jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_session_id uuid;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_service_date date;
  v_existing core.driver_tracking_session%rowtype;
  v_status text;
  v_metadata jsonb;
  v_duplicate boolean := false;
begin
  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception 'SESSION_MUST_BE_AN_OBJECT';
  end if;

  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  begin
    v_session_id := nullif(p_session->>'session_id', '')::uuid;
    v_started_at := nullif(p_session->>'device_started_at', '')::timestamptz;
    v_ended_at := nullif(p_session->>'device_ended_at', '')::timestamptz;
  exception when others then
    raise exception 'MALFORMED_SESSION';
  end;

  if v_session_id is null or v_started_at is null then
    raise exception 'SESSION_ID_AND_START_REQUIRED';
  end if;

  if v_started_at > now() + interval '15 minutes'
     or v_started_at < now() - interval '30 days' then
    raise exception 'SESSION_START_OUT_OF_RANGE';
  end if;

  if v_ended_at is not null and (
    v_ended_at < v_started_at
    or v_ended_at > v_started_at + interval '24 hours'
    or v_ended_at > now() + interval '15 minutes'
  ) then
    raise exception 'SESSION_END_OUT_OF_RANGE';
  end if;

  v_status := case when v_ended_at is null then 'OPEN' else 'CLOSED' end;
  v_service_date := (v_started_at at time zone v_authority.terminal_timezone)::date;
  v_metadata := coalesce(p_session->'metadata', '{}'::jsonb);

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'SESSION_METADATA_MUST_BE_AN_OBJECT';
  end if;

  v_metadata := jsonb_build_object(
    'device_metadata', v_metadata,
    'evidence_class', 'DEVICE_LOCATION_OBSERVATION',
    'truth_status', 'OBSERVATION_ONLY'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_session_id::text, 0)
  );

  select * into v_existing
  from core.driver_tracking_session session
  where session.id = v_session_id;

  if found then
    if v_existing.company_id <> v_authority.company_id
       or v_existing.profile_id <> v_authority.profile_id
       or v_existing.roster_member_id <> v_authority.roster_member_id
       or v_existing.device_started_at <> v_started_at then
      raise exception 'SESSION_ID_CONFLICT';
    end if;

    if v_existing.device_ended_at is not null
       and v_ended_at is not null
       and v_existing.device_ended_at <> v_ended_at then
      raise exception 'SESSION_END_CONFLICT';
    end if;

    update core.driver_tracking_session
    set
      device_ended_at = coalesce(device_ended_at, v_ended_at),
      session_status = case
        when coalesce(device_ended_at, v_ended_at) is null then 'OPEN'
        else 'CLOSED'
      end,
      session_payload = session_payload || v_metadata,
      last_received_at = now(),
      updated_at = now()
    where id = v_session_id
    returning * into v_existing;

    v_duplicate := true;
  else
    insert into core.driver_tracking_session (
      id,
      company_id,
      profile_id,
      person_id,
      roster_member_id,
      service_date,
      source,
      device_started_at,
      device_ended_at,
      session_status,
      session_payload
    )
    values (
      v_session_id,
      v_authority.company_id,
      v_authority.profile_id,
      v_authority.person_id,
      v_authority.roster_member_id,
      v_service_date,
      'MOBILE_COMPANION',
      v_started_at,
      v_ended_at,
      v_status,
      v_metadata
    )
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_existing.id,
    'session_status', v_existing.session_status,
    'service_date', v_existing.service_date,
    'duplicate_session', v_duplicate,
    'server_received_at', v_existing.last_received_at
  );
end;
$$;

revoke all on function public.sync_driver_tracking_session(text, jsonb)
  from public, anon;
grant execute on function public.sync_driver_tracking_session(text, jsonb)
  to authenticated, service_role;

create or replace function public.sync_driver_breadcrumb_batch(
  p_tracking_session_id uuid,
  p_batch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session core.driver_tracking_session%rowtype;
  v_authority record;
  v_company_slug text;
  v_batch_id uuid;
  v_device_created_at timestamptz;
  v_points jsonb;
  v_point jsonb;
  v_point_id uuid;
  v_point_time timestamptz;
  v_latitude numeric;
  v_longitude numeric;
  v_accuracy numeric;
  v_capture_method text;
  v_existing_point core.driver_breadcrumb_point%rowtype;
  v_existing_batch core.driver_breadcrumb_batch%rowtype;
  v_digest text;
  v_submitted integer;
  v_accepted jsonb := '[]'::jsonb;
  v_duplicates jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_ack jsonb;
  v_status text;
begin
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    raise exception 'BATCH_MUST_BE_AN_OBJECT';
  end if;

  select session.* into v_session
  from core.driver_tracking_session session
  where session.id = p_tracking_session_id;

  if not found then
    raise exception 'TRACKING_SESSION_NOT_FOUND';
  end if;

  select company.company_slug into v_company_slug
  from core.companies company
  where company.id = v_session.company_id;

  select * into v_authority
  from core.resolve_authenticated_driver_authority(v_company_slug);

  if v_session.company_id <> v_authority.company_id
     or v_session.profile_id <> v_authority.profile_id
     or v_session.roster_member_id <> v_authority.roster_member_id then
    raise exception 'TRACKING_SESSION_AUTHORITY_MISMATCH';
  end if;

  begin
    v_batch_id := nullif(p_batch->>'batch_id', '')::uuid;
    v_device_created_at := nullif(p_batch->>'device_created_at', '')::timestamptz;
  exception when others then
    raise exception 'MALFORMED_BATCH';
  end;

  v_points := p_batch->'points';

  if v_batch_id is null or v_device_created_at is null then
    raise exception 'BATCH_ID_AND_CREATED_TIME_REQUIRED';
  end if;

  if v_device_created_at > now() + interval '15 minutes'
     or v_device_created_at < v_session.device_started_at - interval '15 minutes' then
    raise exception 'BATCH_CREATED_TIME_OUT_OF_RANGE';
  end if;

  if v_points is null or jsonb_typeof(v_points) <> 'array' then
    raise exception 'BATCH_POINTS_MUST_BE_AN_ARRAY';
  end if;

  v_submitted := jsonb_array_length(v_points);
  if v_submitted < 1 or v_submitted > 100 then
    raise exception 'BATCH_POINT_COUNT_OUT_OF_RANGE';
  end if;

  v_digest := encode(extensions.digest(p_batch::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_batch_id::text, 0)
  );

  select * into v_existing_batch
  from core.driver_breadcrumb_batch batch
  where batch.id = v_batch_id;

  if found then
    if v_existing_batch.tracking_session_id <> p_tracking_session_id
       or v_existing_batch.company_id <> v_authority.company_id
       or v_existing_batch.profile_id <> v_authority.profile_id
       or v_existing_batch.payload_digest <> v_digest then
      raise exception 'BATCH_ID_CONFLICT';
    end if;

    return jsonb_set(
      v_existing_batch.acknowledgment,
      '{duplicate_batch}',
      'true'::jsonb,
      true
    );
  end if;

  for v_point in select value from jsonb_array_elements(v_points)
  loop
    if jsonb_typeof(v_point) <> 'object' then
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object(
          'point_id', null,
          'code', 'POINT_MUST_BE_AN_OBJECT',
          'retryable', false
        )
      );
      continue;
    end if;

    begin
      v_point_id := nullif(v_point->>'point_id', '')::uuid;
      v_point_time := nullif(v_point->>'device_captured_at', '')::timestamptz;
      v_latitude := nullif(v_point->>'latitude', '')::numeric;
      v_longitude := nullif(v_point->>'longitude', '')::numeric;
      v_accuracy := nullif(v_point->>'accuracy_meters', '')::numeric;
      v_capture_method := upper(btrim(coalesce(v_point->>'capture_method', '')));
    exception when others then
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object(
          'point_id', v_point->>'point_id',
          'code', 'MALFORMED_POINT',
          'retryable', false
        )
      );
      continue;
    end;

    if v_point_id is null or v_point_time is null
       or v_latitude is null or v_latitude not between -90 and 90
       or v_longitude is null or v_longitude not between -180 and 180
       or (v_accuracy is not null and v_accuracy < 0)
       or v_capture_method not in ('FOREGROUND_GPS', 'SYNTHETIC_TEST') then
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object(
          'point_id', v_point_id,
          'code', 'INVALID_POINT',
          'retryable', false
        )
      );
      continue;
    end if;

    if v_point_time < v_session.device_started_at
       or v_point_time > coalesce(
         v_session.device_ended_at,
         now() + interval '15 minutes'
       ) then
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object(
          'point_id', v_point_id,
          'code', 'POINT_OUTSIDE_DUTY_SESSION',
          'retryable', false
        )
      );
      continue;
    end if;

    select * into v_existing_point
    from core.driver_breadcrumb_point point
    where point.id = v_point_id;

    if found then
      if v_existing_point.company_id = v_authority.company_id
         and v_existing_point.profile_id = v_authority.profile_id
         and v_existing_point.tracking_session_id = p_tracking_session_id
         and v_existing_point.device_captured_at = v_point_time
         and v_existing_point.latitude = v_latitude
         and v_existing_point.longitude = v_longitude
         and v_existing_point.accuracy_meters is not distinct from v_accuracy
         and v_existing_point.capture_method = v_capture_method then
        v_duplicates := v_duplicates || jsonb_build_array(v_point_id);
      else
        v_rejected := v_rejected || jsonb_build_array(
          jsonb_build_object(
            'point_id', v_point_id,
            'code', 'POINT_ID_CONFLICT',
            'retryable', false
          )
        );
      end if;
      continue;
    end if;

    begin
      insert into core.driver_breadcrumb_point (
        id,
        company_id,
        profile_id,
        person_id,
        roster_member_id,
        service_date,
        device_captured_at,
        latitude,
        longitude,
        accuracy_meters,
        source,
        tracking_context,
        breadcrumb_payload,
        tracking_session_id,
        breadcrumb_batch_id,
        capture_method
      )
      values (
        v_point_id,
        v_authority.company_id,
        v_authority.profile_id,
        v_authority.person_id,
        v_authority.roster_member_id,
        v_session.service_date,
        v_point_time,
        v_latitude,
        v_longitude,
        v_accuracy,
        'MOBILE_COMPANION',
        'DUTY_TRACKING',
        jsonb_build_object(
          'evidence_class', 'DEVICE_LOCATION_OBSERVATION',
          'truth_status', 'OBSERVATION_ONLY',
          'capture_method', v_capture_method,
          'tracking_session_id', p_tracking_session_id,
          'breadcrumb_batch_id', v_batch_id
        ),
        p_tracking_session_id,
        v_batch_id,
        v_capture_method
      );

      v_accepted := v_accepted || jsonb_build_array(v_point_id);
    exception when unique_violation then
      select * into v_existing_point
      from core.driver_breadcrumb_point point
      where point.id = v_point_id;

      if found
         and v_existing_point.company_id = v_authority.company_id
         and v_existing_point.profile_id = v_authority.profile_id
         and v_existing_point.tracking_session_id = p_tracking_session_id
         and v_existing_point.device_captured_at = v_point_time
         and v_existing_point.latitude = v_latitude
         and v_existing_point.longitude = v_longitude
         and v_existing_point.accuracy_meters is not distinct from v_accuracy
         and v_existing_point.capture_method = v_capture_method then
        v_duplicates := v_duplicates || jsonb_build_array(v_point_id);
      else
        v_rejected := v_rejected || jsonb_build_array(
          jsonb_build_object(
            'point_id', v_point_id,
            'code', 'POINT_ID_CONFLICT',
            'retryable', false
          )
        );
      end if;
    end;
  end loop;

  v_status := case
    when jsonb_array_length(v_rejected) = 0 then 'ACKNOWLEDGED'
    when jsonb_array_length(v_accepted) + jsonb_array_length(v_duplicates) = 0
      then 'REJECTED'
    else 'PARTIAL'
  end;

  v_ack := jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'batch_status', v_status,
    'duplicate_batch', false,
    'accepted_point_ids', v_accepted,
    'duplicate_point_ids', v_duplicates,
    'rejected', v_rejected,
    'server_received_at', now()
  );

  insert into core.driver_breadcrumb_batch (
    id,
    tracking_session_id,
    company_id,
    profile_id,
    roster_member_id,
    source,
    device_created_at,
    payload_digest,
    submitted_point_count,
    accepted_point_count,
    duplicate_point_count,
    rejected_point_count,
    batch_status,
    acknowledgment
  )
  values (
    v_batch_id,
    p_tracking_session_id,
    v_authority.company_id,
    v_authority.profile_id,
    v_authority.roster_member_id,
    'MOBILE_COMPANION',
    v_device_created_at,
    v_digest,
    v_submitted,
    jsonb_array_length(v_accepted),
    jsonb_array_length(v_duplicates),
    jsonb_array_length(v_rejected),
    v_status,
    v_ack
  );

  return v_ack;
end;
$$;

revoke all on function public.sync_driver_breadcrumb_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.sync_driver_breadcrumb_batch(uuid, jsonb)
  to authenticated, service_role;

update platform.switchboard
set
  status = 'IMPLEMENTED',
  source = 'PLATFORM',
  notes = concat_ws(
    E'\n\n',
    nullif(btrim(notes), ''),
    'MC-1 implementation present. Remains non-ACTIVE pending privacy, retention, device-parity, and rollout acceptance.'
  )
where library_key in (
  'core.driver_tracking_session',
  'core.driver_breadcrumb_batch',
  'core.driver_breadcrumb_point'
);

commit;
