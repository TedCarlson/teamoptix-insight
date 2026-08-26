-- Keep asset custody authority aligned with the operational Assistant BC role.
begin;

create or replace function core.can_manage_company_assets(
  p_company_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    core.is_platform_owner()
    or core.can_admin_company(p_company_id)
    or exists (
      select 1
      from core.company_memberships membership
      where membership.company_id = p_company_id
        and membership.profile_id = core.current_profile_id()
        and membership.membership_status = 'active'
        and (
          lower(pg_catalog.btrim(coalesce(membership.title, ''))) = 'assistant bc'
          or exists (
            select 1
            from core.company_roster roster
            where roster.company_id = membership.company_id
              and roster.profile_id = membership.profile_id
              and roster.employment_status in ('Active', 'Trainee')
              and lower(
                pg_catalog.btrim(
                  coalesce(roster.job_title, roster.worker_type, '')
                )
              ) = 'assistant bc'
          )
        )
    );
$$;

revoke all on function core.can_manage_company_assets(uuid) from public;

comment on function core.can_manage_company_assets(uuid) is
  'Returns whether the current user may manage company asset custody. Company admins, platform owners, and active Assistant BCs are authorized.';

create or replace function core.assign_company_asset_to_roster_slot(
  p_company_slug text,
  p_asset_id uuid,
  p_roster_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_asset_type_id uuid;
  v_asset_type_key text;
  v_assignment_muted boolean;
  v_current_asset record;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  if not core.can_manage_company_assets(v_company_id) then
    raise exception 'Forbidden';
  end if;

  select
    asset.asset_type_id,
    asset_type.asset_type_key,
    coalesce(asset.assignment_muted, false)
  into
    v_asset_type_id,
    v_asset_type_key,
    v_assignment_muted
  from core.asset asset
  join core.asset_type asset_type
    on asset_type.id = asset.asset_type_id
  where asset.id = p_asset_id
    and asset.company_id = v_company_id;

  if v_asset_type_id is null then
    raise exception 'Asset not found';
  end if;

  if v_assignment_muted then
    raise exception 'Asset is unavailable for assignment';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
  ) then
    raise exception 'Active or trainee roster member not found';
  end if;

  for v_current_asset in
    select asset.id
    from core.asset asset
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

comment on function core.assign_company_asset_to_roster_slot(text, uuid, uuid) is
  'Assigns an asset to a driver-facing roster slot. Company admins, platform owners, and active Assistant BCs may perform the assignment.';

commit;
