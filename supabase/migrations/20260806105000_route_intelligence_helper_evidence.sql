-- A route fact with zero duty hours represents helper participation rather
-- than primary driver ownership. Keep those facts visible as assistance
-- evidence, but remove them from the route-fit ranking.

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
  v_helpers jsonb;
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
      sum(fact.road_hours) as road_hours,
      sum(fact.duty_hours) as duty_hours,
      sum(fact.ils_weighted_numerator) as ils_weighted_numerator,
      sum(fact.ils_weighted_denominator) as ils_weighted_denominator,
      min(fact.service_date) as first_service_date,
      max(fact.service_date) as last_service_date
    from core.driver_scorecard_route_day_fact fact
    join core.company_roster roster
      on roster.id = fact.roster_member_id
     and roster.company_id = fact.company_id
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
        'road_hours', aggregate.road_hours,
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

  with helper_instances as (
    select
      helper_fact.roster_member_id,
      helper.full_name as helper_name,
      helper_identity.fx_id,
      helper_fact.service_date,
      helper_fact.delivery_stops,
      helper_fact.delivery_packages,
      helper_fact.pickup_stops,
      helper_fact.miles,
      assistance.assisted_driver_names
    from core.driver_scorecard_route_day_fact helper_fact
    join core.company_roster helper
      on helper.id = helper_fact.roster_member_id
     and helper.company_id = helper_fact.company_id
    left join core.company_roster_identity_v helper_identity
      on helper_identity.roster_id = helper.id
    left join lateral (
      select string_agg(distinct primary_driver.full_name, ', ' order by primary_driver.full_name)
        as assisted_driver_names
      from core.driver_scorecard_route_day_fact primary_fact
      join core.company_roster primary_driver
        on primary_driver.id = primary_fact.roster_member_id
       and primary_driver.company_id = primary_fact.company_id
      where primary_fact.company_id = helper_fact.company_id
        and primary_fact.service_date = helper_fact.service_date
        and upper(btrim(primary_fact.route_name)) = upper(btrim(helper_fact.route_name))
        and primary_fact.duty_hours > 0
        and primary_fact.roster_member_id is distinct from helper_fact.roster_member_id
    ) assistance on true
    where helper_fact.company_id = p_company_id
      and helper_fact.roster_member_id is not null
      and helper_fact.service_date between p_start_date and p_end_date
      and upper(btrim(helper_fact.route_name)) = upper(btrim(v_route_name))
      and helper_fact.duty_hours = 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roster_member_id', helper.roster_member_id,
        'helper_name', helper.helper_name,
        'fx_id', helper.fx_id,
        'service_date', helper.service_date,
        'delivery_stops', helper.delivery_stops,
        'delivery_packages', helper.delivery_packages,
        'pickup_stops', helper.pickup_stops,
        'miles', helper.miles,
        'assisted_driver_names', helper.assisted_driver_names
      )
      order by helper.service_date desc, helper.helper_name
    ),
    '[]'::jsonb
  ) into v_helpers
  from helper_instances helper;

  return jsonb_build_object(
    'route_days', v_route_days,
    'drivers', v_drivers,
    'helpers', v_helpers
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
