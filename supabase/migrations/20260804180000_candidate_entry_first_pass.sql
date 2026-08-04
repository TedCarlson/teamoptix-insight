begin;

-- This domain is deliberately separate from public.hiring_invite_token.
-- hiring_invite_token remains the roster -> authenticated app onboarding bridge.

create table if not exists core.candidate_entry_link (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  entry_code text not null unique,
  link_type text not null,
  label text not null,
  referrer_profile_id uuid references core.profiles(id) on delete set null,
  role_key text,
  location_key text,
  assignment_key text,
  scheduling_policy text not null default 'required',
  bypass_reason text,
  status text not null default 'active',
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_entry_link_type_ck check (
    link_type in ('company_general', 'company_invite', 'member_referral')
  ),
  constraint candidate_entry_link_scheduling_ck check (
    scheduling_policy in ('required', 'offered', 'bypassed')
  ),
  constraint candidate_entry_link_status_ck check (
    status in ('active', 'revoked', 'expired')
  ),
  constraint candidate_entry_link_uses_ck check (
    max_uses is null or max_uses > 0
  ),
  constraint candidate_entry_link_bypass_ck check (
    scheduling_policy <> 'bypassed'
    or (link_type = 'company_invite' and nullif(btrim(coalesce(bypass_reason, '')), '') is not null)
  )
);

create unique index if not exists candidate_entry_link_general_company_uk
  on core.candidate_entry_link (company_id)
  where link_type = 'company_general' and status = 'active';

create table if not exists core.candidate_application (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies(id) on delete set null,
  profile_id uuid references core.profiles(id) on delete set null,
  roster_id uuid references core.company_roster(id) on delete set null,
  entry_link_id uuid references core.candidate_entry_link(id) on delete set null,
  source_type text not null default 'organic',
  referrer_profile_id uuid references core.profiles(id) on delete set null,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  role_interest text,
  location_interest text,
  assignment_key text,
  work_history text,
  application_status text not null default 'submitted',
  association_status text not null default 'unassociated',
  scheduling_policy text not null default 'required',
  workflow_snapshot jsonb not null default '{}'::jsonb,
  claim_token_hash text,
  claim_expires_at timestamptz,
  claimed_at timestamptz,
  consent_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_application_source_ck check (
    source_type in ('organic', 'company_link', 'company_invite', 'member_referral')
  ),
  constraint candidate_application_status_ck check (
    application_status in (
      'submitted', 'in_review', 'interview_pending', 'interview_scheduled',
      'requirements', 'advanced', 'declined', 'withdrawn'
    )
  ),
  constraint candidate_application_association_ck check (
    association_status in ('unassociated', 'targeted', 'claimed', 'rostered')
  ),
  constraint candidate_application_scheduling_ck check (
    scheduling_policy in ('required', 'offered', 'bypassed')
  ),
  constraint candidate_application_email_ck check (length(btrim(email)) > 0),
  constraint candidate_application_name_ck check (
    length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0
  )
);

create index if not exists candidate_application_company_status_idx
  on core.candidate_application (company_id, application_status, submitted_at desc);
create index if not exists candidate_application_profile_idx
  on core.candidate_application (profile_id, submitted_at desc);
create index if not exists candidate_application_email_idx
  on core.candidate_application (lower(email));

create table if not exists core.candidate_requirement_definition (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  company_id uuid references core.companies(id) on delete cascade,
  industry_id uuid references ref.industries(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text,
  category text not null,
  phase text not null,
  evidence_type text,
  role_key text,
  location_key text,
  assignment_key text,
  worker_type text,
  is_required boolean not null default true,
  is_blocking boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  source_url text,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_requirement_definition_scope_ck check (
    scope_type in ('generic', 'industry', 'company')
  ),
  constraint candidate_requirement_definition_scope_target_ck check (
    (scope_type = 'generic' and company_id is null and industry_id is null)
    or (scope_type = 'industry' and company_id is null and industry_id is not null)
    or (scope_type = 'company' and company_id is not null and industry_id is null)
  ),
  constraint candidate_requirement_definition_phase_ck check (
    phase in ('application', 'interview', 'finalist', 'pre_assignment', 'onboarding')
  )
);

create unique index if not exists candidate_requirement_definition_scope_uk
  on core.candidate_requirement_definition (
    scope_type,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(industry_id, '00000000-0000-0000-0000-000000000000'::uuid),
    requirement_key,
    coalesce(role_key, ''),
    coalesce(location_key, ''),
    coalesce(assignment_key, ''),
    coalesce(worker_type, '')
  );

create table if not exists core.candidate_application_requirement (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references core.candidate_application(id) on delete cascade,
  company_id uuid references core.companies(id) on delete cascade,
  definition_id uuid references core.candidate_requirement_definition(id) on delete set null,
  requirement_key text not null,
  label text not null,
  description text,
  category text not null,
  phase text not null,
  evidence_type text,
  source_scope text not null,
  is_required boolean not null default true,
  is_blocking boolean not null default true,
  requirement_status text not null default 'not_started',
  candidate_note text,
  reviewer_note text,
  due_at timestamptz,
  completed_at timestamptz,
  reviewed_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_application_requirement_status_ck check (
    requirement_status in ('not_started', 'in_progress', 'submitted', 'accepted', 'needs_correction', 'waived')
  ),
  unique (application_id, requirement_key)
);

create table if not exists core.candidate_interview_slot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  interviewer_profile_id uuid references core.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/New_York',
  slot_status text not null default 'open',
  meeting_provider text not null default 'insight',
  meeting_url text,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_interview_slot_time_ck check (ends_at > starts_at),
  constraint candidate_interview_slot_status_ck check (
    slot_status in ('open', 'held', 'booked', 'blocked', 'cancelled')
  ),
  constraint candidate_interview_slot_provider_ck check (
    meeting_provider in ('insight', 'google_meet', 'microsoft_teams', 'phone', 'in_person')
  )
);

