-- Walk-on payroll is an explicit, dated decision. Dispatch/DSW proves the
-- work; this event records how the receiving company wants payroll to treat it.

alter table core.company_payroll_work_event
  drop constraint if exists company_payroll_work_event_type_chk;

alter table core.company_payroll_work_event
  add constraint company_payroll_work_event_type_chk check (
    event_type = any (array['TRAINING_DAY'::text, 'HELPER_DAY'::text, 'WALK_ON_DAY'::text])
  );

alter table core.company_payroll_work_event
  add column if not exists pay_treatment text not null default 'ROSTER_RATE';

alter table core.company_payroll_work_event
  add column if not exists override_daily_pay_rate numeric(10,2);

alter table core.company_payroll_work_event
  drop constraint if exists company_payroll_work_event_pay_treatment_ck;

alter table core.company_payroll_work_event
  add constraint company_payroll_work_event_pay_treatment_ck check (
    pay_treatment = any (
      array['ROSTER_RATE'::text, 'ONE_DAY_RATE'::text, 'INTERCOMPANY'::text]
    )
    and (
      (pay_treatment = 'ONE_DAY_RATE' and override_daily_pay_rate > 0)
      or (pay_treatment <> 'ONE_DAY_RATE' and override_daily_pay_rate is null)
    )
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
  event.updated_at,
  event.pay_treatment,
  event.override_daily_pay_rate,
  roster.roster_record_kind
from core.company_payroll_work_event event
join core.companies company on company.id = event.company_id
join core.company_roster roster on roster.id = event.roster_member_id;

create or replace function core.project_payroll_walk_on_events(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
) returns integer
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_changed_count integer := 0;
  v_inserted_count integer := 0;
begin
  -- When DSW already supplied the production row, annotate and override that
  -- row instead of creating a duplicate work day.
  update core.payroll_activity_fact fact
  set
    activity_role = 'walk_on',
    source_kind = case
      when fact.source_kind = 'MANUAL_HELPER' and fact.source_ref_id = event.id
        then 'MANUAL_WALK_ON'
      else fact.source_kind
    end,
    daily_pay_effective_date = case
      when event.pay_treatment = 'ONE_DAY_RATE' then event.service_date
      when event.pay_treatment = 'ROSTER_RATE' then operations.daily_pay_effective_date
      else null
    end,
    daily_pay_rate = case
      when event.pay_treatment = 'ONE_DAY_RATE' then event.override_daily_pay_rate
      when event.pay_treatment = 'ROSTER_RATE' then operations.daily_pay_rate
      else null
    end,
    daily_pay_eligible = case
      when event.pay_treatment = 'ONE_DAY_RATE' then true
      when event.pay_treatment = 'ROSTER_RATE' then
        operations.daily_pay_rate is not null
        and (
          operations.daily_pay_effective_date is null
          or operations.daily_pay_effective_date <= event.service_date
        )
      else false
    end,
    review_flags = case
      when event.pay_treatment = 'INTERCOMPANY' then
        array_append(array_remove(fact.review_flags, 'MISSING_DAILY_PAY_RATE'), 'INTERCOMPANY_SETTLEMENT')
      when event.pay_treatment = 'ROSTER_RATE' and operations.daily_pay_rate is null then
        array_append(array_remove(fact.review_flags, 'INTERCOMPANY_SETTLEMENT'), 'MISSING_DAILY_PAY_RATE')
      else
        array_remove(array_remove(fact.review_flags, 'MISSING_DAILY_PAY_RATE'), 'INTERCOMPANY_SETTLEMENT')
    end,
    metadata_json = fact.metadata_json || jsonb_build_object(
      'walk_on_payroll_event_id', event.id,
      'walk_on_pay_treatment', event.pay_treatment,
      'walk_on_override_daily_pay_rate', event.override_daily_pay_rate
    ),
    updated_at = now()
  from core.company_payroll_work_event event
  left join core.company_roster_operations_fact operations
    on operations.roster_id = event.roster_member_id
  where event.company_id = p_company_id
    and event.service_date between p_start_date and p_end_date
    and event.event_type = 'WALK_ON_DAY'
    and event.event_status = 'ACTIVE'
    and fact.company_id = event.company_id
    and fact.service_date = event.service_date
    and fact.roster_member_id = event.roster_member_id
    and (
      fact.source_kind in ('DSW_ACTUAL', 'DSW_OWNERSHIP', 'DSW_CANDIDATE')
      or (fact.source_kind = 'MANUAL_HELPER' and fact.source_ref_id = event.id)
    );

  get diagnostics v_changed_count = row_count;

  -- If production evidence has not arrived yet, keep the explicit payroll
  -- event visible as a fallback row. A later DSW rebuild replaces it.
  insert into core.payroll_activity_fact (
    company_id,
    service_date,
    week_end_date,
    roster_member_id,
    person_name,
    activity_role,
    attendance_status,
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
  select
    event.company_id,
    event.service_date,
    event.service_date + (((5 - extract(dow from event.service_date)::int + 7) % 7))::int,
    event.roster_member_id,
    roster.full_name,
    'walk_on',
    'present',
    0,
    0,
    0,
    0,
    case
      when event.pay_treatment = 'ONE_DAY_RATE' then event.service_date
      when event.pay_treatment = 'ROSTER_RATE' then operations.daily_pay_effective_date
      else null
    end,
    case
      when event.pay_treatment = 'ONE_DAY_RATE' then event.override_daily_pay_rate
      when event.pay_treatment = 'ROSTER_RATE' then operations.daily_pay_rate
      else null
    end,
    case
      when event.pay_treatment = 'ONE_DAY_RATE' then true
      when event.pay_treatment = 'ROSTER_RATE' then
        operations.daily_pay_rate is not null
        and (
          operations.daily_pay_effective_date is null
          or operations.daily_pay_effective_date <= event.service_date
        )
      else false
    end,
    'MANUAL_WALK_ON',
    event.id,
    case
      when event.pay_treatment = 'INTERCOMPANY' then array['INTERCOMPANY_SETTLEMENT']::text[]
      when event.pay_treatment = 'ROSTER_RATE' and operations.daily_pay_rate is null then array['MISSING_DAILY_PAY_RATE']::text[]
      else '{}'::text[]
    end,
    jsonb_build_object(
      'event_type', event.event_type,
      'event_source', 'MANUAL',
      'source_event_id', event.id,
      'note', event.note,
      'walk_on_pay_treatment', event.pay_treatment,
      'walk_on_override_daily_pay_rate', event.override_daily_pay_rate,
      'fallback_only', true
    )
  from core.company_payroll_work_event event
  join core.company_roster roster
    on roster.id = event.roster_member_id
   and roster.company_id = event.company_id
   and roster.roster_record_kind = 'WALK_ON'
  left join core.company_roster_operations_fact operations
    on operations.roster_id = event.roster_member_id
  where event.company_id = p_company_id
    and event.service_date between p_start_date and p_end_date
    and event.event_type = 'WALK_ON_DAY'
    and event.event_status = 'ACTIVE'
    and not exists (
      select 1
      from core.payroll_activity_fact existing
      where existing.company_id = event.company_id
        and existing.service_date = event.service_date
        and existing.roster_member_id = event.roster_member_id
    );

  get diagnostics v_inserted_count = row_count;
  return v_changed_count + v_inserted_count;
end;
$$;

create or replace function public.create_company_walk_on_payroll_event(
  p_company_slug text,
  p_roster_member_id uuid,
  p_service_date date,
  p_pay_treatment text,
  p_override_daily_pay_rate numeric,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_event_id uuid;
  v_pay_treatment text := upper(btrim(coalesce(p_pay_treatment, '')));
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company payroll administrator access is required.';
  end if;
  if p_service_date is null or p_service_date > current_date then
    raise exception 'Walk-on payroll date must be today or a prior day.';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'A reason or supporting note is required.';
  end if;
  if v_pay_treatment not in ('ROSTER_RATE', 'ONE_DAY_RATE', 'INTERCOMPANY') then
    raise exception 'Choose roster rate, one-day rate, or intercompany treatment.';
  end if;
  if v_pay_treatment = 'ONE_DAY_RATE' and coalesce(p_override_daily_pay_rate, 0) <= 0 then
    raise exception 'A positive one-day rate is required.';
  end if;
  if v_pay_treatment <> 'ONE_DAY_RATE' and p_override_daily_pay_rate is not null then
    raise exception 'A one-day rate can only be supplied for one-day-rate treatment.';
  end if;
  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.roster_record_kind = 'WALK_ON'
  ) then
    raise exception 'Walk-on roster member not found for this company.';
  end if;
  if not exists (
    select 1
    from core.company_walk_on_assignment assignment
    where assignment.company_id = v_company_id
      and assignment.roster_member_id = p_roster_member_id
      and assignment.service_date = p_service_date
      and assignment.assignment_status = 'ACTIVE'
  ) then
    raise exception 'Create the dated walk-on assignment before its payroll override.';
  end if;

  insert into core.company_payroll_work_event (
    company_id,
    roster_member_id,
    service_date,
    event_type,
    note,
    pay_treatment,
    override_daily_pay_rate,
    created_by_profile_id
  ) values (
    v_company_id,
    p_roster_member_id,
    p_service_date,
    'WALK_ON_DAY',
    btrim(p_note),
    v_pay_treatment,
    case when v_pay_treatment = 'ONE_DAY_RATE' then p_override_daily_pay_rate else null end,
    core.current_profile_id()
  ) returning id into v_event_id;

  perform public.rebuild_payroll_activity_fact(
    v_company_id,
    p_service_date,
    p_service_date
  );

  return v_event_id;
exception
  when unique_violation then
    raise exception 'An active payroll event already exists for this person and date.';
end;
$$;

-- Preserve the base DSW and training/helper projections, then apply the
-- explicit walk-on treatment to the resulting person-day.
create or replace function public.rebuild_payroll_activity_fact(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_base_result jsonb;
  v_event_rows integer;
  v_walk_on_rows integer;
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

  v_walk_on_rows := core.project_payroll_walk_on_events(
    p_company_id,
    p_start_date,
    p_end_date
  );

  return coalesce(v_base_result, '{}'::jsonb) || jsonb_build_object(
    'event_rows', v_event_rows,
    'walk_on_event_rows', v_walk_on_rows
  );
end;
$$;

revoke all on function public.create_company_walk_on_payroll_event(
  text, uuid, date, text, numeric, text
) from public;
grant execute on function public.create_company_walk_on_payroll_event(
  text, uuid, date, text, numeric, text
) to authenticated, service_role;

grant select on public.company_payroll_work_event_v to authenticated, service_role;

notify pgrst, 'reload schema';
