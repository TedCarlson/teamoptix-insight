-- A candidate entered manually by company HR is already an intentional hiring
-- action. Create the company-owned candidate record and advance it to
-- onboarding in one transaction, while leaving Foyer intake unchanged.

create or replace function public.create_company_onboarding_candidate_from_overlay(
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
security invoker
set search_path to public, core
as $$
declare
  v_result jsonb;
  v_roster_id uuid;
  v_stage jsonb;
begin
  v_result := public.create_company_candidate_from_overlay(
    p_company_slug,
    p_full_name,
    p_email,
    p_phone,
    p_worker_type,
    p_market_code,
    p_note,
    p_date_of_birth,
    p_license_number,
    p_issuing_state,
    p_license_issue_date,
    p_license_expiration_date,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_state_region,
    p_postal_code,
    p_start_date,
    p_end_date,
    p_fx_id,
    p_dswid,
    p_dot_expiration_date,
    p_qual_cert_expiration_date,
    p_daily_pay_rate,
    p_invite_action
  );

  v_roster_id := nullif(v_result->>'roster_id', '')::uuid;

  if v_roster_id is null then
    raise exception 'Candidate creation returned no roster id.';
  end if;

  v_stage := public.candidate_stage_set(
    p_company_slug,
    v_roster_id,
    'onboarding',
    coalesce(
      nullif(btrim(coalesce(p_note, '')), ''),
      'Candidate entered manually by company HR.'
    )
  );

  return v_result || jsonb_build_object(
    'stage_key', 'onboarding',
    'stage', v_stage
  );
end;
$$;

revoke all on function public.create_company_onboarding_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) from public, anon;

grant execute on function public.create_company_onboarding_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) to authenticated, service_role;

comment on function public.create_company_onboarding_candidate_from_overlay(
  text, text, text, text, text, text, text, date, text, text, date, date,
  text, text, text, text, text, date, date, text, text, date, date,
  numeric, text
) is
  'Atomically creates a profile-independent manual candidate and begins the company onboarding stage.';
