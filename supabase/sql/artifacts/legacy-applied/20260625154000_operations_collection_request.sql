create table if not exists core.operations_collection_request (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references core.companies(id) on delete cascade,

  request_type text not null,
  request_status text not null default 'QUEUED',

  priority integer not null default 100,

  service_date date null,
  service_date_start date null,
  service_date_end date null,

  requested_reports text[] not null default '{}'::text[],
  request_payload jsonb not null default '{}'::jsonb,

  claimed_by text null,
  claimed_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,

  automation_run_id uuid null references core.operations_automation_run(id),
  report_batch_ids uuid[] not null default '{}'::uuid[],

  error_message text null,

  created_by_profile_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_collection_request_status_chk
    check (request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED')),

  constraint operations_collection_request_type_chk
    check (request_type in ('PREVIOUS_DAY_CLOSE', 'LAST_LOOK', 'HISTORICAL_BACKFILL', 'TARGETED_RECOVERY', 'OPERATIONS_FEED'))
);

create index if not exists operations_collection_request_company_status_idx
  on core.operations_collection_request (company_id, request_status, priority, created_at);

create index if not exists operations_collection_request_claim_idx
  on core.operations_collection_request (request_status, priority, created_at)
  where request_status = 'QUEUED';

create or replace view public.operations_collection_request_v as
select
  o.id,
  o.company_id,
  c.company_slug,
  o.request_type,
  o.request_status,
  o.priority,
  o.service_date,
  o.service_date_start,
  o.service_date_end,
  o.requested_reports,
  o.request_payload,
  o.claimed_by,
  o.claimed_at,
  o.started_at,
  o.completed_at,
  case
    when o.started_at is not null and o.completed_at is not null
      then extract(epoch from (o.completed_at - o.started_at))::integer * 1000
    else null
  end as duration_ms,
  o.automation_run_id,
  o.report_batch_ids,
  o.error_message,
  o.created_by_profile_id,
  o.created_at,
  o.updated_at
from core.operations_collection_request o
join core.companies c on c.id = o.company_id;

create or replace function public.create_operations_collection_request(
  p_company_slug text,
  p_request_type text,
  p_service_date date default null,
  p_service_date_start date default null,
  p_service_date_end date default null,
  p_requested_reports text[] default '{}'::text[],
  p_request_payload jsonb default '{}'::jsonb,
  p_priority integer default 100
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  insert into core.operations_collection_request (
    company_id,
    request_type,
    priority,
    service_date,
    service_date_start,
    service_date_end,
    requested_reports,
    request_payload
  )
  values (
    v_company_id,
    p_request_type,
    p_priority,
    p_service_date,
    p_service_date_start,
    p_service_date_end,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb)
  )
  returning id into v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

create or replace function public.claim_operations_collection_request(
  p_runner_key text
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_request_id
  from core.operations_collection_request
  where request_status = 'QUEUED'
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if v_request_id is null then
    return null;
  end if;

  update core.operations_collection_request
  set
    request_status = 'CLAIMED',
    claimed_by = p_runner_key,
    claimed_at = now(),
    updated_at = now()
  where id = v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

create or replace function public.update_operations_collection_request_status(
  p_request_id uuid,
  p_request_status text,
  p_error_message text default null,
  p_automation_run_id uuid default null,
  p_report_batch_ids uuid[] default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_row public.operations_collection_request_v;
begin
  update core.operations_collection_request
  set
    request_status = p_request_status,
    started_at = case when p_request_status = 'RUNNING' and started_at is null then now() else started_at end,
    completed_at = case when p_request_status in ('COMPLETE', 'FAILED', 'CANCELLED') then now() else completed_at end,
    error_message = coalesce(p_error_message, error_message),
    automation_run_id = coalesce(p_automation_run_id, automation_run_id),
    report_batch_ids = coalesce(p_report_batch_ids, report_batch_ids),
    updated_at = now()
  where id = p_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_request_id;

  return v_row;
end;
$$;

grant select on public.operations_collection_request_v to authenticated;
grant execute on function public.create_operations_collection_request(text, text, date, date, date, text[], jsonb, integer) to authenticated;
grant execute on function public.claim_operations_collection_request(text) to service_role;
grant execute on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) to authenticated, service_role;
