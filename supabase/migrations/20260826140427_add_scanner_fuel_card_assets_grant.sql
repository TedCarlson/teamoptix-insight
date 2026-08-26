-- Assets is a PDLM grant for scanners and fuel cards only.
-- Fleet remains a separate vehicle and maintenance grant.

create or replace function public.get_company_asset_grants(p_company_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'profile_ids', coalesce((
      select jsonb_agg(company_grant.profile_id order by company_grant.profile_id)
      from core.company_user_grant company_grant
      where company_grant.company_id = v_company_id
        and company_grant.grant_key = 'assets'
        and company_grant.is_active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_company_profile_asset_grant(
  p_company_slug text,
  p_profile_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;
  if not exists (
    select 1 from core.company_memberships membership
    where membership.company_id = v_company_id
      and membership.profile_id = p_profile_id
  ) then
    return jsonb_build_object('error', 'Profile is not attached to this company.');
  end if;

  if coalesce(p_is_active, false) then
    insert into core.company_user_grant (
      company_id, profile_id, grant_key, is_active,
      granted_by_profile_id, updated_at
    ) values (
      v_company_id, p_profile_id, 'assets', true,
      core.current_profile_id(), now()
    )
    on conflict (company_id, profile_id, grant_key) do update
    set is_active = true,
        granted_by_profile_id = excluded.granted_by_profile_id,
        granted_at = now(),
        updated_at = now();
  else
    delete from core.company_user_grant company_grant
    where company_grant.company_id = v_company_id
      and company_grant.profile_id = p_profile_id
      and company_grant.grant_key = 'assets';
  end if;

  return public.get_company_asset_grants(p_company_slug);
end;
$$;

create or replace function core.assign_company_asset_to_roster_slot(
  p_company_slug text,
  p_asset_id uuid,
  p_roster_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_asset_type_id uuid;
  v_asset_type_key text;
  v_assignment_muted boolean;
  v_current_asset record;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found'; end if;
  if not core.can_use_company_workspace(v_company_id, 'assets') then
    raise exception 'Assets access is required' using errcode = '42501';
  end if;

  select asset.asset_type_id, asset_type.asset_type_key,
         coalesce(asset.assignment_muted, false)
  into v_asset_type_id, v_asset_type_key, v_assignment_muted
  from core.asset asset
  join core.asset_type asset_type on asset_type.id = asset.asset_type_id
  where asset.id = p_asset_id
    and asset.company_id = v_company_id;

  if v_asset_type_id is null then raise exception 'Asset not found'; end if;
  if v_asset_type_key not in ('SCANNER', 'FUEL_CARD') then
    raise exception 'Assets access applies only to scanners and fuel cards';
  end if;
  if v_assignment_muted then raise exception 'Asset is unavailable for assignment'; end if;

  if not exists (
    select 1 from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
  ) then
    raise exception 'Active or trainee roster member not found';
  end if;

  for v_current_asset in
    select asset.id from core.asset asset
    where asset.company_id = v_company_id
      and asset.asset_type_id = v_asset_type_id
      and asset.assigned_roster_member_id = p_roster_member_id
      and asset.id <> p_asset_id
  loop
    perform core.release_company_asset(
      p_company_slug,
      v_current_asset.id,
      'REPLACED_FROM_ROSTER_ASSIGNMENT'
    );
  end loop;

  perform core.assign_company_asset(
    p_company_slug,
    p_asset_id,
    p_roster_member_id
  );

  return jsonb_build_object(
    'ok', true,
    'asset_id', p_asset_id,
    'asset_type_key', v_asset_type_key,
    'roster_member_id', p_roster_member_id
  );
end;
$$;

-- Business Contact is the company's highest workforce leadership position
-- after Authorized Operator and receives scanner/fuel-card authority.
insert into core.company_user_grant (
  company_id, profile_id, grant_key, is_active,
  granted_by_profile_id, updated_at
)
select
  assignment.company_id,
  roster.profile_id,
  'assets',
  true,
  null,
  now()
from core.company_leadership_assignment assignment
join core.company_roster roster
  on roster.id = assignment.roster_member_id
 and roster.company_id = assignment.company_id
where assignment.role_key = 'business_contact'
  and roster.profile_id is not null
  and roster.employment_status in ('Active', 'Trainee')
on conflict (company_id, profile_id, grant_key) do update
set is_active = true,
    updated_at = now();

revoke all on function public.get_company_asset_grants(text) from public, anon;
revoke all on function public.update_company_profile_asset_grant(text, uuid, boolean) from public, anon;
grant execute on function public.get_company_asset_grants(text) to authenticated, service_role;
grant execute on function public.update_company_profile_asset_grant(text, uuid, boolean) to authenticated, service_role;
