-- Retain a non-reversible package-level operational reference after the
-- identifiable seven-day manifest window. Original tracking IDs, names,
-- street addresses, phones, instructions, and exact coordinates are never
-- copied into this transformed fact layer.

begin;

create table if not exists core.operations_route_package_fact (
  id bigint generated always as identity primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  stop_number text,
  postal_code_5 text,
  tracking_ref text not null,
  tracking_ref_version text not null,
  service_code text,
  execution_status text not null default 'UNKNOWN',
  is_express boolean not null default false,
  is_residential boolean not null default false,
  is_signature boolean not null default false,
  is_hazmat boolean not null default false,
  is_collection boolean not null default false,
  transformed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_package_fact_identity_uidx
    unique (company_id, service_date, route_key, tracking_ref),
  constraint operations_route_package_fact_tracking_ref_ck check (
    tracking_ref ~ '^v[0-9]+_[a-f0-9]{64}$'
    and tracking_ref_version ~ '^v[0-9]+$'
  ),
  constraint operations_route_package_fact_postal_code_ck check (
    postal_code_5 is null or postal_code_5 ~ '^[0-9]{5}$'
  ),
  constraint operations_route_package_fact_execution_ck check (
    execution_status in ('OPEN', 'CLOSED', 'UNKNOWN')
  )
);

create index if not exists operations_route_package_fact_lookup_idx
  on core.operations_route_package_fact (
    company_id,
    service_date desc,
    route_key,
    stop_number
  );

alter table core.operations_route_package_fact enable row level security;

revoke all on core.operations_route_package_fact from public, anon, authenticated;
grant all on core.operations_route_package_fact to service_role;

create or replace view public.operations_route_package_fact_v
with (security_invoker = true) as
select
  fact.company_id,
  fact.service_date,
  fact.route_key,
  fact.stop_number,
  fact.postal_code_5,
  fact.tracking_ref,
  fact.tracking_ref_version,
  fact.service_code,
  fact.execution_status,
  fact.is_express,
  fact.is_residential,
  fact.is_signature,
  fact.is_hazmat,
  fact.is_collection,
  fact.transformed_at
from core.operations_route_package_fact fact;

revoke all on public.operations_route_package_fact_v from public, anon;
revoke all on public.operations_route_package_fact_v from authenticated;
grant select on public.operations_route_package_fact_v to service_role;

