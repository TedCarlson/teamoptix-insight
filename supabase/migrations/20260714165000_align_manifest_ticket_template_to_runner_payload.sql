update core.operations_ticket_template
set
  execution_lane = 'operations_collection_request',
  description = 'Collect delivery and pickup manifests for all P&D work areas through the current VPS runner collection request lane.',
  default_collection_mode = 'all_route_manifests',
  default_manifest_types = array['delivery', 'pickup'],
  default_skip_combined = true,
  default_payload_json = jsonb_build_object(
    'source', 'teamoptix_assignment_runner_payload',
    'intent', 'all_route_manifest_capture',
    'collect_scope', 'all_route_manifests',
    'runner_goal', 'collect_delivery_pickup_manifests_for_all_p_and_d_work_areas',
    'manifest_work_area_mode', 'all_options_except_zero',
    'manifest_types', jsonb_build_array('delivery', 'pickup'),
    'skip_combined', true,
    'targets', jsonb_build_array(
      jsonb_build_object(
        'key', 'P_AND_D_DELIVERY_MANIFEST',
        'label', 'P&D · Delivery Manifest',
        'artifact_key', 'DELIVERY_MANIFEST',
        'report_family_key', 'FCC',
        'runner_section', 'P_AND_D',
        'expected_filename_match', jsonb_build_array('DeliveryManifest')
      ),
      jsonb_build_object(
        'key', 'P_AND_D_PICKUP_MANIFEST',
        'label', 'P&D · Pickup Manifest',
        'artifact_key', 'PICKUP_MANIFEST',
        'report_family_key', 'FCC',
        'runner_section', 'P_AND_D',
        'expected_filename_match', jsonb_build_array('PickupManifest', 'PM')
      )
    )
  ),
  updated_at = now()
where template_key = 'MANIFEST_ROUTE_CAPTURE';
