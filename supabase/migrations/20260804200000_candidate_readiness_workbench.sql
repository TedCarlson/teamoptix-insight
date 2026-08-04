begin;

-- The established candidate checklist is the readiness source of truth.
-- These fields add candidate-facing context without introducing a parallel
-- company requirements model.
alter table core.company_candidate_checklist_config
  add column if not exists candidate_description text,
  add column if not exists category text not null default 'Readiness',
  add column if not exists phase text not null default 'finalist',
  add column if not exists evidence_type text,
  add column if not exists role_key text,
  add column if not exists location_key text,
  add column if not exists assignment_key text,
  add column if not exists is_blocking boolean not null default true,
  add column if not exists expose_in_foyer boolean not null default true,
  add column if not exists source_scope text not null default 'company';

alter table core.company_candidate_checklist_config
  drop constraint if exists company_candidate_checklist_config_phase_ck,
  add constraint company_candidate_checklist_config_phase_ck check (
    phase in ('application', 'interview', 'finalist', 'pre_assignment', 'onboarding')
  ),
  drop constraint if exists company_candidate_checklist_config_source_scope_ck,
  add constraint company_candidate_checklist_config_source_scope_ck check (
    source_scope in ('generic', 'industry', 'company')
  );

create or replace view public.company_candidate_checklist_config_v
with (security_invoker = true) as
select
  c.id,
  c.company_id,
  c.item_type_id,
  c.display_label,
  c.is_required,
  c.is_enabled,
  c.sort_order,
  c.created_at,
  c.updated_at,
  i.item_key,
  i.default_label,
  i.description,
  i.default_required,
  i.is_active as item_is_active,
  c.readiness_weight,
  c.candidate_description,
  c.category,
  c.phase,
  c.evidence_type,
  c.role_key,
  c.location_key,
  c.assignment_key,
  c.is_blocking,
  c.expose_in_foyer,
  c.source_scope
from core.company_candidate_checklist_config c
join core.candidate_checklist_item_type i on i.id = c.item_type_id;

create or replace view public.company_candidate_checklist_readiness_v
with (security_invoker = true) as
select
  c.id,
  c.company_id,
  c.item_type_id,
  c.display_label,
  c.is_required,
  c.is_enabled,
  c.sort_order,
  c.readiness_weight,
  c.created_at,
  c.updated_at,
  t.item_key,
  t.default_label,
  t.description,
  t.default_required,
  t.is_active as item_is_active,
  c.candidate_description,
  c.category,
  c.phase,
  c.evidence_type,
  c.role_key,
  c.location_key,
  c.assignment_key,
  c.is_blocking,
  c.expose_in_foyer,
  c.source_scope
from core.company_candidate_checklist_config c
join core.candidate_checklist_item_type t on t.id = c.item_type_id;

