\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_company_id uuid := gen_random_uuid();
  v_stage_type_id uuid := gen_random_uuid();
  v_result jsonb;
  v_roster_id uuid;
  v_unlinked_roster_id uuid := gen_random_uuid();
  v_license core.company_roster_license_fact%rowtype;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    created_at,
    updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'roster-fact-verification@example.invalid',
    now(),
    now()
  );

  insert into core.profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    is_platform_owner
  ) values (
    v_user_id,
    'roster-fact-verification@example.invalid',
    'Roster',
    'Verifier',
    true
  );

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into core.companies (
    id,
    company_name,
    company_slug,
    contact_email
  ) values (
    v_company_id,
    'Roster Fact Verification',
    'roster-fact-verification',
    'roster-fact-verification@example.invalid'
  );

  insert into core.candidate_stage_type (
    id,
    stage_key,
    default_label,
    is_terminal,
    is_active,
    sort_order
  ) values (
    v_stage_type_id,
    'candidate_created',
    'New',
    false,
    true,
    10
  );

  insert into core.company_candidate_stage_config (
    company_id,
    stage_type_id,
    display_label,
    is_enabled,
    sort_order
  ) values (
    v_company_id,
    v_stage_type_id,
    'New',
    true,
    10
  );

  v_result := public.create_company_candidate_from_overlay(
    'roster-fact-verification',
    'Company Owned Candidate',
    null,
    null,
    'Driver',
    'TEST',
    null,
    date '1990-01-02',
    'COMPANY-LICENSE-123',
    'PA',
    date '2025-01-01',
    date '2030-01-01',
    '1 Company Way',
    null,
    'Philadelphia',
    'PA',
    '19103',
    date '2026-08-01',
    null,
    null,
    null,
    null,
    null,
    130,
    'SAVE_ONLY'
  );

  v_roster_id := nullif(v_result->>'roster_id', '')::uuid;

  if v_roster_id is null then
    raise exception 'Candidate creation returned no roster_id: %', v_result;
  end if;

  if exists (
    select 1
    from core.company_roster
    where id = v_roster_id
      and profile_id is not null
  ) then
    raise exception 'Candidate creation linked a profile before app onboarding.';
  end if;

  select * into v_license
  from core.company_roster_license_fact
  where roster_id = v_roster_id;

  if not found then
    raise exception 'Candidate license did not land in company roster facts.';
  end if;

  if v_license.license_number is distinct from 'COMPANY-LICENSE-123'
     or v_license.issuing_state is distinct from 'PA'
     or v_license.issue_date is distinct from date '2025-01-01'
     or v_license.expiration_date is distinct from date '2030-01-01' then
    raise exception 'Company roster license values were not preserved: %',
      to_jsonb(v_license);
  end if;

  if not exists (
    select 1
    from core.company_roster_personal_fact
    where roster_id = v_roster_id
      and date_of_birth = date '1990-01-02'
      and address_line_1 = '1 Company Way'
  ) then
    raise exception 'Candidate personal data did not land in company roster facts.';
  end if;

  -- A roster record does not need a profile before company administrators can
  -- create and maintain its compliance facts.
  insert into core.company_roster (
    id,
    company_id,
    profile_id,
    full_name,
    worker_type,
    employment_status,
    market_code
  ) values (
    v_unlinked_roster_id,
    v_company_id,
    null,
    'Unlinked Roster Driver',
    'Driver',
    'Active',
    'TEST'
  );

  perform public.update_company_roster_details(
    'roster-fact-verification',
    v_unlinked_roster_id,
    'Unlinked Roster Driver',
    null,
    null,
    'Driver',
    'TEST',
    null,
    date '1991-02-03',
    date '2026-08-01',
    '2 Company Way',
    null,
    'Pittsburgh',
    'PA',
    '15222',
    'UNLINKED-LICENSE-456',
    'PA',
    date '2025-02-01',
    date '2030-02-01',
    true
  );

  if not exists (
    select 1
    from core.company_roster_license_fact
    where roster_id = v_unlinked_roster_id
      and license_number = 'UNLINKED-LICENSE-456'
      and issuing_state = 'PA'
      and issue_date = date '2025-02-01'
      and expiration_date = date '2030-02-01'
  ) then
    raise exception 'Unlinked roster license did not persist to company facts.';
  end if;
end;
$$;

rollback;
