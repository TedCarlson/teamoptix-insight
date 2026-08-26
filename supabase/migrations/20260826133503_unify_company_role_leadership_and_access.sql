-- Unify company role, leadership responsibility, and workspace access.
--
-- A roster label is not authorization. This migration keeps the domains
-- separate while making one governed transaction responsible for changing
-- all three. Leadership assignments are now many-to-one so companies can
-- appoint more than one Business Contact or Assistant BC.

alter table core.company_leadership_assignment
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists is_primary boolean not null default false;

update core.company_leadership_assignment
set id = gen_random_uuid()
where id is null;

delete from core.company_leadership_assignment
where roster_member_id is null
  and profile_id is null;

alter table core.company_leadership_assignment
  alter column id set not null,
  drop constraint if exists company_leadership_assignment_pkey,
  drop constraint if exists company_leadership_assignment_role_ck,
  drop constraint if exists company_leadership_assignment_target_ck,
  add constraint company_leadership_assignment_pkey primary key (id),
  add constraint company_leadership_assignment_role_ck check (
    role_key in ('authorized_operator', 'business_contact', 'assistant_bc', 'fleet_manager', 'hr')
  ),
  add constraint company_leadership_assignment_target_ck check (
    (role_key = 'authorized_operator' and profile_id is not null and roster_member_id is null)
    or
    (role_key <> 'authorized_operator' and profile_id is null and roster_member_id is not null)
  );

create unique index if not exists company_leadership_assignment_roster_unique
  on core.company_leadership_assignment (company_id, role_key, roster_member_id)
  where roster_member_id is not null;

create unique index if not exists company_leadership_assignment_profile_unique
  on core.company_leadership_assignment (company_id, role_key, profile_id)
  where profile_id is not null;

create unique index if not exists company_leadership_assignment_primary_unique
  on core.company_leadership_assignment (company_id, role_key)
  where is_primary;

with ranked as (
  select id,
         row_number() over (
           partition by company_id, role_key
           order by assigned_at nulls last, updated_at, id
         ) as ordinal
  from core.company_leadership_assignment
)
update core.company_leadership_assignment assignment
set is_primary = ranked.ordinal = 1
from ranked
where ranked.id = assignment.id;

create table if not exists core.company_leadership_role_config (
  company_id uuid not null references core.companies(id) on delete cascade,
  role_key text not null,
  is_enabled boolean not null default true,
  max_assignments integer,
  updated_by_profile_id uuid references core.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, role_key),
  constraint company_leadership_role_config_role_ck check (
    role_key in ('authorized_operator', 'business_contact', 'assistant_bc', 'fleet_manager', 'hr')
  ),
  constraint company_leadership_role_config_max_ck check (
    max_assignments is null or max_assignments > 0
  )
);

alter table core.company_leadership_role_config enable row level security;

drop policy if exists company_leadership_role_config_select on core.company_leadership_role_config;
create policy company_leadership_role_config_select
  on core.company_leadership_role_config for select to authenticated
  using (core.can_access_company(company_id));

drop policy if exists company_leadership_role_config_manage on core.company_leadership_role_config;
create policy company_leadership_role_config_manage
  on core.company_leadership_role_config for all to authenticated
  using (core.can_admin_company(company_id))
  with check (core.can_admin_company(company_id));

