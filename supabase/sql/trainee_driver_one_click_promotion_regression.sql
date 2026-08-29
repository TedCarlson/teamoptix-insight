-- Run after 20260829113754_trainee_driver_one_click_promotion.sql.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_admin_user_id uuid := gen_random_uuid();
  v_admin_profile_id uuid := gen_random_uuid();
  v_driver_user_id uuid := gen_random_uuid();
  v_driver_profile_id uuid := gen_random_uuid();
  v_roster_id uuid := gen_random_uuid();
  v_result jsonb;
  v_projected integer;
  v_status text;
  v_role text;
  v_standard_rate numeric;
  v_standard_start date;
  v_trainee_rate numeric;
  v_trainee_end date;
  v_override_active boolean;
  v_historical_rate numeric;
begin
  insert into core.companies (
    id, company_name, company_slug, contact_email
  ) values (
    v_company_id,
    'One Click Promotion Regression',
    'one-click-promotion-' || left(v_company_id::text, 8),
    'promotion-regression@example.invalid'
  );

  insert into auth.users (id)
  values (v_admin_user_id), (v_driver_user_id);

  insert into core.profiles (
    id, auth_user_id, email, first_name, last_name
  ) values
    (
      v_admin_profile_id,
      v_admin_user_id,
      'promotion-admin@example.invalid',
      'Promotion',
      'Admin'
    ),
    (
      v_driver_profile_id,
      v_driver_user_id,
      'promotion-driver@example.invalid',
      'Promotion',
      'Driver'
    );

  insert into core.company_memberships (
    company_id, profile_id, membership_status, relationship_type, title
  ) values
    (v_company_id, v_admin_profile_id, 'active', 'admin', 'Administrator'),
    (v_company_id, v_driver_profile_id, 'active', 'member', 'Trainee');

  insert into core.company_roster (
    id,
    company_id,
    profile_id,
    full_name,
    worker_type,
    job_title,
    employment_status,
    hire_date
  ) values (
    v_roster_id,
    v_company_id,
    v_driver_profile_id,
    'One Click Trainee',
    'Trainee',
    'Trainee',
    'Trainee',
    date '2026-08-01'
  );

  insert into core.company_roster_operations_fact (
    roster_id, daily_pay_effective_date, daily_pay_rate
  ) values (
    v_roster_id, date '2026-08-01', 200
  );

  insert into core.company_roster_trainee_pay_override (
    company_id,
    roster_id,
    trainee_daily_pay_rate,
    effective_start,
    is_active
  ) values (
    v_company_id,
    v_roster_id,
    125,
    date '2026-08-01',
    true
  );

  insert into core.company_user_grant (
    company_id, profile_id, grant_key, is_active
  ) values (
    v_company_id, v_driver_profile_id, 'assets', true
  );

  insert into core.company_payroll_work_event (
    company_id,
    roster_member_id,
    service_date,
    event_type,
    note
  ) values (
    v_company_id,
    v_roster_id,
    date '2026-08-28',
    'TRAINING_DAY',
    'Historical trainee day before promotion.'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_user_id,
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public.promote_company_trainee_to_driver(
    'one-click-promotion-' || left(v_company_id::text, 8),
    v_roster_id,
    date '2026-08-29'
  );

  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Promotion failed: %', v_result;
  end if;

  select roster.employment_status, roster.worker_type
  into v_status, v_role
  from core.company_roster roster
  where roster.id = v_roster_id;

  if v_status <> 'Active' or v_role <> 'Driver' then
    raise exception 'Roster promotion did not persist: status %, role %.', v_status, v_role;
  end if;

  select operations.daily_pay_rate, operations.daily_pay_effective_date
  into v_standard_rate, v_standard_start
  from core.company_roster_operations_fact operations
  where operations.roster_id = v_roster_id;

  if v_standard_rate <> 200 or v_standard_start <> date '2026-08-29' then
    raise exception
      'Standard pay boundary is wrong: rate %, start %.',
      v_standard_rate,
      v_standard_start;
  end if;

  select
    override.trainee_daily_pay_rate,
    override.effective_end,
    override.is_active
  into v_trainee_rate, v_trainee_end, v_override_active
  from core.company_roster_trainee_pay_override override
  where override.company_id = v_company_id
    and override.roster_id = v_roster_id;

  if v_trainee_rate <> 125
     or v_trainee_end <> date '2026-08-28'
     or v_override_active then
    raise exception
      'Trainee pay boundary is wrong: rate %, end %, active %.',
      v_trainee_rate,
      v_trainee_end,
      v_override_active;
  end if;

  if exists (
    select 1
    from core.company_user_grant company_grant
    where company_grant.company_id = v_company_id
      and company_grant.profile_id = v_driver_profile_id
      and company_grant.grant_key = 'assets'
  ) then
    raise exception 'Driver promotion left the Assets management grant assigned.';
  end if;

  if not exists (
    select 1
    from core.company_roster_event event
    where event.company_id = v_company_id
      and event.roster_id = v_roster_id
      and event.event_type = 'trainee_promoted_to_driver'
  ) then
    raise exception 'Promotion audit event was not recorded.';
  end if;

  v_projected := core.project_payroll_work_events(
    v_company_id,
    date '2026-08-28',
    date '2026-08-28'
  );

  if v_projected <> 1 then
    raise exception 'Expected one historical payroll projection, received %.', v_projected;
  end if;

  select fact.daily_pay_rate
  into v_historical_rate
  from core.payroll_activity_fact fact
  where fact.company_id = v_company_id
    and fact.roster_member_id = v_roster_id
    and fact.service_date = date '2026-08-28';

  if v_historical_rate <> 125 then
    raise exception
      'Closed trainee range did not resolve historical payroll: rate %.',
      v_historical_rate;
  end if;
end;
$$;

rollback;