create or replace function public.upsert_company_candidate_readiness_requirement(
  p_company_slug text,
  p_item_key text,
  p_label text,
  p_description text default null,
  p_category text default 'Readiness',
  p_phase text default 'finalist',
  p_evidence_type text default null,
  p_role_key text default null,
  p_location_key text default null,
  p_assignment_key text default null,
  p_is_required boolean default true,
  p_is_blocking boolean default true,
  p_is_enabled boolean default true,
  p_expose_in_foyer boolean default true,
  p_readiness_weight numeric default 1,
  p_sort_order integer default 100,
  p_source_scope text default 'company'
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_item_type_id uuid;
  v_config core.company_candidate_checklist_config%rowtype;
  v_item_key text := lower(regexp_replace(btrim(coalesce(p_item_key, '')), '[^a-zA-Z0-9]+', '_', 'g'));
begin
  select id into v_company_id
  from core.companies
  where company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Forbidden.';
  end if;
  if nullif(v_item_key, '') is null or nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'Requirement name and key are required.';
  end if;
  if p_phase not in ('application', 'interview', 'finalist', 'pre_assignment', 'onboarding') then
    raise exception 'Unsupported requirement phase.';
  end if;
  if p_source_scope not in ('generic', 'industry', 'company') then
    raise exception 'Unsupported requirement source.';
  end if;

  insert into core.candidate_checklist_item_type (
    item_key, default_label, description, default_required, is_active, sort_order
  ) values (
    v_item_key, btrim(p_label), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_is_required, true), true, coalesce(p_sort_order, 100)
  )
  on conflict (item_key) do update set
    default_label = excluded.default_label,
    description = coalesce(excluded.description, core.candidate_checklist_item_type.description),
    default_required = excluded.default_required,
    is_active = true,
    updated_at = now()
  returning id into v_item_type_id;

  insert into core.company_candidate_checklist_config (
    company_id, item_type_id, display_label, is_required, is_enabled,
    sort_order, readiness_weight, candidate_description, category, phase,
    evidence_type, role_key, location_key, assignment_key, is_blocking,
    expose_in_foyer, source_scope
  ) values (
    v_company_id, v_item_type_id, btrim(p_label), coalesce(p_is_required, true),
    coalesce(p_is_enabled, true), coalesce(p_sort_order, 100),
    greatest(coalesce(p_readiness_weight, 1), 0),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Readiness'),
    p_phase, nullif(btrim(coalesce(p_evidence_type, '')), ''),
    nullif(btrim(coalesce(p_role_key, '')), ''),
    nullif(btrim(coalesce(p_location_key, '')), ''),
    nullif(btrim(coalesce(p_assignment_key, '')), ''),
    coalesce(p_is_blocking, true), coalesce(p_expose_in_foyer, true),
    p_source_scope
  )
  on conflict (company_id, item_type_id) do update set
    display_label = excluded.display_label,
    is_required = excluded.is_required,
    is_enabled = excluded.is_enabled,
    sort_order = excluded.sort_order,
    readiness_weight = excluded.readiness_weight,
    candidate_description = excluded.candidate_description,
    category = excluded.category,
    phase = excluded.phase,
    evidence_type = excluded.evidence_type,
    role_key = excluded.role_key,
    location_key = excluded.location_key,
    assignment_key = excluded.assignment_key,
    is_blocking = excluded.is_blocking,
    expose_in_foyer = excluded.expose_in_foyer,
    source_scope = excluded.source_scope,
    updated_at = now()
  returning * into v_config;

  return to_jsonb(v_config) || jsonb_build_object('item_key', v_item_key);
end;
$$;

create or replace function public.apply_company_candidate_industry_baseline(
  p_company_slug text
) returns jsonb
language plpgsql
security definer
set search_path = core, public, ref
as $$
declare
  v_company core.companies%rowtype;
  v_definition core.candidate_requirement_definition%rowtype;
  v_item_type_id uuid;
  v_added integer := 0;
begin
  select * into v_company
  from core.companies
  where company_slug = lower(btrim(p_company_slug));

  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company.id)) then
    raise exception 'Forbidden.';
  end if;

  for v_definition in
    select definition.*
    from core.candidate_requirement_definition definition
    where definition.is_active = true
      and (
        definition.scope_type = 'generic'
        or (
          definition.scope_type = 'industry'
          and definition.industry_id = v_company.primary_industry_id
        )
      )
    order by definition.sort_order, definition.label
  loop
    insert into core.candidate_checklist_item_type (
      item_key, default_label, description, default_required, is_active, sort_order
    ) values (
      v_definition.requirement_key, v_definition.label, v_definition.description,
      v_definition.is_required, true, v_definition.sort_order
    )
    on conflict (item_key) do update set
      default_label = excluded.default_label,
      description = coalesce(excluded.description, core.candidate_checklist_item_type.description),
      default_required = excluded.default_required,
      is_active = true,
      updated_at = now()
    returning id into v_item_type_id;

    insert into core.company_candidate_checklist_config (
      company_id, item_type_id, display_label, is_required, is_enabled,
      sort_order, readiness_weight, candidate_description, category, phase,
      evidence_type, role_key, location_key, assignment_key, is_blocking,
      expose_in_foyer, source_scope
    ) values (
      v_company.id, v_item_type_id, v_definition.label,
      v_definition.is_required, true, v_definition.sort_order, 1,
      v_definition.description, v_definition.category, v_definition.phase,
      v_definition.evidence_type, v_definition.role_key,
      v_definition.location_key, v_definition.assignment_key,
      v_definition.is_blocking, true, v_definition.scope_type
    )
    on conflict (company_id, item_type_id) do nothing;

    if found then v_added := v_added + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added);
