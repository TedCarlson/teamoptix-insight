begin;

do $$
declare
  v_company_id uuid;
  v_terminal_id uuid;
  v_support_runner_id uuid;
  v_company_runner_id uuid;
  v_assignment_id uuid;
  v_credential_version bigint;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = 'beacon-point-ventures';

  if v_company_id is null then
    raise exception 'Beacon Point Ventures company is required for runner enrollment.';
  end if;

  select terminal.terminal_id
  into v_terminal_id
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active
  order by terminal.created_at
  limit 1;

  if v_terminal_id is null then
    raise exception 'Beacon Point Ventures requires one active terminal.';
  end if;

  select coalesce(max(credential.credential_version), 1)
  into v_credential_version
  from core.automation_profile profile
  left join core.automation_credential credential
    on credential.profile_id = profile.id
  where profile.company_id = v_company_id
    and profile.provider_key = 'FEDEX';

  insert into core.operations_runner (
    runner_key,
    display_name,
    runner_role,
    environment,
    lifecycle_state,
    credential_version,
    capabilities_json,
    deployment_metadata_json
  ) values (
    'r-teamoptix-support-prod',
    'Team Optix Support Runner',
    'SUPPORT',
    'prod',
    'DISABLED',
    1,
    jsonb_build_object(
      'command_polling', true,
      'schedule_polling', true,
      'browser_default', 'OFF'
    ),
    jsonb_build_object(
      'provider', 'digitalocean',
      'unit', 'insight-collector@teamoptix-support.service'
    )
  )
  on conflict (runner_key) do update set
    display_name = excluded.display_name,
    capabilities_json = excluded.capabilities_json,
    deployment_metadata_json = excluded.deployment_metadata_json
  returning id into v_support_runner_id;

  insert into core.operations_runner_alias (
    alias_key,
    runner_id,
    retired_at,
    retirement_reason
  ) values (
    'vps-laravel-runner-001',
    v_support_runner_id,
    now(),
    'Legacy shared runner identity retained for historical collection lineage.'
  )
  on conflict (alias_key) do update set
    runner_id = excluded.runner_id,
    retirement_reason = excluded.retirement_reason;

  insert into core.operations_runner (
    runner_key,
    display_name,
    runner_role,
    environment,
    lifecycle_state,
    credential_version,
    capabilities_json,
    deployment_metadata_json
  ) values (
    'r-beacon-point-ventures-prod',
    'Beacon Point Ventures Production Runner',
    'DEDICATED',
    'prod',
    'DISABLED',
    v_credential_version,
    jsonb_build_object(
      'artifact_families', jsonb_build_array(
        'DSW', 'FCC', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST', 'ROUTE_GPX'
      ),
      'command_polling', true,
      'schedule_polling', true,
      'browser_default', 'OFF'
    ),
    jsonb_build_object(
      'provider', 'digitalocean',
      'unit', 'insight-collector@beacon-point-ventures.service'
    )
  )
  on conflict (runner_key) do update set
    display_name = excluded.display_name,
    credential_version = excluded.credential_version,
    capabilities_json = excluded.capabilities_json,
    deployment_metadata_json = excluded.deployment_metadata_json
  returning id into v_company_runner_id;

  select assignment.id
  into v_assignment_id
  from core.operations_runner_assignment assignment
  where assignment.runner_id = v_company_runner_id
    and assignment.assignment_status in ('PENDING', 'ACTIVE', 'DRAINING')
  order by assignment.created_at desc
  limit 1;

  if v_assignment_id is null then
    insert into core.operations_runner_assignment (
      runner_id,
      company_id,
      terminal_id,
      assignment_kind,
      assignment_status,
      credential_version,
      allowed_lanes,
      assignment_reason,
      effective_at
    ) values (
      v_company_runner_id,
      v_company_id,
      v_terminal_id,
      'DEDICATED',
      'ACTIVE',
      v_credential_version,
      array[
        'DSW',
        'FCC',
        'DELIVERY_MANIFEST',
        'PICKUP_MANIFEST',
        'ROUTE_GPX'
      ]::text[],
      'Initial dedicated production collection assignment.',
      now()
    )
    returning id into v_assignment_id;
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
    historical_config_json,
    config_version,
    applied_version,
    runner_state,
    runner_metadata_json,
    assignment_id
  ) values (
    v_company_id,
    'r-beacon-point-ventures-prod',
    'America/New_York',
    false,
    false,
    '03:00',
    true,
    '07:30',
    '19:30',
    jsonb_build_object(
      'previous_day_close', jsonb_build_array('DSW'),
      'dro_am', jsonb_build_object(
        'enabled', false,
        'start_time', '04:00',
        'reports', jsonb_build_array('DRO')
      ),
      'run_gate', jsonb_build_object(
        'authority', 'MANUAL',
        'manual_state', 'INACTIVE'
      ),
      'operations_pulse', jsonb_build_array('DSW'),
      'operating_weekdays', jsonb_build_array(1, 2, 3, 4, 5, 6),
      'operating_date_overrides', '{}'::jsonb,
      'route_closeout', jsonb_build_object(
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
    '{"enabled":false}'::jsonb,
    '{"enabled":false}'::jsonb,
    1,
    0,
    'DISABLED',
    jsonb_build_object('enrollment', 'INITIAL_DEDICATED_CANARY'),
    v_assignment_id
  )
  on conflict (runner_key) do update set
    assignment_id = excluded.assignment_id,
    company_id = excluded.company_id,
    collection_enabled = false,
    runner_state = 'DISABLED',
    runner_last_error = null,
    updated_at = now();
end;
$$;

notify pgrst, 'reload schema';

commit;