create index if not exists candidate_interview_slot_company_time_idx
  on core.candidate_interview_slot (company_id, starts_at)
  where slot_status = 'open';

create table if not exists core.candidate_interview (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references core.candidate_application(id) on delete cascade,
  company_id uuid references core.companies(id) on delete cascade,
  slot_id uuid references core.candidate_interview_slot(id) on delete set null,
  interviewer_profile_id uuid references core.profiles(id) on delete set null,
  interview_type text not null default 'introductory',
  interview_status text not null default 'scheduled',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'America/New_York',
  meeting_provider text not null default 'insight',
  meeting_url text,
  bypass_reason text,
  outcome text,
  next_step text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_interview_status_ck check (
    interview_status in ('scheduling_required', 'scheduled', 'completed', 'candidate_no_show', 'cancelled', 'bypassed')
  ),
  constraint candidate_interview_outcome_ck check (
    outcome is null or outcome in ('advance', 'more_information', 'another_interview', 'hold', 'decline', 'withdrawn')
  )
);

create index if not exists candidate_interview_company_time_idx
  on core.candidate_interview (company_id, starts_at);

drop trigger if exists set_updated_at_on_candidate_entry_link on core.candidate_entry_link;
create trigger set_updated_at_on_candidate_entry_link
before update on core.candidate_entry_link
for each row execute function core.set_updated_at();

drop trigger if exists set_updated_at_on_candidate_application on core.candidate_application;
create trigger set_updated_at_on_candidate_application
before update on core.candidate_application
for each row execute function core.set_updated_at();

drop trigger if exists set_updated_at_on_candidate_requirement_definition on core.candidate_requirement_definition;
create trigger set_updated_at_on_candidate_requirement_definition
before update on core.candidate_requirement_definition
for each row execute function core.set_updated_at();

drop trigger if exists set_updated_at_on_candidate_application_requirement on core.candidate_application_requirement;
create trigger set_updated_at_on_candidate_application_requirement
before update on core.candidate_application_requirement
for each row execute function core.set_updated_at();

drop trigger if exists set_updated_at_on_candidate_interview_slot on core.candidate_interview_slot;
create trigger set_updated_at_on_candidate_interview_slot
before update on core.candidate_interview_slot
for each row execute function core.set_updated_at();

drop trigger if exists set_updated_at_on_candidate_interview on core.candidate_interview;
create trigger set_updated_at_on_candidate_interview
before update on core.candidate_interview
for each row execute function core.set_updated_at();

alter table core.candidate_entry_link enable row level security;
alter table core.candidate_application enable row level security;
alter table core.candidate_requirement_definition enable row level security;
alter table core.candidate_application_requirement enable row level security;
alter table core.candidate_interview_slot enable row level security;
alter table core.candidate_interview enable row level security;

create policy candidate_entry_link_select_company
on core.candidate_entry_link for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));
create policy candidate_entry_link_insert_admin
on core.candidate_entry_link for insert to authenticated
with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy candidate_entry_link_update_admin
on core.candidate_entry_link for update to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy candidate_entry_link_delete_admin
on core.candidate_entry_link for delete to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id));

create policy candidate_application_select_owner_or_company
on core.candidate_application for select to authenticated
using (
  core.is_platform_owner()
  or profile_id = core.current_profile_id()
  or (company_id is not null and core.can_access_company(company_id))
);
create policy candidate_application_update_admin
on core.candidate_application for update to authenticated
using (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)))
with check (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)));

create policy candidate_requirement_definition_select_config
on core.candidate_requirement_definition for select to authenticated
using (
  core.is_platform_owner()
  or scope_type in ('generic', 'industry')
  or (company_id is not null and core.can_access_company(company_id))
);
create policy candidate_requirement_definition_insert_admin
on core.candidate_requirement_definition for insert to authenticated
with check (
  core.is_platform_owner()
  or (scope_type = 'company' and company_id is not null and core.can_admin_company(company_id))
);
create policy candidate_requirement_definition_update_admin
on core.candidate_requirement_definition for update to authenticated
using (
  core.is_platform_owner()
  or (scope_type = 'company' and company_id is not null and core.can_admin_company(company_id))
)
with check (
  core.is_platform_owner()
  or (scope_type = 'company' and company_id is not null and core.can_admin_company(company_id))
);
create policy candidate_requirement_definition_delete_admin
on core.candidate_requirement_definition for delete to authenticated
using (
  core.is_platform_owner()
  or (scope_type = 'company' and company_id is not null and core.can_admin_company(company_id))
);

