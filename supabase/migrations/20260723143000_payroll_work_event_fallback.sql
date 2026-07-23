create table if not exists core.company_payroll_work_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  service_date date not null,
  event_type text not null,
  event_status text not null default 'ACTIVE',
  note text not null,
  created_by_profile_id uuid,
  reversed_at timestamptz,
  reversed_by_profile_id uuid,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_payroll_work_event_type_chk check (
    event_type = any (array['TRAINING_DAY', 'HELPER_DAY'])
  ),
  constraint company_payroll_work_event_status_chk check (
    event_status = any (array['ACTIVE', 'REVERSED'])
  ),
  constraint company_payroll_work_event_note_chk check (
    length(btrim(note)) > 0
  ),
  constraint company_payroll_work_event_reversal_chk check (
    (
      event_status = 'ACTIVE'
      and reversed_at is null
      and reversal_reason is null
    )
    or (
      event_status = 'REVERSED'
      and reversed_at is not null
      and length(btrim(coalesce(reversal_reason, ''))) > 0
    )
  )
);

drop index if exists core.company_payroll_work_event_active_uq;
create unique index company_payroll_work_event_active_uq
  on core.company_payroll_work_event (
    company_id,
    roster_member_id,
    service_date
  )
  where event_status = 'ACTIVE';

create index if not exists company_payroll_work_event_period_idx
  on core.company_payroll_work_event (company_id, service_date, event_status);

alter table core.company_payroll_work_event enable row level security;

drop policy if exists company_payroll_work_event_select_access
  on core.company_payroll_work_event;
create policy company_payroll_work_event_select_access
  on core.company_payroll_work_event
  for select
  to authenticated
  using (
    core.is_platform_owner()
    or core.can_access_company(company_id)
  );

create or replace view public.company_payroll_work_event_v
with (security_invoker = true) as
select
  event.id as work_event_id,
  event.company_id,
  company.company_slug,
  event.roster_member_id,
  roster.full_name as person_name,
  roster.worker_type,
  roster.employment_status,
  event.service_date,
  event.event_type,
  event.event_status,
  event.note,
  event.created_by_profile_id,
  event.reversed_at,
  event.reversed_by_profile_id,
  event.reversal_reason,
  event.created_at,
  event.updated_at
from core.company_payroll_work_event event
join core.companies company on company.id = event.company_id
join core.company_roster roster on roster.id = event.roster_member_id;

create or replace function public.create_company_payroll_work_event(
  p_company_slug text,
  p_roster_member_id uuid,
  p_service_date date,
  p_event_type text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_event_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_admin_company(v_company_id)
  ) then
    raise exception 'Company payroll administrator access is required.';
  end if;

  if p_event_type is null
    or p_event_type <> all (array['TRAINING_DAY', 'HELPER_DAY'])
  then
    raise exception 'Work event must be TRAINING_DAY or HELPER_DAY.';
  end if;

  if p_service_date is null or p_service_date > current_date then
    raise exception 'Work event service date must be today or a prior day.';
  end if;

  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'A reason or supporting note is required.';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'Roster member not found for this company.';
  end if;

  insert into core.company_payroll_work_event (
    company_id,
    roster_member_id,
    service_date,
    event_type,
    note,
    created_by_profile_id
  )
  values (
    v_company_id,
    p_roster_member_id,
    p_service_date,
    p_event_type,
    btrim(p_note),
    core.current_profile_id()
  )
  returning id into v_event_id;

  perform core.rebuild_payroll_activity_fact(
    v_company_id,
    p_service_date,
    p_service_date
  );
  perform core.project_payroll_work_events(
    v_company_id,
    p_service_date,
    p_service_date
  );

  return v_event_id;
exception
  when unique_violation then
    raise exception 'An active work event already exists for this person and date.';
end;
$$;

create or replace function public.reverse_company_payroll_work_event(
  p_company_slug text,
  p_work_event_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_service_date date;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_admin_company(v_company_id)
  ) then
    raise exception 'Company payroll administrator access is required.';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reversal reason is required.';
  end if;

  update core.company_payroll_work_event
  set
    event_status = 'REVERSED',
    reversed_at = now(),
    reversed_by_profile_id = core.current_profile_id(),
    reversal_reason = btrim(p_reason),
    updated_at = now()
  where id = p_work_event_id
    and company_id = v_company_id
    and event_status = 'ACTIVE'
  returning service_date into v_service_date;

  if not found then
    raise exception 'Active payroll work event not found.';
  end if;

  perform core.rebuild_payroll_activity_fact(
    v_company_id,
    v_service_date,
    v_service_date
  );
  perform core.project_payroll_work_events(
    v_company_id,
    v_service_date,
    v_service_date
  );

  return true;
end;
$$;

create or replace function core.project_payroll_work_events(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = public, core
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
      and override.is_active = true
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

create or replace function public.rebuild_payroll_activity_fact(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_base_result jsonb;
  v_event_rows integer;
begin
  v_base_result := core.rebuild_payroll_activity_fact(
    p_company_id,
    p_start_date,
    p_end_date
  );

  v_event_rows := core.project_payroll_work_events(
    p_company_id,
    p_start_date,
    p_end_date
  );

  return coalesce(v_base_result, '{}'::jsonb)
    || jsonb_build_object('event_rows', v_event_rows);
end;
$$;

revoke all on function public.create_company_payroll_work_event(
  text, uuid, date, text, text
) from public;
grant execute on function public.create_company_payroll_work_event(
  text, uuid, date, text, text
) to authenticated, service_role;

revoke all on function public.reverse_company_payroll_work_event(
  text, uuid, text
) from public;
grant execute on function public.reverse_company_payroll_work_event(
  text, uuid, text
) to authenticated, service_role;

revoke all on function public.rebuild_payroll_activity_fact(
  uuid, date, date
) from public;
grant execute on function public.rebuild_payroll_activity_fact(
  uuid, date, date
) to authenticated, service_role;

grant select on public.company_payroll_work_event_v to authenticated, service_role;

notify pgrst, 'reload schema';
