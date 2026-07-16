create or replace function core.update_company_roster_details(
  p_company_slug text,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_worker_type text,
  p_market_code text,
  p_notes text,
  p_date_of_birth date,
  p_hire_date date,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state_region text,
  p_postal_code text,
  p_license_number text,
  p_issuing_state text,
  p_license_issue_date date,
  p_license_expiration_date date,
  p_replace_blank_values boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to core, public
as $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  if not exists (
    select 1
    from core.company_roster r
    where r.id = p_roster_id
      and r.company_id = v_company_id
  ) then
    raise exception 'Roster record not found.';
  end if;

  update core.company_roster
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = nullif(trim(coalesce(p_worker_type, '')), ''),
      market_code = nullif(trim(coalesce(p_market_code, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      hire_date = p_hire_date
  where id = p_roster_id
    and company_id = v_company_id;

  perform core.upsert_company_roster_authoritative_facts(
    p_company_slug => p_company_slug,
    p_roster_id => p_roster_id,
    p_date_of_birth => p_date_of_birth,
    p_address_line_1 => p_address_line_1,
    p_address_line_2 => p_address_line_2,
    p_city => p_city,
    p_state_region => p_state_region,
    p_postal_code => p_postal_code,
    p_license_number => p_license_number,
    p_issuing_state => p_issuing_state,
    p_license_issue_date => p_license_issue_date,
    p_license_expiration_date => p_license_expiration_date,
    p_replace_blank_values => p_replace_blank_values
  );

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'operations',
    'details_updated',
    'Person details updated.',
    jsonb_build_object('source', 'person_workflow_drawer'),
    now()
  );

  return (
    select jsonb_build_object(
      'roster_member_id', r.id,
      'profile_id', r.profile_id,
      'full_name', r.full_name,
      'email', r.email,
      'phone', r.phone,
      'worker_type', r.worker_type,
      'market_code', r.market_code,
      'notes', r.notes,
      'hire_date', r.hire_date,
      'date_of_birth', pf.date_of_birth,
      'address_line_1', pf.address_line_1,
      'address_line_2', pf.address_line_2,
      'city', pf.city,
      'state_region', pf.state_region,
      'postal_code', pf.postal_code,
      'license_number', lf.license_number,
      'issuing_state', lf.issuing_state,
      'license_issue_date', lf.issue_date,
      'license_expiration_date', lf.expiration_date
    )
    from core.company_roster r
    left join core.company_roster_personal_fact pf
      on pf.roster_id = r.id
    left join core.company_roster_license_fact lf
      on lf.roster_id = r.id
    where r.id = p_roster_id
      and r.company_id = v_company_id
  );
end;
$$;

create or replace function public.update_company_roster_details(
  p_company_slug text,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_worker_type text,
  p_market_code text,
  p_notes text,
  p_date_of_birth date,
  p_hire_date date,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state_region text,
  p_postal_code text,
  p_license_number text,
  p_issuing_state text,
  p_license_issue_date date,
  p_license_expiration_date date,
  p_replace_blank_values boolean default true
) returns jsonb
language sql
security definer
set search_path to core, public
as $$
  select core.update_company_roster_details(
    p_company_slug,
    p_roster_id,
    p_full_name,
    p_email,
    p_phone,
    p_worker_type,
    p_market_code,
    p_notes,
    p_date_of_birth,
    p_hire_date,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_state_region,
    p_postal_code,
    p_license_number,
    p_issuing_state,
    p_license_issue_date,
    p_license_expiration_date,
    p_replace_blank_values
  );
$$;

do $$
declare
  v_signature text;
begin
  for v_signature in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_company_roster_details'
  loop
    execute format(
      'revoke all on function public.update_company_roster_details(%s) from public',
      v_signature
    );
    execute format(
      'grant execute on function public.update_company_roster_details(%s) to authenticated, service_role',
      v_signature
    );
  end loop;
end;
$$;