create policy candidate_application_requirement_select_owner_or_company
on core.candidate_application_requirement for select to authenticated
using (
  core.is_platform_owner()
  or exists (
    select 1 from core.candidate_application application
    where application.id = application_id
      and (
        application.profile_id = core.current_profile_id()
        or (application.company_id is not null and core.can_access_company(application.company_id))
      )
  )
);
create policy candidate_application_requirement_update_admin
on core.candidate_application_requirement for update to authenticated
using (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)))
with check (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)));

create policy candidate_interview_slot_select_company
on core.candidate_interview_slot for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));
create policy candidate_interview_slot_insert_admin
on core.candidate_interview_slot for insert to authenticated
with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy candidate_interview_slot_update_admin
on core.candidate_interview_slot for update to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy candidate_interview_slot_delete_admin
on core.candidate_interview_slot for delete to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id));

create policy candidate_interview_select_owner_or_company
on core.candidate_interview for select to authenticated
using (
  core.is_platform_owner()
  or exists (
    select 1 from core.candidate_application application
    where application.id = application_id
      and (
        application.profile_id = core.current_profile_id()
        or (application.company_id is not null and core.can_access_company(application.company_id))
      )
  )
);
create policy candidate_interview_update_admin
on core.candidate_interview for update to authenticated
using (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)))
with check (core.is_platform_owner() or (company_id is not null and core.can_admin_company(company_id)));

create or replace view public.candidate_entry_links_v
with (security_invoker = true) as
select
  link.id,
  link.company_id,
  company.company_name,
  company.company_slug,
  link.entry_code,
  link.link_type,
  link.label,
  link.referrer_profile_id,
  link.role_key,
  link.location_key,
  link.assignment_key,
  link.scheduling_policy,
  link.bypass_reason,
  link.status,
  link.expires_at,
  link.max_uses,
  link.use_count,
  link.created_at,
  link.updated_at
from core.candidate_entry_link link
join core.companies company on company.id = link.company_id;

create or replace view public.candidate_applications_v
with (security_invoker = true) as
select
  application.*,
  company.company_name,
  company.company_slug,
  link.link_type,
  link.label as entry_label
from core.candidate_application application
left join core.companies company on company.id = application.company_id
left join core.candidate_entry_link link on link.id = application.entry_link_id;

create or replace view public.candidate_requirement_definitions_v
with (security_invoker = true) as
select
  definition.*,
  company.company_name,
  company.company_slug,
  industry.industry_label
from core.candidate_requirement_definition definition
left join core.companies company on company.id = definition.company_id
left join ref.industries industry on industry.id = definition.industry_id;

create or replace view public.candidate_application_requirements_v
with (security_invoker = true) as
select * from core.candidate_application_requirement;

create or replace view public.candidate_interview_slots_v
with (security_invoker = true) as
select
  slot.*,
  coalesce(profile.display_name, concat_ws(' ', profile.first_name, profile.last_name)) as interviewer_name
from core.candidate_interview_slot slot
left join core.profiles profile on profile.id = slot.interviewer_profile_id;

create or replace view public.candidate_interviews_v
with (security_invoker = true) as
select
  interview.*,
  application.first_name,
  application.last_name,
  application.email,
  application.role_interest,
  application.source_type,
  coalesce(profile.display_name, concat_ws(' ', profile.first_name, profile.last_name)) as interviewer_name
from core.candidate_interview interview
join core.candidate_application application on application.id = interview.application_id
left join core.profiles profile on profile.id = interview.interviewer_profile_id;

grant select on core.candidate_entry_link to authenticated, service_role;
grant select on core.candidate_application to authenticated, service_role;
grant select on core.candidate_requirement_definition to authenticated, service_role;
grant select on core.candidate_application_requirement to authenticated, service_role;
grant select on core.candidate_interview_slot to authenticated, service_role;
grant select on core.candidate_interview to authenticated, service_role;

grant select on public.candidate_entry_links_v to authenticated, service_role;
grant select on public.candidate_applications_v to authenticated, service_role;
grant select on public.candidate_requirement_definitions_v to authenticated, service_role;
grant select on public.candidate_application_requirements_v to authenticated, service_role;
grant select on public.candidate_interview_slots_v to authenticated, service_role;
grant select on public.candidate_interviews_v to authenticated, service_role;

