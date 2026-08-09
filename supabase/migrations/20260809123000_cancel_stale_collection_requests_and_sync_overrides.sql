begin;

create or replace function public.expire_stale_operations_collection_requests()
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_expired_count integer;
begin
  with request_heartbeat as (
    select
      request.id,
      request.request_type,
      request.request_status,
      greatest(
        request.updated_at,
        max(artifact.updated_at)
      ) as last_heartbeat_at,
      case
        when request.request_type = 'HISTORICAL_BACKFILL'
          then interval '4 hours'
        when request.request_status = 'CLAIMED'
          then interval '10 minutes'
        when request.request_type in (
          'TARGETED_RECOVERY',
          'PREVIOUS_DAY_CLOSE',
          'OPERATIONS_PULSE'
        ) then interval '30 minutes'
        when request.request_status in ('ARTIFACTS_READY', 'INGESTING')
          then interval '1 hour'
        else interval '1 hour'
      end as lease_duration
    from core.operations_collection_request request
    left join core.operations_collection_artifact artifact
      on artifact.collection_request_id = request.id
    where request.request_status in (
      'QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING'
    )
    group by request.id
  ), expired as (
    select id, request_status
    from request_heartbeat
    where last_heartbeat_at < now() - lease_duration
  )
  update core.operations_collection_request request
  set
    request_status = case
      when expired.request_status = 'QUEUED' then 'CANCELLED'
      else 'FAILED'
    end,
    error_message = case
      when expired.request_status = 'QUEUED'
        then 'Queued request cancelled automatically because no runner claimed it before the governed timeout.'
      when expired.request_status in ('ARTIFACTS_READY', 'INGESTING')
        then 'Ingestion lease expired: artifact processing stopped without completing the request.'
      else 'Runner lease expired: no execution or artifact heartbeat was received before the governed timeout.'
    end,
    completed_at = now(),
    updated_at = now()
  from expired
  where request.id = expired.id;

  get diagnostics v_expired_count = row_count;
  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_operations_collection_requests()
  from public;
grant execute on function public.expire_stale_operations_collection_requests()
  to service_role;

create or replace function public.set_company_operations_date_override(
  p_company_slug text,
  p_operational_date date,
  p_override_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_mode text := upper(trim(coalesce(p_override_mode, '')));
  v_date_key text;
  v_assignment_count integer := 0;
  v_runner_schedule_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_operational_date is null then
    raise exception 'Operational date is required.' using errcode = '22023';
  end if;

  if v_mode not in ('OPERATING', 'CLOSED', 'INHERIT') then
    raise exception 'Override mode must be OPERATING, CLOSED, or INHERIT.'
      using errcode = '22023';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = trim(p_company_slug);

  if v_company_id is null then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  v_date_key := to_char(p_operational_date, 'YYYY-MM-DD');

  update core.company_operations_ticket_assignment assignment
  set
    assignment_payload_json = jsonb_set(
      coalesce(assignment.assignment_payload_json, '{}'::jsonb),
      '{operating_date_overrides}',
      case
        when v_mode = 'INHERIT' then
          coalesce(
            assignment.assignment_payload_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) - v_date_key
        else
          coalesce(
            assignment.assignment_payload_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) || jsonb_build_object(v_date_key, v_mode)
      end,
      true
    ),
    last_generated_at = case
      when v_mode = 'OPERATING' then null
      else assignment.last_generated_at
    end,
    updated_at = now()
  where assignment.company_id = v_company_id
    and assignment.operational_contract = 'IN_DAY_OPERATIONS'
    and assignment.assignment_status = 'active'
    and assignment.is_enabled = true
    and assignment.active_start_date <= p_operational_date
    and (
      assignment.inactive_end_date is null
      or assignment.inactive_end_date > p_operational_date
    );

  get diagnostics v_assignment_count = row_count;

  if v_assignment_count = 0 then
    raise exception 'No active in-day collection assignment was found.'
      using errcode = 'P0002';
  end if;

  update core.operations_runner_schedule schedule
  set
    report_config_json = jsonb_set(
      coalesce(schedule.report_config_json, '{}'::jsonb),
      '{operating_date_overrides}',
      case
        when v_mode = 'INHERIT' then
          coalesce(
            schedule.report_config_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) - v_date_key
        else
          coalesce(
            schedule.report_config_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) || jsonb_build_object(v_date_key, v_mode)
      end,
      true
    ),
    config_version = schedule.config_version + 1,
    runner_state = 'PENDING',
    runner_last_error = null,
    updated_at = now()
  where schedule.company_id = v_company_id
    and jsonb_set(
      coalesce(schedule.report_config_json, '{}'::jsonb),
      '{operating_date_overrides}',
      case
        when v_mode = 'INHERIT' then
          coalesce(
            schedule.report_config_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) - v_date_key
        else
          coalesce(
            schedule.report_config_json -> 'operating_date_overrides',
            '{}'::jsonb
          ) || jsonb_build_object(v_date_key, v_mode)
      end,
      true
    ) is distinct from schedule.report_config_json;

  get diagnostics v_runner_schedule_count = row_count;

  return jsonb_build_object(
    'company_id', v_company_id,
    'company_slug', trim(p_company_slug),
    'operational_date', v_date_key,
    'override_mode', v_mode,
    'assignment_count', v_assignment_count,
    'runner_schedule_count', v_runner_schedule_count,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.set_company_operations_date_override(text, date, text)
  from public;
grant execute on function public.set_company_operations_date_override(text, date, text)
  to service_role;

-- Synchronize overrides that were written before the runner schedule became
-- part of the same governed update.
with active_assignment as (
  select distinct on (assignment.company_id)
    assignment.company_id,
    coalesce(
      assignment.assignment_payload_json -> 'operating_date_overrides',
      '{}'::jsonb
    ) as operating_date_overrides
  from core.company_operations_ticket_assignment assignment
  where assignment.operational_contract = 'IN_DAY_OPERATIONS'
    and assignment.assignment_status = 'active'
    and assignment.is_enabled = true
    and assignment.active_start_date <= current_date
    and (
      assignment.inactive_end_date is null
      or assignment.inactive_end_date > current_date
    )
  order by assignment.company_id, assignment.release_order asc
), changed_runner_schedule as (
  select
    schedule.id,
    jsonb_set(
      coalesce(schedule.report_config_json, '{}'::jsonb),
      '{operating_date_overrides}',
      active_assignment.operating_date_overrides,
      true
    ) as next_report_config_json
  from core.operations_runner_schedule schedule
  join active_assignment
    on active_assignment.company_id = schedule.company_id
)
update core.operations_runner_schedule schedule
set
  report_config_json = changed.next_report_config_json,
  config_version = schedule.config_version + 1,
  runner_state = 'PENDING',
  runner_last_error = null,
  updated_at = now()
from changed_runner_schedule changed
where schedule.id = changed.id
  and schedule.report_config_json is distinct from changed.next_report_config_json;

select public.expire_stale_operations_collection_requests();

notify pgrst, 'reload schema';

commit;
