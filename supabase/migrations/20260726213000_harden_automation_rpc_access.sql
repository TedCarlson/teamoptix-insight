begin;

-- Keep credential secrets and machine-owned automation state behind the
-- service role. Application routes authorize the signed-in actor first, then
-- use the service client for these narrowly scoped operations.
do $$
declare
  target record;
  affected_count integer := 0;
  target_names constant text[] := array[
    'finish_operations_automation_run',
    'get_automation_credential_for_verify',
    'record_automation_credential_verification',
    'save_automation_credential',
    'save_operations_automation_schedule_config',
    'save_operations_automation_schedule_config_with_window',
    'start_operations_automation_run'
  ];
begin
  for target in
    select procedure.oid::regprocedure as identity
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname = any(target_names)
      and has_function_privilege(
        'authenticated',
        procedure.oid,
        'EXECUTE'
      )
    order by procedure.proname, procedure.oid
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target.identity
    );
    execute format(
      'grant execute on function %s to service_role',
      target.identity
    );
    affected_count := affected_count + 1;
  end loop;

  if affected_count <> 8 then
    raise exception
      'Expected 8 automation SECURITY DEFINER overloads, found %',
      affected_count;
  end if;
end
$$;

-- Signed-in callers may read non-secret credential status only for companies
-- they can access.
create or replace function public.get_automation_credential(
  p_profile_id uuid
)
returns table(
  username text,
  has_secret boolean,
  last_verified_at timestamptz,
  last_verification_result text,
  updated_at timestamptz
)
language sql
security definer
set search_path to 'public', 'core'
as $$
  select
    credential.username,
    credential.has_secret,
    credential.last_verified_at,
    credential.last_verification_result,
    credential.updated_at
  from core.automation_credential credential
  join core.automation_profile profile
    on profile.id = credential.profile_id
  where credential.profile_id = p_profile_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or core.can_access_company(profile.company_id)
    );
$$;

-- Profile creation is benign but still company-scoped. This prevents a
-- signed-in user from creating or reading another company's profile directly
-- through PostgREST.
create or replace function public.get_or_create_automation_profile(
  p_company_id uuid,
  p_provider_key text
)
returns public.automation_profile_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_profile core.automation_profile%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(core.can_access_company(p_company_id), false)
  then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  select *
  into v_profile
  from core.automation_profile
  where company_id = p_company_id
    and provider_key = p_provider_key
  limit 1;

  if v_profile.id is null then
    insert into core.automation_profile (
      company_id,
      provider_key,
      status
    )
    values (
      p_company_id,
      p_provider_key,
      'NOT_CONFIGURED'
    )
    returning * into v_profile;
  end if;

  return (
    v_profile.id,
    v_profile.company_id,
    v_profile.provider_key,
    v_profile.status,
    v_profile.created_at,
    v_profile.updated_at
  )::public.automation_profile_v;
end;
$$;

-- Schedule reads remain available to company members, but no signed-in user
-- may cross the company boundary by calling this RPC directly.
create or replace function public.get_operations_automation_schedule_config(
  p_company_slug text
)
returns setof public.operations_automation_schedule_config_v
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(core.can_access_company(v_company_id), false)
  then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  insert into core.operations_automation_schedule_config (
    company_id,
    automation_type,
    is_enabled,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    min_cooldown_minutes
  )
  values
    (
      v_company_id,
      'DSW',
      false,
      15,
      'SORT_DELIVERY_DAY',
      '05:00',
      '23:45',
      12
    ),
    (
      v_company_id,
      'FCC',
      false,
      15,
      'SORT_DELIVERY_DAY',
      '05:00',
      '23:45',
      12
    )
  on conflict (company_id, automation_type) do nothing;

  return query
  select *
  from public.operations_automation_schedule_config_v
  where company_id = v_company_id
  order by automation_type;
end;
$$;

notify pgrst, 'reload schema';

commit;
