begin;

create or replace function public.create_candidate_entry_link(
  p_company_slug text,
  p_link_type text,
  p_label text,
  p_role_key text default null,
  p_location_key text default null,
  p_assignment_key text default null,
  p_scheduling_policy text default 'required',
  p_bypass_reason text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public, extensions
as $$
declare
  v_company core.companies%rowtype;
  v_profile_id uuid := core.current_profile_id();
  v_link core.candidate_entry_link%rowtype;
  v_code text;
begin
  select * into v_company from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company.id)) then raise exception 'Forbidden.'; end if;
  if p_link_type not in ('company_general', 'company_invite', 'member_referral') then raise exception 'Unsupported entry link type.'; end if;
  if p_scheduling_policy = 'bypassed' and p_link_type <> 'company_invite' then raise exception 'Only a candidate-specific company invitation may bypass the interview.'; end if;

  if p_link_type = 'company_general' then
    select * into v_link from core.candidate_entry_link
    where company_id = v_company.id and link_type = 'company_general' and status = 'active'
    order by created_at desc limit 1;
    if v_link.id is not null then return to_jsonb(v_link); end if;
    v_code := v_company.company_slug;
  else
    v_code := encode(extensions.gen_random_bytes(18), 'hex');
  end if;

  insert into core.candidate_entry_link (
    company_id, entry_code, link_type, label, referrer_profile_id,
    role_key, location_key, assignment_key, scheduling_policy, bypass_reason,
    expires_at, max_uses, created_by_profile_id
  ) values (
    v_company.id, v_code, p_link_type,
    coalesce(nullif(btrim(p_label), ''), initcap(replace(p_link_type, '_', ' '))),
    case when p_link_type = 'member_referral' then v_profile_id else null end,
    nullif(btrim(coalesce(p_role_key, '')), ''), nullif(btrim(coalesce(p_location_key, '')), ''),
    nullif(btrim(coalesce(p_assignment_key, '')), ''), p_scheduling_policy,
    nullif(btrim(coalesce(p_bypass_reason, '')), ''), p_expires_at,
    case when p_link_type = 'company_invite' then coalesce(p_max_uses, 1) else p_max_uses end,
    v_profile_id
  ) returning * into v_link;
  return to_jsonb(v_link);
end;
$$;

