-- Delivery manifests can contain repeated stop or package identities inside one
-- workbook. PostgreSQL cannot update the same conflict target twice in one
-- INSERT ... ON CONFLICT statement, so rank the incoming payload first.

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
  v_duplicate_stop_count integer := 0;
  v_duplicate_package_count integer := 0;
  v_unidentified_stop_count integer := 0;
  v_unidentified_package_count integer := 0;
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

  with identities as (
    select core.operations_delivery_stop_identity(
      item ->> 'st_number', item ->> 'sid', item ->> 'recipient',
      item ->> 'contact_name', item ->> 'address_line_1',
      item ->> 'address_line_2', item ->> 'city', item ->> 'state',
      item ->> 'postal_code', item ->> 'delivery_time_begin',
      item ->> 'delivery_time_end'
    ) as identity_key
    from jsonb_array_elements(coalesce(p_stop_rows, '[]'::jsonb)) as items(item)
  )
  select
    greatest(
      count(*) filter (where identity_key is not null)
        - count(distinct identity_key) filter (where identity_key is not null),
      0
    )::integer,
    count(*) filter (where identity_key is null)::integer
  into v_duplicate_stop_count, v_unidentified_stop_count
  from identities;

  with identities as (
    select nullif(btrim(item ->> 'tracking_id'), '') as identity_key
    from jsonb_array_elements(coalesce(p_package_rows, '[]'::jsonb)) as items(item)
  )
  select
    greatest(
      count(*) filter (where identity_key is not null)
        - count(distinct identity_key) filter (where identity_key is not null),
      0
    )::integer,
    count(*) filter (where identity_key is null)::integer
  into v_duplicate_package_count, v_unidentified_package_count
  from identities;

  delete from core.operations_delivery_manifest_stop
  where source_artifact_id = p_artifact_id
    and stop_identity_key is null;

  with parsed as (
    select
      row_data.*,
      core.operations_delivery_stop_identity(
        row_data.st_number, row_data.sid, row_data.recipient,
        row_data.contact_name, row_data.address_line_1,
        row_data.address_line_2, row_data.city, row_data.state,
        row_data.postal_code, row_data.delivery_time_begin,
        row_data.delivery_time_end
      ) as stop_identity_key
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
    )
  ), ranked as (
    select
      parsed.*,
      row_number() over (
        partition by stop_identity_key
        order by
          (
            case when nullif(btrim(completed), '') is not null then 1 else 0 end
            + case when nullif(btrim(delivery_time_begin), '') is not null then 1 else 0 end
            + case when nullif(btrim(delivery_time_end), '') is not null then 1 else 0 end
          ) desc,
          (
            case when nullif(btrim(recipient), '') is not null then 1 else 0 end
            + case when nullif(btrim(contact_name), '') is not null then 1 else 0 end
            + case when nullif(btrim(phone), '') is not null then 1 else 0 end
            + case when nullif(btrim(address_line_1), '') is not null then 1 else 0 end
            + case when nullif(btrim(city), '') is not null then 1 else 0 end
            + case when nullif(btrim(postal_code), '') is not null then 1 else 0 end
          ) desc,
          package_count desc nulls last,
          coalesce(completed, '') desc,
          coalesce(delivery_time_end, '') desc,
          coalesce(recipient, '') desc
      ) as identity_rank
    from parsed
  ), incoming as (
    select *
    from ranked
    where stop_identity_key is null or identity_rank = 1
  )
  insert into core.operations_delivery_manifest_stop (
    company_id, service_date, route_key, st_number, sid, recipient,
    contact_name, phone, address_line_1, address_line_2, city, state,
    postal_code, delivery_time_begin, delivery_time_end, package_count,
    stop_instructions, completed, source_artifact_id,
    source_capture_plan_id, stop_identity_key
  )
  select
    v_artifact.company_id, v_artifact.service_date, v_artifact.route_key,
    i.st_number, i.sid, i.recipient, i.contact_name, i.phone,
    i.address_line_1, i.address_line_2, i.city, i.state, i.postal_code,
    i.delivery_time_begin, i.delivery_time_end, i.package_count,
    i.stop_instructions, i.completed, v_artifact.id,
    v_artifact.capture_plan_id, i.stop_identity_key
  from incoming i
  on conflict (company_id, service_date, route_key, stop_identity_key)
  where stop_identity_key is not null
  do update set
    st_number = excluded.st_number,
    sid = excluded.sid,
    recipient = excluded.recipient,
    contact_name = excluded.contact_name,
    phone = excluded.phone,
    address_line_1 = excluded.address_line_1,
    address_line_2 = excluded.address_line_2,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    delivery_time_begin = excluded.delivery_time_begin,
    delivery_time_end = excluded.delivery_time_end,
    package_count = excluded.package_count,
    stop_instructions = excluded.stop_instructions,
    completed = excluded.completed,
    source_artifact_id = excluded.source_artifact_id,
    source_capture_plan_id = excluded.source_capture_plan_id;

  get diagnostics v_stop_count = row_count;

  delete from core.operations_delivery_manifest_package
  where source_artifact_id = p_artifact_id
    and tracking_id is null;

  with parsed as (
    select
      row_data.*,
      nullif(btrim(row_data.tracking_id), '') as normalized_tracking_id
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
    )
  ), ranked as (
    select
      parsed.*,
      row_number() over (
        partition by normalized_tracking_id
        order by
          case when nullif(btrim(prem_svc_raw), '') is not null then 1 else 0 end desc,
          (
            case when nullif(btrim(recipient), '') is not null then 1 else 0 end
            + case when nullif(btrim(contact_name), '') is not null then 1 else 0 end
            + case when nullif(btrim(address_line_1), '') is not null then 1 else 0 end
            + case when nullif(btrim(city), '') is not null then 1 else 0 end
            + case when nullif(btrim(postal_code), '') is not null then 1 else 0 end
          ) desc,
          coalesce(prem_svc_raw, '') desc,
          coalesce(recipient, '') desc,
          coalesce(st_number, '') desc
      ) as identity_rank
    from parsed
  ), incoming as (
    select *
    from ranked
    where normalized_tracking_id is null or identity_rank = 1
  )
  insert into core.operations_delivery_manifest_package (
    company_id, service_date, route_key, st_number, sid, recipient,
    contact_name, address_line_1, address_line_2, city, state, postal_code,
    tracking_id, prem_svc_raw, is_express, is_residential, is_signature,
    is_hazmat, is_collection, source_artifact_id, source_capture_plan_id
  )
  select
    v_artifact.company_id, v_artifact.service_date, v_artifact.route_key,
    i.st_number, i.sid, i.recipient, i.contact_name, i.address_line_1,
    i.address_line_2, i.city, i.state, i.postal_code,
    i.normalized_tracking_id, i.prem_svc_raw,
    coalesce(i.is_express, false), coalesce(i.is_residential, false),
    coalesce(i.is_signature, false), coalesce(i.is_hazmat, false),
    coalesce(i.is_collection, false), v_artifact.id,
    v_artifact.capture_plan_id
  from incoming i
  on conflict (company_id, service_date, route_key, tracking_id)
  do update set
    st_number = excluded.st_number,
    sid = excluded.sid,
    recipient = excluded.recipient,
    contact_name = excluded.contact_name,
    address_line_1 = excluded.address_line_1,
    address_line_2 = excluded.address_line_2,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    prem_svc_raw = excluded.prem_svc_raw,
    is_express = excluded.is_express,
    is_residential = excluded.is_residential,
    is_signature = excluded.is_signature,
    is_hazmat = excluded.is_hazmat,
    is_collection = excluded.is_collection,
    source_artifact_id = excluded.source_artifact_id,
    source_capture_plan_id = excluded.source_capture_plan_id;

  get diagnostics v_package_count = row_count;

  return jsonb_build_object(
    'artifact_id', p_artifact_id,
    'delivery_stop_count', v_stop_count,
    'delivery_package_count', v_package_count,
    'duplicate_stop_count', v_duplicate_stop_count,
    'duplicate_package_count', v_duplicate_package_count,
    'unidentified_stop_count', v_unidentified_stop_count,
    'unidentified_package_count', v_unidentified_package_count
  );
end;
$$;

revoke all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) from public;
grant all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) to service_role;
