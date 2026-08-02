-- Full DSW route evidence for automatic CAN hydration.

create or replace function public.get_company_corrective_action_dsw_evidence(p_company_slug text, p_service_date date)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  return coalesce((
    with selected_batch as (
      select b.* from core.operations_report_batch b
      where b.company_id=v_company_id and b.report_family_key='DSW' and b.service_date=p_service_date and b.status='LOADED'
      order by case when b.snapshot_kind='FINAL' then 0 else 1 end,b.created_at desc limit 1
    )
    select jsonb_build_object(
      'service_date',p_service_date,
      'source',case when b.snapshot_kind='FINAL' then 'DSW_FINAL' else 'DSW_IN_DAY' end,
      'batch_id',b.id,
      'rows',coalesce(jsonb_agg(jsonb_build_object(
        'row_id',r.id,
        'route_name',coalesce(nullif(r.normalized_row_json->>'wa_name',''),r.source_route_key),
        'wa_number',coalesce(nullif(r.normalized_row_json->>'wa_number',''),r.source_wa_number),
        'driver_name',coalesce(nullif(r.normalized_row_json->>'driver_name',''),r.source_driver_name),
        'vehicle_text',r.normalized_row_json->>'vehicle_text',
        'vscan_packages',r.normalized_row_json->'vscan_packages',
        'planned_delivery_stops',r.normalized_row_json->'planned_delivery_stops',
        'actual_delivery_stops',r.normalized_row_json->'actual_delivery_stops',
        'actual_delivery_packages',r.normalized_row_json->'actual_delivery_packages',
        'planned_pickup_stops',r.normalized_row_json->'planned_pickup_stops',
        'actual_pickup_stops',r.normalized_row_json->'actual_pickup_stops',
        'actual_pickup_packages',r.normalized_row_json->'actual_pickup_packages',
        'non_delivered_stops',r.normalized_row_json->'non_delivered_stops',
        'exceptions',r.normalized_row_json->'exceptions',
        'code_85',r.normalized_row_json->'code_85',
        'dna',r.normalized_row_json->'dna',
        'send_again',r.normalized_row_json->'send_again',
        'all_status_code_packages',r.normalized_row_json->'all_status_code_packages',
        'required_signature',r.normalized_row_json->'required_signature',
        'potential_missed_pickups',r.normalized_row_json->'potential_missed_pickups',
        'early_late_pickups',r.normalized_row_json->'early_late_pickups',
        'ils_percent',r.normalized_row_json->'ils_percent',
        'miles',r.normalized_row_json->'miles',
        'on_road_hours',r.normalized_row_json->'on_road_hours',
        'on_duty_hours',r.normalized_row_json->'on_duty_hours'
      ) order by r.source_row_index) filter(where r.id is not null),'[]'::jsonb)
    )
    from selected_batch b left join core.operations_report_raw_row r on r.batch_id=b.id and r.row_kind='ROUTE'
    group by b.id,b.snapshot_kind
  ),jsonb_build_object('service_date',p_service_date,'source',null,'batch_id',null,'rows','[]'::jsonb));
end $$;

revoke all on function public.get_company_corrective_action_dsw_evidence(text,date) from public;
grant execute on function public.get_company_corrective_action_dsw_evidence(text,date) to authenticated,service_role;

create or replace function public.get_company_corrective_action_attendance_evidence(p_company_slug text, p_roster_id uuid, p_through_date date)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company_id uuid; v_last_can_date date;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if not exists(select 1 from core.company_roster where id=p_roster_id and company_id=v_company_id) then raise exception 'Roster member is outside this company.'; end if;
  select max(a.incident_date) into v_last_can_date from core.corrective_action a
  left join core.corrective_action_template t on t.id=a.template_id
  where a.company_id=v_company_id and a.roster_id=p_roster_id and a.workflow_status in ('ISSUED','FINALIZED') and (upper(a.category_label)='ATTENDANCE' or t.event_family='ATTENDANCE');
  return jsonb_build_object(
    'last_attendance_can_date',v_last_can_date,
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'date',d.dispatch_date,'event_code',e.event_code,'event_label',e.event_label,'note',e.note,'created_at',e.created_at) order by d.dispatch_date,e.created_at),'[]') from core.dispatch_event e join core.dispatch_day d on d.id=e.dispatch_day_id where d.company_id=v_company_id and e.person_roster_member_id=p_roster_id and e.event_code in ('CALL_OUT','NO_SHOW','LATE_ARRIVAL') and d.dispatch_date<=p_through_date and (v_last_can_date is null or d.dispatch_date>v_last_can_date))
  );
end $$;

revoke all on function public.get_company_corrective_action_attendance_evidence(text,uuid,date) from public;
grant execute on function public.get_company_corrective_action_attendance_evidence(text,uuid,date) to authenticated,service_role;