create or replace function public.materialize_operations_route_package_facts(
  p_limit integer default 50000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_transformed integer := 0;
begin
  with candidates as (
    select
      package.company_id,
      package.service_date,
      package.route_key,
      nullif(btrim(package.st_number), '') as stop_number,
      substring(coalesce(package.postal_code, '') from '([0-9]{5})')
        as postal_code_5,
      package.tracking_ref,
      package.tracking_ref_version,
      nullif(btrim(package.prem_svc_raw), '') as service_code,
      case
        when upper(coalesce(stop.completed, ''))
          in ('Y', 'YES', 'TRUE', 'COMPLETE', 'COMPLETED', 'CLOSED')
          then 'CLOSED'
        when stop.id is not null then 'OPEN'
        else 'UNKNOWN'
      end as execution_status,
      package.is_express,
      package.is_residential,
      package.is_signature,
      package.is_hazmat,
      package.is_collection
    from core.operations_delivery_manifest_package package
    left join lateral (
      select candidate_stop.id, candidate_stop.completed
      from core.operations_delivery_manifest_stop candidate_stop
      where candidate_stop.company_id = package.company_id
        and candidate_stop.service_date = package.service_date
        and candidate_stop.route_key = package.route_key
        and (
          (nullif(btrim(package.sid), '') is not null
            and btrim(candidate_stop.sid) = btrim(package.sid))
          or (
            nullif(btrim(package.sid), '') is null
            and nullif(btrim(package.st_number), '') is not null
            and btrim(candidate_stop.st_number) = btrim(package.st_number)
          )
        )
      order by candidate_stop.created_at desc, candidate_stop.id desc
      limit 1
    ) stop on true
    where package.tracking_ref is not null
      and package.tracking_ref_version is not null
      and (
        package.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
    order by package.service_date, package.company_id, package.route_key
    limit greatest(1, least(coalesce(p_limit, 50000), 250000))
  )
  insert into core.operations_route_package_fact (
    company_id,
    service_date,
    route_key,
    stop_number,
    postal_code_5,
    tracking_ref,
    tracking_ref_version,
    service_code,
    execution_status,
    is_express,
    is_residential,
    is_signature,
    is_hazmat,
    is_collection,
    transformed_at,
    updated_at
  )
  select
    candidate.company_id,
    candidate.service_date,
    candidate.route_key,
    candidate.stop_number,
    candidate.postal_code_5,
    candidate.tracking_ref,
    candidate.tracking_ref_version,
    candidate.service_code,
    candidate.execution_status,
    candidate.is_express,
    candidate.is_residential,
    candidate.is_signature,
    candidate.is_hazmat,
    candidate.is_collection,
    now(),
    now()
  from candidates candidate
  on conflict (company_id, service_date, route_key, tracking_ref)
  do update set
    stop_number = excluded.stop_number,
    postal_code_5 = excluded.postal_code_5,
    tracking_ref_version = excluded.tracking_ref_version,
    service_code = excluded.service_code,
    execution_status = excluded.execution_status,
    is_express = excluded.is_express,
    is_residential = excluded.is_residential,
    is_signature = excluded.is_signature,
    is_hazmat = excluded.is_hazmat,
    is_collection = excluded.is_collection,
    transformed_at = excluded.transformed_at,
    updated_at = now();
  get diagnostics v_transformed = row_count;

  return jsonb_build_object(
    'transformed_package_count', v_transformed,
    'transformed_at', now()
  );
end;
$$;

revoke all on function public.materialize_operations_route_package_facts(integer)
  from public, anon, authenticated;
grant execute on function public.materialize_operations_route_package_facts(integer)
  to service_role;

-- A delivery artifact cannot be purged until every package that had a durable
-- tracking reference has reached the transformed fact table. A missing
-- tracking reference blocks purge instead of silently destroying evidence.
create or replace function public.list_operations_manifest_history_artifacts_for_purge(
  p_limit integer default 500
)
returns table (
  artifact_source text,
  artifact_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = pg_catalog, public, core
as $$
  with candidates as (
    select
      'manifest'::text as artifact_source,
      artifact.id as artifact_id,
      artifact.storage_bucket,
      artifact.storage_path,
      artifact.service_date,
      artifact.created_at
    from core.operations_manifest_artifact artifact
    where (
      artifact.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now()
      and (
        artifact.manifest_type <> 'delivery'
        or not exists (
          select 1
          from core.operations_delivery_manifest_package package
          where package.source_artifact_id = artifact.id
            and (
              package.tracking_ref is null
              or package.tracking_ref_version is null
              or not exists (
                select 1
                from core.operations_route_package_fact fact
                where fact.company_id = package.company_id
                  and fact.service_date = package.service_date
                  and fact.route_key = package.route_key
                  and fact.tracking_ref = package.tracking_ref
              )
            )
        )
      )

    union all

    select
      'collection'::text as artifact_source,
      artifact.id as artifact_id,
      artifact.storage_bucket,
      artifact.storage_path,
      artifact.service_date,
      artifact.created_at
    from core.operations_collection_artifact artifact
    where artifact.service_date is not null
      and (
        artifact.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
      and (
        upper(coalesce(artifact.report_family_key, '')) = 'FCC'
        or upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
          in ('COMBINED_MANIFEST', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST')
      )
  )
  select
    candidates.artifact_source,
    candidates.artifact_id,
    candidates.storage_bucket,
    candidates.storage_path
  from candidates
  order by candidates.service_date, candidates.created_at, candidates.artifact_id
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;

revoke all on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  from public, anon, authenticated;
grant execute on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  to service_role;

comment on table core.operations_route_package_fact is
  'Durable de-identified route package facts. Tracking IDs are represented only by non-reversible versioned references.';
comment on function public.materialize_operations_route_package_facts(integer) is
  'Materializes de-identified package facts before identifiable manifest artifacts become purge eligible.';
comment on function public.list_operations_manifest_history_artifacts_for_purge(integer) is
  'Lists expired FCC and manifest artifacts; delivery artifacts remain blocked until package evidence is durably transformed.';

commit;
