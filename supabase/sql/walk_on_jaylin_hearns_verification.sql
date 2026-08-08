-- Read-only acceptance check for the first walk-on case.
-- Expected after using the action drawer and generating the payroll override:
-- one row with every *_linked field true.

with beacon as (
  select id
  from core.companies
  where lower(company_name) like '%beacon point%'
  order by created_at
  limit 1
),
jaylin as (
  select
    roster.id as roster_member_id,
    roster.company_id,
    roster.full_name,
    identifier.identifier_value as dswid
  from core.company_roster roster
  join beacon on beacon.id = roster.company_id
  join core.company_roster_identifier identifier
    on identifier.roster_id = roster.id
   and identifier.identifier_type = 'dswid'
  where roster.roster_record_kind = 'WALK_ON'
    and regexp_replace(upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
        regexp_replace(upper('HEARNS,JAYLEN VIRGIL'), '[^A-Z0-9]+', '', 'g')
)
select
  jaylin.roster_member_id,
  jaylin.full_name,
  jaylin.dswid,
  exists (
    select 1
    from core.walk_on_driver walk_on
    where walk_on.company_id = jaylin.company_id
      and walk_on.candidate_roster_id = jaylin.roster_member_id
  ) as walk_on_roster_linked,
  exists (
    select 1
    from core.company_walk_on_assignment assignment
    where assignment.company_id = jaylin.company_id
      and assignment.roster_member_id = jaylin.roster_member_id
      and assignment.service_date = date '2026-08-07'
      and assignment.assignment_status = 'ACTIVE'
  ) as dated_assignment_linked,
  exists (
    select 1
    from core.operations_report_raw_row raw
    where raw.company_id = jaylin.company_id
      and coalesce(raw.source_dswid, raw.source_driver_name) = 'HEARNS,JAYLEN VIRGIL'
  ) as dsw_production_present,
  exists (
    select 1
    from core.company_payroll_work_event event
    where event.company_id = jaylin.company_id
      and event.roster_member_id = jaylin.roster_member_id
      and event.service_date = date '2026-08-07'
      and event.event_type = 'WALK_ON_DAY'
      and event.event_status = 'ACTIVE'
  ) as payroll_override_linked,
  exists (
    select 1
    from core.payroll_activity_fact fact
    where fact.company_id = jaylin.company_id
      and fact.roster_member_id = jaylin.roster_member_id
      and fact.service_date = date '2026-08-07'
      and fact.attendance_status = 'present'
  ) as payroll_activity_linked
from jaylin;
