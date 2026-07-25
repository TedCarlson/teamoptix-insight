alter table core.company_leadership_assignment
  drop constraint company_leadership_assignment_role_ck;

update core.company_leadership_assignment
set role_key = 'hr',
    updated_at = now()
where role_key = 'dispatch_coordinator';

delete from core.company_leadership_assignment
where role_key = 'operations_support';

alter table core.company_leadership_assignment
  add constraint company_leadership_assignment_role_ck check (
    role_key in ('authorized_operator', 'business_contact', 'fleet_manager', 'hr')
  );

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
      ('hr', 'HR', 'Owner of workforce administration, employee support, and people operations.', 4)
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
  if p_role_key not in ('authorized_operator', 'business_contact', 'fleet_manager', 'hr')
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
