begin;

-- Background fixes are accepted only inside the same explicit duty-session
-- envelope as foreground fixes. The mobile client cannot create a location
-- observation before Start Duty or after Stop Duty.
alter table core.mobile_companion_observation_event
  drop constraint mobile_companion_observation_event_location_ck;

alter table core.mobile_companion_observation_event
  add constraint mobile_companion_observation_event_location_ck check (
    (
      event_type = 'LOCATION_CAPTURE'
      and latitude between -90 and 90
      and longitude between -180 and 180
      and (accuracy_meters is null or accuracy_meters >= 0)
      and capture_method in ('FOREGROUND_GPS', 'BACKGROUND_GPS', 'SYNTHETIC_TEST')
    )
    or
    (
      event_type in ('DUTY_STARTED', 'DUTY_STOPPED')
      and latitude is null
      and longitude is null
      and accuracy_meters is null
      and capture_method is null
    )
  );

comment on column core.mobile_companion_observation_event.capture_method is
  'Device-declared capture context. BACKGROUND_GPS is valid only while an explicit Mobile Companion duty session remains open.';

-- Keep the earlier batch tables compatible with the expanded evidence enum,
-- even though current clients ingest through the observation-event contract.
alter table core.driver_breadcrumb_point
  drop constraint if exists driver_breadcrumb_point_capture_method_ck,
  drop constraint if exists driver_breadcrumb_point_mobile_contract_ck;

alter table core.driver_breadcrumb_point
  add constraint driver_breadcrumb_point_capture_method_ck
    check (
      capture_method is null
      or capture_method in ('FOREGROUND_GPS', 'BACKGROUND_GPS', 'SYNTHETIC_TEST')
    ),
  add constraint driver_breadcrumb_point_mobile_contract_ck
    check (
      source <> 'MOBILE_COMPANION'
      or (
        tracking_session_id is not null
        and breadcrumb_batch_id is not null
        and device_captured_at is not null
        and tracking_context = 'DUTY_TRACKING'
        and capture_method in ('FOREGROUND_GPS', 'BACKGROUND_GPS', 'SYNTHETIC_TEST')
      )
    ) not valid;

comment on column core.driver_breadcrumb_point.capture_method is
  'Foreground, duty-scoped background, or isolated synthetic-test GPS evidence.';

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
  v_duty_started_at timestamptz;
  v_duty_stopped_at timestamptz;
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
    or v_capture_method not in ('FOREGROUND_GPS', 'BACKGROUND_GPS', 'SYNTHETIC_TEST')
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
  -- Serialize all observations for one duty envelope. This prevents a stop and
  -- a background fix from racing past the server-side boundary check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tracking_session_id::text, 1)
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
    select
      min(event.device_occurred_at) filter (where event.event_type = 'DUTY_STARTED'),
      max(event.device_occurred_at) filter (where event.event_type = 'DUTY_STOPPED')
    into v_duty_started_at, v_duty_stopped_at
    from core.mobile_companion_observation_event event
    where event.company_id = v_authority.company_id
      and event.profile_id = v_authority.profile_id
      and event.roster_member_id = v_authority.roster_member_id
      and event.tracking_session_id = v_tracking_session_id;

    if v_event_type = 'DUTY_STARTED' then
      if p_event_id <> v_tracking_session_id then
        raise exception 'DUTY_START_EVENT_ID_MUST_MATCH_SESSION';
      end if;
      if v_duty_started_at is not null then
        raise exception 'DUTY_SESSION_ALREADY_STARTED';
      end if;
    elsif v_event_type = 'DUTY_STOPPED' then
      if v_duty_started_at is null then
        raise exception 'DUTY_SESSION_NOT_STARTED';
      end if;
      if v_duty_stopped_at is not null then
        raise exception 'DUTY_SESSION_ALREADY_STOPPED';
      end if;
      if p_device_occurred_at < v_duty_started_at then
        raise exception 'DUTY_STOP_PRECEDES_START';
      end if;
      if exists (
        select 1
        from core.mobile_companion_observation_event event
        where event.company_id = v_authority.company_id
          and event.profile_id = v_authority.profile_id
          and event.roster_member_id = v_authority.roster_member_id
          and event.tracking_session_id = v_tracking_session_id
          and event.event_type = 'LOCATION_CAPTURE'
          and event.device_occurred_at > p_device_occurred_at
      ) then
        raise exception 'DUTY_STOP_PRECEDES_ACCEPTED_LOCATION';
      end if;
    elsif v_event_type = 'LOCATION_CAPTURE' then
      if v_duty_started_at is null then
        raise exception 'LOCATION_OUTSIDE_DUTY_SESSION';
      end if;
      if p_device_occurred_at < v_duty_started_at
         or (v_duty_stopped_at is not null and p_device_occurred_at > v_duty_stopped_at) then
        raise exception 'LOCATION_OUTSIDE_DUTY_SESSION';
      end if;
    end if;

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

commit;
notify pgrst, 'reload schema';