create or replace function public.get_company_corrective_action_package_code_evidence(p_company_slug text, p_service_date date)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  return jsonb_build_object(
    'instances',(with latest_snapshot as (
      select distinct on (s.contract_number) s.id,s.contract_number,s.snapshot_kind,s.generated_at,s.created_at
      from core.operations_dsw_package_status_snapshot s
      where s.company_id=v_company_id and s.service_date=p_service_date and s.import_status='COMPLETE'
      order by s.contract_number,case when s.snapshot_kind='FINAL' then 0 else 1 end,s.created_at desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',f.id,'tracking_ref',f.tracking_ref,'work_area_name',f.work_area_name,'work_area_number',f.work_area_number,
      'vision_label',f.vision_label,'vehicle_number',f.vehicle_number,'vsa_status_code',f.vsa_status_code,
      'star_status_code',f.star_status_code,'star_scan_at_local',f.star_scan_at_local,'snapshot_kind',s.snapshot_kind,
      'snapshot_generated_at',s.generated_at
    ) order by f.work_area_number,f.package_ordinal),'[]')
    from latest_snapshot s
    join core.operations_dsw_package_status_observation o on o.snapshot_id=s.id
    join core.operations_dsw_package_status_fact f on f.company_id=v_company_id and f.service_date=p_service_date and f.contract_number=s.contract_number and f.tracking_ref=o.tracking_ref)
  );
end $$;

revoke all on function public.get_company_corrective_action_package_code_evidence(text,date) from public;
grant execute on function public.get_company_corrective_action_package_code_evidence(text,date) to authenticated,service_role;

create or replace function public.save_company_corrective_action_evidence_snapshot(p_company_slug text, p_action_id uuid, p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_profile_id uuid:=core.current_profile_id(); v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if not exists(select 1 from core.corrective_action where id=p_action_id and company_id=v_company_id and workflow_status='DRAFT') then raise exception 'Editable draft not found.'; end if;
  delete from core.corrective_action_evidence where corrective_action_id=p_action_id and source_kind='WAREHOUSE_SNAPSHOT';
  if p_evidence is not null and p_evidence<>'{}'::jsonb then
    insert into core.corrective_action_evidence(company_id,corrective_action_id,source_kind,source_id,label,content_hash,metadata,created_by_profile_id)
    values(v_company_id,p_action_id,'WAREHOUSE_SNAPSHOT',p_evidence->>'service_date','Operational evidence appendix',encode(extensions.digest(p_evidence::text,'sha256'),'hex'),p_evidence,v_profile_id) returning id into v_id;
  end if;
  return jsonb_build_object('id',v_id);
end $$;

create or replace function public.issue_company_corrective_action(p_company_slug text, p_action_id uuid)
returns jsonb language plpgsql security definer set search_path = core, public
as $$
declare v_company_id uuid; v_profile_id uuid:=core.current_profile_id(); v_action core.corrective_action; v_snapshot jsonb; v_content jsonb;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  select * into v_action from core.corrective_action where id=p_action_id and company_id=v_company_id and workflow_status='DRAFT' for update;
  if v_action.id is null then raise exception 'Draft not found.'; end if;
  select jsonb_build_object('prior_total',count(*),'prior_coaching',count(*) filter(where warning_level='COACHING'),'prior_verbal',count(*) filter(where warning_level='VERBAL'),'prior_written',count(*) filter(where warning_level='WRITTEN'),'prior_final',count(*) filter(where warning_level='FINAL'),'calculated_at',now()) into v_snapshot from core.corrective_action where company_id=v_company_id and roster_id=v_action.roster_id and id<>v_action.id and workflow_status in ('ISSUED','FINALIZED');
  select to_jsonb(v_action)||jsonb_build_object('history_snapshot',v_snapshot,'occurrences',(select coalesce(jsonb_agg(to_jsonb(o) order by o.occurred_at),'[]') from core.corrective_action_occurrence o where o.corrective_action_id=v_action.id),'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from core.corrective_action_evidence e where e.corrective_action_id=v_action.id)) into v_content;
  update core.corrective_action set workflow_status='ISSUED',history_snapshot=v_snapshot,content_snapshot=v_content,content_hash=encode(extensions.digest(v_content::text,'sha256'),'hex'),issued_at=now(),updated_at=now() where id=v_action.id;
  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id,event_payload) values(v_company_id,v_action.id,'ISSUED',v_profile_id,jsonb_build_object('history_snapshot',v_snapshot,'evidence_count',(select count(*) from core.corrective_action_evidence where corrective_action_id=v_action.id)));
  insert into core.company_roster_event(company_id,roster_member_id,event_category,event_type,event_detail,event_metadata,occurred_at) values(v_company_id,v_action.roster_id,'compliance','corrective_action_issued',v_action.title,jsonb_build_object('corrective_action_id',v_action.id,'warning_level',v_action.warning_level,'outcome_type',v_action.outcome_type),now());
  return jsonb_build_object('ok',true,'id',v_action.id);
end $$;

revoke all on function public.save_company_corrective_action_evidence_snapshot(text,uuid,jsonb) from public;
grant execute on function public.save_company_corrective_action_evidence_snapshot(text,uuid,jsonb) to authenticated,service_role;
