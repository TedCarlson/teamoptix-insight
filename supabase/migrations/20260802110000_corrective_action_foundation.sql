-- Company-owned Corrective Action Notice foundation.
-- Records are deliberately independent from payroll and dispatch lifecycle state.

create table if not exists core.corrective_action_template (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies(id) on delete cascade,
  template_key text not null,
  category_label text not null,
  event_family text not null default 'GENERAL',
  title text not null,
  facts_prompt text not null,
  expectation_statement text not null,
  action_statement text not null,
  policy_reference text,
  context_schema jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_by_profile_id uuid references core.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, template_key, version)
);

create table if not exists core.corrective_action (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_id uuid not null references core.company_roster(id),
  template_id uuid references core.corrective_action_template(id),
  prepared_by_profile_id uuid not null references core.profiles(id),
  can_number bigint not null,
  workflow_status text not null default 'DRAFT' check (workflow_status in ('DRAFT','ISSUED','FINALIZED','VOIDED')),
  warning_level text not null default 'COACHING' check (warning_level in ('COACHING','VERBAL','WRITTEN','FINAL')),
  outcome_type text not null default 'NONE' check (outcome_type in ('NONE','SUSPENSION','TERMINATION','RESIGNATION','JOB_ABANDONMENT')),
  incident_date date not null,
  record_date date not null default current_date,
  category_label text not null,
  title text not null,
  facts_statement text not null,
  expectation_statement text not null,
  action_statement text not null,
  corrective_plan text,
  employee_response text,
  policy_reference text,
  suspension_start date,
  suspension_end date,
  acknowledgment_status text not null default 'PENDING' check (acknowledgment_status in ('PENDING','ACKNOWLEDGED','DECLINED','WITNESSED','NOT_REQUIRED')),
  history_snapshot jsonb not null default '{}'::jsonb,
  content_snapshot jsonb,
  content_hash text,
  issued_at timestamptz,
  finalized_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (outcome_type <> 'SUSPENSION' or suspension_start is not null),
  check (suspension_end is null or suspension_start is null or suspension_end >= suspension_start),
  unique (company_id, can_number)
);

create table if not exists core.corrective_action_occurrence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  corrective_action_id uuid not null references core.corrective_action(id) on delete cascade,
  occurred_at timestamptz not null,
  event_type_key text,
  source_kind text not null default 'MANUAL',
  source_id text,
  route_key text,
  route_label text,
  stop_references text[] not null default '{}',
  context_note text,
  created_at timestamptz not null default now()
);

