begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_trainee_id uuid := gen_random_uuid();
  v_helper_id uuid := gen_random_uuid();
  v_dispatch_day_id uuid := gen_random_uuid();
  v_projected integer;
  v_source_kind text;
  v_daily_pay_rate numeric;
begin
  insert into core.companies (
    id,
    company_name,
    company_slug,
    contact_email
  )
  values (
    v_company_id,
    'Payroll Fallback Verification',
    'payroll-fallback-verification',
    'verification@example.invalid'
  );

  insert into core.company_roster (
    id,
    company_id,
    full_name,
    worker_type,
    employment_status
  )
  values
    (
      v_trainee_id,
      v_company_id,
      'Verification Trainee',
      'Driver',
      'Trainee'
    ),
    (
      v_helper_id,
      v_company_id,
      'Verification Helper',
      'Helper',
      'Active'
    );

  insert into core.company_roster_operations_fact (
    roster_id,
    daily_pay_effective_date,
    daily_pay_rate
  )
  values
    (v_trainee_id, date '2026-07-01', 200),
    (v_helper_id, date '2026-07-01', 90);

  insert into core.company_roster_trainee_pay_override (
    company_id,
    roster_id,
    trainee_daily_pay_rate,
    effective_start
  )
  values (
    v_company_id,
    v_trainee_id,
    125,
    date '2026-07-01'
  );

  insert into core.company_payroll_work_event (
    company_id,
    roster_member_id,
    service_date,
    event_type,
    note
  )
  values (
    v_company_id,
    v_trainee_id,
    date '2026-07-21',
    'TRAINING_DAY',
    'Verified training fallback.'
  );

  v_projected := core.project_payroll_work_events(
    v_company_id,
    date '2026-07-21',
    date '2026-07-21'
  );

  if v_projected <> 1 then
    raise exception
      'Expected one manual training projection, received %.',
      v_projected;
  end if;

  select source_kind, daily_pay_rate
  into v_source_kind, v_daily_pay_rate
  from core.payroll_activity_fact
  where company_id = v_company_id
    and roster_member_id = v_trainee_id
    and service_date = date '2026-07-21';

  if v_source_kind <> 'MANUAL_TRAINING' or v_daily_pay_rate <> 125 then
    raise exception
      'Training projection did not use the trainee override: source %, rate %.',
      v_source_kind,
      v_daily_pay_rate;
  end if;

  delete from core.payroll_activity_fact
  where company_id = v_company_id
    and roster_member_id = v_trainee_id
    and service_date = date '2026-07-21';

  insert into core.payroll_activity_fact (
    company_id,
    service_date,
    week_end_date,
    roster_member_id,
    person_name,
    activity_role,
    attendance_status,
    daily_pay_effective_date,
    daily_pay_rate,
    daily_pay_eligible,
    source_kind,
    source_ref_id
  )
  values (
    v_company_id,
    date '2026-07-21',
    date '2026-07-24',
    v_trainee_id,
    'Verification Trainee',
    'driver',
    'present',
    date '2026-07-01',
    200,
    true,
    'DSW_OWNERSHIP',
    gen_random_uuid()
  );

  v_projected := core.project_payroll_work_events(
    v_company_id,
    date '2026-07-21',
    date '2026-07-21'
  );

  if v_projected <> 0 then
    raise exception
      'Fallback projected over existing DSW evidence.';
  end if;

  insert into core.dispatch_day (
    id,
    company_id,
    dispatch_date
  )
  values (
    v_dispatch_day_id,
    v_company_id,
    date '2026-07-22'
  );

  insert into core.dispatch_event (
    dispatch_day_id,
    event_code,
    event_label,
    event_category,
    person_roster_member_id,
    person_name,
    note
  )
  values (
    v_dispatch_day_id,
    'ASSIGN_HELPER',
    'Assign helper',
    'DISPATCH',
    v_helper_id,
    'Verification Helper',
    'Verified dispatch helper fallback.'
  );

  v_projected := core.project_payroll_work_events(
    v_company_id,
    date '2026-07-22',
    date '2026-07-22'
  );

  if v_projected <> 1 then
    raise exception
      'Expected one dispatch helper projection, received %.',
      v_projected;
  end if;

  select source_kind, daily_pay_rate
  into v_source_kind, v_daily_pay_rate
  from core.payroll_activity_fact
  where company_id = v_company_id
    and roster_member_id = v_helper_id
    and service_date = date '2026-07-22';

  if v_source_kind <> 'DISPATCH_HELPER' or v_daily_pay_rate <> 90 then
    raise exception
      'Helper projection did not use base daily pay: source %, rate %.',
      v_source_kind,
      v_daily_pay_rate;
  end if;
end;
$$;

rollback;
