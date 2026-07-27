begin;

-- One governed schedule programs one runner. The schedule contains no provider
-- secret and is safe to distribute through Supabase Realtime.
create table if not exists core.operations_runner_schedule (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references core.companies(id) on delete cascade,
  runner_key text not null unique,
  timezone text not null default 'America/New_York',
  collection_enabled boolean not null default false,
  previous_day_close_enabled boolean not null default true,
  previous_day_close_time time without time zone not null default '03:00',
  operations_pulse_enabled boolean not null default true,
  operations_pulse_start_time time without time zone not null default '07:30',
  operations_pulse_end_time time without time zone not null default '19:30',
  report_config_json jsonb not null default jsonb_build_object(
    'previous_day_close', jsonb_build_array('DSW'),
    'operations_pulse', jsonb_build_array(
      'DSW',
      'FCC',
      'DELIVERY_MANIFEST',
      'PICKUP_MANIFEST'
    ),
    'operating_weekdays', jsonb_build_array(1, 2, 3, 4, 5, 6),
    'operating_date_overrides', '{}'::jsonb
  ),
  recovery_config_json jsonb not null default '{"enabled":false}'::jsonb,
  historical_config_json jsonb not null default '{"enabled":false}'::jsonb,
  config_version bigint not null default 1,
  applied_version bigint not null default 0,
  runner_state text not null default 'PENDING',
  applied_at timestamptz,
  runner_last_seen_at timestamptz,
  runner_last_error text,
  runner_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_runner_schedule_runner_key_chk
    check (length(trim(runner_key)) between 3 and 128),
  constraint operations_runner_schedule_timezone_chk
    check (length(trim(timezone)) between 3 and 128),
  constraint operations_runner_schedule_window_chk
    check (operations_pulse_start_time < operations_pulse_end_time),
  constraint operations_runner_schedule_version_chk
    check (config_version > 0 and applied_version >= 0),
  constraint operations_runner_schedule_state_chk
    check (
      runner_state = any (
        array['PENDING', 'APPLIED', 'RUNNING', 'IDLE', 'DISABLED', 'ERROR']
      )
    )
);

create index if not exists operations_runner_schedule_company_idx
  on core.operations_runner_schedule(company_id);

alter table core.operations_runner_schedule enable row level security;

drop policy if exists operations_runner_schedule_platform_read
  on core.operations_runner_schedule;
create policy operations_runner_schedule_platform_read
  on core.operations_runner_schedule
  for select
  to authenticated
  using (core.is_platform_owner());

create or replace view public.operations_runner_schedule_v
with (security_invoker = true) as
select
  schedule.id,
  schedule.company_id,
  company.company_slug,
  schedule.runner_key,
  schedule.timezone,
  schedule.collection_enabled,
  schedule.previous_day_close_enabled,
  schedule.previous_day_close_time,
  schedule.operations_pulse_enabled,
  schedule.operations_pulse_start_time,
  schedule.operations_pulse_end_time,
  schedule.report_config_json,
  schedule.recovery_config_json,
  schedule.historical_config_json,
  schedule.config_version,
  schedule.applied_version,
  schedule.runner_state,
  schedule.applied_at,
  schedule.runner_last_seen_at,
  schedule.runner_last_error,
  schedule.runner_metadata_json,
  schedule.created_at,
  schedule.updated_at
from core.operations_runner_schedule schedule
join core.companies company on company.id = schedule.company_id;

grant select on core.operations_runner_schedule to authenticated;
grant all on core.operations_runner_schedule to service_role;
grant select on public.operations_runner_schedule_v to authenticated;
grant all on public.operations_runner_schedule_v to service_role;

create or replace function public.get_operations_runner_schedule(
  p_company_slug text
)
returns setof public.operations_runner_schedule_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(core.is_platform_owner(), false)
  then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  return query
  select *
  from public.operations_runner_schedule_v
  where company_id = v_company_id;
end;
$$;

