begin;

create table if not exists core.platform_service (
  service_key text primary key,
  service_name text not null,
  service_role text not null,
  is_critical boolean not null default true,
  display_order integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_service_key_ck check (service_key in ('VERCEL','SUPABASE','DIGITALOCEAN','BACKBLAZE')),
  constraint platform_service_role_ck check (service_role in ('APPLICATION','DATA','COMPUTE','ARCHIVE'))
);

create table if not exists core.platform_service_check_run (
  id uuid primary key default gen_random_uuid(),
  service_key text not null references core.platform_service(service_key),
  check_key text not null,
  check_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING',
  latency_ms integer,
  status_code integer,
  error_code text,
  error_message text,
  source text not null default 'TEAMOPTIX_POLLER',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_service_check_status_ck check (status in ('RUNNING','HEALTHY','DEGRADED','FAILED','UNKNOWN')),
  constraint platform_service_check_latency_ck check (latency_ms is null or latency_ms >= 0)
);

create index if not exists platform_service_check_run_latest_idx
  on core.platform_service_check_run(service_key, check_key, started_at desc);

create table if not exists core.platform_service_observation (
  id uuid primary key default gen_random_uuid(),
  service_key text not null references core.platform_service(service_key),
  metric_key text not null,
  metric_name text not null,
  metric_kind text not null,
  numeric_value numeric,
  text_value text,
  unit text,
  observed_at timestamptz not null,
  valid_until timestamptz,
  source text not null,
  source_ref text,
  dimensions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_service_observation_kind_ck check (metric_kind in ('GAUGE','COUNTER','STATE','EVENT')),
  constraint platform_service_observation_value_ck check (numeric_value is not null or text_value is not null)
);

create index if not exists platform_service_observation_latest_idx
  on core.platform_service_observation(service_key, metric_key, observed_at desc);

insert into core.platform_service(service_key, service_name, service_role, is_critical, display_order)
values
  ('VERCEL','Vercel','APPLICATION',true,10),
  ('SUPABASE','Supabase','DATA',true,20),
  ('DIGITALOCEAN','DigitalOcean','COMPUTE',true,30),
  ('BACKBLAZE','Backblaze B2','ARCHIVE',true,40)
on conflict (service_key) do update set
  service_name = excluded.service_name,
  service_role = excluded.service_role,
  is_critical = excluded.is_critical,
  display_order = excluded.display_order,
  updated_at = now();

alter table core.platform_service enable row level security;
alter table core.platform_service_check_run enable row level security;
alter table core.platform_service_observation enable row level security;

create policy platform_service_select_owner on core.platform_service
  for select to authenticated using (core.is_platform_owner());
create policy platform_service_check_select_owner on core.platform_service_check_run
  for select to authenticated using (core.is_platform_owner());
create policy platform_service_observation_select_owner on core.platform_service_observation
  for select to authenticated using (core.is_platform_owner());

grant select on core.platform_service, core.platform_service_check_run, core.platform_service_observation to authenticated;
grant all on core.platform_service, core.platform_service_check_run, core.platform_service_observation to service_role;

create or replace view public.platform_service_health_v
with (security_invoker = true)
as
with latest_check as (
  select distinct on (service_key, check_key)
    service_key, check_key, check_name, status, latency_ms, status_code,
    error_code, error_message, started_at, completed_at, metadata
  from core.platform_service_check_run
  order by service_key, check_key, started_at desc
), service_rollup as (
  select
    service_key,
    count(*) as check_count,
    count(*) filter (where status = 'HEALTHY') as healthy_count,
    count(*) filter (where status = 'DEGRADED') as degraded_count,
    count(*) filter (where status = 'FAILED') as failed_count,
    count(*) filter (where status = 'UNKNOWN') as unknown_count,
    max(completed_at) as last_observed_at,
    max(latency_ms) as max_latency_ms
  from latest_check
  group by service_key
)
select
  s.service_key,
  s.service_name,
  s.service_role,
  s.is_critical,
  s.display_order,
  s.enabled,
  coalesce(r.check_count, 0) as check_count,
  coalesce(r.healthy_count, 0) as healthy_count,
  coalesce(r.degraded_count, 0) as degraded_count,
  coalesce(r.failed_count, 0) as failed_count,
  coalesce(r.unknown_count, 0) as unknown_count,
  r.last_observed_at,
  r.max_latency_ms,
  case
    when not s.enabled then 'UNKNOWN'
    when r.check_count is null or r.last_observed_at < now() - interval '15 minutes' then 'UNKNOWN'
    when r.failed_count > 0 then 'FAILED'
    when r.degraded_count > 0 or r.unknown_count > 0 then 'DEGRADED'
    else 'HEALTHY'
  end as health_state
from core.platform_service s
left join service_rollup r using (service_key);

grant select on public.platform_service_health_v to authenticated, service_role;

commit;
