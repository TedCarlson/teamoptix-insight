create or replace view public.intake_lobs_v with (security_invoker=true) as select id,industry_key,industry_label,description,is_active,sort_order from ref.industries;
create or replace view public.intake_capabilities_v with (security_invoker=true) as select id,capability_key,capability_label,description,is_active,sort_order from ref.insight_capabilities;
create or replace view public.intake_lob_capabilities_v with (security_invoker=true) as select lob_id,capability_id from core.lob_capability;
create or replace view public.intake_questions_v with (security_invoker=true) as select id,question_key,label,helper_text,placeholder,field_type,is_required,scope,options_json,status,sort_order from core.intake_question;
create or replace view public.intake_question_lobs_v with (security_invoker=true) as select question_id,lob_id from core.intake_question_lob;
create or replace view public.intake_question_capabilities_v with (security_invoker=true) as select question_id,capability_id from core.intake_question_capability;
create or replace view public.workspace_requests_v with (security_invoker=true) as select id,company_name,owner_name,email,phone,status,created_at from core.workspace_request;
grant select on public.intake_lobs_v,public.intake_capabilities_v,public.intake_lob_capabilities_v,public.intake_questions_v,public.intake_question_lobs_v,public.intake_question_capabilities_v to authenticated,service_role;
grant select on public.workspace_requests_v to authenticated,service_role;
create or replace function public.submit_intake_workspace_request(p_company_name text,p_owner_name text,p_email text,p_phone text,p_lob_ids uuid[],p_capability_ids uuid[],p_answers jsonb,p_configuration_snapshot jsonb) returns uuid language plpgsql security definer set search_path=public,core,ref as $$
declare v_id uuid; v_question record; v_answer jsonb;
begin
 insert into core.workspace_request(company_name,owner_name,email,phone,configuration_snapshot) values(btrim(p_company_name),btrim(p_owner_name),lower(btrim(p_email)),nullif(btrim(p_phone),''),p_configuration_snapshot) returning id into v_id;
 insert into core.workspace_request_lob(workspace_request_id,lob_id) select v_id,x.id from unnest(coalesce(p_lob_ids,'{}')) x(id) join ref.industries l on l.id=x.id and l.is_active on conflict do nothing;
 insert into core.workspace_request_capability(workspace_request_id,capability_id) select v_id,x.id from unnest(coalesce(p_capability_ids,'{}')) x(id) join ref.insight_capabilities c on c.id=x.id and c.is_active on conflict do nothing;
 for v_question in select q.* from core.intake_question q where q.status='active' loop v_answer:=p_answers->v_question.id::text; if v_answer is not null then insert into core.workspace_request_answer(workspace_request_id,question_id,answer_json,question_snapshot) values(v_id,v_question.id,v_answer,to_jsonb(v_question)); end if; end loop;
 return v_id;
end $$;
create or replace function public.mark_workspace_request_notified(p_request_id uuid,p_notification_id text) returns void language sql security definer set search_path=public,core as $$ update core.workspace_request set notification_id=p_notification_id where id=p_request_id $$;
revoke all on function public.submit_intake_workspace_request(text,text,text,text,uuid[],uuid[],jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_intake_workspace_request(text,text,text,text,uuid[],uuid[],jsonb,jsonb) to service_role;
revoke all on function public.mark_workspace_request_notified(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_workspace_request_notified(uuid,text) to service_role;
