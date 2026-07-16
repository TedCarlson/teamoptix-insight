begin;

create schema if not exists fleet;

create table fleet.vehicle_class (
  key text primary key,
  label text not null,
  description text,
  nominal_capacity numeric,
  capacity_unit text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into fleet.vehicle_class (key, label, sort_order)
values ('U10', 'U10', 10), ('U15', 'U15', 15), ('U20', 'U20', 20)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order;

create table fleet.vehicle (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  unit_number text not null,
  fedex_vehicle_id text,
  vehicle_class_key text references fleet.vehicle_class(key),
  vehicle_type text not null,
  status text not null default 'READY',
  year integer,
  make text,
  model text,
  vin text,
  plate_number text,
  plate_state text,
  terminal_name text,
  primary_route text,
  primary_roster_member_id uuid references core.company_roster(id) on delete set null,
  odometer_miles integer,
  odometer_recorded_at timestamptz,
  gvwr_lbs integer,
  fuel_type text,
  ownership_type text,
  in_service_date date,
  retired_at date,
  wheel_size text,
  wheel_material text,
  front_tire_size text,
  rear_tire_size text,
  rear_tire_configuration text,
  tire_type text,
  recommended_front_psi numeric,
  recommended_rear_psi numeric,
  notes text,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  updated_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_vehicle_unit_unique unique (company_id, unit_number),
  constraint fleet_vehicle_vin_unique unique (company_id, vin),
  constraint fleet_vehicle_status_ck check (status in ('READY','ASSIGNED','SPARE','MAINTENANCE','OUT_OF_SERVICE','RETIRED')),
  constraint fleet_vehicle_type_ck check (vehicle_type in ('STEP_VAN','CUTAWAY','BOX_TRUCK','CARGO_VAN','RENTAL','OTHER')),
  constraint fleet_vehicle_ownership_ck check (ownership_type is null or ownership_type in ('OWNED','FINANCED','LEASED','RENTAL')),
  constraint fleet_vehicle_rear_tires_ck check (rear_tire_configuration is null or rear_tire_configuration in ('SINGLE','DUAL')),
  constraint fleet_vehicle_year_ck check (year is null or year between 1950 and 2200),
  constraint fleet_vehicle_odometer_ck check (odometer_miles is null or odometer_miles >= 0)
);

create table fleet.vehicle_document (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete cascade,
  document_type text not null,
  document_number text,
  issued_on date,
  expires_on date,
  storage_path text,
  status text not null default 'CURRENT',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_vehicle_document_type_ck check (document_type in ('REGISTRATION','INSURANCE','DOT_ANNUAL_INSPECTION','STATE_INSPECTION','EMISSIONS','LEASE','OTHER')),
  constraint fleet_vehicle_document_status_ck check (status in ('CURRENT','DUE_SOON','EXPIRED','SUPERSEDED'))
);

create table fleet.inspection (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete restrict,
  driver_roster_member_id uuid references core.company_roster(id) on delete set null,
  inspection_type text not null,
  record_class text not null default 'COMPANY_INSPECTION',
  status text not null default 'IN_PROGRESS',
  odometer_miles integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  latitude numeric,
  longitude numeric,
  safe_to_operate_driver boolean,
  driver_notes text,
  driver_signature_text text,
  reviewed_by_profile_id uuid references core.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_disposition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_inspection_type_ck check (inspection_type in ('PRE_TRIP','POST_TRIP','MID_ROUTE')),
  constraint fleet_inspection_record_ck check (record_class in ('COMPANY_INSPECTION','DVIR_DEFECT_REPORT')),
  constraint fleet_inspection_status_ck check (status in ('IN_PROGRESS','SUBMITTED','REVIEWED','CLOSED')),
  constraint fleet_inspection_disposition_ck check (review_disposition is null or review_disposition in ('MONITOR','REPAIR_REQUIRED','OUT_OF_SERVICE','CLEARED'))
);

create table fleet.inspection_item (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references fleet.inspection(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  section_key text not null,
  item_key text not null,
  item_label text not null,
  result text not null,
  notes text,
  media_paths text[] not null default '{}'::text[],
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint fleet_inspection_item_unique unique (inspection_id, item_key),
  constraint fleet_inspection_item_result_ck check (result in ('PASS','DEFECT','NOT_APPLICABLE'))
);

create table fleet.defect (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete restrict,
  inspection_id uuid references fleet.inspection(id) on delete set null,
  inspection_item_id uuid references fleet.inspection_item(id) on delete set null,
  reported_by_roster_member_id uuid references core.company_roster(id) on delete set null,
  category text not null,
  summary text not null,
  description text,
  vehicle_location text,
  severity text not null,
  status text not null default 'OPEN',
  safe_to_operate_driver boolean,
  media_paths text[] not null default '{}'::text[],
  reported_at timestamptz not null default now(),
  triaged_by_profile_id uuid references core.profiles(id) on delete set null,
  triaged_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_defect_severity_ck check (severity in ('MONITOR','REPAIR_SOON','UNSAFE_OUT_OF_SERVICE','ROADSIDE')),
  constraint fleet_defect_status_ck check (status in ('OPEN','TRIAGED','WORK_ORDERED','REPAIRED','CLOSED','REJECTED'))
);

create table fleet.work_order (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete restrict,
  work_order_number bigint generated always as identity,
  source text not null default 'MANUAL',
  status text not null default 'DRAFT',
  priority text not null default 'ROUTINE',
  title text not null,
  scope_of_work text,
  assigned_mechanic_profile_id uuid references core.profiles(id) on delete set null,
  vendor_name text,
  opened_at timestamptz not null default now(),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  returned_to_service_at timestamptz,
  odometer_open integer,
  odometer_close integer,
  labor_cost numeric(12,2) not null default 0,
  parts_cost numeric(12,2) not null default 0,
  outside_cost numeric(12,2) not null default 0,
  completion_notes text,
  repair_certification text,
  certified_by_profile_id uuid references core.profiles(id) on delete set null,
  certified_at timestamptz,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_work_order_status_ck check (status in ('DRAFT','OPEN','APPROVED','IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR','COMPLETED','CANCELLED')),
  constraint fleet_work_order_priority_ck check (priority in ('ROUTINE','DUE_SOON','URGENT','OUT_OF_SERVICE','ROADSIDE')),
  constraint fleet_work_order_source_ck check (source in ('INSPECTION','PREVENTIVE_MAINTENANCE','BREAKDOWN','ACCIDENT','MANUAL'))
);

create table fleet.work_order_defect (
  work_order_id uuid not null references fleet.work_order(id) on delete cascade,
  defect_id uuid not null references fleet.defect(id) on delete restrict,
  company_id uuid not null references core.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_order_id, defect_id)
);

create table fleet.work_order_line (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  work_order_id uuid not null references fleet.work_order(id) on delete cascade,
  line_type text not null,
  description text not null,
  part_number text,
  quantity numeric(12,2) not null default 1,
  unit_cost numeric(12,2),
  labor_hours numeric(8,2),
  performed_by_profile_id uuid references core.profiles(id) on delete set null,
  performed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_work_order_line_type_ck check (line_type in ('LABOR','PART','OUTSIDE_SERVICE','FEE','INSPECTION'))
);

create table fleet.driver_qualification (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  qualification_type text not null,
  vehicle_class_key text references fleet.vehicle_class(key),
  status text not null default 'CURRENT',
  completed_at timestamptz,
  expires_at timestamptz,
  trainer_name text,
  trainer_profile_id uuid references core.profiles(id) on delete set null,
  certificate_storage_path text,
  score numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_driver_qualification_type_ck check (qualification_type in ('SMITH_5KEYS','SMITH_BACKING','ROAD_TEST','PRE_TRIP_EVALUATION','DOT_COMPLIANCE','VEHICLE_CLASS','OTHER')),
  constraint fleet_driver_qualification_status_ck check (status in ('CURRENT','DUE_SOON','EXPIRED','RESTRICTED','REVOKED'))
);

create table fleet.company_user_role (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid not null references core.profiles(id) on delete cascade,
  role_key text not null,
  is_active boolean not null default true,
  granted_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_company_user_role_key_ck check (role_key in ('FLEET_MANAGER','MECHANIC','FLEET_VIEWER')),
  constraint fleet_company_user_role_unique unique (company_id, profile_id, role_key)
);

create table fleet.compliance_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  reporting_period_start date not null,
  reporting_period_end date not null,
  report_type text not null default 'FEDEX_MONTHLY_FLEET',
  status text not null default 'DRAFT',
  source_cutoff_at timestamptz not null default now(),
  snapshot_json jsonb not null,
  artifact_storage_path text,
  generated_at timestamptz,
  submitted_at timestamptz,
  submitted_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_compliance_snapshot_period_ck check (reporting_period_end >= reporting_period_start),
  constraint fleet_compliance_snapshot_status_ck check (status in ('DRAFT','GENERATED','REVIEWED','SUBMITTED','SUPERSEDED')),
  constraint fleet_compliance_snapshot_unique unique (company_id, report_type, reporting_period_start, reporting_period_end)
);