create or replace function public.submit_candidate_foyer_application(
  p_company_slug text, p_entry_code text, p_profile_id uuid, p_email text,
  p_first_name text, p_last_name text, p_phone text, p_role_interest text,
  p_location_interest text, p_assignment_key text, p_work_history text,
  p_interview_slot_id uuid, p_timezone text
) returns jsonb
language plpgsql
security definer
set search_path = core, public, ref, extensions
as $$
declare
  v_experience jsonb;
  v_company_id uuid;
  v_industry_id uuid;
  v_link core.candidate_entry_link%rowtype;
  v_source_type text := 'organic';
  v_scheduling_policy text := 'required';
  v_claim_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_application core.candidate_application%rowtype;
  v_slot core.candidate_interview_slot%rowtype;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null or nullif(btrim(coalesce(p_first_name, '')), '') is null or nullif(btrim(coalesce(p_last_name, '')), '') is null then raise exception 'Email, first name, and last name are required.'; end if;
  v_experience := public.get_candidate_foyer_experience(p_company_slug, p_entry_code);
  v_company_id := nullif(v_experience #>> '{company,id}', '')::uuid;
  v_industry_id := nullif(v_experience #>> '{company,industry_id}', '')::uuid;
  v_source_type := coalesce(v_experience #>> '{entry,source_type}', 'organic');
  v_scheduling_policy := coalesce(v_experience #>> '{entry,scheduling_policy}', 'required');
  if nullif(v_experience #>> '{entry,id}', '') is not null then select * into v_link from core.candidate_entry_link where id = (v_experience #>> '{entry,id}')::uuid for update; end if;
  if p_profile_id is not null and not exists (select 1 from core.profiles where id = p_profile_id and lower(email) = lower(btrim(p_email))) then raise exception 'Authenticated profile does not match the application email.'; end if;

  insert into core.candidate_application (
    company_id, profile_id, entry_link_id, source_type, referrer_profile_id, email,
    first_name, last_name, phone, role_interest, location_interest, assignment_key,
    work_history, application_status, association_status, scheduling_policy,
    workflow_snapshot, claim_token_hash, claim_expires_at, claimed_at, consent_at
  ) values (
    v_company_id, p_profile_id, v_link.id, v_source_type, v_link.referrer_profile_id,
    lower(btrim(p_email)), btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_phone, '')), ''),
    coalesce(nullif(btrim(coalesce(p_role_interest, '')), ''), v_link.role_key),
    coalesce(nullif(btrim(coalesce(p_location_interest, '')), ''), v_link.location_key),
    coalesce(nullif(btrim(coalesce(p_assignment_key, '')), ''), v_link.assignment_key),
    nullif(btrim(coalesce(p_work_history, '')), ''),
    case when v_scheduling_policy = 'bypassed' then 'requirements' when p_interview_slot_id is not null then 'interview_scheduled' else 'interview_pending' end,
    case when p_profile_id is not null then 'claimed' when v_company_id is not null then 'targeted' else 'unassociated' end,
    v_scheduling_policy, v_experience, encode(extensions.digest(v_claim_token, 'sha256'), 'hex'), now() + interval '14 days',
    case when p_profile_id is not null then now() else null end, now()
  ) returning * into v_application;

  insert into core.candidate_application_requirement (
    application_id, company_id, definition_id, requirement_key, label, description,
    category, phase, evidence_type, source_scope, is_required, is_blocking
  )
  select v_application.id, v_company_id, resolved.id, resolved.requirement_key, resolved.label,
    resolved.description, resolved.category, resolved.phase, resolved.evidence_type,
    resolved.scope_type, resolved.is_required, resolved.is_blocking
  from (
    select distinct on (definition.requirement_key) definition.*
    from core.candidate_requirement_definition definition
    where definition.is_active = true
      and (definition.scope_type = 'generic' or (definition.scope_type = 'industry' and definition.industry_id = v_industry_id) or (definition.scope_type = 'company' and definition.company_id = v_company_id))
      and (definition.role_key is null or definition.role_key = v_application.role_interest)
      and (definition.location_key is null or definition.location_key = v_application.location_interest)
      and (definition.assignment_key is null or definition.assignment_key = v_application.assignment_key)
      and (definition.worker_type is null or definition.worker_type = 'contractor')
    order by definition.requirement_key, case definition.scope_type when 'company' then 3 when 'industry' then 2 else 1 end desc, definition.sort_order
  ) resolved;

  if v_scheduling_policy = 'bypassed' then
    insert into core.candidate_interview (application_id, company_id, interview_status, bypass_reason, next_step)
    values (v_application.id, v_company_id, 'bypassed', v_link.bypass_reason, coalesce(v_link.metadata->>'next_step', 'Continue with the company-defined next step.'));
  elsif p_interview_slot_id is not null then
    select * into v_slot from core.candidate_interview_slot where id = p_interview_slot_id and company_id = v_company_id and slot_status = 'open' and starts_at > now() for update;
    if v_slot.id is null then raise exception 'The selected interview time is no longer available.'; end if;
    update core.candidate_interview_slot set slot_status = 'booked' where id = v_slot.id;
    insert into core.candidate_interview (application_id, company_id, slot_id, interviewer_profile_id, interview_status, starts_at, ends_at, timezone, meeting_provider, meeting_url)
    values (v_application.id, v_company_id, v_slot.id, v_slot.interviewer_profile_id, 'scheduled', v_slot.starts_at, v_slot.ends_at, coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), v_slot.timezone), v_slot.meeting_provider, v_slot.meeting_url);
  else
    insert into core.candidate_interview (application_id, company_id, interview_status, timezone)
    values (v_application.id, v_company_id, 'scheduling_required', coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York'));
  end if;

  if v_link.id is not null then update core.candidate_entry_link set use_count = use_count + 1, status = case when max_uses is not null and use_count + 1 >= max_uses then 'expired' else status end where id = v_link.id; end if;
  return jsonb_build_object('ok', true, 'application_id', v_application.id, 'claim_token', case when p_profile_id is null then v_claim_token else null end, 'profile_linked', p_profile_id is not null, 'company_id', v_company_id, 'application_status', v_application.application_status, 'scheduling_policy', v_scheduling_policy);
end;
$$;

create or replace function public.claim_candidate_foyer_application(p_application_id uuid, p_claim_token text)
returns jsonb
language plpgsql
security definer
set search_path = core, public, extensions
as $$
declare
  v_profile core.profiles%rowtype;
  v_application core.candidate_application%rowtype;
begin
  select * into v_profile from core.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then raise exception 'Authenticated profile required.'; end if;
  select * into v_application from core.candidate_application where id = p_application_id for update;
  if v_application.id is null then raise exception 'Application not found.'; end if;
  if v_application.profile_id is not null and v_application.profile_id <> v_profile.id then raise exception 'Application is already linked to another profile.'; end if;
  if lower(v_application.email) <> lower(v_profile.email) then raise exception 'Profile email does not match the application.'; end if;
  if v_application.claim_expires_at < now() or v_application.claim_token_hash <> encode(extensions.digest(coalesce(p_claim_token, ''), 'sha256'), 'hex') then raise exception 'Application claim is invalid or expired.'; end if;
  update core.candidate_application set profile_id = v_profile.id, association_status = 'claimed', claimed_at = now(), claim_token_hash = null, claim_expires_at = null where id = v_application.id;
  return jsonb_build_object('ok', true, 'application_id', v_application.id, 'profile_id', v_profile.id);
end;
$$;

commit;
