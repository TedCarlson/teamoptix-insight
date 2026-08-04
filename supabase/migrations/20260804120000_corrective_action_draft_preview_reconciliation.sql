-- Repair CAN issuance and complete the draft -> preview -> issue workflow.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'corrective-action-evidence',
  'corrective-action-evidence',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.issue_company_corrective_action(p_company_slug text, p_action_id uuid)
returns jsonb language plpgsql security definer set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_profile_id uuid:=core.current_profile_id();
  v_action core.corrective_action;
  v_snapshot jsonb;
  v_content jsonb;
  v_content_hash text;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;

  select * into v_action from core.corrective_action
  where id=p_action_id and company_id=v_company_id and workflow_status='DRAFT'
  for update;
  if v_action.id is null then raise exception 'Draft not found.'; end if;

  select jsonb_build_object(
    'prior_total',count(*),
    'prior_coaching',count(*) filter(where warning_level='COACHING'),
    'prior_verbal',count(*) filter(where warning_level='VERBAL'),
    'prior_written',count(*) filter(where warning_level='WRITTEN'),
    'prior_final',count(*) filter(where warning_level='FINAL'),
    'calculated_at',now()
  ) into v_snapshot
  from core.corrective_action
  where company_id=v_company_id and roster_id=v_action.roster_id and id<>v_action.id
    and workflow_status in ('ISSUED','FINALIZED');

  select to_jsonb(v_action)||jsonb_build_object(
    'history_snapshot',v_snapshot,
    'occurrences',(select coalesce(jsonb_agg(to_jsonb(o) order by o.occurred_at),'[]') from core.corrective_action_occurrence o where o.corrective_action_id=v_action.id),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from core.corrective_action_evidence e where e.corrective_action_id=v_action.id)
  ) into v_content;
  v_content_hash:=encode(extensions.digest(v_content::text,'sha256'),'hex');

  update core.corrective_action set
    workflow_status='ISSUED', history_snapshot=v_snapshot, content_snapshot=v_content,
    content_hash=v_content_hash, issued_at=now(), updated_at=now()
  where id=v_action.id;

  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id,event_payload)
  values(v_company_id,v_action.id,'ISSUED',v_profile_id,jsonb_build_object(
    'history_snapshot',v_snapshot,
    'content_hash',v_content_hash,
    'reconciliation_id','CAN-'||v_action.can_number||'-'||upper(left(v_content_hash,12))
  ));

  insert into core.company_roster_event(company_id,roster_id,event_category,event_type,event_detail,event_metadata,occurred_at)
  values(v_company_id,v_action.roster_id,'compliance','corrective_action_issued',v_action.title,jsonb_build_object(
    'corrective_action_id',v_action.id,
    'warning_level',v_action.warning_level,
    'outcome_type',v_action.outcome_type,
    'content_hash',v_content_hash
  ),now());

  return jsonb_build_object(
    'ok',true,
    'id',v_action.id,
    'content_hash',v_content_hash,
    'reconciliation_id','CAN-'||v_action.can_number||'-'||upper(left(v_content_hash,12))
  );
end $$;

create or replace function public.delete_company_corrective_action_draft(p_company_slug text, p_action_id uuid)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare
  v_company_id uuid;
  v_profile_id uuid:=core.current_profile_id();
  v_action core.corrective_action;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;

  select * into v_action from core.corrective_action
  where id=p_action_id and company_id=v_company_id and workflow_status='DRAFT'
  for update;
  if v_action.id is null then raise exception 'Deletable draft not found.'; end if;

  delete from core.corrective_action where id=v_action.id;
  insert into core.company_roster_event(company_id,roster_id,event_category,event_type,event_detail,event_metadata,occurred_at)
  values(v_company_id,v_action.roster_id,'compliance','corrective_action_draft_deleted','Unissued corrective action draft deleted.',jsonb_build_object(
    'corrective_action_id',v_action.id,
    'can_number',v_action.can_number,
    'title',v_action.title,
    'deleted_by_profile_id',v_profile_id
  ),now());
  return jsonb_build_object('ok',true,'id',v_action.id,'can_number',v_action.can_number);
end $$;

create or replace function public.register_company_corrective_action_signed_copy(
  p_company_slug text,
  p_action_id uuid,
  p_reconciliation_id text,
  p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare
  v_company_id uuid;
  v_profile_id uuid:=core.current_profile_id();
  v_action core.corrective_action;
  v_expected_id text;
  v_evidence_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;

  select * into v_action from core.corrective_action
  where id=p_action_id and company_id=v_company_id and workflow_status in ('ISSUED','FINALIZED');
  if v_action.id is null or v_action.content_hash is null then raise exception 'An issued CAN is required.'; end if;

  v_expected_id:='CAN-'||v_action.can_number||'-'||upper(left(v_action.content_hash,12));
  if upper(btrim(coalesce(p_reconciliation_id,'')))<>v_expected_id then raise exception 'Reconciliation ID does not match this CAN.'; end if;
  if nullif(p_payload->>'normalized_storage_path','') is null then raise exception 'Normalized signed copy is required.'; end if;

  insert into core.corrective_action_evidence(
    company_id,corrective_action_id,source_kind,source_id,label,storage_path,content_hash,metadata,created_by_profile_id
  ) values(
    v_company_id,v_action.id,'SIGNED_COPY',v_expected_id,'Wet-signed CAN copy',
    p_payload->>'normalized_storage_path',nullif(p_payload->>'normalized_sha256',''),
    p_payload||jsonb_build_object('reconciliation_id',v_expected_id,'can_content_hash',v_action.content_hash),v_profile_id
  ) returning id into v_evidence_id;

  insert into core.corrective_action_audit_event(company_id,corrective_action_id,event_type,actor_profile_id,event_payload)
  values(v_company_id,v_action.id,'SIGNED_COPY_RECONCILED',v_profile_id,jsonb_build_object(
    'evidence_id',v_evidence_id,
    'reconciliation_id',v_expected_id,
    'original_sha256',p_payload->>'original_sha256',
    'normalized_sha256',p_payload->>'normalized_sha256'
  ));
  return jsonb_build_object('ok',true,'evidence_id',v_evidence_id,'reconciliation_id',v_expected_id);
end $$;

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
    'actions', (select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'can_number',a.can_number,'roster_id',a.roster_id,'employee_name',r.full_name,
      'category_label',a.category_label,'title',a.title,'warning_level',a.warning_level,
      'outcome_type',a.outcome_type,'workflow_status',a.workflow_status,'incident_date',a.incident_date,
      'record_date',a.record_date,'prepared_by',coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name)),
      'updated_at',a.updated_at,'content_hash',a.content_hash,
      'signed_copy_count',(select count(*) from core.corrective_action_evidence e where e.corrective_action_id=a.id and e.source_kind='SIGNED_COPY')
    ) order by a.updated_at desc),'[]') from core.corrective_action a join core.company_roster r on r.id=a.roster_id join core.profiles p on p.id=a.prepared_by_profile_id where a.company_id=v_company.id)
  );
end $$;

revoke all on function public.delete_company_corrective_action_draft(text,uuid) from public;
revoke all on function public.register_company_corrective_action_signed_copy(text,uuid,text,jsonb) from public;
grant execute on function public.delete_company_corrective_action_draft(text,uuid) to authenticated,service_role;
grant execute on function public.register_company_corrective_action_signed_copy(text,uuid,text,jsonb) to authenticated,service_role;
