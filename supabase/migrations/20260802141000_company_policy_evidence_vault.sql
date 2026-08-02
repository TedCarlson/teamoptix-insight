-- Append-only evidence item created from each employee policy response.

create table if not exists core.company_policy_evidence_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  policy_id uuid not null references core.company_policy(id) on delete restrict,
  policy_version_id uuid not null references core.company_policy_version(id) on delete restrict,
  assignment_id uuid not null references core.company_policy_assignment(id) on delete restrict,
  roster_id uuid not null references core.company_roster(id) on delete restrict,
  employee_name text not null,
  policy_title text not null,
  version_number integer not null,
  policy_content_hash text not null,
  evidence_hash text not null,
  content_snapshot jsonb not null,
  response text not null check (response in ('ACKNOWLEDGED','DECLINED')),
  response_comment text,
  acknowledgment_statement text not null,
  reviewed_at timestamptz not null,
  responded_at timestamptz not null,
  response_user_agent text,
  created_at timestamptz not null default now(),
  unique(assignment_id)
);

create index if not exists company_policy_evidence_company_idx on core.company_policy_evidence_item(company_id, responded_at desc);
create index if not exists company_policy_evidence_roster_idx on core.company_policy_evidence_item(roster_id, responded_at desc);

alter table core.company_policy_evidence_item enable row level security;
create policy company_policy_evidence_read on core.company_policy_evidence_item for select to authenticated
  using (
    core.is_platform_owner() or core.can_admin_company(company_id) or exists(
      select 1 from core.company_roster r where r.id=roster_id and r.company_id=company_id and r.profile_id=core.current_profile_id()
    )
  );

create or replace function public.respond_to_company_policy(p_company_slug text, p_assignment_id uuid, p_response text, p_comment text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare
  v_company_id uuid;
  v_assignment core.company_policy_assignment;
  v_roster core.company_roster;
  v_version core.company_policy_version;
  v_statement text;
  v_now timestamptz:=now();
  v_evidence jsonb;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  select * into v_roster from core.company_roster where company_id=v_company_id and profile_id=core.current_profile_id() limit 1;
  select * into v_assignment from core.company_policy_assignment where id=p_assignment_id and company_id=v_company_id and roster_id=v_roster.id for update;
  if v_assignment.id is null then raise exception 'Policy acknowledgment not found.'; end if;
  if v_assignment.status<>'PENDING' or exists(select 1 from core.company_policy_evidence_item e where e.assignment_id=v_assignment.id) then raise exception 'Your response has already been recorded.'; end if;
  if p_response not in ('ACKNOWLEDGED','DECLINED') then raise exception 'Choose acknowledge or decline.'; end if;
  select * into v_version from core.company_policy_version where id=v_assignment.policy_version_id;
  v_statement:=case when p_response='ACKNOWLEDGED' then 'I acknowledge that I received, reviewed, and understand this company policy.' else 'I decline to acknowledge this company policy.' end;
  update core.company_policy_assignment set status=p_response,response_comment=nullif(btrim(p_comment),''),acknowledgment_statement=v_statement,reviewed_at=coalesce(reviewed_at,v_now),responded_at=v_now,response_user_agent=p_user_agent where id=p_assignment_id returning * into v_assignment;
  v_evidence:=jsonb_build_object('assignment_id',v_assignment.id,'employee_name',v_roster.full_name,'policy_title',v_version.title,'version_number',v_version.version_number,'policy_content_hash',v_version.content_hash,'response',p_response,'response_comment',v_assignment.response_comment,'acknowledgment_statement',v_statement,'reviewed_at',v_assignment.reviewed_at,'responded_at',v_assignment.responded_at,'content_snapshot',v_version.content_snapshot);
  insert into core.company_policy_evidence_item(company_id,policy_id,policy_version_id,assignment_id,roster_id,employee_name,policy_title,version_number,policy_content_hash,evidence_hash,content_snapshot,response,response_comment,acknowledgment_statement,reviewed_at,responded_at,response_user_agent)
  values(v_company_id,v_assignment.policy_id,v_version.id,v_assignment.id,v_roster.id,v_roster.full_name,v_version.title,v_version.version_number,v_version.content_hash,encode(digest(v_evidence::text,'sha256'),'hex'),v_version.content_snapshot,p_response,v_assignment.response_comment,v_statement,v_assignment.reviewed_at,v_assignment.responded_at,p_user_agent)
  on conflict(assignment_id) do nothing;
  return jsonb_build_object('id',p_assignment_id,'status',p_response,'responded_at',v_now);
end $$;

revoke all on function public.respond_to_company_policy(text,uuid,text,text,text) from public;
grant execute on function public.respond_to_company_policy(text,uuid,text,text,text) to authenticated,service_role;
