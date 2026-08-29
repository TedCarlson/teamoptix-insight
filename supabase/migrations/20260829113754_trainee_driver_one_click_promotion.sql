begin;

-- Promote a trainee through one governed transaction. The standard daily rate
-- is already captured during candidate onboarding; promotion only establishes
-- the clean boundary between the temporary trainee interval and Driver pay.
create or replace function public.promote_company_trainee_to_driver(
  p_company_slug text,
  p_roster_id uuid,
  p_effective_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_effective_date date := coalesce(
    p_effective_date,
    (now() at time zone 'America/New_York')::date
  );
  v_standard_daily_pay_rate numeric;
  v_role_result jsonb;
  v_status_result jsonb;
  v_role_context jsonb;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;

  if not core.can_admin_company(v_company_id) then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  select roster.*
  into v_roster
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.id = p_roster_id
  for update;

  if v_roster.id is null then
    return jsonb_build_object('error', 'Roster member not found.');
  end if;

  if v_roster.employment_status <> 'Trainee' then
    return jsonb_build_object('error', 'Only a trainee can be promoted to Driver.');
  end if;

  select operations.daily_pay_rate
  into v_standard_daily_pay_rate
  from core.company_roster_operations_fact operations
  where operations.roster_id = v_roster.id
  for update;

  -- Older roster records may have the standard daily amount only in the
  -- compensation model. Use it automatically instead of making the manager
  -- repair payroll data during promotion.
  if coalesce(v_standard_daily_pay_rate, 0) <= 0 then
    select compensation.amount
    into v_standard_daily_pay_rate
    from core.company_person_compensation compensation
    where compensation.company_id = v_company_id
      and compensation.roster_member_id = v_roster.id
      and compensation.status = 'ACTIVE'
      and compensation.pay_frequency = 'DAILY'
      and (
        compensation.effective_start_date is null
        or compensation.effective_start_date <= v_effective_date
      )
      and (
        compensation.effective_end_date is null
        or compensation.effective_end_date >= v_effective_date
      )
    order by compensation.effective_start_date desc nulls last,
             compensation.updated_at desc
    limit 1;
  end if;

  if coalesce(v_standard_daily_pay_rate, 0) <= 0 then
    return jsonb_build_object(
      'error',
      'This trainee has no standard daily rate. Add it to the roster record before promotion.'
    );
  end if;

  v_role_result := core.apply_company_person_role_change(
    p_company_slug,
    p_roster_id,
    'Driver',
    null,
    array[]::text[]
  );

  if v_role_result ? 'error' then
    raise exception '%', v_role_result ->> 'error';
  end if;

  insert into core.company_roster_operations_fact (
    roster_id,
    daily_pay_rate,
    daily_pay_effective_date,
    updated_at
  ) values (
    v_roster.id,
    v_standard_daily_pay_rate,
    v_effective_date,
    now()
  )
  on conflict (roster_id) do update
  set daily_pay_rate = excluded.daily_pay_rate,
      daily_pay_effective_date = excluded.daily_pay_effective_date,
      updated_at = excluded.updated_at;

  update core.company_roster_trainee_pay_override override
  set is_active = false,
      effective_end = v_effective_date - 1,
      updated_at = now()
  where override.company_id = v_company_id
    and override.roster_id = v_roster.id
    and override.is_active;

  -- Driver is a workforce role, not a management workspace grant. Clear the
  -- product-specific Assets grant in the same transaction as the promotion.
  if v_roster.profile_id is not null then
    delete from core.company_user_grant company_grant
    where company_grant.company_id = v_company_id
      and company_grant.profile_id = v_roster.profile_id
      and company_grant.grant_key = 'assets';
  end if;

  v_status_result := public.roster_set_employment_status(
    p_company_slug,
    p_roster_id,
    'Active',
    v_effective_date,
    'Promoted from Trainee to Driver'
  );

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at,
    created_by_profile_id
  ) values (
    v_company_id,
    v_roster.id,
    'operations',
    'trainee_promoted_to_driver',
    'Trainee promoted to Driver with payroll dates adjusted automatically.',
    jsonb_build_object(
      'source', 'one_click_roster_promotion',
      'prior_role', v_roster.worker_type,
      'prior_status', v_roster.employment_status,
      'effective_date', v_effective_date,
      'trainee_pay_effective_end', v_effective_date - 1,
      'standard_daily_pay_rate', v_standard_daily_pay_rate,
      'status_result', v_status_result
    ),
    now(),
    core.current_profile_id()
  );

  v_role_context := core.get_company_person_role_context(
    p_company_slug,
    p_roster_id
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster.id,
    'employment_status', 'Active',
    'role_label', 'Driver',
    'effective_date', v_effective_date,
    'trainee_pay_effective_end', v_effective_date - 1,
    'standard_daily_pay_rate', v_standard_daily_pay_rate,
    'role_context', v_role_context
  );
