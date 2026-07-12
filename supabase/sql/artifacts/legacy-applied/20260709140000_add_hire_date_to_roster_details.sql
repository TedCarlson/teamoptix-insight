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
  p_license_expiration_date date
)
returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $function$
declare
  v_company_id uuid;
  v_profile_id uuid;
  v_existing_license_id uuid;
  v_first_name text;
  v_last_name text;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  select profile_id into v_profile_id
  from core.company_roster
  where id = p_roster_id and company_id = v_company_id;

  if not found then raise exception 'Roster record not found.'; end if;

  v_first_name := coalesce(nullif(split_part(coalesce(p_full_name, ''), ' ', 1), ''), 'Unknown');
  v_last_name := coalesce(nullif(trim(regexp_replace(coalesce(p_full_name, ''), '^\S+\s*', '')), ''), 'Unknown');

  update core.company_roster
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = nullif(trim(coalesce(p_worker_type, '')), ''),
      market_code = nullif(trim(coalesce(p_market_code, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      hire_date = p_hire_date
  where id = p_roster_id and company_id = v_company_id;

  if v_profile_id is not null then
    update core.profiles
    set email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), email),
        first_name = v_first_name,
        last_name = v_last_name,
        display_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), display_name),
        mobile_phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), mobile_phone),
        updated_at = now()
    where id = v_profile_id;

    insert into core.profile_private_fact (
      profile_id, date_of_birth, address_line_1, address_line_2,
      city, state_region, postal_code, updated_at
    )
    values (
      v_profile_id,
      p_date_of_birth,
      nullif(trim(coalesce(p_address_line_1, '')), ''),
      nullif(trim(coalesce(p_address_line_2, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_state_region, '')), ''),
      nullif(trim(coalesce(p_postal_code, '')), ''),
      now()
    )
    on conflict (profile_id) do update set
      date_of_birth = excluded.date_of_birth,
      address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2,
      city = excluded.city,
      state_region = excluded.state_region,
      postal_code = excluded.postal_code,
      updated_at = now();

    if nullif(trim(coalesce(p_license_number, '')), '') is not null then
      select id into v_existing_license_id
      from core.profile_driver_license
      where profile_id = v_profile_id
      order by created_at desc
      limit 1;

      if v_existing_license_id is null then
        insert into core.profile_driver_license (
          profile_id, license_number, issuing_state, issue_date, expiration_date
        )
        values (
          v_profile_id,
          trim(p_license_number),
          trim(coalesce(p_issuing_state, '')),
          p_license_issue_date,
          p_license_expiration_date
        );
      else
        update core.profile_driver_license
        set license_number = trim(p_license_number),
            issuing_state = trim(coalesce(p_issuing_state, '')),
            issue_date = p_license_issue_date,
            expiration_date = p_license_expiration_date,
            updated_at = now()
        where id = v_existing_license_id;
      end if;
    end if;
  end if;

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
      'license_number', dl.license_number,
      'issuing_state', dl.issuing_state,
      'license_issue_date', dl.issue_date,
      'license_expiration_date', dl.expiration_date
    )
    from core.company_roster r
    left join core.profile_private_fact pf
      on pf.profile_id = r.profile_id
    left join lateral (
      select *
      from core.profile_driver_license l
      where l.profile_id = r.profile_id
      order by l.created_at desc
      limit 1
    ) dl on true
    where r.id = p_roster_id
      and r.company_id = v_company_id
  );
end;
$function$;


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
  p_license_expiration_date date
)
returns jsonb
language sql
security definer
set search_path to 'public', 'core'
as $function$
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
    p_license_expiration_date
  );
$function$;
