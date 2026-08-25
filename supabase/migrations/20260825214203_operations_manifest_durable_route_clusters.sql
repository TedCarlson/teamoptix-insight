-- Preserve a privacy-safe route/day evidence layer after identifiable
-- manifests and precise GPX coordinates leave the seven-day operational
-- window. ZIP clusters with fewer than three stops are rolled into a route-
-- level suppressed cluster so the read model cannot disclose a lone event.

create table if not exists core.operations_route_stop_cluster_fact (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text not null,
  cluster_key text not null,
  postal_code_5 text,
  centroid_latitude double precision,
  centroid_longitude double precision,
  stop_count integer not null default 0,
  delivery_stop_count integer not null default 0,
  pickup_stop_count integer not null default 0,
  completed_stop_count integer not null default 0,
  package_count integer not null default 0,
  standard_delivery_stop_count integer not null default 0,
  express_stop_count integer not null default 0,
  signature_stop_count integer not null default 0,
  hazmat_stop_count integer not null default 0,
  residential_stop_count integer not null default 0,
  collection_stop_count integer not null default 0,
  first_stop_sequence integer,
  last_stop_sequence integer,
  suppressed_location_count integer not null default 0,
  is_location_suppressed boolean not null default false,
  transformed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_stop_cluster_fact_identity_uidx
    unique (company_id, service_date, route_key, cluster_key),
  constraint operations_route_stop_cluster_fact_postal_code_chk check (
    postal_code_5 is null or postal_code_5 ~ '^[0-9]{5}$'
  ),
  constraint operations_route_stop_cluster_fact_suppression_chk check (
    (is_location_suppressed and postal_code_5 is null)
    or (not is_location_suppressed and postal_code_5 is not null and stop_count >= 3)
  )
);

create index if not exists operations_route_stop_cluster_fact_lookup_idx
  on core.operations_route_stop_cluster_fact (
    company_id,
    service_date desc,
    route_key,
    cluster_key
  );

alter table core.operations_route_stop_cluster_fact enable row level security;

create policy operations_route_stop_cluster_fact_select_access
on core.operations_route_stop_cluster_fact
for select to authenticated
using (core.can_read_company_data(company_id));

revoke all on core.operations_route_stop_cluster_fact
  from public, anon, authenticated;
grant all on core.operations_route_stop_cluster_fact to service_role;

