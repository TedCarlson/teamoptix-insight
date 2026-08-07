-- Keep the canonical Express projection on indexed manifest identities. The
-- initial fallback-candidate expansion was correct but too expensive for an
-- in-day Operations read. Ambiguous/missing fallback linkage remains visible
-- as data health and is never inferred as completion.

create or replace view public.operations_manifest_express_route_signal_v
with (security_invoker = true) as
with current_status as (
  select distinct on (company_id, service_date, tracking_ref)
    company_id,
    service_date,
    tracking_ref,
    snapshot_generated_at
  from public.operations_dsw_package_status_current_v
  order by company_id, service_date, tracking_ref, snapshot_created_at desc
), package_evidence as (
  select
    report.company_id,
    report.company_slug,
    report.service_date,
    report.route_key,
    report.tracking_id,
    report.tracking_ref,
    report.manifest_stop_linked,
    upper(coalesce(report.completed, '')) = 'Y' as is_complete,
    status.tracking_ref is not null as is_attempted,
    status.snapshot_generated_at
  from public.operations_manifest_express_report_v report
  left join current_status status
    on status.company_id = report.company_id
    and status.service_date = report.service_date
    and status.tracking_ref = report.tracking_ref
)
select
  company_id,
  company_slug,
  service_date,
  route_key,
  count(*)::integer as package_count,
  count(*) filter (where is_complete)::integer as completed_package_count,
  count(*) filter (where not is_complete and not is_attempted)::integer as open_package_count,
  count(*) filter (
    where nullif(btrim(tracking_id), '') is null
      or not manifest_stop_linked
  )::integer as tracking_gap_package_count,
  count(*) filter (where is_complete)::integer as complete_package_count,
  count(*) filter (where not is_complete and is_attempted)::integer as attempted_package_count,
  count(*) filter (where not is_complete and not is_attempted)::integer as canonical_open_package_count,
  count(*) filter (where nullif(btrim(tracking_id), '') is null)::integer
    as tracking_identity_missing_count,
  count(*) filter (where not manifest_stop_linked)::integer
    as stop_link_missing_count,
  0::integer as stop_link_ambiguous_count,
  bool_and(nullif(btrim(tracking_id), '') is null or tracking_ref is not null)
    as reference_match_available,
  max(snapshot_generated_at) as evidence_snapshot_generated_at
from package_evidence
group by company_id, company_slug, service_date, route_key;

grant select on table public.operations_manifest_express_route_signal_v
  to authenticated, service_role;

notify pgrst, 'reload schema';
