-- Fleet is a first-class workspace grant. Inspections remain available to all
-- active workforce users through the separate driver inspection workflow.

create or replace function public.update_company_profile_grants(
  p_company_slug text,
  p_profile_id uuid,
  p_grant_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_access jsonb;
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_membership jsonb;
  v_can_edit boolean;
begin
  v_access := core.access_context();
  v_actor_profile_id := nullif(v_access->>'profile_id', '')::uuid;

  select c.id into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;

  select m into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) m
  where m->>'company_slug' = p_company_slug
  limit 1;

  v_can_edit :=
    coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (
      v_membership->>'relationship_type' = 'admin'
      and v_membership->>'membership_status' = 'active'
    );

  if not v_can_edit then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  if not exists (
    select 1 from core.company_memberships cm
    where cm.company_id = v_company_id and cm.profile_id = p_profile_id
  ) then
    return jsonb_build_object('error', 'Profile is not attached to this company.');
  end if;

  delete from core.company_user_grant
  where company_id = v_company_id and profile_id = p_profile_id;

  insert into core.company_user_grant (
    company_id,
    profile_id,
    grant_key,
    granted_by_profile_id
  )
  select v_company_id, p_profile_id, grant_key, v_actor_profile_id
  from (
    select distinct unnest(coalesce(p_grant_keys, array[]::text[])) as grant_key
  ) s
  where grant_key in (
    'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
    'operations_uploads', 'reports', 'fleet', 'roster', 'hiring',
    'payroll', 'admin_config', 'grant_management', 'opportunity_analysis'
  );

  return public.get_company_access_config(p_company_slug);
end;
$$;

revoke all on function public.update_company_profile_grants(text, uuid, text[])
  from public;
grant execute on function public.update_company_profile_grants(text, uuid, text[])
  to authenticated, service_role;
