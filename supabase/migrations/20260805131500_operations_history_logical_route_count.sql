create or replace function public.get_company_operations_history(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  batch_id uuid,
  company_id uuid,
  service_date date,
  weekday_number integer,
  weekday_key text,
  is_weekday boolean,
  is_weekend boolean,
  source_filename text,
  batch_created_at timestamptz,
  generated_at_text text,
  terminal_identity text,
  contract_label text,
  route_count integer,
  actual_delivery_stops numeric,
  actual_delivery_packages numeric,
  actual_pickup_stops numeric,
  actual_pickup_packages numeric,
  total_stops numeric,
  total_packages numeric,
  recorded_miles numeric,
  valid_miles numeric,
  mileage_anomaly_count integer,
  routes_with_miles integer,
  on_road_hours numeric,
  on_duty_hours numeric,
  routes_with_road_hours integer,
  routes_with_duty_hours integer,
  potential_dot_hours_violations integer,
  ils_percent numeric,
  ils_impact_packages numeric,
  exceptions numeric,
  dna numeric,
  code_85 numeric,
  send_again numeric,
  all_status_code_packages numeric,
  required_signature numeric,
  planned_delivery_stops numeric,
  planned_pickup_stops numeric,
  normalized_row_json jsonb
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if p_company_id is null then
    raise exception 'Company id is required.' using errcode = '22023';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required.' using errcode = '22023';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date must not precede start date.' using errcode = '22023';
  end if;

  if (p_end_date - p_start_date) > 365 then
    raise exception 'Analytics history requests are limited to 366 calendar days.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;

  return query
  select
    history.batch_id,
    history.company_id,
    history.service_date,
    history.weekday_number,
    history.weekday_key,
    history.is_weekday,
    history.is_weekend,
    history.source_filename,
    history.batch_created_at,
    history.generated_at_text,
    history.terminal_identity,
    history.contract_label,
    coalesce((
      select count(distinct coalesce(
        nullif(raw.normalized_row_json ->> 'route_baseline_id', ''),
        nullif('WA:' || upper(regexp_replace(
          coalesce(raw.normalized_row_json ->> 'wa_number', ''),
          '[^A-Za-z0-9]',
          '',
          'g'
        )), 'WA:'),
        nullif('NAME:' || upper(regexp_replace(
          coalesce(raw.normalized_row_json ->> 'wa_name', ''),
          '[^A-Za-z0-9]',
          '',
          'g'
        )), 'NAME:')
      ))::integer
      from core.operations_report_raw_row raw
      where raw.batch_id = history.batch_id
        and raw.company_id = history.company_id
        and raw.row_kind = 'ROUTE'
        and nullif(raw.normalized_row_json ->> 'wa_name', '') is not null
        and coalesce(raw.source_route_key, '') !~ '^[0-9]+$'
    ), 0) as route_count,
    history.actual_delivery_stops,
    history.actual_delivery_packages,
    history.actual_pickup_stops,
    history.actual_pickup_packages,
    history.total_stops,
    history.total_packages,
    history.recorded_miles,
    history.valid_miles,
    history.mileage_anomaly_count,
    history.routes_with_miles,
    history.on_road_hours,
    history.on_duty_hours,
    history.routes_with_road_hours,
    history.routes_with_duty_hours,
    history.potential_dot_hours_violations,
    history.ils_percent,
    history.ils_impact_packages,
    history.exceptions,
    history.dna,
    history.code_85,
    history.send_again,
    history.all_status_code_packages,
    history.required_signature,
    history.planned_delivery_stops,
    history.planned_pickup_stops,
    history.normalized_row_json
  from core.get_company_operations_history_internal(
    p_company_id,
    p_start_date,
    p_end_date
  ) history;
end;
$$;