end;
$$;

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
    if v_link.id is null then raise exception 'Candidate entry link is invalid or no longer active.'; end if;
    select * into v_company from core.companies where id = v_link.company_id;
    v_source_type := case v_link.link_type
      when 'company_general' then 'company_link'
      when 'company_invite' then 'company_invite'
      when 'member_referral' then 'member_referral'
      else 'company_link'
    end;
    v_scheduling_policy := v_link.scheduling_policy;
  elsif nullif(btrim(coalesce(p_company_slug, '')), '') is not null then
    select * into v_company from core.companies
    where company_slug = lower(btrim(p_company_slug)) limit 1;
    if v_company.id is null then raise exception 'Company not found.'; end if;
    select * into v_link from core.candidate_entry_link
    where company_id = v_company.id and link_type = 'company_general' and status = 'active'
    order by created_at desc limit 1;
    v_source_type := 'company_link';
    v_scheduling_policy := coalesce(v_link.scheduling_policy, 'required');
  end if;

  if v_company.id is not null and v_company.company_status <> 'active' then
    raise exception 'Company candidate entry is not active.';
  end if;

  if v_company.primary_industry_id is not null then
    select industry_label into v_industry_label
    from ref.industries where id = v_company.primary_industry_id;
  end if;

  if v_company.id is not null then
    select coalesce(jsonb_agg(to_jsonb(requirement) order by requirement.sort_order), '[]'::jsonb)
    into v_requirements
    from (
      select
        item.item_key as requirement_key,
        config.display_label as label,
        coalesce(config.candidate_description, item.description) as description,
        config.category,
        config.phase,
        config.evidence_type,
        config.is_required,
        config.is_blocking,
        config.source_scope,
        config.sort_order
      from core.company_candidate_checklist_config config
      join core.candidate_checklist_item_type item on item.id = config.item_type_id
      where config.company_id = v_company.id
        and config.is_enabled = true
        and config.expose_in_foyer = true
        and item.is_active = true
        and (config.role_key is null or config.role_key = v_link.role_key)
        and (config.location_key is null or config.location_key = v_link.location_key)
        and (config.assignment_key is null or config.assignment_key = v_link.assignment_key)
    ) requirement;
  else
    select coalesce(jsonb_agg(to_jsonb(requirement) order by requirement.sort_order), '[]'::jsonb)
    into v_requirements
    from (
      select
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
      where definition.is_active = true and definition.scope_type = 'generic'
    ) requirement;
  end if;

  if v_company.id is not null then
    select coalesce(jsonb_agg(to_jsonb(slot) order by slot.starts_at), '[]'::jsonb)
    into v_slots
    from (
      select interview_slot.id, interview_slot.starts_at, interview_slot.ends_at,
        interview_slot.timezone, interview_slot.meeting_provider
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
      'id', v_link.id, 'entry_code', v_link.entry_code,
      'link_type', v_link.link_type, 'label', v_link.label,
      'source_type', v_source_type, 'role_key', v_link.role_key,
      'location_key', v_link.location_key, 'assignment_key', v_link.assignment_key,
      'scheduling_policy', v_scheduling_policy, 'bypass_reason', v_link.bypass_reason
    ),
    'company', case when v_company.id is null then null else jsonb_build_object(
      'id', v_company.id, 'name', v_company.company_name,
      'slug', v_company.company_slug, 'logo_url', v_company.logo_url,
      'industry_id', v_company.primary_industry_id, 'industry_label', v_industry_label
    ) end,
    'requirements', v_requirements,
    'interview_slots', v_slots
  );
end;
$$;