create table if not exists core.corrective_action_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  corrective_action_id uuid not null references core.corrective_action(id) on delete cascade,
  source_kind text not null,
  source_id text,
  label text not null,
  storage_path text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid not null references core.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists core.corrective_action_acknowledgment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  corrective_action_id uuid not null references core.corrective_action(id) on delete cascade,
  response text not null check (response in ('ACKNOWLEDGED','DECLINED','WITNESSED')),
  comment text,
  method text not null check (method in ('PAPER','MANAGER_RECORDED','MOBILE')),
  signer_name text,
  signature_storage_path text,
  signature_hash text,
  acknowledged_at timestamptz not null default now(),
  recorded_by_profile_id uuid not null references core.profiles(id),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists core.corrective_action_audit_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  corrective_action_id uuid not null references core.corrective_action(id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references core.profiles(id),
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists corrective_action_company_roster_idx on core.corrective_action(company_id, roster_id, incident_date desc);
create index if not exists corrective_action_company_status_idx on core.corrective_action(company_id, workflow_status, updated_at desc);
create index if not exists corrective_action_occurrence_action_idx on core.corrective_action_occurrence(corrective_action_id, occurred_at);

create or replace function core.enforce_corrective_action_tenant()
returns trigger language plpgsql set search_path=core,public
as $$
declare v_parent_company_id uuid; v_template_company_id uuid; v_roster_company_id uuid;
begin
  if tg_table_name = 'corrective_action' then
    select company_id into v_roster_company_id from core.company_roster where id=new.roster_id;
    if v_roster_company_id is distinct from new.company_id then
      raise exception 'Corrective action roster member must belong to the same company.';
    end if;
    if new.template_id is not null then
      select company_id into v_template_company_id from core.corrective_action_template where id=new.template_id;
      if not found or (v_template_company_id is not null and v_template_company_id is distinct from new.company_id) then
        raise exception 'Corrective action template is outside this company.';
      end if;
    end if;
    return new;
  end if;

  select company_id into v_parent_company_id from core.corrective_action where id=new.corrective_action_id;
  if v_parent_company_id is null or v_parent_company_id is distinct from new.company_id then
    raise exception 'Corrective action child record must match its parent company.';
  end if;
  return new;
end $$;

create trigger corrective_action_tenant_guard before insert or update of company_id,roster_id,template_id
  on core.corrective_action for each row execute function core.enforce_corrective_action_tenant();
create trigger corrective_action_occurrence_tenant_guard before insert or update of company_id,corrective_action_id
  on core.corrective_action_occurrence for each row execute function core.enforce_corrective_action_tenant();
create trigger corrective_action_evidence_tenant_guard before insert or update of company_id,corrective_action_id
  on core.corrective_action_evidence for each row execute function core.enforce_corrective_action_tenant();
create trigger corrective_action_ack_tenant_guard before insert or update of company_id,corrective_action_id
  on core.corrective_action_acknowledgment for each row execute function core.enforce_corrective_action_tenant();
create trigger corrective_action_audit_tenant_guard before insert or update of company_id,corrective_action_id
  on core.corrective_action_audit_event for each row execute function core.enforce_corrective_action_tenant();

alter table core.corrective_action_template enable row level security;
alter table core.corrective_action enable row level security;
alter table core.corrective_action_occurrence enable row level security;
alter table core.corrective_action_evidence enable row level security;
alter table core.corrective_action_acknowledgment enable row level security;
alter table core.corrective_action_audit_event enable row level security;

create policy corrective_action_template_read on core.corrective_action_template for select to authenticated
  using (company_id is null or core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_template_admin on core.corrective_action_template for all to authenticated
  using (company_id is not null and (core.is_platform_owner() or core.can_admin_company(company_id)))
  with check (company_id is not null and (core.is_platform_owner() or core.can_admin_company(company_id)));
create policy corrective_action_read on core.corrective_action for select to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_admin on core.corrective_action for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_occurrence_admin on core.corrective_action_occurrence for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_evidence_admin on core.corrective_action_evidence for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_ack_admin on core.corrective_action_acknowledgment for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy corrective_action_audit_read on core.corrective_action_audit_event for select to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id));

insert into core.corrective_action_template
  (template_key, category_label, event_family, title, facts_prompt, expectation_statement, action_statement, context_schema)