end;
$$;

comment on function public.promote_company_trainee_to_driver(text, uuid, date) is
  'Atomically promotes a Trainee to Driver, closes trainee pay through the prior day, and activates the standard daily rate.';

revoke all on function public.promote_company_trainee_to_driver(text, uuid, date)
  from public, anon;
grant execute on function public.promote_company_trainee_to_driver(text, uuid, date)
  to authenticated, service_role;

-- A closed override remains valid historical payroll evidence. Date ranges,
-- not the current-state flag, determine which rate applies to a service day.
create or replace function core.project_payroll_work_events(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted_count integer := 0;
begin
  insert into core.payroll_activity_fact (
    company_id,
    service_date,
    week_end_date,
    roster_member_id,
    person_name,
    activity_role,
    attendance_status,
    route_name,
    wa_number,
    threshold_stops,
    threshold_rate,
    threshold_overage,
    threshold_pay_amount,
    daily_pay_effective_date,
    daily_pay_rate,
    daily_pay_eligible,
    source_kind,
    source_ref_id,
    review_flags,
    metadata_json
  )
  with reversed_dispatch_events as (
    select distinct nullif(event.event_payload ->> 'reverses_event_id', '')
      as event_id
    from core.dispatch_event event
    join core.dispatch_day day on day.id = event.dispatch_day_id
    where day.company_id = p_company_id
      and day.dispatch_date between p_start_date and p_end_date
      and event.event_payload ? 'reverses_event_id'
  ),
  dispatch_candidates as (
    select
      day.company_id,
      day.dispatch_date as service_date,
      event.person_roster_member_id as roster_member_id,
      case
        when event.event_code in ('ASSIGN_TRAINEE', 'ADD_TRAINEE')
          then 'TRAINING_DAY'
        else 'HELPER_DAY'
      end as event_type,
      event.id as source_ref_id,
      event.route_label,
      event.route_key,
      event.note,
      event.created_at,
      'DISPATCH'::text as event_source,
      2 as source_priority
    from core.dispatch_event event
    join core.dispatch_day day on day.id = event.dispatch_day_id
    left join reversed_dispatch_events reversed
      on reversed.event_id = event.id::text
    where day.company_id = p_company_id
      and day.dispatch_date between p_start_date and p_end_date
      and event.person_roster_member_id is not null
      and event.event_code in (
        'ASSIGN_TRAINEE',
        'ADD_TRAINEE',
        'ASSIGN_HELPER',
        'ADD_HELPER'
      )
      and reversed.event_id is null
  ),
  manual_candidates as (
    select
      event.company_id,
      event.service_date,
      event.roster_member_id,
      event.event_type,
      event.id as source_ref_id,
      null::text as route_label,
      null::text as route_key,
      event.note,
      event.created_at,
      'MANUAL'::text as event_source,
      1 as source_priority
    from core.company_payroll_work_event event
    where event.company_id = p_company_id
      and event.service_date between p_start_date and p_end_date
      and event.event_status = 'ACTIVE'
  ),
  candidates as (
    select * from manual_candidates
    union all
    select * from dispatch_candidates
  ),
  chosen as (
    select distinct on (
      candidate.company_id,
      candidate.service_date,
      candidate.roster_member_id
    )
      candidate.*
    from candidates candidate
    order by
      candidate.company_id,
      candidate.service_date,
      candidate.roster_member_id,
      candidate.source_priority,
      case candidate.event_type when 'TRAINING_DAY' then 1 else 2 end,
      candidate.created_at
  )
  select
    chosen.company_id,
    chosen.service_date,
    chosen.service_date
      + (((5 - extract(dow from chosen.service_date)::int + 7) % 7))::int,
    chosen.roster_member_id,
    roster.full_name,
    case chosen.event_type
      when 'TRAINING_DAY' then 'trainee'
      else 'helper'
    end,
    'present',
    chosen.route_label,
    chosen.route_key,
    0,
    0,
    0,
    0,
    case
      when chosen.event_type = 'TRAINING_DAY'
        then trainee_rate.effective_start
      else operations.daily_pay_effective_date
    end,
    case
      when chosen.event_type = 'TRAINING_DAY'
        then trainee_rate.trainee_daily_pay_rate
      else operations.daily_pay_rate
    end,
    case
      when chosen.event_type = 'TRAINING_DAY'
        then trainee_rate.trainee_daily_pay_rate is not null
      else (
        operations.daily_pay_rate is not null
        and (
          operations.daily_pay_effective_date is null
          or operations.daily_pay_effective_date <= chosen.service_date
        )
      )
    end,
    case
      when chosen.event_source = 'MANUAL'
        and chosen.event_type = 'TRAINING_DAY'
        then 'MANUAL_TRAINING'
      when chosen.event_source = 'MANUAL'
        then 'MANUAL_HELPER'
      when chosen.event_type = 'TRAINING_DAY'
        then 'DISPATCH_TRAINING'
      else 'DISPATCH_HELPER'
    end,
    chosen.source_ref_id,
    case
      when chosen.event_type = 'TRAINING_DAY'
        and trainee_rate.trainee_daily_pay_rate is null
        then array['MISSING_TRAINEE_RATE']
      when chosen.event_type = 'HELPER_DAY'
        and (
          operations.daily_pay_rate is null
          or (
            operations.daily_pay_effective_date is not null
            and operations.daily_pay_effective_date > chosen.service_date
          )
        )
        then array['MISSING_DAILY_PAY_RATE']
      else '{}'::text[]
    end,
    jsonb_build_object(
      'event_type', chosen.event_type,
      'event_source', chosen.event_source,
      'source_event_id', chosen.source_ref_id,
      'note', chosen.note,
      'route_key', chosen.route_key,
      'route_label', chosen.route_label,
      'fallback_only', true
    )
  from chosen
  join core.company_roster roster
    on roster.id = chosen.roster_member_id
   and roster.company_id = chosen.company_id
  left join core.company_roster_operations_fact operations
    on operations.roster_id = chosen.roster_member_id
  left join lateral (
    select
      override.trainee_daily_pay_rate,
      override.effective_start
    from core.company_roster_trainee_pay_override override
    where override.company_id = chosen.company_id
      and override.roster_id = chosen.roster_member_id
      and (override.is_active or override.effective_end is not null)
      and override.effective_start <= chosen.service_date
      and (
        override.effective_end is null
        or chosen.service_date <= override.effective_end
      )
    order by override.effective_start desc
    limit 1
  ) trainee_rate on true
  where not exists (
    select 1
    from core.payroll_activity_fact existing
    where existing.company_id = chosen.company_id
      and existing.service_date = chosen.service_date
      and existing.roster_member_id = chosen.roster_member_id
  );

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

notify pgrst, 'reload schema';

commit;
