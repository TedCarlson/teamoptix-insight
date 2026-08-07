-- Align the company-level pickup reliability history with the same normalized
-- route/day facts used by Driver Scorecards. The dashboard still receives this
-- inside the single shared analytics payload; analytics surfaces do not issue
-- their own DSW reads.

create or replace function public.get_company_pickup_reliability_history(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  service_date date,
  actual_pickup_stops numeric,
  early_pickups bigint,
  late_pickups bigint,
  potential_missed_pickups bigint,
  pickup_reliability_complete boolean
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if p_company_id is null
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A valid company and date range of no more than 366 days is required.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  return query
  with materialized_days as (
    select distinct fact.service_date
    from core.driver_scorecard_route_day_fact fact
    where fact.company_id = p_company_id
      and fact.service_date between p_start_date and p_end_date
  ),
  materialized_rows as (
    select
      fact.service_date,
      greatest(coalesce(fact.pickup_stops, 0), 0) as pickup_stops,
      greatest(coalesce(fact.early_pickups, 0), 0) as early_pickups,
      greatest(coalesce(fact.late_pickups, 0), 0) as late_pickups,
      greatest(coalesce(fact.potential_missed_pickups, 0), 0)
        as potential_missed_pickups
    from core.driver_scorecard_route_day_fact fact
    where fact.company_id = p_company_id
      and fact.service_date between p_start_date and p_end_date
  ),
  latest_final_batches as (
    select distinct on (batch.service_date)
      batch.id,
      batch.service_date
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date between p_start_date and p_end_date
      and not exists (
        select 1
        from materialized_days built
        where built.service_date = batch.service_date
      )
    order by batch.service_date, batch.created_at desc, batch.id desc
  ),
  raw_fallback_rows as (
    select
      batch.service_date,
      greatest(
        coalesce(
          core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_stops'),
          0
        ),
        0
      ) as pickup_stops,
      greatest(
        coalesce(
          raw.early_pickups,
          core.safe_numeric(raw.normalized_row_json ->> 'early_pickups'),
          0
        ),
        0
      ) as early_pickups,
      greatest(
        coalesce(
          raw.late_pickups,
          core.safe_numeric(raw.normalized_row_json ->> 'late_pickups'),
          0
        ),
        0
      ) as late_pickups,
      greatest(
        coalesce(
          raw.potential_missed_pickups,
          core.safe_numeric(raw.normalized_row_json ->> 'potential_missed_pickups'),
          0
        ),
        0
      ) as potential_missed_pickups
    from latest_final_batches batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    where raw.company_id = p_company_id
      and raw.row_kind = 'ROUTE'
  ),
  pickup_rows as (
    select * from materialized_rows
    union all
    select * from raw_fallback_rows
  )
  select
    pickup.service_date,
    coalesce(sum(pickup.pickup_stops), 0) as actual_pickup_stops,
    coalesce(sum(pickup.early_pickups), 0)::bigint as early_pickups,
    coalesce(sum(pickup.late_pickups), 0)::bigint as late_pickups,
    coalesce(sum(pickup.potential_missed_pickups), 0)::bigint
      as potential_missed_pickups,
    coalesce(sum(pickup.pickup_stops), 0) > 0
      as pickup_reliability_complete
  from pickup_rows pickup
  group by pickup.service_date
  order by pickup.service_date;
end;
$$;

revoke all on function public.get_company_pickup_reliability_history(
  uuid,
  date,
  date
) from public;

grant execute on function public.get_company_pickup_reliability_history(
  uuid,
  date,
  date
) to authenticated, service_role;

notify pgrst, 'reload schema';