insert into core.candidate_requirement_definition (
  scope_type, requirement_key, label, description, category, phase,
  evidence_type, is_required, is_blocking, sort_order
)
values
  ('generic', 'profile_details', 'Profile details', 'Confirm contact information and the role or work you are pursuing.', 'Application', 'application', 'profile', true, true, 10),
  ('generic', 'work_history', 'Work history or résumé', 'Provide a résumé or equivalent structured work history.', 'Application', 'application', 'document_or_profile', true, true, 20),
  ('generic', 'background_authorization', 'Background screening authorization', 'Complete only when requested for the role and jurisdiction.', 'Screening', 'finalist', 'authorization', false, false, 70),
  ('generic', 'employment_documents', 'Employment or contractor onboarding documents', 'Complete the documents required for the final worker classification and jurisdiction.', 'Onboarding', 'onboarding', 'form', false, false, 100)
on conflict do nothing;

create or replace function public.get_candidate_foyer_experience(
  p_company_slug text default null,
  p_entry_code text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = core, public, ref
as $$
declare
  v_company core.companies%rowtype;
  v_link core.candidate_entry_link%rowtype;
  v_industry_label text;
  v_requirements jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_source_type text := 'organic';
  v_scheduling_policy text := 'required';
begin
  if nullif(btrim(coalesce(p_entry_code, '')), '') is not null then
    select * into v_link
    from core.candidate_entry_link
    where entry_code = btrim(p_entry_code)
      and status = 'active'
      and (expires_at is null or expires_at > now())
      and (max_uses is null or use_count < max_uses)
    limit 1;

    if v_link.id is null then
      raise exception 'Candidate entry link is invalid or no longer active.';
    end if;

    select * into v_company from core.companies where id = v_link.company_id;
    v_source_type := case v_link.link_type
      when 'company_general' then 'company_link'
      when 'company_invite' then 'company_invite'
      when 'member_referral' then 'member_referral'
      else 'company_link'
    end;
    v_scheduling_policy := v_link.scheduling_policy;
  elsif nullif(btrim(coalesce(p_company_slug, '')), '') is not null then
    select * into v_company
    from core.companies
    where company_slug = lower(btrim(p_company_slug))
    limit 1;

    if v_company.id is null then
      raise exception 'Company not found.';
    end if;

    select * into v_link
    from core.candidate_entry_link
    where company_id = v_company.id
      and link_type = 'company_general'
      and status = 'active'
    order by created_at desc
    limit 1;

    v_source_type := 'company_link';
    v_scheduling_policy := coalesce(v_link.scheduling_policy, 'required');
  end if;

  if v_company.id is not null and v_company.company_status <> 'active' then
    raise exception 'Company candidate entry is not active.';
  end if;

  if v_company.primary_industry_id is not null then
    select industry_label into v_industry_label
    from ref.industries
    where id = v_company.primary_industry_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(requirement) order by requirement.sort_order), '[]'::jsonb)
  into v_requirements
  from (
    select distinct on (definition.requirement_key)
      definition.requirement_key,
      definition.label,
      definition.description,
      definition.category,
      definition.phase,
      definition.evidence_type,
      definition.is_required,
      definition.is_blocking,
      definition.scope_type as source_scope,
      definition.sort_order
    from core.candidate_requirement_definition definition
    where definition.is_active = true
      and (
        definition.scope_type = 'generic'
        or (definition.scope_type = 'industry' and definition.industry_id = v_company.primary_industry_id)
        or (definition.scope_type = 'company' and definition.company_id = v_company.id)
      )
      and (definition.role_key is null or definition.role_key = v_link.role_key)
      and (definition.location_key is null or definition.location_key = v_link.location_key)
      and (definition.assignment_key is null or definition.assignment_key = v_link.assignment_key)
    order by
      definition.requirement_key,
      case definition.scope_type when 'company' then 3 when 'industry' then 2 else 1 end desc,
      definition.sort_order
  ) requirement;

  if v_company.id is not null then
    select coalesce(jsonb_agg(to_jsonb(slot) order by slot.starts_at), '[]'::jsonb)
    into v_slots
    from (
      select
        interview_slot.id,
        interview_slot.starts_at,
        interview_slot.ends_at,
        interview_slot.timezone,
        interview_slot.meeting_provider
      from core.candidate_interview_slot interview_slot
      where interview_slot.company_id = v_company.id
        and interview_slot.slot_status = 'open'
        and interview_slot.starts_at > now()
        and interview_slot.starts_at < now() + interval '45 days'
      order by interview_slot.starts_at
      limit 40
    ) slot;
  end if;

  return jsonb_build_object(
    'entry', jsonb_build_object(
      'id', v_link.id,
      'entry_code', v_link.entry_code,
      'link_type', v_link.link_type,
      'label', v_link.label,
      'source_type', v_source_type,
      'role_key', v_link.role_key,
      'location_key', v_link.location_key,
      'assignment_key', v_link.assignment_key,
      'scheduling_policy', v_scheduling_policy,
      'bypass_reason', v_link.bypass_reason
    ),
    'company', case when v_company.id is null then null else jsonb_build_object(
      'id', v_company.id,
      'name', v_company.company_name,
      'slug', v_company.company_slug,
      'logo_url', v_company.logo_url,
      'industry_id', v_company.primary_industry_id,
      'industry_label', v_industry_label
    ) end,
    'requirements', v_requirements,
    'interview_slots', v_slots
  );
end;
$$;

