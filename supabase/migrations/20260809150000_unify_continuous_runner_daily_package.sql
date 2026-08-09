begin;

-- The signed runner schedule is the sole run/rest authority for the daily
-- package. Keep DRO AM beside Prior Day and Operations Pulse instead of in a
-- VPS-only environment gate.
update core.operations_runner_schedule schedule
set
  report_config_json = jsonb_set(
    jsonb_set(
      coalesce(schedule.report_config_json, '{}'::jsonb),
      '{dro_am}',
      coalesce(
        schedule.report_config_json -> 'dro_am',
        jsonb_build_object(
          'enabled', true,
          'start_time', '04:00',
          'reports', jsonb_build_array('DRO')
        )
      ),
      true
    ),
    '{run_gate}',
    coalesce(
      schedule.report_config_json -> 'run_gate',
      jsonb_build_object(
        'authority', 'MANUAL',
        'manual_state',
          case when schedule.collection_enabled then 'ACTIVE' else 'INACTIVE' end
      )
    ),
    true
  ),
  config_version = schedule.config_version + 1,
  runner_state = 'PENDING',
  runner_last_error = null,
  updated_at = now()
where schedule.report_config_json -> 'dro_am' is null
   or schedule.report_config_json -> 'run_gate' is null;

create or replace function public.cancel_continuous_runner_legacy_requests(
  p_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_cancelled integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  update core.operations_collection_request request
  set
    request_status = 'CANCELLED',
    error_message =
      'Cancelled because the signed continuous-runner schedule owns this daily collection.',
    completed_at = now(),
    updated_at = now()
  where request.company_id = p_company_id
    and request.request_status = 'QUEUED'
    and request.claimed_by is null
    and request.request_type in ('PREVIOUS_DAY_CLOSE', 'DRO_AM', 'OPERATIONS_PULSE')
    and exists (
      select 1
      from core.operations_runner_schedule schedule
      where schedule.company_id = request.company_id
    );

  get diagnostics v_cancelled = row_count;
  return v_cancelled;
end;
$$;

revoke all on function public.cancel_continuous_runner_legacy_requests(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_continuous_runner_legacy_requests(uuid)
  to service_role;

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
    'schema_version', 2,
    'runner_key', v_schedule.runner_key,
    'company_id', v_schedule.company_id,
    'company_slug', v_schedule.company_slug,
    'timezone', v_schedule.timezone,
    'collection_enabled', v_schedule.collection_enabled,
    'config_version', v_schedule.config_version,
    'run_gate', coalesce(
      v_schedule.report_config_json -> 'run_gate',
      jsonb_build_object(
        'authority', 'MANUAL',
        'manual_state',
          case when v_schedule.collection_enabled then 'ACTIVE' else 'INACTIVE' end
      )
    ),
    'previous_day_close', jsonb_build_object(
      'enabled', v_schedule.previous_day_close_enabled,
      'start_time', to_char(v_schedule.previous_day_close_time, 'HH24:MI'),
      'reports', coalesce(
        v_schedule.report_config_json -> 'previous_day_close',
        '["DSW"]'::jsonb
      )
    ),
    'dro_am', coalesce(
      v_schedule.report_config_json -> 'dro_am',
      jsonb_build_object(
        'enabled', true,
        'start_time', '04:00',
        'reports', jsonb_build_array('DRO')
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

revoke all on function public.get_operations_runner_bootstrap(text)
  from public, anon, authenticated;
grant execute on function public.get_operations_runner_bootstrap(text)
  to service_role;

-- Remove queue-era daily requests immediately. Continuous terminal receipts
-- remain the audit record after each runner-owned cycle.
select public.cancel_continuous_runner_legacy_requests(schedule.company_id)
from core.operations_runner_schedule schedule;

notify pgrst, 'reload schema';

commit;
