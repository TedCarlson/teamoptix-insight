begin;

create or replace function public.itf_roster_relationship_context(p_company_slug text)
returns table (
  owner_company_id uuid, owner_company_name text, owner_company_slug text,
  affiliation_type text, engagement_participant_id uuid, relationship_id uuid,
  relationship_label text, relationship_status text, engagement_id uuid,
  engagement_status text, principal_company_name text, reporting_company_name text,
  engagement_location_id uuid, location_id uuid, location_code text,
  location_name text, region_name text, division_name text,
  engagement_office_id uuid, office_id uuid, office_name text, can_assign boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select v_company_id, workspace.company_name, workspace.company_slug, 'W-2'::text,
         null::uuid, null::uuid, 'Direct company workforce'::text, 'active'::text,
         null::uuid, 'active'::text, workspace.company_name, workspace.company_name,
         null::uuid, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name, null::uuid, office.id, office.office_name,
         (coalesce(location.location_status = 'active', true) and coalesce(office.office_status, 'active') = 'active')
  from core.companies workspace
  left join core.company_location location on location.company_id = workspace.id and location.location_status = 'active'
  left join core.company_location_office office on office.company_location_id = location.id and office.office_status = 'active'
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where workspace.id = v_company_id

  union all

  select participant.company_id, owner.company_name, owner.company_slug, 'Business Partner'::text,
         participant.id, relationship.id,
         principal.company_name || ' · ' || engagement.engagement_name,
         relationship.relationship_status, engagement.id, engagement.engagement_status,
         principal.company_name, reporting.company_name,
         engagement_location.id, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name,
         engagement_office.id, office.id, office.office_name,
         relationship.relationship_status = 'active'
           and engagement.engagement_status = 'active'
           and participant.participant_status = 'active'
           and engagement_location.location_status = 'active'
           and coalesce(engagement_office.office_status, 'active') = 'active'
  from core.company_engagement_participant participant
  join core.companies owner on owner.id = participant.company_id
  join core.company_engagement engagement on engagement.id = participant.engagement_id
  join core.company_relationship relationship on relationship.id = engagement.relationship_id
  join core.companies principal on principal.id = relationship.principal_company_id
  join core.companies reporting on reporting.id = participant.reporting_company_id
  join core.company_engagement_location engagement_location on engagement_location.engagement_id = engagement.id
  join core.company_location location on location.id = engagement_location.principal_company_location_id
  left join core.company_engagement_office engagement_office on engagement_office.engagement_location_id = engagement_location.id
  left join core.company_location_office office on office.id = engagement_office.principal_company_location_office_id
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where participant.company_id = v_company_id;
end;
$$;

revoke all on function public.itf_roster_relationship_context(text) from public, anon;
grant execute on function public.itf_roster_relationship_context(text) to authenticated;

commit;