create or replace function public.save_operations_runner_schedule(
  p_company_slug text,
  p_runner_key text,
  p_timezone text,
  p_collection_enabled boolean,
  p_previous_day_close_enabled boolean,
  p_previous_day_close_time time without time zone,
  p_operations_pulse_enabled boolean,
  p_operations_pulse_start_time time without time zone,
  p_operations_pulse_end_time time without time zone,
  p_report_config_json jsonb default '{}'::jsonb,
  p_recovery_config_json jsonb default '{"enabled":false}'::jsonb,
  p_historical_config_json jsonb default '{"enabled":false}'::jsonb
)
returns public.operations_runner_schedule_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_row public.operations_runner_schedule_v;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if p_operations_pulse_start_time is null
    or p_operations_pulse_end_time is null
    or p_operations_pulse_start_time >= p_operations_pulse_end_time
  then
    raise exception 'Invalid Operations Pulse window.';
  end if;

  insert into core.operations_runner_schedule (
    company_id,
    runner_key,
    timezone,
    collection_enabled,
    previous_day_close_enabled,
    previous_day_close_time,
    operations_pulse_enabled,
    operations_pulse_start_time,
    operations_pulse_end_time,
    report_config_json,
    recovery_config_json,
    historical_config_json
  )
  values (
    v_company_id,
    trim(p_runner_key),
    trim(coalesce(p_timezone, 'America/New_York')),
    coalesce(p_collection_enabled, false),
    coalesce(p_previous_day_close_enabled, true),
    coalesce(p_previous_day_close_time, '03:00'),
    coalesce(p_operations_pulse_enabled, true),
    p_operations_pulse_start_time,
    p_operations_pulse_end_time,
    coalesce(p_report_config_json, '{}'::jsonb),
    coalesce(p_recovery_config_json, '{"enabled":false}'::jsonb),
    coalesce(p_historical_config_json, '{"enabled":false}'::jsonb)
  )
  on conflict (runner_key) do update set
    company_id = excluded.company_id,
    timezone = excluded.timezone,
    collection_enabled = excluded.collection_enabled,
    previous_day_close_enabled = excluded.previous_day_close_enabled,
    previous_day_close_time = excluded.previous_day_close_time,
    operations_pulse_enabled = excluded.operations_pulse_enabled,
    operations_pulse_start_time = excluded.operations_pulse_start_time,
    operations_pulse_end_time = excluded.operations_pulse_end_time,
    report_config_json = excluded.report_config_json,
    recovery_config_json = excluded.recovery_config_json,
    historical_config_json = excluded.historical_config_json,
    config_version = case
      when (
        core.operations_runner_schedule.company_id,
        core.operations_runner_schedule.timezone,
        core.operations_runner_schedule.collection_enabled,
        core.operations_runner_schedule.previous_day_close_enabled,
        core.operations_runner_schedule.previous_day_close_time,
        core.operations_runner_schedule.operations_pulse_enabled,
        core.operations_runner_schedule.operations_pulse_start_time,
        core.operations_runner_schedule.operations_pulse_end_time,
        core.operations_runner_schedule.report_config_json,
        core.operations_runner_schedule.recovery_config_json,
        core.operations_runner_schedule.historical_config_json
      ) is distinct from (
        excluded.company_id,
        excluded.timezone,
        excluded.collection_enabled,
        excluded.previous_day_close_enabled,
        excluded.previous_day_close_time,
        excluded.operations_pulse_enabled,
        excluded.operations_pulse_start_time,
        excluded.operations_pulse_end_time,
        excluded.report_config_json,
        excluded.recovery_config_json,
        excluded.historical_config_json
      )
      then core.operations_runner_schedule.config_version + 1
      else core.operations_runner_schedule.config_version
    end,
    runner_state = case
      when core.operations_runner_schedule.collection_enabled
        is distinct from excluded.collection_enabled
        or core.operations_runner_schedule.previous_day_close_enabled
          is distinct from excluded.previous_day_close_enabled
        or core.operations_runner_schedule.previous_day_close_time
          is distinct from excluded.previous_day_close_time
        or core.operations_runner_schedule.operations_pulse_enabled
          is distinct from excluded.operations_pulse_enabled
        or core.operations_runner_schedule.operations_pulse_start_time
          is distinct from excluded.operations_pulse_start_time
        or core.operations_runner_schedule.operations_pulse_end_time
          is distinct from excluded.operations_pulse_end_time
        or core.operations_runner_schedule.report_config_json
          is distinct from excluded.report_config_json
        then 'PENDING'
      else core.operations_runner_schedule.runner_state
    end,
    runner_last_error = null,
    updated_at = now();

  select *
  into v_row
  from public.operations_runner_schedule_v
  where runner_key = trim(p_runner_key);

  return v_row;
