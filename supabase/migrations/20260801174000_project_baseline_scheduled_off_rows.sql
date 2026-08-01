begin;

-- A schedule baseline is the source of truth for both working and recurring
-- off days. Return one projected row per baseline member/date so consumers can
-- distinguish a normal scheduled-off day from the absence of schedule data.
create or replace function public.resolve_schedule_projection(
  p_company_id uuid,
  p_start_date date default current_date,
  p_horizon_days integer default 70
)
returns table(
  company_id uuid,
  terminal_id uuid,
  service_date date,
  roster_member_id uuid,
  planned_on boolean,
  route_name text,
  source_kind text,
  preset_id uuid,
  rotation_mode text,
  anchor_date date,
  baseline_id uuid,
  override_id uuid
)
language sql
stable
set search_path to 'public', 'core'
as $$
with params as (
  select
    p_company_id as company_id,
    coalesce(p_start_date, current_date) as window_start,
    coalesce(p_start_date, current_date)
      + greatest(coalesce(p_horizon_days, 70) - 1, 0) as window_end,
    coalesce(
      (
        select sdf.terminal_id
        from public.schedule_day_fact sdf
        where sdf.company_id = p_company_id
          and sdf.terminal_id <>
            '00000000-0000-0000-0000-000000000000'::uuid
        order by sdf.service_date desc, sdf.created_at desc
        limit 1
      ),
      '00000000-0000-0000-0000-000000000000'::uuid
    ) as terminal_id
),
service_dates as (
  select gs::date as service_date
  from params p
  cross join lateral generate_series(
    p.window_start,
    p.window_end,
    interval '1 day'
  ) gs
),
baseline_evaluation as (
  select
    sb.company_id,
    p.terminal_id,
    d.service_date,
    sb.roster_member_id,
    case extract(dow from d.service_date)::integer
      when 6 then sp.works_s
      when 0 then sp.works_u
      when 1 then sp.works_m
      when 2 then sp.works_t
      when 3 then sp.works_w
      when 4 then sp.works_h
      when 5 then sp.works_f
      else false
    end as preset_should_work,
    case extract(dow from d.service_date)::integer
      when 6 then sb.default_route_s
      when 0 then sb.default_route_u
      when 1 then sb.default_route_m
      when 2 then sb.default_route_t
      when 3 then sb.default_route_w
      when 4 then sb.default_route_h
      when 5 then sb.default_route_f
      else null
    end as baseline_route_name,
    case extract(dow from d.service_date)::integer
      when 6 then coalesce(sb.rotation_works_s, false)
      when 0 then coalesce(sb.rotation_works_u, false)
      when 1 then coalesce(sb.rotation_works_m, false)
      when 2 then coalesce(sb.rotation_works_t, false)
      when 3 then coalesce(sb.rotation_works_w, false)
      when 4 then coalesce(sb.rotation_works_h, false)
      when 5 then coalesce(sb.rotation_works_f, false)
      else false
    end as rotation_day,
    sb.preset_id,
    sb.rotation_mode,
    sb.anchor_date,
    sb.id as baseline_id
  from params p
  join public.schedule_baseline sb
    on sb.company_id = p.company_id
   and sb.is_active = true
   and sb.effective_end is null
   and sb.effective_start <= p.window_end
  join public.schedule_preset sp
    on sp.id = sb.preset_id
   and sp.company_id = sb.company_id
   and sp.is_active = true
  join service_dates d
    on d.service_date >= greatest(p.window_start, sb.effective_start)
),
baseline_rows as (
  select
    be.company_id,
    be.terminal_id,
    be.service_date,
    be.roster_member_id,
    (
      be.preset_should_work = true
      and not (
        be.rotation_mode = 'WEEKEND_ALT'
        and be.anchor_date is not null
        and be.rotation_day = true
        and (
          floor((be.service_date - be.anchor_date) / 7)::integer % 2
        ) = 0
      )
    ) as planned_on,
    case
      when (
        be.preset_should_work = true
        and not (
          be.rotation_mode = 'WEEKEND_ALT'
          and be.anchor_date is not null
          and be.rotation_day = true
          and (
            floor((be.service_date - be.anchor_date) / 7)::integer % 2
          ) = 0
        )
      ) then be.baseline_route_name
      else null
    end as route_name,
    'BASELINE'::text as source_kind,
    be.preset_id,
    be.rotation_mode,
    be.anchor_date,
    be.baseline_id,
    null::uuid as override_id
  from baseline_evaluation be
),
off_resolved as (
  select
    br.company_id,
    br.terminal_id,
    br.service_date,
    br.roster_member_id,
    case
      when off_override.id is not null then false
      else br.planned_on
    end as planned_on,
    case
      when off_override.id is not null then null
      else br.route_name
    end as route_name,
    case
      when off_override.id is not null then 'OVERRIDE'
      else br.source_kind
    end as source_kind,
    br.preset_id,
    br.rotation_mode,
    br.anchor_date,
    br.baseline_id,
    coalesce(off_override.id, br.override_id) as override_id
  from baseline_rows br
  left join lateral (
    select so.id
    from public.schedule_override so
    where br.planned_on = true
      and so.company_id = br.company_id
      and so.roster_member_id = br.roster_member_id
      and so.is_active = true
      and so.override_type in (
        'CALL_OUT',
        'TIME_OFF',
        'ADMIN_OFF'
      )
      and br.service_date between so.start_date and so.end_date
    order by so.created_at desc
    limit 1
  ) off_override on true
),
add_in_rows as (
  select distinct on (
    so.company_id,
    so.roster_member_id,
    d.service_date
  )
    so.company_id,
    p.terminal_id,
    d.service_date,
    so.roster_member_id,
    true as planned_on,
    null::text as route_name,
    'OVERRIDE'::text as source_kind,
    null::uuid as preset_id,
    null::text as rotation_mode,
    null::date as anchor_date,
    null::uuid as baseline_id,
    so.id as override_id
  from params p
  join public.schedule_override so
    on so.company_id = p.company_id
   and so.is_active = true
   and so.override_type = 'ADD_IN'
   and so.end_date >= p.window_start
   and so.start_date <= p.window_end
  join service_dates d
    on d.service_date between
      greatest(p.window_start, so.start_date)
      and least(p.window_end, so.end_date)
  order by
    so.company_id,
    so.roster_member_id,
    d.service_date,
    so.created_at desc
),
baseline_with_add_ins as (
  select
    obr.company_id,
    obr.terminal_id,
    obr.service_date,
    obr.roster_member_id,
    case
      when air.override_id is not null then true
      else obr.planned_on
    end as planned_on,
    case
      when air.override_id is not null then null
      else obr.route_name
    end as route_name,
    case
      when air.override_id is not null then 'OVERRIDE'
      else obr.source_kind
    end as source_kind,
    obr.preset_id,
    obr.rotation_mode,
    obr.anchor_date,
    obr.baseline_id,
    coalesce(air.override_id, obr.override_id) as override_id
  from off_resolved obr
  left join add_in_rows air
    on air.company_id = obr.company_id
   and air.roster_member_id = obr.roster_member_id
   and air.service_date = obr.service_date
),
add_in_only as (
  select air.*
  from add_in_rows air
  where not exists (
    select 1
    from off_resolved obr
    where obr.company_id = air.company_id
      and obr.roster_member_id = air.roster_member_id
      and obr.service_date = air.service_date
  )
)
select *
from baseline_with_add_ins

