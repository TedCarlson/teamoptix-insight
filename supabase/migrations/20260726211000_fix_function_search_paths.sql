begin;

-- These helper functions only use trigger records, parameters, operators, and
-- built-in functions. Pinning them to pg_catalog prevents caller-controlled
-- schemas from changing name resolution.
alter function billing.touch_updated_at()
  set search_path = pg_catalog;

alter function commercial.touch_updated_at()
  set search_path = pg_catalog;

alter function legal.touch_customer_legal_task_updated_at()
  set search_path = pg_catalog;

alter function core.operations_manifest_address_key(text, text, text, text, text)
  set search_path = pg_catalog;

alter function public.collection_request_lane_priority(text)
  set search_path = pg_catalog;

alter function public.collection_artifact_ingest_priority(text, text, text, jsonb)
  set search_path = pg_catalog;

alter function fleet.operational_class_from_verified_gvwr(integer, text)
  set search_path = pg_catalog;

notify pgrst, 'reload schema';

commit;
