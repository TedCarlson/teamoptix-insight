begin;

alter table fleet.vehicle
  add column if not exists gvwr_source text,
  add column if not exists gvwr_evidence_reference text,
  add column if not exists gvwr_verified_status text not null default 'UNVERIFIED',
  add column if not exists gvwr_verified_at timestamptz,
  add column if not exists gvwr_verified_by uuid references core.profiles(id) on delete set null;

alter table fleet.vehicle drop constraint if exists fleet_vehicle_gvwr_ck;
alter table fleet.vehicle add constraint fleet_vehicle_gvwr_ck check (gvwr_lbs is null or gvwr_lbs > 0);
alter table fleet.vehicle add constraint fleet_vehicle_gvwr_source_ck check (
  gvwr_source is null or gvwr_source in (
    'MANUFACTURER_LABEL','VIN_DECODER','REGISTRATION','TITLE','LEASE_RECORD',
    'MANUFACTURER_SPEC','MANUAL_ENTRY'
  )
);
alter table fleet.vehicle add constraint fleet_vehicle_gvwr_verified_status_ck check (
  gvwr_verified_status in ('UNVERIFIED','PENDING','VERIFIED','DISPUTED','EXPIRED')
);

create table fleet.vehicle_weight_classification (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete restrict,
  gvwr_lbs integer,
  dot_weight_class integer generated always as (
    case
      when gvwr_lbs is null then null
      when gvwr_lbs <= 6000 then 1 when gvwr_lbs <= 10000 then 2
      when gvwr_lbs <= 14000 then 3 when gvwr_lbs <= 16000 then 4
      when gvwr_lbs <= 19500 then 5 when gvwr_lbs <= 26000 then 6
      when gvwr_lbs <= 33000 then 7 else 8
    end
  ) stored,
  federal_overtime_weight_band text generated always as (
    case
      when verification_status <> 'VERIFIED' or gvwr_lbs is null then 'UNVERIFIED'
      when gvwr_lbs <= 10000 then 'SMALL_VEHICLE_10K_OR_LESS'
      else 'OVER_10K'
    end
  ) stored,
  source_kind text,
  source_reference text,
  evidence_artifact_id uuid,
  verification_status text not null default 'UNVERIFIED',
  verified_by uuid references core.profiles(id) on delete set null,
  verified_at timestamptz,
  effective_start_date date not null,
  effective_end_date date,
  created_at timestamptz not null default now(),
  created_by uuid references core.profiles(id) on delete set null,
  superseded_at timestamptz,
  superseded_by uuid references core.profiles(id) on delete set null,
  constraint fleet_vehicle_weight_gvwr_ck check (gvwr_lbs is null or gvwr_lbs > 0),
  constraint fleet_vehicle_weight_dates_ck check (effective_end_date is null or effective_end_date >= effective_start_date),
  constraint fleet_vehicle_weight_source_ck check (
    source_kind is null or source_kind in (
      'MANUFACTURER_LABEL','VIN_DECODER','REGISTRATION','TITLE','LEASE_RECORD',
      'MANUFACTURER_SPEC','MANUAL_ENTRY'
    )
  ),
  constraint fleet_vehicle_weight_status_ck check (
    verification_status in ('UNVERIFIED','PENDING','VERIFIED','DISPUTED','EXPIRED')
  ),
  constraint fleet_vehicle_weight_verified_ck check (
    verification_status <> 'VERIFIED' or (gvwr_lbs is not null and source_kind is not null and verified_at is not null)
  )
);

create unique index fleet_vehicle_weight_one_active_idx
  on fleet.vehicle_weight_classification(vehicle_id) where effective_end_date is null;
create index fleet_vehicle_weight_effective_idx
  on fleet.vehicle_weight_classification(vehicle_id, effective_start_date, effective_end_date);

alter table fleet.vehicle_weight_classification enable row level security;
create policy vehicle_weight_classification_company_read on fleet.vehicle_weight_classification
  for select to authenticated using (core.can_access_company(company_id));
create policy vehicle_weight_classification_company_insert on fleet.vehicle_weight_classification
  for insert to authenticated with check (core.can_admin_company(company_id));
create policy vehicle_weight_classification_company_update on fleet.vehicle_weight_classification
  for update to authenticated using (core.can_admin_company(company_id)) with check (core.can_admin_company(company_id));

