\set ON_ERROR_STOP on

begin;

insert into core.companies (
  id,
  company_name,
  company_slug,
  contact_email
) values (
  '10000000-0000-0000-0000-000000000001',
  'Resignation Regression Company',
  'resignation-regression-company',
  'regression@example.invalid'
);

insert into core.company_roster (
  id,
  company_id,
  full_name,
  employment_status
) values (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Notice Driver',
  'Active'
);

insert into public.schedule_preset (
  id,
  company_id,
  preset_code,
  works_s,
  works_u,
  works_m,
  works_t,
  works_w,
  works_h,
  works_f
) values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'NOTICE_TEST',
  true,
  true,
  true,
  true,
  true,
  true,
  true
);

-- Recreate the production defect: the baseline retained its full historical
-- identity but was closed immediately when notice was submitted.
insert into public.schedule_baseline (
  id,
  company_id,
  roster_member_id,
  preset_id,
  rotation_mode,
  anchor_date,
  effective_start,
  effective_end,
  is_active
) values (
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  'NONE',
  '2026-06-05',
  '2026-06-05',
  '2026-08-14',
  false
);

insert into public.schedule_override (
  id,
  company_id,
  terminal_id,
  roster_member_id,
  override_type,
  start_date,
  end_date,
  is_active,
  workflow_status,
  separation_effective_date,
  schedule_baseline_id
) values (
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000002',
  'RESIGNATION_NOTICE',
  '2026-08-04',
  '2026-08-14',
  true,
  'COUNTDOWN_ACTIVE',
  '2026-08-15',
  '10000000-0000-0000-0000-000000000004'
);

select core.repaint_resignation_schedule(
  '10000000-0000-0000-0000-000000000005'
);

do $$
declare
  v_active boolean;
  v_effective_end date;
  v_first_date date;
  v_last_date date;
  v_row_count integer;
  v_post_notice_count integer;
begin
  select is_active, effective_end
  into v_active, v_effective_end
  from public.schedule_baseline
  where id = '10000000-0000-0000-0000-000000000004';

  if v_active is not true or v_effective_end is not null then
    raise exception 'Baseline was not preserved as active and open during notice';
  end if;

  select min(service_date), max(service_date), count(*)
  into v_first_date, v_last_date, v_row_count
  from public.schedule_day_fact
  where company_id = '10000000-0000-0000-0000-000000000001'
    and roster_member_id = '10000000-0000-0000-0000-000000000002';

  if v_first_date <> '2026-08-04'
     or v_last_date <> '2026-08-14'
     or v_row_count <> 11 then
    raise exception 'Notice repaint did not preserve the complete through-last-day range';
  end if;

  select count(*) into v_post_notice_count
  from public.resolve_schedule_projection(
    '10000000-0000-0000-0000-000000000001',
    '2026-08-04',
    70
  )
  where service_date > '2026-08-14';

  if v_post_notice_count <> 0 then
    raise exception 'Projection produced rows after the established last day';
  end if;
end;
$$;

-- Moving the last day repaints the same baseline rather than replacing it.
update public.schedule_override
set end_date = '2026-08-16',
    separation_effective_date = '2026-08-17'
where id = '10000000-0000-0000-0000-000000000005';

select core.repaint_resignation_schedule(
  '10000000-0000-0000-0000-000000000005'
);

do $$
declare
  v_last_date date;
begin
  select max(service_date) into v_last_date
  from public.schedule_day_fact
  where company_id = '10000000-0000-0000-0000-000000000001'
    and roster_member_id = '10000000-0000-0000-0000-000000000002';

  if v_last_date <> '2026-08-16' then
    raise exception 'Changed last day did not move the projection cap';
  end if;
end;
$$;

-- Separation completion closes the baseline only after the notice period.
update public.schedule_override
set workflow_status = 'NOTIFICATION_PENDING'
where id = '10000000-0000-0000-0000-000000000005';

do $$
declare
  v_active boolean;
  v_effective_end date;
begin
  select is_active, effective_end
  into v_active, v_effective_end
  from public.schedule_baseline
  where id = '10000000-0000-0000-0000-000000000004';

  if v_active is not false or v_effective_end <> '2026-08-16' then
    raise exception 'Baseline did not close on completed separation';
  end if;
end;
$$;

rollback;
