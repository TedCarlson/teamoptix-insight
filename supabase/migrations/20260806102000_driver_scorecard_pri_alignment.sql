-- Align driver pickup scoring to the same PRI formula and tier standards used
-- by Operations. PRI is stored on the materialized period snapshot so the
-- scorecard read path never revisits contract-year DSW JSON.

alter table core.driver_scorecard_snapshot
  add column if not exists pickup_reliability_complete boolean not null default false,
  add column if not exists pickup_pri numeric,
  add column if not exists pickup_pri_tier text;

alter table core.driver_scorecard_snapshot
  drop constraint if exists driver_scorecard_snapshot_pickup_pri_tier_check;
alter table core.driver_scorecard_snapshot
  add constraint driver_scorecard_snapshot_pickup_pri_tier_check
  check (pickup_pri_tier is null or pickup_pri_tier in ('T1', 'T2', 'T3', 'T4'));

alter table core.driver_scorecard_metric
  drop constraint if exists driver_scorecard_metric_scoring_method_check;
alter table core.driver_scorecard_metric
  add constraint driver_scorecard_metric_scoring_method_check
  check (scoring_method in ('BAND', 'BINARY_ZERO', 'RYDE_NET', 'PRI_TIER'));

update core.driver_scorecard_metric
set
  scoring_method = 'PRI_TIER',
  target_primary = 0.17,
  target_secondary = 0.72,
  target_tertiary = 1.10,
  points_primary = 10,
  points_secondary = 5,
  points_tertiary = 3,
  updated_at = now()
where metric_key = 'PICKUPS'
  and model_id in (
    select id
    from core.driver_scorecard_model
    where model_key = 'FEDEX_ALIGNED_BASELINE'
  );

create or replace function core.hydrate_driver_scorecard_snapshot_pri()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_numerator numeric;
begin
  select coalesce(bool_and(
    raw.early_pickups is not null
    and raw.late_pickups is not null
    and raw.potential_missed_pickups is not null
  ), false)
    into new.pickup_reliability_complete
  from core.driver_scorecard_route_day_fact fact
  join core.operations_report_raw_row raw on raw.id = fact.raw_row_id
  where fact.company_id = new.company_id
    and fact.roster_member_id = new.roster_member_id
    and fact.service_date between new.period_start and new.period_end;

  if not new.pickup_reliability_complete or coalesce(new.pickup_stops, 0) <= 0 then
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

drop trigger if exists hydrate_driver_scorecard_snapshot_pri
  on core.driver_scorecard_snapshot;
create trigger hydrate_driver_scorecard_snapshot_pri
before insert or update on core.driver_scorecard_snapshot
for each row execute function core.hydrate_driver_scorecard_snapshot_pri();

revoke all on function core.hydrate_driver_scorecard_snapshot_pri() from public;

-- Populate PRI for the snapshots already created by the initial BPV rebuild.
update core.driver_scorecard_snapshot
set refreshed_at = refreshed_at;

create or replace function core.attach_driver_scorecard_pri(
  p_company_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_contract_id uuid;
  v_model_id uuid;
  v_drivers jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload -> 'drivers') <> 'array' then
    return p_payload;
  end if;

  select config.id into v_contract_id
  from core.company_contract_config config
  where config.company_id = p_company_id
    and config.effective_start_date = (p_payload #>> '{range,contract_start}')::date
    and coalesce(
      config.effective_end_date,
      (p_payload #>> '{range,contract_end}')::date
    ) >= (p_payload #>> '{range,contract_end}')::date
  order by (config.status = 'ACTIVE') desc, config.updated_at desc
  limit 1;

  v_model_id := nullif(p_payload #>> '{model,id}', '')::uuid;

  with driver_rows as (
    select driver.value, driver.ordinality
    from jsonb_array_elements(p_payload -> 'drivers')
      with ordinality as driver(value, ordinality)
  ), enriched as (
    select
      driver_rows.ordinality,
      driver_rows.value || jsonb_build_object(
        'periods',
        coalesce((
          select jsonb_object_agg(
            period.key,
            period.value || jsonb_build_object(
              'pickup_reliability_complete', coalesce(snapshot.pickup_reliability_complete, false),
              'pickup_pri', snapshot.pickup_pri,
              'pickup_pri_tier', snapshot.pickup_pri_tier
            )
          )
          from jsonb_each(driver_rows.value -> 'periods') period
          left join core.driver_scorecard_snapshot snapshot
            on snapshot.company_id = p_company_id
            and snapshot.contract_id = v_contract_id
            and snapshot.model_id = v_model_id
            and snapshot.roster_member_id = (driver_rows.value ->> 'roster_id')::uuid
            and snapshot.period_key = period.key
        ), driver_rows.value -> 'periods')
      ) as value
    from driver_rows
  )
  select coalesce(jsonb_agg(enriched.value order by enriched.ordinality), '[]'::jsonb)
    into v_drivers
  from enriched;

  return jsonb_set(p_payload, '{drivers}', v_drivers, true);
end;
$$;

revoke all on function core.attach_driver_scorecard_pri(uuid, jsonb) from public;

create or replace function public.get_company_driver_scorecard_index(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_as_of_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_payload jsonb;
begin
  if exists (
    select 1
    from core.driver_scorecard_snapshot snapshot
    join core.company_contract_config config on config.id = snapshot.contract_id
    where snapshot.company_id = p_company_id
      and config.company_id = p_company_id
      and config.effective_start_date = p_start_date
      and coalesce(config.effective_end_date, p_end_date) >= p_end_date
  ) then
    v_payload := core.get_company_driver_scorecard_index_materialized(
      p_company_id, p_start_date, p_end_date, p_as_of_date
    );
    return core.attach_driver_scorecard_pri(p_company_id, v_payload);
  end if;

  return public.get_company_driver_scorecard_index_legacy(
    p_company_id, p_start_date, p_end_date, p_as_of_date
  );
end;
$$;

revoke all on function public.get_company_driver_scorecard_index(uuid, date, date, date)
  from public;
grant execute on function public.get_company_driver_scorecard_index(uuid, date, date, date)
  to authenticated, service_role;

notify pgrst, 'reload schema';
