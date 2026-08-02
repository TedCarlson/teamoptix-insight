-- Client-owned policy authoring, immutable rollout versions, and employee acknowledgments.

create table if not exists core.company_policy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  current_version integer not null default 0 check (current_version >= 0),
  created_by_profile_id uuid not null references core.profiles(id),
  updated_by_profile_id uuid not null references core.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) > 0)
);

create table if not exists core.company_policy_section (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  policy_id uuid not null references core.company_policy(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  body text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) > 0)
);

create unique index if not exists company_policy_section_position_uidx
  on core.company_policy_section(policy_id, position) where status='ACTIVE';

create table if not exists core.company_policy_version (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  policy_id uuid not null references core.company_policy(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text,
  content_snapshot jsonb not null,
  content_hash text not null,
  section_count integer not null check (section_count > 0),
  published_by_profile_id uuid not null references core.profiles(id),
  published_at timestamptz not null default now(),
  unique(policy_id, version_number)
);

create table if not exists core.company_policy_assignment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  policy_id uuid not null references core.company_policy(id) on delete cascade,
  policy_version_id uuid not null references core.company_policy_version(id) on delete cascade,
  roster_id uuid not null references core.company_roster(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACKNOWLEDGED','DECLINED')),
  response_comment text,
  acknowledgment_statement text,
  reviewed_at timestamptz,
  responded_at timestamptz,
  response_ip inet,
  response_user_agent text,
  rolled_out_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_version_id, roster_id)
);

create index if not exists company_policy_company_idx on core.company_policy(company_id, updated_at desc);
create index if not exists company_policy_section_policy_idx on core.company_policy_section(policy_id, position);
create index if not exists company_policy_version_policy_idx on core.company_policy_version(policy_id, version_number desc);
create index if not exists company_policy_assignment_company_status_idx on core.company_policy_assignment(company_id, status, rolled_out_at desc);
create index if not exists company_policy_assignment_roster_idx on core.company_policy_assignment(roster_id, status, rolled_out_at desc);

create trigger company_policy_set_updated_at before update on core.company_policy
  for each row execute function core.set_updated_at();
create trigger company_policy_section_set_updated_at before update on core.company_policy_section
  for each row execute function core.set_updated_at();
create trigger company_policy_assignment_set_updated_at before update on core.company_policy_assignment
  for each row execute function core.set_updated_at();

create or replace function core.enforce_company_policy_tenant()
returns trigger language plpgsql set search_path=core,public
as $$
declare v_policy_company uuid; v_version_company uuid; v_roster_company uuid;
begin
  select company_id into v_policy_company from core.company_policy where id=new.policy_id;
  if v_policy_company is null or v_policy_company is distinct from new.company_id then
    raise exception 'Policy record is outside this company.';
  end if;
  if tg_table_name = 'company_policy_assignment' then
    select company_id into v_version_company from core.company_policy_version where id=new.policy_version_id and policy_id=new.policy_id;
    select company_id into v_roster_company from core.company_roster where id=new.roster_id;
    if v_version_company is distinct from new.company_id or v_roster_company is distinct from new.company_id then
      raise exception 'Policy assignment is outside this company.';
    end if;
  end if;
  return new;
end $$;

create trigger company_policy_section_tenant_guard before insert or update of company_id,policy_id
  on core.company_policy_section for each row execute function core.enforce_company_policy_tenant();
create trigger company_policy_version_tenant_guard before insert or update of company_id,policy_id
  on core.company_policy_version for each row execute function core.enforce_company_policy_tenant();
create trigger company_policy_assignment_tenant_guard before insert or update of company_id,policy_id,policy_version_id,roster_id
  on core.company_policy_assignment for each row execute function core.enforce_company_policy_tenant();

alter table core.company_policy enable row level security;
alter table core.company_policy_section enable row level security;
alter table core.company_policy_version enable row level security;
alter table core.company_policy_assignment enable row level security;

create policy company_policy_read on core.company_policy for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));
create policy company_policy_admin on core.company_policy for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy company_policy_section_read on core.company_policy_section for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));
create policy company_policy_section_admin on core.company_policy_section for all to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy company_policy_version_read on core.company_policy_version for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));
create policy company_policy_version_admin_insert on core.company_policy_version for insert to authenticated
  with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy company_policy_assignment_read on core.company_policy_assignment for select to authenticated
  using (
    core.is_platform_owner() or core.can_admin_company(company_id) or exists(
      select 1 from core.company_roster r
      where r.id=roster_id and r.company_id=company_id and r.profile_id=core.current_profile_id()
    )
  );
