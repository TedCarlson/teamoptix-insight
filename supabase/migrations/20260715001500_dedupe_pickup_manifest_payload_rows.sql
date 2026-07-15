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

  with parsed as (
    select
      row_data.*,
      btrim(row_data.puid) as normalized_puid,
      row_number() over (
        partition by btrim(row_data.puid)
        order by
          case when nullif(btrim(row_data.pu_closed_at), '') is not null then 0 else 1 end,
          coalesce(row_data.packages_picked_up, -1) desc,
          coalesce(row_data.package_count_expected, -1) desc
      ) as puid_rank
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
    where nullif(btrim(row_data.puid), '') is not null
  ),
  incoming as (
    select *
    from parsed
    where puid_rank = 1
  )
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
    i.pickup_list,
    i.station,
    i.wa,
    i.normalized_puid,
    i.pickup_type,
    i.shipper_number,
    i.shipper_name,
    i.address_line_1,
    i.address_line_2,
    i.city,
    i.state,
    i.postal_code,
    i.ready_at,
    i.close_at,
    i.pu_closed_at,
    i.reason_code,
    i.package_count_expected,
    i.packages_picked_up,
    v_artifact.id,
    v_artifact.capture_plan_id
  from incoming i
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

revoke all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) from public;
grant all on function public.replace_operations_pickup_manifest_rows(uuid, jsonb) to service_role;
