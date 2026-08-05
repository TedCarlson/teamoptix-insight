-- Rollback-only regression coverage for the four protected identifier
-- consumers plus drawer persistence and candidate promotion.
-- Run against the disposable local Supabase database only.

begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000091',
  'authenticated',
  'authenticated',
  'identifier-regression@example.test',
  '',
  now(),
  now(),
  now()
);

insert into core.profiles (
  id, auth_user_id, email, first_name, last_name, is_platform_owner
) values (
  '00000000-0000-4000-8000-000000000092',
  '00000000-0000-4000-8000-000000000091',
  'identifier-regression@example.test',
  'Identifier',
  'Regression',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000091',
  true
);

insert into core.companies (
  id, company_name, company_slug, contact_email
) values (
  '00000000-0000-4000-8000-000000000093',
  'Identifier Regression Company',
  'identifier-regression',
  'ops@example.test'
);

insert into core.company_roster (
  id, company_id, full_name, worker_type, employment_status
) values
  (
    '00000000-0000-4000-8000-000000000094',
    '00000000-0000-4000-8000-000000000093',
    'Authoritative Driver',
    'Driver',
    'Active'
  ),
  (
    '00000000-0000-4000-8000-000000000095',
    '00000000-0000-4000-8000-000000000093',
    'Trainee Candidate',
    'Driver',
    'Candidate'
  ),
  (
    '00000000-0000-4000-8000-000000000096',
    '00000000-0000-4000-8000-000000000093',
    'Active Candidate',
    'Driver',
    'Candidate'
  );

insert into core.company_roster_operations_fact (
  roster_id, fx_id, dswid, daily_pay_rate
) values (
  '00000000-0000-4000-8000-000000000094',
  'LEGACY-FX',
  'LEGACY-DSW',
  175
);

insert into core.company_roster_identifier (
  roster_id, identifier_type, identifier_value
) values
  ('00000000-0000-4000-8000-000000000094', 'fx_id', 'AUTH-FX'),
  ('00000000-0000-4000-8000-000000000094', 'dswid', 'AUTH-DSW');

do $$
declare
  v_resolved uuid;
  v_payroll record;
  v_score jsonb;
  v_driver jsonb;
begin
  v_resolved := core.resolve_roster_identity(
    '00000000-0000-4000-8000-000000000093',
    null,
    'AUTH-DSW',
    null
  );

  if v_resolved is distinct from '00000000-0000-4000-8000-000000000094'::uuid then
    raise exception 'Resolver regression: authoritative DSWID did not resolve.';
  end if;

  if core.resolve_roster_identity(
    '00000000-0000-4000-8000-000000000093',
    null,
    'LEGACY-DSW',
    null
  ) is not null then
    raise exception 'Resolver regression: legacy DSWID remained active.';
  end if;

  select * into v_payroll
  from core.payroll_identity_resolved
  where roster_member_id = '00000000-0000-4000-8000-000000000094';

  if v_payroll.fx_id is distinct from 'AUTH-FX'
     or v_payroll.dswid is distinct from 'AUTH-DSW' then
    raise exception 'Payroll identity regression: authoritative identifiers were not used.';
  end if;

  v_score := public.get_company_driver_scorecard_index(
    '00000000-0000-4000-8000-000000000093',
    current_date - 30,
    current_date,
    current_date
  );

  select value into v_driver
  from jsonb_array_elements(v_score -> 'drivers') value
  where value ->> 'roster_id' = '00000000-0000-4000-8000-000000000094';

  if v_driver is null
     or v_driver ->> 'fx_id' is distinct from 'AUTH-FX'
     or v_driver ->> 'dswid' is distinct from 'AUTH-DSW' then
    raise exception 'Scorecard regression: authoritative driver identity was not returned.';
  end if;
end;
$$;

select public.update_company_roster_operations(
  'identifier-regression',
  '00000000-0000-4000-8000-000000000094',
  'AUTH-FX-UPDATED',
  'AUTH-DSW-UPDATED',
  null,
  null,
  null,
  current_date,
  180,
  null,
  null
);

