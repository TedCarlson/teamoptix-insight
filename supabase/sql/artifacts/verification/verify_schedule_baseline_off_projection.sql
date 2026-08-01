-- Read-only verification for Beacon Point recurring scheduled-off projection.

do $$
declare
  v_company_id constant uuid := '0385bc8f-eb13-490b-92c8-f34bad2507df';
  v_angelica_id constant uuid := 'f8df80ca-9973-4825-ace4-9246dd443031';
  v_wednesday_off_names text[];
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'schedule_day_fact'
      and indexname = 'schedule_day_fact_company_date_roster_uidx'
  ) then
    raise exception 'Schedule person-day uniqueness index is missing';
  end if;

  select array_agg(roster.full_name order by roster.full_name)
  into v_wednesday_off_names
  from public.schedule_day_fact fact
  join core.company_roster roster
    on roster.id = fact.roster_member_id
   and roster.company_id = fact.company_id
  where fact.company_id = v_company_id
    and fact.service_date = '2026-08-05'::date
    and fact.planned_on is false
    and fact.source_kind = 'BASELINE'
    and fact.override_id is null
    and roster.employment_status = 'Active'
    and lower(coalesce(roster.worker_type, '')) not like '%helper%'
    and lower(coalesce(roster.worker_type, '')) not like '%jumper%'
    and lower(coalesce(roster.worker_type, '')) not like '%trainee%';

  if v_wednesday_off_names is distinct from array[
    'Angelica Winston',
    'Chris Maute'
  ]::text[] then
    raise exception
      'Expected the two verified Wednesday scheduled-off drivers, found %',
      v_wednesday_off_names;
  end if;

  if not exists (
    select 1
    from public.schedule_day_fact fact
    where fact.company_id = v_company_id
      and fact.roster_member_id = v_angelica_id
      and fact.service_date = '2026-08-01'::date
      and fact.planned_on is true
      and fact.source_kind = 'BASELINE'
      and fact.override_id is null
  ) then
    raise exception 'Expected Angelica to be scheduled on for rotation Saturday 2026-08-01';
  end if;

  if not exists (
    select 1
    from public.schedule_day_fact fact
    where fact.company_id = v_company_id
      and fact.roster_member_id = v_angelica_id
      and fact.service_date = '2026-08-08'::date
      and fact.planned_on is false
      and fact.source_kind = 'BASELINE'
      and fact.override_id is null
  ) then
    raise exception 'Expected Angelica to be scheduled off for rotation Saturday 2026-08-08';
  end if;

  if exists (
    select 1
    from public.resolve_schedule_projection(
      v_company_id,
      '2026-08-01'::date,
      42
    ) projection
    group by projection.service_date, projection.roster_member_id
    having count(*) <> 1
  ) then
    raise exception 'Schedule projection contains duplicate person-day rows';
  end if;

  if exists (
    select 1
    from public.schedule_day_fact fact
    where fact.company_id = v_company_id
      and fact.service_date between '2026-08-01'::date and '2026-12-12'::date
    group by fact.service_date, fact.roster_member_id
    having count(*) <> 1
  ) then
    raise exception 'Materialized schedule facts contain duplicate person-day rows';
  end if;
end;
$$;