create index fleet_vehicle_company_status_idx on fleet.vehicle (company_id, status, unit_number);
create index fleet_inspection_vehicle_date_idx on fleet.inspection (vehicle_id, submitted_at desc);
create index fleet_inspection_company_status_idx on fleet.inspection (company_id, status, started_at desc);
create index fleet_defect_vehicle_status_idx on fleet.defect (vehicle_id, status, reported_at desc);
create index fleet_defect_company_status_idx on fleet.defect (company_id, status, severity);
create index fleet_work_order_vehicle_status_idx on fleet.work_order (vehicle_id, status, opened_at desc);
create index fleet_work_order_company_status_idx on fleet.work_order (company_id, status, priority);
create index fleet_driver_qualification_roster_idx on fleet.driver_qualification (roster_member_id, status, expires_at);
create index fleet_company_user_role_access_idx on fleet.company_user_role (company_id, profile_id, is_active);

create or replace function fleet.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = fleet, core, public
as $$
  select core.can_admin_company(p_company_id)
    or exists (
      select 1
      from fleet.company_user_role r
      where r.company_id = p_company_id
        and r.profile_id = core.current_profile_id()
        and r.is_active
        and r.role_key = any(p_roles)
    );
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['vehicle_class','vehicle','vehicle_document','inspection','defect','work_order','work_order_line','driver_qualification','company_user_role','compliance_snapshot']
  loop
    execute format('drop trigger if exists %I_touch_updated_at on fleet.%I', v_table, v_table);
    execute format('create trigger %I_touch_updated_at before update on fleet.%I for each row execute function core.set_updated_at()', v_table, v_table);
  end loop;
