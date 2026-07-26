begin;

-- The baseline granted EXECUTE directly to anon on a broad set of public
-- SECURITY DEFINER functions. Later migrations often revoked PUBLIC but did
-- not remove that explicit anon grant. Restrict the 63 advisor-flagged
-- overloads to their actual signed-in or service-role callers.
do $$
declare
  target record;
  affected_count integer := 0;
  target_names constant text[] := array[
    'assign_company_asset_to_roster_slot',
    'capture_operations_collection_request_receipt',
    'claim_fleet_evidence_archive_candidates',
    'claim_operations_manifest_capture_plan',
    'complete_fleet_evidence_archive',
    'create_company_fleet_work_order',
    'create_company_payroll_work_event',
    'create_operations_manifest_capture_plan',
    'delete_company_operations_ticket_assignment',
    'delete_operations_ticket_template',
    'dispatch_reopen_day',
    'expire_stale_operations_collection_requests',
    'fail_fleet_evidence_archive',
    'get_company_leadership_config',
    'get_company_route_capacity_analytics',
    'get_daily_operations_dispatch_actions',
    'get_opportunity_analysis',
    'get_opportunity_zip_analysis',
    'legal_accept_document_version',
    'legal_create_client_document',
    'legal_customer_task_mark_customer_accepted',
    'legal_delete_draft_client_document',
    'legal_link_client_document_company',
    'legal_lock_document_version',
    'legal_save_document_metadata',
    'link_company_fleet_vin_decode',
    'list_industries',
    'list_opportunity_analyses',
    'list_opportunity_model_versions',
    'promote_operations_collection_manifest_artifacts',
    'queue_operations_collection_recovery',
    'record_company_fleet_vin_decode',
    'record_operations_collection_runtime_event',
    'register_company_fleet_inspection_evidence',
    'register_company_fleet_vehicle_intake_evidence',
    'register_operations_manifest_artifact',
    'replace_operations_delivery_manifest_rows',
    'replace_operations_pickup_manifest_rows',
    'request_operations_ticket_template_deletion',
    'reverse_company_payroll_work_event',
    'save_intake_capability',
    'save_intake_question',
    'save_line_of_business',
    'save_opportunity_analysis',
    'save_opportunity_model_version',
    'submit_company_fleet_inspection',
    'update_company_fleet_work_order',
    'update_company_leadership_assignment',
    'update_company_operations_work_order_rule',
    'update_company_profile',
    'update_company_roster_details',
    'update_company_timekeeping_config',
    'update_operations_manifest_artifact_status',
    'update_operations_manifest_capture_plan_status',
    'update_operations_manifest_capture_route_status',
    'upsert_company_fleet_vehicle',
    'upsert_company_operations_ticket_assignment',
    'upsert_company_operations_work_order_rule',
    'upsert_company_roster_authoritative_facts',
    'upsert_operations_ticket_template'
  ];
  service_only_names constant text[] := array[
    'capture_operations_collection_request_receipt',
    'claim_fleet_evidence_archive_candidates',
    'claim_operations_manifest_capture_plan',
    'complete_fleet_evidence_archive',
    'expire_stale_operations_collection_requests',
    'fail_fleet_evidence_archive',
    'legal_link_client_document_company',
    'promote_operations_collection_manifest_artifacts',
    'record_operations_collection_runtime_event',
    'register_operations_manifest_artifact',
    'replace_operations_delivery_manifest_rows',
    'replace_operations_pickup_manifest_rows',
    'update_operations_manifest_artifact_status',
    'update_operations_manifest_capture_plan_status',
    'update_operations_manifest_capture_route_status'
  ];
begin
  for target in
    select
      procedure.oid::regprocedure as identity,
      procedure.proname
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname = any(target_names)
      and has_function_privilege('anon', procedure.oid, 'EXECUTE')
    order by procedure.proname, procedure.oid
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      target.identity
    );

    if target.proname = any(service_only_names) then
      execute format(
        'revoke execute on function %s from authenticated',
        target.identity
      );
      execute format(
        'grant execute on function %s to service_role',
        target.identity
      );
    else
      execute format(
        'grant execute on function %s to authenticated, service_role',
        target.identity
      );
    end if;

    affected_count := affected_count + 1;
  end loop;

  if affected_count <> 63 then
    raise exception
      'Expected 63 SECURITY DEFINER overloads, found %',
      affected_count;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
