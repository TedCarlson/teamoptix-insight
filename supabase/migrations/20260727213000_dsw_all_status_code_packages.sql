-- DSW All Status Code Packages: internal package-code facts with
-- non-reversible tracking references and seven-day encrypted PII retention.

insert into core.operations_report_family (
  report_family_key,
  report_family_label,
  source_system,
  is_active
)
values (
  'DSW',
  'Daily Service Worksheet',
  'FEDEX',
  true
)
on conflict (report_family_key) do nothing;

insert into core.operations_report_shape (
  report_shape_key,
  report_family_key,
  report_shape_label,
  required_headers,
  optional_headers,
  notes,
  is_active
)
values (
  'DSW_ALL_STATUS_CODE_PACKAGES',
  'DSW',
  'DSW All Status Code Packages',
  array[
    'Pkg Cnt',
    'Work Area Name',
    'WA#',
    'PSA/CSA',
    'Service Provider',
    'Vision Label',
    'Tracking ID',
    'Destination Address',
    'Vehicle #',
    'VSA Status Code',
    'STAR Status Code',
    'STAR Scan Time'
  ]::text[],
  array[]::text[],
  'Contract-total DSW package drill-down. Exact tracking and destination identity are encrypted and retained for seven days only.',
  true
)
on conflict (report_shape_key) do update
set report_family_key = excluded.report_family_key,
    report_shape_label = excluded.report_shape_label,
    required_headers = excluded.required_headers,
    optional_headers = excluded.optional_headers,
    notes = excluded.notes,
    is_active = true;

