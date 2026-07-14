create table if not exists core.operations_manifest_capture_plan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  plan_status text not null default 'QUEUED',
  collection_mode text not null default 'route_selective',
  manifest_types text[] not null default array['delivery', 'pickup'],
  skip_combined boolean not null default true,
  priority integer not null default 100,
  batch_label text,
  created_reason text,
  claimed_by text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_manifest_capture_plan_status_chk check (
    plan_status = any (array[
      'QUEUED',
      'CLAIMED',
      'RUNNING',
      'ARTIFACTS_READY',
      'PROCESSING',
      'COMPLETE',
      'FAILED',
      'CANCELLED'
    ])
  ),

  constraint operations_manifest_capture_plan_collection_mode_chk check (
    collection_mode = any (array[
      'route_selective',
      'route_batch',
      'full_active_route_set'
    ])
  )
);

create table if not exists core.operations_manifest_capture_plan_route (
  id uuid primary key default gen_random_uuid(),
  capture_plan_id uuid not null references core.operations_manifest_capture_plan(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text not null,
  route_status text not null default 'QUEUED',
  selection_reason text,
  delivery_manifest_requested boolean not null default true,
  pickup_manifest_requested boolean not null default true,
  combined_manifest_requested boolean not null default false,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_manifest_capture_plan_route_status_chk check (
    route_status = any (array[
      'QUEUED',
      'RUNNING',
      'ARTIFACTS_READY',
      'PARTIAL',
      'COMPLETE',
      'FAILED',
      'SKIPPED'
    ])
  ),

  constraint operations_manifest_capture_plan_route_unique unique (capture_plan_id, route_key)
);

create table if not exists core.operations_manifest_artifact (
  id uuid primary key default gen_random_uuid(),
  capture_plan_id uuid not null references core.operations_manifest_capture_plan(id) on delete cascade,
  capture_plan_route_id uuid not null references core.operations_manifest_capture_plan_route(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text not null,
  manifest_type text not null,
  artifact_status text not null default 'CAPTURED',
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  normalized_filename text not null,
  content_type text,
  size_bytes bigint not null default 0,
  source_hash text,
  runner_key text,
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_manifest_artifact_type_chk check (
    manifest_type = any (array['delivery', 'pickup'])
  ),

  constraint operations_manifest_artifact_status_chk check (
    artifact_status = any (array[
      'CAPTURED',
      'VALIDATING',
      'PARSING',
      'NORMALIZED',
      'FAILED',
      'SUPERSEDED',
      'IGNORED'
    ])
  ),

  constraint operations_manifest_artifact_storage_unique unique (storage_bucket, storage_path)
);

create table if not exists core.operations_delivery_manifest_stop (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  st_number text,
  sid text,
  recipient text,
  contact_name text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  delivery_time_begin text,
  delivery_time_end text,
  package_count integer,
  stop_instructions text,
  completed text,
  source_artifact_id uuid not null references core.operations_manifest_artifact(id) on delete cascade,
  source_capture_plan_id uuid not null references core.operations_manifest_capture_plan(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists core.operations_delivery_manifest_package (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  st_number text,
  sid text,
  recipient text,
  contact_name text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  tracking_id text,
  prem_svc_raw text,
  is_express boolean not null default false,
  is_residential boolean not null default false,
  is_signature boolean not null default false,
  is_hazmat boolean not null default false,
  is_collection boolean not null default false,
  source_artifact_id uuid not null references core.operations_manifest_artifact(id) on delete cascade,
  source_capture_plan_id uuid not null references core.operations_manifest_capture_plan(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists core.operations_pickup_manifest_stop (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  pickup_list text,
  station text,
  wa text,
  puid text,
  pickup_type text,
  shipper_number text,
  shipper_name text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  ready_at text,
  close_at text,
  pu_closed_at text,
  reason_code text,
  package_count_expected integer,
  packages_picked_up integer,
  source_artifact_id uuid not null references core.operations_manifest_artifact(id) on delete cascade,
  source_capture_plan_id uuid not null references core.operations_manifest_capture_plan(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists operations_manifest_capture_plan_claim_idx
  on core.operations_manifest_capture_plan (plan_status, priority, created_at)
  where plan_status = 'QUEUED';

create index if not exists operations_manifest_capture_plan_company_status_idx
  on core.operations_manifest_capture_plan (company_id, plan_status, priority, created_at);

create index if not exists operations_manifest_capture_plan_route_plan_idx
  on core.operations_manifest_capture_plan_route (capture_plan_id, route_status);

create index if not exists operations_manifest_capture_plan_route_company_date_idx
  on core.operations_manifest_capture_plan_route (company_id, service_date, route_key);

create index if not exists operations_manifest_artifact_status_idx
  on core.operations_manifest_artifact (artifact_status, created_at);

create index if not exists operations_manifest_artifact_plan_route_idx
  on core.operations_manifest_artifact (capture_plan_id, capture_plan_route_id, manifest_type);

create index if not exists operations_manifest_artifact_lookup_idx
  on core.operations_manifest_artifact (company_id, service_date, route_key, manifest_type);

create index if not exists operations_delivery_manifest_stop_lookup_idx
  on core.operations_delivery_manifest_stop (company_id, service_date, route_key);

create index if not exists operations_delivery_manifest_package_lookup_idx
  on core.operations_delivery_manifest_package (company_id, service_date, route_key);

create index if not exists operations_pickup_manifest_stop_lookup_idx
  on core.operations_pickup_manifest_stop (company_id, service_date, route_key);

create or replace view public.operations_manifest_capture_plan_v
with (security_invoker = true) as
select
  p.id,
  p.company_id,
  c.company_slug,
  p.service_date,
  p.plan_status,
  p.collection_mode,
  p.manifest_types,
  p.skip_combined,
  p.priority,
  p.batch_label,
  p.created_reason,
  p.claimed_by,
  p.claimed_at,
  p.started_at,
  p.completed_at,
  case
    when p.started_at is not null and p.completed_at is not null
      then extract(epoch from (p.completed_at - p.started_at))::integer * 1000
    else null::integer
  end as duration_ms,
  p.error_message,
  p.metadata_json,
  p.created_by_profile_id,
  p.created_at,
  p.updated_at,
  coalesce(route_counts.route_count, 0) as route_count,
  coalesce(route_counts.complete_route_count, 0) as complete_route_count,
  coalesce(route_counts.failed_route_count, 0) as failed_route_count,
  coalesce(artifact_counts.artifact_count, 0) as artifact_count,
  coalesce(artifact_counts.delivery_artifact_count, 0) as delivery_artifact_count,
  coalesce(artifact_counts.pickup_artifact_count, 0) as pickup_artifact_count
from core.operations_manifest_capture_plan p
join core.companies c on c.id = p.company_id
left join lateral (
  select
    count(*)::integer as route_count,
    count(*) filter (where r.route_status = 'COMPLETE')::integer as complete_route_count,
    count(*) filter (where r.route_status = 'FAILED')::integer as failed_route_count
  from core.operations_manifest_capture_plan_route r
  where r.capture_plan_id = p.id
) route_counts on true
left join lateral (
  select
    count(*)::integer as artifact_count,
    count(*) filter (where a.manifest_type = 'delivery')::integer as delivery_artifact_count,
    count(*) filter (where a.manifest_type = 'pickup')::integer as pickup_artifact_count
  from core.operations_manifest_artifact a
  where a.capture_plan_id = p.id
) artifact_counts on true;

create or replace view public.operations_manifest_capture_plan_route_v
with (security_invoker = true) as
select
  r.id,
  r.capture_plan_id,
  r.company_id,
  c.company_slug,
  r.service_date,
  r.route_key,
  r.route_label,
  r.route_status,
  r.selection_reason,
  r.delivery_manifest_requested,
  r.pickup_manifest_requested,
  r.combined_manifest_requested,
  r.attempt_count,
  r.last_attempt_at,
  r.last_success_at,
  r.last_error_message,
  r.metadata_json,
  r.created_at,
  r.updated_at,
  coalesce(artifact_counts.artifact_count, 0) as artifact_count,
  coalesce(artifact_counts.delivery_artifact_count, 0) as delivery_artifact_count,
  coalesce(artifact_counts.pickup_artifact_count, 0) as pickup_artifact_count
from core.operations_manifest_capture_plan_route r
join core.companies c on c.id = r.company_id
left join lateral (
  select
    count(*)::integer as artifact_count,
    count(*) filter (where a.manifest_type = 'delivery')::integer as delivery_artifact_count,
    count(*) filter (where a.manifest_type = 'pickup')::integer as pickup_artifact_count
  from core.operations_manifest_artifact a
  where a.capture_plan_route_id = r.id
) artifact_counts on true;

create or replace view public.operations_manifest_artifact_v
with (security_invoker = true) as
select
  a.id,
  a.capture_plan_id,
  a.capture_plan_route_id,
  a.company_id,
  c.company_slug,
  a.service_date,
  a.route_key,
  a.route_label,
  a.manifest_type,
  a.artifact_status,
  a.storage_bucket,
  a.storage_path,
  a.original_filename,
  a.normalized_filename,
  a.content_type,
  a.size_bytes,
  a.source_hash,
  a.runner_key,
  a.captured_at,
  a.processed_at,
  a.metadata_json,
  a.error_message,
  a.created_at,
  a.updated_at
from core.operations_manifest_artifact a
join core.companies c on c.id = a.company_id;

create or replace function public.create_operations_manifest_capture_plan(
  p_company_slug text,
  p_service_date date,
  p_routes jsonb,
  p_collection_mode text default 'route_selective',
  p_manifest_types text[] default array['delivery', 'pickup'],
  p_skip_combined boolean default true,
  p_priority integer default 100,
  p_batch_label text default null,
  p_created_reason text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.operations_manifest_capture_plan_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_plan_id uuid;
  v_route jsonb;
  v_route_key text;
  v_route_label text;
  v_row public.operations_manifest_capture_plan_v;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  if p_service_date is null then
    raise exception 'service_date is required';
  end if;

  if jsonb_typeof(coalesce(p_routes, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_routes, '[]'::jsonb)) = 0 then
    raise exception 'At least one manifest route is required';
  end if;

  insert into core.operations_manifest_capture_plan (
    company_id,
    service_date,
    plan_status,
    collection_mode,
    manifest_types,
    skip_combined,
    priority,
    batch_label,
    created_reason,
    metadata_json
  )
  values (
    v_company_id,
    p_service_date,
    'QUEUED',
    coalesce(nullif(p_collection_mode, ''), 'route_selective'),
    coalesce(p_manifest_types, array['delivery', 'pickup']),
    coalesce(p_skip_combined, true),
    coalesce(p_priority, 100),
    nullif(p_batch_label, ''),
    nullif(p_created_reason, ''),
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into v_plan_id;

  for v_route in select * from jsonb_array_elements(p_routes)
  loop
    v_route_key := nullif(trim(v_route ->> 'route_key'), '');
    v_route_label := coalesce(nullif(trim(v_route ->> 'route_label'), ''), v_route_key);

    if v_route_key is null then
      raise exception 'route_key is required for every manifest route';
    end if;

    insert into core.operations_manifest_capture_plan_route (
      capture_plan_id,
      company_id,
      service_date,
      route_key,
      route_label,
      route_status,
      selection_reason,
      delivery_manifest_requested,
      pickup_manifest_requested,
      combined_manifest_requested,
      metadata_json
    )
    values (
      v_plan_id,
      v_company_id,
      p_service_date,
      v_route_key,
      v_route_label,
      'QUEUED',
      nullif(trim(v_route ->> 'selection_reason'), ''),
      coalesce((v_route ->> 'delivery_manifest_requested')::boolean, true),
      coalesce((v_route ->> 'pickup_manifest_requested')::boolean, true),
      false,
      coalesce(v_route -> 'metadata_json', '{}'::jsonb)
    );
  end loop;

  select *
  into v_row
  from public.operations_manifest_capture_plan_v
  where id = v_plan_id;

  return v_row;
end;
$$;

create or replace function public.claim_operations_manifest_capture_plan(
  p_runner_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_plan_id uuid;
  v_result jsonb;
begin
  select id
  into v_plan_id
  from core.operations_manifest_capture_plan
  where plan_status = 'QUEUED'
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if v_plan_id is null then
    return null;
  end if;

  update core.operations_manifest_capture_plan
  set
    plan_status = 'CLAIMED',
    claimed_by = p_runner_key,
    claimed_at = now(),
    updated_at = now()
  where id = v_plan_id;

  select jsonb_build_object(
    'capture_plan_id', p.id,
    'company_slug', c.company_slug,
    'service_date', p.service_date,
    'collection_mode', p.collection_mode,
    'manifest_types', p.manifest_types,
    'skip_combined', p.skip_combined,
    'routes', coalesce(routes.rows, '[]'::jsonb)
  )
  into v_result
  from core.operations_manifest_capture_plan p
  join core.companies c on c.id = p.company_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'capture_plan_route_id', r.id,
        'route_key', r.route_key,
        'route_label', r.route_label,
        'delivery_manifest_requested', r.delivery_manifest_requested,
        'pickup_manifest_requested', r.pickup_manifest_requested,
        'combined_manifest_requested', r.combined_manifest_requested
      )
      order by r.created_at asc
    ) as rows
    from core.operations_manifest_capture_plan_route r
    where r.capture_plan_id = p.id
  ) routes on true
  where p.id = v_plan_id;

  return v_result;
end;
$$;

create or replace function public.register_operations_manifest_artifact(
  p_capture_plan_id uuid,
  p_capture_plan_route_id uuid,
  p_manifest_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_filename text,
  p_normalized_filename text,
  p_content_type text default null,
  p_size_bytes bigint default 0,
  p_source_hash text default null,
  p_runner_key text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.operations_manifest_artifact_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_plan core.operations_manifest_capture_plan%rowtype;
  v_route core.operations_manifest_capture_plan_route%rowtype;
  v_artifact_id uuid;
  v_row public.operations_manifest_artifact_v;
begin
  select *
  into v_plan
  from core.operations_manifest_capture_plan
  where id = p_capture_plan_id;

  if v_plan.id is null then
    raise exception 'Manifest capture plan not found';
  end if;

  select *
  into v_route
  from core.operations_manifest_capture_plan_route
  where id = p_capture_plan_route_id
    and capture_plan_id = p_capture_plan_id;

  if v_route.id is null then
    raise exception 'Manifest capture plan route not found';
  end if;

  if p_manifest_type not in ('delivery', 'pickup') then
    raise exception 'Unsupported manifest_type %', p_manifest_type;
  end if;

  insert into core.operations_manifest_artifact (
    capture_plan_id,
    capture_plan_route_id,
    company_id,
    service_date,
    route_key,
    route_label,
    manifest_type,
    artifact_status,
    storage_bucket,
    storage_path,
    original_filename,
    normalized_filename,
    content_type,
    size_bytes,
    source_hash,
    runner_key,
    metadata_json
  )
  values (
    p_capture_plan_id,
    p_capture_plan_route_id,
    v_plan.company_id,
    v_plan.service_date,
    v_route.route_key,
    v_route.route_label,
    p_manifest_type,
    'CAPTURED',
    p_storage_bucket,
    p_storage_path,
    p_original_filename,
    coalesce(nullif(p_normalized_filename, ''), p_original_filename),
    nullif(p_content_type, ''),
    coalesce(p_size_bytes, 0),
    nullif(p_source_hash, ''),
    nullif(p_runner_key, ''),
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (storage_bucket, storage_path)
  do update set
    artifact_status = 'CAPTURED',
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_key = excluded.runner_key,
    metadata_json = excluded.metadata_json,
    error_message = null,
    updated_at = now()
  returning id into v_artifact_id;

  update core.operations_manifest_capture_plan_route
  set
    route_status = case
      when route_status in ('QUEUED', 'RUNNING', 'PARTIAL') then 'ARTIFACTS_READY'
      else route_status
    end,
    last_success_at = now(),
    updated_at = now()
  where id = p_capture_plan_route_id;

  update core.operations_manifest_capture_plan
  set
    plan_status = case
      when plan_status in ('QUEUED', 'CLAIMED', 'RUNNING') then 'ARTIFACTS_READY'
      else plan_status
    end,
    updated_at = now()
  where id = p_capture_plan_id;

  select *
  into v_row
  from public.operations_manifest_artifact_v
  where id = v_artifact_id;

  return v_row;
end;
$$;

create or replace function public.update_operations_manifest_capture_route_status(
  p_capture_plan_route_id uuid,
  p_route_status text,
  p_error_message text default null,
  p_metadata_json jsonb default null
)
returns public.operations_manifest_capture_plan_route_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_manifest_capture_plan_route_v;
begin
  update core.operations_manifest_capture_plan_route
  set
    route_status = p_route_status,
    attempt_count = case
      when p_route_status = 'RUNNING' then attempt_count + 1
      else attempt_count
    end,
    last_attempt_at = case
      when p_route_status = 'RUNNING' then now()
      else last_attempt_at
    end,
    last_success_at = case
      when p_route_status in ('ARTIFACTS_READY', 'COMPLETE') then now()
      else last_success_at
    end,
    last_error_message = coalesce(p_error_message, last_error_message),
    metadata_json = case
      when p_metadata_json is not null then metadata_json || p_metadata_json
      else metadata_json
    end,
    updated_at = now()
  where id = p_capture_plan_route_id;

  select *
  into v_row
  from public.operations_manifest_capture_plan_route_v
  where id = p_capture_plan_route_id;

  return v_row;
end;
$$;

create or replace function public.update_operations_manifest_capture_plan_status(
  p_capture_plan_id uuid,
  p_plan_status text,
  p_error_message text default null,
  p_metadata_json jsonb default null
)
returns public.operations_manifest_capture_plan_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_manifest_capture_plan_v;
begin
  update core.operations_manifest_capture_plan
  set
    plan_status = p_plan_status,
    started_at = case
      when p_plan_status = 'RUNNING' and started_at is null then now()
      else started_at
    end,
    completed_at = case
      when p_plan_status in ('COMPLETE', 'FAILED', 'CANCELLED') then now()
      else completed_at
    end,
    error_message = coalesce(p_error_message, error_message),
    metadata_json = case
      when p_metadata_json is not null then metadata_json || p_metadata_json
      else metadata_json
    end,
    updated_at = now()
  where id = p_capture_plan_id;

  select *
  into v_row
  from public.operations_manifest_capture_plan_v
  where id = p_capture_plan_id;

  return v_row;
end;
$$;

alter table core.operations_manifest_capture_plan enable row level security;
alter table core.operations_manifest_capture_plan_route enable row level security;
alter table core.operations_manifest_artifact enable row level security;
alter table core.operations_delivery_manifest_stop enable row level security;
alter table core.operations_delivery_manifest_package enable row level security;
alter table core.operations_pickup_manifest_stop enable row level security;

create policy operations_manifest_capture_plan_select_access
  on core.operations_manifest_capture_plan
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy operations_manifest_capture_plan_insert_admin
  on core.operations_manifest_capture_plan
  for insert
  to authenticated
  with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy operations_manifest_capture_plan_update_admin
  on core.operations_manifest_capture_plan
  for update
  to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy operations_manifest_capture_plan_route_select_access
  on core.operations_manifest_capture_plan_route
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy operations_manifest_capture_plan_route_insert_admin
  on core.operations_manifest_capture_plan_route
  for insert
  to authenticated
  with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy operations_manifest_capture_plan_route_update_admin
  on core.operations_manifest_capture_plan_route
  for update
  to authenticated
  using (core.is_platform_owner() or core.can_admin_company(company_id))
  with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy operations_manifest_artifact_select_access
  on core.operations_manifest_artifact
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy operations_delivery_manifest_stop_select_access
  on core.operations_delivery_manifest_stop
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy operations_delivery_manifest_package_select_access
  on core.operations_delivery_manifest_package
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy operations_pickup_manifest_stop_select_access
  on core.operations_pickup_manifest_stop
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

grant select on table core.operations_manifest_capture_plan to authenticated;
grant select on table core.operations_manifest_capture_plan_route to authenticated;
grant select on table core.operations_manifest_artifact to authenticated;
grant select on table core.operations_delivery_manifest_stop to authenticated;
grant select on table core.operations_delivery_manifest_package to authenticated;
grant select on table core.operations_pickup_manifest_stop to authenticated;

grant all on table core.operations_manifest_capture_plan to service_role;
grant all on table core.operations_manifest_capture_plan_route to service_role;
grant all on table core.operations_manifest_artifact to service_role;
grant all on table core.operations_delivery_manifest_stop to service_role;
grant all on table core.operations_delivery_manifest_package to service_role;
grant all on table core.operations_pickup_manifest_stop to service_role;

grant all on table public.operations_manifest_capture_plan_v to authenticated;
grant all on table public.operations_manifest_capture_plan_route_v to authenticated;
grant all on table public.operations_manifest_artifact_v to authenticated;
grant all on table public.operations_manifest_capture_plan_v to service_role;
grant all on table public.operations_manifest_capture_plan_route_v to service_role;
grant all on table public.operations_manifest_artifact_v to service_role;

revoke all on function public.claim_operations_manifest_capture_plan(text) from public;
grant all on function public.claim_operations_manifest_capture_plan(text) to service_role;

revoke all on function public.register_operations_manifest_artifact(uuid, uuid, text, text, text, text, text, text, bigint, text, text, jsonb) from public;
grant all on function public.register_operations_manifest_artifact(uuid, uuid, text, text, text, text, text, text, bigint, text, text, jsonb) to service_role;

revoke all on function public.update_operations_manifest_capture_route_status(uuid, text, text, jsonb) from public;
grant all on function public.update_operations_manifest_capture_route_status(uuid, text, text, jsonb) to service_role;

revoke all on function public.update_operations_manifest_capture_plan_status(uuid, text, text, jsonb) from public;
grant all on function public.update_operations_manifest_capture_plan_status(uuid, text, text, jsonb) to service_role;

revoke all on function public.create_operations_manifest_capture_plan(text, date, jsonb, text, text[], boolean, integer, text, text, jsonb) from public;
grant all on function public.create_operations_manifest_capture_plan(text, date, jsonb, text, text[], boolean, integer, text, text, jsonb) to authenticated;
grant all on function public.create_operations_manifest_capture_plan(text, date, jsonb, text, text[], boolean, integer, text, text, jsonb) to service_role;
