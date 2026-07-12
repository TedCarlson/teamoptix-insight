create table if not exists core.operations_automation_schedule_config (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references core.companies(id) on delete cascade,
  automation_type text not null,
  is_enabled boolean not null default false,
  cadence_minutes integer not null default 60,
  window_preset text not null default 'SORT_DELIVERY_DAY',
  start_time time null,
  end_time time null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_automation_schedule_config_company_type_uniq
    unique (company_id, automation_type)
);

create or replace view public.operations_automation_schedule_config_v as
select
  s.id,
  s.company_id,
  c.company_slug,
  s.automation_type,
  s.is_enabled,
  s.cadence_minutes,
  s.window_preset,
  to_char(s.start_time, 'HH24:MI:SS') as start_time,
  to_char(s.end_time, 'HH24:MI:SS') as end_time,
  s.cadence_minutes as min_cooldown_minutes,
  s.created_at,
  s.updated_at
from core.operations_automation_schedule_config s
join core.companies c on c.id = s.company_id;

create or replace function public.get_operations_automation_schedule_config(
  p_company_slug text
)
returns setof public.operations_automation_schedule_config_v
language sql
security definer
set search_path = public, core
as $$
  select *
  from public.operations_automation_schedule_config_v
  where company_slug = p_company_slug;
$$;

create or replace function public.save_operations_automation_schedule_config_with_window(
  p_company_slug text,
  p_automation_type text,
  p_is_enabled boolean,
  p_cadence_minutes integer,
  p_window_preset text,
  p_start_time text default null,
  p_end_time text default null
)
returns public.operations_automation_schedule_config_v
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_row_id uuid;
  v_row public.operations_automation_schedule_config_v;
  v_start_time time;
  v_end_time time;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  v_start_time := nullif(trim(coalesce(p_start_time, '')), '')::time;
  v_end_time := nullif(trim(coalesce(p_end_time, '')), '')::time;

  insert into core.operations_automation_schedule_config (
    company_id,
    automation_type,
    is_enabled,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    created_at,
    updated_at
  ) values (
    v_company_id,
    p_automation_type,
    p_is_enabled and coalesce(p_window_preset, '') <> 'OFF',
    greatest(coalesce(p_cadence_minutes, 60), 1),
    coalesce(p_window_preset, 'SORT_DELIVERY_DAY'),
    v_start_time,
    v_end_time,
    now(),
    now()
  )
  on conflict (company_id, automation_type)
  do update
  set
    is_enabled = excluded.is_enabled,
    cadence_minutes = excluded.cadence_minutes,
    window_preset = excluded.window_preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    updated_at = now()
  returning id into v_row_id;

  select * into v_row
  from public.operations_automation_schedule_config_v
  where id = v_row_id;

  return v_row;
end;
$$;

grant select on public.operations_automation_schedule_config_v to authenticated;
grant execute on function public.get_operations_automation_schedule_config(text) to authenticated;
grant execute on function public.save_operations_automation_schedule_config_with_window(text, text, boolean, integer, text, text, text) to authenticated;
