-- Express performance is an exclusive package state contract:
-- Complete | Attempted | Open. Linkage/configuration defects are data health,
-- never a fourth delivery state and never proof of completion.

alter table core.operations_delivery_manifest_package
  add column if not exists tracking_ref text,
  add column if not exists tracking_ref_version text,
  add column if not exists tracking_ref_attached_at timestamptz;

alter table core.operations_delivery_manifest_package
  drop constraint if exists operations_delivery_manifest_package_tracking_ref_ck;

alter table core.operations_delivery_manifest_package
  add constraint operations_delivery_manifest_package_tracking_ref_ck
  check (
    (tracking_ref is null and tracking_ref_version is null)
    or (
      tracking_ref ~ '^v[0-9]+_[a-f0-9]{64}$'
      and tracking_ref_version ~ '^v[0-9]+$'
    )
  ) not valid;

create index if not exists operations_delivery_manifest_package_tracking_ref_idx
  on core.operations_delivery_manifest_package
    (company_id, service_date, tracking_ref)
  where tracking_ref is not null;

create or replace function public.attach_operations_delivery_manifest_tracking_refs(
  p_artifact_id uuid,
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
    from core.operations_manifest_artifact artifact
    where artifact.id = p_artifact_id
      and artifact.manifest_type = 'delivery'
  ) then
    raise exception 'Delivery manifest artifact not found';
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
  where package.source_artifact_id = p_artifact_id
    and package.tracking_id = refs.tracking_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.attach_operations_delivery_manifest_tracking_refs(uuid, jsonb) from public;
grant execute on function public.attach_operations_delivery_manifest_tracking_refs(uuid, jsonb) to service_role;

create or replace view public.operations_manifest_express_report_v
with (security_invoker = true) as
select
  package.company_id,
  company.company_slug,
  package.service_date,
  package.route_key,
  artifact.route_label,
  package.source_capture_plan_id as capture_plan_id,
  artifact.capture_plan_route_id,
  package.source_artifact_id,
  package.st_number,
  package.sid,
  package.tracking_id,
  package.prem_svc_raw,
  package.recipient,
  package.contact_name,
  package.address_line_1,
  package.address_line_2,
  package.city,
  package.state,
  package.postal_code,
  stop.completed,
  stop.delivery_time_begin,
  stop.delivery_time_end,
  stop.stop_instructions,
  package.is_residential,
  package.is_signature,
  package.is_hazmat,
  package.is_collection,
  artifact.artifact_status,
  artifact.captured_at,
  artifact.processed_at,
  package.created_at,
  location.latitude,
  location.longitude,
  location.geocode_status,
  location.geocode_precision,
  package.tracking_ref,
  package.tracking_ref_version,
  stop.id is not null as manifest_stop_linked
from core.operations_delivery_manifest_package package
join core.companies company on company.id = package.company_id
join core.operations_manifest_artifact artifact
  on artifact.id = package.source_artifact_id
left join core.operations_delivery_manifest_stop stop
  on stop.company_id = package.company_id
  and stop.service_date = package.service_date
  and stop.route_key = package.route_key
  and stop.stop_identity_key = core.operations_delivery_stop_identity(
    package.st_number,
    package.sid,
    package.recipient,
    package.contact_name,
    package.address_line_1,
    package.address_line_2,
    package.city,
    package.state,
    package.postal_code,
    null,
    null
  )
left join core.operations_stop_location_coordinate location
  on location.company_id = package.company_id
  and coalesce(location.sid, '') = coalesce(package.sid, '')
  and location.address_key = core.operations_manifest_address_key(
    package.address_line_1,
    package.address_line_2,
    package.city,
    package.state,
    package.postal_code
  )
where package.is_express = true;

grant select on table public.operations_manifest_express_report_v
  to authenticated, service_role;