do $$
begin
  if not exists (
    select 1
    from core.company_roster_identifier
    where roster_id = '00000000-0000-4000-8000-000000000094'
      and identifier_type = 'fx_id'
      and identifier_value = 'AUTH-FX-UPDATED'
  ) then
    raise exception 'Drawer persistence regression: FX ID was not authoritative.';
  end if;

  if not exists (
    select 1
    from core.company_roster_operations_fact
    where roster_id = '00000000-0000-4000-8000-000000000094'
      and fx_id = 'LEGACY-FX'
  ) then
    raise exception 'Compatibility regression: refactor unexpectedly mutated legacy identity.';
  end if;
end;
$$;

select core.import_company_roster_rows(
  'identifier-regression',
  jsonb_build_array(jsonb_build_object(
    'approved', true,
    'import_decision', 'NEW',
    'row_number', 1,
    'full_name', 'Imported Driver',
    'worker_type', 'Driver',
    'employment_status', 'Active',
    'fx_id', 'IMPORTED-FX',
    'dswid', 'IMPORTED-DSW',
    'daily_pay_rate', '165'
  ))
);

do $$
declare
  v_imported_id uuid;
begin
  select id into v_imported_id
  from core.company_roster
  where company_id = '00000000-0000-4000-8000-000000000093'
    and full_name = 'Imported Driver';

  if v_imported_id is null then
    raise exception 'Import regression: roster member was not created.';
  end if;

  if not exists (
    select 1
    from core.company_roster_identifier
    where roster_id = v_imported_id
      and identifier_type = 'fx_id'
      and identifier_value = 'IMPORTED-FX'
  ) or not exists (
    select 1
    from core.company_roster_identifier
    where roster_id = v_imported_id
      and identifier_type = 'dswid'
      and identifier_value = 'imported-dsw'
  ) then
    raise exception 'Import regression: identifiers did not reach the authoritative source.';
  end if;
end;
$$;

insert into core.company_roster_trainee_pay_override (
  company_id,
  roster_id,
  trainee_daily_pay_rate,
  effective_start,
  is_active
) values
  (
    '00000000-0000-4000-8000-000000000093',
    '00000000-0000-4000-8000-000000000095',
    110,
    current_date - 10,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000093',
    '00000000-0000-4000-8000-000000000096',
    115,
    current_date - 10,
    true
  );

select public.promote_company_candidate(
  'identifier-regression',
  '00000000-0000-4000-8000-000000000095',
  'Trainee',
  125,
  null
);

select public.promote_company_candidate(
  'identifier-regression',
  '00000000-0000-4000-8000-000000000096',
  'Active',
  null,
  185
);

do $$
begin
  if not exists (
    select 1 from core.company_roster
    where id = '00000000-0000-4000-8000-000000000095'
      and employment_status = 'Trainee'
  ) or not exists (
    select 1 from core.company_roster_trainee_pay_override
    where roster_id = '00000000-0000-4000-8000-000000000095'
      and trainee_daily_pay_rate = 125
      and is_active
  ) then
    raise exception 'Promotion regression: Trainee status and pay were not atomic.';
  end if;

  if not exists (
    select 1 from core.company_roster_trainee_pay_override
    where roster_id = '00000000-0000-4000-8000-000000000095'
      and trainee_daily_pay_rate = 110
      and not is_active
      and effective_end = current_date - 1
  ) then
    raise exception 'Promotion regression: prior trainee rate history was not closed correctly.';
  end if;

  if not exists (
    select 1 from core.company_roster roster
    join core.company_roster_operations_fact operations
      on operations.roster_id = roster.id
    where roster.id = '00000000-0000-4000-8000-000000000096'
      and roster.employment_status = 'Active'
      and operations.daily_pay_rate = 185
  ) then
    raise exception 'Promotion regression: Active status and baseline pay were not atomic.';
  end if;

  if not exists (
    select 1 from core.company_roster_trainee_pay_override
    where roster_id = '00000000-0000-4000-8000-000000000096'
      and trainee_daily_pay_rate = 115
      and not is_active
      and effective_end = current_date - 1
  ) then
    raise exception 'Promotion regression: Active promotion did not close trainee pay correctly.';
  end if;
end;
$$;

rollback;
