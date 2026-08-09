-- Run after the two 2026080916* Mobile Companion migrations.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_auth_user_id uuid := gen_random_uuid();
  v_profile_id uuid := gen_random_uuid();
  v_roster_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_partial_batch_id uuid := gen_random_uuid();
  v_point_id uuid := gen_random_uuid();
  v_partial_valid_point_id uuid := gen_random_uuid();
  v_partial_invalid_point_id uuid := gen_random_uuid();
  v_started_at timestamptz := now() - interval '5 minutes';
  v_batch jsonb;
  v_ack jsonb;
  v_conflict_rejected boolean := false;
begin
  insert into core.companies (
    id, company_name, company_slug, contact_email
  ) values (
    v_company_id,
    'Mobile Companion Regression',
    'mobile-companion-regression-' || left(v_company_id::text, 8),
    'mobile-companion-regression@example.invalid'
  );

  insert into auth.users (id) values (v_auth_user_id);

  insert into core.profiles (
    id, auth_user_id, email, first_name, last_name
  ) values (
    v_profile_id, v_auth_user_id,
    'mobile-companion-regression@example.invalid', 'Mobile', 'Driver'
  );

  insert into core.company_memberships (
    company_id, profile_id, membership_status, relationship_type
  ) values (
    v_company_id, v_profile_id, 'active', 'member'
  );

  insert into core.company_roster (
    id, company_id, profile_id, full_name, worker_type,
    employment_status, roster_record_kind
  ) values (
    v_roster_id, v_company_id, v_profile_id, 'Mobile Driver', 'Driver',
    'Active', 'INTERNAL'
  );

  insert into public.company_terminal (
    company_id, terminal_code, terminal_name, timezone, is_active
  ) values (
    v_company_id, 'MC1', 'MC-1 Test Terminal', 'America/New_York', true
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id, 'role', 'authenticated')::text,
    true
  );

  v_ack := public.sync_driver_tracking_session(
    'mobile-companion-regression-' || left(v_company_id::text, 8),
    jsonb_build_object(
      'session_id', v_session_id,
      'device_started_at', v_started_at,
      'metadata', jsonb_build_object('test', true)
    )
  );

  if v_ack->>'session_id' <> v_session_id::text then
    raise exception 'Tracking session acknowledgment returned the wrong id';
  end if;

  v_batch := jsonb_build_object(
    'batch_id', v_batch_id,
    'device_created_at', now(),
    'points', jsonb_build_array(
      jsonb_build_object(
        'point_id', v_point_id,
        'device_captured_at', now() - interval '1 minute',
        'latitude', 39.9526,
        'longitude', -75.1652,
        'accuracy_meters', 10,
        'capture_method', 'SYNTHETIC_TEST'
      )
    )
  );

  v_ack := public.sync_driver_breadcrumb_batch(v_session_id, v_batch);

  if v_ack->>'batch_status' <> 'ACKNOWLEDGED'
     or jsonb_array_length(v_ack->'accepted_point_ids') <> 1 then
    raise exception 'Valid batch was not explicitly acknowledged';
  end if;

  v_ack := public.sync_driver_breadcrumb_batch(v_session_id, v_batch);

  if (v_ack->>'duplicate_batch')::boolean is not true then
    raise exception 'Exact duplicate batch did not return persisted acknowledgment';
  end if;

  begin
    perform public.sync_driver_breadcrumb_batch(
      v_session_id,
      jsonb_set(v_batch, '{device_created_at}', to_jsonb(now() + interval '1 second'))
    );
  exception when others then
    if sqlerrm like '%BATCH_ID_CONFLICT%' then
      v_conflict_rejected := true;
    else
      raise;
    end if;
  end;

  if not v_conflict_rejected then
    raise exception 'Changed content under an existing batch id was accepted';
  end if;

  v_ack := public.sync_driver_breadcrumb_batch(
    v_session_id,
    jsonb_build_object(
      'batch_id', v_partial_batch_id,
      'device_created_at', now(),
      'points', jsonb_build_array(
        jsonb_build_object(
          'point_id', v_partial_valid_point_id,
          'device_captured_at', now() - interval '30 seconds',
          'latitude', 39.9527,
          'longitude', -75.1651,
          'accuracy_meters', 11,
          'capture_method', 'SYNTHETIC_TEST'
        ),
        jsonb_build_object(
          'point_id', v_partial_invalid_point_id,
          'device_captured_at', now() - interval '20 seconds',
          'latitude', 100,
          'longitude', -75.1650,
          'accuracy_meters', 12,
          'capture_method', 'SYNTHETIC_TEST'
        )
      )
    )
  );

  if v_ack->>'batch_status' <> 'PARTIAL'
     or jsonb_array_length(v_ack->'accepted_point_ids') <> 1
     or jsonb_array_length(v_ack->'rejected') <> 1 then
    raise exception 'Partial batch did not preserve per-point disposition';
  end if;

  if exists (
    select 1
    from core.driver_breadcrumb_point point
    where point.id in (v_point_id, v_partial_valid_point_id)
      and (
        point.source <> 'MOBILE_COMPANION'
        or point.tracking_context <> 'DUTY_TRACKING'
        or point.breadcrumb_payload->>'truth_status' <> 'OBSERVATION_ONLY'
      )
  ) then
    raise exception 'Mobile provenance or observation-only boundary was lost';
  end if;

  if (
    select count(*)
    from core.driver_breadcrumb_point point
    where point.id in (v_point_id, v_partial_valid_point_id)
  ) <> 2 then
    raise exception 'Expected accepted mobile points are missing';
  end if;
end;
$$;

rollback;