create table if not exists core.company_person_role_change (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  profile_id uuid references core.profiles(id) on delete set null,
  prior_state jsonb not null,
  resulting_state jsonb not null,
  changed_by_profile_id uuid references core.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists company_person_role_change_roster_idx
  on core.company_person_role_change (company_id, roster_member_id, changed_at desc);

alter table core.company_person_role_change enable row level security;

drop policy if exists company_person_role_change_select on core.company_person_role_change;
create policy company_person_role_change_select
  on core.company_person_role_change for select to authenticated
  using (core.can_admin_company(company_id));

create or replace function core.get_company_leadership_config(p_company_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roles jsonb;
  v_roster jsonb;
  v_operator_profiles jsonb;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;
  if not core.can_access_company(v_company_id) then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  with supported(role_key, role_label, description, sort_order, target_source, default_max) as (
    values
      ('authorized_operator', 'Authorized Operator', 'Accountable company authority and primary operational owner.', 1, 'profile', 1),
      ('business_contact', 'Business Contact', 'Company and commercial coordination. More than one contact may be assigned.', 2, 'roster', null::integer),
      ('assistant_bc', 'Assistant BC', 'Operational leadership coverage with provisioned company workspace access.', 3, 'roster', null::integer),
      ('fleet_manager', 'Fleet Manager', 'Owner of vehicles, equipment, inspections, and fleet readiness.', 4, 'roster', 1),
      ('hr', 'HR', 'Owner of workforce administration and candidate follow-up.', 5, 'roster', 1)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role_key', supported.role_key,
      'role_label', supported.role_label,
      'description', supported.description,
      'target_source', supported.target_source,
      'max_assignments', coalesce(config.max_assignments, supported.default_max),
      'assignments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'assignment_id', assignment.id,
            'roster_member_id', assignment.roster_member_id,
            'profile_id', assignment.profile_id,
            'is_primary', assignment.is_primary,
            'assigned_at', assignment.assigned_at,
            'full_name', coalesce(
              profile.display_name,
              nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
              roster.full_name
            ),
            'email', coalesce(profile.email, roster.email),
            'employment_status', roster.employment_status
          )
          order by assignment.is_primary desc, assignment.assigned_at, assignment.id
        )
        from core.company_leadership_assignment assignment
        left join core.company_roster roster
          on roster.id = assignment.roster_member_id
         and roster.company_id = assignment.company_id
        left join core.profiles profile
          on profile.id = coalesce(assignment.profile_id, roster.profile_id)
        where assignment.company_id = v_company_id
          and assignment.role_key = supported.role_key
      ), '[]'::jsonb)
    ) order by supported.sort_order
  ), '[]'::jsonb)
  into v_roles
  from supported
  left join core.company_leadership_role_config config
    on config.company_id = v_company_id
   and config.role_key = supported.role_key
  where coalesce(config.is_enabled, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_member_id', roster.id,
    'profile_id', roster.profile_id,
    'full_name', roster.full_name,
    'email', roster.email,
    'worker_type', roster.worker_type,
    'employment_status', roster.employment_status
  ) order by lower(roster.full_name), roster.id), '[]'::jsonb)
  into v_roster
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.employment_status in ('Active', 'Trainee');

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', profile.id,
    'display_name', coalesce(
      profile.display_name,
      nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
      profile.email
    ),
    'email', profile.email,
    'relationship_type', membership.relationship_type
  ) order by lower(coalesce(profile.display_name, profile.email))), '[]'::jsonb)
  into v_operator_profiles
  from core.company_memberships membership
  join core.profiles profile on profile.id = membership.profile_id
  where membership.company_id = v_company_id
    and membership.membership_status = 'active'
    and membership.relationship_type = 'admin'
    and profile.profile_status = 'active';

  return jsonb_build_object(
    'company_id', v_company_id,
    'can_manage', core.can_admin_company(v_company_id),
    'roles', v_roles,
    'roster', v_roster,
    'operator_profiles', v_operator_profiles
  );
end;
$$;

