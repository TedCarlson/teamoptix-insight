-- FCC collection is limited to the Work Area Summary tab on Service Area Status.
-- The Service Area Summary export is not mapped and must not be scheduled.

update core.operations_ticket_template
set default_payload_json = jsonb_set(
  coalesce(default_payload_json, '{}'::jsonb),
  '{targets}',
  coalesce((
    select jsonb_agg(
      case
        when upper(coalesce(target ->> 'artifact_key', '')) in ('SERVICE_AREA_SUMMARY', 'FCC_SERVICE_AREA_SUMMARY')
        then target || jsonb_build_object(
          'key', 'FCC_WORK_AREA_SUMMARY',
          'label', 'FCC · Work Area Summary',
          'artifact_key', 'WORK_AREA_SUMMARY',
          'report_family_key', 'FCC',
          'report_shape_key', 'FCC_WORK_AREA_SUMMARY',
          'runner_section', 'SERVICE',
          'vps_target', 5,
          'expected_filename_match', jsonb_build_array('ServiceAreaStatus', 'SAStatus_')
        )
        else target
      end
      order by ordinal
    )
    from jsonb_array_elements(coalesce(default_payload_json -> 'targets', '[]'::jsonb)) with ordinality as item(target, ordinal)
  ), '[]'::jsonb),
  true
), updated_at = now()
where exists (
  select 1
  from jsonb_array_elements(coalesce(default_payload_json -> 'targets', '[]'::jsonb)) target
  where upper(coalesce(target ->> 'artifact_key', '')) in ('SERVICE_AREA_SUMMARY', 'FCC_SERVICE_AREA_SUMMARY')
);

update core.company_operations_ticket_assignment
set artifact_keys = array_replace(array_replace(artifact_keys, 'SERVICE_AREA_SUMMARY', 'WORK_AREA_SUMMARY'), 'FCC_SERVICE_AREA_SUMMARY', 'WORK_AREA_SUMMARY'),
    assignment_payload_json = case
      when assignment_payload_json ? 'targets' then jsonb_set(
        assignment_payload_json,
        '{targets}',
        coalesce((
          select jsonb_agg(
            case
              when upper(coalesce(target ->> 'artifact_key', '')) in ('SERVICE_AREA_SUMMARY', 'FCC_SERVICE_AREA_SUMMARY')
              then target || jsonb_build_object(
                'key', 'FCC_WORK_AREA_SUMMARY',
                'label', 'FCC · Work Area Summary',
                'artifact_key', 'WORK_AREA_SUMMARY',
                'report_family_key', 'FCC',
                'report_shape_key', 'FCC_WORK_AREA_SUMMARY',
                'runner_section', 'SERVICE',
                'vps_target', 5,
                'expected_filename_match', jsonb_build_array('ServiceAreaStatus', 'SAStatus_')
              )
              else target
            end
            order by ordinal
          )
          from jsonb_array_elements(coalesce(assignment_payload_json -> 'targets', '[]'::jsonb)) with ordinality as item(target, ordinal)
        ), '[]'::jsonb),
        true
      )
      else assignment_payload_json
    end,
    updated_at = now()
where artifact_keys && array['SERVICE_AREA_SUMMARY', 'FCC_SERVICE_AREA_SUMMARY']::text[]
   or exists (
     select 1
     from jsonb_array_elements(coalesce(assignment_payload_json -> 'targets', '[]'::jsonb)) target
     where upper(coalesce(target ->> 'artifact_key', '')) in ('SERVICE_AREA_SUMMARY', 'FCC_SERVICE_AREA_SUMMARY')
   );

create or replace function public.stage_operations_fcc_report(
  p_company_id uuid,
  p_service_date date,
  p_source_filename text,
  p_source_hash text,
  p_detected_sheet_name text,
  p_detected_header_row integer,
  p_detected_headers text[],
  p_row_count integer,
  p_route_row_count integer,
  p_participant_row_count integer,
  p_skipped_row_count integer,
  p_uploaded_by_profile_id uuid,
  p_metadata_json jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
begin
  insert into core.operations_report_batch (
    company_id, report_family_key, report_shape_key, service_date,
    report_frame, snapshot_kind, source_filename, source_hash,
    detected_sheet_name, detected_header_row, detected_headers,
    row_count, route_row_count, participant_row_count, skipped_row_count,
    status, uploaded_by_profile_id, metadata_json
  ) values (
    p_company_id, 'FCC', 'FCC_WORK_AREA_SUMMARY', p_service_date,
    'WORK_AREA_SUMMARY', 'IN_DAY', p_source_filename, p_source_hash,
    p_detected_sheet_name, p_detected_header_row, p_detected_headers,
    p_row_count, p_route_row_count, p_participant_row_count, p_skipped_row_count,
    'LOADED', p_uploaded_by_profile_id,
    coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
      'artifact_key', 'WORK_AREA_SUMMARY',
      'report_shape_key', 'FCC_WORK_AREA_SUMMARY',
      'report_frame', 'WORK_AREA_SUMMARY'
    )
  ) returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into core.operations_report_raw_row (
      batch_id, company_id, sheet_name, source_row_index, row_kind,
      raw_row_json, normalized_row_json, source_route_key,
      source_wa_number, source_driver_name, source_dswid,
      matched_roster_member_id, match_method, match_confidence
    ) values (
      v_batch_id, p_company_id, v_row->>'sheet_name',
      coalesce((v_row->>'source_row_index')::integer, 0),
      coalesce(v_row->>'row_kind', 'ROUTE'),
      coalesce(v_row->'raw_row_json', '{}'::jsonb),
      coalesce(v_row->'normalized_row_json', '{}'::jsonb),
      nullif(v_row->>'source_route_key', ''),
      nullif(v_row->>'source_wa_number', ''),
      nullif(v_row->>'source_driver_name', ''),
      nullif(v_row->>'source_dswid', ''),
      nullif(v_row->>'matched_roster_member_id', '')::uuid,
      nullif(v_row->>'match_method', ''),
      nullif(v_row->>'match_confidence', '')::numeric
    );
  end loop;

  return jsonb_build_object('batch_id', v_batch_id);
end;
$$;

notify pgrst, 'reload schema';