end $$;

alter table fleet.vehicle_class enable row level security;
alter table fleet.vehicle enable row level security;
alter table fleet.vehicle_document enable row level security;
alter table fleet.inspection enable row level security;
alter table fleet.inspection_item enable row level security;
alter table fleet.defect enable row level security;
alter table fleet.work_order enable row level security;
alter table fleet.work_order_defect enable row level security;
alter table fleet.work_order_line enable row level security;
alter table fleet.driver_qualification enable row level security;
alter table fleet.company_user_role enable row level security;
alter table fleet.compliance_snapshot enable row level security;

create policy fleet_vehicle_class_read on fleet.vehicle_class for select to authenticated using (is_active or core.is_platform_owner());
create policy fleet_company_user_role_read on fleet.company_user_role for select to authenticated using (core.can_access_company(company_id));
create policy fleet_company_user_role_write on fleet.company_user_role for all to authenticated using (core.can_admin_company(company_id)) with check (core.can_admin_company(company_id));

do $$
declare v_table text;
begin
  foreach v_table in array array['vehicle','vehicle_document','inspection','inspection_item','defect','work_order','work_order_defect','work_order_line','driver_qualification','compliance_snapshot']
  loop
    execute format('create policy %I_company_read on fleet.%I for select to authenticated using (core.can_access_company(company_id))', v_table, v_table);
    execute format('create policy %I_company_insert on fleet.%I for insert to authenticated with check (core.can_admin_company(company_id))', v_table, v_table);
    execute format('create policy %I_company_update on fleet.%I for update to authenticated using (core.can_admin_company(company_id)) with check (core.can_admin_company(company_id))', v_table, v_table);
  end loop;