create policy company_policy_assignment_admin_insert on core.company_policy_assignment for insert to authenticated
  with check (core.is_platform_owner() or core.can_admin_company(company_id));

create or replace function public.get_company_policy_workspace(p_company_slug text, p_policy_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company record; v_policy_id uuid := p_policy_id;
begin
  select id,company_name,company_slug into v_company from core.companies where company_slug=p_company_slug;
  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company.id)) then raise exception 'Company admin access required.'; end if;
  if v_policy_id is null then select id into v_policy_id from core.company_policy where company_id=v_company.id and status<>'ARCHIVED' order by updated_at desc limit 1; end if;
  if v_policy_id is not null and not exists(select 1 from core.company_policy where id=v_policy_id and company_id=v_company.id) then raise exception 'Policy not found.'; end if;
  return jsonb_build_object(
    'company',jsonb_build_object('id',v_company.id,'name',v_company.company_name,'slug',v_company.company_slug),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,'status',p.status,'current_version',p.current_version,'updated_at',p.updated_at) order by p.updated_at desc),'[]') from core.company_policy p where p.company_id=v_company.id and p.status<>'ARCHIVED'),
    'selected_policy',(select to_jsonb(p) from core.company_policy p where p.id=v_policy_id),
    'sections',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]') from core.company_policy_section s where s.policy_id=v_policy_id and s.status='ACTIVE'),
    'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'title',v.title,'section_count',v.section_count,'published_at',v.published_at,'published_by',coalesce(nullif(pr.display_name,''),concat_ws(' ',pr.first_name,pr.last_name)),'assigned_count',(select count(*) from core.company_policy_assignment a where a.policy_version_id=v.id),'acknowledged_count',(select count(*) from core.company_policy_assignment a where a.policy_version_id=v.id and a.status='ACKNOWLEDGED'),'declined_count',(select count(*) from core.company_policy_assignment a where a.policy_version_id=v.id and a.status='DECLINED')) order by v.version_number desc),'[]') from core.company_policy_version v join core.profiles pr on pr.id=v.published_by_profile_id where v.policy_id=v_policy_id),
    'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'version_id',a.policy_version_id,'version_number',v.version_number,'roster_id',a.roster_id,'employee_name',r.full_name,'status',a.status,'rolled_out_at',a.rolled_out_at,'reviewed_at',a.reviewed_at,'responded_at',a.responded_at,'response_comment',a.response_comment) order by v.version_number desc,lower(r.full_name)),'[]') from core.company_policy_assignment a join core.company_policy_version v on v.id=a.policy_version_id join core.company_roster r on r.id=a.roster_id where a.policy_id=v_policy_id)
  );
end $$;

