-- Keep one canonical artifact per route/type/day and make the Express read path
-- operate on the small in-day fact set before joining related details.

with ranked as (
  select
    id,
    first_value(id) over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as keeper_id,
    row_number() over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as row_rank
  from core.operations_manifest_artifact
), duplicates as (
  select id, keeper_id
  from ranked
  where row_rank > 1
)
update core.operations_delivery_manifest_stop fact
set
  source_artifact_id = duplicates.keeper_id,
  source_capture_plan_id = keeper.capture_plan_id
from duplicates
join core.operations_manifest_artifact keeper on keeper.id = duplicates.keeper_id
where fact.source_artifact_id = duplicates.id;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as keeper_id,
    row_number() over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as row_rank
  from core.operations_manifest_artifact
), duplicates as (
  select id, keeper_id from ranked where row_rank > 1
)
update core.operations_delivery_manifest_package fact
set
  source_artifact_id = duplicates.keeper_id,
  source_capture_plan_id = keeper.capture_plan_id
from duplicates
join core.operations_manifest_artifact keeper on keeper.id = duplicates.keeper_id
where fact.source_artifact_id = duplicates.id;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as keeper_id,
    row_number() over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as row_rank
  from core.operations_manifest_artifact
), duplicates as (
  select id, keeper_id from ranked where row_rank > 1
)
update core.operations_pickup_manifest_stop fact
set
  source_artifact_id = duplicates.keeper_id,
  source_capture_plan_id = keeper.capture_plan_id
from duplicates
join core.operations_manifest_artifact keeper on keeper.id = duplicates.keeper_id
where fact.source_artifact_id = duplicates.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by company_id, service_date, route_key, manifest_type
      order by captured_at desc, updated_at desc, id desc
    ) as row_rank
  from core.operations_manifest_artifact
)
delete from core.operations_manifest_artifact artifact
using ranked
where artifact.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists operations_manifest_artifact_identity_uidx
  on core.operations_manifest_artifact (
    company_id,
    service_date,
    route_key,
    manifest_type
  );

create index if not exists operations_delivery_manifest_package_inday_express_idx
  on core.operations_delivery_manifest_package (
    company_id,
    service_date,
    route_key,
    st_number,
    tracking_id
  )
  where is_express = true;

