begin;

-- These API views expose company operations, payroll, legal, automation,
-- platform health, and intake administration data. Public intake reads flow
-- through server-owned endpoints, so no browser requires direct anon access.
-- Preserve the existing signed-in and service-role behavior while removing
-- both direct anon grants and any SELECT inherited from PUBLIC.
do $$
declare
  relation_name text;
  affected_count integer := 0;
  target_names constant text[] := array[
    'company_fleet_defect_v',
    'company_fleet_evidence_v',
    'company_fleet_inspection_v',
    'company_fleet_status_v',
    'company_fleet_vehicle_v',
    'company_fleet_work_order_v',
    'company_message',
    'company_message_ack',
    'company_message_recipient',
    'company_operations_ticket_assignment_v',
    'company_payroll_work_event_v',
    'company_roster_license_fact_v',
    'company_roster_personal_fact_v',
    'intake_capabilities_v',
    'intake_lob_capabilities_v',
    'intake_lobs_v',
    'intake_question_capabilities_v',
    'intake_question_lobs_v',
    'intake_questions_v',
    'legal_document_v',
    'legal_document_vault_item_v',
    'legal_document_version_acceptance_v',
    'legal_document_version_v',
    'operations_collection_artifact_runtime_v',
    'operations_collection_cost_observation_v',
    'operations_collection_recovery_candidate_v',
    'operations_collection_request_runtime_v',
    'operations_collection_runtime_baseline_v',
    'operations_collection_runtime_event_v',
    'operations_delivery_manifest_package_v',
    'operations_delivery_manifest_stop_v',
    'operations_manifest_artifact_v',
    'operations_manifest_capture_plan_route_v',
    'operations_manifest_capture_plan_v',
    'operations_manifest_express_package_signal_v',
    'operations_manifest_express_report_v',
    'operations_manifest_express_route_signal_v',
    'operations_manifest_route_health_v',
    'operations_manifest_route_summary_v',
    'operations_pickup_manifest_stop_v',
    'operations_ticket_template_v',
    'operations_watchlist_item_v',
    'operations_watchlist_note_v',
    'platform_service_check_run_v',
    'platform_service_health_v',
    'workspace_requests_v'
  ];
begin
  for relation_name in
    select relation.relname
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('v', 'm')
      and relation.relname = any(target_names)
    order by relation.relname
  loop
    execute format(
      'revoke all privileges on table public.%I from public, anon',
      relation_name
    );
    execute format(
      'grant select on table public.%I to authenticated, service_role',
      relation_name
    );

    affected_count := affected_count + 1;
  end loop;

  if affected_count <> 46 then
    raise exception
      'Expected 46 public API views, found %',
      affected_count;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
