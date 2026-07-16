alter table fleet.inspection add column if not exists route_name text;

create or replace function public.submit_company_fleet_inspection(
  p_company_slug text, p_vehicle_id uuid, p_inspection_type text, p_odometer_miles integer,
  p_safe_to_operate boolean, p_driver_notes text, p_route_name text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, fleet, core as $$
declare v_company_id uuid; v_roster_id uuid; v_inspection_id uuid; v_item jsonb; v_item_id uuid; v_has_defect boolean := false;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  select id into v_roster_id from core.company_roster where company_id=v_company_id and profile_id=core.current_profile_id() and employment_status in ('Active','Trainee') limit 1;
  if v_company_id is null or (v_roster_id is null and not fleet.has_company_role(v_company_id,array['FLEET_MANAGER','MECHANIC'])) then raise exception 'Not authorized.'; end if;
  if not exists(select 1 from fleet.vehicle where id=p_vehicle_id and company_id=v_company_id) then raise exception 'Vehicle not found.'; end if;
  v_has_defect := exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where x->>'result'='DEFECT');
  insert into fleet.inspection(company_id,vehicle_id,driver_roster_member_id,inspection_type,record_class,status,
    odometer_miles,submitted_at,safe_to_operate_driver,driver_notes,route_name)
  values(v_company_id,p_vehicle_id,v_roster_id,p_inspection_type,case when v_has_defect then 'DVIR_DEFECT_REPORT' else 'COMPANY_INSPECTION' end,
    'SUBMITTED',p_odometer_miles,now(),p_safe_to_operate,nullif(btrim(p_driver_notes),''),nullif(btrim(p_route_name),'')) returning id into v_inspection_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into fleet.inspection_item(inspection_id,company_id,section_key,item_key,item_label,result,notes)
    values(v_inspection_id,v_company_id,v_item->>'section_key',v_item->>'item_key',v_item->>'item_label',v_item->>'result',nullif(v_item->>'notes','')) returning id into v_item_id;
    if v_item->>'result'='DEFECT' then
      insert into fleet.defect(company_id,vehicle_id,inspection_id,inspection_item_id,reported_by_roster_member_id,category,summary,description,severity,safe_to_operate_driver)
      values(v_company_id,p_vehicle_id,v_inspection_id,v_item_id,v_roster_id,v_item->>'section_key',v_item->>'item_label',nullif(v_item->>'notes',''),case when p_safe_to_operate then 'REPAIR_SOON' else 'UNSAFE_OUT_OF_SERVICE' end,p_safe_to_operate);
    end if;
  end loop;
  update fleet.vehicle set odometer_miles=coalesce(p_odometer_miles,odometer_miles),odometer_recorded_at=case when p_odometer_miles is null then odometer_recorded_at else now() end,status=case when not p_safe_to_operate then 'OUT_OF_SERVICE' else status end,updated_at=now() where id=p_vehicle_id;
  return v_inspection_id;
end $$;

grant execute on function public.submit_company_fleet_inspection(text,uuid,text,integer,boolean,text,text,jsonb) to authenticated, service_role;
