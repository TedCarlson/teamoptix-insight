-- Production-safe, read-only verification for the roster identifier consumer
-- refactor. A passing result is required before the legacy operations columns
-- are considered eligible for retirement.

with authoritative as (
  select
    roster.id as roster_id,
    roster.company_id,
    max(identifier.identifier_value) filter (
      where identifier.identifier_type = 'fx_id'
    ) as fx_id,
    max(identifier.identifier_value) filter (
      where identifier.identifier_type = 'dswid'
    ) as dswid
  from core.company_roster roster
  left join core.company_roster_identifier identifier
    on identifier.roster_id = roster.id
  group by roster.id, roster.company_id
), duplicate_types as (
  select roster_id, identifier_type, count(*) as value_count
  from core.company_roster_identifier
  group by roster_id, identifier_type
  having count(*) > 1
), resolver_mismatches as (
  select authoritative.*
  from authoritative
  where (
    authoritative.dswid is not null
    and core.resolve_roster_identity(
      authoritative.company_id,
      null,
      authoritative.dswid,
      null
    ) is distinct from authoritative.roster_id
  ) or (
    authoritative.fx_id is not null
    and core.resolve_roster_identity(
      authoritative.company_id,
      null,
      null,
      authoritative.fx_id
    ) is distinct from authoritative.roster_id
  )
), payroll_mismatches as (
  select authoritative.roster_id
  from authoritative
  left join core.payroll_identity_resolved payroll
    on payroll.roster_member_id = authoritative.roster_id
  where payroll.roster_member_id is null
    or payroll.fx_id is distinct from authoritative.fx_id
    or payroll.dswid is distinct from authoritative.dswid
), legacy_drift as (
  select authoritative.roster_id
  from authoritative
  left join core.company_roster_operations_fact legacy
    on legacy.roster_id = authoritative.roster_id
  where legacy.fx_id is distinct from authoritative.fx_id
    or legacy.dswid is distinct from authoritative.dswid
)
select
  (select count(*) from authoritative) as roster_rows,
  (select count(*) from duplicate_types) as duplicate_identifier_types,
  (select count(*) from resolver_mismatches) as resolver_mismatches,
  (select count(*) from payroll_mismatches) as payroll_identity_mismatches,
  (select count(*) from legacy_drift) as legacy_drift_rows,
  case
    when (select count(*) from duplicate_types) = 0
      and (select count(*) from resolver_mismatches) = 0
      and (select count(*) from payroll_mismatches) = 0
    then 'PASS'
    else 'FAIL'
  end as authoritative_consumer_status;

-- Retirement gate: after application and database consumers are migrated,
-- this query must return no rows other than the two legacy columns themselves,
-- their indexes, and the compatibility view scheduled for removal.
select
  dependent_ns.nspname as dependent_schema,
  dependent_class.relname as dependent_object,
  dependent_class.relkind as dependent_kind,
  source_attribute.attname as legacy_column
from pg_depend dependency
join pg_attribute source_attribute
  on source_attribute.attrelid = dependency.refobjid
 and source_attribute.attnum = dependency.refobjsubid
join pg_class source_class
  on source_class.oid = source_attribute.attrelid
join pg_namespace source_ns
  on source_ns.oid = source_class.relnamespace
left join pg_rewrite rewrite
  on rewrite.oid = dependency.objid
left join pg_class dependent_class
  on dependent_class.oid = rewrite.ev_class
left join pg_namespace dependent_ns
  on dependent_ns.oid = dependent_class.relnamespace
where source_ns.nspname = 'core'
  and source_class.relname = 'company_roster_operations_fact'
  and source_attribute.attname in ('fx_id', 'dswid')
order by dependent_schema, dependent_object, legacy_column;