end $$;

drop policy inspection_company_insert on fleet.inspection;
create policy inspection_driver_insert on fleet.inspection for insert to authenticated
with check (
  fleet.has_company_role(company_id, array['FLEET_MANAGER','MECHANIC'])
  or exists (
    select 1 from core.company_roster r
    where r.id = driver_roster_member_id
      and r.company_id = inspection.company_id
      and r.profile_id = core.current_profile_id()
  )
);

create policy inspection_driver_update on fleet.inspection for update to authenticated
using (
  exists (
    select 1 from core.company_roster r
    where r.id = driver_roster_member_id
      and r.company_id = inspection.company_id
      and r.profile_id = core.current_profile_id()
  )
)
with check (
  exists (
    select 1 from core.company_roster r
    where r.id = driver_roster_member_id
      and r.company_id = inspection.company_id
      and r.profile_id = core.current_profile_id()
  )
);

drop policy inspection_item_company_insert on fleet.inspection_item;
create policy inspection_item_driver_insert on fleet.inspection_item for insert to authenticated
with check (
  exists (
    select 1 from fleet.inspection i
    left join core.company_roster r on r.id = i.driver_roster_member_id
    where i.id = inspection_id
      and i.company_id = inspection_item.company_id
      and (r.profile_id = core.current_profile_id() or fleet.has_company_role(i.company_id, array['FLEET_MANAGER','MECHANIC']))
  )
);

drop policy defect_company_insert on fleet.defect;
create policy defect_driver_insert on fleet.defect for insert to authenticated
with check (
  fleet.has_company_role(company_id, array['FLEET_MANAGER','MECHANIC'])
  or exists (
    select 1 from core.company_roster r
    where r.id = reported_by_roster_member_id
      and r.company_id = defect.company_id
      and r.profile_id = core.current_profile_id()
  )
);

create or replace view public.company_fleet_vehicle_v
with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  c.company_slug,
  v.unit_number,
  v.fedex_vehicle_id,
  v.vehicle_class_key,
  v.vehicle_type,
  v.status,
  v.year,
  v.make,
  v.model,
  v.vin,
  v.plate_number,
  v.plate_state,
  v.terminal_name,
  v.primary_route,
  v.primary_roster_member_id,
  concat_ws(' ', p.first_name, p.last_name) as primary_driver_name,
  v.odometer_miles,
  v.odometer_recorded_at,
  v.gvwr_lbs,
  v.fuel_type,
  v.ownership_type,
  v.in_service_date,
  v.wheel_size,
  v.front_tire_size,
  v.rear_tire_size,
  v.rear_tire_configuration,
  v.tire_type,
  (select count(*) from fleet.defect d where d.vehicle_id = v.id and d.status in ('OPEN','TRIAGED','WORK_ORDERED')) as open_defect_count,
  (select count(*) from fleet.work_order w where w.vehicle_id = v.id and w.status in ('OPEN','APPROVED','IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR')) as open_work_order_count,
  (select max(i.submitted_at) from fleet.inspection i where i.vehicle_id = v.id) as last_inspected_at,
  v.created_at,
  v.updated_at
from fleet.vehicle v
join core.companies c on c.id = v.company_id
left join core.company_roster r on r.id = v.primary_roster_member_id
left join core.profiles p on p.id = r.profile_id;

create or replace view public.company_fleet_defect_v with (security_invoker = true) as
select d.*, c.company_slug, v.unit_number, v.vehicle_class_key, v.vehicle_type
from fleet.defect d
join fleet.vehicle v on v.id = d.vehicle_id
join core.companies c on c.id = d.company_id;

