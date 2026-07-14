create or replace function public.update_operations_manifest_artifact_status(
  p_artifact_id uuid,
  p_artifact_status text,
  p_metadata_json jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns public.operations_manifest_artifact_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_manifest_artifact_v;
begin
  if p_artifact_status not in (
    'CAPTURED',
    'VALIDATING',
    'PARSING',
    'NORMALIZED',
    'FAILED',
    'SUPERSEDED',
    'IGNORED'
  ) then
    raise exception 'Unsupported manifest artifact status %', p_artifact_status;
  end if;

  update core.operations_manifest_artifact
  set
    artifact_status = p_artifact_status,
    metadata_json = metadata_json || coalesce(p_metadata_json, '{}'::jsonb),
    error_message = p_error_message,
    processed_at = case
      when p_artifact_status in ('NORMALIZED', 'FAILED', 'SUPERSEDED', 'IGNORED') then now()
      else processed_at
    end,
    updated_at = now()
  where id = p_artifact_id;

  select *
  into v_row
  from public.operations_manifest_artifact_v
  where id = p_artifact_id;

  return v_row;
end;
$$;

create or replace function public.replace_operations_delivery_manifest_rows(
  p_artifact_id uuid,
  p_stop_rows jsonb default '[]'::jsonb,
  p_package_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_artifact core.operations_manifest_artifact%rowtype;
  v_stop_count integer := 0;
  v_package_count integer := 0;
begin
  select *
  into v_artifact
  from core.operations_manifest_artifact
  where id = p_artifact_id;

  if v_artifact.id is null then
    raise exception 'Manifest artifact not found';
  end if;

  if v_artifact.manifest_type <> 'delivery' then
    raise exception 'Artifact % is not a delivery manifest', p_artifact_id;
  end if;

  delete from core.operations_delivery_manifest_stop
  where source_artifact_id = p_artifact_id;

  delete from core.operations_delivery_manifest_package
  where source_artifact_id = p_artifact_id;

  insert into core.operations_delivery_manifest_stop (
    company_id,
    service_date,
    route_key,
    st_number,
    sid,
    recipient,
    contact_name,
    phone,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    delivery_time_begin,
    delivery_time_end,
    package_count,
    stop_instructions,
    completed,
    source_artifact_id,
    source_capture_plan_id
  )
  select
    v_artifact.company_id,
    v_artifact.service_date,
    v_artifact.route_key,
    row_data.st_number,
    row_data.sid,
    row_data.recipient,
    row_data.contact_name,
    row_data.phone,
    row_data.address_line_1,
    row_data.address_line_2,
    row_data.city,
    row_data.state,
    row_data.postal_code,
    row_data.delivery_time_begin,
    row_data.delivery_time_end,
    row_data.package_count,
    row_data.stop_instructions,
    row_data.completed,
    v_artifact.id,
    v_artifact.capture_plan_id
  from jsonb_to_recordset(coalesce(p_stop_rows, '[]'::jsonb)) as row_data(
    st_number text,
    sid text,
    recipient text,
    contact_name text,
    phone text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    postal_code text,
    delivery_time_begin text,
    delivery_time_end text,
    package_count integer,
    stop_instructions text,
    completed text
  );

  get diagnostics v_stop_count = row_count;

  insert into core.operations_delivery_manifest_package (
    company_id,
    service_date,
    route_key,
    st_number,
    sid,
    recipient,
    contact_name,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    tracking_id,
    prem_svc_raw,
    is_express,
    is_residential,
    is_signature,
    is_hazmat,
    is_collection,
    source_artifact_id,
    source_capture_plan_id
  )
  select
    v_artifact.company_id,
    v_artifact.service_date,
    v_artifact.route_key,
    row_data.st_number,
    row_data.sid,
    row_data.recipient,
    row_data.contact_name,
    row_data.address_line_1,
    row_data.address_line_2,
    row_data.city,
    row_data.state,
    row_data.postal_code,
    row_data.tracking_id,
    row_data.prem_svc_raw,
    coalesce(row_data.is_express, false),
    coalesce(row_data.is_residential, false),
    coalesce(row_data.is_signature, false),
    coalesce(row_data.is_hazmat, false),
    coalesce(row_data.is_collection, false),
    v_artifact.id,
    v_artifact.capture_plan_id
  from jsonb_to_recordset(coalesce(p_package_rows, '[]'::jsonb)) as row_data(
    st_number text,
    sid text,
    recipient text,
    contact_name text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    postal_code text,
    tracking_id text,
    prem_svc_raw text,
    is_express boolean,
    is_residential boolean,
    is_signature boolean,
    is_hazmat boolean,
    is_collection boolean
  );

  get diagnostics v_package_count = row_count;

  return jsonb_build_object(
    'artifact_id', p_artifact_id,
    'delivery_stop_count', v_stop_count,
    'delivery_package_count', v_package_count
  );
end;
$$;

create or replace function public.replace_operations_pickup_manifest_rows(
  p_artifact_id uuid,
  p_pickup_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_artifact core.operations_manifest_artifact%rowtype;
  v_pickup_count integer := 0;
begin
  select *
  into v_artifact
  from core.operations_manifest_artifact
  where id = p_artifact_id;

  if v_artifact.id is null then
    raise exception 'Manifest artifact not found';
  end if;

  if v_artifact.manifest_type <> 'pickup' then
    raise exception 'Artifact % is not a pickup manifest', p_artifact_id;
  end if;

  delete from core.operations_pickup_manifest_stop
  where source_artifact_id = p_artifact_id;

  insert into core.operations_pickup_manifest_stop (
    company_id,
    service_date,
    route_key,
    pickup_list,
    station,
    wa,
    puid,
    pickup_type,
    shipper_number,
    shipper_name,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    ready_at,
    close_at,
    pu_closed_at,
    reason_code,
    package_count_expected,
    packages_picked_up,
    source_artifact_id,
    source_capture_plan_id
  )
  select
    v_artifact.company_id,
    v_artifact.service_date,
    v_artifact.route_key,
    row_data.pickup_list,
    row_data.station,
    row_data.wa,
    row_data.puid,
    row_data.pickup_type,
    row_data.shipper_number,
    row_data.shipper_name,
    row_data.address_line_1,
    row_data.address_line_2,
    row_data.city,
    row_data.state,
    row_data.postal_code,
    row_data.ready_at,
    row_data.close_at,
    row_data.pu_closed_at,
    row_data.reason_code,
    row_data.package_count_expected,
    row_data.packages_picked_up,
    v_artifact.id,
    v_artifact.capture_plan_id
  from jsonb_to_recordset(coalesce(p_pickup_rows, '[]'::jsonb)) as row_data(
    pickup_list text,
    station text,
    wa text,
    puid text,
    pickup_type text,
    shipper_number text,
    shipper_name text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    postal_code text,
    ready_at text,
    close_at text,
    pu_closed_at text,
    reason_code text,
    package_count_expected integer,
    packages_picked_up integer
  );

  get diagnostics v_pickup_count = row_count;

  return jsonb_build_object(
    'artifact_id', p_artifact_id,
    'pickup_stop_count', v_pickup_count
  );
end;
$$;

revoke all on function public.update_operations_manifest_artifact_status(uuid, text, jsonb, text) from public;
grant all on function public.update_operations_manifest_artifact_status(uuid, text, jsonb, text) to service_role;

revoke all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) from public;
grant all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) to service_role;

revoke all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) from public;
grant all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) to service_role;