values
  ('attendance', 'Attendance', 'ATTENDANCE', 'Attendance concern', 'On {{incident_date}}, {{employee_name}} did not meet {{company_name}} attendance expectations. Document the dates, notice provided, and operational impact.', '{{employee_name}} is expected to report as scheduled and follow the company call-out procedure whenever an absence or delay cannot be avoided.', 'Leadership reviewed the attendance expectation, the available reporting process, and the improvement required going forward.', '["occurrence_dates","route"]'),
  ('misconduct', 'Misconduct', 'CONDUCT', 'Workplace conduct concern', 'Describe the observed conduct, when and where it occurred, the people involved, and the reliable evidence reviewed.', '{{employee_name}} is expected to maintain professional conduct and follow all adopted company policies and reasonable leadership direction.', 'Leadership reviewed the conduct standard and the immediate, sustained correction required.', '["occurrence_dates","route","evidence"]'),
  ('policy_violation', 'Policy Violation', 'POLICY', 'Policy violation', 'Describe the specific conduct, the adopted policy or expectation involved, and the evidence supporting the finding.', '{{employee_name}} is expected to follow the policies adopted by {{company_name}} and ask leadership for clarification before acting when an expectation is unclear.', 'Leadership reviewed the applicable policy and the correction required to remain in good standing.', '["policy_reference","occurrence_dates","evidence"]'),
  ('performance', 'Performance', 'PERFORMANCE', 'Performance concern', 'Describe the performance gap using specific dates, route or stop context, and objective records where available.', '{{employee_name}} is expected to perform assigned work safely, accurately, and consistently with company and customer service expectations.', 'Leadership reviewed the expected standard, available coaching, and the measurable improvement required.', '["occurrence_dates","route","stops","evidence"]'),
  ('code_85', 'Code 85', 'SERVICE', 'Code 85 application', 'Identify each date, route, stop, package or scan record involved and explain why the Code 85 application did not match the documented circumstances.', '{{employee_name}} is expected to apply service codes accurately and preserve complete supporting evidence for every affected stop.', 'Leadership reviewed correct code use and the documentation required for future service exceptions.', '["occurrence_dates","route","stops","evidence"]'),
  ('picture_pod', 'Picture Proof of Delivery', 'SERVICE', 'Picture proof of delivery', 'Identify the date, route and stops involved, then describe the picture-proof issue using the available service evidence.', '{{employee_name}} is expected to capture compliant picture proof of delivery and protect customer privacy at every applicable stop.', 'Leadership reviewed picture-proof expectations and the correction required on future deliveries.', '["occurrence_dates","route","stops","evidence"]'),
  ('pickup_failure', 'Pick Up Failure', 'SERVICE', 'Pickup failure', 'Identify the pickup, date, route, customer location, notification history and operational impact.', '{{employee_name}} is expected to complete assigned pickups or immediately notify leadership when a pickup cannot be completed as assigned.', 'Leadership reviewed pickup procedures, escalation timing, and the improvement required.', '["occurrence_dates","route","stops","evidence"]'),
  ('vehicle_incident', 'Vehicle Incident', 'SAFETY', 'Vehicle incident follow-up', 'State whether the event involved a fixed or moving object, describe the occurrence and immediate reporting timeline, and list the evidence reviewed. Do not make an unsupported fault determination.', '{{employee_name}} is expected to operate safely, stop after any incident, protect the scene, and immediately follow the company reporting procedure.', 'Leadership reviewed the incident-reporting and safe-operation expectations. Any employment decision remains a documented manager decision.', '["incident_subtype","occurrence_dates","route","evidence"]'),
  ('insubordination', 'Insubordination', 'CONDUCT', 'Failure to follow direction', 'Describe the reasonable direction given, who gave it, the employee response, and the facts showing whether the direction was understood.', '{{employee_name}} is expected to follow lawful, safe, and reasonable work direction and raise concerns through the company escalation process.', 'Leadership reviewed the direction, the escalation process, and the conduct expected going forward.', '["occurrence_dates","evidence"]'),
  ('other', 'Other', 'GENERAL', 'Corrective action', 'Describe the event using specific, objective facts, dates, locations, people involved, and evidence reviewed.', '{{employee_name}} is expected to follow the work expectations and adopted policies of {{company_name}}.', 'Leadership reviewed the concern and documented the specific correction and support required.', '["occurrence_dates","route","stops","evidence"]')
on conflict do nothing;

create or replace function public.get_company_corrective_action_workspace(p_company_slug text)
returns jsonb language plpgsql stable security definer set search_path = core, public
as $$
declare v_company record; v_profile_id uuid := core.current_profile_id();
begin
  select id, company_name, company_slug into v_company from core.companies where company_slug=p_company_slug;
  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company.id)) then raise exception 'Company admin access required.'; end if;
  return jsonb_build_object(
    'company', jsonb_build_object('id',v_company.id,'name',v_company.company_name,'slug',v_company.company_slug),
    'preparer', (select jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name))) from core.profiles p where p.id=v_profile_id),
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.full_name,'status',r.employment_status,'role',coalesce(r.job_title,r.worker_type)) order by lower(r.full_name)),'[]') from core.company_roster r where r.company_id=v_company.id and r.employment_status in ('Active','Trainee','Former')),
    'templates', (select coalesce(jsonb_agg(to_jsonb(t) order by t.category_label,t.version desc),'[]') from core.corrective_action_template t where t.is_active and (t.company_id=v_company.id or (t.company_id is null and not exists(select 1 from core.corrective_action_template o where o.company_id=v_company.id and o.template_key=t.template_key and o.is_active)))),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'can_number',a.can_number,'roster_id',a.roster_id,'employee_name',r.full_name,'category_label',a.category_label,'title',a.title,'warning_level',a.warning_level,'outcome_type',a.outcome_type,'workflow_status',a.workflow_status,'incident_date',a.incident_date,'record_date',a.record_date,'prepared_by',coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name)),'updated_at',a.updated_at) order by a.updated_at desc),'[]') from core.corrective_action a join core.company_roster r on r.id=a.roster_id join core.profiles p on p.id=a.prepared_by_profile_id where a.company_id=v_company.id)
  );
