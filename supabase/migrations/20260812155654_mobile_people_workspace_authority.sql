begin;

-- Candidate stage is shared by web and native. Keep one authoritative
-- mutation while enforcing the same company workspace grant at the database
-- boundary so a native authenticated client cannot bypass web routing.
create or replace function public.candidate_stage_set(
  p_company_slug text,
  p_roster_id uuid,
  p_stage_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_stage_type_id uuid;
  v_result jsonb;
begin
  select profile.id
  into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  if v_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_REQUIRED';
  end if;

  if not core.mobile_companion_can_use_workspace(v_company_id, 'hiring') then
    raise exception 'HIRING_GRANT_REQUIRED';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_id
      and roster.company_id = v_company_id
      and roster.employment_status = 'Candidate'
  ) then
    raise exception 'ACTIVE_CANDIDATE_REQUIRED';
  end if;

  select stage_type.id
  into v_stage_type_id
  from core.candidate_stage_type stage_type
  join core.company_candidate_stage_config config
    on config.stage_type_id = stage_type.id
   and config.company_id = v_company_id
   and config.is_enabled = true
  where stage_type.stage_key = btrim(p_stage_key)
    and stage_type.is_active = true
  limit 1;

  if v_stage_type_id is null then
    raise exception 'CANDIDATE_STAGE_NOT_ENABLED';
  end if;

  insert into core.roster_candidate_stage (
    company_id,
    roster_id,
    stage_type_id,
    note,
    updated_by_profile_id,
    updated_at
  )
  values (
    v_company_id,
    p_roster_id,
    v_stage_type_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_profile_id,
    pg_catalog.now()
  )
  on conflict (company_id, roster_id) do update set
    stage_type_id = excluded.stage_type_id,
    note = excluded.note,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = pg_catalog.now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at,
    created_by_profile_id
  )
  values (
    v_company_id,
    p_roster_id,
    'hiring',
    'candidate_stage_updated',
    'Candidate stage updated',
    jsonb_build_object(
      'stage_key', btrim(p_stage_key),
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'source', 'governed_candidate_stage'
    ),
    pg_catalog.now(),
    v_profile_id
  );

  select jsonb_build_object(
    'roster_id', fact.roster_id,
    'stage_key', stage.stage_key,
    'stage_label', coalesce(stage.default_label, stage.stage_key),
    'is_terminal', stage.is_terminal,
    'note', fact.note,
    'updated_at', fact.updated_at
  )
  into v_result
  from core.roster_candidate_stage fact
  join core.candidate_stage_type stage on stage.id = fact.stage_type_id
  where fact.company_id = v_company_id
    and fact.roster_id = p_roster_id;

  return v_result;
end;
$$;

revoke all on function public.candidate_stage_set(text, uuid, text, text)
  from public, anon;
grant execute on function public.candidate_stage_set(text, uuid, text, text)
  to authenticated, service_role;

comment on function public.candidate_stage_set(text, uuid, text, text) is
  'Updates the existing candidate workflow after validating the authenticated actor, active company, hiring grant, candidate scope, and enabled company stage.';

commit;
