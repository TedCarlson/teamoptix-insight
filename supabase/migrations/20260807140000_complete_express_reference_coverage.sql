-- All Codes ingestion already has the protected tracking references and raw
-- identifiers in memory. Attach those references to matching manifest facts
-- before the transient identifiers are discarded, then mark the snapshot as a
-- complete manifest-match pass. This makes Open a provable absence from the
-- current All Codes snapshot without requiring every UI runtime to hold HMAC
-- configuration.

create or replace function public.attach_operations_dsw_manifest_tracking_refs(
  p_snapshot_id uuid,
  p_company_id uuid,
  p_service_date date,
  p_rows jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_count integer := 0;
begin
  if not exists (
    select 1
    from core.operations_dsw_package_status_snapshot snapshot
    where snapshot.id = p_snapshot_id
      and snapshot.company_id = p_company_id
      and snapshot.service_date = p_service_date
      and snapshot.import_status = 'COMPLETE'
  ) then
    raise exception 'Completed package-status snapshot not found';
  end if;

  with refs as (
    select distinct on (btrim(row_data.tracking_id))
      btrim(row_data.tracking_id) as tracking_id,
      btrim(row_data.tracking_ref) as tracking_ref,
      btrim(row_data.tracking_ref_version) as tracking_ref_version
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data(
      tracking_id text,
      tracking_ref text,
      tracking_ref_version text
    )
    where nullif(btrim(row_data.tracking_id), '') is not null
      and btrim(row_data.tracking_ref) ~ '^v[0-9]+_[a-f0-9]{64}$'
      and btrim(row_data.tracking_ref_version) ~ '^v[0-9]+$'
    order by btrim(row_data.tracking_id), btrim(row_data.tracking_ref)
  )
  update core.operations_delivery_manifest_package package
  set
    tracking_ref = refs.tracking_ref,
    tracking_ref_version = refs.tracking_ref_version,
    tracking_ref_attached_at = now()
  from refs
  where package.company_id = p_company_id
    and package.service_date = p_service_date
    and package.tracking_id = refs.tracking_id;

  get diagnostics v_count = row_count;

  update core.operations_dsw_package_status_snapshot
  set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'manifest_reference_match_complete', true,
    'manifest_reference_match_completed_at', now(),
    'manifest_reference_match_count', v_count
  )
  where id = p_snapshot_id;

  return v_count;
end;
$$;

revoke all on function public.attach_operations_dsw_manifest_tracking_refs(uuid, uuid, date, jsonb) from public;
grant execute on function public.attach_operations_dsw_manifest_tracking_refs(uuid, uuid, date, jsonb) to service_role;

create or replace view public.operations_manifest_express_route_signal_v
with (security_invoker = true) as
with latest_snapshot as (
  select distinct on (company_id, service_date, contract_number)
    company_id,
    service_date,
    contract_number,
    metadata_json
  from core.operations_dsw_package_status_snapshot
  where import_status = 'COMPLETE'
  order by company_id, service_date, contract_number, created_at desc, id desc
), match_coverage as (
  select
    company_id,
    service_date,
    bool_and(coalesce((metadata_json ->> 'manifest_reference_match_complete')::boolean, false))
      as reference_match_available
  from latest_snapshot
  group by company_id, service_date
), current_status as (
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
    coalesce(coverage.reference_match_available, false) as reference_match_available,
    status.snapshot_generated_at
  from public.operations_manifest_express_report_v report
  left join current_status status
    on status.company_id = report.company_id
    and status.service_date = report.service_date
    and status.tracking_ref = report.tracking_ref
  left join match_coverage coverage
    on coverage.company_id = report.company_id
    and coverage.service_date = report.service_date
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
  bool_and(reference_match_available) as reference_match_available,
  max(snapshot_generated_at) as evidence_snapshot_generated_at
from package_evidence
group by company_id, company_slug, service_date, route_key;

grant select on table public.operations_manifest_express_route_signal_v
  to authenticated, service_role;

create or replace view public.operations_manifest_express_package_signal_v
with (security_invoker = true) as
with latest_snapshot as (
  select distinct on (company_id, service_date, contract_number)
    company_id,
    service_date,
    contract_number,
    metadata_json
  from core.operations_dsw_package_status_snapshot
  where import_status = 'COMPLETE'
  order by company_id, service_date, contract_number, created_at desc, id desc
), match_coverage as (
  select
    company_id,
    service_date,
    bool_and(coalesce((metadata_json ->> 'manifest_reference_match_complete')::boolean, false))
      as reference_match_available
  from latest_snapshot
  group by company_id, service_date
), current_status as (
  select distinct on (company_id, service_date, tracking_ref)
    company_id,
    service_date,
    tracking_ref
  from public.operations_dsw_package_status_current_v
  order by company_id, service_date, tracking_ref, snapshot_created_at desc
)
select
  report.company_id,
  report.company_slug,
  report.service_date,
  report.route_key,
  report.route_label,
  report.tracking_id,
  report.st_number,
  report.sid,
  case
    when upper(coalesce(report.completed, '')) = 'Y' then 'COMPLETED'
    when status.tracking_ref is not null then 'CODED_ATTEMPT'
    else 'OPEN'
  end as signal_state,
  jsonb_strip_nulls(jsonb_build_object(
    'tracking_identity_missing',
      case when nullif(btrim(report.tracking_id), '') is null then true end,
    'stop_link_missing', case when not report.manifest_stop_linked then true end,
    'reference_match_unavailable',
      case when not coalesce(coverage.reference_match_available, false) then true end
  )) as data_health
from public.operations_manifest_express_report_v report
left join current_status status
  on status.company_id = report.company_id
  and status.service_date = report.service_date
  and status.tracking_ref = report.tracking_ref
left join match_coverage coverage
  on coverage.company_id = report.company_id
  and coverage.service_date = report.service_date;

grant select on table public.operations_manifest_express_package_signal_v
  to authenticated, service_role;

notify pgrst, 'reload schema';