create or replace function public.save_company_policy(p_company_slug text, p_policy_id uuid, p_title text, p_description text default null)
returns uuid language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_profile_id uuid:=core.current_profile_id(); v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Policy title is required.'; end if;
  if p_policy_id is null then
    insert into core.company_policy(company_id,title,description,created_by_profile_id,updated_by_profile_id)
    values(v_company_id,btrim(p_title),nullif(btrim(p_description),''),v_profile_id,v_profile_id) returning id into v_id;
    insert into core.company_policy_section(company_id,policy_id,position,title,body)
    values(v_company_id,v_id,1,'Purpose','State why this policy exists and who it applies to.');
  else
    update core.company_policy set title=btrim(p_title),description=nullif(btrim(p_description),''),updated_by_profile_id=v_profile_id
    where id=p_policy_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Policy not found.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.manage_company_policy_section(p_company_slug text, p_policy_id uuid, p_section_id uuid, p_action text, p_title text default null, p_body text default null)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_id uuid; v_position integer; v_other uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if not exists(select 1 from core.company_policy where id=p_policy_id and company_id=v_company_id) then raise exception 'Policy not found.'; end if;
  if p_action='ADD' then
    select coalesce(max(position),0)+1 into v_position from core.company_policy_section where policy_id=p_policy_id and status='ACTIVE';
    insert into core.company_policy_section(company_id,policy_id,position,title,body) values(v_company_id,p_policy_id,v_position,coalesce(nullif(btrim(p_title),''),'New section'),coalesce(p_body,'')) returning id into v_id;
  elsif p_action='SAVE' then
    update core.company_policy_section set title=coalesce(nullif(btrim(p_title),''),title),body=coalesce(p_body,body) where id=p_section_id and policy_id=p_policy_id and company_id=v_company_id and status='ACTIVE' returning id into v_id;
  elsif p_action in ('UP','DOWN') then
    select position into v_position from core.company_policy_section where id=p_section_id and policy_id=p_policy_id and company_id=v_company_id and status='ACTIVE';
    select id into v_other from core.company_policy_section where policy_id=p_policy_id and status='ACTIVE' and position=(case when p_action='UP' then v_position-1 else v_position+1 end);
    if v_other is not null then
      update core.company_policy_section set position=2147483647 where id=p_section_id;
      update core.company_policy_section set position=v_position where id=v_other;
      update core.company_policy_section set position=(case when p_action='UP' then v_position-1 else v_position+1 end) where id=p_section_id;
    end if;
    v_id:=p_section_id;
  elsif p_action='ARCHIVE' then
    if (select count(*) from core.company_policy_section where policy_id=p_policy_id and status='ACTIVE')<=1 then raise exception 'A policy must keep at least one section.'; end if;
    select position into v_position from core.company_policy_section where id=p_section_id and policy_id=p_policy_id and company_id=v_company_id and status='ACTIVE';
    update core.company_policy_section set status='ARCHIVED' where id=p_section_id;
    update core.company_policy_section set position=position-1 where policy_id=p_policy_id and status='ACTIVE' and position>v_position;
    v_id:=p_section_id;
  else raise exception 'Unsupported section action.';
  end if;
  update core.company_policy set updated_by_profile_id=core.current_profile_id(),updated_at=now() where id=p_policy_id;
  return jsonb_build_object('id',v_id);
end $$;

create or replace function public.publish_company_policy(p_company_slug text, p_policy_id uuid)
returns uuid language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_profile_id uuid:=core.current_profile_id(); v_policy core.company_policy; v_version_id uuid; v_snapshot jsonb; v_count integer; v_next integer;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  select * into v_policy from core.company_policy where id=p_policy_id and company_id=v_company_id for update;
  if v_policy.id is null then raise exception 'Policy not found.'; end if;
  select count(*),jsonb_build_object('policy',jsonb_build_object('id',v_policy.id,'title',v_policy.title,'description',v_policy.description),'sections',jsonb_agg(jsonb_build_object('position',s.position,'title',s.title,'body',s.body) order by s.position)) into v_count,v_snapshot from core.company_policy_section s where s.policy_id=p_policy_id and s.status='ACTIVE';
  if v_count=0 then raise exception 'Add at least one policy section before rollout.'; end if;
  if exists(select 1 from core.company_policy_section where policy_id=p_policy_id and status='ACTIVE' and nullif(btrim(body),'') is null) then raise exception 'Complete every policy section before rollout.'; end if;
  v_next:=v_policy.current_version+1;
  insert into core.company_policy_version(company_id,policy_id,version_number,title,description,content_snapshot,content_hash,section_count,published_by_profile_id)
  values(v_company_id,p_policy_id,v_next,v_policy.title,v_policy.description,v_snapshot,encode(digest(v_snapshot::text,'sha256'),'hex'),v_count,v_profile_id) returning id into v_version_id;
  insert into core.company_policy_assignment(company_id,policy_id,policy_version_id,roster_id)
  select v_company_id,p_policy_id,v_version_id,r.id from core.company_roster r where r.company_id=v_company_id and r.employment_status in ('Active','Trainee') on conflict do nothing;
  update core.company_policy set status='ACTIVE',current_version=v_next,updated_by_profile_id=v_profile_id where id=p_policy_id;
  return v_version_id;
end $$;