create or replace function core.update_company_leadership_assignment(
  p_company_slug text,
  p_role_key text,
  p_roster_member_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_default_max integer;
  v_max_assignments integer;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;
  if p_role_key not in ('authorized_operator', 'business_contact', 'assistant_bc', 'fleet_manager', 'hr') then
    return jsonb_build_object('error', 'Unsupported leadership role.');
  end if;

  if p_roster_member_id is null and p_profile_id is null then
    delete from core.company_leadership_assignment
    where company_id = v_company_id and role_key = p_role_key;
    return core.get_company_leadership_config(p_company_slug);
  end if;

  if p_role_key = 'authorized_operator' and (p_profile_id is null or p_roster_member_id is not null) then
    return jsonb_build_object('error', 'Authorized Operator must be linked to an app profile.');
  end if;
  if p_role_key <> 'authorized_operator' and (p_roster_member_id is null or p_profile_id is not null) then
    return jsonb_build_object('error', 'Workforce leadership roles must be linked to the company roster.');
  end if;

  if p_profile_id is not null and not exists (
    select 1 from core.company_memberships membership
    join core.profiles profile on profile.id = membership.profile_id
    where membership.company_id = v_company_id
      and membership.profile_id = p_profile_id
      and membership.membership_status = 'active'
      and membership.relationship_type = 'admin'
      and profile.profile_status = 'active'
  ) then
    return jsonb_build_object('error', 'Authorized Operator profile is not an active company administrator.');
  end if;

  if p_roster_member_id is not null and not exists (
    select 1 from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
  ) then
    return jsonb_build_object('error', 'Roster member is not eligible for this company.');
  end if;

  v_default_max := case p_role_key
    when 'business_contact' then null
    when 'assistant_bc' then null
    else 1
  end;

  select coalesce(config.max_assignments, v_default_max)
  into v_max_assignments
  from core.company_leadership_role_config config
  where config.company_id = v_company_id
    and config.role_key = p_role_key;

  v_max_assignments := coalesce(v_max_assignments, v_default_max);

  if v_max_assignments = 1 then
    delete from core.company_leadership_assignment
    where company_id = v_company_id and role_key = p_role_key;
  elsif v_max_assignments is not null and (
    select count(*) from core.company_leadership_assignment assignment
    where assignment.company_id = v_company_id
      and assignment.role_key = p_role_key
      and not (
        assignment.roster_member_id is not distinct from p_roster_member_id
        and assignment.profile_id is not distinct from p_profile_id
      )
  ) >= v_max_assignments then
    return jsonb_build_object('error', 'This leadership role has reached its assignment limit.');
  end if;

  insert into core.company_leadership_assignment (
    company_id,
    role_key,
    roster_member_id,
    profile_id,
    is_primary,
    assigned_by_profile_id,
    assigned_at,
    updated_at
  ) values (
    v_company_id,
    p_role_key,
    p_roster_member_id,
    p_profile_id,
    not exists (
      select 1 from core.company_leadership_assignment existing
      where existing.company_id = v_company_id and existing.role_key = p_role_key
    ),
    core.current_profile_id(),
    now(),
    now()
  )
  on conflict do nothing;

  return core.get_company_leadership_config(p_company_slug);
end;
$$;

create or replace function core.remove_company_leadership_assignment(
  p_company_slug text,
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_role_key text;
  v_was_primary boolean;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;

  delete from core.company_leadership_assignment assignment
  where assignment.id = p_assignment_id
    and assignment.company_id = v_company_id
  returning assignment.role_key, assignment.is_primary
  into v_role_key, v_was_primary;

  if v_role_key is null then
    return jsonb_build_object('error', 'Leadership assignment not found.');
  end if;

  if v_was_primary then
    update core.company_leadership_assignment assignment
    set is_primary = true, updated_at = now()
    where assignment.id = (
      select replacement.id
      from core.company_leadership_assignment replacement
      where replacement.company_id = v_company_id
        and replacement.role_key = v_role_key
      order by replacement.assigned_at, replacement.id
      limit 1
    );
  end if;

  return core.get_company_leadership_config(p_company_slug);
end;
$$;

create or replace function core.get_company_person_role_context(
  p_company_slug text,
  p_roster_member_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_grants jsonb;
  v_leadership jsonb;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;

  select roster.* into v_roster
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.id = p_roster_member_id;

  if v_roster.id is null then return jsonb_build_object('error', 'Roster member not found.'); end if;

  select coalesce(jsonb_agg(user_grant.grant_key order by user_grant.grant_key), '[]'::jsonb)
  into v_grants
  from core.company_user_grant user_grant
  where user_grant.company_id = v_company_id
    and user_grant.profile_id = v_roster.profile_id
    and user_grant.is_active
    and user_grant.grant_key in (
      'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
      'operations_uploads', 'reports', 'fleet', 'roster', 'hiring',
      'payroll', 'admin_config', 'grant_management', 'opportunity_analysis'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', assignment.id,
    'role_key', assignment.role_key,
    'is_primary', assignment.is_primary
  ) order by assignment.role_key), '[]'::jsonb)
  into v_leadership
  from core.company_leadership_assignment assignment
  where assignment.company_id = v_company_id
    and assignment.roster_member_id = v_roster.id;

  return jsonb_build_object(
    'company_id', v_company_id,
    'roster_member_id', v_roster.id,
    'profile_id', v_roster.profile_id,
    'full_name', v_roster.full_name,
    'role_label', coalesce(v_roster.worker_type, v_roster.job_title),
    'is_linked', v_roster.profile_id is not null,
    'leadership_assignments', v_leadership,
    'grants', v_grants
  );
end;
$$;

create or replace function core.apply_company_person_role_change(
  p_company_slug text,
  p_roster_member_id uuid,
  p_role_label text,
  p_leadership_role_key text,
  p_grant_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_actor_profile_id uuid;
  v_prior_state jsonb;
  v_resulting_state jsonb;
  v_clean_grants text[];
  v_max_assignments integer;
  v_all_grants text[] := array[
    'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
    'operations_uploads', 'reports', 'fleet', 'roster', 'hiring',
    'payroll', 'admin_config', 'grant_management', 'opportunity_analysis'
  ]::text[];
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;

  select roster.* into v_roster
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.id = p_roster_member_id
  for update;

  if v_roster.id is null then return jsonb_build_object('error', 'Roster member not found.'); end if;
  if v_roster.employment_status not in ('Active', 'Trainee') then
    return jsonb_build_object('error', 'Only active or trainee roster members can receive company roles.');
  end if;
  if nullif(btrim(p_role_label), '') is null then
    return jsonb_build_object('error', 'Role is required.');
  end if;
  if p_leadership_role_key is not null
     and p_leadership_role_key not in ('business_contact', 'assistant_bc', 'fleet_manager', 'hr') then
    return jsonb_build_object('error', 'Unsupported workforce leadership role.');
  end if;
  if p_leadership_role_key = 'business_contact' and p_role_label <> 'Business Contact' then
    return jsonb_build_object('error', 'Business Contact leadership must use the Business Contact company role.');
  end if;
  if p_leadership_role_key = 'assistant_bc' and p_role_label <> 'Assistant BC' then
    return jsonb_build_object('error', 'Assistant BC leadership must use the Assistant BC company role.');
  end if;
  if p_leadership_role_key = 'fleet_manager' and p_role_label <> 'Fleet Manager' then
    return jsonb_build_object('error', 'Fleet Manager leadership must use the Fleet Manager company role.');
  end if;

  select coalesce(array_agg(distinct requested.key order by requested.key), array[]::text[])
  into v_clean_grants
  from unnest(coalesce(p_grant_keys, array[]::text[])) requested(key)
  where requested.key = any(v_all_grants);

  if exists (
    select 1
    from unnest(coalesce(p_grant_keys, array[]::text[])) requested(key)
    where not (requested.key = any(v_all_grants))
  ) then
    return jsonb_build_object('error', 'One or more workspace grants are not valid for this product.');
  end if;

  if v_roster.profile_id is null and cardinality(v_clean_grants) > 0 then
    return jsonb_build_object(
      'error',
      'This roster member must accept an app invitation before workspace grants can be assigned.'
    );
  end if;

  if p_leadership_role_key is not null then
    select coalesce(
      config.max_assignments,
      case p_leadership_role_key
        when 'business_contact' then null
        when 'assistant_bc' then null
        else 1
      end
    )
    into v_max_assignments
    from core.company_leadership_role_config config
    where config.company_id = v_company_id
      and config.role_key = p_leadership_role_key;

    v_max_assignments := coalesce(
      v_max_assignments,
      case p_leadership_role_key
        when 'business_contact' then null
        when 'assistant_bc' then null
        else 1
      end
    );

    if v_max_assignments is not null and (
      select count(*)
      from core.company_leadership_assignment assignment
      where assignment.company_id = v_company_id
        and assignment.role_key = p_leadership_role_key
        and assignment.roster_member_id is distinct from v_roster.id
    ) >= v_max_assignments then
      return jsonb_build_object('error', 'This leadership role has reached its assignment limit.');
    end if;
  end if;

  v_actor_profile_id := core.current_profile_id();
  v_prior_state := core.get_company_person_role_context(p_company_slug, p_roster_member_id);

  update core.company_roster
  set worker_type = btrim(p_role_label),
      job_title = btrim(p_role_label)
  where id = v_roster.id;

  if v_roster.profile_id is not null then
    update core.company_memberships membership
    set title = btrim(p_role_label), updated_at = now()
    where membership.company_id = v_company_id
      and membership.profile_id = v_roster.profile_id
      and membership.membership_status = 'active';

    delete from core.company_user_grant user_grant
    where user_grant.company_id = v_company_id
      and user_grant.profile_id = v_roster.profile_id
      and user_grant.grant_key = any(v_all_grants);

    insert into core.company_user_grant (
      company_id, profile_id, grant_key, is_active, granted_by_profile_id, updated_at
    )
    select v_company_id, v_roster.profile_id, grant_key, true, v_actor_profile_id, now()
    from unnest(v_clean_grants) grant_key
    on conflict (company_id, profile_id, grant_key) do update
    set is_active = true,
        granted_by_profile_id = excluded.granted_by_profile_id,
        granted_at = now(),
        updated_at = now();
  end if;

  delete from core.company_leadership_assignment assignment
  where assignment.company_id = v_company_id
    and assignment.roster_member_id = v_roster.id;

  if p_leadership_role_key is not null then
    insert into core.company_leadership_assignment (
      company_id, role_key, roster_member_id, is_primary,
      assigned_by_profile_id, assigned_at, updated_at
    ) values (
      v_company_id,
      p_leadership_role_key,
      v_roster.id,
      not exists (
        select 1 from core.company_leadership_assignment existing
        where existing.company_id = v_company_id
          and existing.role_key = p_leadership_role_key
      ),
      v_actor_profile_id,
      now(),
      now()
    );
  end if;

  v_resulting_state := core.get_company_person_role_context(p_company_slug, p_roster_member_id);

  insert into core.company_person_role_change (
    company_id, roster_member_id, profile_id, prior_state, resulting_state,
    changed_by_profile_id
  ) values (
    v_company_id, v_roster.id, v_roster.profile_id, v_prior_state,
    v_resulting_state, v_actor_profile_id
  );

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, occurred_at, created_by_profile_id
  ) values (
    v_company_id,
    v_roster.id,
    'operations',
    'company_role_changed',
    'Company role, leadership responsibility, and workspace access were reviewed together.',
    jsonb_build_object(
      'role_label', btrim(p_role_label),
      'leadership_role_key', p_leadership_role_key,
      'grant_keys', to_jsonb(v_clean_grants)
    ),
    now(),
    v_actor_profile_id
  );

  return v_resulting_state;
end;
$$;

create or replace function public.update_company_profile_grants(
  p_company_slug text,
  p_profile_id uuid,
  p_grant_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access jsonb;
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_membership jsonb;
  v_can_edit boolean;
  v_allowed_grants text[] := array[
    'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
    'operations_uploads', 'reports', 'fleet', 'roster', 'hiring',
    'payroll', 'admin_config', 'grant_management', 'opportunity_analysis'
  ]::text[];
begin
  v_access := core.access_context();
  v_actor_profile_id := nullif(v_access->>'profile_id', '')::uuid;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;

  select membership into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) membership
  where membership->>'company_slug' = lower(btrim(p_company_slug))
  limit 1;

  v_can_edit := coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (
      v_membership->>'relationship_type' = 'admin'
      and v_membership->>'membership_status' = 'active'
    );

  if not v_can_edit then return jsonb_build_object('error', 'Forbidden.'); end if;

  if not exists (
    select 1 from core.company_memberships membership
    where membership.company_id = v_company_id
      and membership.profile_id = p_profile_id
  ) then
    return jsonb_build_object('error', 'Profile is not attached to this company.');
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_grant_keys, array[]::text[])) requested(key)
    where not (requested.key = any(v_allowed_grants))
  ) then
    return jsonb_build_object('error', 'One or more workspace grants are not valid for this product.');
  end if;

  -- Only replace grants owned by the general Insight product. Entitlements and
  -- product-specific grants are preserved and managed in their product flow.
  delete from core.company_user_grant user_grant
  where user_grant.company_id = v_company_id
    and user_grant.profile_id = p_profile_id
    and user_grant.grant_key = any(v_allowed_grants);

  insert into core.company_user_grant (
    company_id, profile_id, grant_key, is_active,
    granted_by_profile_id, updated_at
  )
  select
    v_company_id, p_profile_id, requested.key, true,
    v_actor_profile_id, now()
  from (
    select distinct key
    from unnest(coalesce(p_grant_keys, array[]::text[])) requested(key)
  ) requested
  on conflict (company_id, profile_id, grant_key) do update
  set is_active = true,
      granted_by_profile_id = excluded.granted_by_profile_id,
      granted_at = now(),
      updated_at = now();

  return public.get_company_access_config(p_company_slug);
