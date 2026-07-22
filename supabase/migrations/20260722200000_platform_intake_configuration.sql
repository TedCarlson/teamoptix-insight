-- Governed Lines of Business, Insight capabilities, and public workspace intake.

alter table ref.industries add column if not exists description text;

create table if not exists ref.insight_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null unique check (capability_key = lower(capability_key)),
  capability_label text not null check (length(btrim(capability_label)) > 0),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.lob_capability (
  lob_id uuid not null references ref.industries(id) on delete cascade,
  capability_id uuid not null references ref.insight_capabilities(id) on delete cascade,
  primary key (lob_id, capability_id)
);

create table if not exists core.intake_question (
  id uuid primary key default gen_random_uuid(),
  question_key text not null unique check (question_key = lower(question_key)),
  label text not null check (length(btrim(label)) > 0),
  helper_text text,
  placeholder text,
  field_type text not null check (field_type in ('text','email','tel','number','textarea','select','checkbox')),
  is_required boolean not null default false,
  scope text not null default 'shared' check (scope in ('shared','specific')),
  options_json jsonb not null default '[]'::jsonb check (jsonb_typeof(options_json) = 'array'),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.intake_question_lob (
  question_id uuid not null references core.intake_question(id) on delete cascade,
  lob_id uuid not null references ref.industries(id) on delete cascade,
  primary key (question_id, lob_id)
);

create table if not exists core.intake_question_capability (
  question_id uuid not null references core.intake_question(id) on delete cascade,
  capability_id uuid not null references ref.insight_capabilities(id) on delete cascade,
  primary key (question_id, capability_id)
);

create table if not exists core.workspace_request (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  owner_name text not null,
  email text not null,
  phone text,
  status text not null default 'new' check (status in ('new','reviewing','accepted','declined')),
  source text not null default 'foyer',
  configuration_snapshot jsonb not null default '{}'::jsonb,
  notification_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.workspace_request_lob (
  workspace_request_id uuid not null references core.workspace_request(id) on delete cascade,
  lob_id uuid not null references ref.industries(id),
  primary key (workspace_request_id, lob_id)
);

create table if not exists core.workspace_request_capability (
  workspace_request_id uuid not null references core.workspace_request(id) on delete cascade,
  capability_id uuid not null references ref.insight_capabilities(id),
  primary key (workspace_request_id, capability_id)
);

create table if not exists core.workspace_request_answer (
  workspace_request_id uuid not null references core.workspace_request(id) on delete cascade,
  question_id uuid not null references core.intake_question(id),
  answer_json jsonb not null,
  question_snapshot jsonb not null,
  primary key (workspace_request_id, question_id)
);

create index if not exists insight_capabilities_active_order_idx on ref.insight_capabilities(is_active, sort_order);
create index if not exists intake_question_status_order_idx on core.intake_question(status, sort_order);
create index if not exists workspace_request_created_idx on core.workspace_request(created_at desc);

create trigger set_updated_at_on_insight_capabilities before update on ref.insight_capabilities
for each row execute function core.set_updated_at();
create trigger set_updated_at_on_intake_question before update on core.intake_question
for each row execute function core.set_updated_at();
create trigger set_updated_at_on_workspace_request before update on core.workspace_request
for each row execute function core.set_updated_at();

alter table ref.insight_capabilities enable row level security;
alter table core.lob_capability enable row level security;
alter table core.intake_question enable row level security;
alter table core.intake_question_lob enable row level security;
alter table core.intake_question_capability enable row level security;
alter table core.workspace_request enable row level security;
alter table core.workspace_request_lob enable row level security;
alter table core.workspace_request_capability enable row level security;
alter table core.workspace_request_answer enable row level security;

create policy intake_capabilities_owner_all on ref.insight_capabilities for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());
create policy lob_capability_owner_all on core.lob_capability for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());
create policy intake_question_owner_all on core.intake_question for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());
create policy intake_question_lob_owner_all on core.intake_question_lob for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());
create policy intake_question_capability_owner_all on core.intake_question_capability for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());
create policy workspace_request_owner_select on core.workspace_request for select to authenticated using (core.is_platform_owner());
create policy workspace_request_lob_owner_select on core.workspace_request_lob for select to authenticated using (core.is_platform_owner());
create policy workspace_request_capability_owner_select on core.workspace_request_capability for select to authenticated using (core.is_platform_owner());
create policy workspace_request_answer_owner_select on core.workspace_request_answer for select to authenticated using (core.is_platform_owner());

grant select on ref.industries, ref.insight_capabilities to authenticated;
grant select, insert, update, delete on core.lob_capability, core.intake_question, core.intake_question_lob, core.intake_question_capability to authenticated;
grant select on core.workspace_request, core.workspace_request_lob, core.workspace_request_capability, core.workspace_request_answer to authenticated;

create or replace function public.save_line_of_business(p_id uuid,p_key text,p_label text,p_description text,p_is_active boolean,p_sort_order integer)
returns uuid language plpgsql security definer set search_path=public,core,ref as $$
declare v_id uuid;
begin
 if not core.is_platform_owner() then raise exception 'Only Team Optix platform owners can manage lines of business.'; end if;
 insert into ref.industries(id,industry_key,industry_label,description,is_active,sort_order)
 values(coalesce(p_id,gen_random_uuid()),lower(btrim(p_key)),btrim(p_label),nullif(btrim(p_description),''),p_is_active,p_sort_order)
 on conflict(id) do update set industry_key=excluded.industry_key,industry_label=excluded.industry_label,description=excluded.description,is_active=excluded.is_active,sort_order=excluded.sort_order returning id into v_id;
 return v_id;
