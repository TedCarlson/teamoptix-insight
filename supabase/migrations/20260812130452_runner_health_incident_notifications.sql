begin;

create table if not exists core.operations_runner_health_incident (
  id uuid primary key default gen_random_uuid(),
  runner_key text not null,
  company_id uuid not null references core.companies(id) on delete cascade,
  issue_type text not null,
  incident_status text not null default 'OPEN',
  opened_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  runner_state text not null,
  runner_last_seen_at timestamptz,
  runner_last_error text,
  failure_notified_at timestamptz,
  recovery_notified_at timestamptz,
  notification_attempts integer not null default 0,
  notification_provider_id text,
  notification_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_runner_health_incident_issue_chk
    check (issue_type in ('RUNNER_ERROR', 'STALE_HEARTBEAT')),
  constraint operations_runner_health_incident_status_chk
    check (incident_status in ('OPEN', 'RESOLVED'))
);

create unique index if not exists operations_runner_health_incident_open_idx
  on core.operations_runner_health_incident(runner_key)
  where incident_status = 'OPEN';

create index if not exists operations_runner_health_incident_pending_idx
  on core.operations_runner_health_incident(incident_status, failure_notified_at, recovery_notified_at);

alter table core.operations_runner_health_incident enable row level security;
revoke all on core.operations_runner_health_incident from public, anon, authenticated;
grant all on core.operations_runner_health_incident to service_role;

create or replace function core.refresh_operations_runner_health_incidents()
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_schedule core.operations_runner_schedule%rowtype;
  v_incident_id uuid;
  v_issue_type text;
  v_local_now timestamp;
  v_local_date date;
  v_day_override text;
  v_operates boolean;
  v_opened integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('operations-runner-health-monitor'));

  for v_schedule in
    select * from core.operations_runner_schedule order by runner_key
  loop
    v_local_now := now() at time zone v_schedule.timezone;
    v_local_date := v_local_now::date;
    v_day_override := upper(coalesce(
      v_schedule.report_config_json -> 'operating_date_overrides' ->> v_local_date::text,
      ''
    ));
    v_operates := case
      when v_day_override = 'OPERATING' then true
      when v_day_override = 'CLOSED' then false
      else coalesce(
        v_schedule.report_config_json -> 'operating_weekdays',
        '[1,2,3,4,5,6]'::jsonb
      ) @> to_jsonb(array[extract(dow from v_local_date)::integer])
    end;

    v_issue_type := case
      when upper(v_schedule.runner_state) = 'ERROR' then 'RUNNER_ERROR'
      when v_schedule.collection_enabled
        and v_schedule.operations_pulse_enabled
        and v_operates
        and v_local_now::time >= v_schedule.operations_pulse_start_time
        and v_local_now::time < v_schedule.operations_pulse_end_time
        and coalesce(v_schedule.runner_last_seen_at, '-infinity'::timestamptz)
          < now() - interval '45 minutes'
        then 'STALE_HEARTBEAT'
      else null
    end;

    select incident.id into v_incident_id
    from core.operations_runner_health_incident incident
    where incident.runner_key = v_schedule.runner_key
      and incident.incident_status = 'OPEN'
    for update;

    if v_issue_type is not null and v_incident_id is null then
      insert into core.operations_runner_health_incident (
        runner_key,
        company_id,
        issue_type,
        runner_state,
        runner_last_seen_at,
        runner_last_error
      ) values (
        v_schedule.runner_key,
        v_schedule.company_id,
        v_issue_type,
        v_schedule.runner_state,
        v_schedule.runner_last_seen_at,
        v_schedule.runner_last_error
      );
      v_opened := v_opened + 1;
    elsif v_issue_type is not null then
      update core.operations_runner_health_incident
      set issue_type = v_issue_type,
          last_observed_at = now(),
          runner_state = v_schedule.runner_state,
          runner_last_seen_at = v_schedule.runner_last_seen_at,
          runner_last_error = v_schedule.runner_last_error,
          updated_at = now()
      where id = v_incident_id;
      v_updated := v_updated + 1;
    elsif v_incident_id is not null then
      update core.operations_runner_health_incident
      set incident_status = 'RESOLVED',
          resolved_at = now(),
          last_observed_at = now(),
          runner_state = v_schedule.runner_state,
          runner_last_seen_at = v_schedule.runner_last_seen_at,
          runner_last_error = v_schedule.runner_last_error,
          updated_at = now()
      where id = v_incident_id;
      v_resolved := v_resolved + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'opened_count', v_opened,
    'updated_count', v_updated,
    'resolved_count', v_resolved
  );
