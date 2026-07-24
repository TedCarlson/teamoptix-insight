begin;

create table fleet.vehicle_vin_decode (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid references fleet.vehicle(id) on delete set null,
  vin text not null,
  provider text not null default 'NHTSA_VPIC',
  provider_version text,
  decoded_at timestamptz not null default now(),
  raw_response jsonb not null,
  error_code text,
  error_text text,
  suggested_make text,
  suggested_model text,
  suggested_year integer,
  suggested_body_class text,
  suggested_vehicle_type text,
  suggested_gvwr_from integer,
  suggested_gvwr_to integer,
  created_by uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fleet_vehicle_vin_decode_vin_ck check (
    vin = upper(vin) and length(vin) = 17 and vin !~ '[IOQ]'
  )
);

create index fleet_vehicle_vin_decode_company_vin_idx
  on fleet.vehicle_vin_decode(company_id, vin, decoded_at desc);

alter table fleet.vehicle_vin_decode enable row level security;
create policy vehicle_vin_decode_company_read on fleet.vehicle_vin_decode
  for select to authenticated using (core.can_access_company(company_id));

create or replace function public.record_company_fleet_vin_decode(
  p_company_slug text,
  p_vin text,
  p_provider_version text,
  p_raw_response jsonb,
  p_error_code text,
  p_error_text text,
  p_suggested_make text,
  p_suggested_model text,
  p_suggested_year integer,
  p_suggested_body_class text,
  p_suggested_vehicle_type text,
  p_suggested_gvwr_from integer,
  p_suggested_gvwr_to integer
) returns uuid
language plpgsql
security definer
set search_path=public,fleet,core
as $$
declare v_company_id uuid; v_id uuid; v_vin text:=upper(btrim(p_vin));
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'Not authorized.';
  end if;
  if length(v_vin)<>17 or v_vin~'[IOQ]' then raise exception 'Invalid VIN.'; end if;
  if exists(select 1 from fleet.vehicle where company_id=v_company_id and vin=v_vin) then
    raise exception 'This VIN already exists in the company fleet.';
  end if;
  insert into fleet.vehicle_vin_decode(
    company_id,vin,provider_version,raw_response,error_code,error_text,suggested_make,
    suggested_model,suggested_year,suggested_body_class,suggested_vehicle_type,
    suggested_gvwr_from,suggested_gvwr_to,created_by)
  values(
    v_company_id,v_vin,nullif(p_provider_version,''),p_raw_response, nullif(p_error_code,''),
    nullif(p_error_text,''),nullif(p_suggested_make,''),nullif(p_suggested_model,''),
    p_suggested_year,nullif(p_suggested_body_class,''),nullif(p_suggested_vehicle_type,''),
    p_suggested_gvwr_from,p_suggested_gvwr_to,core.current_profile_id())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.link_company_fleet_vin_decode(
  p_company_slug text,
  p_decode_id uuid,
  p_vehicle_id uuid
) returns void
language plpgsql
security definer
set search_path=public,fleet,core
as $$
declare v_company_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'Not authorized.';
  end if;
  if not exists(select 1 from fleet.vehicle where id=p_vehicle_id and company_id=v_company_id) then
    raise exception 'Vehicle not found.';
  end if;
  update fleet.vehicle_vin_decode set vehicle_id=p_vehicle_id
  where id=p_decode_id and company_id=v_company_id and vehicle_id is null;
end $$;

grant select on fleet.vehicle_vin_decode to authenticated;
grant all on fleet.vehicle_vin_decode to service_role;
grant execute on function public.record_company_fleet_vin_decode(
  text,text,text,jsonb,text,text,text,text,integer,text,text,integer,integer
) to authenticated,service_role;
grant execute on function public.link_company_fleet_vin_decode(text,uuid,uuid)
  to authenticated,service_role;

commit;