create table if not exists core.operations_dsw_package_status_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  artifact_id uuid references core.operations_collection_artifact(id) on delete set null,
  service_date date not null,
  contract_number text not null,
  snapshot_kind text not null,
  expected_package_count integer not null,
  observed_package_count integer not null,
  source_filename text not null,
  source_hash text not null,
  generated_at timestamptz,
  import_status text not null default 'COMPLETE',
  metadata_json jsonb not null default '{}'::jsonb,
  raw_artifact_purged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint operations_dsw_package_snapshot_contract_ck
    check (contract_number ~ '^C[0-9]+$'),
  constraint operations_dsw_package_snapshot_kind_ck
    check (snapshot_kind in ('LIVE', 'FINAL')),
  constraint operations_dsw_package_snapshot_count_ck
    check (
      expected_package_count >= 0
      and observed_package_count >= 0
      and expected_package_count = observed_package_count
    ),
  constraint operations_dsw_package_snapshot_hash_ck
    check (source_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists operations_dsw_package_snapshot_scope_idx
  on core.operations_dsw_package_status_snapshot
    (company_id, service_date desc, contract_number, created_at desc);

create table if not exists core.operations_dsw_package_status_fact (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  snapshot_id uuid not null
    references core.operations_dsw_package_status_snapshot(id) on delete cascade,
  service_date date not null,
  contract_number text not null,
  tracking_ref text not null,
  tracking_ref_version text not null,
  package_ordinal integer not null,
  work_area_name text,
  work_area_number text,
  psa_csa text,
  service_provider text,
  vision_label_raw text,
  vision_label text,
  vision_label_at_local timestamp without time zone,
  vehicle_number text,
  vsa_status_code text,
  star_status_code text,
  star_scan_at_local timestamp without time zone,
  transient_payload_ciphertext text,
  transient_payload_iv text,
  transient_payload_auth_tag text,
  transient_payload_fingerprint text,
  pii_expires_at timestamptz not null,
  pii_purged_at timestamptz,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_dsw_package_fact_contract_ck
    check (contract_number ~ '^C[0-9]+$'),
  constraint operations_dsw_package_fact_tracking_ref_ck
    check (tracking_ref ~ '^v[0-9]+_[a-f0-9]{64}$'),
  constraint operations_dsw_package_fact_ordinal_ck
    check (package_ordinal > 0),
  constraint operations_dsw_package_fact_payload_ck
    check (
      (
        transient_payload_ciphertext is not null
        and transient_payload_iv is not null
        and transient_payload_auth_tag is not null
        and transient_payload_fingerprint is not null
        and pii_purged_at is null
      )
      or
      (
        transient_payload_ciphertext is null
        and transient_payload_iv is null
        and transient_payload_auth_tag is null
        and transient_payload_fingerprint is null
        and pii_purged_at is not null
      )
    ),
  unique (company_id, service_date, contract_number, tracking_ref)
);

create index if not exists operations_dsw_package_fact_route_idx
  on core.operations_dsw_package_status_fact
    (company_id, service_date desc, work_area_number);

create index if not exists operations_dsw_package_fact_code_idx
  on core.operations_dsw_package_status_fact
    (company_id, service_date desc, vsa_status_code, star_status_code);

create index if not exists operations_dsw_package_fact_pii_expiry_idx
  on core.operations_dsw_package_status_fact (pii_expires_at)
  where pii_purged_at is null;

alter table core.operations_dsw_package_status_snapshot enable row level security;
alter table core.operations_dsw_package_status_fact enable row level security;

drop policy if exists operations_dsw_package_snapshot_owner_select
  on core.operations_dsw_package_status_snapshot;
create policy operations_dsw_package_snapshot_owner_select
on core.operations_dsw_package_status_snapshot
for select to authenticated
using (core.is_platform_owner());

drop policy if exists operations_dsw_package_fact_owner_select
  on core.operations_dsw_package_status_fact;
create policy operations_dsw_package_fact_owner_select
on core.operations_dsw_package_status_fact
for select to authenticated
using (core.is_platform_owner());

create or replace function public.import_operations_dsw_package_status(
  p_company_id uuid,
  p_artifact_id uuid,
  p_service_date date,
  p_contract_number text,
  p_snapshot_kind text,
  p_expected_count integer,
  p_source_filename text,
  p_source_hash text,
  p_generated_at timestamptz,
  p_metadata_json jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_snapshot_id uuid;
  v_contract_number text := upper(btrim(p_contract_number));
  v_snapshot_kind text := upper(btrim(p_snapshot_kind));
  v_observed_count integer;
  v_distinct_count integer;
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_pii_expires_at timestamptz;
begin
  if p_company_id is null or p_service_date is null then
    raise exception 'Company and service date are required.';
  end if;
  if p_artifact_id is null or not exists (
    select 1
    from core.operations_collection_artifact artifact
    where artifact.id = p_artifact_id
      and artifact.company_id = p_company_id
      and artifact.service_date = p_service_date
      and upper(
        coalesce(artifact.runner_artifact_json ->> 'artifact_key', '')
      ) = 'DSW_ALL_STATUS_CODE_PACKAGES'
  ) then
    raise exception
      'Package status artifact does not match its company and service date.';
  end if;
  if v_contract_number !~ '^C[0-9]+$' then
    raise exception 'Invalid DSW contract number.';
  end if;
  if v_snapshot_kind not in ('LIVE', 'FINAL') then
    raise exception 'Package status snapshot kind must be LIVE or FINAL.';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Package status rows must be a JSON array.';
  end if;

  v_observed_count := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  select count(distinct value ->> 'tracking_ref')
  into v_distinct_count
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb));

  if p_expected_count is null
     or p_expected_count < 0
     or p_expected_count <> v_observed_count
     or v_distinct_count <> v_observed_count then
    raise exception
      'Package status reconciliation failed: expected %, observed %, distinct %.',
      p_expected_count, v_observed_count, v_distinct_count;
  end if;

  v_pii_expires_at :=
    (p_service_date::timestamp at time zone 'America/New_York')
    + interval '7 days';

  insert into core.operations_dsw_package_status_snapshot (
    company_id, artifact_id, service_date, contract_number, snapshot_kind,
    expected_package_count, observed_package_count, source_filename,
    source_hash, generated_at, metadata_json
  )
  values (
    p_company_id, p_artifact_id, p_service_date, v_contract_number,
    v_snapshot_kind, p_expected_count, v_observed_count,
    p_source_filename, lower(p_source_hash), p_generated_at,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into v_snapshot_id;

  if v_snapshot_kind = 'FINAL' then
    delete from core.operations_dsw_package_status_fact
    where company_id = p_company_id
      and service_date = p_service_date
      and contract_number = v_contract_number;
    get diagnostics v_deleted_count = row_count;

    insert into core.operations_dsw_package_status_fact (
      company_id, snapshot_id, service_date, contract_number,
      tracking_ref, tracking_ref_version, package_ordinal,
      work_area_name, work_area_number, psa_csa, service_provider,
      vision_label_raw, vision_label, vision_label_at_local, vehicle_number,
      vsa_status_code, star_status_code, star_scan_at_local,
      transient_payload_ciphertext, transient_payload_iv,
      transient_payload_auth_tag, transient_payload_fingerprint,
      pii_expires_at
    )
    select
      p_company_id, v_snapshot_id, p_service_date, v_contract_number,
      row_data.tracking_ref, row_data.tracking_ref_version,
      row_data.package_ordinal, row_data.work_area_name,
      row_data.work_area_number, row_data.psa_csa,
      row_data.service_provider, row_data.vision_label_raw,
      row_data.vision_label, row_data.vision_label_at_local,
      row_data.vehicle_number, row_data.vsa_status_code,
      row_data.star_status_code, row_data.star_scan_at_local,
      row_data.transient_payload_ciphertext, row_data.transient_payload_iv,
      row_data.transient_payload_auth_tag,
      row_data.transient_payload_fingerprint, v_pii_expires_at
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data (
      tracking_ref text,
      tracking_ref_version text,
      package_ordinal integer,
      work_area_name text,
      work_area_number text,
      psa_csa text,
      service_provider text,
      vision_label_raw text,
      vision_label text,
      vision_label_at_local timestamp without time zone,
      vehicle_number text,
      vsa_status_code text,
      star_status_code text,
      star_scan_at_local timestamp without time zone,
      transient_payload_ciphertext text,
      transient_payload_iv text,
      transient_payload_auth_tag text,
      transient_payload_fingerprint text
    );
    get diagnostics v_inserted_count = row_count;
  else
    with upserted as (
      insert into core.operations_dsw_package_status_fact (
        company_id, snapshot_id, service_date, contract_number,
        tracking_ref, tracking_ref_version, package_ordinal,
        work_area_name, work_area_number, psa_csa, service_provider,
        vision_label_raw, vision_label, vision_label_at_local, vehicle_number,
        vsa_status_code, star_status_code, star_scan_at_local,
        transient_payload_ciphertext, transient_payload_iv,
        transient_payload_auth_tag, transient_payload_fingerprint,
        pii_expires_at
      )
      select
        p_company_id, v_snapshot_id, p_service_date, v_contract_number,
        row_data.tracking_ref, row_data.tracking_ref_version,
        row_data.package_ordinal, row_data.work_area_name,
        row_data.work_area_number, row_data.psa_csa,
        row_data.service_provider, row_data.vision_label_raw,
        row_data.vision_label, row_data.vision_label_at_local,
        row_data.vehicle_number, row_data.vsa_status_code,
        row_data.star_status_code, row_data.star_scan_at_local,
        row_data.transient_payload_ciphertext, row_data.transient_payload_iv,
        row_data.transient_payload_auth_tag,
        row_data.transient_payload_fingerprint, v_pii_expires_at
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data (
        tracking_ref text,
        tracking_ref_version text,
        package_ordinal integer,
        work_area_name text,
        work_area_number text,
        psa_csa text,
        service_provider text,
        vision_label_raw text,
        vision_label text,
        vision_label_at_local timestamp without time zone,
        vehicle_number text,
        vsa_status_code text,
        star_status_code text,
        star_scan_at_local timestamp without time zone,
        transient_payload_ciphertext text,
        transient_payload_iv text,
        transient_payload_auth_tag text,
        transient_payload_fingerprint text
      )
      on conflict (company_id, service_date, contract_number, tracking_ref)
      do update set
        snapshot_id = excluded.snapshot_id,
        package_ordinal = excluded.package_ordinal,
        work_area_name = excluded.work_area_name,
        work_area_number = excluded.work_area_number,
        psa_csa = excluded.psa_csa,
        service_provider = excluded.service_provider,
        vision_label_raw = excluded.vision_label_raw,
        vision_label = excluded.vision_label,
        vision_label_at_local = excluded.vision_label_at_local,
        vehicle_number = excluded.vehicle_number,
        vsa_status_code = excluded.vsa_status_code,
        star_status_code = excluded.star_status_code,
        star_scan_at_local = excluded.star_scan_at_local,
        transient_payload_ciphertext = excluded.transient_payload_ciphertext,
        transient_payload_iv = excluded.transient_payload_iv,
        transient_payload_auth_tag = excluded.transient_payload_auth_tag,
        transient_payload_fingerprint =
          excluded.transient_payload_fingerprint,
        pii_expires_at = excluded.pii_expires_at,
        pii_purged_at = null,
        last_observed_at = now(),
        updated_at = now()
      where (
        core.operations_dsw_package_status_fact.package_ordinal,
        core.operations_dsw_package_status_fact.work_area_name,
        core.operations_dsw_package_status_fact.work_area_number,
        core.operations_dsw_package_status_fact.psa_csa,
        core.operations_dsw_package_status_fact.service_provider,
        core.operations_dsw_package_status_fact.vision_label_raw,
        core.operations_dsw_package_status_fact.vision_label,
        core.operations_dsw_package_status_fact.vision_label_at_local,
        core.operations_dsw_package_status_fact.vehicle_number,
        core.operations_dsw_package_status_fact.vsa_status_code,
        core.operations_dsw_package_status_fact.star_status_code,
        core.operations_dsw_package_status_fact.star_scan_at_local,
        core.operations_dsw_package_status_fact.transient_payload_fingerprint
      ) is distinct from (
        excluded.package_ordinal, excluded.work_area_name,
        excluded.work_area_number, excluded.psa_csa,
        excluded.service_provider, excluded.vision_label_raw,
        excluded.vision_label, excluded.vision_label_at_local,
        excluded.vehicle_number, excluded.vsa_status_code,
        excluded.star_status_code, excluded.star_scan_at_local,
        excluded.transient_payload_fingerprint
      )
      returning (xmax = 0) as was_inserted
    )
    select
      count(*) filter (where was_inserted)::integer,
      count(*) filter (where not was_inserted)::integer
    into v_inserted_count, v_updated_count
    from upserted;
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'snapshot_kind', v_snapshot_kind,
    'expected_package_count', p_expected_count,
    'observed_package_count', v_observed_count,
    'inserted_row_count', coalesce(v_inserted_count, 0),
    'updated_row_count', coalesce(v_updated_count, 0),
    'deleted_row_count', coalesce(v_deleted_count, 0)
  );
