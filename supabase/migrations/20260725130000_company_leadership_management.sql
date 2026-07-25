create table if not exists core.company_leadership_assignment (
  company_id uuid not null references core.companies(id) on delete cascade,
  role_key text not null,
  roster_member_id uuid references core.company_roster(id) on delete restrict,
  profile_id uuid references core.profiles(id) on delete restrict,
  assigned_by_profile_id uuid references core.profiles(id) on delete set null,
  assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, role_key),
  constraint company_leadership_assignment_role_ck check (
    role_key in ('authorized_operator', 'business_contact', 'fleet_manager', 'dispatch_coordinator', 'operations_support')
  ),
  constraint company_leadership_assignment_target_ck check (
    (profile_id is null and roster_member_id is null)
    or
    (role_key = 'authorized_operator' and profile_id is not null and roster_member_id is null)
    or
    (role_key <> 'authorized_operator' and profile_id is null and roster_member_id is not null)
  )
);

alter table core.company_leadership_assignment enable row level security;

create policy company_leadership_assignment_select on core.company_leadership_assignment
  for select using (core.can_access_company(company_id));
create policy company_leadership_assignment_insert on core.company_leadership_assignment
  for insert with check (core.can_admin_company(company_id));
create policy company_leadership_assignment_update on core.company_leadership_assignment
  for update using (core.can_admin_company(company_id)) with check (core.can_admin_company(company_id));
create policy company_leadership_assignment_delete on core.company_leadership_assignment
  for delete using (core.can_admin_company(company_id));

create or replace function core.get_company_leadership_config(p_company_slug text)
returns jsonb language plpgsql stable security definer set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_roles jsonb;
  v_roster jsonb;
  v_operator_profiles jsonb;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_access_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;

  with supported(role_key, role_label, description, sort_order) as (
    values
      ('authorized_operator', 'Authorized Operator', 'Accountable company authority and primary operational owner.', 1),
      ('business_contact', 'Business Contact', 'Primary contact for company and commercial coordination.', 2),
      ('fleet_manager', 'Fleet Manager', 'Owner of vehicles, equipment, inspections, and fleet readiness.', 3),
      ('dispatch_coordinator', 'Dispatch Coordinator', 'Owner of daily dispatch coordination and execution.', 4),
      ('operations_support', 'Operations Support', 'Supporting owner for operational follow-through and coverage.', 5)
  )
  select jsonb_agg(jsonb_build_object(
    'role_key', s.role_key, 'role_label', s.role_label, 'description', s.description,
    'roster_member_id', a.roster_member_id, 'profile_id', a.profile_id, 'assigned_at', a.assigned_at,
    'full_name', coalesce(p.display_name, nullif(concat_ws(' ', p.first_name, p.last_name), ''), r.full_name),
    'email', coalesce(p.email, r.email), 'employment_status', r.employment_status
  ) order by s.sort_order)
  into v_roles
  from supported s
  left join core.company_leadership_assignment a
    on a.company_id = v_company_id and a.role_key = s.role_key
  left join core.company_roster r
    on r.id = a.roster_member_id and r.company_id = v_company_id
  left join core.profiles p on p.id = a.profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_member_id', r.id, 'full_name', r.full_name, 'email', r.email,
    'employment_status', r.employment_status
  ) order by lower(r.full_name), r.id), '[]'::jsonb)
  into v_roster
  from core.company_roster r
  where r.company_id = v_company_id and r.employment_status in ('Active', 'Trainee');

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id,
    'display_name', coalesce(p.display_name, nullif(concat_ws(' ', p.first_name, p.last_name), ''), p.email),
    'email', p.email,
    'relationship_type', m.relationship_type
  ) order by lower(coalesce(p.display_name, p.first_name || ' ' || p.last_name, p.email))), '[]'::jsonb)
  into v_operator_profiles
  from core.company_memberships m
  join core.profiles p on p.id = m.profile_id
  where m.company_id = v_company_id
    and m.membership_status = 'active'
    and m.relationship_type = 'admin'
    and p.profile_status = 'active';

  return jsonb_build_object(
    'company_id', v_company_id,
    'can_manage', core.can_admin_company(v_company_id),
    'roles', coalesce(v_roles, '[]'::jsonb),
    'roster', v_roster,
    'operator_profiles', v_operator_profiles
  );