create or replace view public.company_fleet_inspection_v with (security_invoker = true) as
select i.*, c.company_slug, v.unit_number, v.vehicle_class_key,
  concat_ws(' ', p.first_name, p.last_name) as driver_name,
  (select count(*) from fleet.inspection_item x where x.inspection_id=i.id and x.result='DEFECT')::integer as defect_count
from fleet.inspection i join fleet.vehicle v on v.id=i.vehicle_id join core.companies c on c.id=i.company_id
left join core.company_roster r on r.id=i.driver_roster_member_id left join core.profiles p on p.id=r.profile_id;

create or replace view public.company_fleet_work_order_v with (security_invoker = true) as
select w.*, c.company_slug, v.unit_number, v.vehicle_class_key, v.vehicle_type,
  concat_ws(' ', p.first_name, p.last_name) as mechanic_name,
  w.labor_cost + w.parts_cost + w.outside_cost as total_cost
from fleet.work_order w
join fleet.vehicle v on v.id = w.vehicle_id
join core.companies c on c.id = w.company_id
left join core.profiles p on p.id = w.assigned_mechanic_profile_id;

create or replace view public.company_fleet_status_v with (security_invoker = true) as
select c.id as company_id, c.company_slug,
  count(v.id)::integer as total_vehicles,
  count(v.id) filter (where v.status in ('READY','ASSIGNED','SPARE'))::integer as dispatch_ready,
  count(v.id) filter (where v.status = 'SPARE')::integer as spare_vehicles,
  count(v.id) filter (where v.status in ('MAINTENANCE','OUT_OF_SERVICE'))::integer as unavailable,
  count(distinct d.id) filter (where d.status in ('OPEN','TRIAGED','WORK_ORDERED'))::integer as open_defects,
  count(distinct w.id) filter (where w.status in ('OPEN','APPROVED','IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR'))::integer as open_work_orders
from core.companies c
left join fleet.vehicle v on v.company_id = c.id and v.status <> 'RETIRED'
left join fleet.defect d on d.vehicle_id = v.id
left join fleet.work_order w on w.vehicle_id = v.id
group by c.id, c.company_slug;

