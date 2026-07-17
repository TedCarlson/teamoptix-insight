create table opportunity.model_version (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  analysis_id uuid not null references opportunity.analysis(id) on delete cascade,
  version_number integer not null,
  version_name text,
  source_snapshot jsonb not null,
  assumption_snapshot jsonb not null,
  result_snapshot jsonb not null,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint opportunity_model_version_number_ck check (version_number > 0),
  constraint opportunity_model_version_analysis_number_uq unique (analysis_id, version_number)
);

create index opportunity_model_version_company_analysis_idx
  on opportunity.model_version(company_id, analysis_id, version_number desc);

alter table opportunity.model_version enable row level security;
create policy opportunity_model_version_read on opportunity.model_version for select to authenticated
  using (core.can_access_company(company_id));

create or replace function public.save_opportunity_model_version(
  p_company_slug text,
  p_analysis_id uuid,
  p_assumptions jsonb,
  p_results jsonb,
  p_version_name text default null
)
returns table (id uuid, version_number integer, created_at timestamptz)
language plpgsql
security definer
set search_path = public, core, opportunity
as $$
declare
  v_access jsonb := core.access_context();
  v_membership jsonb;
  v_company_id uuid;
  v_profile_id uuid := nullif(v_access->>'profile_id', '')::uuid;
  v_analysis opportunity.analysis%rowtype;
  v_version integer;
begin
  select c.id into v_company_id from core.companies c where c.company_slug = p_company_slug;
  select m into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) m
  where m->>'company_slug' = p_company_slug limit 1;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (
    coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (v_membership->>'membership_status' = 'active' and (
      v_membership->>'relationship_type' = 'admin'
      or coalesce(v_membership->'grants', '[]'::jsonb) ? 'opportunity_analysis'
    ))
  ) then raise exception 'Forbidden.'; end if;

  select a.* into v_analysis
  from opportunity.analysis a
  where a.id = p_analysis_id and a.company_id = v_company_id
  for update;
  if not found then raise exception 'Opportunity not found.'; end if;

  select coalesce(max(mv.version_number), 0) + 1 into v_version
  from opportunity.model_version mv where mv.analysis_id = p_analysis_id;

  return query
  insert into opportunity.model_version (
    company_id, analysis_id, version_number, version_name, source_snapshot,
    assumption_snapshot, result_snapshot, created_by_profile_id
  ) values (
    v_company_id, p_analysis_id, v_version, nullif(trim(p_version_name), ''),
    to_jsonb(v_analysis), coalesce(p_assumptions, '{}'::jsonb),
    coalesce(p_results, '{}'::jsonb), v_profile_id
  )
  returning model_version.id, model_version.version_number, model_version.created_at;
end;
$$;

create or replace function public.list_opportunity_model_versions(p_company_slug text, p_analysis_id uuid default null)
returns table (
  id uuid, analysis_id uuid, version_number integer, version_name text,
  opportunity_number text, station_name text, result_snapshot jsonb, created_at timestamptz
)
language sql stable security definer set search_path = public, core, opportunity
as $$
  select mv.id, mv.analysis_id, mv.version_number, mv.version_name,
    a.opportunity_number, a.station_name, mv.result_snapshot, mv.created_at
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
  order by mv.created_at desc;
$$;

revoke all on function public.save_opportunity_model_version(text,uuid,jsonb,jsonb,text) from public;
revoke all on function public.list_opportunity_model_versions(text,uuid) from public;
grant execute on function public.save_opportunity_model_version(text,uuid,jsonb,jsonb,text) to authenticated, service_role;
grant execute on function public.list_opportunity_model_versions(text,uuid) to authenticated, service_role;