end;
$$;

create or replace function core.update_company_leadership_assignment(
  p_company_slug text, p_role_key text, p_roster_member_id uuid, p_profile_id uuid
) returns jsonb language plpgsql security definer set search_path = core, public
as $$
declare v_company_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then return jsonb_build_object('error', 'Company not found.'); end if;
  if not core.can_admin_company(v_company_id) then return jsonb_build_object('error', 'Forbidden.'); end if;
  if p_role_key not in ('authorized_operator', 'business_contact', 'fleet_manager', 'dispatch_coordinator', 'operations_support')
    then return jsonb_build_object('error', 'Unsupported leadership role.'); end if;
  if p_role_key = 'authorized_operator' and p_roster_member_id is not null
    then return jsonb_build_object('error', 'Authorized Operator must be linked to an app profile, not the workforce roster.'); end if;
  if p_role_key <> 'authorized_operator' and p_profile_id is not null
    then return jsonb_build_object('error', 'Workforce leadership roles must be linked to the company roster.'); end if;
  if p_profile_id is not null and not exists (
    select 1 from core.company_memberships m
    join core.profiles p on p.id = m.profile_id
    where m.company_id = v_company_id and m.profile_id = p_profile_id
      and m.membership_status = 'active' and m.relationship_type = 'admin'
      and p.profile_status = 'active'
  ) then return jsonb_build_object('error', 'Authorized Operator profile is not an active company administrator.'); end if;
  if p_roster_member_id is not null and not exists (
    select 1 from core.company_roster r
    where r.id = p_roster_member_id and r.company_id = v_company_id
      and r.employment_status in ('Active', 'Trainee')
  ) then return jsonb_build_object('error', 'Roster member is not eligible for this company.'); end if;

  insert into core.company_leadership_assignment (
    company_id, role_key, roster_member_id, profile_id, assigned_by_profile_id, assigned_at, updated_at
  ) values (
    v_company_id, p_role_key, p_roster_member_id, p_profile_id, core.current_profile_id(),
    case when coalesce(p_roster_member_id, p_profile_id) is null then null else now() end, now()
  )
  on conflict (company_id, role_key) do update set
    roster_member_id = excluded.roster_member_id,
    profile_id = excluded.profile_id,
    assigned_by_profile_id = excluded.assigned_by_profile_id,
    assigned_at = excluded.assigned_at,
    updated_at = now();

  return core.get_company_leadership_config(p_company_slug);
end;
$$;

create or replace function public.get_company_leadership_config(p_company_slug text)
returns jsonb language sql stable security definer set search_path = core, public
as $$ select core.get_company_leadership_config(p_company_slug); $$;

create or replace function public.update_company_leadership_assignment(
  p_company_slug text, p_role_key text, p_roster_member_id uuid, p_profile_id uuid
) returns jsonb language sql security definer set search_path = core, public
as $$ select core.update_company_leadership_assignment(p_company_slug, p_role_key, p_roster_member_id, p_profile_id); $$;

revoke all on function public.get_company_leadership_config(text) from public;
revoke all on function public.update_company_leadership_assignment(text, text, uuid, uuid) from public;
grant execute on function public.get_company_leadership_config(text) to authenticated, service_role;
grant execute on function public.update_company_leadership_assignment(text, text, uuid, uuid) to authenticated, service_role;
grant select, insert, update, delete on core.company_leadership_assignment to authenticated, service_role;

comment on table core.company_leadership_assignment is
  'Governed leadership: Authorized Operator links to a company app profile; workforce leaders link to roster members.';