end;
$$;

create or replace function public.get_company_leadership_config(p_company_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select core.get_company_leadership_config(p_company_slug); $$;

create or replace function public.update_company_leadership_assignment(
  p_company_slug text, p_role_key text, p_roster_member_id uuid, p_profile_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select core.update_company_leadership_assignment(
    p_company_slug, p_role_key, p_roster_member_id, p_profile_id
  );
$$;

create or replace function public.remove_company_leadership_assignment(
  p_company_slug text, p_assignment_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select core.remove_company_leadership_assignment(p_company_slug, p_assignment_id); $$;

create or replace function public.get_company_person_role_context(
  p_company_slug text, p_roster_member_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select core.get_company_person_role_context(p_company_slug, p_roster_member_id); $$;

create or replace function public.apply_company_person_role_change(
  p_company_slug text,
  p_roster_member_id uuid,
  p_role_label text,
  p_leadership_role_key text,
  p_grant_keys text[]
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select core.apply_company_person_role_change(
    p_company_slug, p_roster_member_id, p_role_label,
    p_leadership_role_key, p_grant_keys
  );
$$;

-- Product grants are deliberately absent from the general company access
-- projection. Product entry resolves company entitlement first, then its own
-- scoped grant in the product resolver.
create or replace function public.get_company_access_config(p_company_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access jsonb;
  v_company_id uuid;
  v_membership jsonb;
  v_can_edit boolean;
begin
  v_access := core.access_context();

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;

  select membership into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) membership
  where membership->>'company_slug' = lower(btrim(p_company_slug))
  limit 1;

  v_can_edit := coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (
      v_membership->>'relationship_type' = 'admin'
      and v_membership->>'membership_status' = 'active'
    );

  if not v_can_edit then return jsonb_build_object('error', 'Forbidden.'); end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'can_edit', v_can_edit,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', profile.id,
        'display_name', coalesce(
          profile.display_name,
          nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
          profile.email
        ),
        'email', profile.email,
        'is_platform_owner', coalesce(profile.is_platform_owner, false),
        'relationship_type', membership.relationship_type,
        'membership_status', membership.membership_status,
        'title', membership.title,
        'grants', coalesce((
          select jsonb_agg(user_grant.grant_key order by user_grant.grant_key)
          from core.company_user_grant user_grant
          where user_grant.company_id = membership.company_id
            and user_grant.profile_id = membership.profile_id
            and user_grant.is_active
            and user_grant.grant_key in (
              'schedule', 'dispatch', 'routes', 'planning', 'delivery_window',
              'operations_uploads', 'reports', 'fleet', 'roster', 'hiring',
              'payroll', 'admin_config', 'grant_management', 'opportunity_analysis'
            )
        ), '[]'::jsonb)
      ) order by coalesce(profile.display_name, profile.email))
      from core.company_memberships membership
      join core.profiles profile on profile.id = membership.profile_id
      where membership.company_id = v_company_id
        and membership.membership_status in ('pending', 'active', 'inactive')
    ), '[]'::jsonb)
  );
