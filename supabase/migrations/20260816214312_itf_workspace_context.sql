-- Migration Event 2: one server-resolved company entry for Insight - Telecom Fulfillment.
--
-- This event does not seed a company, import donor records, or grant an entitlement.
-- It only creates the product key and a read-only resolver that combines company,
-- membership, product-entitlement, user-grant, and delegated-session boundaries.

insert into ref.insight_capabilities (
  capability_key,
  capability_label,
  description,
  is_active,
  sort_order
) values (
  'insight-telecom-fulfillment',
  'Insight - Telecom Fulfillment',
  'Company entry to the governed telecom fulfillment product workspace.',
  true,
  4
)
on conflict (capability_key) do update
set
  capability_label = excluded.capability_label,
  description = excluded.description,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

create or replace function public.itf_workspace_context(p_company_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, core, ref
as $$
declare
  v_company core.companies%rowtype;
  v_profile_id uuid;
  v_is_platform_owner boolean := false;
  v_relationship_type text;
  v_has_user_grant boolean := false;
  v_has_delegated_grant boolean := false;
  v_entitlement_status text;
  v_entitlement_source text;
  v_can_enter boolean := false;
  v_can_manage boolean := false;
  v_authorization_source text;
  v_access_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select profile.id, profile.is_platform_owner
  into v_profile_id, v_is_platform_owner
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    return null;
  end if;

  select company.*
  into v_company
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company.id is null then
    return null;
  end if;

  select membership.relationship_type
  into v_relationship_type
  from core.company_memberships membership
  where membership.company_id = v_company.id
    and membership.profile_id = v_profile_id
    and membership.membership_status = 'active'
  order by case membership.relationship_type when 'admin' then 0 else 1 end
  limit 1;

  select exists (
    select 1
    from core.company_user_grant user_grant
    where user_grant.company_id = v_company.id
      and user_grant.profile_id = v_profile_id
      and user_grant.grant_key = 'insight_telecom_fulfillment'
      and user_grant.is_active
  ) into v_has_user_grant;

  select core.has_active_delegated_company_access(
    v_company.id,
    'insight_telecom_fulfillment'
  ) into v_has_delegated_grant;

  -- A caller may only learn product state for a company they can already enter,
  -- administer, or actively operate through a scoped delegated-access session.
  if not (
    v_is_platform_owner
    or v_relationship_type is not null
    or v_has_delegated_grant
  ) then
    return null;
  end if;

  select entitlement.entitlement_status, entitlement.entitlement_source
  into v_entitlement_status, v_entitlement_source
  from core.company_capability_entitlement entitlement
  join ref.insight_capabilities capability
    on capability.id = entitlement.capability_id
  where entitlement.company_id = v_company.id
    and entitlement.engagement_id is null
    and capability.capability_key = 'insight-telecom-fulfillment'
    and entitlement.starts_at <= now()
    and (entitlement.ends_at is null or entitlement.ends_at > now())
  order by
    case entitlement.entitlement_status
      when 'active' then 0
      when 'pending' then 1
      when 'suspended' then 2
      else 3
    end,
    entitlement.created_at desc
  limit 1;

  if v_is_platform_owner then
    v_can_enter := true;
    v_can_manage := true;
    v_authorization_source := case
      when v_entitlement_status = 'active' then 'platform_owner'
      else 'platform_preview'
    end;
    v_access_reason := case
      when v_entitlement_status = 'active' then 'authorized'
      else 'foundation_preview'
    end;
  elsif v_entitlement_status is distinct from 'active' then
    v_access_reason := 'product_not_entitled';
    v_can_manage := v_relationship_type = 'admin';
  elsif v_relationship_type = 'admin' then
    v_can_enter := true;
    v_can_manage := true;
    v_authorization_source := 'company_admin';
    v_access_reason := 'authorized';
  elsif v_relationship_type is not null and v_has_user_grant then
    v_can_enter := true;
    v_authorization_source := 'company_grant';
    v_access_reason := 'authorized';
  elsif v_has_delegated_grant then
    v_can_enter := true;
    v_authorization_source := 'delegated_session';
    v_access_reason := 'authorized';
  else
    v_access_reason := 'workspace_grant_required';
  end if;

  return jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.company_name,
    'company_slug', v_company.company_slug,
    'company_status', v_company.company_status,
    'product_key', 'insight-telecom-fulfillment',
    'product_name', 'Insight - Telecom Fulfillment',
    'entitlement_status', v_entitlement_status,
    'entitlement_source', v_entitlement_source,
    'relationship_type', v_relationship_type,
    'authorization_source', v_authorization_source,
    'access_reason', v_access_reason,
    'can_enter', v_can_enter,
    'can_manage', v_can_manage,
    'is_platform_preview', coalesce(v_authorization_source = 'platform_preview', false)
  );
end;
$$;

revoke all on function public.itf_workspace_context(text) from public;
revoke all on function public.itf_workspace_context(text) from anon;
grant execute on function public.itf_workspace_context(text) to authenticated;
