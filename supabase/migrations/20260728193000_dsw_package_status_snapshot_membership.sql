-- Preserve exact membership for each DSW All Status Code Packages snapshot.
-- The durable fact table intentionally retains package-code history throughout
-- the day, while this table identifies only the packages present in a specific
-- snapshot so operational UI can distinguish current open evidence from history.

create table if not exists core.operations_dsw_package_status_observation (
  snapshot_id uuid not null
    references core.operations_dsw_package_status_snapshot(id)
    on delete cascade,
  company_id uuid not null
    references core.companies(id)
    on delete cascade,
  service_date date not null,
  contract_number text not null,
  tracking_ref text not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, tracking_ref),
  constraint operations_dsw_package_observation_contract_ck
    check (contract_number ~ '^C[0-9]+$'),
  constraint operations_dsw_package_observation_tracking_ref_ck
    check (tracking_ref ~ '^v[0-9]+_[a-f0-9]{64}$')
);

create index if not exists operations_dsw_package_observation_scope_idx
  on core.operations_dsw_package_status_observation
    (company_id, service_date desc, contract_number, snapshot_id);

alter table core.operations_dsw_package_status_observation
  enable row level security;

drop policy if exists operations_dsw_package_observation_owner_select
  on core.operations_dsw_package_status_observation;
create policy operations_dsw_package_observation_owner_select
on core.operations_dsw_package_status_observation
for select to authenticated
using (core.is_platform_owner());

create or replace function
  public.record_operations_dsw_package_status_snapshot_membership(
    p_snapshot_id uuid,
    p_company_id uuid,
    p_service_date date,
    p_tracking_refs text[]
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_contract_number text;
  v_expected_count integer;
  v_observed_count integer;
  v_distinct_count integer;
  v_inserted_count integer;
begin
  select snapshot.contract_number, snapshot.observed_package_count
  into v_contract_number, v_expected_count
  from core.operations_dsw_package_status_snapshot snapshot
  where snapshot.id = p_snapshot_id
    and snapshot.company_id = p_company_id
    and snapshot.service_date = p_service_date;

  if not found then
    raise exception
      'Package status snapshot does not match its company and service date.';
  end if;

  select count(*)::integer, count(distinct tracking_ref)::integer
  into v_observed_count, v_distinct_count
  from unnest(coalesce(p_tracking_refs, array[]::text[]))
    as refs(tracking_ref);

  if v_observed_count <> v_expected_count
     or v_distinct_count <> v_expected_count then
    raise exception
      'Package status membership reconciliation failed: expected %, observed %, distinct %.',
      v_expected_count, v_observed_count, v_distinct_count;
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_tracking_refs, array[]::text[]))
      as refs(tracking_ref)
    where tracking_ref !~ '^v[0-9]+_[a-f0-9]{64}$'
  ) then
    raise exception 'Package status membership contains an invalid reference.';
  end if;

  insert into core.operations_dsw_package_status_observation (
    snapshot_id,
    company_id,
    service_date,
    contract_number,
    tracking_ref
  )
  select
    p_snapshot_id,
    p_company_id,
    p_service_date,
    v_contract_number,
    tracking_ref
  from unnest(coalesce(p_tracking_refs, array[]::text[]))
    as refs(tracking_ref)
  on conflict (snapshot_id, tracking_ref) do nothing;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'expected_package_count', v_expected_count,
    'observed_package_count', v_observed_count,
    'inserted_membership_count', v_inserted_count
  );
end;
$$;

create or replace view public.operations_dsw_package_status_current_v
with (security_invoker = true)
as
with latest_snapshot as (
  select distinct on (
    snapshot.company_id,
    snapshot.service_date,
    snapshot.contract_number
  )
    snapshot.id,
    snapshot.company_id,
    snapshot.service_date,
    snapshot.contract_number,
    snapshot.snapshot_kind,
    snapshot.generated_at,
    snapshot.created_at
  from core.operations_dsw_package_status_snapshot snapshot
  where snapshot.import_status = 'COMPLETE'
  order by
    snapshot.company_id,
    snapshot.service_date,
    snapshot.contract_number,
    snapshot.created_at desc,
    snapshot.id desc
)
select
  fact.id,
  fact.company_id,
  observation.snapshot_id,
  fact.service_date,
  fact.contract_number,
  fact.tracking_ref,
  fact.tracking_ref_version,
  fact.work_area_name,
  fact.work_area_number,
  fact.psa_csa,
  fact.service_provider,
  fact.vision_label,
  fact.vision_label_at_local,
  fact.vehicle_number,
  fact.vsa_status_code,
  fact.star_status_code,
  fact.star_scan_at_local,
  latest_snapshot.snapshot_kind,
  latest_snapshot.generated_at as snapshot_generated_at,
  latest_snapshot.created_at as snapshot_created_at,
  fact.first_observed_at,
  fact.last_observed_at,
  fact.updated_at
from latest_snapshot
join core.operations_dsw_package_status_observation observation
  on observation.snapshot_id = latest_snapshot.id
join core.operations_dsw_package_status_fact fact
  on fact.company_id = observation.company_id
  and fact.service_date = observation.service_date
  and fact.contract_number = observation.contract_number
  and fact.tracking_ref = observation.tracking_ref;

revoke all on core.operations_dsw_package_status_observation from public;
grant select on core.operations_dsw_package_status_observation
  to authenticated;
grant all on core.operations_dsw_package_status_observation
  to service_role;

revoke all on function
  public.record_operations_dsw_package_status_snapshot_membership(
    uuid, uuid, date, text[]
  )
from public;
grant execute on function
  public.record_operations_dsw_package_status_snapshot_membership(
    uuid, uuid, date, text[]
  )
to service_role;

revoke all on public.operations_dsw_package_status_current_v from public;
grant select on public.operations_dsw_package_status_current_v
  to service_role;
