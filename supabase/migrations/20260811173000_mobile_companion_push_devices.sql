begin;

-- Push registrations are installation-scoped delivery addresses. They do not
-- grant authority and are never treated as proof of identity or MFA.
create table core.mobile_companion_push_device (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  profile_id uuid not null references core.profiles(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  access_mode text not null check (access_mode in ('DRIVER', 'ADMIN_DEMO')),
  installation_id uuid not null,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  project_id text not null,
  app_version text,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    auth_user_id,
    installation_id,
    company_id,
    roster_member_id,
    access_mode
  )
);

create index mobile_companion_push_device_delivery_idx
  on core.mobile_companion_push_device(company_id, roster_member_id, is_active)
  where is_active = true;

alter table core.mobile_companion_push_device enable row level security;

create policy mobile_companion_push_device_select_own
on core.mobile_companion_push_device
for select to authenticated
using (auth_user_id = auth.uid());

grant select on core.mobile_companion_push_device to authenticated;

create or replace function public.register_mobile_companion_push_device(
  p_company_slug text,
  p_roster_member_id uuid,
  p_access_mode text,
  p_installation_id uuid,
  p_expo_push_token text,
  p_platform text,
  p_project_id text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_profile_id uuid;
  v_access_mode text;
  v_direct_authority record;
  v_registration core.mobile_companion_push_device%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;
  if v_profile_id is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_company_id is null then raise exception 'COMPANY_NOT_FOUND'; end if;

  v_access_mode := upper(btrim(coalesce(p_access_mode, '')));
  if v_access_mode = 'DRIVER' then
    select * into v_direct_authority
    from core.resolve_authenticated_driver_authority(p_company_slug);
    if v_direct_authority.company_id <> v_company_id
       or v_direct_authority.profile_id <> v_profile_id
       or v_direct_authority.roster_member_id <> p_roster_member_id then
      raise exception 'DRIVER_PUSH_AUTHORITY_MISMATCH';
    end if;
  elsif v_access_mode = 'ADMIN_DEMO' then
    if not core.can_admin_company(v_company_id) then
      raise exception 'COMPANY_ADMIN_REQUIRED';
    end if;
    if not exists (
      select 1
      from core.company_roster roster
      where roster.id = p_roster_member_id
        and roster.company_id = v_company_id
        and roster.employment_status in ('Active', 'Trainee')
        and roster.roster_record_kind = 'INTERNAL'
    ) then
      raise exception 'ELIGIBLE_DEMO_DRIVER_REQUIRED';
    end if;
  else
    raise exception 'INVALID_ACCESS_MODE';
  end if;

  if p_installation_id is null then raise exception 'INSTALLATION_ID_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_expo_push_token, '')), '') is null
     or p_expo_push_token not like 'ExponentPushToken[%]' then
    raise exception 'INVALID_EXPO_PUSH_TOKEN';
  end if;
  if lower(btrim(coalesce(p_platform, ''))) not in ('ios', 'android') then
    raise exception 'INVALID_PUSH_PLATFORM';
  end if;
  if nullif(btrim(coalesce(p_project_id, '')), '') is null then
    raise exception 'EXPO_PROJECT_ID_REQUIRED';
  end if;

  insert into core.mobile_companion_push_device (
    auth_user_id, profile_id, company_id, roster_member_id, access_mode,
    installation_id, expo_push_token, platform, project_id, app_version
  ) values (
    auth.uid(), v_profile_id, v_company_id, p_roster_member_id, v_access_mode,
    p_installation_id, btrim(p_expo_push_token), lower(btrim(p_platform)),
    btrim(p_project_id), nullif(btrim(coalesce(p_app_version, '')), '')
  )
  on conflict (
    auth_user_id, installation_id, company_id, roster_member_id, access_mode
  ) do update set
    profile_id = excluded.profile_id,
    expo_push_token = excluded.expo_push_token,
    platform = excluded.platform,
    project_id = excluded.project_id,
    app_version = excluded.app_version,
    is_active = true,
    last_registered_at = now(),
    updated_at = now()
  returning * into v_registration;

  return jsonb_build_object(
    'ok', true,
    'registration_id', v_registration.id,
    'access_mode', v_registration.access_mode,
    'active', v_registration.is_active
  );
end;
$$;

create or replace function public.deactivate_mobile_companion_push_device(
  p_installation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_installation_id is null then raise exception 'INSTALLATION_ID_REQUIRED'; end if;

  update core.mobile_companion_push_device device
  set is_active = false,
      updated_at = now()
  where device.auth_user_id = auth.uid()
    and device.installation_id = p_installation_id
    and device.is_active = true;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'deactivated', v_count);
end;
$$;

revoke all on function public.register_mobile_companion_push_device(
  text, uuid, text, uuid, text, text, text, text
) from public, anon;
grant execute on function public.register_mobile_companion_push_device(
  text, uuid, text, uuid, text, text, text, text
) to authenticated, service_role;

revoke all on function public.deactivate_mobile_companion_push_device(uuid)
  from public, anon;
grant execute on function public.deactivate_mobile_companion_push_device(uuid)
  to authenticated, service_role;

commit;
