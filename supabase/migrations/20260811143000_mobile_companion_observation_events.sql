begin;

-- Mobile Companion is an append-only device evidence producer. Each user
-- action and each location fix is retained independently. Server processing
-- may later classify or project these observations, but ingestion never
-- rewrites the device account of what occurred.
create table core.mobile_companion_observation_event (
  id uuid primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid not null references core.profiles(id) on delete restrict,
  person_id uuid null,
  roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  service_date date not null,
  tracking_session_id uuid not null,
  event_type text not null,
  device_occurred_at timestamptz not null,
  latitude numeric(10,7) null,
  longitude numeric(10,7) null,
  accuracy_meters numeric(10,2) null,
  capture_method text null,
  payload jsonb not null,
  payload_digest text not null,
  server_disposition text not null default 'UNREVIEWED',
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mobile_companion_observation_event_type_ck check (
    event_type in ('DUTY_STARTED', 'DUTY_STOPPED', 'LOCATION_CAPTURE')
  ),
  constraint mobile_companion_observation_event_location_ck check (
    (
      event_type = 'LOCATION_CAPTURE'
      and latitude between -90 and 90
      and longitude between -180 and 180
      and (accuracy_meters is null or accuracy_meters >= 0)
      and capture_method in ('FOREGROUND_GPS', 'SYNTHETIC_TEST')
    )
    or
    (
      event_type in ('DUTY_STARTED', 'DUTY_STOPPED')
      and latitude is null
      and longitude is null
      and accuracy_meters is null
      and capture_method is null
    )
  ),
  constraint mobile_companion_observation_event_payload_ck check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint mobile_companion_observation_event_digest_ck check (
    payload_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint mobile_companion_observation_event_disposition_ck check (
    server_disposition in ('UNREVIEWED', 'ACCEPTED', 'IGNORED', 'SUPERSEDED')
  )
);

comment on table core.mobile_companion_observation_event is
  'Immutable per-action Mobile Companion observations. Rows are device evidence only and do not automatically establish payroll, vehicle, carrier, delivery, or other operational truth.';
comment on column core.mobile_companion_observation_event.server_disposition is
  'Server-owned classification. The mobile client always submits UNREVIEWED evidence and never decides whether an observation is authoritative.';

create index mobile_companion_observation_company_date_idx
  on core.mobile_companion_observation_event(company_id, service_date, device_occurred_at);
create index mobile_companion_observation_roster_date_idx
  on core.mobile_companion_observation_event(roster_member_id, service_date, device_occurred_at);
create index mobile_companion_observation_session_idx
  on core.mobile_companion_observation_event(tracking_session_id, device_occurred_at);
create index mobile_companion_observation_unreviewed_idx
  on core.mobile_companion_observation_event(company_id, created_at)
  where server_disposition = 'UNREVIEWED';

alter table core.mobile_companion_observation_event enable row level security;

create policy mobile_companion_observation_event_select_authorized
on core.mobile_companion_observation_event
for select to authenticated
using (
  profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

grant select on core.mobile_companion_observation_event to authenticated;

create or replace function public.sync_mobile_companion_observation_event(
  p_company_slug text,
  p_event_id uuid,
  p_event_type text,
  p_device_occurred_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_event_type text;
  v_tracking_session_id uuid;
  v_service_date date;
  v_latitude numeric;
  v_longitude numeric;
  v_accuracy numeric;
  v_capture_method text;
  v_digest text;
  v_existing core.mobile_companion_observation_event%rowtype;
  v_duplicate boolean := false;
begin
  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  v_event_type := upper(btrim(coalesce(p_event_type, '')));
  if v_event_type not in ('DUTY_STARTED', 'DUTY_STOPPED', 'LOCATION_CAPTURE') then
    raise exception 'INVALID_MOBILE_OBSERVATION_EVENT_TYPE';
  end if;

  if p_event_id is null
     or p_device_occurred_at is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_MOBILE_OBSERVATION_EVENT';
  end if;

  begin
    v_tracking_session_id := nullif(p_payload->>'tracking_session_id', '')::uuid;
    if v_event_type = 'LOCATION_CAPTURE' then
      v_latitude := nullif(p_payload->>'latitude', '')::numeric;
      v_longitude := nullif(p_payload->>'longitude', '')::numeric;
      v_accuracy := nullif(p_payload->>'accuracy_meters', '')::numeric;
      v_capture_method := upper(btrim(coalesce(p_payload->>'capture_method', '')));
    end if;
  exception when others then
    raise exception 'MALFORMED_MOBILE_OBSERVATION_EVENT';
  end;

  if v_tracking_session_id is null then
    raise exception 'TRACKING_SESSION_ID_REQUIRED';
  end if;

  if v_event_type = 'LOCATION_CAPTURE' and (
    v_latitude is null or v_latitude not between -90 and 90
    or v_longitude is null or v_longitude not between -180 and 180
    or (v_accuracy is not null and v_accuracy < 0)
    or v_capture_method not in ('FOREGROUND_GPS', 'SYNTHETIC_TEST')
  ) then
    raise exception 'INVALID_LOCATION_OBSERVATION';
  end if;

  v_service_date := (
    p_device_occurred_at at time zone v_authority.terminal_timezone
  )::date;
  v_digest := encode(
    extensions.digest(
      jsonb_build_object(
        'event_type', v_event_type,
        'device_occurred_at', p_device_occurred_at,
        'payload', p_payload
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text, 0)
  );

  select event.* into v_existing
  from core.mobile_companion_observation_event event
  where event.id = p_event_id;

  if found then
    if v_existing.company_id <> v_authority.company_id
       or v_existing.profile_id <> v_authority.profile_id
       or v_existing.roster_member_id <> v_authority.roster_member_id
       or v_existing.event_type <> v_event_type
       or v_existing.device_occurred_at <> p_device_occurred_at
       or v_existing.payload_digest <> v_digest then
      raise exception 'MOBILE_OBSERVATION_EVENT_ID_CONFLICT';
    end if;

    update core.mobile_companion_observation_event
    set last_received_at = now()
    where id = p_event_id
    returning * into v_existing;
    v_duplicate := true;
  else
    insert into core.mobile_companion_observation_event (
      id,
      company_id,
      profile_id,
      person_id,
      roster_member_id,
      service_date,
      tracking_session_id,
      event_type,
      device_occurred_at,
      latitude,
      longitude,
      accuracy_meters,
      capture_method,
      payload,
      payload_digest
    ) values (
      p_event_id,
      v_authority.company_id,
      v_authority.profile_id,
      v_authority.person_id,
      v_authority.roster_member_id,
      v_service_date,
      v_tracking_session_id,
      v_event_type,
      p_device_occurred_at,
      v_latitude,
      v_longitude,
      v_accuracy,
      v_capture_method,
      p_payload || jsonb_build_object(
        'evidence_class', 'DEVICE_LOCATION_OBSERVATION',
        'truth_status', 'OBSERVATION_ONLY'
      ),
      v_digest
    )
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_existing.id,
    'event_type', v_existing.event_type,
    'server_disposition', v_existing.server_disposition,
    'duplicate_event', v_duplicate,
    'server_received_at', v_existing.last_received_at
  );
end;
$$;

revoke all on function public.sync_mobile_companion_observation_event(
  text, uuid, text, timestamptz, jsonb
) from public, anon;
grant execute on function public.sync_mobile_companion_observation_event(
  text, uuid, text, timestamptz, jsonb
) to authenticated, service_role;

alter table core.mobile_companion_demo_event
  drop constraint mobile_companion_demo_event_type_ck;
alter table core.mobile_companion_demo_event
  add constraint mobile_companion_demo_event_type_ck check (
    event_type in (
      'DUTY_SESSION',
      'BREADCRUMB_BATCH',
      'DUTY_STARTED',
      'DUTY_STOPPED',
      'LOCATION_CAPTURE',
      'MESSAGE_ACKNOWLEDGMENT',
      'INSPECTION_SUBMISSION'
    )
  );

create or replace function public.sync_mobile_companion_demo_event(
  p_company_slug text,
  p_roster_member_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_event_type text;
  v_effective_event_id uuid;
  v_digest text;
  v_existing core.mobile_companion_demo_event%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL'
  ) then
    raise exception 'ELIGIBLE_DEMO_DRIVER_REQUIRED';
  end if;

  v_event_type := upper(btrim(coalesce(p_event_type, '')));
  if v_event_type not in (
    'DUTY_SESSION',
    'BREADCRUMB_BATCH',
    'DUTY_STARTED',
    'DUTY_STOPPED',
    'LOCATION_CAPTURE',
    'MESSAGE_ACKNOWLEDGMENT',
    'INSPECTION_SUBMISSION'
  ) then
    raise exception 'INVALID_DEMO_EVENT_TYPE';
  end if;

  if p_event_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_DEMO_EVENT';
  end if;

  v_effective_event_id := case
    when v_event_type = 'MESSAGE_ACKNOWLEDGMENT' then (
      substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 1, 8)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 9, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 13, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 17, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 21, 12)
    )::uuid
    else p_event_id
  end;

  v_digest := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_effective_event_id::text, 0)
  );

  select event.* into v_existing
  from core.mobile_companion_demo_event event
  where event.id = v_effective_event_id;

  if found then
    if v_existing.company_id <> v_company_id
       or v_existing.actor_profile_id <> v_actor_profile_id
       or v_existing.selected_roster_member_id <> p_roster_member_id
       or v_existing.event_type <> v_event_type
       or v_existing.payload_digest <> v_digest then
      raise exception 'DEMO_EVENT_ID_CONFLICT';
    end if;

    update core.mobile_companion_demo_event
    set last_received_at = now()
    where id = v_effective_event_id
    returning * into v_existing;
  else
    insert into core.mobile_companion_demo_event (
      id,
      company_id,
      actor_profile_id,
      selected_roster_member_id,
      event_type,
      payload,
      payload_digest
    ) values (
      v_effective_event_id,
      v_company_id,
      v_actor_profile_id,
      p_roster_member_id,
      v_event_type,
      p_payload || jsonb_build_object(
        'demo_mode', true,
        'truth_status', 'ADMIN_DEMO_ONLY',
        'actor_profile_id', v_actor_profile_id,
        'selected_roster_member_id', p_roster_member_id
      ),
      v_digest
    )
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_existing.id,
    'event_type', v_existing.event_type,
    'duplicate_event', v_existing.first_received_at <> v_existing.last_received_at,
    'server_received_at', v_existing.last_received_at
  );
end;
$$;

revoke all on function public.sync_mobile_companion_demo_event(
  text, uuid, uuid, text, jsonb
) from public, anon;
grant execute on function public.sync_mobile_companion_demo_event(
  text, uuid, uuid, text, jsonb
) to authenticated, service_role;

insert into platform.switchboard (
  library_key,
  display_name,
  source_schema,
  source_object,
  object_type,
  status,
  source,
  notes
) values (
  'core.mobile_companion_observation_event',
  'Mobile Companion Observation Event',
  'core',
  'mobile_companion_observation_event',
  'TABLE',
  'IMPLEMENTED',
  'PLATFORM',
  'MC-2 append-only per-action device evidence ledger. Server disposition remains UNREVIEWED until a governed server workflow classifies the observation.'
)
on conflict (source_schema, source_object, object_type) do update
set
  library_key = excluded.library_key,
  display_name = excluded.display_name,
  status = excluded.status,
  source = excluded.source,
  notes = concat_ws(
    E'\n\n',
    nullif(btrim(platform.switchboard.notes), ''),
    excluded.notes
  );

commit;