create or replace function public.create_candidate_entry_link(
  p_company_slug text,
  p_link_type text,
  p_label text,
  p_role_key text default null,
  p_location_key text default null,
  p_assignment_key text default null,
  p_scheduling_policy text default 'required',
  p_bypass_reason text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company core.companies%rowtype;
  v_profile_id uuid := core.current_profile_id();
  v_link core.candidate_entry_link%rowtype;
  v_code text;
begin
  select * into v_company from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company.id)) then
    raise exception 'Forbidden.';
  end if;

  if p_link_type not in ('company_general', 'company_invite', 'member_referral') then
    raise exception 'Unsupported entry link type.';
  end if;
  if p_scheduling_policy = 'bypassed' and p_link_type <> 'company_invite' then
    raise exception 'Only a candidate-specific company invitation may bypass the interview.';
  end if;

  if p_link_type = 'company_general' then
    select * into v_link
    from core.candidate_entry_link
    where company_id = v_company.id and link_type = 'company_general' and status = 'active'
    order by created_at desc limit 1;
    if v_link.id is not null then return to_jsonb(v_link); end if;
    v_code := v_company.company_slug;
  else
    v_code := encode(gen_random_bytes(18), 'hex');
  end if;

  insert into core.candidate_entry_link (
    company_id, entry_code, link_type, label, referrer_profile_id,
    role_key, location_key, assignment_key, scheduling_policy, bypass_reason,
    expires_at, max_uses, created_by_profile_id
  ) values (
    v_company.id, v_code, p_link_type,
    coalesce(nullif(btrim(p_label), ''), initcap(replace(p_link_type, '_', ' '))),
    case when p_link_type = 'member_referral' then v_profile_id else null end,
    nullif(btrim(coalesce(p_role_key, '')), ''),
    nullif(btrim(coalesce(p_location_key, '')), ''),
    nullif(btrim(coalesce(p_assignment_key, '')), ''),
    p_scheduling_policy,
    nullif(btrim(coalesce(p_bypass_reason, '')), ''),
    p_expires_at,
    case when p_link_type = 'company_invite' then coalesce(p_max_uses, 1) else p_max_uses end,
    v_profile_id
  ) returning * into v_link;

  return to_jsonb(v_link);
end;
$$;