create or replace function public.get_company_policy_version(p_company_slug text, p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company_id uuid; v_version core.company_policy_version;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null or not (
    core.is_platform_owner() or core.can_access_company(v_company_id) or exists(
      select 1 from core.company_roster r where r.company_id=v_company_id and r.profile_id=core.current_profile_id()
    )
  ) then raise exception 'Company access required.'; end if;
  select * into v_version from core.company_policy_version where id=p_version_id and company_id=v_company_id;
  if v_version.id is null then raise exception 'Policy version not found.'; end if;
  return jsonb_build_object(
    'id',v_version.id,'policy_id',v_version.policy_id,'version_number',v_version.version_number,'title',v_version.title,'description',v_version.description,'content_snapshot',v_version.content_snapshot,'content_hash',v_version.content_hash,'published_at',v_version.published_at,
    'company',jsonb_build_object('id',v_company_id,'name',(select company_name from core.companies where id=v_company_id)),
    'acknowledgments',(select coalesce(jsonb_agg(jsonb_build_object('employee_name',r.full_name,'status',a.status,'reviewed_at',a.reviewed_at,'responded_at',a.responded_at,'response_comment',a.response_comment,'acknowledgment_statement',a.acknowledgment_statement) order by lower(r.full_name)),'[]') from core.company_policy_assignment a join core.company_roster r on r.id=a.roster_id where a.policy_version_id=v_version.id and ((core.is_platform_owner() or core.can_admin_company(v_company_id)) or r.profile_id=core.current_profile_id()))
  );
end $$;

create or replace function public.get_my_company_policy_tasks(p_company_slug text)
returns jsonb language plpgsql stable security definer set search_path=core,public
as $$
declare v_company record; v_roster_id uuid;
begin
  select id,company_name,company_slug into v_company from core.companies where company_slug=p_company_slug;
  if v_company.id is null then raise exception 'Company not found.'; end if;
  select id into v_roster_id from core.company_roster where company_id=v_company.id and profile_id=core.current_profile_id() order by created_at desc limit 1;
  if not (core.is_platform_owner() or core.can_access_company(v_company.id) or v_roster_id is not null) then raise exception 'Company access required.'; end if;
  return jsonb_build_object('company',jsonb_build_object('id',v_company.id,'name',v_company.company_name,'slug',v_company.company_slug),'roster_id',v_roster_id,'tasks',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'rolled_out_at',a.rolled_out_at,'reviewed_at',a.reviewed_at,'responded_at',a.responded_at,'response_comment',a.response_comment,'version',jsonb_build_object('id',v.id,'number',v.version_number,'title',v.title,'description',v.description,'snapshot',v.content_snapshot,'published_at',v.published_at)) order by a.rolled_out_at desc),'[]') from core.company_policy_assignment a join core.company_policy_version v on v.id=a.policy_version_id where a.company_id=v_company.id and a.roster_id=v_roster_id));
end $$;

create or replace function public.respond_to_company_policy(p_company_slug text, p_assignment_id uuid, p_response text, p_comment text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path=core,public
as $$
declare v_company_id uuid; v_assignment core.company_policy_assignment; v_roster_id uuid;
begin
  select id into v_company_id from core.companies where company_slug=p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  select id into v_roster_id from core.company_roster where company_id=v_company_id and profile_id=core.current_profile_id() limit 1;
  select * into v_assignment from core.company_policy_assignment where id=p_assignment_id and company_id=v_company_id and roster_id=v_roster_id for update;
  if v_assignment.id is null then raise exception 'Policy acknowledgment not found.'; end if;
  if p_response not in ('ACKNOWLEDGED','DECLINED') then raise exception 'Choose acknowledge or decline.'; end if;
  update core.company_policy_assignment set status=p_response,response_comment=nullif(btrim(p_comment),''),acknowledgment_statement=case when p_response='ACKNOWLEDGED' then 'I acknowledge that I received, reviewed, and understand this company policy.' else 'I decline to acknowledge this company policy.' end,reviewed_at=coalesce(reviewed_at,now()),responded_at=now(),response_user_agent=p_user_agent where id=p_assignment_id;
  return jsonb_build_object('id',p_assignment_id,'status',p_response,'responded_at',now());
end $$;

revoke all on function public.get_company_policy_workspace(text,uuid) from public;
revoke all on function public.save_company_policy(text,uuid,text,text) from public;
revoke all on function public.manage_company_policy_section(text,uuid,uuid,text,text,text) from public;
revoke all on function public.publish_company_policy(text,uuid) from public;
revoke all on function public.get_company_policy_version(text,uuid) from public;
revoke all on function public.get_my_company_policy_tasks(text) from public;
revoke all on function public.respond_to_company_policy(text,uuid,text,text,text) from public;
grant execute on function public.get_company_policy_workspace(text,uuid),public.save_company_policy(text,uuid,text,text),public.manage_company_policy_section(text,uuid,uuid,text,text,text),public.publish_company_policy(text,uuid),public.get_company_policy_version(text,uuid),public.get_my_company_policy_tasks(text),public.respond_to_company_policy(text,uuid,text,text,text) to authenticated,service_role;
