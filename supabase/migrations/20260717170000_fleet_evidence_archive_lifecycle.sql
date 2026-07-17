create table fleet.inspection_evidence_object (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  vehicle_id uuid not null references fleet.vehicle(id) on delete cascade,
  uploaded_by_profile_id uuid references core.profiles(id) on delete set null,
  item_key text not null,
  hot_storage_bucket text not null default 'fleet-inspection-evidence',
  hot_storage_path text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  archive_status text not null default 'HOT',
  archive_provider text,
  archive_bucket text,
  archive_key text,
  archive_etag text,
  archive_attempt_count integer not null default 0,
  archive_error text,
  captured_at timestamptz not null default now(),
  archived_at timestamptz,
  hot_deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint fleet_evidence_archive_status_ck check (
    archive_status in ('HOT','ARCHIVING','ARCHIVED','FAILED')
  )
);

create index fleet_evidence_archive_queue_idx
  on fleet.inspection_evidence_object (archive_status, captured_at)
  where hot_deleted_at is null;

alter table fleet.inspection_evidence_object enable row level security;

create policy fleet_evidence_object_company_select
  on fleet.inspection_evidence_object for select to authenticated
  using (core.can_access_company(company_id));

grant select on fleet.inspection_evidence_object to authenticated;
grant all on fleet.inspection_evidence_object to service_role;

create or replace view public.company_fleet_evidence_v
with (security_invoker = true) as
select
  e.id as evidence_id,
  e.company_id,
  c.company_slug,
  e.vehicle_id,
  v.unit_number,
  i.inspection_id,
  e.item_key,
  e.content_type,
  e.size_bytes,
  e.sha256,
  e.archive_status,
  e.archive_provider,
  e.archive_bucket,
  e.archive_key,
  e.archive_attempt_count,
  e.archive_error,
  e.captured_at,
  e.archived_at,
  e.hot_deleted_at
from fleet.inspection_evidence_object e
join core.companies c on c.id = e.company_id
join fleet.vehicle v on v.id = e.vehicle_id
left join fleet.inspection_item i
  on e.hot_storage_path = any(i.media_paths);

grant select on public.company_fleet_evidence_v to authenticated, service_role;

create or replace function public.register_company_fleet_inspection_evidence(
  p_company_slug text,
  p_vehicle_id uuid,
  p_item_key text,
  p_storage_bucket text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text
) returns uuid
language plpgsql security definer
set search_path = public, fleet, core
as $$
declare v_company_id uuid; v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null or not core.can_access_company(v_company_id) then
    raise exception 'Not authorized.';
  end if;
  if not exists (
    select 1 from fleet.vehicle where id = p_vehicle_id and company_id = v_company_id
  ) then
    raise exception 'Vehicle not found.';
  end if;

  insert into fleet.inspection_evidence_object (
    company_id, vehicle_id, uploaded_by_profile_id, item_key,
    hot_storage_bucket, hot_storage_path, content_type, size_bytes, sha256
  ) values (
    v_company_id, p_vehicle_id, core.current_profile_id(), p_item_key,
    p_storage_bucket, p_storage_path, p_content_type, p_size_bytes, p_sha256
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.register_company_fleet_inspection_evidence(text,uuid,text,text,text,text,bigint,text) from public;
grant execute on function public.register_company_fleet_inspection_evidence(text,uuid,text,text,text,text,bigint,text) to authenticated, service_role;

create or replace function public.claim_fleet_evidence_archive_candidates(
  p_cutoff timestamptz,
  p_limit integer default 25
) returns table (
  evidence_id uuid,
  company_id uuid,
  vehicle_id uuid,
  inspection_id uuid,
  hot_storage_bucket text,
  hot_storage_path text,
  content_type text,
  size_bytes bigint,
  sha256 text,
  captured_at timestamptz
)
language plpgsql security definer
set search_path = public, fleet, core
as $$
begin
  return query
  with candidates as (
    select e.id, i.inspection_id
    from fleet.inspection_evidence_object e
    join fleet.inspection_item i
      on e.hot_storage_path = any(i.media_paths)
    join fleet.inspection x
      on x.id = i.inspection_id and x.status = 'SUBMITTED'
    where e.hot_deleted_at is null
      and e.captured_at < p_cutoff
      and e.archive_status in ('HOT','FAILED')
    order by e.captured_at, e.id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update of e skip locked
  ), claimed as (
    update fleet.inspection_evidence_object e
    set archive_status = 'ARCHIVING',
        archive_attempt_count = archive_attempt_count + 1,
        archive_error = null,
        updated_at = now()
    from candidates c
    where e.id = c.id
    returning e.*, c.inspection_id
  )
  select c.id, c.company_id, c.vehicle_id, c.inspection_id,
    c.hot_storage_bucket, c.hot_storage_path, c.content_type,
    c.size_bytes, c.sha256, c.captured_at
  from claimed c;
end $$;

revoke all on function public.claim_fleet_evidence_archive_candidates(timestamptz,integer) from public;
grant execute on function public.claim_fleet_evidence_archive_candidates(timestamptz,integer) to service_role;

create or replace function public.complete_fleet_evidence_archive(
  p_evidence_id uuid,
  p_archive_provider text,
  p_archive_bucket text,
  p_archive_key text,
  p_archive_etag text,
  p_hot_deleted boolean default false
) returns void
language plpgsql security definer
set search_path = public, fleet, core
as $$
begin
  update fleet.inspection_evidence_object
  set archive_status = 'ARCHIVED',
      archive_provider = p_archive_provider,
      archive_bucket = p_archive_bucket,
      archive_key = p_archive_key,
      archive_etag = p_archive_etag,
      archived_at = coalesce(archived_at, now()),
      hot_deleted_at = case when p_hot_deleted then coalesce(hot_deleted_at, now()) else hot_deleted_at end,
      archive_error = null,
      updated_at = now()
  where id = p_evidence_id;
end $$;

create or replace function public.fail_fleet_evidence_archive(
  p_evidence_id uuid,
  p_error text
) returns void
language sql security definer
set search_path = public, fleet, core
as $$
  update fleet.inspection_evidence_object
  set archive_status = 'FAILED', archive_error = left(p_error, 2000), updated_at = now()
  where id = p_evidence_id;
$$;

revoke all on function public.complete_fleet_evidence_archive(uuid,text,text,text,text,boolean) from public;
revoke all on function public.fail_fleet_evidence_archive(uuid,text) from public;
grant execute on function public.complete_fleet_evidence_archive(uuid,text,text,text,text,boolean) to service_role;
grant execute on function public.fail_fleet_evidence_archive(uuid,text) to service_role;
