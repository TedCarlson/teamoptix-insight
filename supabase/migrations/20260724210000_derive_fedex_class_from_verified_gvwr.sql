begin;
create or replace function fleet.operational_class_from_verified_gvwr(p_gvwr_lbs integer,p_verification_status text)
returns text language sql immutable as $$
  select case when p_gvwr_lbs is null or p_verification_status<>'VERIFIED' then null
    when p_gvwr_lbs<=10000 then 'L10' when p_gvwr_lbs<=15000 then 'L15' else 'L20' end
$$;
create or replace function fleet.set_vehicle_operational_class() returns trigger language plpgsql set search_path=fleet,public as $$
begin
  if tg_op='INSERT' or new.gvwr_lbs is distinct from old.gvwr_lbs or new.gvwr_verified_status is distinct from old.gvwr_verified_status then
    new.vehicle_class_key:=fleet.operational_class_from_verified_gvwr(new.gvwr_lbs,new.gvwr_verified_status);
  end if;
  return new;
end $$;
drop trigger if exists fleet_vehicle_derive_operational_class on fleet.vehicle;
create trigger fleet_vehicle_derive_operational_class before insert or update of gvwr_lbs,gvwr_verified_status,vehicle_class_key on fleet.vehicle for each row execute function fleet.set_vehicle_operational_class();
update fleet.vehicle set vehicle_class_key=fleet.operational_class_from_verified_gvwr(gvwr_lbs,gvwr_verified_status)
where vehicle_class_key is distinct from fleet.operational_class_from_verified_gvwr(gvwr_lbs,gvwr_verified_status);
revoke all on function fleet.operational_class_from_verified_gvwr(integer,text) from public;
grant execute on function fleet.operational_class_from_verified_gvwr(integer,text) to authenticated,service_role;
commit;
