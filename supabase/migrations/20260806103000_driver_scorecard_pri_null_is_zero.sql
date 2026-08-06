-- FedEx DSW pickup exception fields are exception-only: an empty field means
-- zero events. Pickup stops establish the denominator and therefore whether a
-- period has a PRI sample. Preserve the raw nulls as source evidence and apply
-- the zero convention only in derived analytics.

create or replace function core.hydrate_driver_scorecard_snapshot_pri()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_numerator numeric;
begin
  new.pickup_reliability_complete := coalesce(new.pickup_stops, 0) > 0;

  if not new.pickup_reliability_complete then
    new.pickup_pri := null;
    new.pickup_pri_tier := null;
    return new;
  end if;

  v_numerator :=
    coalesce(new.early_pickups, 0) * 225
    + coalesce(new.late_pickups, 0) * 150
    + coalesce(new.potential_missed_pickups, 0) * 400;
  new.pickup_pri := v_numerator / new.pickup_stops;
  new.pickup_pri_tier := case
    when new.pickup_pri < 0.17 then 'T4'
    when new.pickup_pri <= 0.72 then 'T3'
    when new.pickup_pri <= 1.10 then 'T2'
    else 'T1'
  end;
  return new;
end;
$$;

revoke all on function core.hydrate_driver_scorecard_snapshot_pri() from public;

-- Re-evaluate only the small materialized snapshot table. The raw DSW rows and
-- stored atomic route/day facts are not rewritten.
update core.driver_scorecard_snapshot
set refreshed_at = refreshed_at;

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
  if not core.is_company_member(p_company_id) then
    raise exception 'Forbidden';
  end if;

  return query
  with latest_final_batches as (
    select distinct on (batch.service_date)
      batch.id,
      batch.service_date
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date between p_start_date and p_end_date
    order by batch.service_date, batch.created_at desc, batch.id desc
  ), pickup_rows as (
    select
      batch.service_date,
      case
        when nullif(raw.normalized_row_json ->> 'actual_pickup_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (raw.normalized_row_json ->> 'actual_pickup_stops')::numeric,
          0
        )
        else 0
      end as actual_pickup_stops,
      coalesce(raw.early_pickups, 0)::bigint as early_pickups,
      coalesce(raw.late_pickups, 0)::bigint as late_pickups,
      coalesce(raw.potential_missed_pickups, 0)::bigint
        as potential_missed_pickups
    from latest_final_batches batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    where raw.row_kind = 'ROUTE'
      and nullif(raw.normalized_row_json ->> 'wa_name', '') is not null
      and coalesce(raw.source_route_key, '') !~ '^[0-9]+$'
  )
  select
    pickup_rows.service_date,
    sum(pickup_rows.actual_pickup_stops) as actual_pickup_stops,
    sum(pickup_rows.early_pickups)::bigint as early_pickups,
    sum(pickup_rows.late_pickups)::bigint as late_pickups,
    sum(pickup_rows.potential_missed_pickups)::bigint
      as potential_missed_pickups,
    sum(pickup_rows.actual_pickup_stops) > 0
      as pickup_reliability_complete
  from pickup_rows
  group by pickup_rows.service_date
  order by pickup_rows.service_date;
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
