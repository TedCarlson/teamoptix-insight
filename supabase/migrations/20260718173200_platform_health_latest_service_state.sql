begin;

create or replace view public.platform_service_health_v
with (security_invoker = true)
as
with latest_check as (
  select distinct on (service_key)
    service_key, status, latency_ms, started_at, completed_at
  from core.platform_service_check_run
  order by service_key, started_at desc, created_at desc
)
select
  s.service_key,
  s.service_name,
  s.service_role,
  s.is_critical,
  s.display_order,
  s.enabled,
  (case when c.service_key is null then 0 else 1 end)::bigint as check_count,
  (case when c.status = 'HEALTHY' then 1 else 0 end)::bigint as healthy_count,
  (case when c.status = 'DEGRADED' then 1 else 0 end)::bigint as degraded_count,
  (case when c.status = 'FAILED' then 1 else 0 end)::bigint as failed_count,
  (case when c.status = 'UNKNOWN' then 1 else 0 end)::bigint as unknown_count,
  c.completed_at as last_observed_at,
  c.latency_ms as max_latency_ms,
  case
    when not s.enabled then 'UNKNOWN'
    when c.service_key is null or c.completed_at < now() - interval '15 minutes' then 'UNKNOWN'
    else c.status
  end as health_state
from core.platform_service s
left join latest_check c using (service_key);

grant select on public.platform_service_health_v to authenticated, service_role;

commit;
