-- Service Area Status is the FCC source report family and runner identity.
-- Work Area Summary is its governed nested-tab export; the sibling Service
-- Area Summary output remains out of scope.

insert into core.operations_report_shape (
  report_shape_key,
  report_family_key,
  report_shape_label,
  required_headers,
  optional_headers,
  notes,
  is_active
)
values (
  'FCC_WORK_AREA_SUMMARY',
  'FCC',
  'FCC Work Area Summary',
  array[
    'Station', 'SA#', 'WA#', 'Driver Name', 'User Type',
    'Last Delivery Time', 'Last Delivery Address',
    'Last Pickup Time', 'Last Pickup Address', '1st Stop Close',
    'Deliveries Complete', 'Pickup Complete', 'Final Stop Time',
    'Last Transmission Time'
  ]::text[],
  array[]::text[],
  'Work Area Summary nested output from the FCC Service Area Status report family.',
  true
)
on conflict (report_shape_key) do update
set report_family_key = excluded.report_family_key,
    report_shape_label = excluded.report_shape_label,
    required_headers = excluded.required_headers,
    optional_headers = excluded.optional_headers,
    notes = excluded.notes,
    is_active = true;

-- Repair and requeue the known Work Area Summary delivery that failed only
-- because its newly governed report shape was absent from the registry.
update core.operations_collection_artifact
set report_shape_key = 'FCC_WORK_AREA_SUMMARY',
    -- Artifact frames are only used for AM/PM collection variants. The FCC
    -- WORK_AREA_SUMMARY frame is assigned by stage_operations_fcc_report to
    -- the resulting report batch.
    report_frame = null,
    artifact_status = 'READY_FOR_INGEST',
    report_batch_id = null,
    error_message = null,
    ingest_metadata_json = jsonb_build_object(
      'source', 'register_fcc_work_area_summary_shape',
      'phase', 'REQUEUED',
      'requeued_at', now(),
      'reason', 'Work Area Summary requeued after registering FCC_WORK_AREA_SUMMARY.'
    ),
    ingest_completed_at = null,
    updated_at = now()
where id = '3159196f-297d-4eb0-8498-0f778b1e2c52'::uuid
  and upper(coalesce(runner_artifact_json ->> 'artifact_key', '')) = 'FCC_SERVICE_AREA_STATUS'
  and normalized_filename = 'Work Area Summary.xlsx'
  and artifact_status = 'FAILED';

update core.operations_collection_request request
set request_status = 'ARTIFACTS_READY',
    error_message = null,
    completed_at = null,
    updated_at = now()
where request.id = '92d40bea-3417-4681-ac3f-3e23ea4968de'::uuid
  and exists (
    select 1
    from core.operations_collection_artifact artifact
    where artifact.collection_request_id = request.id
      and artifact.id = '3159196f-297d-4eb0-8498-0f778b1e2c52'::uuid
      and artifact.artifact_status = 'READY_FOR_INGEST'
  );