create or replace function public.register_operations_manifest_artifact(
  p_capture_plan_id uuid,
  p_capture_plan_route_id uuid,
  p_manifest_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_filename text,
  p_normalized_filename text,
  p_content_type text default null,
  p_size_bytes bigint default 0,
  p_source_hash text default null,
  p_runner_key text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.operations_manifest_artifact_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_plan core.operations_manifest_capture_plan%rowtype;
  v_route core.operations_manifest_capture_plan_route%rowtype;
  v_artifact_id uuid;
  v_row public.operations_manifest_artifact_v;
begin
  select * into v_plan
  from core.operations_manifest_capture_plan
  where id = p_capture_plan_id;

  if v_plan.id is null then
    raise exception 'Manifest capture plan not found';
  end if;

  select * into v_route
  from core.operations_manifest_capture_plan_route
  where id = p_capture_plan_route_id
    and capture_plan_id = p_capture_plan_id;

  if v_route.id is null then
    raise exception 'Manifest capture plan route not found';
  end if;

  if p_manifest_type not in ('delivery', 'pickup') then
    raise exception 'Unsupported manifest_type %', p_manifest_type;
  end if;

  insert into core.operations_manifest_artifact (
    capture_plan_id, capture_plan_route_id, company_id, service_date,
    route_key, route_label, manifest_type, artifact_status, storage_bucket,
    storage_path, original_filename, normalized_filename, content_type,
    size_bytes, source_hash, runner_key, captured_at, processed_at,
    metadata_json, error_message
  ) values (
    p_capture_plan_id, p_capture_plan_route_id, v_plan.company_id,
    v_plan.service_date, v_route.route_key, v_route.route_label,
    p_manifest_type, 'CAPTURED', p_storage_bucket, p_storage_path,
    p_original_filename,
    coalesce(nullif(p_normalized_filename, ''), p_original_filename),
    nullif(p_content_type, ''), coalesce(p_size_bytes, 0),
    nullif(p_source_hash, ''), nullif(p_runner_key, ''), now(), null,
    coalesce(p_metadata_json, '{}'::jsonb), null
  )
  on conflict (company_id, service_date, route_key, manifest_type)
  do update set
    capture_plan_id = excluded.capture_plan_id,
    capture_plan_route_id = excluded.capture_plan_route_id,
    route_label = excluded.route_label,
    artifact_status = 'CAPTURED',
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    original_filename = excluded.original_filename,
    normalized_filename = excluded.normalized_filename,
    content_type = excluded.content_type,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_key = excluded.runner_key,
    captured_at = now(),
    processed_at = null,
    metadata_json = excluded.metadata_json,
    error_message = null,
    updated_at = now()
  returning id into v_artifact_id;

  update core.operations_manifest_capture_plan_route
  set route_status = case
        when route_status in ('QUEUED', 'RUNNING', 'PARTIAL') then 'ARTIFACTS_READY'
        else route_status
      end,
      last_success_at = now(),
      updated_at = now()
  where id = p_capture_plan_route_id;

  update core.operations_manifest_capture_plan
  set plan_status = case
        when plan_status in ('QUEUED', 'CLAIMED', 'RUNNING') then 'ARTIFACTS_READY'
        else plan_status
      end,
      updated_at = now()
  where id = p_capture_plan_id;

  select * into v_row
  from public.operations_manifest_artifact_v
  where id = v_artifact_id;

  return v_row;
end;
$$;

create or replace view public.operations_manifest_express_report_v
with (security_invoker = true) as
select
  pkg.company_id,
  company.company_slug,
  pkg.service_date,
  pkg.route_key,
  artifact.route_label,
  pkg.source_capture_plan_id as capture_plan_id,
  artifact.capture_plan_route_id,
  pkg.source_artifact_id,
  pkg.st_number,
  pkg.sid,
  pkg.tracking_id,
  pkg.prem_svc_raw,
  pkg.recipient,
  pkg.contact_name,
  pkg.address_line_1,
  pkg.address_line_2,
  pkg.city,
  pkg.state,
  pkg.postal_code,
  stop.completed,
  stop.delivery_time_begin,
  stop.delivery_time_end,
  stop.stop_instructions,
  pkg.is_residential,
  pkg.is_signature,
  pkg.is_hazmat,
  pkg.is_collection,
  artifact.artifact_status,
  artifact.captured_at,
  artifact.processed_at,
  pkg.created_at,
  location.latitude,
  location.longitude,
  location.geocode_status,
  location.geocode_precision
from core.operations_delivery_manifest_package pkg
join core.companies company on company.id = pkg.company_id
join core.operations_manifest_artifact artifact on artifact.id = pkg.source_artifact_id
left join core.operations_delivery_manifest_stop stop
  on stop.company_id = pkg.company_id
  and stop.service_date = pkg.service_date
  and stop.route_key = pkg.route_key
  and stop.stop_identity_key = concat(
    coalesce(nullif(btrim(pkg.st_number), ''), ''),
    '|',
    coalesce(nullif(btrim(pkg.sid), ''), '')
  )
left join core.operations_stop_location_coordinate location
  on location.company_id = pkg.company_id
  and coalesce(location.sid, '') = coalesce(pkg.sid, '')
  and location.address_key = core.operations_manifest_address_key(
    pkg.address_line_1,
    pkg.address_line_2,
    pkg.city,
    pkg.state,
    pkg.postal_code
  )
where pkg.is_express = true;

grant select on table public.operations_manifest_express_report_v to authenticated;
grant select on table public.operations_manifest_express_report_v to service_role;
