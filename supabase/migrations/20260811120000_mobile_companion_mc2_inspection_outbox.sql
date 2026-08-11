begin;

-- MC-2 inspection submissions originate in the encrypted device outbox. The
-- device id is durable across retries so a reconnect can never create a second
-- inspection for the same driver action.
alter table fleet.inspection
  add column if not exists device_submission_id uuid;

create unique index if not exists fleet_inspection_device_submission_uidx
  on fleet.inspection(company_id, device_submission_id)
  where device_submission_id is not null;

comment on column fleet.inspection.device_submission_id is
  'Mobile Companion device-generated idempotency key. It identifies a single driver submission, not payroll, carrier, vehicle assignment, or delivery truth.';

-- The native app re-encodes evidence before upload and uses a governed,
-- tenant-prefixed object key. Registration remains authoritative and
-- idempotent if a network interruption occurs after storage accepts a file.
drop policy if exists fleet_inspection_evidence_mobile_insert on storage.objects;
create policy fleet_inspection_evidence_mobile_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fleet-inspection-evidence'
  and exists (
    select 1
    from core.companies company
    where company.company_slug = (storage.foldername(name))[1]
      and company.company_status = 'active'
      and core.can_access_company(company.id)
  )
);

create or replace function public.register_mobile_companion_inspection_evidence(
  p_company_slug text,
  p_vehicle_id uuid,
  p_item_key text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_existing fleet.inspection_evidence_object%rowtype;
  v_id uuid;
begin
  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  if not exists (
    select 1 from fleet.vehicle vehicle
    where vehicle.id = p_vehicle_id
      and vehicle.company_id = v_authority.company_id
      and vehicle.status <> 'RETIRED'
  ) then
    raise exception 'VEHICLE_UNAVAILABLE';
  end if;

  if nullif(btrim(p_item_key), '') is null
     or p_content_type <> 'image/jpeg'
     or p_size_bytes <= 0
     or p_size_bytes > 10485760
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path !~ ('^' || lower(btrim(p_company_slug)) || '/' || p_vehicle_id::text || '/pending/[0-9a-f-]+-[a-z0-9_]+-[0-9]+[.]jpg$') then
    raise exception 'INVALID_EVIDENCE_METADATA';
  end if;

  select evidence.* into v_existing
  from fleet.inspection_evidence_object evidence
  where evidence.hot_storage_path = p_storage_path;

  if v_existing.id is not null then
    if v_existing.company_id <> v_authority.company_id
       or v_existing.vehicle_id <> p_vehicle_id
       or v_existing.uploaded_by_profile_id <> v_authority.profile_id
       or v_existing.sha256 <> p_sha256 then
      raise exception 'EVIDENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  insert into fleet.inspection_evidence_object (
    company_id,
    vehicle_id,
    uploaded_by_profile_id,
    item_key,
    hot_storage_bucket,
    hot_storage_path,
    content_type,
    size_bytes,
    sha256
  ) values (
    v_authority.company_id,
    p_vehicle_id,
    v_authority.profile_id,
    btrim(p_item_key),
    'fleet-inspection-evidence',
    p_storage_path,
    p_content_type,
    p_size_bytes,
    p_sha256
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_mobile_companion_inspection_evidence(
  text, uuid, text, text, text, bigint, text
) from public, anon;
grant execute on function public.register_mobile_companion_inspection_evidence(
  text, uuid, text, text, text, bigint, text
) to authenticated, service_role;

create or replace function public.submit_mobile_companion_fleet_inspection(
  p_company_slug text,
  p_device_submission_id uuid,
  p_vehicle_id uuid,
  p_inspection_type text,
  p_odometer_miles integer,
  p_safe_to_operate boolean,
  p_driver_notes text,
  p_route_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority record;
  v_existing_id uuid;
  v_inspection_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_media_paths text[];
  v_has_defect boolean := false;
  v_required_keys constant text[] := array[
    'exterior_front',
    'exterior_rear',
    'exterior_driver',
    'exterior_passenger'
  ];
  v_all_keys constant text[] := array[
    'service_brakes', 'parking_brake', 'steering', 'horn', 'seat_belt',
    'lights', 'wipers', 'mirrors', 'tires', 'wheels', 'doors', 'steps',
    'leaks', 'exterior_front', 'exterior_rear', 'exterior_driver',
    'exterior_passenger', 'equipment', 'documents'
  ];
begin
  if p_device_submission_id is null then
    raise exception 'DEVICE_SUBMISSION_ID_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_submission_id::text, 0)
  );

  select * into v_authority
  from core.resolve_authenticated_driver_authority(p_company_slug);

  select inspection.id into v_existing_id
  from fleet.inspection inspection
  where inspection.company_id = v_authority.company_id
    and inspection.device_submission_id = p_device_submission_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if not exists (
    select 1 from fleet.vehicle vehicle
    where vehicle.id = p_vehicle_id
      and vehicle.company_id = v_authority.company_id
      and vehicle.status <> 'RETIRED'
  ) then
    raise exception 'VEHICLE_UNAVAILABLE';
  end if;

  if p_inspection_type not in ('PRE_TRIP', 'POST_TRIP', 'MID_ROUTE') then
    raise exception 'INVALID_INSPECTION_TYPE';
  end if;

  if p_odometer_miles is null or p_odometer_miles < 0 then
    raise exception 'ODOMETER_REQUIRED';
  end if;

  if p_safe_to_operate is null then
    raise exception 'SAFE_TO_OPERATE_REQUIRED';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) <> 19
     or (
       select count(distinct item ->> 'item_key')
       from jsonb_array_elements(p_items) item
     ) <> 19
     or exists (
       select 1
       from jsonb_array_elements(p_items) item
       where not ((item ->> 'item_key') = any(v_all_keys))
          or (item ->> 'result') not in ('PASS', 'DEFECT', 'NOT_APPLICABLE')
          or (
            item ->> 'result' = 'DEFECT'
            and nullif(btrim(item ->> 'notes'), '') is null
          )
          or (
            (item ->> 'item_key') = any(v_required_keys)
            and jsonb_array_length(coalesce(item -> 'media_paths', '[]'::jsonb)) = 0
          )
     ) then
    raise exception 'INSPECTION_INCOMPLETE';
  end if;

  v_has_defect := exists (
    select 1 from jsonb_array_elements(p_items) item
    where item ->> 'result' = 'DEFECT'
  );

  insert into fleet.inspection (
    company_id,
    vehicle_id,
    driver_roster_member_id,
    inspection_type,
    record_class,
    status,
    odometer_miles,
    submitted_at,
    safe_to_operate_driver,
    driver_notes,
    route_name,
    device_submission_id
  ) values (
    v_authority.company_id,
    p_vehicle_id,
    v_authority.roster_member_id,
    p_inspection_type,
    case when v_has_defect then 'DVIR_DEFECT_REPORT' else 'COMPANY_INSPECTION' end,
    'SUBMITTED',
    p_odometer_miles,
    now(),
    p_safe_to_operate,
    nullif(btrim(p_driver_notes), ''),
    nullif(btrim(p_route_name), ''),
    p_device_submission_id
  )
  returning id into v_inspection_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select coalesce(array_agg(path), '{}'::text[])
    into v_media_paths
    from jsonb_array_elements_text(coalesce(v_item -> 'media_paths', '[]'::jsonb)) path;

    insert into fleet.inspection_item (
      inspection_id,
      company_id,
      section_key,
      item_key,
      item_label,
      result,
      notes,
      media_paths
    ) values (
      v_inspection_id,
      v_authority.company_id,
      v_item ->> 'section_key',
      v_item ->> 'item_key',
      v_item ->> 'item_label',
      v_item ->> 'result',
      nullif(btrim(v_item ->> 'notes'), ''),
      v_media_paths
    )
    returning id into v_item_id;

    if v_item ->> 'result' = 'DEFECT' then
      insert into fleet.defect (
        company_id,
        vehicle_id,
        inspection_id,
        inspection_item_id,
        reported_by_roster_member_id,
        category,
        summary,
        description,
        severity,
        safe_to_operate_driver,
        media_paths
      ) values (
        v_authority.company_id,
        p_vehicle_id,
        v_inspection_id,
        v_item_id,
        v_authority.roster_member_id,
        v_item ->> 'section_key',
        v_item ->> 'item_label',
        nullif(btrim(v_item ->> 'notes'), ''),
        case when p_safe_to_operate then 'REPAIR_SOON' else 'UNSAFE_OUT_OF_SERVICE' end,
        p_safe_to_operate,
        v_media_paths
      );
    end if;
  end loop;

  update fleet.vehicle
  set
    odometer_miles = p_odometer_miles,
    odometer_recorded_at = now(),
    status = case when not p_safe_to_operate then 'OUT_OF_SERVICE' else status end,
    updated_at = now()
  where id = p_vehicle_id
    and company_id = v_authority.company_id;

  return v_inspection_id;
end;
$$;

revoke all on function public.submit_mobile_companion_fleet_inspection(
  text, uuid, uuid, text, integer, boolean, text, text, jsonb
) from public, anon;
grant execute on function public.submit_mobile_companion_fleet_inspection(
  text, uuid, uuid, text, integer, boolean, text, text, jsonb
) to authenticated, service_role;

insert into platform.switchboard (
  library_key,
  display_name,
  source_schema,
  source_object,
  object_type,
  status,
  source,
  notes
)
values (
  'public.submit_mobile_companion_fleet_inspection',
  'Mobile Companion Inspection Submission',
  'public',
  'submit_mobile_companion_fleet_inspection',
  'FUNCTION',
  'ACTIVE',
  'PLATFORM',
  'MC-2 device-idempotent inspection submission contract. The device outbox may retry safely; the warehouse remains the inspection authority.'
)
on conflict (source_schema, source_object, object_type) do update
set
  status = 'ACTIVE',
  notes = concat_ws(
    E'\n\n',
    nullif(btrim(platform.switchboard.notes), ''),
    excluded.notes
  );

commit;
