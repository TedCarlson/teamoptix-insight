begin;
create table fleet.vehicle_intake_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete cascade,
  vin_decode_id uuid references fleet.vehicle_vin_decode(id) on delete set null,
  capture_kind text not null default 'VIN_LABEL',
  capture_method text not null default 'BARCODE_AUTO_CAPTURE',
  original_storage_bucket text not null default 'fleet-inspection-evidence',
  original_storage_path text not null unique,
  original_content_type text not null, original_size_bytes bigint not null, original_sha256 text not null,
  normalized_storage_bucket text not null default 'fleet-inspection-evidence',
  normalized_storage_path text not null unique, normalized_content_type text not null default 'image/webp',
  normalized_size_bytes bigint not null, normalized_sha256 text not null,
  orientation_normalized boolean not null default true,
  processing_status text not null default 'CAPTURED',
  captured_by uuid references core.profiles(id) on delete set null,
  captured_at timestamptz not null default now(), created_at timestamptz not null default now(),
  constraint fleet_vehicle_intake_capture_kind_ck check (capture_kind in (
    'VIN_LABEL','CERTIFICATION_LABEL','DASH_ODOMETER','VEHICLE_FRONT','VEHICLE_REAR','DRIVER_SIDE','PASSENGER_SIDE','TIRES'
  )),
  constraint fleet_vehicle_intake_capture_method_ck check (capture_method in ('BARCODE_AUTO_CAPTURE','MANUAL_CAPTURE')),
  constraint fleet_vehicle_intake_processing_status_ck check (processing_status in ('CAPTURED','PROCESSING','PROCESSED','FAILED'))
);
create index fleet_vehicle_intake_evidence_vehicle_idx on fleet.vehicle_intake_evidence(company_id,vehicle_id,captured_at desc);
alter table fleet.vehicle_intake_evidence enable row level security;
create policy vehicle_intake_evidence_company_read on fleet.vehicle_intake_evidence for select to authenticated using (core.can_access_company(company_id));

create or replace function public.register_company_fleet_vehicle_intake_evidence(
  p_company_slug text,p_vehicle_id uuid,p_vin_decode_id uuid,p_capture_kind text,p_capture_method text,
  p_original_storage_bucket text,p_original_storage_path text,p_original_content_type text,p_original_size_bytes bigint,p_original_sha256 text,
  p_normalized_storage_bucket text,p_normalized_storage_path text,p_normalized_size_bytes bigint,p_normalized_sha256 text
) returns uuid language plpgsql security definer set search_path=public,fleet,core as $$
declare v_company_id uuid; v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null or not core.can_admin_company(v_company_id) then raise exception 'Not authorized.'; end if;
  if not exists(select 1 from fleet.vehicle where id=p_vehicle_id and company_id=v_company_id) then raise exception 'Vehicle not found.'; end if;
  if p_vin_decode_id is not null and not exists(select 1 from fleet.vehicle_vin_decode where id=p_vin_decode_id and company_id=v_company_id and vehicle_id=p_vehicle_id) then raise exception 'VIN decode provenance is unavailable.'; end if;
  insert into fleet.vehicle_intake_evidence(
    company_id,vehicle_id,vin_decode_id,capture_kind,capture_method,original_storage_bucket,original_storage_path,
    original_content_type,original_size_bytes,original_sha256,normalized_storage_bucket,normalized_storage_path,
    normalized_size_bytes,normalized_sha256,captured_by
  ) values (
    v_company_id,p_vehicle_id,p_vin_decode_id,p_capture_kind,p_capture_method,p_original_storage_bucket,p_original_storage_path,
    p_original_content_type,p_original_size_bytes,p_original_sha256,p_normalized_storage_bucket,p_normalized_storage_path,
    p_normalized_size_bytes,p_normalized_sha256,core.current_profile_id()
  ) returning id into v_id;
  return v_id;
end $$;
grant select on fleet.vehicle_intake_evidence to authenticated;
grant all on fleet.vehicle_intake_evidence to service_role;
revoke all on function public.register_company_fleet_vehicle_intake_evidence(text,uuid,uuid,text,text,text,text,text,bigint,text,text,text,bigint,text) from public;
grant execute on function public.register_company_fleet_vehicle_intake_evidence(text,uuid,uuid,text,text,text,text,text,bigint,text,text,text,bigint,text) to authenticated,service_role;
commit;