end;
$$;

alter table core.automation_credential
  add column if not exists credential_version bigint not null default 1;

alter table core.automation_credential
  drop constraint if exists automation_credential_version_chk;
alter table core.automation_credential
  add constraint automation_credential_version_chk
  check (credential_version > 0);

create or replace function public.get_operations_runner_bootstrap(
  p_runner_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_schedule public.operations_runner_schedule_v;
  v_profile_id uuid;
  v_credential_version bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select *
  into v_schedule
  from public.operations_runner_schedule_v
  where runner_key = trim(p_runner_key);

  if v_schedule.id is null then
    return null;
  end if;

  select profile.id, credential.credential_version
  into v_profile_id, v_credential_version
  from core.automation_profile profile
  left join core.automation_credential credential
    on credential.profile_id = profile.id
  where profile.company_id = v_schedule.company_id
    and profile.provider_key = 'FEDEX'
  limit 1;

  return jsonb_build_object(
    'schema_version', 1,
    'runner_key', v_schedule.runner_key,
    'company_id', v_schedule.company_id,
    'company_slug', v_schedule.company_slug,
    'timezone', v_schedule.timezone,
    'collection_enabled', v_schedule.collection_enabled,
    'config_version', v_schedule.config_version,
    'previous_day_close', jsonb_build_object(
      'enabled', v_schedule.previous_day_close_enabled,
      'start_time', to_char(v_schedule.previous_day_close_time, 'HH24:MI'),
      'reports', coalesce(
        v_schedule.report_config_json -> 'previous_day_close',
        '["DSW"]'::jsonb
      )
    ),
    'operations_pulse', jsonb_build_object(
      'enabled', v_schedule.operations_pulse_enabled,
      'start_time', to_char(v_schedule.operations_pulse_start_time, 'HH24:MI'),
      'end_time', to_char(v_schedule.operations_pulse_end_time, 'HH24:MI'),
      'trigger', 'PREVIOUS_SUCCESS',
      'operating_weekdays', coalesce(
        v_schedule.report_config_json -> 'operating_weekdays',
        '[1,2,3,4,5,6]'::jsonb
      ),
      'operating_date_overrides', coalesce(
        v_schedule.report_config_json -> 'operating_date_overrides',
        '{}'::jsonb
      ),
      'reports', coalesce(
        v_schedule.report_config_json -> 'operations_pulse',
        '[]'::jsonb
      )
    ),
    'targeted_recovery', v_schedule.recovery_config_json,
    'historical_sweep', v_schedule.historical_config_json,
    'credential', jsonb_build_object(
      'profile_id', v_profile_id,
      'provider_key', 'FEDEX',
      'version', coalesce(v_credential_version, 0)
    )
  );
end;
$$;

create or replace function core.signal_runner_credential_version()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
begin
  if tg_op = 'UPDATE'
    and new.credential_version is not distinct from old.credential_version
  then
    return new;
  end if;

  update core.operations_runner_schedule schedule
  set
    config_version = schedule.config_version + 1,
    runner_state = 'PENDING',
    runner_last_error = null,
    updated_at = now()
  from core.automation_profile profile
  where profile.id = new.profile_id
    and schedule.company_id = profile.company_id;

  return new;
end;
$$;

drop trigger if exists automation_credential_runner_signal_trg
  on core.automation_credential;
create trigger automation_credential_runner_signal_trg
after insert or update of credential_version
on core.automation_credential
for each row execute function core.signal_runner_credential_version();

create or replace function public.save_automation_credential(
  p_profile_id uuid,
  p_username text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
begin
  insert into core.automation_credential (
    profile_id,
    username,
    encrypted_secret,
    has_secret,
    credential_version
  )
  values (
    p_profile_id,
    p_username,
    p_password,
    true,
    1
  )
  on conflict (profile_id)
  do update set
    username = excluded.username,
    encrypted_secret = excluded.encrypted_secret,
    has_secret = true,
    credential_version =
      core.automation_credential.credential_version + 1,
    updated_at = now();

  update core.automation_profile
  set status = 'CONFIGURED', updated_at = now()
  where id = p_profile_id;

  return true;
end;
$$;

create or replace function public.get_operations_runner_credential(
  p_runner_key text,
  p_known_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_profile core.automation_profile%rowtype;
  v_credential core.automation_credential%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select profile.*
  into v_profile
  from core.operations_runner_schedule schedule
  join core.automation_profile profile
    on profile.company_id = schedule.company_id
   and profile.provider_key = 'FEDEX'
  where schedule.runner_key = trim(p_runner_key)
  limit 1;

  if v_profile.id is null then
    return jsonb_build_object(
      'available', false,
      'provider_key', 'FEDEX',
      'version', 0
    );
  end if;

  select *
  into v_credential
  from core.automation_credential
  where profile_id = v_profile.id
    and has_secret = true;

  if v_credential.id is null then
    return jsonb_build_object(
      'available', false,
      'profile_id', v_profile.id,
      'provider_key', 'FEDEX',
      'version', 0
    );
  end if;

  if p_known_version is not null
    and p_known_version = v_credential.credential_version
  then
    return jsonb_build_object(
      'available', true,
      'changed', false,
      'profile_id', v_profile.id,
      'provider_key', 'FEDEX',
      'version', v_credential.credential_version
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'changed', true,
    'profile_id', v_profile.id,
    'provider_key', 'FEDEX',
    'version', v_credential.credential_version,
    'username', v_credential.username,
    'password', v_credential.encrypted_secret
  );
end;
$$;

create or replace function public.ack_operations_runner_schedule(
  p_runner_key text,
  p_config_version bigint,
  p_runner_state text,
  p_runner_error text default null,
  p_runner_metadata_json jsonb default '{}'::jsonb
)
returns public.operations_runner_schedule_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_runner_schedule_v;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if upper(coalesce(p_runner_state, '')) not in (
    'APPLIED', 'RUNNING', 'IDLE', 'DISABLED', 'ERROR'
  ) then
    raise exception 'Unsupported runner state.';
  end if;

  update core.operations_runner_schedule
  set
    applied_version = greatest(
      applied_version,
      least(coalesce(p_config_version, 0), config_version)
    ),
    runner_state = upper(p_runner_state),
    applied_at = case
      when coalesce(p_config_version, 0) >= config_version then now()
      else applied_at
    end,
    runner_last_seen_at = now(),
    runner_last_error = nullif(trim(coalesce(p_runner_error, '')), ''),
    runner_metadata_json =
      runner_metadata_json || coalesce(p_runner_metadata_json, '{}'::jsonb),
    updated_at = now()
  where runner_key = trim(p_runner_key);

  select *
  into v_row
  from public.operations_runner_schedule_v
  where runner_key = trim(p_runner_key);

  return v_row;
end;
$$;

-- A continuous runner creates no permission ticket. It uploads artifacts under
-- a locally generated cycle UUID, then submits one information-dense terminal
-- receipt. This transaction creates the audit request and all artifact rows.
create or replace function public.record_operations_runner_cycle_terminal(
  p_runner_key text,
  p_cycle_id uuid,
  p_request_type text,
  p_service_date date,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_outcome text,
  p_requested_reports text[],
  p_request_payload jsonb,
  p_receipt_json jsonb,
  p_artifacts_json jsonb default '[]'::jsonb,
  p_error_message text default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_company_slug text;
  v_outcome text := upper(trim(coalesce(p_outcome, 'FAILED')));
  v_request_status text;
  v_artifact_count integer;
  v_report_count integer;
  v_manifest_count integer;
  v_row public.operations_collection_request_v;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if upper(trim(coalesce(p_request_type, ''))) not in (
    'PREVIOUS_DAY_CLOSE',
    'OPERATIONS_PULSE',
    'TARGETED_RECOVERY',
    'HISTORICAL_BACKFILL'
  ) then
    raise exception 'Unsupported runner cycle type.';
  end if;

  if v_outcome not in ('COMPLETE', 'FAILED', 'CANCELLED', 'INTERRUPTED') then
    raise exception 'Unsupported runner cycle outcome.';
  end if;

  select schedule.company_id, company.company_slug
  into v_company_id, v_company_slug
  from core.operations_runner_schedule schedule
  join core.companies company on company.id = schedule.company_id
  where schedule.runner_key = trim(p_runner_key);

  if v_company_id is null then
    raise exception 'Runner schedule not found.';
  end if;

  if jsonb_typeof(coalesce(p_artifacts_json, '[]'::jsonb)) <> 'array' then
    raise exception 'Artifacts must be a JSON array.';
  end if;

  v_artifact_count := jsonb_array_length(
    coalesce(p_artifacts_json, '[]'::jsonb)
  );
  v_report_count := (
    select count(*)::integer
    from jsonb_array_elements(coalesce(p_artifacts_json, '[]'::jsonb)) artifact
    where upper(coalesce(artifact ->> 'artifact_key', '')) not like '%MANIFEST%'
  );
  v_manifest_count := v_artifact_count - v_report_count;

  v_request_status := case
    when v_outcome = 'COMPLETE' and v_artifact_count > 0
      then 'ARTIFACTS_READY'
    when v_outcome = 'CANCELLED'
      then 'CANCELLED'
    else 'FAILED'
  end;

  insert into core.operations_collection_request (
    id,
    company_id,
    request_type,
    request_status,
    priority,
    service_date,
    requested_reports,
    request_payload,
    claimed_by,
    claimed_at,
    started_at,
    completed_at,
    error_message,
    created_at,
    updated_at,
    output_receipt_json
  )
  values (
    p_cycle_id,
    v_company_id,
    upper(trim(p_request_type)),
    v_request_status,
    case upper(trim(p_request_type))
      when 'TARGETED_RECOVERY' then 40
      when 'PREVIOUS_DAY_CLOSE' then 60
      else 100
    end,
    p_service_date,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'continuous_runner',
        'request_origin', 'runner_terminal_receipt',
        'runner_key', trim(p_runner_key)
      ),
    trim(p_runner_key),
    p_started_at,
    p_started_at,
    case
      when v_request_status in ('FAILED', 'CANCELLED')
        then p_completed_at
      else null
    end,
    case
      when v_outcome = 'COMPLETE' and v_artifact_count = 0
        then coalesce(
          nullif(trim(coalesce(p_error_message, '')), ''),
          'Collection completed without producing an artifact.'
        )
      else nullif(trim(coalesce(p_error_message, '')), '')
    end,
    p_started_at,
    p_completed_at,
    coalesce(p_receipt_json, '{}'::jsonb)
      || jsonb_build_object(
        'schema_version', 1,
        'runner_key', trim(p_runner_key),
        'company_slug', v_company_slug,
        'cycle_id', p_cycle_id,
        'outcome', v_outcome,
        'started_at', p_started_at,
        'runner_completed_at', p_completed_at,
        'report_count', v_report_count,
        'manifest_count', v_manifest_count,
        'artifact_count', v_artifact_count
      )
  )
  on conflict (id) do nothing;

  if exists (
    select 1
    from core.operations_collection_request
    where id = p_cycle_id
      and (
        company_id <> v_company_id
        or claimed_by is distinct from trim(p_runner_key)
      )
  ) then
    raise exception 'Cycle ID is already owned by another runner.';
  end if;

  insert into core.operations_collection_artifact (
    collection_request_id,
    company_id,
    service_date,
    artifact_kind,
    report_family_key,
    report_shape_key,
    report_frame,
    artifact_status,
    storage_bucket,
    storage_path,
    original_filename,
    normalized_filename,
    content_type,
    size_bytes,
    source_hash,
    runner_key,
    runner_artifact_json,
    ingest_priority,
    runner_elapsed_ms,
    runner_cpu_ms
  )
  select
    p_cycle_id,
    v_company_id,
    coalesce(
      nullif(artifact ->> 'service_date', '')::date,
      p_service_date
    ),
    coalesce(nullif(artifact ->> 'kind', ''), 'REPORT_FILE'),
    nullif(artifact ->> 'report_family_key', ''),
    nullif(artifact ->> 'report_shape_key', ''),
    nullif(artifact ->> 'report_frame', ''),
    'READY_FOR_INGEST',
    artifact ->> 'storage_bucket',
    artifact ->> 'storage_path',
    artifact ->> 'filename',
    coalesce(
      nullif(artifact ->> 'display_filename', ''),
      artifact ->> 'filename'
    ),
    nullif(artifact ->> 'content_type', ''),
    coalesce((artifact ->> 'size_bytes')::bigint, 0),
    nullif(artifact ->> 'source_hash', ''),
    trim(p_runner_key),
    artifact,
    public.collection_artifact_ingest_priority(
      artifact ->> 'report_family_key',
      artifact ->> 'filename',
      coalesce(
        nullif(artifact ->> 'display_filename', ''),
        artifact ->> 'filename'
      ),
      artifact
    ),
    case
      when coalesce(artifact ->> 'runner_elapsed_ms', '') ~ '^\d+$'
        then (artifact ->> 'runner_elapsed_ms')::integer
      else null
    end,
    case
      when coalesce(artifact ->> 'runner_cpu_ms', '') ~ '^\d+$'
        then (artifact ->> 'runner_cpu_ms')::integer
      else null
    end
  from jsonb_array_elements(
    case
      when v_outcome = 'COMPLETE'
        then coalesce(p_artifacts_json, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) artifact
  on conflict (storage_bucket, storage_path) do update set
    artifact_status = excluded.artifact_status,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_key = excluded.runner_key,
    runner_artifact_json = excluded.runner_artifact_json,
    ingest_priority = excluded.ingest_priority,
    runner_elapsed_ms = excluded.runner_elapsed_ms,
    runner_cpu_ms = excluded.runner_cpu_ms,
    updated_at = now();

  select *
  into v_row
  from public.operations_collection_request_v
  where id = p_cycle_id;

  return v_row;
end;
$$;

revoke all on function public.get_operations_runner_schedule(text)
  from public, anon;
grant execute on function public.get_operations_runner_schedule(text)
  to authenticated, service_role;

revoke all on function public.save_operations_runner_schedule(
  text, text, text, boolean, boolean, time, boolean, time, time,
  jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_operations_runner_schedule(
  text, text, text, boolean, boolean, time, boolean, time, time,
  jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.get_operations_runner_bootstrap(text)
  from public, anon, authenticated;
grant execute on function public.get_operations_runner_bootstrap(text)
  to service_role;

revoke all on function public.get_operations_runner_credential(text, bigint)
  from public, anon, authenticated;
grant execute on function public.get_operations_runner_credential(text, bigint)
  to service_role;

revoke all on function public.ack_operations_runner_schedule(
  text, bigint, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ack_operations_runner_schedule(
  text, bigint, text, text, jsonb
) to service_role;

revoke all on function public.record_operations_runner_cycle_terminal(
  text, uuid, text, date, timestamptz, timestamptz, text, text[],
  jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_operations_runner_cycle_terminal(
  text, uuid, text, date, timestamptz, timestamptz, text, text[],
  jsonb, jsonb, jsonb, text
) to service_role;

revoke all on function public.save_automation_credential(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_automation_credential(uuid, text, text)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'core'
      and tablename = 'operations_runner_schedule'
  ) then
    alter publication supabase_realtime
      add table core.operations_runner_schedule;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
