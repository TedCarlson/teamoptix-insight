begin;

alter table core.company_operations_config
  add column if not exists driver_full_time_day_threshold smallint not null default 5;

alter table core.company_operations_config
  drop constraint if exists company_operations_config_driver_full_time_day_threshold_ck;

alter table core.company_operations_config
  add constraint company_operations_config_driver_full_time_day_threshold_ck
  check (driver_full_time_day_threshold between 1 and 7);

insert into core.company_operations_config (company_id)
select company.id
from core.companies company
on conflict (company_id) do nothing;

drop policy if exists company_operations_config_select_access
  on core.company_operations_config;
create policy company_operations_config_select_access
  on core.company_operations_config
  for select
  to authenticated
  using (core.can_access_company(company_id));

grant select on core.company_operations_config
  to authenticated, service_role;

create or replace function core.get_company_operations_config(p_company_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_config core.company_operations_config;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  insert into core.company_operations_config (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select * into v_config
  from core.company_operations_config
  where company_id = v_company_id;

  return jsonb_build_object(
    'company_id', v_company_id,
    'route_sort_key', v_config.route_sort_key,
    'route_sort_direction', v_config.route_sort_direction,
    'timekeeping_oversight_mode', v_config.timekeeping_oversight_mode,
    'driver_full_time_day_threshold', v_config.driver_full_time_day_threshold
  );
end;
$$;

create or replace function core.update_company_driver_utilization_config(
  p_company_slug text,
  p_driver_full_time_day_threshold smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  if p_driver_full_time_day_threshold is null
     or p_driver_full_time_day_threshold not between 1 and 7 then
    raise exception 'Driver full-time day threshold must be between 1 and 7.';
  end if;

  insert into core.company_operations_config (
    company_id,
    driver_full_time_day_threshold,
    updated_at
  ) values (
    v_company_id,
    p_driver_full_time_day_threshold,
    now()
  )
  on conflict (company_id) do update set
    driver_full_time_day_threshold = excluded.driver_full_time_day_threshold,
    updated_at = now();

  return core.get_company_operations_config(p_company_slug);
end;
$$;

create or replace function public.update_company_driver_utilization_config(
  p_company_slug text,
  p_driver_full_time_day_threshold smallint
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select core.update_company_driver_utilization_config(
    p_company_slug,
    p_driver_full_time_day_threshold
  );
$$;

revoke all on function core.update_company_driver_utilization_config(text, smallint)
  from public, anon;
grant execute on function core.update_company_driver_utilization_config(text, smallint)
  to authenticated, service_role;

revoke all on function public.update_company_driver_utilization_config(text, smallint)
  from public, anon;
grant execute on function public.update_company_driver_utilization_config(text, smallint)
  to authenticated, service_role;

create or replace view public.company_roster_driver_utilization_v
with (security_invoker = true)
as
with active_baseline as (
  select distinct on (baseline.company_id, baseline.roster_member_id)
    baseline.company_id,
    baseline.roster_member_id,
    baseline.id as baseline_id,
    baseline.preset_id,
    preset.preset_code,
    (
      preset.works_s::integer +
      preset.works_u::integer +
      preset.works_m::integer +
      preset.works_t::integer +
      preset.works_w::integer +
      preset.works_h::integer +
      preset.works_f::integer
    )::smallint as scheduled_days_per_week
  from public.schedule_baseline baseline
  join public.schedule_preset preset
    on preset.id = baseline.preset_id
   and preset.company_id = baseline.company_id
   and preset.is_active = true
  where baseline.is_active = true
    and baseline.effective_end is null
  order by
    baseline.company_id,
    baseline.roster_member_id,
    baseline.effective_start desc,
    baseline.updated_at desc,
    baseline.id desc
)
select
  roster.roster_member_id,
  roster.company_id,
  case
    when lower(btrim(coalesce(roster.worker_type, ''))) in (
      'avp', 'avp driver', 'alternative vehicle program driver'
    ) then 'AVP'
    when lower(btrim(coalesce(roster.worker_type, ''))) in (
      'driver', 'lead driver', 'ft driver', 'full-time driver',
      'full time driver', 'fulltime driver'
    ) then 'STANDARD'
    else null
  end as driver_program,
  baseline.baseline_id,
  baseline.preset_id,
  baseline.preset_code,
  baseline.scheduled_days_per_week,
  config.driver_full_time_day_threshold,
  case
    when lower(btrim(coalesce(roster.worker_type, ''))) not in (
      'avp', 'avp driver', 'alternative vehicle program driver',
      'driver', 'lead driver', 'ft driver', 'full-time driver',
      'full time driver', 'fulltime driver'
    ) then null
    when baseline.baseline_id is null or coalesce(baseline.scheduled_days_per_week, 0) = 0
      then 'UNSCHEDULED'
    when baseline.scheduled_days_per_week >= config.driver_full_time_day_threshold
      then 'FULL_TIME'
    else 'PART_TIME'
  end as driver_utilization_category,
  case
    when lower(btrim(coalesce(roster.worker_type, ''))) not in (
      'avp', 'avp driver', 'alternative vehicle program driver',
      'driver', 'lead driver', 'ft driver', 'full-time driver',
      'full time driver', 'fulltime driver'
    ) then null
    else least(
      1::numeric,
      coalesce(baseline.scheduled_days_per_week, 0)::numeric /
        config.driver_full_time_day_threshold::numeric
    )
  end as route_utilization_ratio
from public.company_roster_view roster
join core.company_operations_config config
  on config.company_id = roster.company_id
left join active_baseline baseline
  on baseline.company_id = roster.company_id
 and baseline.roster_member_id = roster.roster_member_id;

create or replace view public.company_roster_utilization_view
with (security_invoker = true)
as
select
  roster.*,
  utilization.driver_program,
  utilization.baseline_id as schedule_baseline_id,
  utilization.preset_id as schedule_preset_id,
  utilization.preset_code as schedule_preset_code,
  utilization.scheduled_days_per_week,
  utilization.driver_full_time_day_threshold,
  utilization.driver_utilization_category,
  utilization.route_utilization_ratio
from public.company_roster_view roster
left join public.company_roster_driver_utilization_v utilization
  on utilization.company_id = roster.company_id
 and utilization.roster_member_id = roster.roster_member_id;

grant select on public.company_roster_driver_utilization_v
  to authenticated, service_role;
grant select on public.company_roster_utilization_view
  to authenticated, service_role;

comment on view public.company_roster_driver_utilization_v is
  'Derived driver utilization contract. Driver versus AVP is a roster program choice; full-time versus part-time is derived from the active baseline preset and the company day threshold.';

comment on column public.company_roster_driver_utilization_v.route_utilization_ratio is
  'Scheduled weekly route-day contribution divided by the configured full-time threshold, capped at one. This is a planning contribution, not payroll FTE.';

notify pgrst, 'reload schema';

commit;
