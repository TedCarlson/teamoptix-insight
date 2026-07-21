drop function if exists public.list_opportunity_model_versions(text, uuid);

create function public.list_opportunity_model_versions(p_company_slug text, p_analysis_id uuid default null)
returns table (
  id uuid, analysis_id uuid, version_number integer, version_name text,
  opportunity_number text, station_name text, assumption_snapshot jsonb,
  result_snapshot jsonb, created_at timestamptz
)
language sql stable security definer set search_path = public, core, opportunity
as $$
  select mv.id, mv.analysis_id, mv.version_number, mv.version_name,
    a.opportunity_number, a.station_name, mv.assumption_snapshot,
    mv.result_snapshot, mv.created_at
  from opportunity.model_version mv
  join opportunity.analysis a on a.id = mv.analysis_id
  join core.companies c on c.id = mv.company_id
  where c.company_slug = p_company_slug
    and (p_analysis_id is null or mv.analysis_id = p_analysis_id)
    and (core.is_platform_owner() or core.can_admin_company(mv.company_id) or exists (
      select 1 from core.company_memberships cm join core.company_user_grant g
        on g.company_id=cm.company_id and g.profile_id=cm.profile_id
      where cm.company_id=mv.company_id and cm.profile_id=core.current_profile_id()
        and cm.membership_status='active' and g.grant_key='opportunity_analysis' and g.is_active
    ))
  order by mv.version_number desc;
$$;

revoke all on function public.list_opportunity_model_versions(text,uuid) from public;
grant execute on function public.list_opportunity_model_versions(text,uuid) to authenticated, service_role;
