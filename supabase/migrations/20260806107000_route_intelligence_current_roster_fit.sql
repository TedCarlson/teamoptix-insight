-- Restrict route-fit candidates to current Active and Trainee roster members.
-- Zero-duty route facts are not reliable evidence of route difficulty because
-- they can represent helpers, trainees, or other manager-directed support.
-- Keep them out of primary-driver ownership, but do not infer, return, or rank
-- assistance. Replace that signal with denominator-qualified route density and
-- pace facts from primary-driver records.

create or replace function public.get_company_route_intelligence_bundle(
  p_company_id uuid,
  p_route_baseline_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_route_name text;
  v_route_days jsonb;
  v_drivers jsonb;
  v_route_metrics jsonb;
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

  select baseline.route_name
    into v_route_name
  from public.route_baseline baseline
  where baseline.id = p_route_baseline_id
    and baseline.company_id = p_company_id;

  if v_route_name is null then
    raise exception 'Route not found.' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(route_day) order by route_day.service_date),
    '[]'::jsonb
  ) into v_route_days
  from public.get_company_route_intelligence_detail(
    p_company_id,
    p_route_baseline_id,
    p_start_date,
    p_end_date
  ) route_day;

  with driver_aggregate as (
    select
      fact.roster_member_id,
      max(roster.full_name) as driver_name,
      max(identity.fx_id) as fx_id,
      max(roster.employment_status) as employment_status,
      count(distinct fact.service_date)::integer as operating_days,
      sum(fact.delivery_stops) as delivery_stops,
      sum(fact.delivery_packages) as delivery_packages,
      sum(fact.pickup_stops) as pickup_stops,
      sum(fact.pickup_packages) as pickup_packages,
      sum(fact.early_pickups) as early_pickups,
      sum(fact.late_pickups) as late_pickups,
      sum(fact.potential_missed_pickups) as potential_missed_pickups,
      sum(fact.exceptions) as exceptions,
      sum(fact.code_85) as code_85,
      sum(fact.dna) as dna,
      sum(fact.send_again) as send_again,
      sum(fact.required_signature) as required_signature,
      sum(fact.miles) as miles,
      (count(distinct fact.service_date) filter (where fact.miles > 0))::integer as mileage_days,
      sum(fact.delivery_stops) filter (where fact.miles > 0) as mileage_delivery_stops,
      sum(fact.delivery_packages) filter (where fact.miles > 0) as mileage_delivery_packages,
      sum(fact.road_hours) as road_hours,
      (count(distinct fact.service_date) filter (where fact.road_hours > 0))::integer as road_hour_days,
      sum(fact.delivery_stops) filter (where fact.road_hours > 0) as road_hour_delivery_stops,
      sum(fact.delivery_packages) filter (where fact.road_hours > 0) as road_hour_delivery_packages,
      sum(fact.duty_hours) as duty_hours,
      sum(fact.ils_weighted_numerator) as ils_weighted_numerator,
      sum(fact.ils_weighted_denominator) as ils_weighted_denominator,
      min(fact.service_date) as first_service_date,
      max(fact.service_date) as last_service_date
    from core.driver_scorecard_route_day_fact fact
    join core.company_roster roster
      on roster.id = fact.roster_member_id
     and roster.company_id = fact.company_id
     and roster.employment_status in ('Active', 'Trainee')
    left join core.company_roster_identity_v identity
      on identity.roster_id = roster.id
    where fact.company_id = p_company_id
      and fact.roster_member_id is not null
      and fact.service_date between p_start_date and p_end_date
      and upper(btrim(fact.route_name)) = upper(btrim(v_route_name))
      and fact.duty_hours > 0
    group by fact.roster_member_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roster_member_id', aggregate.roster_member_id,
        'driver_name', aggregate.driver_name,
        'fx_id', aggregate.fx_id,
        'employment_status', aggregate.employment_status,
        'operating_days', aggregate.operating_days,
        'delivery_stops', aggregate.delivery_stops,
        'delivery_packages', aggregate.delivery_packages,
        'pickup_stops', aggregate.pickup_stops,
        'pickup_packages', aggregate.pickup_packages,
        'early_pickups', aggregate.early_pickups,
        'late_pickups', aggregate.late_pickups,
        'potential_missed_pickups', aggregate.potential_missed_pickups,
        'exceptions', aggregate.exceptions,
        'code_85', aggregate.code_85,
        'dna', aggregate.dna,
        'send_again', aggregate.send_again,
        'required_signature', aggregate.required_signature,
        'miles', aggregate.miles,
        'mileage_days', aggregate.mileage_days,
        'mileage_delivery_stops', aggregate.mileage_delivery_stops,
        'mileage_delivery_packages', aggregate.mileage_delivery_packages,
        'road_hours', aggregate.road_hours,
        'road_hour_days', aggregate.road_hour_days,
        'road_hour_delivery_stops', aggregate.road_hour_delivery_stops,
        'road_hour_delivery_packages', aggregate.road_hour_delivery_packages,
        'duty_hours', aggregate.duty_hours,
        'observed_ils', case
          when aggregate.ils_weighted_denominator > 0
          then aggregate.ils_weighted_numerator / aggregate.ils_weighted_denominator
          else null
        end,
        'first_service_date', aggregate.first_service_date,
        'last_service_date', aggregate.last_service_date
      )
      order by aggregate.operating_days desc, aggregate.driver_name
    ),
    '[]'::jsonb
  ) into v_drivers
  from driver_aggregate aggregate;

  select jsonb_build_object(
    'operating_days', count(distinct fact.service_date),
    'delivery_stops', coalesce(sum(fact.delivery_stops), 0),
    'delivery_packages', coalesce(sum(fact.delivery_packages), 0),
    'miles', coalesce(sum(fact.miles), 0),
    'mileage_days', count(distinct fact.service_date) filter (where fact.miles > 0),
    'mileage_delivery_stops', coalesce(sum(fact.delivery_stops) filter (where fact.miles > 0), 0),
    'mileage_delivery_packages', coalesce(sum(fact.delivery_packages) filter (where fact.miles > 0), 0),
    'road_hours', coalesce(sum(fact.road_hours), 0),
    'road_hour_days', count(distinct fact.service_date) filter (where fact.road_hours > 0),
    'road_hour_delivery_stops', coalesce(sum(fact.delivery_stops) filter (where fact.road_hours > 0), 0),
    'road_hour_delivery_packages', coalesce(sum(fact.delivery_packages) filter (where fact.road_hours > 0), 0),
    'duty_hours', coalesce(sum(fact.duty_hours), 0)
  ) into v_route_metrics
  from core.driver_scorecard_route_day_fact fact
  where fact.company_id = p_company_id
    and fact.roster_member_id is not null
    and fact.service_date between p_start_date and p_end_date
    and upper(btrim(fact.route_name)) = upper(btrim(v_route_name))
    and fact.duty_hours > 0;

  return jsonb_build_object(
    'route_days', v_route_days,
    'drivers', v_drivers,
    'route_metrics', v_route_metrics
  );
end;
$$;

revoke all on function public.get_company_route_intelligence_bundle(
  uuid,
  uuid,
  date,
  date
) from public;

grant execute on function public.get_company_route_intelligence_bundle(
  uuid,
  uuid,
  date,
  date
) to authenticated, service_role;

notify pgrst, 'reload schema';
