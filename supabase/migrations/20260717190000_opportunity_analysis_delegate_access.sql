create or replace function core.access_context()
returns jsonb
language sql
stable
security definer
set search_path = core, public
as $$
  with me as (
    select
      p.id as profile_id,
      p.auth_user_id,
      p.email,
      p.first_name,
      p.last_name,
      p.display_name,
      p.mobile_phone,
      p.profile_status,
      p.is_platform_owner
    from core.profiles p
    where p.auth_user_id = auth.uid()
    limit 1
  ),
  memberships as (
    select
      cm.company_id,
      cm.profile_id,
      cm.relationship_type,
      cm.membership_status,
      cm.title,
      c.company_name,
      c.company_slug,
      c.company_status,
      c.primary_industry_id
    from core.company_memberships cm
    join core.companies c on c.id = cm.company_id
    join me on me.profile_id = cm.profile_id
    where cm.membership_status in ('pending', 'active', 'inactive')
  )
  select jsonb_build_object(
    'auth_user_id', me.auth_user_id,
    'profile_id', me.profile_id,
    'email', me.email,
    'first_name', me.first_name,
    'last_name', me.last_name,
    'display_name', me.display_name,
    'mobile_phone', me.mobile_phone,
    'profile_status', me.profile_status,
    'is_platform_owner', me.is_platform_owner,
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'company_id', m.company_id,
          'company_name', m.company_name,
          'company_slug', m.company_slug,
          'company_status', m.company_status,
          'primary_industry_id', m.primary_industry_id,
          'relationship_type', m.relationship_type,
          'membership_status', m.membership_status,
          'title', m.title,
          'grants', coalesce((
            select jsonb_agg(g.grant_key order by g.grant_key)
            from core.company_user_grant g
            where g.company_id = m.company_id
              and g.profile_id = m.profile_id
              and g.is_active = true
          ), '[]'::jsonb)
        )
        order by case when m.membership_status = 'active' then 0 else 1 end, m.company_name
      )
      from memberships m
    ), '[]'::jsonb)
  )
  from me;
$$;

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

  insert into core.company_user_grant (company_id, profile_id, grant_key, granted_by_profile_id)
  select v_company_id, p_profile_id, grant_key, v_actor_profile_id
  from (
    select distinct unnest(coalesce(p_grant_keys, array[]::text[])) as grant_key
  ) s
  where grant_key in (
    'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
    'operations_uploads', 'reports', 'roster', 'hiring', 'payroll',
    'admin_config', 'grant_management', 'opportunity_analysis'
  );

  return public.get_company_access_config(p_company_slug);
end;
$$;

