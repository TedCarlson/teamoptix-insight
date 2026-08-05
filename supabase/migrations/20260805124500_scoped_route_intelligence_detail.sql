create or replace function public.get_company_route_intelligence_detail(
  p_company_id uuid,
  p_route_baseline_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  service_date date,
  weekday_number integer,
  route_baseline_id uuid,
  route_name text,
  wa_number text,
  driver_name text,
  planned_delivery_stops numeric,
  actual_delivery_stops numeric,
  actual_delivery_packages numeric,
  planned_pickup_stops numeric,
  actual_pickup_stops numeric,
  actual_pickup_packages numeric
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if p_company_id is null
    or p_route_baseline_id is null
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company, route, and valid contract range are required.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  return query
  with latest_final_batches as (
    select distinct on (b.service_date)
      b.id,
      b.service_date
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
      and b.service_date between
        (p_start_date - interval '182 days')::date
        and p_end_date
    order by b.service_date, b.created_at desc, b.id desc
  )
  select
    b.service_date,
    extract(isodow from b.service_date)::integer,
    nullif(r.normalized_row_json ->> 'route_baseline_id', '')::uuid,
    nullif(btrim(coalesce(
      r.normalized_row_json ->> 'wa_name',
      r.source_route_key
    )), ''),
    nullif(btrim(coalesce(
      r.normalized_row_json ->> 'wa_number',
      r.source_wa_number
    )), ''),
    nullif(btrim(coalesce(
      r.normalized_row_json ->> 'driver_name',
      r.source_driver_name
    )), ''),
    case
      when nullif(r.normalized_row_json ->> 'planned_delivery_stops', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'planned_delivery_stops')::numeric, 0)
      else 0
    end,
    case
      when nullif(r.normalized_row_json ->> 'actual_delivery_stops', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'actual_delivery_stops')::numeric, 0)
      else 0
    end,
    case
      when nullif(r.normalized_row_json ->> 'actual_delivery_packages', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'actual_delivery_packages')::numeric, 0)
      else 0
    end,
    case
      when nullif(r.normalized_row_json ->> 'planned_pickup_stops', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'planned_pickup_stops')::numeric, 0)
      else 0
    end,
    case
      when nullif(r.normalized_row_json ->> 'actual_pickup_stops', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'actual_pickup_stops')::numeric, 0)
      else 0
    end,
    case
      when nullif(r.normalized_row_json ->> 'actual_pickup_packages', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest((r.normalized_row_json ->> 'actual_pickup_packages')::numeric, 0)
      else 0
    end
  from latest_final_batches b
  join core.operations_report_raw_row r
    on r.batch_id = b.id
   and r.company_id = p_company_id
  where r.row_kind = 'ROUTE'
    and nullif(r.normalized_row_json ->> 'route_baseline_id', '')::uuid
      = p_route_baseline_id
  order by b.service_date;
end;
$$;

revoke all on function public.get_company_route_intelligence_detail(
  uuid,
  uuid,
  date,
  date
) from public;

grant execute on function public.get_company_route_intelligence_detail(
  uuid,
  uuid,
  date,
  date
) to authenticated, service_role;