create or replace function core.operations_manifest_stop_clusters(
  p_company_id uuid default null,
  p_service_date date default null,
  p_route_key text default null
)
returns table (
  company_id uuid,
  service_date date,
  route_key text,
  route_label text,
  cluster_key text,
  postal_code_5 text,
  centroid_latitude double precision,
  centroid_longitude double precision,
  stop_count integer,
  delivery_stop_count integer,
  pickup_stop_count integer,
  completed_stop_count integer,
  package_count integer,
  standard_delivery_stop_count integer,
  express_stop_count integer,
  signature_stop_count integer,
  hazmat_stop_count integer,
  residential_stop_count integer,
  collection_stop_count integer,
  first_stop_sequence integer,
  last_stop_sequence integer,
  suppressed_location_count integer,
  is_location_suppressed boolean
)
language sql
stable
set search_path = pg_catalog, public, core, ref
as $$
  with package_flags as (
    select
      package.company_id,
      package.service_date,
      package.route_key,
      coalesce(package.st_number, '') as st_number,
      coalesce(package.sid, '') as sid,
      count(*)::integer as package_count,
      bool_or(package.is_express) as is_express,
      bool_or(package.is_signature) as is_signature,
      bool_or(package.is_hazmat) as is_hazmat,
      bool_or(package.is_residential) as is_residential,
      bool_or(package.is_collection) as is_collection
    from core.operations_delivery_manifest_package package
    where (p_company_id is null or package.company_id = p_company_id)
      and (p_service_date is null or package.service_date = p_service_date)
      and (p_route_key is null or package.route_key = p_route_key)
    group by
      package.company_id,
      package.service_date,
      package.route_key,
      coalesce(package.st_number, ''),
      coalesce(package.sid, '')
  ),
  route_labels as (
    select distinct on (
      artifact.company_id,
      artifact.service_date,
      artifact.route_key
    )
      artifact.company_id,
      artifact.service_date,
      artifact.route_key,
      artifact.route_label
    from core.operations_manifest_artifact artifact
    where (p_company_id is null or artifact.company_id = p_company_id)
      and (p_service_date is null or artifact.service_date = p_service_date)
      and (p_route_key is null or artifact.route_key = p_route_key)
    order by
      artifact.company_id,
      artifact.service_date,
      artifact.route_key,
      artifact.processed_at desc nulls last,
      artifact.captured_at desc,
      artifact.id desc
  ),
  source_stops as (
    select
      stop.company_id,
      stop.service_date,
      stop.route_key,
      coalesce(label.route_label, 'WA ' || stop.route_key) as route_label,
      substring(coalesce(stop.postal_code, '') from '([0-9]{5})')
        as postal_code_5,
      1::integer as stop_count,
      1::integer as delivery_stop_count,
      0::integer as pickup_stop_count,
      case
        when upper(trim(coalesce(stop.completed, ''))) in
          ('Y', 'YES', 'COMPLETE', 'COMPLETED') then 1
        else 0
      end::integer as completed_stop_count,
      greatest(coalesce(stop.package_count, flags.package_count, 0), 0)::integer
        as package_count,
      case
        when coalesce(flags.is_express, false)
          or coalesce(flags.is_signature, false)
          or coalesce(flags.is_hazmat, false)
          or coalesce(flags.is_residential, false)
          or coalesce(flags.is_collection, false)
          then 0
        else 1
      end::integer as standard_delivery_stop_count,
      coalesce(flags.is_express, false)::integer as express_stop_count,
      coalesce(flags.is_signature, false)::integer as signature_stop_count,
      coalesce(flags.is_hazmat, false)::integer as hazmat_stop_count,
      coalesce(flags.is_residential, false)::integer as residential_stop_count,
      coalesce(flags.is_collection, false)::integer as collection_stop_count,
      case
        when regexp_replace(coalesce(stop.st_number, ''), '[^0-9]', '', 'g') <> ''
          then regexp_replace(stop.st_number, '[^0-9]', '', 'g')::integer
        else null
      end as stop_sequence
    from core.operations_delivery_manifest_stop stop
    left join package_flags flags
      on flags.company_id = stop.company_id
     and flags.service_date = stop.service_date
     and flags.route_key = stop.route_key
     and flags.st_number = coalesce(stop.st_number, '')
     and flags.sid = coalesce(stop.sid, '')
    left join route_labels label
      on label.company_id = stop.company_id
     and label.service_date = stop.service_date
     and label.route_key = stop.route_key
    where (p_company_id is null or stop.company_id = p_company_id)
      and (p_service_date is null or stop.service_date = p_service_date)
      and (p_route_key is null or stop.route_key = p_route_key)

    union all

    select
      pickup.company_id,
      pickup.service_date,
      pickup.route_key,
      coalesce(label.route_label, 'WA ' || pickup.route_key) as route_label,
      substring(coalesce(pickup.postal_code, '') from '([0-9]{5})')
        as postal_code_5,
      1::integer as stop_count,
      0::integer as delivery_stop_count,
      1::integer as pickup_stop_count,
      (nullif(trim(coalesce(pickup.pu_closed_at, '')), '') is not null)::integer
        as completed_stop_count,
      greatest(
        coalesce(pickup.packages_picked_up, pickup.package_count_expected, 0),
        0
      )::integer as package_count,
      0::integer as standard_delivery_stop_count,
      0::integer as express_stop_count,
      0::integer as signature_stop_count,
      0::integer as hazmat_stop_count,
      0::integer as residential_stop_count,
      0::integer as collection_stop_count,
      null::integer as stop_sequence
    from core.operations_pickup_manifest_stop pickup
    left join route_labels label
      on label.company_id = pickup.company_id
     and label.service_date = pickup.service_date
     and label.route_key = pickup.route_key
    where (p_company_id is null or pickup.company_id = p_company_id)
      and (p_service_date is null or pickup.service_date = p_service_date)
      and (p_route_key is null or pickup.route_key = p_route_key)
  ),
  zip_groups as (
    select
      source.company_id,
      source.service_date,
      source.route_key,
      max(source.route_label) as route_label,
      source.postal_code_5,
      sum(source.stop_count)::integer as stop_count,
      sum(source.delivery_stop_count)::integer as delivery_stop_count,
      sum(source.pickup_stop_count)::integer as pickup_stop_count,
      sum(source.completed_stop_count)::integer as completed_stop_count,
      sum(source.package_count)::integer as package_count,
      sum(source.standard_delivery_stop_count)::integer
        as standard_delivery_stop_count,
      sum(source.express_stop_count)::integer as express_stop_count,
      sum(source.signature_stop_count)::integer as signature_stop_count,
      sum(source.hazmat_stop_count)::integer as hazmat_stop_count,
      sum(source.residential_stop_count)::integer as residential_stop_count,
      sum(source.collection_stop_count)::integer as collection_stop_count,
      min(source.stop_sequence) as first_stop_sequence,
      max(source.stop_sequence) as last_stop_sequence
    from source_stops source
    group by
      source.company_id,
      source.service_date,
      source.route_key,
      source.postal_code_5
  ),
  rolled_clusters as (
    select
      zip.company_id,
      zip.service_date,
      zip.route_key,
      zip.route_label,
      'ZIP:' || zip.postal_code_5 as cluster_key,
      zip.postal_code_5,
      zip.stop_count,
      zip.delivery_stop_count,
      zip.pickup_stop_count,
      zip.completed_stop_count,
      zip.package_count,
      zip.standard_delivery_stop_count,
      zip.express_stop_count,
      zip.signature_stop_count,
      zip.hazmat_stop_count,
      zip.residential_stop_count,
      zip.collection_stop_count,
      zip.first_stop_sequence,
      zip.last_stop_sequence,
      0::integer as suppressed_location_count,
      false as is_location_suppressed
    from zip_groups zip
    where zip.postal_code_5 is not null
      and zip.stop_count >= 3

    union all

    select
      zip.company_id,
      zip.service_date,
      zip.route_key,
      max(zip.route_label) as route_label,
      'SUPPRESSED'::text as cluster_key,
      null::text as postal_code_5,
      sum(zip.stop_count)::integer as stop_count,
      sum(zip.delivery_stop_count)::integer as delivery_stop_count,
      sum(zip.pickup_stop_count)::integer as pickup_stop_count,
      sum(zip.completed_stop_count)::integer as completed_stop_count,
      sum(zip.package_count)::integer as package_count,
      sum(zip.standard_delivery_stop_count)::integer
        as standard_delivery_stop_count,
      sum(zip.express_stop_count)::integer as express_stop_count,
      sum(zip.signature_stop_count)::integer as signature_stop_count,
      sum(zip.hazmat_stop_count)::integer as hazmat_stop_count,
      sum(zip.residential_stop_count)::integer as residential_stop_count,
      sum(zip.collection_stop_count)::integer as collection_stop_count,
      min(zip.first_stop_sequence) as first_stop_sequence,
      max(zip.last_stop_sequence) as last_stop_sequence,
      count(*)::integer as suppressed_location_count,
      true as is_location_suppressed
    from zip_groups zip
    where zip.postal_code_5 is null
       or zip.stop_count < 3
    group by zip.company_id, zip.service_date, zip.route_key
  )
  select
    cluster.company_id,
    cluster.service_date,
    cluster.route_key,
    cluster.route_label,
    cluster.cluster_key,
    cluster.postal_code_5,
    reference.latitude as centroid_latitude,
    reference.longitude as centroid_longitude,
    cluster.stop_count,
    cluster.delivery_stop_count,
    cluster.pickup_stop_count,
    cluster.completed_stop_count,
    cluster.package_count,
    cluster.standard_delivery_stop_count,
    cluster.express_stop_count,
    cluster.signature_stop_count,
    cluster.hazmat_stop_count,
    cluster.residential_stop_count,
    cluster.collection_stop_count,
    cluster.first_stop_sequence,
    cluster.last_stop_sequence,
    cluster.suppressed_location_count,
    cluster.is_location_suppressed
  from rolled_clusters cluster
  left join ref.zip_code reference
    on reference.zip_code = cluster.postal_code_5
  order by
    cluster.service_date desc,
    cluster.route_key,
    cluster.is_location_suppressed,
    cluster.postal_code_5;