create or replace function public.upsert_company_fleet_vehicle(
  p_company_slug text, p_vehicle_id uuid, p_unit_number text, p_vehicle_class_key text,
  p_vehicle_type text, p_status text, p_year integer, p_make text, p_model text,
  p_vin text, p_plate_number text, p_plate_state text, p_odometer_miles integer,
  p_wheel_size text, p_front_tire_size text, p_rear_tire_size text,
  p_rear_tire_configuration text, p_tire_type text
) returns uuid language plpgsql security definer set search_path = public, fleet, core as $$
declare v_company_id uuid; v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null or not core.can_admin_company(v_company_id) then raise exception 'Not authorized.'; end if;
  if nullif(btrim(p_unit_number), '') is null then raise exception 'Unit number is required.'; end if;
  insert into fleet.vehicle (id, company_id, unit_number, vehicle_class_key, vehicle_type, status,
    year, make, model, vin, plate_number, plate_state, odometer_miles, odometer_recorded_at,
    wheel_size, front_tire_size, rear_tire_size, rear_tire_configuration, tire_type,
    created_by_profile_id, updated_by_profile_id)
  values (coalesce(p_vehicle_id, gen_random_uuid()), v_company_id, btrim(p_unit_number), nullif(p_vehicle_class_key,''),
    p_vehicle_type, p_status, p_year, nullif(btrim(p_make),''), nullif(btrim(p_model),''), nullif(btrim(p_vin),''),
    nullif(btrim(p_plate_number),''), nullif(btrim(p_plate_state),''), p_odometer_miles,
    case when p_odometer_miles is null then null else now() end, nullif(btrim(p_wheel_size),''),
    nullif(btrim(p_front_tire_size),''), nullif(btrim(p_rear_tire_size),''), nullif(p_rear_tire_configuration,''),
    nullif(btrim(p_tire_type),''), core.current_profile_id(), core.current_profile_id())
  on conflict (id) do update set unit_number=excluded.unit_number, vehicle_class_key=excluded.vehicle_class_key,
    vehicle_type=excluded.vehicle_type, status=excluded.status, year=excluded.year, make=excluded.make,
    model=excluded.model, vin=excluded.vin, plate_number=excluded.plate_number, plate_state=excluded.plate_state,
    odometer_miles=excluded.odometer_miles, odometer_recorded_at=excluded.odometer_recorded_at,
    wheel_size=excluded.wheel_size, front_tire_size=excluded.front_tire_size, rear_tire_size=excluded.rear_tire_size,
    rear_tire_configuration=excluded.rear_tire_configuration, tire_type=excluded.tire_type,
    updated_by_profile_id=core.current_profile_id(), updated_at=now()
  where fleet.vehicle.company_id = v_company_id returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_company_fleet_inspection(
  p_company_slug text, p_vehicle_id uuid, p_inspection_type text, p_odometer_miles integer,
  p_safe_to_operate boolean, p_driver_notes text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, fleet, core as $$
declare v_company_id uuid; v_roster_id uuid; v_inspection_id uuid; v_item jsonb; v_item_id uuid; v_has_defect boolean := false;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  select id into v_roster_id from core.company_roster where company_id=v_company_id and profile_id=core.current_profile_id() and employment_status in ('Active','Trainee') limit 1;
  if v_company_id is null or (v_roster_id is null and not fleet.has_company_role(v_company_id,array['FLEET_MANAGER','MECHANIC'])) then raise exception 'Not authorized.'; end if;
  if not exists(select 1 from fleet.vehicle where id=p_vehicle_id and company_id=v_company_id) then raise exception 'Vehicle not found.'; end if;
  v_has_defect := exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where x->>'result'='DEFECT');
  insert into fleet.inspection(company_id,vehicle_id,driver_roster_member_id,inspection_type,record_class,status,
    odometer_miles,submitted_at,safe_to_operate_driver,driver_notes)
  values(v_company_id,p_vehicle_id,v_roster_id,p_inspection_type,case when v_has_defect then 'DVIR_DEFECT_REPORT' else 'COMPANY_INSPECTION' end,
    'SUBMITTED',p_odometer_miles,now(),p_safe_to_operate,nullif(btrim(p_driver_notes),'')) returning id into v_inspection_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into fleet.inspection_item(inspection_id,company_id,section_key,item_key,item_label,result,notes)
    values(v_inspection_id,v_company_id,v_item->>'section_key',v_item->>'item_key',v_item->>'item_label',v_item->>'result',nullif(v_item->>'notes','')) returning id into v_item_id;
    if v_item->>'result'='DEFECT' then
      insert into fleet.defect(company_id,vehicle_id,inspection_id,inspection_item_id,reported_by_roster_member_id,
        category,summary,description,severity,safe_to_operate_driver)
      values(v_company_id,p_vehicle_id,v_inspection_id,v_item_id,v_roster_id,v_item->>'section_key',v_item->>'item_label',
        nullif(v_item->>'notes',''),case when p_safe_to_operate then 'REPAIR_SOON' else 'UNSAFE_OUT_OF_SERVICE' end,p_safe_to_operate);
    end if;
  end loop;
  update fleet.vehicle set odometer_miles=coalesce(p_odometer_miles,odometer_miles), odometer_recorded_at=case when p_odometer_miles is null then odometer_recorded_at else now() end,
    status=case when not p_safe_to_operate then 'OUT_OF_SERVICE' else status end, updated_at=now() where id=p_vehicle_id;
  return v_inspection_id;
end $$;

