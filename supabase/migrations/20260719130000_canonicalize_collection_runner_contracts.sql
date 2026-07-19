-- Persist the same machine contract that request generation enforces at runtime.
-- Labels remain available for people; runner_goal is reserved for execution logic.
update core.operations_ticket_template
set default_payload_json = coalesce(default_payload_json, '{}'::jsonb)
  || jsonb_build_object(
    'payload_contract_version', 'operations_collection_v2',
    'runner_goal', case upper(coalesce(default_payload_json ->> 'request_type', ''))
      when 'PREVIOUS_DAY_CLOSE' then 'collect_previous_day_dsw'
      when 'HISTORICAL_BACKFILL' then 'collect_historical_dsw_range'
      when 'TARGETED_RECOVERY' then 'collect_targeted_artifacts'
      when 'LAST_LOOK' then 'collect_last_look_artifacts'
      when 'OPERATIONS_PULSE' then 'keep_operations_current'
      else coalesce(default_payload_json ->> 'runner_goal', 'collect_governed_artifacts')
    end,
    'runner_goal_label', coalesce(
      nullif(default_payload_json ->> 'runner_goal_label', ''),
      template_name
    )
  ),
  updated_at = now()
where execution_lane = 'operations_collection_request';