union all

select *
from add_in_only;
$$;

-- The read path and drawers treat a company/member/date as one resolved unit.
-- Production was inspected before adding this guard: 4,142 existing rows had
-- 4,142 unique person-day keys.
create unique index if not exists
  schedule_day_fact_company_date_roster_uidx
on public.schedule_day_fact (
  company_id,
  service_date,
  roster_member_id
);

-- Keep targeted repaints on the same resolver as company-wide commits. This
-- prevents a single baseline edit from reverting to the former work-days-only
-- materialization contract.
create or replace function public.paint_schedule_day_fact_for_roster_member(
  p_company_id uuid,
  p_roster_member_id uuid,
  p_start_date date default current_date,
  p_horizon_days integer default 70
)
returns jsonb
language plpgsql
set search_path to 'public', 'core'
as $$
declare
  v_window_start date;
  v_window_end date;
  v_terminal_id uuid;
  v_baseline_id uuid;
  v_preset_id uuid;
  v_generated_count integer := 0;
  v_override_count integer := 0;
  v_add_in_insert_count integer := 0;
begin
  v_window_start := coalesce(p_start_date, current_date);
  v_window_end :=
    v_window_start + greatest(coalesce(p_horizon_days, 70) - 1, 0);

  select sb.id, sb.preset_id
  into v_baseline_id, v_preset_id
  from public.schedule_baseline sb
  where sb.company_id = p_company_id
    and sb.roster_member_id = p_roster_member_id
    and sb.is_active = true
    and sb.effective_end is null
    and sb.effective_start <= v_window_end
  order by sb.updated_at desc, sb.created_at desc
  limit 1;

  select sdf.terminal_id
  into v_terminal_id
  from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.terminal_id <>
      '00000000-0000-0000-0000-000000000000'::uuid
  order by
    (sdf.roster_member_id = p_roster_member_id) desc,
    sdf.service_date desc,
    sdf.created_at desc
  limit 1;

  v_terminal_id := coalesce(
    v_terminal_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  delete from public.schedule_day_fact
  where company_id = p_company_id
    and roster_member_id = p_roster_member_id
    and service_date between v_window_start and v_window_end;

  insert into public.schedule_day_fact (
    company_id,
    terminal_id,
    service_date,
    roster_member_id,
    planned_on,
    route_name,
    source_kind,
    preset_id,
    rotation_mode,
    anchor_date,
    baseline_id,
    override_id
  )
  select
    projection.company_id,
    v_terminal_id,
    projection.service_date,
    projection.roster_member_id,
    projection.planned_on,
    projection.route_name,
    projection.source_kind,
    projection.preset_id,
    projection.rotation_mode,
    projection.anchor_date,
    projection.baseline_id,
    projection.override_id
  from public.resolve_schedule_projection(
    p_company_id,
    v_window_start,
    p_horizon_days
  ) projection
  where projection.roster_member_id = p_roster_member_id;

  select count(*)::integer
  into v_generated_count
  from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.roster_member_id = p_roster_member_id
    and sdf.service_date between v_window_start and v_window_end
    and sdf.baseline_id is not null;

  select count(*)::integer
  into v_override_count
  from public.schedule_day_fact sdf
  join public.schedule_override so
    on so.id = sdf.override_id
  where sdf.company_id = p_company_id
    and sdf.roster_member_id = p_roster_member_id
    and sdf.service_date between v_window_start and v_window_end
    and so.override_type in (
      'CALL_OUT',
      'TIME_OFF',
      'ADMIN_OFF'
    );

  select count(*)::integer
  into v_add_in_insert_count
  from public.schedule_day_fact sdf
  join public.schedule_override so
    on so.id = sdf.override_id
  where sdf.company_id = p_company_id
    and sdf.roster_member_id = p_roster_member_id
    and sdf.service_date between v_window_start and v_window_end
    and sdf.baseline_id is null
    and so.override_type = 'ADD_IN';

  return jsonb_build_object(
    'ok', true,
    'mode', case
      when v_baseline_id is null then 'no_active_baseline'
      else 'repainted'
    end,
    'generated_count', v_generated_count,
    'override_count', v_override_count,
    'add_in_insert_count', v_add_in_insert_count,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'baseline_id', v_baseline_id,
    'preset_id', v_preset_id,
    'terminal_id_used', v_terminal_id
  );
end;
$$;

comment on function public.resolve_schedule_projection(uuid, date, integer) is
  'Resolves every active baseline member/date, including recurring scheduled-off rows, then applies effective schedule overrides.';

comment on function public.paint_schedule_day_fact_for_roster_member(
  uuid,
  uuid,
  date,
  integer
) is
  'Materializes the shared schedule projection, including recurring off days, for one roster member and date window.';

commit;