create or replace view public.operations_manifest_express_route_signal_v
with (security_invoker = true) as
with stop_candidates as (
  select
    package.id as package_id,
    stop.id as stop_id,
    stop.completed,
    case
      when nullif(btrim(package.sid), '') is not null
        and upper(btrim(stop.sid)) = upper(btrim(package.sid)) then 1
      when nullif(btrim(package.st_number), '') is not null
        and btrim(package.st_number) <> '0'
        and upper(btrim(stop.st_number)) = upper(btrim(package.st_number)) then 2
      else 3
    end as match_priority
  from core.operations_delivery_manifest_package package
  join core.operations_delivery_manifest_stop stop
    on stop.company_id = package.company_id
    and stop.service_date = package.service_date
    and stop.route_key = package.route_key
    and (
      (
        nullif(btrim(package.sid), '') is not null
        and upper(btrim(stop.sid)) = upper(btrim(package.sid))
      )
      or (
        nullif(btrim(package.st_number), '') is not null
        and btrim(package.st_number) <> '0'
        and upper(btrim(stop.st_number)) = upper(btrim(package.st_number))
      )
      or (
        nullif(core.operations_manifest_address_key(
          package.address_line_1, package.address_line_2, package.city,
          package.state, package.postal_code
        ), '') is not null
        and core.operations_manifest_address_key(
          stop.address_line_1, stop.address_line_2, stop.city,
          stop.state, stop.postal_code
        ) = core.operations_manifest_address_key(
          package.address_line_1, package.address_line_2, package.city,
          package.state, package.postal_code
        )
      )
    )
  where package.is_express = true
), candidates_at_best_priority as (
  select candidate.*
  from stop_candidates candidate
  join (
    select package_id, min(match_priority) as match_priority
    from stop_candidates
    group by package_id
  ) best using (package_id, match_priority)
), resolved_stop as (
  select
    package_id,
    case when count(*) = 1 then (array_agg(stop_id))[1] end as stop_id,
    case when count(*) = 1 then max(completed) end as completed,
    count(*) > 1 as ambiguous
  from candidates_at_best_priority
  group by package_id
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
    package.company_id,
    company.company_slug,
    package.service_date,
    package.route_key,
    package.tracking_id,
    package.tracking_ref,
    resolved.stop_id,
    coalesce(resolved.ambiguous, false) as stop_link_ambiguous,
    upper(coalesce(resolved.completed, '')) = 'Y' as is_complete,
    status.tracking_ref is not null as is_attempted,
    status.snapshot_generated_at
  from core.operations_delivery_manifest_package package
  join core.companies company on company.id = package.company_id
  left join resolved_stop resolved on resolved.package_id = package.id
  left join current_status status
    on status.company_id = package.company_id
    and status.service_date = package.service_date
    and status.tracking_ref = package.tracking_ref
  where package.is_express = true
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
      or stop_id is null
      or stop_link_ambiguous
  )::integer as tracking_gap_package_count,
  count(*) filter (where is_complete)::integer as complete_package_count,
  count(*) filter (where not is_complete and is_attempted)::integer as attempted_package_count,
  count(*) filter (where not is_complete and not is_attempted)::integer as canonical_open_package_count,
  count(*) filter (where nullif(btrim(tracking_id), '') is null)::integer
    as tracking_identity_missing_count,
  count(*) filter (where stop_id is null)::integer as stop_link_missing_count,
  count(*) filter (where stop_link_ambiguous)::integer as stop_link_ambiguous_count,
  bool_and(nullif(btrim(tracking_id), '') is null or tracking_ref is not null)
    as reference_match_available,
  max(snapshot_generated_at) as evidence_snapshot_generated_at
from package_evidence
group by company_id, company_slug, service_date, route_key;

grant select on table public.operations_manifest_express_route_signal_v
  to authenticated, service_role;

create or replace view public.operations_manifest_express_package_signal_v
with (security_invoker = true) as
with current_status as (
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
    'stop_link_missing', case when report.completed is null then true end,
    'reference_match_unavailable',
      case when nullif(btrim(report.tracking_id), '') is not null
        and report.tracking_ref is null then true end
  )) as data_health
from public.operations_manifest_express_report_v report
left join current_status status
  on status.company_id = report.company_id
  and status.service_date = report.service_date
  and status.tracking_ref = report.tracking_ref;

grant select on table public.operations_manifest_express_package_signal_v
  to authenticated, service_role;

