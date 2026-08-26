begin;

-- Vehicle inspections are one governed workflow on every client. A signed-in
-- driver may submit for their own company, while a non-driver must hold the
-- shared Fleet workspace grant. This keeps iPhone, iPad, and web on one
-- authority contract without manufacturing a driver identity for managers.
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
  v_company_id uuid;
  v_profile_id uuid;
  v_roster_count integer := 0;
  v_roster_member_id uuid;
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

  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  v_profile_id := core.current_profile_id();
  if v_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  join core.company_memberships membership
    on membership.company_id = company.id
   and membership.profile_id = v_profile_id
   and membership.membership_status = 'active'
  where company.company_slug = lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_MEMBERSHIP_REQUIRED';
  end if;

  select count(*)
  into v_roster_count
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.profile_id = v_profile_id
    and roster.employment_status in ('Active', 'Trainee')
    and roster.roster_record_kind = 'INTERNAL';

  if v_roster_count = 1 then
    select roster.id
    into v_roster_member_id
    from core.company_roster roster
    where roster.company_id = v_company_id
      and roster.profile_id = v_profile_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL'
    limit 1;
  else
    v_roster_member_id := null;
  end if;

  if v_roster_member_id is null
     and not core.mobile_companion_can_use_workspace(v_company_id, 'fleet') then
    raise exception 'FLEET_INSPECTION_ACCESS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_submission_id::text, 0)
  );

  select inspection.id
  into v_existing_id
  from fleet.inspection inspection
  where inspection.company_id = v_company_id
    and inspection.device_submission_id = p_device_submission_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if not exists (
    select 1
    from fleet.vehicle vehicle
    where vehicle.id = p_vehicle_id
      and vehicle.company_id = v_company_id
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

  if pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) <> 19
     or (
       select count(distinct item ->> 'item_key')
       from pg_catalog.jsonb_array_elements(p_items) item
     ) <> 19
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_items) item
       where not ((item ->> 'item_key') = any(v_all_keys))
          or (item ->> 'result') not in ('PASS', 'DEFECT', 'NOT_APPLICABLE')
          or (
            item ->> 'result' = 'DEFECT'
            and nullif(pg_catalog.btrim(item ->> 'notes'), '') is null
          )
          or (
            (item ->> 'item_key') = any(v_required_keys)
            and pg_catalog.jsonb_array_length(
              pg_catalog.coalesce(item -> 'media_paths', '[]'::jsonb)
            ) = 0
          )
     ) then
    raise exception 'INSPECTION_INCOMPLETE';
  end if;

  v_has_defect := exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) item
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
    v_company_id,
    p_vehicle_id,
    v_roster_member_id,
    p_inspection_type,
    case when v_has_defect then 'DVIR_DEFECT_REPORT' else 'COMPANY_INSPECTION' end,
    'SUBMITTED',
    p_odometer_miles,
    pg_catalog.now(),
    p_safe_to_operate,
    nullif(pg_catalog.btrim(p_driver_notes), ''),
    nullif(pg_catalog.btrim(p_route_name), ''),
    p_device_submission_id
  )
  returning id into v_inspection_id;

  for v_item in
    select * from pg_catalog.jsonb_array_elements(p_items)
  loop
    select pg_catalog.coalesce(array_agg(path), '{}'::text[])
    into v_media_paths
    from pg_catalog.jsonb_array_elements_text(
      pg_catalog.coalesce(v_item -> 'media_paths', '[]'::jsonb)
    ) path;

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
      v_company_id,
      v_item ->> 'section_key',
      v_item ->> 'item_key',
      v_item ->> 'item_label',
      v_item ->> 'result',
      nullif(pg_catalog.btrim(v_item ->> 'notes'), ''),
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
        v_company_id,
        p_vehicle_id,
        v_inspection_id,
        v_item_id,
        v_roster_member_id,
        v_item ->> 'section_key',
        v_item ->> 'item_label',
        nullif(pg_catalog.btrim(v_item ->> 'notes'), ''),
        case when p_safe_to_operate then 'REPAIR_SOON' else 'UNSAFE_OUT_OF_SERVICE' end,
        p_safe_to_operate,
        v_media_paths
      );
    end if;
  end loop;

  update fleet.vehicle
  set
    odometer_miles = p_odometer_miles,
    odometer_recorded_at = pg_catalog.now(),
    status = case when not p_safe_to_operate then 'OUT_OF_SERVICE' else status end,
    updated_at = pg_catalog.now()
  where id = p_vehicle_id
    and company_id = v_company_id;

  return v_inspection_id;