create or replace function public.create_company_fleet_work_order(p_company_slug text,p_vehicle_id uuid,p_defect_id uuid,p_title text,p_scope text,p_priority text)
returns uuid language plpgsql security definer set search_path=public,fleet,core as $$
declare v_company_id uuid; v_id uuid;
begin
 select id into v_company_id from core.companies where company_slug=p_company_slug;
 if v_company_id is null or not fleet.has_company_role(v_company_id,array['FLEET_MANAGER','MECHANIC']) then raise exception 'Not authorized.'; end if;
 if not exists(select 1 from fleet.vehicle where id=p_vehicle_id and company_id=v_company_id) then raise exception 'Vehicle not found.'; end if;
 if p_defect_id is not null and not exists(select 1 from fleet.defect where id=p_defect_id and company_id=v_company_id and vehicle_id=p_vehicle_id) then raise exception 'Defect does not belong to this vehicle.'; end if;
 insert into fleet.work_order(company_id,vehicle_id,source,status,priority,title,scope_of_work,created_by_profile_id)
 values(v_company_id,p_vehicle_id,case when p_defect_id is null then 'MANUAL' else 'INSPECTION' end,'OPEN',p_priority,p_title,p_scope,core.current_profile_id()) returning id into v_id;
 if p_defect_id is not null then insert into fleet.work_order_defect(work_order_id,defect_id,company_id) values(v_id,p_defect_id,v_company_id); update fleet.defect set status='WORK_ORDERED',updated_at=now() where id=p_defect_id and company_id=v_company_id; end if;
 return v_id;
end $$;

create or replace function public.update_company_fleet_work_order(p_company_slug text,p_work_order_id uuid,p_status text,p_completion_notes text,p_labor_cost numeric,p_parts_cost numeric,p_outside_cost numeric)
returns void language plpgsql security definer set search_path=public,fleet,core as $$
declare v_company_id uuid; v_vehicle_id uuid;
begin
 select id into v_company_id from core.companies where company_slug=p_company_slug;
 if v_company_id is null or not fleet.has_company_role(v_company_id,array['FLEET_MANAGER','MECHANIC']) then raise exception 'Not authorized.'; end if;
 update fleet.work_order set status=p_status,completion_notes=nullif(btrim(p_completion_notes),''),labor_cost=coalesce(p_labor_cost,labor_cost),parts_cost=coalesce(p_parts_cost,parts_cost),outside_cost=coalesce(p_outside_cost,outside_cost),
  started_at=case when p_status='IN_PROGRESS' and started_at is null then now() else started_at end,
  completed_at=case when p_status='COMPLETED' then now() else completed_at end,
  certified_by_profile_id=case when p_status='COMPLETED' then core.current_profile_id() else certified_by_profile_id end,
  certified_at=case when p_status='COMPLETED' then now() else certified_at end,updated_at=now()
 where id=p_work_order_id and company_id=v_company_id returning vehicle_id into v_vehicle_id;
 if v_vehicle_id is null then raise exception 'Work order not found.'; end if;
 if p_status='COMPLETED' then update fleet.defect d set status='REPAIRED',closed_at=now(),updated_at=now() from fleet.work_order_defect x where x.work_order_id=p_work_order_id and x.defect_id=d.id; end if;
end $$;

grant usage on schema fleet to authenticated, service_role;
grant execute on function fleet.has_company_role(uuid, text[]) to authenticated, service_role;
grant select on fleet.vehicle_class to authenticated;
grant select, insert, update on all tables in schema fleet to authenticated;
grant usage, select on all sequences in schema fleet to authenticated;
grant all on all tables in schema fleet to service_role;
grant select on public.company_fleet_vehicle_v to authenticated, service_role;
grant select on public.company_fleet_defect_v, public.company_fleet_inspection_v, public.company_fleet_work_order_v, public.company_fleet_status_v to authenticated, service_role;
grant execute on function public.upsert_company_fleet_vehicle(text,uuid,text,text,text,text,integer,text,text,text,text,text,integer,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.submit_company_fleet_inspection(text,uuid,text,integer,boolean,text,jsonb) to authenticated, service_role;
grant execute on function public.create_company_fleet_work_order(text,uuid,uuid,text,text,text) to authenticated, service_role;
grant execute on function public.update_company_fleet_work_order(text,uuid,text,text,numeric,numeric,numeric) to authenticated, service_role;

commit;