end $$;

create or replace function public.save_company_corrective_action(p_company_slug text, p_action_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = core, public
as $$
declare v_company_id uuid; v_profile_id uuid := core.current_profile_id(); v_action core.corrective_action; v_occ jsonb; v_next_can_number bigint;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if not exists(select 1 from core.company_roster where id=(p_payload->>'roster_id')::uuid and company_id=v_company_id) then raise exception 'Roster member is outside this company.'; end if;
  if p_action_id is null then
    perform 1 from core.companies where id=v_company_id for update;
    select coalesce(max(can_number),0)+1 into v_next_can_number from core.corrective_action where company_id=v_company_id;
    insert into core.corrective_action(company_id,can_number,roster_id,template_id,prepared_by_profile_id,warning_level,outcome_type,incident_date,record_date,category_label,title,facts_statement,expectation_statement,action_statement,corrective_plan,employee_response,policy_reference,suspension_start,suspension_end)
    values(v_company_id,v_next_can_number,(p_payload->>'roster_id')::uuid,nullif(p_payload->>'template_id','')::uuid,v_profile_id,coalesce(nullif(p_payload->>'warning_level',''),'COACHING'),coalesce(nullif(p_payload->>'outcome_type',''),'NONE'),(p_payload->>'incident_date')::date,coalesce(nullif(p_payload->>'record_date','')::date,current_date),p_payload->>'category_label',p_payload->>'title',p_payload->>'facts_statement',p_payload->>'expectation_statement',p_payload->>'action_statement',nullif(p_payload->>'corrective_plan',''),nullif(p_payload->>'employee_response',''),nullif(p_payload->>'policy_reference',''),nullif(p_payload->>'suspension_start','')::date,nullif(p_payload->>'suspension_end','')::date) returning * into v_action;
  else
    update core.corrective_action set roster_id=(p_payload->>'roster_id')::uuid,template_id=nullif(p_payload->>'template_id','')::uuid,warning_level=p_payload->>'warning_level',outcome_type=p_payload->>'outcome_type',incident_date=(p_payload->>'incident_date')::date,record_date=(p_payload->>'record_date')::date,category_label=p_payload->>'category_label',title=p_payload->>'title',facts_statement=p_payload->>'facts_statement',expectation_statement=p_payload->>'expectation_statement',action_statement=p_payload->>'action_statement',corrective_plan=nullif(p_payload->>'corrective_plan',''),employee_response=nullif(p_payload->>'employee_response',''),policy_reference=nullif(p_payload->>'policy_reference',''),suspension_start=nullif(p_payload->>'suspension_start','')::date,suspension_end=nullif(p_payload->>'suspension_end','')::date,updated_at=now()
    where id=p_action_id and company_id=v_company_id and workflow_status='DRAFT' returning * into v_action;
    if v_action.id is null then raise exception 'Editable draft not found.'; end if;
    delete from core.corrective_action_occurrence where corrective_action_id=v_action.id;
  end if;
  for v_occ in select * from jsonb_array_elements(coalesce(p_payload->'occurrences','[]')) loop
    insert into core.corrective_action_occurrence(company_id,corrective_action_id,occurred_at,event_type_key,source_kind,source_id,route_key,route_label,stop_references,context_note)
    values(v_company_id,v_action.id,coalesce(nullif(v_occ->>'occurred_at','')::timestamptz,v_action.incident_date::timestamptz),nullif(v_occ->>'event_type_key',''),coalesce(nullif(v_occ->>'source_kind',''),'MANUAL'),nullif(v_occ->>'source_id',''),nullif(v_occ->>'route_key',''),nullif(v_occ->>'route_label',''),coalesce(array(select jsonb_array_elements_text(coalesce(v_occ->'stop_references','[]'))),'{}'),nullif(v_occ->>'context_note',''));
  end loop;
  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id) values(v_company_id,v_action.id,case when p_action_id is null then 'CREATED' else 'UPDATED' end,v_profile_id);
  return jsonb_build_object('ok',true,'id',v_action.id,'can_number',v_action.can_number);
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
  select to_jsonb(v_action)||jsonb_build_object('history_snapshot',v_snapshot,'occurrences',(select coalesce(jsonb_agg(to_jsonb(o) order by o.occurred_at),'[]') from core.corrective_action_occurrence o where o.corrective_action_id=v_action.id)) into v_content;
  update core.corrective_action set workflow_status='ISSUED',history_snapshot=v_snapshot,content_snapshot=v_content,content_hash=encode(extensions.digest(v_content::text,'sha256'),'hex'),issued_at=now(),updated_at=now() where id=v_action.id;
  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id,event_payload) values(v_company_id,v_action.id,'ISSUED',v_profile_id,jsonb_build_object('history_snapshot',v_snapshot));
  insert into core.company_roster_event(company_id,roster_member_id,event_category,event_type,event_detail,event_metadata,occurred_at) values(v_company_id,v_action.roster_id,'compliance','corrective_action_issued',v_action.title,jsonb_build_object('corrective_action_id',v_action.id,'warning_level',v_action.warning_level,'outcome_type',v_action.outcome_type),now());
  return jsonb_build_object('ok',true,'id',v_action.id);