create or replace view public.company_fleet_vehicle_v
with (security_invoker = true) as
select
  v.id as vehicle_id, v.company_id, c.company_slug, v.unit_number, v.fedex_vehicle_id,
  v.vehicle_class_key, v.vehicle_type, v.status, v.year, v.make, v.model, v.vin,
  v.plate_number, v.plate_state, v.terminal_name, v.primary_route, v.primary_roster_member_id,
  concat_ws(' ', p.first_name, p.last_name) as primary_driver_name,
  v.odometer_miles, v.odometer_recorded_at, v.gvwr_lbs,
  v.fuel_type, v.ownership_type, v.in_service_date, v.wheel_size, v.front_tire_size,
  v.rear_tire_size, v.rear_tire_configuration, v.tire_type,
  (select count(*) from fleet.defect d where d.vehicle_id=v.id and d.status in ('OPEN','TRIAGED','WORK_ORDERED')) as open_defect_count,
  (select count(*) from fleet.work_order w where w.vehicle_id=v.id and w.status in ('OPEN','APPROVED','IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR')) as open_work_order_count,
  (select max(i.submitted_at) from fleet.inspection i where i.vehicle_id=v.id) as last_inspected_at,
  v.created_at, v.updated_at,
  case
    when v.gvwr_lbs is null then null
    when v.gvwr_lbs <= 6000 then 1 when v.gvwr_lbs <= 10000 then 2
    when v.gvwr_lbs <= 14000 then 3 when v.gvwr_lbs <= 16000 then 4
    when v.gvwr_lbs <= 19500 then 5 when v.gvwr_lbs <= 26000 then 6
    when v.gvwr_lbs <= 33000 then 7 else 8
  end as dot_weight_class,
  case
    when v.gvwr_verified_status <> 'VERIFIED' or v.gvwr_lbs is null then 'UNVERIFIED'
    when v.gvwr_lbs <= 10000 then 'SMALL_VEHICLE_10K_OR_LESS' else 'OVER_10K'
  end as federal_overtime_weight_band,
  v.gvwr_source, v.gvwr_evidence_reference, v.gvwr_verified_status,
  v.gvwr_verified_at, v.gvwr_verified_by
from fleet.vehicle v
join core.companies c on c.id=v.company_id
left join core.company_roster r on r.id=v.primary_roster_member_id
left join core.profiles p on p.id=r.profile_id;

create or replace view public.company_fleet_status_v with (security_invoker = true) as
select c.id as company_id, c.company_slug,
  count(distinct v.id)::integer as total_vehicles,
  count(distinct v.id) filter (where v.status in ('READY','ASSIGNED','SPARE'))::integer as dispatch_ready,
  count(distinct v.id) filter (where v.status='SPARE')::integer as spare_vehicles,
  count(distinct v.id) filter (where v.status in ('MAINTENANCE','OUT_OF_SERVICE'))::integer as unavailable,
  count(distinct d.id) filter (where d.status in ('OPEN','TRIAGED','WORK_ORDERED'))::integer as open_defects,
  count(distinct w.id) filter (where w.status in ('OPEN','APPROVED','IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR'))::integer as open_work_orders,
  count(distinct v.id) filter (where v.gvwr_verified_status='VERIFIED')::integer as verified_gvwr,
  count(distinct v.id) filter (where v.gvwr_lbs is null)::integer as missing_gvwr,
  count(distinct v.id) filter (where v.gvwr_verified_status='PENDING')::integer as pending_gvwr,
  count(distinct v.id) filter (where v.gvwr_verified_status='DISPUTED')::integer as disputed_gvwr,
  count(distinct v.id) filter (where v.gvwr_verified_status='VERIFIED' and v.gvwr_lbs<=10000)::integer as small_vehicle_count,
  count(distinct v.id) filter (where v.gvwr_verified_status='VERIFIED' and v.gvwr_lbs>10000)::integer as over_10k_count
from core.companies c
left join fleet.vehicle v on v.company_id=c.id and v.status<>'RETIRED'
left join fleet.defect d on d.vehicle_id=v.id
left join fleet.work_order w on w.vehicle_id=v.id
group by c.id, c.company_slug;

