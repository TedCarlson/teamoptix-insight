alter table core.operations_delivery_manifest_stop
  add column if not exists stop_identity_key text;

update core.operations_delivery_manifest_stop
set stop_identity_key =
  case
    when nullif(btrim(sid), '') is not null
      or (
        nullif(btrim(st_number), '') is not null
        and btrim(st_number) <> '0'
      )
    then concat(
      coalesce(nullif(btrim(st_number), ''), ''),
      '|',
      coalesce(nullif(btrim(sid), ''), '')
    )
    else null
  end
where stop_identity_key is null;

with ranked as (
  select
    s.id,
    row_number() over (
      partition by
        s.company_id,
        s.service_date,
        s.route_key,
        s.stop_identity_key
      order by
        a.processed_at desc nulls last,
        a.captured_at desc nulls last,
        s.created_at desc,
        s.id desc
    ) as row_rank
  from core.operations_delivery_manifest_stop s
  join core.operations_manifest_artifact a
    on a.id = s.source_artifact_id
  where s.stop_identity_key is not null
)
delete from core.operations_delivery_manifest_stop s
using ranked r
where s.id = r.id
  and r.row_rank > 1;

with ranked as (
  select
    p.id,
    row_number() over (
      partition by
        p.company_id,
        p.service_date,
        p.route_key,
        btrim(p.tracking_id)
      order by
        a.processed_at desc nulls last,
        a.captured_at desc nulls last,
        p.created_at desc,
        p.id desc
    ) as row_rank
  from core.operations_delivery_manifest_package p
  join core.operations_manifest_artifact a
    on a.id = p.source_artifact_id
)
delete from core.operations_delivery_manifest_package p
using ranked r
where p.id = r.id
  and r.row_rank > 1;

with ranked as (
  select
    pu.id,
    row_number() over (
      partition by
        pu.company_id,
        pu.service_date,
        pu.route_key,
        btrim(pu.puid)
      order by
        a.processed_at desc nulls last,
        a.captured_at desc nulls last,
        pu.created_at desc,
        pu.id desc
    ) as row_rank
  from core.operations_pickup_manifest_stop pu
  join core.operations_manifest_artifact a
    on a.id = pu.source_artifact_id
)
delete from core.operations_pickup_manifest_stop pu
using ranked r
where pu.id = r.id
  and r.row_rank > 1;

create unique index if not exists operations_delivery_manifest_stop_identity_uidx
  on core.operations_delivery_manifest_stop (
    company_id,
    service_date,
    route_key,
    stop_identity_key
  )
  where stop_identity_key is not null;

create unique index if not exists operations_delivery_manifest_package_identity_uidx
  on core.operations_delivery_manifest_package (
    company_id,
    service_date,
    route_key,
    tracking_id
  );

create unique index if not exists operations_pickup_manifest_stop_identity_uidx
  on core.operations_pickup_manifest_stop (
    company_id,
    service_date,
    route_key,
    puid
  );

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
  where source_artifact_id = p_artifact_id
    and stop_identity_key is null;

  with incoming as (
    select
      row_data.*,
      case
        when nullif(btrim(row_data.sid), '') is not null
          or (
            nullif(btrim(row_data.st_number), '') is not null
            and btrim(row_data.st_number) <> '0'
          )
        then concat(
          coalesce(nullif(btrim(row_data.st_number), ''), ''),
          '|',
          coalesce(nullif(btrim(row_data.sid), ''), '')
        )
        else null
      end as stop_identity_key
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
  )
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
    source_capture_plan_id,
    stop_identity_key
  )
  select
    v_artifact.company_id,
    v_artifact.service_date,
    v_artifact.route_key,
    i.st_number,
    i.sid,
    i.recipient,
    i.contact_name,
    i.phone,
    i.address_line_1,
    i.address_line_2,
    i.city,
    i.state,
    i.postal_code,
    i.delivery_time_begin,
    i.delivery_time_end,
    i.package_count,
    i.stop_instructions,
    i.completed,
    v_artifact.id,
    v_artifact.capture_plan_id,
    i.stop_identity_key
  from incoming i
  on conflict (
    company_id,
    service_date,
    route_key,
    stop_identity_key
  )
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
    btrim(row_data.tracking_id),
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
  )
  on conflict (
    company_id,
    service_date,
    route_key,
    tracking_id
  )
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
    btrim(row_data.puid),
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
  )
  on conflict (
    company_id,
    service_date,
    route_key,
    puid
  )
  do update set
    pickup_list = excluded.pickup_list,
    station = excluded.station,
    wa = excluded.wa,
    pickup_type = excluded.pickup_type,
    shipper_number = excluded.shipper_number,
    shipper_name = excluded.shipper_name,
    address_line_1 = excluded.address_line_1,
    address_line_2 = excluded.address_line_2,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    ready_at = excluded.ready_at,
    close_at = excluded.close_at,
    pu_closed_at = excluded.pu_closed_at,
    reason_code = excluded.reason_code,
    package_count_expected = excluded.package_count_expected,
    packages_picked_up = excluded.packages_picked_up,
    source_artifact_id = excluded.source_artifact_id,
    source_capture_plan_id = excluded.source_capture_plan_id;

  get diagnostics v_pickup_count = row_count;

  return jsonb_build_object(
    'artifact_id', p_artifact_id,
    'pickup_stop_count', v_pickup_count
  );
end;
$$;

revoke all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) from public;
grant all on function public.replace_operations_delivery_manifest_rows(uuid, jsonb, jsonb) to service_role;

revoke all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) from public;
grant all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) to service_role;