end $$;

create or replace function public.get_company_corrective_action(p_company_slug text, p_action_id uuid)
returns jsonb language sql stable security definer set search_path=core,public as $$
select jsonb_build_object('company',jsonb_build_object('name',c.company_name,'slug',c.company_slug),'action',to_jsonb(a),'employee',jsonb_build_object('id',r.id,'name',r.full_name,'role',coalesce(r.job_title,r.worker_type)),'preparer',jsonb_build_object('name',coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name))),'occurrences',(select coalesce(jsonb_agg(to_jsonb(o) order by o.occurred_at),'[]') from core.corrective_action_occurrence o where o.corrective_action_id=a.id),'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from core.corrective_action_evidence e where e.corrective_action_id=a.id)) from core.corrective_action a join core.companies c on c.id=a.company_id join core.company_roster r on r.id=a.roster_id join core.profiles p on p.id=a.prepared_by_profile_id where a.id=p_action_id and c.company_slug=p_company_slug and (core.is_platform_owner() or core.can_admin_company(c.id));
$$;

create or replace function public.upsert_company_corrective_action_template(p_company_slug text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_profile_id uuid:=core.current_profile_id(); v_key text:=p_payload->>'template_key'; v_version integer; v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if nullif(btrim(v_key),'') is null then raise exception 'Template key is required.'; end if;
  update core.corrective_action_template set is_active=false,updated_at=now() where company_id=v_company_id and template_key=v_key and is_active;
  select coalesce(max(version),0)+1 into v_version from core.corrective_action_template where company_id=v_company_id and template_key=v_key;
  insert into core.corrective_action_template(company_id,template_key,category_label,event_family,title,facts_prompt,expectation_statement,action_statement,policy_reference,context_schema,version,created_by_profile_id)
  values(v_company_id,v_key,p_payload->>'category_label',coalesce(nullif(p_payload->>'event_family',''),'GENERAL'),p_payload->>'title',p_payload->>'facts_prompt',p_payload->>'expectation_statement',p_payload->>'action_statement',nullif(p_payload->>'policy_reference',''),coalesce(p_payload->'context_schema','[]'),v_version,v_profile_id) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'version',v_version);
end $$;

revoke all on function public.get_company_corrective_action_workspace(text) from public;
revoke all on function public.save_company_corrective_action(text,uuid,jsonb) from public;
revoke all on function public.issue_company_corrective_action(text,uuid) from public;
revoke all on function public.get_company_corrective_action(text,uuid) from public;
revoke all on function public.upsert_company_corrective_action_template(text,jsonb) from public;
grant execute on function public.get_company_corrective_action_workspace(text) to authenticated,service_role;
grant execute on function public.save_company_corrective_action(text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.issue_company_corrective_action(text,uuid) to authenticated,service_role;
grant execute on function public.get_company_corrective_action(text,uuid) to authenticated,service_role;
grant execute on function public.upsert_company_corrective_action_template(text,jsonb) to authenticated,service_role;