create or replace function public.submit_candidate_foyer_application(
  p_company_slug text,
  p_entry_code text,
  p_profile_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_role_interest text,
  p_location_interest text,
  p_assignment_key text,
  p_work_history text,
  p_interview_slot_id uuid,
  p_timezone text
) returns jsonb
language plpgsql
security definer
set search_path = core, public, ref
as $$
declare
  v_experience jsonb;
  v_company_id uuid;
  v_industry_id uuid;
  v_link core.candidate_entry_link%rowtype;
  v_source_type text := 'organic';
  v_scheduling_policy text := 'required';
  v_claim_token text := encode(gen_random_bytes(24), 'hex');
  v_application core.candidate_application%rowtype;
  v_slot core.candidate_interview_slot%rowtype;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null
     or nullif(btrim(coalesce(p_first_name, '')), '') is null
     or nullif(btrim(coalesce(p_last_name, '')), '') is null then
    raise exception 'Email, first name, and last name are required.';
  end if;

  v_experience := public.get_candidate_foyer_experience(p_company_slug, p_entry_code);
  v_company_id := nullif(v_experience #>> '{company,id}', '')::uuid;
  v_industry_id := nullif(v_experience #>> '{company,industry_id}', '')::uuid;
  v_source_type := coalesce(v_experience #>> '{entry,source_type}', 'organic');
  v_scheduling_policy := coalesce(v_experience #>> '{entry,scheduling_policy}', 'required');

  if nullif(v_experience #>> '{entry,id}', '') is not null then
    select * into v_link
    from core.candidate_entry_link
    where id = (v_experience #>> '{entry,id}')::uuid
    for update;
  end if;

  if p_profile_id is not null and not exists (
    select 1 from core.profiles
    where id = p_profile_id and lower(email) = lower(btrim(p_email))
  ) then
    raise exception 'Authenticated profile does not match the application email.';
  end if;

  insert into core.candidate_application (
    company_id, profile_id, entry_link_id, source_type, referrer_profile_id,
    email, first_name, last_name, phone, role_interest, location_interest,
    assignment_key, work_history, application_status, association_status,
    scheduling_policy, workflow_snapshot, claim_token_hash, claim_expires_at,
    claimed_at, consent_at
  ) values (
    v_company_id, p_profile_id, v_link.id, v_source_type, v_link.referrer_profile_id,
    lower(btrim(p_email)), btrim(p_first_name), btrim(p_last_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    coalesce(nullif(btrim(coalesce(p_role_interest, '')), ''), v_link.role_key),
    coalesce(nullif(btrim(coalesce(p_location_interest, '')), ''), v_link.location_key),
    coalesce(nullif(btrim(coalesce(p_assignment_key, '')), ''), v_link.assignment_key),
    nullif(btrim(coalesce(p_work_history, '')), ''),
    case
      when v_scheduling_policy = 'bypassed' then 'requirements'
      when p_interview_slot_id is not null then 'interview_scheduled'
      else 'interview_pending'
    end,
    case when p_profile_id is not null then 'claimed' when v_company_id is not null then 'targeted' else 'unassociated' end,
    v_scheduling_policy,
    v_experience,
    encode(digest(v_claim_token, 'sha256'), 'hex'),
    now() + interval '14 days',
    case when p_profile_id is not null then now() else null end,
    now()
  ) returning * into v_application;

  insert into core.candidate_application_requirement (
    application_id, company_id, definition_id, requirement_key, label,
    description, category, phase, evidence_type, source_scope,
    is_required, is_blocking
  )
  select
    v_application.id,
    v_company_id,
    resolved.id,
    resolved.requirement_key,
    resolved.label,
    resolved.description,
    resolved.category,
    resolved.phase,
    resolved.evidence_type,
    resolved.scope_type,
    resolved.is_required,
    resolved.is_blocking
  from (
    select distinct on (definition.requirement_key) definition.*
    from core.candidate_requirement_definition definition
    where definition.is_active = true
      and (
        definition.scope_type = 'generic'
        or (definition.scope_type = 'industry' and definition.industry_id = v_industry_id)
        or (definition.scope_type = 'company' and definition.company_id = v_company_id)
      )
      and (definition.role_key is null or definition.role_key = v_application.role_interest)
      and (definition.location_key is null or definition.location_key = v_application.location_interest)
      and (definition.assignment_key is null or definition.assignment_key = v_application.assignment_key)
      and (definition.worker_type is null or definition.worker_type = 'contractor')
    order by
      definition.requirement_key,
      case definition.scope_type when 'company' then 3 when 'industry' then 2 else 1 end desc,
      definition.sort_order
  ) resolved;

  if v_scheduling_policy = 'bypassed' then
    insert into core.candidate_interview (
      application_id, company_id, interview_status, bypass_reason, next_step
    ) values (
      v_application.id, v_company_id, 'bypassed', v_link.bypass_reason,
      coalesce(v_link.metadata->>'next_step', 'Continue with the company-defined next step.')
    );
  elsif p_interview_slot_id is not null then
    select * into v_slot
    from core.candidate_interview_slot
    where id = p_interview_slot_id
      and company_id = v_company_id
      and slot_status = 'open'
      and starts_at > now()
    for update;

    if v_slot.id is null then raise exception 'The selected interview time is no longer available.'; end if;

    update core.candidate_interview_slot set slot_status = 'booked' where id = v_slot.id;
    insert into core.candidate_interview (
      application_id, company_id, slot_id, interviewer_profile_id,
      interview_status, starts_at, ends_at, timezone, meeting_provider, meeting_url
    ) values (
      v_application.id, v_company_id, v_slot.id, v_slot.interviewer_profile_id,
      'scheduled', v_slot.starts_at, v_slot.ends_at,
      coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), v_slot.timezone),
      v_slot.meeting_provider, v_slot.meeting_url
    );
  else
    insert into core.candidate_interview (
      application_id, company_id, interview_status, timezone
    ) values (
      v_application.id, v_company_id, 'scheduling_required',
      coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York')
    );
  end if;

  if v_link.id is not null then
    update core.candidate_entry_link
    set use_count = use_count + 1,
        status = case when max_uses is not null and use_count + 1 >= max_uses then 'expired' else status end
    where id = v_link.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'application_id', v_application.id,
    'claim_token', v_claim_token,
    'profile_linked', p_profile_id is not null,
    'company_id', v_company_id,
    'application_status', v_application.application_status,
    'scheduling_policy', v_scheduling_policy
  );
end;
$$;

create or replace function public.claim_candidate_foyer_application(
  p_application_id uuid,
  p_claim_token text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_profile core.profiles%rowtype;
  v_application core.candidate_application%rowtype;
begin
  select * into v_profile from core.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then raise exception 'Authenticated profile required.'; end if;

  select * into v_application
  from core.candidate_application
  where id = p_application_id
  for update;

  if v_application.id is null then raise exception 'Application not found.'; end if;
  if v_application.profile_id is not null and v_application.profile_id <> v_profile.id then
    raise exception 'Application is already linked to another profile.';
  end if;
  if lower(v_application.email) <> lower(v_profile.email) then
    raise exception 'Profile email does not match the application.';
  end if;
  if v_application.claim_expires_at < now()
     or v_application.claim_token_hash <> encode(digest(coalesce(p_claim_token, ''), 'sha256'), 'hex') then
    raise exception 'Application claim is invalid or expired.';
  end if;

  update core.candidate_application
  set profile_id = v_profile.id,
      association_status = 'claimed',
      claimed_at = now(),
      claim_token_hash = null,
      claim_expires_at = null
  where id = v_application.id;

  return jsonb_build_object('ok', true, 'application_id', v_application.id, 'profile_id', v_profile.id);
end;
$$;

create or replace function public.create_candidate_interview_slot(
  p_company_slug text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_meeting_provider text,
  p_meeting_url text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_slot core.candidate_interview_slot%rowtype;
begin
  select id into v_company_id from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Forbidden.'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Interview end must be after start.'; end if;

  insert into core.candidate_interview_slot (
    company_id, interviewer_profile_id, starts_at, ends_at, timezone,
    meeting_provider, meeting_url, created_by_profile_id
  ) values (
    v_company_id, core.current_profile_id(), p_starts_at, p_ends_at,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York'),
    coalesce(nullif(btrim(coalesce(p_meeting_provider, '')), ''), 'insight'),
    nullif(btrim(coalesce(p_meeting_url, '')), ''), core.current_profile_id()
  ) returning * into v_slot;

  return to_jsonb(v_slot);
end;
$$;

create or replace function public.upsert_company_candidate_requirement(
  p_company_slug text,
  p_requirement_key text,
  p_label text,
  p_description text,
  p_category text,
  p_phase text,
  p_evidence_type text,
  p_role_key text,
  p_location_key text,
  p_assignment_key text,
  p_is_required boolean,
  p_is_blocking boolean,
  p_source_url text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_definition core.candidate_requirement_definition%rowtype;
begin
  select id into v_company_id from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Forbidden.'; end if;

  select * into v_definition
  from core.candidate_requirement_definition
  where scope_type = 'company'
    and company_id = v_company_id
    and requirement_key = lower(btrim(p_requirement_key))
    and coalesce(role_key, '') = coalesce(nullif(btrim(coalesce(p_role_key, '')), ''), '')
    and coalesce(location_key, '') = coalesce(nullif(btrim(coalesce(p_location_key, '')), ''), '')
    and coalesce(assignment_key, '') = coalesce(nullif(btrim(coalesce(p_assignment_key, '')), ''), '')
  limit 1;

  if v_definition.id is null then
    insert into core.candidate_requirement_definition (
      scope_type, company_id, requirement_key, label, description, category,
      phase, evidence_type, role_key, location_key, assignment_key,
      is_required, is_blocking, source_url, created_by_profile_id
    ) values (
      'company', v_company_id, lower(btrim(p_requirement_key)), btrim(p_label),
      nullif(btrim(coalesce(p_description, '')), ''), btrim(p_category), p_phase,
      nullif(btrim(coalesce(p_evidence_type, '')), ''),
      nullif(btrim(coalesce(p_role_key, '')), ''),
      nullif(btrim(coalesce(p_location_key, '')), ''),
      nullif(btrim(coalesce(p_assignment_key, '')), ''),
      coalesce(p_is_required, true), coalesce(p_is_blocking, true),
      nullif(btrim(coalesce(p_source_url, '')), ''), core.current_profile_id()
    ) returning * into v_definition;
  else
    update core.candidate_requirement_definition
    set label = btrim(p_label),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        category = btrim(p_category),
        phase = p_phase,
        evidence_type = nullif(btrim(coalesce(p_evidence_type, '')), ''),
        is_required = coalesce(p_is_required, true),
        is_blocking = coalesce(p_is_blocking, true),
        source_url = nullif(btrim(coalesce(p_source_url, '')), ''),
        is_active = true
    where id = v_definition.id
    returning * into v_definition;
  end if;

  return to_jsonb(v_definition);
end;
$$;

create or replace function public.advance_candidate_application_to_roster(
  p_company_slug text,
  p_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_application core.candidate_application%rowtype;
  v_stage_type_id uuid;
  v_roster_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Forbidden.'; end if;

  select * into v_application
  from core.candidate_application
  where id = p_application_id and company_id = v_company_id
  for update;
  if v_application.id is null then raise exception 'Application not found.'; end if;
  if v_application.roster_id is not null then
    return jsonb_build_object('ok', true, 'application_id', v_application.id, 'roster_id', v_application.roster_id);
  end if;

  select stage_type_id into v_stage_type_id
  from public.company_candidate_stage_config_v
  where company_id = v_company_id and stage_key = 'candidate_created' and is_enabled = true
  limit 1;
  if v_stage_type_id is null then raise exception 'Candidate stage seed missing.'; end if;

  insert into core.company_roster (
    company_id, profile_id, full_name, email, phone, worker_type, market_code,
    employment_status, invite_status, compliance_summary, notes
  ) values (
    v_company_id, null,
    concat_ws(' ', v_application.first_name, v_application.last_name),
    v_application.email, v_application.phone, v_application.role_interest,
    v_application.location_interest, 'Candidate', 'Not Invited', 'Missing',
    'Created from Foyer candidate application ' || v_application.id::text
  ) returning id into v_roster_id;

  insert into core.roster_candidate_stage (company_id, roster_id, stage_type_id, note)
  values (v_company_id, v_roster_id, v_stage_type_id, 'Advanced from the Foyer application inbox.');

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail, event_metadata, occurred_at
  ) values (
    v_company_id, v_roster_id, 'hiring', 'foyer_application_advanced',
    'Foyer candidate application advanced into the company hiring roster.',
    jsonb_build_object('application_id', v_application.id, 'source_type', v_application.source_type), now()
  );

  update core.candidate_application
  set roster_id = v_roster_id,
      application_status = 'advanced',
      association_status = 'rostered'
  where id = v_application.id;

  return jsonb_build_object('ok', true, 'application_id', v_application.id, 'roster_id', v_roster_id);
end;
$$;

-- Tighten the legacy email bridge without blocking existing business-first or app-first onboarding:
-- uninvited Candidate roster rows are no longer linked merely because the email matches.
create or replace function core.ensure_access_context() returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_profile core.profiles;
  v_roster core.company_roster;
  v_first_name text;
  v_last_name text;
  v_display_name text;
begin
  if v_auth_user_id is null then return; end if;

  select lower(email) into v_email from auth.users where id = v_auth_user_id;
  if v_email is null then return; end if;

  select * into v_roster
  from core.company_roster
  where lower(email) = v_email
    and (employment_status <> 'Candidate' or invite_status in ('Invited', 'Accepted', 'Linked'))
  order by
    case employment_status when 'Active' then 0 when 'Trainee' then 1 when 'Candidate' then 2 else 3 end,
    created_at desc
  limit 1;

  v_display_name := coalesce(nullif(v_roster.full_name, ''), split_part(v_email, '@', 1));
  v_first_name := coalesce(nullif(split_part(v_display_name, ' ', 1), ''), split_part(v_email, '@', 1));
  v_last_name := coalesce(nullif(regexp_replace(v_display_name, '^\S+\s*', ''), ''), 'User');

  select * into v_profile from core.profiles where auth_user_id = v_auth_user_id limit 1;

  if v_profile.id is null then
    insert into core.profiles (
      auth_user_id, email, first_name, last_name, display_name,
      mobile_phone, profile_status, is_platform_owner
    ) values (
      v_auth_user_id, v_email, v_first_name, v_last_name, v_display_name,
      v_roster.phone, 'active', false
    ) returning * into v_profile;
  else
    update core.profiles
    set email = coalesce(core.profiles.email, v_email),
        first_name = coalesce(core.profiles.first_name, v_first_name),
        last_name = coalesce(core.profiles.last_name, v_last_name),
        display_name = coalesce(core.profiles.display_name, v_display_name),
        mobile_phone = coalesce(core.profiles.mobile_phone, v_roster.phone),
        profile_status = coalesce(core.profiles.profile_status, 'active'),
        updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  update core.company_roster
  set profile_id = v_profile.id,
      invite_status = 'Linked'
  where lower(email) = v_email
    and profile_id is null
    and (employment_status <> 'Candidate' or invite_status in ('Invited', 'Accepted', 'Linked'));

  insert into core.company_memberships (
    company_id, profile_id, relationship_type, membership_status, title,
    invited_at, accepted_at, started_at
  )
  select
    roster.company_id,
    v_profile.id,
    case
      when roster.employment_status = 'Candidate' then 'candidate'
      when lower(coalesce(roster.job_title, '')) like any (array['%owner%', '%manager%', '%business contact%']) then 'admin'
      else 'member'
    end,
    'active',
    roster.job_title,
    now(), now(), now()
  from core.company_roster roster
  where roster.profile_id = v_profile.id
    and (roster.employment_status <> 'Candidate' or roster.invite_status in ('Invited', 'Accepted', 'Linked'))
    and not exists (
      select 1 from core.company_memberships membership
      where membership.company_id = roster.company_id and membership.profile_id = v_profile.id
    );
end;
$$;

revoke all on function public.get_candidate_foyer_experience(text, text) from public;
grant execute on function public.get_candidate_foyer_experience(text, text) to anon, authenticated, service_role;

revoke all on function public.submit_candidate_foyer_application(
  text, text, uuid, text, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.submit_candidate_foyer_application(
  text, text, uuid, text, text, text, text, text, text, text, text, uuid, text
) to service_role;

revoke all on function public.claim_candidate_foyer_application(uuid, text) from public, anon;
grant execute on function public.claim_candidate_foyer_application(uuid, text) to authenticated, service_role;

revoke all on function public.create_candidate_entry_link(
  text, text, text, text, text, text, text, text, timestamptz, integer
) from public, anon;
grant execute on function public.create_candidate_entry_link(
  text, text, text, text, text, text, text, text, timestamptz, integer
) to authenticated, service_role;

revoke all on function public.create_candidate_interview_slot(
  text, timestamptz, timestamptz, text, text, text
) from public, anon;
grant execute on function public.create_candidate_interview_slot(
  text, timestamptz, timestamptz, text, text, text
) to authenticated, service_role;

revoke all on function public.upsert_company_candidate_requirement(
  text, text, text, text, text, text, text, text, text, text, boolean, boolean, text
) from public, anon;
grant execute on function public.upsert_company_candidate_requirement(
  text, text, text, text, text, text, text, text, text, text, boolean, boolean, text
) to authenticated, service_role;

revoke all on function public.advance_candidate_application_to_roster(text, uuid) from public, anon;
grant execute on function public.advance_candidate_application_to_roster(text, uuid) to authenticated, service_role;

commit;