end;
$$;

-- The dispatch RPCs predate workspace grants and are SECURITY DEFINER. Keep
-- their proven write behavior, but place an authorization wrapper in front of
-- every externally callable entry point.
alter function public.dispatch_get_or_create_day(uuid, date)
  rename to dispatch_get_or_create_day_unchecked;
alter function public.dispatch_lock_day(uuid, date, jsonb, uuid)
  rename to dispatch_lock_day_unchecked;
alter function public.dispatch_reopen_day(uuid, date, text, uuid)
  rename to dispatch_reopen_day_unchecked;
alter function public.dispatch_record_event(
  uuid, date, text, text, text, text, text, text, uuid, text,
  text, text, text, text, text, jsonb, uuid
) rename to dispatch_record_event_unchecked;

create function public.dispatch_get_or_create_day(
  p_company_id uuid,
  p_dispatch_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.can_use_company_workspace(p_company_id, 'dispatch') then
    raise exception 'Dispatch access is required.' using errcode = '42501';
  end if;
  return public.dispatch_get_or_create_day_unchecked(p_company_id, p_dispatch_date);
end;
$$;

create function public.dispatch_lock_day(
  p_company_id uuid,
  p_dispatch_date date,
  p_snapshot_json jsonb,
  p_locked_by_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.can_use_company_workspace(p_company_id, 'dispatch') then
    raise exception 'Dispatch access is required.' using errcode = '42501';
  end if;
  return public.dispatch_lock_day_unchecked(
    p_company_id, p_dispatch_date, p_snapshot_json, p_locked_by_profile_id
  );
end;
$$;

create function public.dispatch_reopen_day(
  p_company_id uuid,
  p_dispatch_date date,
  p_note text,
  p_reopened_by_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.can_use_company_workspace(p_company_id, 'dispatch') then
    raise exception 'Dispatch access is required.' using errcode = '42501';
  end if;
  return public.dispatch_reopen_day_unchecked(
    p_company_id, p_dispatch_date, p_note, p_reopened_by_profile_id
  );
end;
$$;

create function public.dispatch_record_event(
  p_company_id uuid,
  p_dispatch_date date,
  p_event_code text,
  p_event_label text default null,
  p_event_category text default null,
  p_route_key text default null,
  p_route_label text default null,
  p_seat text default null,
  p_person_roster_member_id uuid default null,
  p_person_name text default null,
  p_from_route_key text default null,
  p_from_route_label text default null,
  p_to_route_key text default null,
  p_to_route_label text default null,
  p_note text default null,
  p_event_payload jsonb default '{}'::jsonb,
  p_created_by_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.can_use_company_workspace(p_company_id, 'dispatch') then
    raise exception 'Dispatch access is required.' using errcode = '42501';
  end if;
  return public.dispatch_record_event_unchecked(
    p_company_id, p_dispatch_date, p_event_code, p_event_label,
    p_event_category, p_route_key, p_route_label, p_seat,
    p_person_roster_member_id, p_person_name, p_from_route_key,
    p_from_route_label, p_to_route_key, p_to_route_label, p_note,
    p_event_payload, p_created_by_profile_id
  );
end;
$$;

revoke all on function public.dispatch_get_or_create_day_unchecked(uuid, date) from public, anon, authenticated;
revoke all on function public.dispatch_lock_day_unchecked(uuid, date, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_reopen_day_unchecked(uuid, date, text, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_record_event_unchecked(uuid, date, text, text, text, text, text, text, uuid, text, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;

revoke all on function public.dispatch_get_or_create_day(uuid, date) from public, anon;
revoke all on function public.dispatch_lock_day(uuid, date, jsonb, uuid) from public, anon;
revoke all on function public.dispatch_reopen_day(uuid, date, text, uuid) from public, anon;
revoke all on function public.dispatch_record_event(uuid, date, text, text, text, text, text, text, uuid, text, text, text, text, text, text, jsonb, uuid) from public, anon;

grant execute on function public.dispatch_get_or_create_day(uuid, date) to authenticated, service_role;
grant execute on function public.dispatch_lock_day(uuid, date, jsonb, uuid) to authenticated, service_role;
grant execute on function public.dispatch_reopen_day(uuid, date, text, uuid) to authenticated, service_role;
grant execute on function public.dispatch_record_event(uuid, date, text, text, text, text, text, text, uuid, text, text, text, text, text, text, jsonb, uuid) to authenticated, service_role;

-- Existing Assistant BC roster labels are reconciled to a real leadership
-- assignment and membership title. This repairs promoted drivers such as the
-- reported case without relying on a person-specific identifier.
update core.company_memberships membership
set title = 'Assistant BC', updated_at = now()
from core.company_roster roster
where roster.company_id = membership.company_id
  and roster.profile_id = membership.profile_id
  and roster.employment_status in ('Active', 'Trainee')
  and roster.worker_type = 'Assistant BC'
  and membership.membership_status = 'active'
  and membership.title is distinct from 'Assistant BC';

update core.company_roster
set job_title = 'Assistant BC'
where employment_status in ('Active', 'Trainee')
  and worker_type = 'Assistant BC'
  and job_title is distinct from 'Assistant BC';

insert into core.company_leadership_assignment (
  company_id, role_key, roster_member_id, is_primary,
  assigned_by_profile_id, assigned_at, updated_at
)
select
  roster.company_id,
  'assistant_bc',
  roster.id,
  not exists (
    select 1 from core.company_leadership_assignment existing
    where existing.company_id = roster.company_id
      and existing.role_key = 'assistant_bc'
  ),
  null,
  now(),
  now()
from core.company_roster roster
where roster.employment_status in ('Active', 'Trainee')
  and roster.worker_type = 'Assistant BC'
  and not exists (
    select 1 from core.company_leadership_assignment existing
    where existing.company_id = roster.company_id
      and existing.role_key = 'assistant_bc'
      and existing.roster_member_id = roster.id
  );

revoke all on function public.get_company_leadership_config(text) from public, anon;
revoke all on function public.update_company_leadership_assignment(text, text, uuid, uuid) from public, anon;
revoke all on function public.remove_company_leadership_assignment(text, uuid) from public, anon;
revoke all on function public.get_company_person_role_context(text, uuid) from public, anon;
revoke all on function public.apply_company_person_role_change(text, uuid, text, text, text[]) from public, anon;

grant execute on function public.get_company_leadership_config(text) to authenticated, service_role;
grant execute on function public.update_company_leadership_assignment(text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_company_leadership_assignment(text, uuid) to authenticated, service_role;
grant execute on function public.get_company_person_role_context(text, uuid) to authenticated, service_role;
grant execute on function public.apply_company_person_role_change(text, uuid, text, text, text[]) to authenticated, service_role;
grant select on core.company_leadership_role_config to authenticated, service_role;
grant select on core.company_person_role_change to authenticated, service_role;

comment on table core.company_leadership_assignment is
  'Company leadership responsibilities. Multiple assignments are supported; workspace grants remain separate authorization records.';

comment on function public.apply_company_person_role_change(text, uuid, text, text, text[]) is
  'Atomically changes a roster role, membership title, leadership assignment, and general Insight workspace grants.';