end $$;
grant execute on function public.save_line_of_business(uuid,text,text,text,boolean,integer) to authenticated;

create or replace function public.save_intake_capability(
  p_id uuid, p_key text, p_label text, p_description text, p_is_active boolean,
  p_sort_order integer, p_lob_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public, core, ref as $$
declare v_id uuid;
begin
  if not core.is_platform_owner() then raise exception 'Only Team Optix platform owners can manage capabilities.'; end if;
  insert into ref.insight_capabilities(id, capability_key, capability_label, description, is_active, sort_order)
  values (coalesce(p_id, gen_random_uuid()), lower(btrim(p_key)), btrim(p_label), nullif(btrim(p_description),''), p_is_active, p_sort_order)
  on conflict (id) do update set capability_key=excluded.capability_key, capability_label=excluded.capability_label,
    description=excluded.description, is_active=excluded.is_active, sort_order=excluded.sort_order returning id into v_id;
  delete from core.lob_capability where capability_id=v_id;
  insert into core.lob_capability(lob_id, capability_id) select unnest(p_lob_ids), v_id on conflict do nothing;
  return v_id;
end $$;

create or replace function public.save_intake_question(
  p_id uuid, p_key text, p_label text, p_helper_text text, p_placeholder text, p_field_type text,
  p_is_required boolean, p_scope text, p_options_json jsonb, p_status text, p_sort_order integer,
  p_lob_ids uuid[] default '{}', p_capability_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public, core, ref as $$
declare v_id uuid;
begin
  if not core.is_platform_owner() then raise exception 'Only Team Optix platform owners can manage intake questions.'; end if;
  insert into core.intake_question(id,question_key,label,helper_text,placeholder,field_type,is_required,scope,options_json,status,sort_order)
  values(coalesce(p_id,gen_random_uuid()),lower(btrim(p_key)),btrim(p_label),nullif(btrim(p_helper_text),''),nullif(btrim(p_placeholder),''),p_field_type,p_is_required,p_scope,coalesce(p_options_json,'[]'),p_status,p_sort_order)
  on conflict(id) do update set question_key=excluded.question_key,label=excluded.label,helper_text=excluded.helper_text,
    placeholder=excluded.placeholder,field_type=excluded.field_type,is_required=excluded.is_required,scope=excluded.scope,
    options_json=excluded.options_json,status=excluded.status,sort_order=excluded.sort_order returning id into v_id;
  delete from core.intake_question_lob where question_id=v_id;
  delete from core.intake_question_capability where question_id=v_id;
  insert into core.intake_question_lob(question_id,lob_id) select v_id,unnest(p_lob_ids) on conflict do nothing;
  insert into core.intake_question_capability(question_id,capability_id) select v_id,unnest(p_capability_ids) on conflict do nothing;
  return v_id;
end $$;

grant execute on function public.save_intake_capability(uuid,text,text,text,boolean,integer,uuid[]) to authenticated;
grant execute on function public.save_intake_question(uuid,text,text,text,text,text,boolean,text,jsonb,text,integer,uuid[],uuid[]) to authenticated;

insert into ref.industries(industry_key,industry_label,is_active,sort_order) values
('utility-locate','Utility Locate',true,10),('logistics','Logistics',true,20),('telecom-fulfillment','Telecom Fulfillment',true,30)
on conflict(industry_key) do update set industry_label=excluded.industry_label;

insert into ref.insight_capabilities(capability_key,capability_label,description,is_active,sort_order) values
('payroll','Payroll','Payroll preparation and operational pay controls.',true,10),
('hr-compliance','HR & Compliance','People, qualification, and compliance workflows.',true,20),
('asset-management','Asset Management','Vehicle, equipment, and asset controls.',true,30),
('time-tracking','Time Tracking','Timekeeping and exception review.',true,40),
('field-reports','Field Reports','Field evidence and operating reports.',true,50),
('dispatch','Dispatch','Planning, assignment, and dispatch execution.',true,60)
on conflict(capability_key) do update set capability_label=excluded.capability_label,description=excluded.description;

insert into core.lob_capability(lob_id,capability_id)
select l.id,c.id from ref.industries l cross join ref.insight_capabilities c
where l.industry_key in ('utility-locate','logistics','telecom-fulfillment') on conflict do nothing;

insert into core.intake_question(question_key,label,helper_text,placeholder,field_type,is_required,scope,status,sort_order) values
('company-name','Company name',null,'Company name','text',true,'shared','active',10),
('owner-name','Owner contact',null,'Your name','text',true,'shared','active',20),
('email','Email',null,'you@company.com','email',true,'shared','active',30),
('phone','Phone',null,'Best phone number','tel',false,'shared','active',40),
('employee-count','Employee count','Approximate active workforce.','How many employees?','number',false,'shared','active',50),
('daily-ticket-volume','Typical daily ticket volume','Average work requests handled each day.','Tickets per day','number',false,'specific','active',100),
('current-payroll-provider','Current payroll provider',null,'Provider or current process','text',false,'specific','active',110),
('current-dispatch-process','Current dispatch process',null,'Describe today''s dispatch process','textarea',false,'specific','active',120)
on conflict(question_key) do nothing;

insert into core.intake_question_lob(question_id,lob_id)
select q.id,l.id from core.intake_question q join ref.industries l on l.industry_key in ('utility-locate','telecom-fulfillment')
where q.question_key='daily-ticket-volume' on conflict do nothing;
insert into core.intake_question_capability(question_id,capability_id)
select q.id,c.id from core.intake_question q join ref.insight_capabilities c on
  (q.question_key='current-payroll-provider' and c.capability_key='payroll') or
  (q.question_key='current-dispatch-process' and c.capability_key='dispatch') on conflict do nothing;