create or replace function public.create_candidate_interview_slots(
  p_company_slug text,
  p_slots jsonb,
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
  v_owner_profile_id uuid;
  v_slot jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_created integer := 0;
begin
  select id into v_company_id
  from core.companies
  where company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Forbidden.';
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 80 then
    raise exception 'Provide no more than 80 interview times.';
  end if;

  select coalesce(assignment.profile_id, roster.profile_id)
  into v_owner_profile_id
  from core.company_leadership_assignment assignment
  left join core.company_roster roster
    on roster.id = assignment.roster_member_id
   and roster.company_id = assignment.company_id
  where assignment.company_id = v_company_id
    and assignment.role_key in ('hr', 'business_contact')
    and coalesce(assignment.profile_id, roster.profile_id) is not null
  order by case assignment.role_key when 'hr' then 1 else 2 end
  limit 1;

  v_owner_profile_id := coalesce(v_owner_profile_id, core.current_profile_id());

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    v_starts_at := nullif(v_slot->>'starts_at', '')::timestamptz;
    v_ends_at := nullif(v_slot->>'ends_at', '')::timestamptz;
    if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
      raise exception 'Each interview time needs a valid start and end.';
    end if;

    if not exists (
      select 1 from core.candidate_interview_slot existing
      where existing.company_id = v_company_id
        and existing.starts_at = v_starts_at
        and existing.slot_status in ('open', 'held', 'booked')
    ) then
      insert into core.candidate_interview_slot (
        company_id, interviewer_profile_id, starts_at, ends_at, timezone,
        meeting_provider, meeting_url, created_by_profile_id
      ) values (
        v_company_id, v_owner_profile_id, v_starts_at, v_ends_at,
        coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York'),
        coalesce(nullif(btrim(coalesce(p_meeting_provider, '')), ''), 'insight'),
        nullif(btrim(coalesce(p_meeting_url, '')), ''), core.current_profile_id()
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

-- Candidate application requirement snapshots are finalized from the same
-- company checklist after the existing submission RPC completes its inserts.
create or replace function core.sync_candidate_application_readiness_requirements()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if new.company_id is null then return null; end if;

  delete from core.candidate_application_requirement
  where application_id = new.id;

  insert into core.candidate_application_requirement (
    application_id, company_id, definition_id, requirement_key, label,
    description, category, phase, evidence_type, source_scope,
    is_required, is_blocking
  )
  select
    new.id, new.company_id, null, item.item_key, config.display_label,
    coalesce(config.candidate_description, item.description), config.category,
    config.phase, config.evidence_type, config.source_scope,
    config.is_required, config.is_blocking
  from core.company_candidate_checklist_config config
  join core.candidate_checklist_item_type item on item.id = config.item_type_id
  where config.company_id = new.company_id
    and config.is_enabled = true
    and item.is_active = true
    and (config.role_key is null or config.role_key = new.role_interest)
    and (config.location_key is null or config.location_key = new.location_interest)
    and (config.assignment_key is null or config.assignment_key = new.assignment_key)
  order by config.sort_order;

  return null;
end;
$$;

drop trigger if exists sync_candidate_application_readiness_requirements
on core.candidate_application;
create constraint trigger sync_candidate_application_readiness_requirements
after insert on core.candidate_application
deferrable initially deferred
for each row execute function core.sync_candidate_application_readiness_requirements();

revoke all on function public.upsert_company_candidate_readiness_requirement(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, numeric, integer, text
) from public;
grant execute on function public.upsert_company_candidate_readiness_requirement(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, numeric, integer, text
) to authenticated, service_role;

revoke all on function public.apply_company_candidate_industry_baseline(text) from public;
grant execute on function public.apply_company_candidate_industry_baseline(text)
to authenticated, service_role;

revoke all on function public.create_candidate_interview_slots(
  text, jsonb, text, text, text
) from public;
grant execute on function public.create_candidate_interview_slots(
  text, jsonb, text, text, text
) to authenticated, service_role;

revoke all on function public.get_candidate_foyer_experience(text, text) from public;
grant execute on function public.get_candidate_foyer_experience(text, text)
to anon, authenticated, service_role;

grant select on public.company_candidate_checklist_config_v to authenticated, service_role;
grant select on public.company_candidate_checklist_readiness_v to authenticated, service_role;

comment on table core.company_candidate_checklist_config is
  'Company candidate readiness contract used by the pipeline, workflow drawer, Foyer expectations, and reporting.';

commit;
