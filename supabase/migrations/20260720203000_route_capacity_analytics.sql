begin;

create or replace function core.get_company_route_capacity_analytics_internal(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  service_date date,
  weekday_number integer,
  route_key text,
  route_baseline_id uuid,
  route_name text,
  wa_number text,
  driver_name text,

  planned_delivery_stops numeric,
  actual_delivery_stops numeric,
  actual_delivery_packages numeric,
  planned_pickup_stops numeric,
  actual_pickup_stops numeric,
  actual_pickup_packages numeric,

  classification_workload_stops numeric,

  historical_sample_size bigint,
  historical_median_stops numeric,
  historical_p10_stops numeric,
  historical_p25_stops numeric,
  historical_p75_stops numeric,
  historical_p90_stops numeric,

  effective_threshold_stops numeric,
  threshold_basis text,
  confidence_level text,

  workload_ratio numeric,
  planned_workload_ratio numeric,
  executed_workload_ratio numeric,
  route_equivalent numeric,
  planned_route_equivalent numeric,
  executed_route_equivalent numeric,
  completion_ratio numeric,

  route_class text,
  baseline_band text
)
language sql
security definer
set search_path = core, public
as $$
  with latest_final_batches as (
    select distinct on (b.service_date)
      b.id,
      b.company_id,
      b.service_date
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
      and b.service_date between
        (p_start_date - interval '182 days')::date
        and p_end_date
    order by
      b.service_date,
      b.created_at desc,
      b.id desc
  ),

  canonical_route_rows as (
    select
      b.service_date,
      extract(isodow from b.service_date)::integer as weekday_number,

      coalesce(
        nullif(r.normalized_row_json->>'route_baseline_id', ''),
        '00000000-0000-0000-0000-000000000000'
      )::uuid as route_baseline_id_value,

      nullif(btrim(coalesce(
        r.normalized_row_json->>'wa_name',
        r.source_route_key
      )), '') as route_name,

      nullif(btrim(coalesce(
        r.normalized_row_json->>'wa_number',
        r.source_wa_number
      )), '') as wa_number,

      nullif(btrim(coalesce(
        r.normalized_row_json->>'driver_name',
        r.source_driver_name
      )), '') as driver_name,

      case
        when nullif(r.normalized_row_json->>'planned_delivery_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'planned_delivery_stops')::numeric,
          0
        )
        else 0
      end as planned_delivery_stops,

      case
        when nullif(r.normalized_row_json->>'actual_delivery_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'actual_delivery_stops')::numeric,
          0
        )
        else 0
      end as actual_delivery_stops,

      case
        when nullif(r.normalized_row_json->>'actual_delivery_packages', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'actual_delivery_packages')::numeric,
          0
        )
        else 0
      end as actual_delivery_packages,

      case
        when nullif(r.normalized_row_json->>'planned_pickup_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'planned_pickup_stops')::numeric,
          0
        )
        else 0
      end as planned_pickup_stops,

      case
        when nullif(r.normalized_row_json->>'actual_pickup_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'actual_pickup_stops')::numeric,
          0
        )
        else 0
      end as actual_pickup_stops,

      case
        when nullif(r.normalized_row_json->>'actual_pickup_packages', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then greatest(
          (r.normalized_row_json->>'actual_pickup_packages')::numeric,
          0
        )
        else 0
      end as actual_pickup_packages

    from latest_final_batches b
    join core.operations_report_raw_row r
      on r.batch_id = b.id
     and r.company_id = b.company_id
    where r.row_kind = 'ROUTE'
      and nullif(btrim(r.normalized_row_json->>'wa_name'), '') is not null
      and nullif(btrim(r.normalized_row_json->>'wa_number'), '') is not null
  ),

  route_days as (
    select
      r.*,

      case
        when r.route_baseline_id_value
          <> '00000000-0000-0000-0000-000000000000'::uuid
        then 'BASELINE:' || r.route_baseline_id_value::text

        when r.wa_number is not null
        then 'WA:' || upper(regexp_replace(r.wa_number, '[^A-Za-z0-9]', '', 'g'))

        else 'NAME:' || upper(regexp_replace(
          coalesce(r.route_name, ''),
          '[^A-Za-z0-9]',
          '',
          'g'
        ))
      end as route_key_value,

      greatest(
        r.planned_delivery_stops,
        r.actual_delivery_stops
      ) as workload_stops

    from canonical_route_rows r
  ),

  route_history_candidates as (
    select
      current_row.service_date,
      current_row.route_key_value,

      history_row.weekday_number,
      history_row.route_key_value as history_route_key,
      history_row.workload_stops

    from route_days current_row
    join route_days history_row
      on history_row.service_date
        between (current_row.service_date - interval '182 days')::date
            and (current_row.service_date - interval '1 day')::date
     and history_row.workload_stops > 0
  ),

  route_weekday_stats as (
    select
      current_row.service_date,
      current_row.route_key_value,

      count(history_row.workload_stops)::bigint as sample_size,

      percentile_cont(0.10) within group (
        order by history_row.workload_stops
      )::numeric as p10,

      percentile_cont(0.25) within group (
        order by history_row.workload_stops
      )::numeric as p25,

      percentile_cont(0.50) within group (
        order by history_row.workload_stops
      )::numeric as median,

      percentile_cont(0.75) within group (
        order by history_row.workload_stops
      )::numeric as p75,

      percentile_cont(0.90) within group (
        order by history_row.workload_stops
      )::numeric as p90

    from route_days current_row
    join route_days history_row
      on history_row.route_key_value = current_row.route_key_value
     and history_row.weekday_number = current_row.weekday_number
     and history_row.service_date
        between (current_row.service_date - interval '182 days')::date
            and (current_row.service_date - interval '1 day')::date
     and history_row.workload_stops > 0
    group by
      current_row.service_date,
      current_row.route_key_value
  ),

  route_stats as (
    select
      current_row.service_date,
      current_row.route_key_value,

      count(history_row.workload_stops)::bigint as sample_size,

      percentile_cont(0.10) within group (
        order by history_row.workload_stops
      )::numeric as p10,

      percentile_cont(0.25) within group (
        order by history_row.workload_stops
      )::numeric as p25,

      percentile_cont(0.50) within group (
        order by history_row.workload_stops
      )::numeric as median,

      percentile_cont(0.75) within group (
        order by history_row.workload_stops
      )::numeric as p75,

      percentile_cont(0.90) within group (
        order by history_row.workload_stops
      )::numeric as p90

    from route_days current_row
    join route_days history_row
      on history_row.route_key_value = current_row.route_key_value
     and history_row.service_date
        between (current_row.service_date - interval '182 days')::date
            and (current_row.service_date - interval '1 day')::date
     and history_row.workload_stops > 0
    group by
      current_row.service_date,
      current_row.route_key_value
  ),

  company_weekday_stats as (
    select
      current_row.service_date,
      current_row.weekday_number,

      count(history_row.workload_stops)::bigint as sample_size,

      percentile_cont(0.10) within group (
        order by history_row.workload_stops
      )::numeric as p10,

      percentile_cont(0.25) within group (
        order by history_row.workload_stops
      )::numeric as p25,

      percentile_cont(0.50) within group (
        order by history_row.workload_stops
      )::numeric as median,

      percentile_cont(0.75) within group (
        order by history_row.workload_stops
      )::numeric as p75,

      percentile_cont(0.90) within group (
        order by history_row.workload_stops
      )::numeric as p90

    from (
      select distinct
        service_date,
        weekday_number
      from route_days
    ) current_row
    join route_days history_row
      on history_row.weekday_number = current_row.weekday_number
     and history_row.service_date
        between (current_row.service_date - interval '182 days')::date
            and (current_row.service_date - interval '1 day')::date
     and history_row.workload_stops > 0
    group by
      current_row.service_date,
      current_row.weekday_number
  ),

  company_stats as (
    select
      current_row.service_date,

      count(history_row.workload_stops)::bigint as sample_size,

      percentile_cont(0.10) within group (
        order by history_row.workload_stops
      )::numeric as p10,

      percentile_cont(0.25) within group (
        order by history_row.workload_stops
      )::numeric as p25,

      percentile_cont(0.50) within group (
        order by history_row.workload_stops
      )::numeric as median,

      percentile_cont(0.75) within group (
        order by history_row.workload_stops
      )::numeric as p75,

      percentile_cont(0.90) within group (
        order by history_row.workload_stops
      )::numeric as p90

    from (
      select distinct service_date
      from route_days
    ) current_row
    join route_days history_row
      on history_row.service_date
        between (current_row.service_date - interval '182 days')::date
            and (current_row.service_date - interval '1 day')::date
     and history_row.workload_stops > 0
    group by current_row.service_date
  ),

  resolved_norms as (
    select
      r.*,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.sample_size
        when coalesce(ra.sample_size, 0) >= 12 then ra.sample_size
        when coalesce(cw.sample_size, 0) >= 20 then cw.sample_size
        when coalesce(ca.sample_size, 0) >= 40 then ca.sample_size
        else coalesce(
          rw.sample_size,
          ra.sample_size,
          cw.sample_size,
          ca.sample_size,
          0
        )
      end as norm_sample_size,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.p10
        when coalesce(ra.sample_size, 0) >= 12 then ra.p10
        when coalesce(cw.sample_size, 0) >= 20 then cw.p10
        when coalesce(ca.sample_size, 0) >= 40 then ca.p10
        else coalesce(rw.p10, ra.p10, cw.p10, ca.p10)
      end as norm_p10,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.p25
        when coalesce(ra.sample_size, 0) >= 12 then ra.p25
        when coalesce(cw.sample_size, 0) >= 20 then cw.p25
        when coalesce(ca.sample_size, 0) >= 40 then ca.p25
        else coalesce(rw.p25, ra.p25, cw.p25, ca.p25)
      end as norm_p25,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.median
        when coalesce(ra.sample_size, 0) >= 12 then ra.median
        when coalesce(cw.sample_size, 0) >= 20 then cw.median
        when coalesce(ca.sample_size, 0) >= 40 then ca.median
        else coalesce(rw.median, ra.median, cw.median, ca.median)
      end as norm_median,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.p75
        when coalesce(ra.sample_size, 0) >= 12 then ra.p75
        when coalesce(cw.sample_size, 0) >= 20 then cw.p75
        when coalesce(ca.sample_size, 0) >= 40 then ca.p75
        else coalesce(rw.p75, ra.p75, cw.p75, ca.p75)
      end as norm_p75,

      case
        when coalesce(rw.sample_size, 0) >= 6 then rw.p90
        when coalesce(ra.sample_size, 0) >= 12 then ra.p90
        when coalesce(cw.sample_size, 0) >= 20 then cw.p90
        when coalesce(ca.sample_size, 0) >= 40 then ca.p90
        else coalesce(rw.p90, ra.p90, cw.p90, ca.p90)
      end as norm_p90,

      case
        when coalesce(rw.sample_size, 0) >= 6 then 'ROUTE_WEEKDAY'
        when coalesce(ra.sample_size, 0) >= 12 then 'ROUTE'
        when coalesce(cw.sample_size, 0) >= 20 then 'COMPANY_WEEKDAY'
        when coalesce(ca.sample_size, 0) >= 40 then 'COMPANY'
        else 'INSUFFICIENT_HISTORY'
      end as norm_basis,

      case
        when coalesce(rw.sample_size, 0) >= 12 then 'HIGH'
        when coalesce(rw.sample_size, 0) >= 6
          or coalesce(ra.sample_size, 0) >= 12
        then 'MODERATE'
        else 'LOW'
      end as norm_confidence

    from route_days r
    left join route_weekday_stats rw
      on rw.service_date = r.service_date
     and rw.route_key_value = r.route_key_value
    left join route_stats ra
      on ra.service_date = r.service_date
     and ra.route_key_value = r.route_key_value
    left join company_weekday_stats cw
      on cw.service_date = r.service_date
     and cw.weekday_number = r.weekday_number
    left join company_stats ca
      on ca.service_date = r.service_date
  ),

  scored as (
    select
      n.*,

      greatest(
        15::numeric,
        coalesce(n.norm_p10, 0),
        coalesce(n.norm_median * 0.40, 0)
      ) as threshold_stops,

      case
        when n.norm_median > 0
        then n.workload_stops / n.norm_median
        else null
      end as workload_ratio_value,

      case
        when n.norm_median > 0
        then n.planned_delivery_stops / n.norm_median
        else null
      end as planned_ratio_value,

      case
        when n.norm_median > 0
        then n.actual_delivery_stops / n.norm_median
        else null
      end as executed_ratio_value

    from resolved_norms n
  )

  select
    s.service_date,
    s.weekday_number,
    s.route_key_value,
    nullif(
      s.route_baseline_id_value,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    s.route_name,
    s.wa_number,
    s.driver_name,

    s.planned_delivery_stops,
    s.actual_delivery_stops,
    s.actual_delivery_packages,
    s.planned_pickup_stops,
    s.actual_pickup_stops,
    s.actual_pickup_packages,

    s.workload_stops,

    s.norm_sample_size,
    s.norm_median,
    s.norm_p10,
    s.norm_p25,
    s.norm_p75,
    s.norm_p90,

    s.threshold_stops,
    s.norm_basis,
    s.norm_confidence,

    round(s.workload_ratio_value, 4),
    round(s.planned_ratio_value, 4),
    round(s.executed_ratio_value, 4),

    round(s.workload_ratio_value, 4),
    round(s.planned_ratio_value, 4),
    round(s.executed_ratio_value, 4),

    case
      when s.planned_delivery_stops > 0
      then round(
        s.actual_delivery_stops / s.planned_delivery_stops,
        4
      )
      else null
    end,

    case
      when s.workload_stops <= 0
        and greatest(
          s.planned_pickup_stops,
          s.actual_pickup_stops
        ) > 0
      then 'PICKUP_ONLY'

      when s.workload_stops <= 0
      then 'EXCLUDED'

      when s.workload_stops < s.threshold_stops
      then 'SUPPLEMENTAL'

      else 'BASELINE'
    end,

    case
      when s.workload_stops <= 0
        or s.workload_stops < s.threshold_stops
      then null

      when s.workload_ratio_value is null
      then 'NORMAL_LOW_CONFIDENCE'

      when s.workload_ratio_value < 0.75
      then 'LIGHT'

      when s.workload_ratio_value <= 1.25
      then 'NORMAL'

      when s.workload_ratio_value <= 1.50
      then 'HEAVY'

      else 'EXTREME'
    end

  from scored s
  where s.service_date between p_start_date and p_end_date
  order by
    s.service_date,
    s.route_key_value;
$$;

alter function core.get_company_route_capacity_analytics_internal(
  uuid,
  date,
  date
) owner to postgres;

revoke all on function core.get_company_route_capacity_analytics_internal(
  uuid,
  date,
  date
) from public;

grant execute on function core.get_company_route_capacity_analytics_internal(
  uuid,
  date,
  date
) to service_role;


create or replace function public.get_company_route_capacity_analytics(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language sql
security definer
set search_path = core, public
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(result_row)
      order by
        result_row.service_date,
        result_row.route_key
    ),
    '[]'::jsonb
  )
  from core.get_company_route_capacity_analytics_internal(
    p_company_id,
    p_start_date,
    p_end_date
  ) result_row;
$$;

alter function public.get_company_route_capacity_analytics(
  uuid,
  date,
  date
) owner to postgres;

revoke all on function public.get_company_route_capacity_analytics(
  uuid,
  date,
  date
) from public;

grant execute on function public.get_company_route_capacity_analytics(
  uuid,
  date,
  date
) to authenticated;

grant execute on function public.get_company_route_capacity_analytics(
  uuid,
  date,
  date
) to service_role;

commit;