end;
$$;

revoke all on function public.submit_mobile_companion_fleet_inspection(
  text, uuid, uuid, text, integer, boolean, text, text, jsonb
) from public, anon;
grant execute on function public.submit_mobile_companion_fleet_inspection(
  text, uuid, uuid, text, integer, boolean, text, text, jsonb
) to authenticated, service_role;
comment on function public.submit_mobile_companion_fleet_inspection(
  text, uuid, uuid, text, integer, boolean, text, text, jsonb
) is
  'Device-idempotent shared vehicle inspection submission. Eligible drivers or authenticated members with the Fleet workspace grant may submit from iPhone, iPad, or web.';

-- Evidence registration follows the same authority boundary as submission.
-- The API has already normalized the image and written the verified WebP to
-- Backblaze; this function binds that object to the governed inspection seam.
create or replace function public.register_company_fleet_inspection_evidence(
  p_company_slug text,
  p_vehicle_id uuid,
  p_item_key text,
  p_storage_bucket text,
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
  v_company_id uuid;
  v_profile_id uuid;
  v_roster_count integer := 0;
  v_existing fleet.inspection_evidence_object%rowtype;
  v_id uuid;
  v_all_keys constant text[] := array[
    'service_brakes', 'parking_brake', 'steering', 'horn', 'seat_belt',
    'lights', 'wipers', 'mirrors', 'tires', 'wheels', 'doors', 'steps',
    'leaks', 'exterior_front', 'exterior_rear', 'exterior_driver',
    'exterior_passenger', 'equipment', 'documents'
  ];
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  v_profile_id := core.current_profile_id();
  if v_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  join core.company_memberships membership
    on membership.company_id = company.id
   and membership.profile_id = v_profile_id
   and membership.membership_status = 'active'
  where company.company_slug = lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_MEMBERSHIP_REQUIRED';
  end if;

  select count(*)
  into v_roster_count
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.profile_id = v_profile_id
    and roster.employment_status in ('Active', 'Trainee')
    and roster.roster_record_kind = 'INTERNAL';

  if v_roster_count <> 1
     and not core.mobile_companion_can_use_workspace(v_company_id, 'fleet') then
    raise exception 'FLEET_INSPECTION_ACCESS_REQUIRED';
  end if;

  if not exists (
    select 1
    from fleet.vehicle vehicle
    where vehicle.id = p_vehicle_id
      and vehicle.company_id = v_company_id
      and vehicle.status <> 'RETIRED'
  ) then
    raise exception 'VEHICLE_UNAVAILABLE';
  end if;

  if not (pg_catalog.btrim(p_item_key) = any(v_all_keys))
     or nullif(pg_catalog.btrim(p_storage_bucket), '') is null
     or p_content_type <> 'image/webp'
     or p_size_bytes <= 0
     or p_size_bytes > 10485760
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path !~ (
       '^company=' || lower(pg_catalog.btrim(p_company_slug))
       || '/vehicle=' || p_vehicle_id::text
       || '/inspection=pending/[A-Za-z0-9_-]+[.]webp$'
     ) then
    raise exception 'INVALID_EVIDENCE_METADATA';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_storage_path, 0)
  );

  select evidence.*
  into v_existing
  from fleet.inspection_evidence_object evidence
  where evidence.hot_storage_path = p_storage_path;

  if v_existing.id is not null then
    if v_existing.company_id is distinct from v_company_id
       or v_existing.vehicle_id is distinct from p_vehicle_id
       or v_existing.uploaded_by_profile_id is distinct from v_profile_id
       or v_existing.item_key is distinct from pg_catalog.btrim(p_item_key)
       or v_existing.content_type is distinct from p_content_type
       or v_existing.size_bytes is distinct from p_size_bytes
       or v_existing.sha256 is distinct from p_sha256 then
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
    v_company_id,
    p_vehicle_id,
    v_profile_id,
    pg_catalog.btrim(p_item_key),
    pg_catalog.btrim(p_storage_bucket),
    p_storage_path,
    p_content_type,
    p_size_bytes,
    p_sha256
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_company_fleet_inspection_evidence(
  text, uuid, text, text, text, text, bigint, text
) from public, anon;
grant execute on function public.register_company_fleet_inspection_evidence(
  text, uuid, text, text, text, text, bigint, text
) to authenticated, service_role;
comment on function public.register_company_fleet_inspection_evidence(
  text, uuid, text, text, text, text, bigint, text
) is
  'Registers verified WebP inspection evidence for an eligible driver or a member with the shared Fleet workspace grant.';

commit;
