-- Run after 20260806100000_driver_scorecard_materialized_fact_engine.sql.
-- All fixtures are transaction-local and rolled back.

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_auth_user_id uuid := gen_random_uuid();
  v_profile_id uuid := gen_random_uuid();
  v_contract_id uuid := gen_random_uuid();
  v_roster_id uuid := gen_random_uuid();
  v_wrong_roster_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_replacement_batch_id uuid := gen_random_uuid();
  v_value numeric;
  v_payload jsonb;
  v_import jsonb;
  v_replay jsonb;
  v_historical_context_rejected boolean := false;
begin
  insert into core.companies (
    id, company_name, company_slug, contact_email
  ) values (
    v_company_id,
    'Driver Scorecard Regression',
    'driver-scorecard-regression-' || left(v_company_id::text, 8),
    'driver-scorecard-regression@example.invalid'
  );

  insert into auth.users (id) values (v_auth_user_id);

  insert into core.profiles (
    id, auth_user_id, email, first_name, last_name, is_platform_owner
  ) values (
    v_profile_id, v_auth_user_id,
    'driver-scorecard-owner@example.invalid', 'Regression', 'Owner', true
  );
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id, 'role', 'authenticated')::text,
    true
  );

  insert into core.operations_report_family (
    report_family_key, report_family_label
  ) values ('DSW', 'Daily Service Worksheet')
  on conflict (report_family_key) do nothing;

  insert into core.operations_report_shape (
    report_shape_key, report_family_key, report_shape_label
  ) values ('DSW_FINALIZED_DAY', 'DSW', 'Finalized DSW day')
  on conflict (report_shape_key) do nothing;

  insert into core.company_contract_config (
    id, company_id, contract_number, terminal_identity, service_area,
    effective_start_date, effective_end_date, status
  ) values (
    v_contract_id, v_company_id, 'REGRESSION', 'TEST', 'TEST',
    date '2025-08-16', date '2026-08-15', 'ACTIVE'
  );

  insert into core.company_roster (
    id, company_id, full_name, employment_status
  ) values (
    v_roster_id, v_company_id, 'Regression Driver', 'Active'
  );
  insert into core.company_roster (
    id, company_id, full_name, employment_status
  ) values (
    v_wrong_roster_id, v_company_id, 'Wrong Regression Driver', 'Active'
  );

  insert into core.operations_report_batch (
    id, company_id, report_family_key, report_shape_key, service_date,
    snapshot_kind, source_filename, source_hash, row_count,
    route_row_count, status
  ) values (
    v_batch_id, v_company_id, 'DSW', 'DSW_FINALIZED_DAY', date '2026-07-31',
    'FINAL', 'regression.xlsx', 'regression-v1', 1, 1, 'LOADED'
  );

  insert into core.operations_report_raw_row (
    batch_id, company_id, source_row_index, row_kind, raw_row_json,
    normalized_row_json, source_route_key, source_wa_number,
    source_driver_name, source_dswid
  ) values (
    v_batch_id, v_company_id, 1, 'ROUTE',
    jsonb_build_object('E/L PUs', '1/0', 'Pot. Miss PUs', '2'),
    jsonb_build_object(
      'driver_name', 'Regression Driver',
      'wa_name', 'R-100',
      'wa_number', '100',
      'actual_delivery_stops', 120,
      'actual_delivery_packages', 180,
      'actual_pickup_stops', 10,
      'actual_pickup_packages', 14,
      'ils_percent', 99.5,
      'exceptions', 3,
      'miles', 78,
      'on_road_hours', '08:30',
      'on_duty_hours', '09:00'
    ),
    'R-100', '100', 'Regression Driver', 'Regression Driver'
  );

  if not exists (
    select 1 from core.driver_scorecard_route_day_fact
    where raw_row_id in (
      select id from core.operations_report_raw_row where batch_id = v_batch_id
    )
      and roster_member_id = v_roster_id
      and delivery_stops = 120
      and early_pickups = 1
      and potential_missed_pickups = 2
  ) then
    raise exception 'Route-day materialization failed.';
  end if;

  if not exists (
    select 1 from core.driver_scorecard_day_fact
    where company_id = v_company_id
      and service_date = date '2026-07-31'
      and roster_member_id = v_roster_id
      and route_days = 1
      and delivery_stops = 120
  ) then
    raise exception 'Driver-day aggregation failed.';
  end if;

  if not exists (
    select 1 from core.driver_scorecard_week_fact
    where company_id = v_company_id
      and week_start = date '2026-07-25'
      and week_end = date '2026-07-31'
      and roster_member_id = v_roster_id
  ) then
    raise exception 'Sat-Fri week aggregation failed.';
  end if;

  if (select count(*) from core.driver_scorecard_snapshot
      where contract_id = v_contract_id and roster_member_id = v_roster_id) <> 4
  then
    raise exception 'Expected four persisted scorecard windows.';
  end if;

  if not exists (
    select 1 from core.driver_scorecard_snapshot
    where contract_id = v_contract_id
      and roster_member_id = v_roster_id
      and period_key = 'LAST_5_WEEKS'
      and period_start = date '2026-06-27'
      and period_end = date '2026-07-31'
      and delivery_stops = 120
  ) then
    raise exception 'Five-complete-week snapshot is incorrect.';
  end if;

  -- A corrected FINAL batch for the same day must replace, not accumulate,
  -- the previously materialized facts.
  insert into core.operations_report_batch (
    id, company_id, report_family_key, report_shape_key, service_date,
    snapshot_kind, source_filename, source_hash, row_count,
    route_row_count, status, created_at
  ) values (
    v_replacement_batch_id, v_company_id, 'DSW', 'DSW_FINALIZED_DAY',
    date '2026-07-31', 'FINAL', 'regression-corrected.xlsx',
    'regression-v2', 1, 1, 'LOADED', now() + interval '1 second'
  );

  insert into core.operations_report_raw_row (
    batch_id, company_id, source_row_index, row_kind, raw_row_json,
    normalized_row_json, source_route_key, source_wa_number,
    source_driver_name, source_dswid
  ) values (
    v_replacement_batch_id, v_company_id, 1, 'ROUTE',
    jsonb_build_object('E/L PUs', '0/0', 'Pot. Miss PUs', '0'),
    jsonb_build_object(
      'driver_name', 'Regression Driver',
      'wa_name', 'R-100',
      'wa_number', '100',
      'actual_delivery_stops', 125,
      'actual_delivery_packages', 190,
      'actual_pickup_stops', 11,
      'actual_pickup_packages', 15,
      'ils_percent', 100
    ),
    'R-100', '100', 'Regression Driver', 'Regression Driver'
  );

  select delivery_stops into v_value
  from core.driver_scorecard_day_fact
  where company_id = v_company_id
    and service_date = date '2026-07-31'
    and roster_member_id = v_roster_id;

  if v_value is distinct from 125::numeric then
    raise exception 'Corrected FINAL facts accumulated instead of replacing: %', v_value;
  end if;

  if not exists (
    select 1 from core.driver_scorecard_fact_build
    where company_id = v_company_id
      and service_date = date '2026-07-31'
      and batch_id = v_replacement_batch_id
      and source_hash = 'regression-v2'
      and matched_route_row_count = 1
      and unmatched_route_row_count = 0
  ) then
    raise exception 'Build evidence did not follow the corrected FINAL batch.';
  end if;

  -- A cached stale match must not defeat a later authoritative identity heal.
  update core.operations_report_raw_row
  set matched_roster_member_id = v_wrong_roster_id,
      match_method = 'STALE_TEST_MATCH'
  where batch_id = v_replacement_batch_id;
  perform core.refresh_driver_scorecard_service_day(
    v_company_id, date '2026-07-31', true
  );

  if not exists (
    select 1 from core.driver_scorecard_route_day_fact
    where company_id = v_company_id
      and service_date = date '2026-07-31'
      and roster_member_id = v_roster_id
      and match_method = 'ROSTER_IDENTITY'
  ) then
    raise exception 'Authoritative identity healing did not replace the stale cached match.';
  end if;

  v_payload := public.get_company_driver_scorecard_index(
    v_company_id,
    date '2025-08-16',
    date '2026-08-15',
    date '2026-07-31'
  );

  if v_payload ->> 'read_model' <> 'MATERIALIZED_DRIVER_SCORECARD_V1' then
    raise exception 'Public index did not use the materialized read model.';
  end if;

  if (v_payload #>> '{drivers,0,periods,LAST_5_WEEKS,delivery_stops}')::numeric
      is distinct from 125::numeric
  then
    raise exception 'Public index returned incorrect persisted facts: %', v_payload;
  end if;

  begin
    perform core.get_company_driver_scorecard_index_materialized(
      v_company_id,
      date '2025-08-16',
      date '2026-08-15',
      date '2026-07-30'
    );
  exception when sqlstate '22023' then
    v_historical_context_rejected := true;
  end;

  if not v_historical_context_rejected then
    raise exception 'A newer snapshot leaked into an earlier analytics context.';
  end if;

  v_import := public.import_driver_scorecard_observations(
    v_company_id,
    'SPOTLIGHT',
    'regression.xlsx',
    'external-regression-v1',
    date '2026-07-01',
    date '2026-07-31',
    jsonb_build_array(
      jsonb_build_object(
        'roster_member_id', v_roster_id,
        'metric_key', 'PPOD',
        'value', 98.7
      ),
      jsonb_build_object(
        'driver_name', 'Regression Driver',
        'metric_key', 'NOT_A_METRIC',
        'value', 1
      )
    ),
    jsonb_build_object('test', true)
  );

  if v_import ->> 'status' <> 'PARTIAL'
    or (v_import ->> 'accepted_count')::integer <> 1
    or (v_import ->> 'rejected_count')::integer <> 1
  then
    raise exception 'External observation validation contract failed: %', v_import;
  end if;

  v_replay := public.import_driver_scorecard_observations(
    v_company_id,
    'SPOTLIGHT',
    'regression.xlsx',
    'external-regression-v1',
    date '2026-07-01',
    date '2026-07-31',
    '[]'::jsonb,
    '{}'::jsonb
  );

  if coalesce((v_replay ->> 'idempotent_replay')::boolean, false) is not true
    or v_replay ->> 'batch_id' <> v_import ->> 'batch_id'
  then
    raise exception 'External observation import is not idempotent: %', v_replay;
  end if;

  -- Removing retained source FINAL dates and rebuilding must remove every
  -- derived fact and snapshot rather than leave stale scorecard values.
  delete from core.operations_report_raw_row
  where batch_id in (v_batch_id, v_replacement_batch_id);
  delete from core.operations_report_batch
  where id in (v_batch_id, v_replacement_batch_id);
  perform core.rebuild_company_driver_scorecard_facts(
    v_company_id, date '2025-08-16', date '2026-08-15'
  );

  if exists (
    select 1 from core.driver_scorecard_day_fact where company_id = v_company_id
    union all
    select 1 from core.driver_scorecard_week_fact where company_id = v_company_id
    union all
    select 1 from core.driver_scorecard_fact_build where company_id = v_company_id
    union all
    select 1 from core.driver_scorecard_snapshot where company_id = v_company_id
  ) then
    raise exception 'Targeted rebuild left stale facts after source FINAL removal.';
  end if;
end;
$$;

rollback;
