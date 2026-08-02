-- Employee statements occur after issuance and remain append-only evidence.

alter table core.corrective_action_acknowledgment
  add column if not exists agreement_position text not null default 'NO_SELECTION',
  add column if not exists written_response_attached boolean not null default false,
  add column if not exists session_notes text;

alter table core.corrective_action_acknowledgment
  add constraint corrective_action_acknowledgment_agreement_ck
  check (agreement_position in ('AGREES','DISAGREES','NO_SELECTION'));

create or replace function public.record_company_corrective_action_acknowledgment(
  p_company_slug text, p_action_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare
  v_company_id uuid;
  v_profile_id uuid:=core.current_profile_id();
  v_action core.corrective_action;
  v_ack core.corrective_action_acknowledgment;
  v_position text:=coalesce(nullif(p_payload->>'agreement_position',''),'NO_SELECTION');
  v_response text;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;

  select * into v_action from core.corrective_action
  where id=p_action_id and company_id=v_company_id and workflow_status in ('ISSUED','FINALIZED');
  if v_action.id is null then raise exception 'An issued corrective action is required.'; end if;
  if v_position not in ('AGREES','DISAGREES','NO_SELECTION') then raise exception 'Unsupported employee statement selection.'; end if;

  v_response:=case when v_position='DISAGREES' then 'DECLINED' else 'ACKNOWLEDGED' end;
  insert into core.corrective_action_acknowledgment(
    company_id,corrective_action_id,response,agreement_position,written_response_attached,
    comment,session_notes,method,signer_name,recorded_by_profile_id,metadata
  ) values(
    v_company_id,v_action.id,v_response,v_position,coalesce((p_payload->>'written_response_attached')::boolean,false),
    nullif(btrim(p_payload->>'comment'),''),nullif(btrim(p_payload->>'session_notes'),''),
    coalesce(nullif(p_payload->>'method',''),'MANAGER_RECORDED'),nullif(btrim(p_payload->>'signer_name'),''),
    v_profile_id,jsonb_build_object('source','can_post_issuance_statement')
  ) returning * into v_ack;

  update core.corrective_action set
    acknowledgment_status=case when v_response='DECLINED' then 'DECLINED' else 'ACKNOWLEDGED' end,
    updated_at=now()
  where id=v_action.id;

  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id,event_payload)
  values(v_company_id,v_action.id,'EMPLOYEE_STATEMENT_RECORDED',v_profile_id,jsonb_build_object(
    'acknowledgment_id',v_ack.id,'agreement_position',v_position,
    'written_response_attached',v_ack.written_response_attached,'method',v_ack.method
  ));
  return jsonb_build_object('ok',true,'acknowledgment_id',v_ack.id);
end $$;

create or replace function public.get_company_corrective_action(p_company_slug text, p_action_id uuid)
returns jsonb language sql stable security definer set search_path=core,public as $$
select jsonb_build_object(
  'company',jsonb_build_object('name',c.company_name,'slug',c.company_slug),
  'action',to_jsonb(a),
  'employee',jsonb_build_object('id',r.id,'name',r.full_name,'role',coalesce(r.job_title,r.worker_type)),
  'preparer',jsonb_build_object('name',coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name))),
  'occurrences',(select coalesce(jsonb_agg(to_jsonb(o) order by o.occurred_at),'[]') from core.corrective_action_occurrence o where o.corrective_action_id=a.id),
  'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from core.corrective_action_evidence e where e.corrective_action_id=a.id),
  'acknowledgments',(select coalesce(jsonb_agg(to_jsonb(k) order by k.acknowledged_at),'[]') from core.corrective_action_acknowledgment k where k.corrective_action_id=a.id)
)
from core.corrective_action a
join core.companies c on c.id=a.company_id
join core.company_roster r on r.id=a.roster_id
join core.profiles p on p.id=a.prepared_by_profile_id
where a.id=p_action_id and c.company_slug=p_company_slug
  and (core.is_platform_owner() or core.can_admin_company(c.id));
$$;

revoke all on function public.record_company_corrective_action_acknowledgment(text,uuid,jsonb) from public;
grant execute on function public.record_company_corrective_action_acknowledgment(text,uuid,jsonb) to authenticated,service_role;
