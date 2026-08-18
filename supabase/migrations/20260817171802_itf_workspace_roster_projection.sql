begin;

-- Return the roster rows visible inside one ITF company workspace.
-- A company always sees the roster it owns. A principal company also sees only
-- provider-owned rows that have a current assignment through one of its
-- engagements. Provider roster rows outside that seam remain private.
create or replace function public.itf_workspace_roster(p_company_slug text)
returns setof public.itf_company_roster_v
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select projection.*
  from public.itf_company_roster_v projection
  where projection.company_id = v_company_id
     or exists (
       select 1
       from core.itf_workforce_assignment assignment
       join core.company_engagement_participant participant
         on participant.id = assignment.engagement_participant_id
       join core.company_engagement engagement
         on engagement.id = participant.engagement_id
       join core.company_relationship relationship
         on relationship.id = engagement.relationship_id
       where assignment.id = projection.assignment_id
         and assignment.effective_end is null
         and relationship.principal_company_id = v_company_id
     )
  order by projection.full_name, projection.roster_member_id;
end;
$$;

revoke all on function public.itf_workspace_roster(text) from public, anon;
grant execute on function public.itf_workspace_roster(text) to authenticated;

commit;
