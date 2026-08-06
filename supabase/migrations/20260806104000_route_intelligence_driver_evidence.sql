-- Enrich one selected-route report with driver-owned, already-materialized DSW
-- facts. The route page makes one RPC call; general Route Intelligence remains
-- on the shared analytics payload and never expands into a company-wide scan.

create index if not exists driver_scorecard_route_day_company_route_date_idx
  on core.driver_scorecard_route_day_fact (
    company_id,
    upper(btrim(route_name)),
    service_date
  );

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

  select coalesce(jsonb_agg(to_jsonb(route_day) order by route_day.service_date), '[]'::jsonb)
    into v_route_days
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

  return jsonb_build_object(
    'route_days', v_route_days,
    'drivers', v_drivers
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
