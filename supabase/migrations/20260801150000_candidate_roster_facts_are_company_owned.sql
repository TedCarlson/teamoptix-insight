-- Candidate and roster facts belong to the company roster record. A profile is
-- optional and must never be required to retain compliance data.

-- Heal records created after the original ownership backfill. These inserts
-- never overwrite an existing company-owned fact.
insert into core.company_roster_personal_fact (
  roster_id,
  date_of_birth,
  address_line_1,
  address_line_2,
  city,
  state_region,
  postal_code,
  created_at,
  updated_at
)
select
  r.id,
  pf.date_of_birth,
  pf.address_line_1,
  pf.address_line_2,
  pf.city,
  pf.state_region,
  pf.postal_code,
  coalesce(pf.created_at, now()),
  coalesce(pf.updated_at, now())
from core.company_roster r
join core.profile_private_fact pf
  on pf.profile_id = r.profile_id
left join core.company_roster_personal_fact existing
  on existing.roster_id = r.id
where existing.roster_id is null
on conflict (roster_id) do nothing;

insert into core.company_roster_license_fact (
  roster_id,
  license_number,
  issuing_state,
  issue_date,
  expiration_date,
  created_at,
  updated_at
)
select
  r.id,
  license.license_number,
  license.issuing_state,
  license.issue_date,
  license.expiration_date,
  license.created_at,
  license.updated_at
from core.company_roster r
join lateral (
  select candidate_license.*
  from core.profile_driver_license candidate_license
  where candidate_license.profile_id = r.profile_id
  order by candidate_license.created_at desc, candidate_license.id desc
  limit 1
) license on true
left join core.company_roster_license_fact existing
  on existing.roster_id = r.id
where existing.roster_id is null
on conflict (roster_id) do nothing;

-- Preserve the old profile-creating implementation behind an inaccessible
-- compatibility name. The public entry point below creates only the company
-- roster record and its company-owned facts. Onboarding links a real profile
-- later, after the driver joins the app.
alter function public.create_company_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) rename to create_company_candidate_from_overlay_profile_legacy;

create function public.create_company_candidate_from_overlay(
  p_company_slug text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_worker_type text,
  p_market_code text,
  p_note text,
  p_date_of_birth date,
  p_license_number text,
  p_issuing_state text,
  p_license_issue_date date,
  p_license_expiration_date date,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state_region text,
  p_postal_code text,
  p_start_date date,
  p_end_date date,
  p_fx_id text,
  p_dswid text,
  p_dot_expiration_date date,
  p_qual_cert_expiration_date date,
  p_daily_pay_rate numeric,
  p_invite_action text
) returns jsonb
language plpgsql
security definer
set search_path to core, public
as $$
declare
  v_company_id uuid;
  v_stage_type_id uuid;
  v_roster_id uuid;
  v_full_name text;
  v_roster_email text;
  v_phone text;
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

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  v_roster_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  if v_full_name is null then
    raise exception 'Candidate name is required.';
  end if;

  select stage_type_id into v_stage_type_id
  from public.company_candidate_stage_config_v
  where company_id = v_company_id
    and stage_key = 'candidate_created'
    and is_enabled = true
  limit 1;

  if v_stage_type_id is null then
    raise exception 'Candidate stage seed missing.';
  end if;

  insert into core.company_roster (
    company_id,
    profile_id,
    full_name,
    email,
    phone,
    worker_type,
    market_code,
    hire_date,
    separation_date,
    employment_status,
    invite_status,
    compliance_summary,
    notes
  ) values (
    v_company_id,
    null,
    v_full_name,
    v_roster_email,
    v_phone,
    nullif(btrim(coalesce(p_worker_type, '')), ''),
    nullif(btrim(coalesce(p_market_code, '')), ''),
    p_start_date,
    p_end_date,
    'Candidate',
    'Not Invited',
    'Missing',
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_roster_id;

  perform core.upsert_company_roster_authoritative_facts(
    p_company_slug => p_company_slug,
    p_roster_id => v_roster_id,
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
    p_replace_blank_values => true
  );

  perform public.update_company_roster_operations(
    p_company_slug,
    v_roster_id,
    p_fx_id,
    p_dswid,
    null::text,
    p_dot_expiration_date,
    p_qual_cert_expiration_date,
    coalesce(p_start_date, current_date),
    coalesce(p_daily_pay_rate, 130),
    null::text,
    null::text
  );

  insert into core.roster_candidate_stage (
    company_id,
    roster_id,
    stage_type_id,
    note
  ) values (
    v_company_id,
    v_roster_id,
    v_stage_type_id,
    nullif(btrim(coalesce(p_note, '')), '')
  );

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  ) values (
    v_company_id,
    v_roster_id,
    'hiring',
    'candidate_created',
    'Candidate record created from intake overlay.',
    jsonb_build_object(
      'source', 'add_candidate_overlay',
      'invite_action', coalesce(p_invite_action, 'SAVE_ONLY'),
      'profile_deferred_until_join', true,
      'license_intake_present',
        nullif(btrim(coalesce(p_license_number, '')), '') is not null,
      'personal_intake_present',
        p_date_of_birth is not null
        or nullif(btrim(coalesce(p_address_line_1, '')), '') is not null
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster_id,
    'profile_id', null
  );
end;
$$;

revoke all on function public.create_company_candidate_from_overlay_profile_legacy(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) from public, anon, authenticated, service_role;

revoke all on function public.create_company_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) from public, anon;

grant execute on function public.create_company_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) to authenticated, service_role;

comment on function public.create_company_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) is
  'Creates a profile-independent candidate and atomically persists personal and license facts to company roster storage.';
