begin;

-- Company operators may file their own roster row without rewriting the
-- source-owned FUSE status. Provider companies can manage candidates they own
-- even when ITG originally loaded the onboarding record.
create or replace function public.itf_set_onboarding_local_disposition(
  p_company_slug text,
  p_candidate_id uuid,
  p_disposition text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_current core.itf_onboarding_candidate_version%rowtype;
  v_new_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_disposition not in ('active', 'inactive', 'filed') then raise exception 'Unsupported local disposition.'; end if;
  select company.id into v_company_id from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  select current.* into v_current
  from core.itf_onboarding_candidate_version current
  where current.candidate_id = p_candidate_id
    and current.valid_to is null
    and (current.workspace_company_id = v_company_id or current.roster_company_id = v_company_id)
  for update;
  if v_current.id is null then raise exception 'Current onboarding record not found.'; end if;
  if v_current.local_disposition = p_disposition and v_current.local_disposition_reason is not distinct from nullif(btrim(p_reason), '') then
    return jsonb_build_object('candidateId', p_candidate_id, 'versionId', v_current.id, 'localDisposition', p_disposition, 'changed', false);
  end if;

  update core.itf_onboarding_candidate_version set valid_to = v_now where id = v_current.id;
  insert into core.itf_onboarding_candidate_version (
    candidate_id, workspace_company_id, roster_company_id, roster_id, source_system,
    source_identity_key, full_name, tech_id, fuse_personnel_id, location_code,
    source_office, contractor_type, fuse_processing_start_date, fuse_status,
    note_update_date, last_note, status_update_at, source_status_effective_at,
    source_payload, source_payload_hash, local_disposition,
    local_disposition_reason, local_disposition_at, local_disposition_by_profile_id,
    valid_from, supersedes_version_id, source_batch_id, source_row_id, created_by_profile_id
  ) select
    candidate_id, workspace_company_id, roster_company_id, roster_id, source_system,
    source_identity_key, full_name, tech_id, fuse_personnel_id, location_code,
    source_office, contractor_type, fuse_processing_start_date, fuse_status,
    note_update_date, last_note, status_update_at, source_status_effective_at,
    source_payload, source_payload_hash, p_disposition, nullif(btrim(p_reason), ''),
    v_now, core.current_profile_id(), v_now, v_current.id, source_batch_id,
    source_row_id, core.current_profile_id()
  from core.itf_onboarding_candidate_version where id = v_current.id
  returning id into v_new_id;

  return jsonb_build_object('candidateId', p_candidate_id, 'versionId', v_new_id, 'localDisposition', p_disposition, 'changed', true);
end;
$$;

revoke all on function public.itf_set_onboarding_local_disposition(text, uuid, text, text) from public, anon;
grant execute on function public.itf_set_onboarding_local_disposition(text, uuid, text, text) to authenticated;

create or replace function public.itf_update_onboarding_roster_identity(
  p_company_slug text,
  p_candidate_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_identifiers jsonb,
  p_local_disposition text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_candidate core.itf_onboarding_candidate_version%rowtype;
  v_employment_status text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_local_disposition not in ('active', 'inactive', 'filed') then raise exception 'Unsupported local disposition.'; end if;
  select company.id into v_company_id from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  select current.* into v_candidate
  from core.itf_onboarding_candidate_version current
  where current.candidate_id = p_candidate_id
    and current.valid_to is null
    and current.roster_id is not null
    and (current.workspace_company_id = v_company_id or current.roster_company_id = v_company_id)
  for update;
  if v_candidate.id is null then raise exception 'Current onboarding candidate not found.'; end if;

  perform core.itf_write_onboarding_roster_identity(
    v_candidate.roster_id, p_full_name, p_email, p_phone, p_identifiers
  );
  perform public.itf_set_onboarding_local_disposition(
    p_company_slug, p_candidate_id, p_local_disposition,
    case when p_local_disposition = 'active' then null else 'Filed from the company roster.' end
  );

  v_employment_status := case when p_local_disposition = 'active' then 'Candidate' else 'Former' end;
  update core.company_roster
  set employment_status = v_employment_status,
      separation_date = case when v_employment_status = 'Former' then coalesce(separation_date, current_date) else null end
  where id = v_candidate.roster_id;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, created_by_profile_id
  ) values (
    v_candidate.roster_company_id, v_candidate.roster_id, 'onboarding',
    'onboarding_roster_identity_updated',
    'Roster details and local disposition updated without changing the source-owned FUSE status.',
    jsonb_build_object(
      'workspace_company_id', v_candidate.workspace_company_id,
      'candidate_id', v_candidate.candidate_id,
      'fuse_status', v_candidate.fuse_status,
      'local_disposition', p_local_disposition,
      'employment_status', v_employment_status
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true, 'roster_id', v_candidate.roster_id,
    'candidate_id', v_candidate.candidate_id,
    'fuse_status', v_candidate.fuse_status,
    'local_disposition', p_local_disposition,
    'employment_status', v_employment_status
  );
end;
$$;

revoke all on function public.itf_update_onboarding_roster_identity(
  text, uuid, text, text, text, jsonb, text
) from public, anon;
grant execute on function public.itf_update_onboarding_roster_identity(
  text, uuid, text, text, text, jsonb, text
) to authenticated;

commit;
