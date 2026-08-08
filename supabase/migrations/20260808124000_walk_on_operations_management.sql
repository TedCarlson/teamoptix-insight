-- Operations-facing management contract for reusable walk-on rows.

create or replace view public.company_walk_on_assignment_v
with (security_invoker = true) as
select
  assignment.id as assignment_id,
  assignment.company_id,
  company.company_slug,
  assignment.walk_on_driver_id,
  assignment.roster_member_id,
  roster.full_name,
  identity.dswid,
  assignment.workforce_unit_id,
  unit.unit_name as workforce_unit_name,
  assignment.service_date,
  assignment.assignment_status,
  assignment.note,
  payroll.id as payroll_event_id,
  payroll.event_status as payroll_event_status,
  payroll.pay_treatment,
  payroll.override_daily_pay_rate,
  assignment.created_at,
  assignment.updated_at
from core.company_walk_on_assignment assignment
join core.companies company on company.id = assignment.company_id
join core.company_roster roster
  on roster.id = assignment.roster_member_id
 and roster.company_id = assignment.company_id
left join core.company_roster_identity_v identity
  on identity.roster_id = assignment.roster_member_id
left join core.company_walk_on_workforce_unit unit
  on unit.id = assignment.workforce_unit_id
left join core.company_payroll_work_event payroll
  on payroll.company_id = assignment.company_id
 and payroll.roster_member_id = assignment.roster_member_id
 and payroll.service_date = assignment.service_date
 and payroll.event_type = 'WALK_ON_DAY'
 and payroll.event_status = 'ACTIVE';

create or replace function public.manage_company_walk_on_roster_member(
  p_company_slug text,
  p_roster_member_id uuid,
  p_full_name text,
  p_dswid text,
  p_workforce_unit_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_walk_on_id uuid;
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_dswid text := nullif(btrim(coalesce(p_dswid, '')), '');
  v_status text := upper(btrim(coalesce(p_status, '')));
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;
  if v_full_name is null or v_dswid is null then
    raise exception 'Walk-on name and DSWID are required.';
  end if;
  if v_status not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Walk-on status must be ACTIVE or ARCHIVED.';
  end if;
  if not exists (
    select 1
    from core.company_walk_on_workforce_unit unit
    where unit.id = p_workforce_unit_id
      and unit.company_id = v_company_id
      and unit.status = 'ACTIVE'
  ) then
    raise exception 'Active workforce unit not found for this company.';
  end if;

  select walk_on.id into v_walk_on_id
  from core.walk_on_driver walk_on
  join core.company_roster roster
    on roster.id = walk_on.candidate_roster_id
   and roster.company_id = walk_on.company_id
  where walk_on.company_id = v_company_id
    and walk_on.candidate_roster_id = p_roster_member_id
    and roster.roster_record_kind = 'WALK_ON';

  if v_walk_on_id is null then
    raise exception 'Walk-on roster row not found for this company.';
  end if;

  if exists (
    select 1
    from core.company_roster_identifier identifier
    join core.company_roster roster on roster.id = identifier.roster_id
    where roster.company_id = v_company_id
      and roster.id <> p_roster_member_id
      and identifier.identifier_type = 'dswid'
      and regexp_replace(upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
          regexp_replace(upper(v_dswid), '[^A-Z0-9]+', '', 'g')
  ) then
    raise exception 'DSWID is already assigned to another roster row in this company.';
  end if;

  update core.company_roster
  set
    full_name = v_full_name,
    employment_status = 'Support',
    roster_record_kind = 'WALK_ON'
  where id = p_roster_member_id
    and company_id = v_company_id;

  insert into core.company_roster_identifier (
    roster_id,
    identifier_type,
    identifier_value
  ) values (
    p_roster_member_id,
    'dswid',
    v_dswid
  )
  on conflict (roster_id, identifier_type) do update set
    identifier_value = excluded.identifier_value;

  update core.walk_on_driver
  set
    full_name = v_full_name,
    normalized_name = lower(regexp_replace(v_full_name, '\s+', ' ', 'g')),
    workforce_unit_id = p_workforce_unit_id,
    status = v_status,
    updated_at = now()
  where id = v_walk_on_id;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at,
    created_by_profile_id
  ) values (
    v_company_id,
    p_roster_member_id,
    'operations',
    case when v_status = 'ARCHIVED' then 'walk_on_archived' else 'walk_on_updated' end,
    case when v_status = 'ARCHIVED'
      then 'Walk-on roster row archived.'
      else 'Walk-on roster row updated.'
    end,
    jsonb_build_object(
      'source', 'operations_walk_on_management',
      'dswid', v_dswid,
      'workforce_unit_id', p_workforce_unit_id,
      'status', v_status
    ),
    now(),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'walk_on_driver_id', v_walk_on_id,
    'roster_member_id', p_roster_member_id,
    'full_name', v_full_name,
    'dswid', v_dswid,
    'workforce_unit_id', p_workforce_unit_id,
    'status', v_status
  );
end;
$$;

revoke all on function public.manage_company_walk_on_roster_member(
  text, uuid, text, text, uuid, text
) from public;
grant execute on function public.manage_company_walk_on_roster_member(
  text, uuid, text, text, uuid, text
) to authenticated, service_role;

grant select on public.company_walk_on_assignment_v to authenticated, service_role;

notify pgrst, 'reload schema';