create or replace function public.upsert_company_fleet_vehicle(
  p_company_slug text, p_vehicle_id uuid, p_unit_number text, p_vehicle_class_key text,
  p_vehicle_type text, p_status text, p_year integer, p_make text, p_model text,
  p_vin text, p_plate_number text, p_plate_state text, p_odometer_miles integer,
  p_wheel_size text, p_front_tire_size text, p_rear_tire_size text,
  p_rear_tire_configuration text, p_tire_type text, p_gvwr_lbs integer,
  p_gvwr_source text, p_gvwr_verified_status text, p_gvwr_evidence_reference text,
  p_effective_start_date date
) returns uuid language plpgsql security definer set search_path=public,fleet,core as $$
declare v_company_id uuid; v_id uuid; v_now timestamptz:=now(); v_profile uuid:=core.current_profile_id();
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null or not core.can_admin_company(v_company_id) then raise exception 'Not authorized.'; end if;
  if nullif(btrim(p_unit_number),'') is null then raise exception 'Unit number is required.'; end if;
  if p_gvwr_verified_status='VERIFIED' and (p_gvwr_lbs is null or p_gvwr_source is null) then
    raise exception 'Verified GVWR requires a value and evidence source.';
  end if;

  insert into fleet.vehicle(
    id,company_id,unit_number,vehicle_class_key,vehicle_type,status,year,make,model,vin,
    plate_number,plate_state,odometer_miles,odometer_recorded_at,wheel_size,front_tire_size,
    rear_tire_size,rear_tire_configuration,tire_type,gvwr_lbs,gvwr_source,
    gvwr_verified_status,gvwr_evidence_reference,gvwr_verified_at,gvwr_verified_by,
    created_by_profile_id,updated_by_profile_id)
  values(
    coalesce(p_vehicle_id,gen_random_uuid()),v_company_id,btrim(p_unit_number),nullif(p_vehicle_class_key,''),
    p_vehicle_type,p_status,p_year,nullif(btrim(p_make),''),nullif(btrim(p_model),''),
    nullif(btrim(p_vin),''),nullif(btrim(p_plate_number),''),nullif(btrim(p_plate_state),''),
    p_odometer_miles,case when p_odometer_miles is null then null else v_now end,
    nullif(btrim(p_wheel_size),''),nullif(btrim(p_front_tire_size),''),nullif(btrim(p_rear_tire_size),''),
    nullif(p_rear_tire_configuration,''),nullif(btrim(p_tire_type),''),p_gvwr_lbs,p_gvwr_source,
    coalesce(p_gvwr_verified_status,'UNVERIFIED'),nullif(btrim(p_gvwr_evidence_reference),''),
    case when p_gvwr_verified_status='VERIFIED' then v_now end,
    case when p_gvwr_verified_status='VERIFIED' then v_profile end,v_profile,v_profile)
  on conflict(id) do update set
    unit_number=excluded.unit_number,vehicle_class_key=excluded.vehicle_class_key,
    vehicle_type=excluded.vehicle_type,status=excluded.status,year=excluded.year,make=excluded.make,
    model=excluded.model,vin=excluded.vin,plate_number=excluded.plate_number,plate_state=excluded.plate_state,
    odometer_miles=excluded.odometer_miles,odometer_recorded_at=excluded.odometer_recorded_at,
    wheel_size=excluded.wheel_size,front_tire_size=excluded.front_tire_size,rear_tire_size=excluded.rear_tire_size,
    rear_tire_configuration=excluded.rear_tire_configuration,tire_type=excluded.tire_type,
    gvwr_lbs=excluded.gvwr_lbs,gvwr_source=excluded.gvwr_source,
    gvwr_verified_status=excluded.gvwr_verified_status,gvwr_evidence_reference=excluded.gvwr_evidence_reference,
    gvwr_verified_at=excluded.gvwr_verified_at,gvwr_verified_by=excluded.gvwr_verified_by,
    updated_by_profile_id=v_profile,updated_at=v_now
  where fleet.vehicle.company_id=v_company_id returning id into v_id;

  if not exists (
    select 1 from fleet.vehicle_weight_classification x
    where x.vehicle_id=v_id and x.effective_end_date is null
      and x.gvwr_lbs is not distinct from p_gvwr_lbs
      and x.source_kind is not distinct from p_gvwr_source
      and x.source_reference is not distinct from nullif(btrim(p_gvwr_evidence_reference),'')
      and x.verification_status=coalesce(p_gvwr_verified_status,'UNVERIFIED')
  ) then
    update fleet.vehicle_weight_classification
      set effective_end_date=greatest(effective_start_date,coalesce(p_effective_start_date,current_date)-1),
          superseded_at=v_now,superseded_by=v_profile
      where vehicle_id=v_id and effective_end_date is null;
    insert into fleet.vehicle_weight_classification(
      company_id,vehicle_id,gvwr_lbs,source_kind,source_reference,verification_status,
      verified_by,verified_at,effective_start_date,created_by)
    values(
      v_company_id,v_id,p_gvwr_lbs,p_gvwr_source,nullif(btrim(p_gvwr_evidence_reference),''),
      coalesce(p_gvwr_verified_status,'UNVERIFIED'),
      case when p_gvwr_verified_status='VERIFIED' then v_profile end,
      case when p_gvwr_verified_status='VERIFIED' then v_now end,
      coalesce(p_effective_start_date,current_date),v_profile);
  end if;
  return v_id;
end $$;

grant select,insert,update on fleet.vehicle_weight_classification to authenticated;
grant all on fleet.vehicle_weight_classification to service_role;
grant execute on function public.upsert_company_fleet_vehicle(
  text,uuid,text,text,text,text,integer,text,text,text,text,text,integer,text,text,text,text,text,
  integer,text,text,text,date
) to authenticated,service_role;

commit;
