-- Keep the public walk-on views security-invoker while allowing authenticated
-- company users to reach the RLS-protected source rows. Avoid granting access
-- to the internal aggregate identity view; read only the DSWID identifier used
-- by this operations surface.

grant select on core.walk_on_driver to authenticated, service_role;
grant select on core.company_walk_on_workforce_unit to authenticated, service_role;
grant select on core.company_walk_on_assignment to authenticated, service_role;

create or replace view public.company_walk_on_roster_v
with (security_invoker = true) as
select
  walk_on.id as walk_on_driver_id,
  walk_on.company_id,
  company.company_slug,
  walk_on.candidate_roster_id as roster_member_id,
  roster.full_name,
  dsw.identifier_value as dswid,
  walk_on.workforce_unit_id,
  unit.unit_name as workforce_unit_name,
  walk_on.first_seen_date,
  walk_on.last_seen_date,
  walk_on.dispatch_count,
  walk_on.status,
  walk_on.created_at,
  walk_on.updated_at
from core.walk_on_driver walk_on
join core.companies company on company.id = walk_on.company_id
join core.company_roster roster
  on roster.id = walk_on.candidate_roster_id
 and roster.company_id = walk_on.company_id
left join core.company_roster_identifier dsw
  on dsw.roster_id = roster.id
 and dsw.identifier_type = 'dswid'
left join core.company_walk_on_workforce_unit unit
  on unit.id = walk_on.workforce_unit_id;

create or replace view public.company_walk_on_assignment_v
with (security_invoker = true) as
select
  assignment.id as assignment_id,
  assignment.company_id,
  company.company_slug,
  assignment.walk_on_driver_id,
  assignment.roster_member_id,
  roster.full_name,
  dsw.identifier_value as dswid,
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
left join core.company_roster_identifier dsw
  on dsw.roster_id = assignment.roster_member_id
 and dsw.identifier_type = 'dswid'
left join core.company_walk_on_workforce_unit unit
  on unit.id = assignment.workforce_unit_id
left join core.company_payroll_work_event payroll
  on payroll.company_id = assignment.company_id
 and payroll.roster_member_id = assignment.roster_member_id
 and payroll.service_date = assignment.service_date
 and payroll.event_type = 'WALK_ON_DAY'
 and payroll.event_status = 'ACTIVE';

grant select on public.company_walk_on_roster_v to authenticated, service_role;
grant select on public.company_walk_on_assignment_v to authenticated, service_role;

notify pgrst, 'reload schema';
