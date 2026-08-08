-- A walk-on assignment is production evidence, not pay authorization.
-- Until an explicit one-day rate or intercompany treatment is recorded, the
-- person-day stays in payroll at $0 with a review signal.

create or replace function core.guard_unresolved_walk_on_payroll_assignments(
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
begin
  update core.payroll_activity_fact fact
  set
    activity_role = 'walk_on',
    daily_pay_effective_date = null,
    daily_pay_rate = null,
    daily_pay_eligible = false,
    review_flags = array_append(
      array_remove(
        array_remove(
          array_remove(coalesce(fact.review_flags, '{}'::text[]), 'MISSING_DAILY_PAY_RATE'),
          'INTERCOMPANY_SETTLEMENT'
        ),
        'WALK_ON_PAY_OVERRIDE_REQUIRED'
      ),
      'WALK_ON_PAY_OVERRIDE_REQUIRED'
    ),
    metadata_json = coalesce(fact.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'walk_on_assignment_id', assignment.id,
      'walk_on_pay_override_required', true
    ),
    updated_at = now()
  from core.company_walk_on_assignment assignment
  where assignment.company_id = p_company_id
    and assignment.service_date between p_start_date and p_end_date
    and assignment.assignment_status = 'ACTIVE'
    and fact.company_id = assignment.company_id
    and fact.service_date = assignment.service_date
    and fact.roster_member_id = assignment.roster_member_id
    and not exists (
      select 1
      from core.company_payroll_work_event event
      where event.company_id = assignment.company_id
        and event.roster_member_id = assignment.roster_member_id
        and event.service_date = assignment.service_date
        and event.event_type = 'WALK_ON_DAY'
        and event.event_status = 'ACTIVE'
        and event.pay_treatment in ('ONE_DAY_RATE', 'INTERCOMPANY')
    );

  get diagnostics v_changed_count = row_count;
  return v_changed_count;
end;
$$;

-- Rebuild ordering stays base evidence -> fallback work events -> explicit
-- walk-on pay -> unresolved walk-on guard. The guard excludes valid explicit
-- treatments, so it cannot erase an approved one-day rate.
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
  v_walk_on_review_rows integer;
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

  v_walk_on_review_rows := core.guard_unresolved_walk_on_payroll_assignments(
    p_company_id,
    p_start_date,
    p_end_date
  );

  return coalesce(v_base_result, '{}'::jsonb) || jsonb_build_object(
    'event_rows', v_event_rows,
    'walk_on_event_rows', v_walk_on_rows,
    'walk_on_review_rows', v_walk_on_review_rows
  );
end;
$$;

-- Future walk-on payroll events must make a deliberate one-day or
-- intercompany decision. A roster rate is never inferred for support labor.
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
  if v_pay_treatment not in ('ONE_DAY_RATE', 'INTERCOMPANY') then
    raise exception 'Choose a one-day rate or intercompany treatment.';
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

-- Heal already-projected unresolved assignments immediately; the next normal
-- payroll rebuild will preserve the same invariant.
update core.payroll_activity_fact fact
set
  activity_role = 'walk_on',
  daily_pay_effective_date = null,
  daily_pay_rate = null,
  daily_pay_eligible = false,
  review_flags = array_append(
    array_remove(
      array_remove(
        array_remove(coalesce(fact.review_flags, '{}'::text[]), 'MISSING_DAILY_PAY_RATE'),
        'INTERCOMPANY_SETTLEMENT'
      ),
      'WALK_ON_PAY_OVERRIDE_REQUIRED'
    ),
    'WALK_ON_PAY_OVERRIDE_REQUIRED'
  ),
  metadata_json = coalesce(fact.metadata_json, '{}'::jsonb) || jsonb_build_object(
    'walk_on_assignment_id', assignment.id,
    'walk_on_pay_override_required', true
  ),
  updated_at = now()
from core.company_walk_on_assignment assignment
where assignment.assignment_status = 'ACTIVE'
  and fact.company_id = assignment.company_id
  and fact.service_date = assignment.service_date
  and fact.roster_member_id = assignment.roster_member_id
  and not exists (
    select 1
    from core.company_payroll_work_event event
    where event.company_id = assignment.company_id
      and event.roster_member_id = assignment.roster_member_id
      and event.service_date = assignment.service_date
      and event.event_type = 'WALK_ON_DAY'
      and event.event_status = 'ACTIVE'
      and event.pay_treatment in ('ONE_DAY_RATE', 'INTERCOMPANY')
  );

revoke all on function core.guard_unresolved_walk_on_payroll_assignments(
  uuid, date, date
) from public;

notify pgrst, 'reload schema';