end;
$$;

create or replace function core.get_pending_operations_runner_health_notifications()
returns setof jsonb
language plpgsql
security definer
set search_path = core, public
as $$
begin
  perform core.refresh_operations_runner_health_incidents();

  return query
  select jsonb_build_object(
    'incident_id', incident.id,
    'notification_kind', case
      when incident.incident_status = 'OPEN' then 'FAILURE'
      else 'RECOVERY'
    end,
    'issue_type', incident.issue_type,
    'incident_status', incident.incident_status,
    'company_slug', company.company_slug,
    'company_name', company.company_name,
    'runner_key', incident.runner_key,
    'runner_state', incident.runner_state,
    'runner_last_seen_at', incident.runner_last_seen_at,
    'runner_last_error', incident.runner_last_error,
    'opened_at', incident.opened_at,
    'last_observed_at', incident.last_observed_at,
    'resolved_at', incident.resolved_at,
    'recipients', coalesce(owner_recipients.emails, '[]'::jsonb)
  )
  from core.operations_runner_health_incident incident
  join core.companies company on company.id = incident.company_id
  left join lateral (
    select jsonb_agg(distinct nullif(btrim(profile.email), ''))
      filter (where nullif(btrim(profile.email), '') is not null) as emails
    from core.profiles profile
    where profile.is_platform_owner = true
      and lower(profile.profile_status) = 'active'
  ) owner_recipients on true
  where (
      incident.incident_status = 'OPEN'
      and incident.failure_notified_at is null
    ) or (
      incident.incident_status = 'RESOLVED'
      and incident.failure_notified_at is not null
      and incident.recovery_notified_at is null
    )
  order by incident.opened_at;
end;
$$;

create or replace function core.record_operations_runner_health_notification_result(
  p_incident_id uuid,
  p_notification_kind text,
  p_provider_id text,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_kind text := upper(trim(coalesce(p_notification_kind, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if v_kind not in ('FAILURE', 'RECOVERY') then
    raise exception 'Unsupported runner health notification kind.';
  end if;

  update core.operations_runner_health_incident
  set failure_notified_at = case
        when v_kind = 'FAILURE' and p_error is null then now()
        else failure_notified_at
      end,
      recovery_notified_at = case
        when v_kind = 'RECOVERY' and p_error is null then now()
        else recovery_notified_at
      end,
      notification_attempts = notification_attempts + 1,
      notification_provider_id = case
        when p_error is null then p_provider_id
        else notification_provider_id
      end,
      notification_last_error = p_error,
      updated_at = now()
  where id = p_incident_id;

  if not found then
    raise exception 'Runner health incident not found.';
  end if;

  return jsonb_build_object(
    'ok', p_error is null,
    'incident_id', p_incident_id,
    'notification_kind', v_kind
  );
end;
$$;

create or replace function public.get_pending_operations_runner_health_notifications()
returns setof jsonb
language sql
security definer
set search_path = public, core
as $$
  select * from core.get_pending_operations_runner_health_notifications();
$$;

create or replace function public.record_operations_runner_health_notification_result(
  p_incident_id uuid,
  p_notification_kind text,
  p_provider_id text,
  p_error text
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.record_operations_runner_health_notification_result(
    p_incident_id,
    p_notification_kind,
    p_provider_id,
    p_error
  );
$$;

revoke all on function public.get_pending_operations_runner_health_notifications()
  from public, anon, authenticated;
revoke all on function public.record_operations_runner_health_notification_result(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_pending_operations_runner_health_notifications()
  to service_role;
grant execute on function public.record_operations_runner_health_notification_result(uuid, text, text, text)
  to service_role;

comment on table core.operations_runner_health_incident is
  'Independent, deduplicated incident record for runner errors and missing continuous-runner heartbeats.';

notify pgrst, 'reload schema';

commit;