create table if not exists core.operations_express_progress_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  source_family text not null,
  source_reference text not null,
  package_count integer not null,
  complete_package_count integer not null,
  attempted_package_count integer not null,
  open_package_count integer not null,
  tracking_identity_missing_count integer not null default 0,
  stop_link_missing_count integer not null default 0,
  stop_link_ambiguous_count integer not null default 0,
  reference_match_available boolean not null default false,
  evidence_snapshot_generated_at timestamptz,
  captured_at timestamptz not null default now(),
  constraint operations_express_progress_snapshot_state_ck check (
    package_count = complete_package_count + attempted_package_count + open_package_count
  ),
  constraint operations_express_progress_snapshot_source_uq unique (
    company_id, service_date, route_key, source_family, source_reference
  )
);

create index if not exists operations_express_progress_snapshot_timeline_idx
  on core.operations_express_progress_snapshot
    (company_id, service_date desc, route_key, captured_at);

alter table core.operations_express_progress_snapshot enable row level security;

drop policy if exists operations_express_progress_snapshot_select_access
  on core.operations_express_progress_snapshot;
create policy operations_express_progress_snapshot_select_access
  on core.operations_express_progress_snapshot
  for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

grant select on table core.operations_express_progress_snapshot to authenticated;
grant all on table core.operations_express_progress_snapshot to service_role;

create or replace view public.operations_express_progress_snapshot_v
with (security_invoker = true) as
select snapshot.*, company.company_slug
from core.operations_express_progress_snapshot snapshot
join core.companies company on company.id = snapshot.company_id;

grant select on table public.operations_express_progress_snapshot_v
  to authenticated, service_role;

create or replace function public.record_operations_express_progress_snapshot(
  p_company_id uuid,
  p_service_date date,
  p_source_family text,
  p_source_reference text
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_count integer := 0;
begin
  if nullif(btrim(p_source_family), '') is null
    or nullif(btrim(p_source_reference), '') is null then
    raise exception 'Express snapshot source is required';
  end if;

  insert into core.operations_express_progress_snapshot (
    company_id, service_date, route_key, source_family, source_reference,
    package_count, complete_package_count, attempted_package_count,
    open_package_count, tracking_identity_missing_count,
    stop_link_missing_count, stop_link_ambiguous_count,
    reference_match_available, evidence_snapshot_generated_at
  )
  select
    signal.company_id,
    signal.service_date,
    signal.route_key,
    upper(btrim(p_source_family)),
    btrim(p_source_reference),
    signal.package_count,
    signal.complete_package_count,
    signal.attempted_package_count,
    signal.canonical_open_package_count,
    signal.tracking_identity_missing_count,
    signal.stop_link_missing_count,
    signal.stop_link_ambiguous_count,
    signal.reference_match_available,
    signal.evidence_snapshot_generated_at
  from public.operations_manifest_express_route_signal_v signal
  where signal.company_id = p_company_id
    and signal.service_date = p_service_date
  on conflict (
    company_id, service_date, route_key, source_family, source_reference
  ) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_operations_express_progress_snapshot(uuid, date, text, text) from public;
grant execute on function public.record_operations_express_progress_snapshot(uuid, date, text, text) to service_role;

-- Legacy gap alerts mixed incomplete volume with evidence configuration. They
-- cannot be translated into a trustworthy package state, so retire them while
-- preserving an auditable resolution note. New runs emit only the canonical
-- performance and data-health signal types.
insert into core.operations_watchlist_note (
  company_id,
  watchlist_item_id,
  note_type,
  body,
  client_visible
)
select
  item.company_id,
  item.id,
  'CORRECTION',
  'Retired during migration to the exclusive Complete | Attempted | Open Express contract. The legacy gap value may have represented unavailable matching configuration rather than missing package evidence.',
  true
from core.operations_watchlist_item item
where item.signal_type = 'EXPRESS_TRACKING_GAP'
  and item.status not in ('RESOLVED', 'DISMISSED');

update core.operations_watchlist_item
set
  signal_type = 'EXPRESS_LEGACY_GAP_RETIRED',
  title = 'Retired · legacy Express gap signal',
  detail = 'Superseded by exclusive Express performance states and separate evidence data health.',
  status = 'DISMISSED',
  resolution_class = 'SOURCE_DATA_ERROR',
  resolved_at = coalesce(resolved_at, now()),
  client_visible = false,
  signal_cleared_at = coalesce(signal_cleared_at, now()),
  updated_at = now()
where signal_type = 'EXPRESS_TRACKING_GAP'
  and status not in ('RESOLVED', 'DISMISSED');
