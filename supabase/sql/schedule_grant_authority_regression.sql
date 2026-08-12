-- Run after 20260812144301_align_schedule_grant_authority.sql.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_admin_user_id uuid := gen_random_uuid();
  v_granted_user_id uuid := gen_random_uuid();
  v_ungranted_user_id uuid := gen_random_uuid();
  v_inactive_user_id uuid := gen_random_uuid();
  v_admin_profile_id uuid := gen_random_uuid();
  v_granted_profile_id uuid := gen_random_uuid();
  v_ungranted_profile_id uuid := gen_random_uuid();
  v_inactive_profile_id uuid := gen_random_uuid();
  v_policy_count integer;
begin
  insert into core.companies (
    id, company_name, company_slug, contact_email
  ) values (
    v_company_id,
    'Schedule Grant Contract',
    'schedule-grant-' || left(v_company_id::text, 8),
    'schedule-grant@example.invalid'
  );

  insert into auth.users (id)
  values
    (v_admin_user_id),
    (v_granted_user_id),
    (v_ungranted_user_id),
    (v_inactive_user_id);

  insert into core.profiles (
    id, auth_user_id, email, first_name, last_name
  ) values
    (
      v_admin_profile_id,
      v_admin_user_id,
      'schedule-admin@example.invalid',
      'Schedule',
      'Admin'
    ),
    (
      v_granted_profile_id,
      v_granted_user_id,
      'schedule-granted@example.invalid',
      'Schedule',
      'Granted'
    ),
    (
      v_ungranted_profile_id,
      v_ungranted_user_id,
      'schedule-ungranted@example.invalid',
      'Schedule',
      'Ungranted'
    ),
    (
      v_inactive_profile_id,
      v_inactive_user_id,
      'schedule-inactive@example.invalid',
      'Schedule',
      'Inactive'
    );

  insert into core.company_memberships (
    company_id, profile_id, membership_status, relationship_type
  ) values
    (v_company_id, v_admin_profile_id, 'active', 'admin'),
    (v_company_id, v_granted_profile_id, 'active', 'member'),
    (v_company_id, v_ungranted_profile_id, 'active', 'member'),
    (v_company_id, v_inactive_profile_id, 'inactive', 'member');

  insert into core.company_user_grant (
    company_id, profile_id, grant_key, is_active
  ) values
    (v_company_id, v_granted_profile_id, 'schedule', true),
    (v_company_id, v_inactive_profile_id, 'schedule', true);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  if not core.can_manage_schedule(v_company_id) then
    raise exception 'Active company administrator was denied Schedule authority';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_granted_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  if not core.can_manage_schedule(v_company_id) then
    raise exception 'Active Schedule grantee was denied Schedule authority';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_ungranted_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  if core.can_manage_schedule(v_company_id) then
    raise exception 'Active ungranted member received Schedule authority';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_inactive_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  if core.can_manage_schedule(v_company_id) then
    raise exception 'Inactive Schedule grantee received Schedule authority';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies policy
  where policy.schemaname = 'public'
    and policy.policyname in (
      'schedule_baseline_insert',
      'schedule_baseline_update',
      'schedule_baseline_delete',
      'schedule_day_fact_insert',
      'schedule_day_fact_update',
      'schedule_day_fact_delete',
      'schedule_override_insert',
      'schedule_override_update',
      'schedule_override_delete',
      'schedule_preset_insert',
      'schedule_preset_update',
      'schedule_preset_delete',
      'driver_time_off_request_update_company'
    )
    and concat_ws(' ', policy.qual, policy.with_check)
      like '%core.can_manage_schedule(company_id)%';

  if v_policy_count <> 13 then
    raise exception
      'Expected 13 Schedule mutation policies on shared authority, found %',
      v_policy_count;
  end if;
end;
$$;

rollback;
