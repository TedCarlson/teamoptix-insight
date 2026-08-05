begin;

-- A resignation notice caps projection; it does not retire the employee's
-- baseline while the notice is still counting down. This keeps the person in
-- Workbench and preserves one editable baseline source of truth through the
-- established last scheduled day.
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
   and not exists (
     select 1
     from public.schedule_override resignation
     where resignation.company_id = sb.company_id
       and resignation.roster_member_id = sb.roster_member_id
       and resignation.override_type = 'RESIGNATION_NOTICE'
       and resignation.is_active = true
       and resignation.workflow_status not in ('CANCELLED', 'RESCINDED')
       and d.service_date > resignation.end_date
   )
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
  where not exists (
    select 1
    from public.schedule_override resignation
    where resignation.company_id = so.company_id
      and resignation.roster_member_id = so.roster_member_id
      and resignation.override_type = 'RESIGNATION_NOTICE'
      and resignation.is_active = true
      and resignation.workflow_status not in ('CANCELLED', 'RESCINDED')
      and d.service_date > resignation.end_date
  )
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

create or replace function core.repaint_resignation_schedule(
  p_override_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_override public.schedule_override%rowtype;
  v_horizon integer;
  v_repaint jsonb;
  v_removed_count integer := 0;
begin
  select * into v_override
  from public.schedule_override
  where id = p_override_id
    and override_type = 'RESIGNATION_NOTICE'
  for update;

  if v_override.id is null then
    raise exception 'Resignation notice not found';
  end if;

  if v_override.schedule_baseline_id is not null then
    update public.schedule_baseline
    set is_active = true,
        effective_end = null,
        updated_at = now()
    where id = v_override.schedule_baseline_id
      and company_id = v_override.company_id
      and roster_member_id = v_override.roster_member_id;
  end if;

  v_horizon := core.resignation_repaint_horizon(
    v_override.company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_override.end_date
  );

  select public.paint_schedule_day_fact_for_roster_member(
    v_override.company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_horizon
  ) into v_repaint;

  delete from public.schedule_day_fact
  where company_id = v_override.company_id
    and roster_member_id = v_override.roster_member_id
    and service_date > v_override.end_date;
  get diagnostics v_removed_count = row_count;

  v_repaint := coalesce(v_repaint, '{}'::jsonb) || jsonb_build_object(
    'notice_date', v_override.start_date,
    'last_scheduled_date', v_override.end_date,
    'separation_effective_date', v_override.separation_effective_date,
    'future_rows_removed', v_removed_count,
    'baseline_preserved_during_notice', true,
    'repainted_at', now()
  );

  update public.schedule_override
  set repaint_evidence = v_repaint,
      workflow_status = case
        when workflow_status in ('SUBMITTED', 'COUNTDOWN_ACTIVE') then 'COUNTDOWN_ACTIVE'
        else workflow_status
      end,
      updated_at = now()
  where id = v_override.id;

  insert into core.resignation_workflow_event (
    company_id,
    resignation_override_id,
    roster_member_id,
    event_key,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_override.company_id,
    v_override.id,
    v_override.roster_member_id,
    'SCHEDULE_REPAINTED',
    'Baseline preserved through notice; loaded schedule stops at the established last scheduled day.',
    v_repaint,
    core.current_profile_id()
  );

  return v_repaint;
end;
$$;

-- Once the separation workflow crosses into its effective-date phase, retire
-- the preserved baseline as historical bookkeeping. The roster has already
-- been moved to Former by the due-workflow processor at this point.
create or replace function core.close_resignation_baseline_after_separation()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if new.override_type = 'RESIGNATION_NOTICE'
     and new.workflow_status in ('NOTIFICATION_PENDING', 'COMPLETED')
     and old.workflow_status is distinct from new.workflow_status
     and new.schedule_baseline_id is not null then
    update public.schedule_baseline
    set is_active = false,
        effective_end = new.end_date,
        updated_at = now()
    where id = new.schedule_baseline_id
      and company_id = new.company_id
      and roster_member_id = new.roster_member_id;
  end if;

  return new;
end;
$$;

drop trigger if exists close_resignation_baseline_after_separation
on public.schedule_override;

create trigger close_resignation_baseline_after_separation
after update of workflow_status on public.schedule_override
for each row
execute function core.close_resignation_baseline_after_separation();

-- Heal the one production notice audited before this migration was written.
-- Every identity and date boundary is checked before repainting; other active
-- notices, if any are introduced concurrently, are intentionally untouched.
do $$
declare
  v_notice public.schedule_override%rowtype;
begin
  select * into v_notice
  from public.schedule_override notice
  where notice.id = '66acf8ca-2e04-4df6-bec8-aabdd211e717'
    and notice.company_id = '0385bc8f-eb13-490b-92c8-f34bad2507df'
    and notice.roster_member_id = '52639b03-3697-4888-8546-4584b577b2dc'
    and notice.schedule_baseline_id = '08cebdcf-354a-48c6-b7cc-a043584f860f'
    and notice.override_type = 'RESIGNATION_NOTICE'
    and notice.start_date = '2026-08-04'
    and notice.end_date = '2026-08-14'
    and notice.separation_effective_date = '2026-08-15'
    and notice.is_active = true
    and notice.workflow_status in ('SUBMITTED', 'COUNTDOWN_ACTIVE')
  for update;

  if v_notice.id is not null then
    perform core.repaint_resignation_schedule(v_notice.id);
  end if;
end;
$$;

commit;