end;
$$;

create or replace function public.purge_operations_dsw_package_status_pii(
  p_limit integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_purged integer := 0;
begin
  with expired as (
    select id
    from core.operations_dsw_package_status_fact
    where pii_purged_at is null
      and pii_expires_at <= now()
    order by pii_expires_at
    limit greatest(1, least(coalesce(p_limit, 10000), 50000))
    for update skip locked
  )
  update core.operations_dsw_package_status_fact fact
  set transient_payload_ciphertext = null,
      transient_payload_iv = null,
      transient_payload_auth_tag = null,
      transient_payload_fingerprint = null,
      pii_purged_at = now(),
      updated_at = now()
  from expired
  where fact.id = expired.id;
  get diagnostics v_purged = row_count;

  return jsonb_build_object(
    'purged_row_count', v_purged,
    'purged_at', now()
  );
end;
$$;

create or replace function public.list_operations_dsw_package_artifacts_for_purge(
  p_limit integer default 100
)
returns table (
  artifact_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = pg_catalog, public, core
as $$
  select
    artifact.id,
    artifact.storage_bucket,
    artifact.storage_path
  from core.operations_collection_artifact artifact
  where coalesce(
      artifact.ingest_metadata_json ->> 'raw_artifact_purged_at',
      ''
    ) = ''
    and (
      artifact.service_date::timestamp
      at time zone 'America/New_York'
    ) + interval '7 days' <= now()
    and upper(
      coalesce(artifact.runner_artifact_json ->> 'artifact_key', '')
    ) = 'DSW_ALL_STATUS_CODE_PACKAGES'
  order by artifact.id
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

create or replace function public.complete_operations_dsw_package_artifact_purge(
  p_artifact_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_updated integer := 0;
begin
  if coalesce(cardinality(p_artifact_ids), 0) = 0 then
    return 0;
  end if;

  update core.operations_collection_artifact
  set ingest_metadata_json =
        coalesce(ingest_metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'raw_artifact_purged_at',
          now()
        ),
      updated_at = now()
  where id = any(p_artifact_ids)
    and upper(
      coalesce(runner_artifact_json ->> 'artifact_key', '')
    ) = 'DSW_ALL_STATUS_CODE_PACKAGES'
    and coalesce(
      ingest_metadata_json ->> 'raw_artifact_purged_at',
      ''
    ) = '';
  get diagnostics v_updated = row_count;

  update core.operations_dsw_package_status_snapshot
  set raw_artifact_purged_at = now()
  where artifact_id = any(p_artifact_ids)
    and raw_artifact_purged_at is null;

  return v_updated;
end;
$$;

create or replace view public.operations_dsw_package_status_v
with (security_invoker = true)
as
select
  fact.id,
  fact.company_id,
  fact.snapshot_id,
  fact.service_date,
  fact.contract_number,
  fact.tracking_ref,
  fact.tracking_ref_version,
  fact.package_ordinal,
  fact.work_area_name,
  fact.work_area_number,
  fact.psa_csa,
  fact.service_provider,
  fact.vision_label_raw,
  fact.vision_label,
  fact.vision_label_at_local,
  fact.vehicle_number,
  fact.vsa_status_code,
  fact.star_status_code,
  fact.star_scan_at_local,
  fact.pii_expires_at,
  fact.pii_purged_at,
  fact.first_observed_at,
  fact.last_observed_at,
  fact.created_at,
  fact.updated_at
from core.operations_dsw_package_status_fact fact;

revoke all on core.operations_dsw_package_status_snapshot from public;
revoke all on core.operations_dsw_package_status_fact from public;
grant select on core.operations_dsw_package_status_snapshot to authenticated;
grant select on core.operations_dsw_package_status_fact to authenticated;
grant all on core.operations_dsw_package_status_snapshot to service_role;
grant all on core.operations_dsw_package_status_fact to service_role;

revoke all on function public.import_operations_dsw_package_status(
  uuid, uuid, date, text, text, integer, text, text, timestamptz, jsonb, jsonb
) from public;
grant execute on function public.import_operations_dsw_package_status(
  uuid, uuid, date, text, text, integer, text, text, timestamptz, jsonb, jsonb
) to service_role;

revoke all on function public.purge_operations_dsw_package_status_pii(integer)
  from public;
grant execute on function public.purge_operations_dsw_package_status_pii(integer)
  to service_role;

revoke all on function
  public.list_operations_dsw_package_artifacts_for_purge(integer)
  from public;
grant execute on function
  public.list_operations_dsw_package_artifacts_for_purge(integer)
  to service_role;

revoke all on function
  public.complete_operations_dsw_package_artifact_purge(uuid[])
  from public;
grant execute on function
  public.complete_operations_dsw_package_artifact_purge(uuid[])
  to service_role;

revoke all on public.operations_dsw_package_status_v from public;
grant select on public.operations_dsw_package_status_v to authenticated;
grant select on public.operations_dsw_package_status_v to service_role;
