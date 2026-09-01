begin;

-- Collection is deliberately opt-in. A deploy must never activate a new lane
-- or recovery sweep for an existing tenant.
update core.operations_runner_schedule schedule
set
  collection_enabled = false,
  previous_day_close_enabled = false,
  operations_pulse_enabled = false,
  report_config_json =
    coalesce(schedule.report_config_json, '{}'::jsonb)
    || jsonb_build_object(
      'operations_pulse_interval_minutes', 60,
      'dro_am',
        coalesce(schedule.report_config_json -> 'dro_am', '{}'::jsonb)
        || jsonb_build_object('enabled', false),
      'route_closeout',
        coalesce(schedule.report_config_json -> 'route_closeout', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', false,
          'target_poll_interval_minutes', 15,
          'fcc_interval_minutes', 15,
          'dsw_interval_minutes', 30,
          'route_batch_size', 3,
          'previous_day_recovery_enabled', false,
          'previous_day_recovery_max_batches', 2,
          'retained_gpx_recovery_enabled', false,
          'retained_gpx_recovery_max_batches', 2,
          'retained_gpx_recovery_interval_minutes', 120
        )
    ),
  recovery_config_json =
    coalesce(schedule.recovery_config_json, '{}'::jsonb)
    || '{"enabled":false}'::jsonb,
  historical_config_json =
    coalesce(schedule.historical_config_json, '{}'::jsonb)
    || '{"enabled":false}'::jsonb,
  config_version = schedule.config_version + 1,
  runner_state = 'DISABLED',
  runner_last_error = null,
  updated_at = now();

create or replace function public.get_operations_runner_bootstrap(
  p_runner_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.operations_runner_schedule_v;
  v_profile_id uuid;
  v_credential_version bigint;
  v_pulse_interval integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select * into v_schedule
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

  v_pulse_interval := case
    when coalesce(
      v_schedule.report_config_json ->> 'operations_pulse_interval_minutes',
      ''
    ) ~ '^\d+$'
      then greatest(
        15,
        least(
          (v_schedule.report_config_json ->> 'operations_pulse_interval_minutes')::integer,
          1440
        )
      )
    else 60
  end;

  return jsonb_build_object(
    'schema_version', 4,
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
    'dro_am', coalesce(
      v_schedule.report_config_json -> 'dro_am',
      jsonb_build_object(
        'enabled', false,
        'start_time', '04:00',
        'reports', jsonb_build_array('DRO')
      )
    ),
    'operations_pulse', jsonb_build_object(
      'enabled', v_schedule.operations_pulse_enabled,
      'start_time', to_char(v_schedule.operations_pulse_start_time, 'HH24:MI'),
      'end_time', to_char(v_schedule.operations_pulse_end_time, 'HH24:MI'),
      'trigger', 'BOUNDED_INTERVAL',
      'interval_minutes', v_pulse_interval,
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
    'route_closeout', coalesce(
      v_schedule.report_config_json -> 'route_closeout',
      jsonb_build_object(
        'enabled', false,
        'start_time', '19:30',
        'end_time', '23:50',
        'final_sweep_start_time', '23:30',
        'target_poll_interval_minutes', 15,
        'fcc_interval_minutes', 15,
        'dsw_interval_minutes', 30,
        'route_batch_size', 3,
        'previous_day_recovery_enabled', false,
        'previous_day_recovery_max_batches', 2,
        'retained_gpx_recovery_enabled', false,
        'retained_gpx_recovery_start_time', '03:10',
        'retained_gpx_recovery_max_batches', 2,
        'retained_gpx_recovery_interval_minutes', 120,
        'reports', jsonb_build_array(
          'FCC', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST', 'ROUTE_GPX'
        )
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

comment on function public.get_operations_runner_bootstrap(text) is
  'Returns the signed, opt-in Runner 2.0 schedule with bounded recurring cadence.';

notify pgrst, 'reload schema';

commit;
;
