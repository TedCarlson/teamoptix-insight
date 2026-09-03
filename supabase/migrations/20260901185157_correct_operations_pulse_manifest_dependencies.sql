begin;

-- Keep collection paused while correcting the governed report contract. The
-- runner will apply this version before Team Optix explicitly resumes it.
update core.operations_runner_schedule
set
  report_config_json = jsonb_set(
    coalesce(report_config_json, '{}'::jsonb),
    '{operations_pulse}',
    '["DSW","FCC","DELIVERY_MANIFEST","PICKUP_MANIFEST","ROUTE_GPX"]'::jsonb,
    true
  ),
  config_version = config_version + 1,
  updated_at = now()
where runner_key = 'r-beacon-point-ventures-prod'
  and coalesce(report_config_json -> 'operations_pulse', 'null'::jsonb)
    is distinct from
      '["DSW","FCC","DELIVERY_MANIFEST","PICKUP_MANIFEST","ROUTE_GPX"]'::jsonb;

commit;