$$;

revoke all on function core.operations_manifest_stop_clusters(uuid, date, text)
  from public, anon, authenticated;
grant execute on function core.operations_manifest_stop_clusters(uuid, date, text)
  to service_role;

create or replace function public.materialize_operations_route_stop_cluster_facts(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core, ref
as $$
declare
  v_transformed integer := 0;
  v_deleted integer := 0;
begin
  with candidates as (
    select distinct source.company_id, source.service_date, source.route_key
    from (
      select stop.company_id, stop.service_date, stop.route_key
      from core.operations_delivery_manifest_stop stop
      union all
      select pickup.company_id, pickup.service_date, pickup.route_key
      from core.operations_pickup_manifest_stop pickup
    ) source
    where (
      source.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now()
      and source.service_date >=
        ((now() at time zone 'America/New_York')::date - 366)
    order by source.service_date, source.company_id, source.route_key
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  ),
  materialized as (
    select cluster.*
    from candidates candidate
    cross join lateral core.operations_manifest_stop_clusters(
      candidate.company_id,
      candidate.service_date,
      candidate.route_key
    ) cluster
  )
  insert into core.operations_route_stop_cluster_fact (
    company_id,
    service_date,
    route_key,
    route_label,
    cluster_key,
    postal_code_5,
    centroid_latitude,
    centroid_longitude,
    stop_count,
    delivery_stop_count,
    pickup_stop_count,
    completed_stop_count,
    package_count,
    standard_delivery_stop_count,
    express_stop_count,
    signature_stop_count,
    hazmat_stop_count,
    residential_stop_count,
    collection_stop_count,
    first_stop_sequence,
    last_stop_sequence,
    suppressed_location_count,
    is_location_suppressed,
    transformed_at,
    updated_at
  )
  select
    row.company_id,
    row.service_date,
    row.route_key,
    row.route_label,
    row.cluster_key,
    row.postal_code_5,
    row.centroid_latitude,
    row.centroid_longitude,
    row.stop_count,
    row.delivery_stop_count,
    row.pickup_stop_count,
    row.completed_stop_count,
    row.package_count,
    row.standard_delivery_stop_count,
    row.express_stop_count,
    row.signature_stop_count,
    row.hazmat_stop_count,
    row.residential_stop_count,
    row.collection_stop_count,
    row.first_stop_sequence,
    row.last_stop_sequence,
    row.suppressed_location_count,
    row.is_location_suppressed,
    now(),
    now()
  from materialized row
  on conflict (company_id, service_date, route_key, cluster_key)
  do update set
    route_label = excluded.route_label,
    postal_code_5 = excluded.postal_code_5,
    centroid_latitude = excluded.centroid_latitude,
    centroid_longitude = excluded.centroid_longitude,
    stop_count = excluded.stop_count,
    delivery_stop_count = excluded.delivery_stop_count,
    pickup_stop_count = excluded.pickup_stop_count,
    completed_stop_count = excluded.completed_stop_count,
    package_count = excluded.package_count,
    standard_delivery_stop_count = excluded.standard_delivery_stop_count,
    express_stop_count = excluded.express_stop_count,
    signature_stop_count = excluded.signature_stop_count,
    hazmat_stop_count = excluded.hazmat_stop_count,
    residential_stop_count = excluded.residential_stop_count,
    collection_stop_count = excluded.collection_stop_count,
    first_stop_sequence = excluded.first_stop_sequence,
    last_stop_sequence = excluded.last_stop_sequence,
    suppressed_location_count = excluded.suppressed_location_count,
    is_location_suppressed = excluded.is_location_suppressed,
    transformed_at = excluded.transformed_at,
    updated_at = now();
  get diagnostics v_transformed = row_count;

  delete from core.operations_route_stop_cluster_fact fact
  where (
    fact.service_date::timestamp at time zone 'America/New_York'
  ) + interval '367 days' <= now();
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'transformed_cluster_count', v_transformed,
    'expired_cluster_count', v_deleted,
    'transformed_at', now()
  );
end;
$$;

revoke all on function public.materialize_operations_route_stop_cluster_facts(integer)
  from public, anon, authenticated;
grant execute on function public.materialize_operations_route_stop_cluster_facts(integer)
  to service_role;

create or replace function public.get_operations_manifest_stop_clusters(
  p_company_id uuid,
  p_service_date date,
  p_route_key text default null
)
returns table (
  route_key text,
  route_label text,
  cluster_key text,
  postal_code_5 text,
  centroid_latitude double precision,
  centroid_longitude double precision,
  stop_count integer,
  delivery_stop_count integer,
  pickup_stop_count integer,
  completed_stop_count integer,
  package_count integer,
  standard_delivery_stop_count integer,
  express_stop_count integer,
  signature_stop_count integer,
  hazmat_stop_count integer,
  residential_stop_count integer,
  collection_stop_count integer,
  first_stop_sequence integer,
  last_stop_sequence integer,
  suppressed_location_count integer,
  is_location_suppressed boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, core, ref
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if p_company_id is null or p_service_date is null then
    raise exception 'Company id and service date are required.'
      using errcode = '22023';
  end if;

  if p_service_date > v_today or p_service_date < v_today - 366 then
    raise exception 'Manifest evidence is available for 366 prior service dates.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  if p_service_date >= v_today - 7 then
    return query
    select
      cluster.route_key,
      cluster.route_label,
      cluster.cluster_key,
      cluster.postal_code_5,
      cluster.centroid_latitude,
      cluster.centroid_longitude,
      cluster.stop_count,
      cluster.delivery_stop_count,
      cluster.pickup_stop_count,
      cluster.completed_stop_count,
      cluster.package_count,
      cluster.standard_delivery_stop_count,
      cluster.express_stop_count,
      cluster.signature_stop_count,
      cluster.hazmat_stop_count,
      cluster.residential_stop_count,
      cluster.collection_stop_count,
      cluster.first_stop_sequence,
      cluster.last_stop_sequence,
      cluster.suppressed_location_count,
      cluster.is_location_suppressed
    from core.operations_manifest_stop_clusters(
      p_company_id,
      p_service_date,
      nullif(trim(p_route_key), '')
    ) cluster;
  else
    return query
    select
      fact.route_key,
      fact.route_label,
      fact.cluster_key,
      fact.postal_code_5,
      fact.centroid_latitude,
      fact.centroid_longitude,
      fact.stop_count,
      fact.delivery_stop_count,
      fact.pickup_stop_count,
      fact.completed_stop_count,
      fact.package_count,
      fact.standard_delivery_stop_count,
      fact.express_stop_count,
      fact.signature_stop_count,
      fact.hazmat_stop_count,
      fact.residential_stop_count,
      fact.collection_stop_count,
      fact.first_stop_sequence,
      fact.last_stop_sequence,
      fact.suppressed_location_count,
      fact.is_location_suppressed
    from core.operations_route_stop_cluster_fact fact
    where fact.company_id = p_company_id
      and fact.service_date = p_service_date
      and (
        nullif(trim(p_route_key), '') is null
        or fact.route_key = nullif(trim(p_route_key), '')
      )
    order by
      fact.route_key,
      fact.is_location_suppressed,
      fact.postal_code_5;
  end if;
end;
$$;

revoke all on function public.get_operations_manifest_stop_clusters(uuid, date, text)
  from public, anon;
grant execute on function public.get_operations_manifest_stop_clusters(uuid, date, text)
  to authenticated, service_role;

comment on table core.operations_route_stop_cluster_fact is
  'Privacy-safe 366-day route/day ZIP-centroid cluster evidence materialized before identifiable manifest deletion.';
comment on function core.operations_manifest_stop_clusters(uuid, date, text) is
  'Builds route/day stop clusters and rolls ZIP groups smaller than three stops into a location-suppressed route aggregate.';
comment on function public.materialize_operations_route_stop_cluster_facts(integer) is
  'Materializes privacy-safe route clusters before the seven-day manifest purge and removes cluster evidence after 366 prior service dates.';
comment on function public.get_operations_manifest_stop_clusters(uuid, date, text) is
  'Returns live seven-day manifest clusters or durable privacy-safe route cluster facts for the selected service date.';
