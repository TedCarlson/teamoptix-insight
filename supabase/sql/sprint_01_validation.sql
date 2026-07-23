\set ON_ERROR_STOP on

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_request_id uuid := gen_random_uuid();
  v_lease_request_id uuid := gen_random_uuid();
  v_plan_id uuid := gen_random_uuid();
  v_route_id uuid := gen_random_uuid();
  v_artifact_id uuid := gen_random_uuid();
  v_result jsonb;
  v_count integer;
  v_completed_at timestamptz;
begin
  insert into core.companies (
    id, company_name, company_slug, contact_email
  ) values (
    v_company_id, 'Sprint One Synthetic Company',
    'sprint-one-synthetic', 'synthetic@example.invalid'
  );

  -- Legal transitions work, illegal backward transitions fail, and a repeated
  -- terminal report cannot rewrite the first completion timestamp.
  insert into core.operations_collection_request (
    id, company_id, request_type, request_status
  ) values (
    v_request_id, v_company_id, 'OPERATIONS_PULSE', 'QUEUED'
  );

  update core.operations_collection_request set request_status = 'CLAIMED' where id = v_request_id;
  update core.operations_collection_request set request_status = 'RUNNING' where id = v_request_id;
  perform public.update_operations_collection_request_status(v_request_id, 'COMPLETE', null, null, null);

  select completed_at into v_completed_at
  from core.operations_collection_request where id = v_request_id;

  perform pg_sleep(0.01);
  perform public.update_operations_collection_request_status(v_request_id, 'COMPLETE', null, null, null);

  if (select completed_at from core.operations_collection_request where id = v_request_id)
      is distinct from v_completed_at then
    raise exception 'Repeated terminal update changed completed_at';
  end if;

  begin
    update core.operations_collection_request set request_status = 'RUNNING' where id = v_request_id;
    raise exception 'Terminal-to-active transition was accepted';
  exception
    when check_violation then null;
  end;

  -- A stale request expires through the governed RPC and receives a receipt.
  insert into core.operations_collection_request (
    id, company_id, request_type, request_status, updated_at
  ) values (
    v_lease_request_id, v_company_id, 'OPERATIONS_PULSE', 'RUNNING', now() - interval '31 minutes'
  );

  perform public.expire_stale_operations_collection_requests();

  if not exists (
    select 1 from core.operations_collection_request
    where id = v_lease_request_id
      and request_status = 'FAILED'
      and completed_at is not null
      and output_receipt_json is not null
  ) then
    raise exception 'Stale lease did not produce a governed terminal receipt';
  end if;

  -- Duplicate identities are ranked before the database upsert. Blank
  -- identities remain separate diagnostic rows.
  insert into core.operations_manifest_capture_plan (
    id, company_id, service_date
  ) values (v_plan_id, v_company_id, date '2026-07-22');

  insert into core.operations_manifest_capture_plan_route (
    id, capture_plan_id, company_id, service_date, route_key, route_label
  ) values (
    v_route_id, v_plan_id, v_company_id, date '2026-07-22', 'R100', 'Route 100'
  );

  insert into core.operations_manifest_artifact (
    id, capture_plan_id, capture_plan_route_id, company_id, service_date,
    route_key, route_label, manifest_type, storage_bucket, storage_path,
    original_filename, normalized_filename
  ) values (
    v_artifact_id, v_plan_id, v_route_id, v_company_id, date '2026-07-22',
    'R100', 'Route 100', 'delivery', 'synthetic', 'sprint-one/delivery.xlsx',
    'delivery.xlsx', 'DM_R100_2026-07-22.xlsx'
  );

  select public.replace_operations_delivery_manifest_rows(
    v_artifact_id,
    '[
      {"st_number":"10","sid":"A","recipient":"Sparse","package_count":1},
      {"st_number":"10","sid":"A","recipient":"Rich","address_line_1":"1 Synthetic Way","city":"Testville","completed":"YES","package_count":3},
      {"st_number":"","sid":"","recipient":"Unidentified one"},
      {"st_number":"","sid":"","recipient":"Unidentified two"}
    ]'::jsonb,
    '[
      {"tracking_id":" TRACK-1 ","recipient":"Sparse"},
      {"tracking_id":"TRACK-1","recipient":"Rich","prem_svc_raw":"P1","city":"Testville"},
      {"tracking_id":"","recipient":"Unidentified package one"},
      {"tracking_id":"","recipient":"Unidentified package two"}
    ]'::jsonb
  ) into v_result;

  if v_result ->> 'duplicate_stop_count' <> '1'
     or v_result ->> 'duplicate_package_count' <> '1'
     or v_result ->> 'unidentified_stop_count' <> '0'
     or v_result ->> 'unidentified_package_count' <> '2' then
    raise exception 'Unexpected delivery diagnostics: %', v_result;
  end if;

  select count(*) into v_count
  from core.operations_delivery_manifest_stop
  where source_artifact_id = v_artifact_id;
  if v_count <> 3 then raise exception 'Expected 3 delivery stops, got %', v_count; end if;

  if not exists (
    select 1 from core.operations_delivery_manifest_stop
    where source_artifact_id = v_artifact_id
      and stop_identity_key = 'SID|A'
      and recipient = 'Rich'
  ) then
    raise exception 'Deterministic stop winner was not retained';
  end if;

  select count(*) into v_count
  from core.operations_delivery_manifest_package
  where source_artifact_id = v_artifact_id;
  if v_count <> 3 then raise exception 'Expected 3 delivery packages, got %', v_count; end if;

  if not exists (
    select 1 from core.operations_delivery_manifest_package
    where source_artifact_id = v_artifact_id
      and tracking_id = 'TRACK-1'
      and recipient = 'Rich'
  ) then
    raise exception 'Deterministic package winner was not retained';
  end if;

  -- A second execution must retain the same fact cardinality.
  perform public.replace_operations_delivery_manifest_rows(
    v_artifact_id,
    '[
      {"st_number":"10","sid":"A","recipient":"Sparse","package_count":1},
      {"st_number":"10","sid":"A","recipient":"Rich","address_line_1":"1 Synthetic Way","city":"Testville","completed":"YES","package_count":3},
      {"st_number":"","sid":"","recipient":"Unidentified one"},
      {"st_number":"","sid":"","recipient":"Unidentified two"}
    ]'::jsonb,
    '[
      {"tracking_id":" TRACK-1 ","recipient":"Sparse"},
      {"tracking_id":"TRACK-1","recipient":"Rich","prem_svc_raw":"P1","city":"Testville"},
      {"tracking_id":"","recipient":"Unidentified package one"},
      {"tracking_id":"","recipient":"Unidentified package two"}
    ]'::jsonb
  );

  if (select count(*) from core.operations_delivery_manifest_stop where source_artifact_id = v_artifact_id) <> 3
     or (select count(*) from core.operations_delivery_manifest_package where source_artifact_id = v_artifact_id) <> 3 then
    raise exception 'Repeated replacement was not idempotent';
  end if;
end;
$$;

rollback;
