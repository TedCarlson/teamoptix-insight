-- Driver Scorecards read model.
--
-- FINAL DSW JSON remains the immutable source evidence. This migration projects
-- that evidence into typed driver-owned facts once, at ingestion time, so
-- scorecard requests never parse the contract-year JSON warehouse.

create or replace function core.driver_scorecard_week_start(p_service_date date)
returns date
language sql
immutable
set search_path = core, public
as $$
  select p_service_date - ((extract(dow from p_service_date)::integer + 1) % 7);
$$;

create table if not exists core.driver_scorecard_route_day_fact (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  contract_id uuid references core.company_contract_config(id) on delete set null,
  batch_id uuid not null references core.operations_report_batch(id) on delete cascade,
  raw_row_id uuid not null references core.operations_report_raw_row(id) on delete cascade,
  service_date date not null,
  week_start date not null,
  roster_member_id uuid references core.company_roster(id) on delete set null,
  route_name text,
  wa_number text,
  driver_name_evidence text,
  dswid_evidence text,
  match_method text,
  match_confidence numeric,
  delivery_stops numeric not null default 0,
  delivery_packages numeric not null default 0,
  pickup_stops numeric not null default 0,
  pickup_packages numeric not null default 0,
  early_pickups numeric not null default 0,
  late_pickups numeric not null default 0,
  potential_missed_pickups numeric not null default 0,
  exceptions numeric not null default 0,
  code_85 numeric not null default 0,
  dna numeric not null default 0,
  send_again numeric not null default 0,
  required_signature numeric not null default 0,
  miles numeric not null default 0,
  road_hours numeric not null default 0,
  duty_hours numeric not null default 0,
  ils_weighted_numerator numeric not null default 0,
  ils_weighted_denominator numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(raw_row_id)
);

create index if not exists driver_scorecard_route_day_company_driver_date_idx
  on core.driver_scorecard_route_day_fact(company_id, roster_member_id, service_date);
create index if not exists driver_scorecard_route_day_company_date_idx
  on core.driver_scorecard_route_day_fact(company_id, service_date);

create table if not exists core.driver_scorecard_day_fact (
  company_id uuid not null references core.companies(id) on delete cascade,
  contract_id uuid references core.company_contract_config(id) on delete set null,
  service_date date not null,
  week_start date not null,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  route_days integer not null default 0,
  delivery_stops numeric not null default 0,
  delivery_packages numeric not null default 0,
  pickup_stops numeric not null default 0,
  pickup_packages numeric not null default 0,
  early_pickups numeric not null default 0,
  late_pickups numeric not null default 0,
  potential_missed_pickups numeric not null default 0,
  exceptions numeric not null default 0,
  code_85 numeric not null default 0,
  dna numeric not null default 0,
  send_again numeric not null default 0,
  required_signature numeric not null default 0,
  miles numeric not null default 0,
  road_hours numeric not null default 0,
  duty_hours numeric not null default 0,
  ils_weighted_numerator numeric not null default 0,
  ils_weighted_denominator numeric not null default 0,
  source_batch_id uuid not null references core.operations_report_batch(id) on delete cascade,
  refreshed_at timestamptz not null default now(),
  primary key(company_id, service_date, roster_member_id)
);

create index if not exists driver_scorecard_day_contract_driver_date_idx
  on core.driver_scorecard_day_fact(contract_id, roster_member_id, service_date);

create table if not exists core.driver_scorecard_week_fact (
  company_id uuid not null references core.companies(id) on delete cascade,
  contract_id uuid not null references core.company_contract_config(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  operating_days integer not null default 0,
  route_days integer not null default 0,
  delivery_stops numeric not null default 0,
  delivery_packages numeric not null default 0,
  pickup_stops numeric not null default 0,
  pickup_packages numeric not null default 0,
  early_pickups numeric not null default 0,
  late_pickups numeric not null default 0,
  potential_missed_pickups numeric not null default 0,
  exceptions numeric not null default 0,
  code_85 numeric not null default 0,
  dna numeric not null default 0,
  send_again numeric not null default 0,
  required_signature numeric not null default 0,
  miles numeric not null default 0,
  road_hours numeric not null default 0,
  duty_hours numeric not null default 0,
  ils_weighted_numerator numeric not null default 0,
  ils_weighted_denominator numeric not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key(company_id, contract_id, week_start, roster_member_id)
);

create index if not exists driver_scorecard_week_contract_driver_idx
  on core.driver_scorecard_week_fact(contract_id, roster_member_id, week_start);

create table if not exists core.driver_scorecard_fact_build (
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  batch_id uuid not null references core.operations_report_batch(id) on delete cascade,
  source_hash text,
  route_row_count integer not null default 0,
  matched_route_row_count integer not null default 0,
  unmatched_route_row_count integer not null default 0,
  status text not null default 'COMPLETE'
    check (status in ('COMPLETE', 'PARTIAL', 'FAILED')),
  refreshed_at timestamptz not null default now(),
  primary key(company_id, service_date)
);

create table if not exists core.driver_scorecard_snapshot (
  company_id uuid not null references core.companies(id) on delete cascade,
  contract_id uuid not null references core.company_contract_config(id) on delete cascade,
  model_id uuid not null references core.driver_scorecard_model(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  period_key text not null
    check (period_key in ('LAST_5_WEEKS', 'LAST_MONTH', 'MTD', 'CONTRACT')),
  period_start date not null,
  period_end date not null,
  as_of_date date not null,
  operating_days integer not null default 0,
  route_days integer not null default 0,
  delivery_stops numeric not null default 0,
  delivery_packages numeric not null default 0,
  pickup_stops numeric not null default 0,
  pickup_packages numeric not null default 0,
  early_pickups numeric not null default 0,
  late_pickups numeric not null default 0,
  potential_missed_pickups numeric not null default 0,
  exceptions numeric not null default 0,
  code_85 numeric not null default 0,
  dna numeric not null default 0,
  send_again numeric not null default 0,
  required_signature numeric not null default 0,
  miles numeric not null default 0,
  road_hours numeric not null default 0,
  duty_hours numeric not null default 0,
  observed_ils numeric,
  external_observations jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now(),
  primary key(contract_id, model_id, roster_member_id, period_key)
);

create index if not exists driver_scorecard_snapshot_company_contract_idx
  on core.driver_scorecard_snapshot(company_id, contract_id, period_key);

-- Prepared landing contract for PPOD, RYDE, VEDR, signature, LIB/TDDS and
-- safety-event sources. Absence is represented as absence; it is never scored
-- as zero.
create table if not exists core.driver_scorecard_observation_batch (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  source_key text not null,
  source_reference text,
  source_hash text,
  period_start date,
  period_end date,
  status text not null default 'STAGED'
    check (status in ('STAGED', 'LOADED', 'PARTIAL', 'FAILED', 'REPLACED')),
  row_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  uploaded_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.driver_scorecard_observation (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references core.driver_scorecard_observation_batch(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid references core.company_roster(id) on delete set null,
  metric_key text not null,
  period_start date not null,
  period_end date not null,
  value_numeric numeric,
  numerator numeric,
  denominator numeric,
  event_count integer,
  driver_name_evidence text,
  fx_id_evidence text,
  validation_status text not null default 'ACCEPTED'
    check (validation_status in ('ACCEPTED', 'REJECTED', 'REVIEW')),
  validation_message text,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists driver_scorecard_observation_lookup_idx
  on core.driver_scorecard_observation(company_id, roster_member_id, metric_key, period_start, period_end)
  where validation_status = 'ACCEPTED';
create unique index if not exists driver_scorecard_observation_batch_source_hash_uq
  on core.driver_scorecard_observation_batch(company_id, source_key, source_hash)
  where source_hash is not null;

alter table core.driver_scorecard_route_day_fact enable row level security;
alter table core.driver_scorecard_day_fact enable row level security;
alter table core.driver_scorecard_week_fact enable row level security;
alter table core.driver_scorecard_fact_build enable row level security;
alter table core.driver_scorecard_snapshot enable row level security;
alter table core.driver_scorecard_observation_batch enable row level security;
alter table core.driver_scorecard_observation enable row level security;

create or replace function core.refresh_driver_scorecard_week(
  p_company_id uuid,
  p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_count integer;
begin
  delete from core.driver_scorecard_week_fact
  where company_id = p_company_id and week_start = p_week_start;

  insert into core.driver_scorecard_week_fact (
    company_id, contract_id, week_start, week_end, roster_member_id,
    operating_days, route_days, delivery_stops, delivery_packages,
    pickup_stops, pickup_packages, early_pickups, late_pickups,
    potential_missed_pickups, exceptions, code_85, dna, send_again,
    required_signature, miles, road_hours, duty_hours,
    ils_weighted_numerator, ils_weighted_denominator, refreshed_at
  )
  select
    fact.company_id,
    fact.contract_id,
    p_week_start,
    p_week_start + 6,
    fact.roster_member_id,
    count(distinct fact.service_date)::integer,
    sum(fact.route_days)::integer,
    sum(fact.delivery_stops), sum(fact.delivery_packages),
    sum(fact.pickup_stops), sum(fact.pickup_packages),
    sum(fact.early_pickups), sum(fact.late_pickups),
    sum(fact.potential_missed_pickups), sum(fact.exceptions),
    sum(fact.code_85), sum(fact.dna), sum(fact.send_again),
    sum(fact.required_signature), sum(fact.miles), sum(fact.road_hours),
    sum(fact.duty_hours), sum(fact.ils_weighted_numerator),
    sum(fact.ils_weighted_denominator), now()
  from core.driver_scorecard_day_fact fact
  where fact.company_id = p_company_id
    and fact.service_date between p_week_start and p_week_start + 6
    and fact.contract_id is not null
  group by fact.company_id, fact.contract_id, fact.roster_member_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function core.refresh_driver_scorecard_snapshots(
  p_company_id uuid,
  p_contract_id uuid
)
returns integer
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_contract_start date;
  v_contract_end date;
  v_as_of date;
  v_model_id uuid;
  v_week_end date;
  v_count integer;
begin
  select effective_start_date, coalesce(effective_end_date, current_date)
    into v_contract_start, v_contract_end
  from core.company_contract_config
  where id = p_contract_id and company_id = p_company_id;

  if v_contract_start is null then
    raise exception 'Driver scorecard contract not found.' using errcode = '22023';
  end if;

  select max(service_date) into v_as_of
  from core.driver_scorecard_fact_build
  where company_id = p_company_id
    and service_date between v_contract_start and v_contract_end
    and status in ('COMPLETE', 'PARTIAL');

  if v_as_of is null then
    delete from core.driver_scorecard_snapshot where contract_id = p_contract_id;
    return 0;
  end if;

  select model.id into v_model_id
  from core.driver_scorecard_model model
  where model.status = 'ACTIVE'
    and (model.company_id = p_company_id or model.company_id is null)
    and (model.effective_start is null or model.effective_start <= v_as_of)
    and (model.effective_end is null or model.effective_end >= v_as_of)
  order by (model.company_id is not null) desc, model.version desc
  limit 1;

  if v_model_id is null then
    raise exception 'No active Driver Scorecard model is available.';
  end if;

  v_week_end := case
    when extract(dow from v_as_of)::integer = 5 then v_as_of
    else core.driver_scorecard_week_start(v_as_of) - 1
  end;

  delete from core.driver_scorecard_snapshot
  where contract_id = p_contract_id;

  with periods(period_key, period_start, period_end) as (
    values
      ('LAST_5_WEEKS'::text, greatest(v_contract_start, v_week_end - 34), v_week_end),
      ('LAST_MONTH', greatest(v_contract_start, (date_trunc('month', v_as_of)::date - interval '1 month')::date), least(v_contract_end, (date_trunc('month', v_as_of)::date - interval '1 day')::date)),
      ('MTD', greatest(v_contract_start, date_trunc('month', v_as_of)::date), least(v_contract_end, v_as_of)),
      ('CONTRACT', v_contract_start, least(v_contract_end, v_as_of))
  ),
  roster as (
    select id as roster_member_id
    from core.company_roster
    where company_id = p_company_id
      and employment_status in ('Active', 'Trainee')
  ),
  aggregate as (
    select
      roster.roster_member_id,
      period.period_key,
      period.period_start,
      period.period_end,
      count(distinct fact.service_date)::integer as operating_days,
      coalesce(sum(fact.route_days), 0)::integer as route_days,
      coalesce(sum(fact.delivery_stops), 0) as delivery_stops,
      coalesce(sum(fact.delivery_packages), 0) as delivery_packages,
      coalesce(sum(fact.pickup_stops), 0) as pickup_stops,
      coalesce(sum(fact.pickup_packages), 0) as pickup_packages,
      coalesce(sum(fact.early_pickups), 0) as early_pickups,
      coalesce(sum(fact.late_pickups), 0) as late_pickups,
      coalesce(sum(fact.potential_missed_pickups), 0) as potential_missed_pickups,
      coalesce(sum(fact.exceptions), 0) as exceptions,
      coalesce(sum(fact.code_85), 0) as code_85,
      coalesce(sum(fact.dna), 0) as dna,
      coalesce(sum(fact.send_again), 0) as send_again,
      coalesce(sum(fact.required_signature), 0) as required_signature,
      coalesce(sum(fact.miles), 0) as miles,
      coalesce(sum(fact.road_hours), 0) as road_hours,
      coalesce(sum(fact.duty_hours), 0) as duty_hours,
      case when coalesce(sum(fact.ils_weighted_denominator), 0) > 0
        then sum(fact.ils_weighted_numerator) / sum(fact.ils_weighted_denominator)
        else null end as observed_ils
    from roster
    cross join periods period
    left join core.driver_scorecard_day_fact fact
      on fact.company_id = p_company_id
      and fact.roster_member_id = roster.roster_member_id
      and fact.service_date between period.period_start and period.period_end
    group by roster.roster_member_id, period.period_key,
      period.period_start, period.period_end
  )
  insert into core.driver_scorecard_snapshot (
    company_id, contract_id, model_id, roster_member_id, period_key,
    period_start, period_end, as_of_date, operating_days, route_days,
    delivery_stops, delivery_packages, pickup_stops, pickup_packages,
    early_pickups, late_pickups, potential_missed_pickups, exceptions,
    code_85, dna, send_again, required_signature, miles, road_hours,
    duty_hours, observed_ils, refreshed_at
  )
  select
    p_company_id, p_contract_id, v_model_id, roster_member_id, period_key,
    period_start, period_end, v_as_of, operating_days, route_days,
    delivery_stops, delivery_packages, pickup_stops, pickup_packages,
    early_pickups, late_pickups, potential_missed_pickups, exceptions,
    code_85, dna, send_again, required_signature, miles, road_hours,
    duty_hours, observed_ils, now()
  from aggregate
  where period_end >= period_start;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function core.refresh_driver_scorecard_service_day(
  p_company_id uuid,
  p_service_date date,
  p_refresh_snapshots boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_batch core.operations_report_batch%rowtype;
  v_contract_id uuid;
  v_route_count integer;
  v_matched_count integer;
  v_unmatched_count integer;
begin
  select config.id into v_contract_id
  from core.company_contract_config config
  where config.company_id = p_company_id
    and config.effective_start_date <= p_service_date
    and (config.effective_end_date is null or config.effective_end_date >= p_service_date)
  order by (config.status = 'ACTIVE') desc, config.effective_start_date desc
  limit 1;

  select batch.* into v_batch
  from core.operations_report_batch batch
  where batch.company_id = p_company_id
    and batch.report_family_key = 'DSW'
    and batch.snapshot_kind = 'FINAL'
    and batch.status = 'LOADED'
    and batch.service_date = p_service_date
  order by batch.created_at desc, batch.id desc
  limit 1;

  if v_batch.id is null then
    delete from core.driver_scorecard_route_day_fact
      where company_id = p_company_id and service_date = p_service_date;
    delete from core.driver_scorecard_day_fact
      where company_id = p_company_id and service_date = p_service_date;
    delete from core.driver_scorecard_fact_build
      where company_id = p_company_id and service_date = p_service_date;
    perform core.refresh_driver_scorecard_week(
      p_company_id, core.driver_scorecard_week_start(p_service_date)
    );
    if p_refresh_snapshots and v_contract_id is not null then
      perform core.refresh_driver_scorecard_snapshots(p_company_id, v_contract_id);
    end if;
    return jsonb_build_object('status', 'NO_FINAL_DSW', 'service_date', p_service_date);
  end if;

  with resolved as (
    select
      raw.id,
      core.resolve_roster_identity(
        p_company_id,
        coalesce(nullif(raw.normalized_row_json ->> 'driver_name', ''), raw.source_driver_name),
        raw.source_dswid,
        null
      ) as authoritative_roster_id,
      coalesce(
        core.resolve_roster_identity(
          p_company_id,
          coalesce(nullif(raw.normalized_row_json ->> 'driver_name', ''), raw.source_driver_name),
          raw.source_dswid,
          null
        ),
        raw.matched_roster_member_id
      ) as roster_id
    from core.operations_report_raw_row raw
    where raw.batch_id = v_batch.id
      and raw.company_id = p_company_id
      and raw.row_kind = 'ROUTE'
  )
  update core.operations_report_raw_row raw
  set
    matched_roster_member_id = resolved.roster_id,
    match_method = case
      when resolved.authoritative_roster_id is not null then 'ROSTER_IDENTITY'
      when resolved.roster_id is not null then coalesce(raw.match_method, 'PRESERVED_MATCH')
      else raw.match_method end,
    match_confidence = case
      when resolved.roster_id is not null then coalesce(raw.match_confidence, 1)
      else raw.match_confidence end
  from resolved
  where raw.id = resolved.id
    and raw.matched_roster_member_id is distinct from resolved.roster_id;

  delete from core.driver_scorecard_route_day_fact
  where company_id = p_company_id and service_date = p_service_date;
  delete from core.driver_scorecard_day_fact
  where company_id = p_company_id and service_date = p_service_date;

  insert into core.driver_scorecard_route_day_fact (
    company_id, contract_id, batch_id, raw_row_id, service_date, week_start,
    roster_member_id, route_name, wa_number, driver_name_evidence,
    dswid_evidence, match_method, match_confidence, delivery_stops,
    delivery_packages, pickup_stops, pickup_packages, early_pickups,
    late_pickups, potential_missed_pickups, exceptions, code_85, dna,
    send_again, required_signature, miles, road_hours, duty_hours,
    ils_weighted_numerator, ils_weighted_denominator
  )
  select
    p_company_id, v_contract_id, v_batch.id, raw.id, p_service_date,
    core.driver_scorecard_week_start(p_service_date),
    raw.matched_roster_member_id,
    coalesce(nullif(raw.normalized_row_json ->> 'wa_name', ''), raw.source_route_key),
    coalesce(nullif(raw.normalized_row_json ->> 'wa_number', ''), raw.source_wa_number),
    coalesce(nullif(raw.normalized_row_json ->> 'driver_name', ''), raw.source_driver_name),
    raw.source_dswid, raw.match_method, raw.match_confidence,
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_stops'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_packages'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_stops'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_packages'), 0), 0),
    greatest(coalesce(raw.early_pickups, core.safe_numeric(raw.normalized_row_json ->> 'early_pickups'), 0), 0),
    greatest(coalesce(raw.late_pickups, core.safe_numeric(raw.normalized_row_json ->> 'late_pickups'), 0), 0),
    greatest(coalesce(raw.potential_missed_pickups, core.safe_numeric(raw.normalized_row_json ->> 'potential_missed_pickups'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'exceptions'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'code_85'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'dna'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'send_again'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'required_signature'), 0), 0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'miles'), 0), 0),
    core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_road_hours'),
    core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_duty_hours'),
    case when core.safe_numeric(raw.normalized_row_json ->> 'ils_percent') is not null
      then core.safe_numeric(raw.normalized_row_json ->> 'ils_percent')
        * greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_packages'), 0), 0)
      else 0 end,
    case when core.safe_numeric(raw.normalized_row_json ->> 'ils_percent') is not null
      then greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_packages'), 0), 0)
      else 0 end
  from core.operations_report_raw_row raw
  where raw.batch_id = v_batch.id
    and raw.company_id = p_company_id
    and raw.row_kind = 'ROUTE';

  insert into core.driver_scorecard_day_fact (
    company_id, contract_id, service_date, week_start, roster_member_id,
    route_days, delivery_stops, delivery_packages, pickup_stops,
    pickup_packages, early_pickups, late_pickups, potential_missed_pickups,
    exceptions, code_85, dna, send_again, required_signature, miles,
    road_hours, duty_hours, ils_weighted_numerator,
    ils_weighted_denominator, source_batch_id, refreshed_at
  )
  select
    p_company_id, v_contract_id, p_service_date,
    core.driver_scorecard_week_start(p_service_date), roster_member_id,
    count(*)::integer, sum(delivery_stops), sum(delivery_packages),
    sum(pickup_stops), sum(pickup_packages), sum(early_pickups),
    sum(late_pickups), sum(potential_missed_pickups), sum(exceptions),
    sum(code_85), sum(dna), sum(send_again), sum(required_signature),
    sum(miles), sum(road_hours), sum(duty_hours),
    sum(ils_weighted_numerator), sum(ils_weighted_denominator),
    v_batch.id, now()
  from core.driver_scorecard_route_day_fact
  where company_id = p_company_id and service_date = p_service_date
    and roster_member_id is not null
  group by roster_member_id;

  select count(*), count(*) filter (where roster_member_id is not null),
    count(*) filter (where roster_member_id is null)
    into v_route_count, v_matched_count, v_unmatched_count
  from core.driver_scorecard_route_day_fact
  where company_id = p_company_id and service_date = p_service_date;

  insert into core.driver_scorecard_fact_build (
    company_id, service_date, batch_id, source_hash, route_row_count,
    matched_route_row_count, unmatched_route_row_count, status, refreshed_at
  ) values (
    p_company_id, p_service_date, v_batch.id, v_batch.source_hash,
    v_route_count, v_matched_count, v_unmatched_count,
    case when v_unmatched_count > 0 then 'PARTIAL' else 'COMPLETE' end, now()
  )
  on conflict (company_id, service_date) do update set
    batch_id = excluded.batch_id,
    source_hash = excluded.source_hash,
    route_row_count = excluded.route_row_count,
    matched_route_row_count = excluded.matched_route_row_count,
    unmatched_route_row_count = excluded.unmatched_route_row_count,
    status = excluded.status,
    refreshed_at = now();

  perform core.refresh_driver_scorecard_week(
    p_company_id, core.driver_scorecard_week_start(p_service_date)
  );
  if p_refresh_snapshots and v_contract_id is not null then
    perform core.refresh_driver_scorecard_snapshots(p_company_id, v_contract_id);
  end if;

  return jsonb_build_object(
    'status', case when v_unmatched_count > 0 then 'PARTIAL' else 'COMPLETE' end,
    'service_date', p_service_date,
    'batch_id', v_batch.id,
    'route_rows', v_route_count,
    'matched_route_rows', v_matched_count,
    'unmatched_route_rows', v_unmatched_count
  );
end;
$$;

create or replace function core.rebuild_company_driver_scorecard_facts(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_service_date date;
  v_contract_id uuid;
  v_day_count integer := 0;
  v_snapshot_count integer := 0;
begin
  if p_company_id is null or p_start_date is null or p_end_date is null
    or p_end_date < p_start_date or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company and date range of no more than 366 days is required.'
      using errcode = '22023';
  end if;

  -- Remove the entire requested projection first. This makes a rebuild capable
  -- of removing facts for source FINAL dates that were deleted or invalidated.
  delete from core.driver_scorecard_route_day_fact
  where company_id = p_company_id
    and service_date between p_start_date and p_end_date;
  delete from core.driver_scorecard_day_fact
  where company_id = p_company_id
    and service_date between p_start_date and p_end_date;
  delete from core.driver_scorecard_fact_build
  where company_id = p_company_id
    and service_date between p_start_date and p_end_date;
  delete from core.driver_scorecard_week_fact
  where company_id = p_company_id
    and week_end >= p_start_date
    and week_start <= p_end_date;

  for v_service_date in
    select distinct batch.service_date
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date between p_start_date and p_end_date
    order by batch.service_date
  loop
    perform core.refresh_driver_scorecard_service_day(
      p_company_id, v_service_date, false
    );
    v_day_count := v_day_count + 1;
  end loop;

  for v_contract_id in
    select config.id
    from core.company_contract_config config
    where config.company_id = p_company_id
      and config.effective_start_date <= p_end_date
      and coalesce(config.effective_end_date, p_end_date) >= p_start_date
  loop
    v_snapshot_count := v_snapshot_count
      + core.refresh_driver_scorecard_snapshots(p_company_id, v_contract_id);
  end loop;

  return jsonb_build_object(
    'company_id', p_company_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'service_days_rebuilt', v_day_count,
    'snapshots_rebuilt', v_snapshot_count
  );
end;
$$;

create or replace function core.materialize_inserted_driver_scorecard_facts()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_item record;
begin
  for v_item in
    select distinct batch.company_id, batch.service_date
    from inserted_dsw_rows inserted
    join core.operations_report_batch batch on batch.id = inserted.batch_id
    where batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date is not null
  loop
    perform core.refresh_driver_scorecard_service_day(
      v_item.company_id,
      v_item.service_date,
      v_item.service_date >= current_date - 7
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists materialize_inserted_driver_scorecard_facts
  on core.operations_report_raw_row;
create trigger materialize_inserted_driver_scorecard_facts
after insert on core.operations_report_raw_row
referencing new table as inserted_dsw_rows
for each statement
execute function core.materialize_inserted_driver_scorecard_facts();

create or replace function public.rebuild_company_driver_scorecard_facts(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not core.can_admin_company(p_company_id) and not core.is_platform_owner() then
    raise exception 'You do not have permission to rebuild Driver Scorecards.'
      using errcode = '42501';
  end if;
  return core.rebuild_company_driver_scorecard_facts(
    p_company_id, p_start_date, p_end_date
  );
end;
$$;

create or replace function public.import_driver_scorecard_observations(
  p_company_id uuid,
  p_source_key text,
  p_source_reference text,
  p_source_hash text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_batch_id uuid;
  v_existing core.driver_scorecard_observation_batch%rowtype;
  v_profile_id uuid;
  v_row_count integer;
  v_accepted_count integer;
  v_rejected_count integer;
begin
  if p_company_id is null
    or nullif(btrim(coalesce(p_source_key, '')), '') is null
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start
    or jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
  then
    raise exception 'A company, source, valid period, and JSON row array are required.'
      using errcode = '22023';
  end if;

  if not core.can_admin_company(p_company_id) and not core.is_platform_owner() then
    raise exception 'You do not have permission to import Driver Scorecard observations.'
      using errcode = '42501';
  end if;

  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
  limit 1;

  if nullif(btrim(coalesce(p_source_hash, '')), '') is not null then
    select batch.* into v_existing
    from core.driver_scorecard_observation_batch batch
    where batch.company_id = p_company_id
      and batch.source_key = upper(btrim(p_source_key))
      and batch.source_hash = btrim(p_source_hash)
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'batch_id', v_existing.id,
        'status', v_existing.status,
        'row_count', v_existing.row_count,
        'accepted_count', v_existing.accepted_count,
        'rejected_count', v_existing.rejected_count,
        'idempotent_replay', true
      );
    end if;
  end if;

  insert into core.driver_scorecard_observation_batch (
    company_id, source_key, source_reference, source_hash,
    period_start, period_end, status, row_count, metadata_json,
    uploaded_by_profile_id
  ) values (
    p_company_id, upper(btrim(p_source_key)),
    nullif(btrim(coalesce(p_source_reference, '')), ''),
    nullif(btrim(coalesce(p_source_hash, '')), ''),
    p_period_start, p_period_end, 'STAGED', jsonb_array_length(p_rows),
    coalesce(p_metadata_json, '{}'::jsonb), v_profile_id
  )
  on conflict (company_id, source_key, source_hash)
    where source_hash is not null
  do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    select batch.* into v_existing
    from core.driver_scorecard_observation_batch batch
    where batch.company_id = p_company_id
      and batch.source_key = upper(btrim(p_source_key))
      and batch.source_hash = btrim(p_source_hash)
    limit 1;

    return jsonb_build_object(
      'batch_id', v_existing.id,
      'status', v_existing.status,
      'row_count', v_existing.row_count,
      'accepted_count', v_existing.accepted_count,
      'rejected_count', v_existing.rejected_count,
      'idempotent_replay', true
    );
  end if;

  with input as (
    select value as row_json, ordinality::integer as source_row_index
    from jsonb_array_elements(p_rows) with ordinality
  ),
  normalized as (
    select
      input.*,
      case
        when coalesce(row_json ->> 'roster_member_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (row_json ->> 'roster_member_id')::uuid
        else null
      end as requested_roster_id,
      nullif(btrim(row_json ->> 'driver_name'), '') as driver_name,
      nullif(btrim(row_json ->> 'fx_id'), '') as fx_id,
      upper(nullif(btrim(row_json ->> 'metric_key'), '')) as metric_key,
      case when coalesce(row_json ->> 'period_start', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then (row_json ->> 'period_start')::date else p_period_start end as period_start,
      case when coalesce(row_json ->> 'period_end', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then (row_json ->> 'period_end')::date else p_period_end end as period_end,
      core.safe_numeric(row_json ->> 'value') as value_numeric,
      core.safe_numeric(row_json ->> 'numerator') as numerator,
      core.safe_numeric(row_json ->> 'denominator') as denominator,
      trunc(core.safe_numeric(row_json ->> 'event_count'))::integer as event_count
    from input
  ),
  resolved as (
    select
      normalized.*,
      coalesce(
        (
          select roster.id
          from core.company_roster roster
          where roster.id = normalized.requested_roster_id
            and roster.company_id = p_company_id
        ),
        core.resolve_roster_identity(
          p_company_id, normalized.driver_name, null, normalized.fx_id
        )
      ) as roster_member_id,
      exists (
        select 1
        from core.driver_scorecard_metric metric
        join core.driver_scorecard_model model on model.id = metric.model_id
        where metric.metric_key = normalized.metric_key
          and metric.enabled
          and metric.source_mode <> 'WAREHOUSE'
          and model.status = 'ACTIVE'
          and (model.company_id = p_company_id or model.company_id is null)
      ) as metric_is_valid
    from normalized
  )
  insert into core.driver_scorecard_observation (
    batch_id, company_id, roster_member_id, metric_key,
    period_start, period_end, value_numeric, numerator, denominator,
    event_count, driver_name_evidence, fx_id_evidence,
    validation_status, validation_message, evidence_json
  )
  select
    v_batch_id, p_company_id, resolved.roster_member_id,
    coalesce(resolved.metric_key, 'UNSPECIFIED'),
    resolved.period_start, resolved.period_end,
    resolved.value_numeric, resolved.numerator, resolved.denominator,
    resolved.event_count, resolved.driver_name, resolved.fx_id,
    case
      when resolved.roster_member_id is null then 'REJECTED'
      when not resolved.metric_is_valid then 'REJECTED'
      when resolved.period_end < resolved.period_start then 'REJECTED'
      when resolved.value_numeric is null and resolved.numerator is null
        and resolved.event_count is null then 'REJECTED'
      else 'ACCEPTED'
    end,
    case
      when resolved.roster_member_id is null then 'Driver identity could not be resolved.'
      when not resolved.metric_is_valid then 'Metric is not enabled for external observation.'
      when resolved.period_end < resolved.period_start then 'Observation period is invalid.'
      when resolved.value_numeric is null and resolved.numerator is null
        and resolved.event_count is null then 'Observation contains no numeric measure.'
      else null
    end,
    resolved.row_json || jsonb_build_object('source_row_index', resolved.source_row_index)
  from resolved;

  select
    count(*),
    count(*) filter (where validation_status = 'ACCEPTED'),
    count(*) filter (where validation_status <> 'ACCEPTED')
    into v_row_count, v_accepted_count, v_rejected_count
  from core.driver_scorecard_observation
  where batch_id = v_batch_id;

  update core.driver_scorecard_observation_batch
  set
    row_count = v_row_count,
    accepted_count = v_accepted_count,
    rejected_count = v_rejected_count,
    status = case
      when v_rejected_count = 0 then 'LOADED'
      when v_accepted_count > 0 then 'PARTIAL'
      else 'FAILED'
    end,
    updated_at = now()
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'status', case
      when v_rejected_count = 0 then 'LOADED'
      when v_accepted_count > 0 then 'PARTIAL'
      else 'FAILED'
    end,
    'row_count', v_row_count,
    'accepted_count', v_accepted_count,
    'rejected_count', v_rejected_count,
    'idempotent_replay', false
  );
end;
$$;

create or replace function core.get_company_driver_scorecard_index_materialized(
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
  v_contract_id uuid;
  v_model_id uuid;
  v_snapshot_as_of date;
  v_result jsonb;
begin
  if p_company_id is null or p_start_date is null or p_end_date is null
    or p_as_of_date is null or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company and valid contract range are required.' using errcode = '22023';
  end if;
  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;

  select config.id into v_contract_id
  from core.company_contract_config config
  where config.company_id = p_company_id
    and config.effective_start_date = p_start_date
    and coalesce(config.effective_end_date, p_end_date) >= p_end_date
  order by (config.status = 'ACTIVE') desc, config.updated_at desc
  limit 1;

  if v_contract_id is null then
    raise exception 'The shared analytics contract does not match a configured contract.'
      using errcode = '22023';
  end if;

  select snapshot.model_id, max(snapshot.as_of_date)
    into v_model_id, v_snapshot_as_of
  from core.driver_scorecard_snapshot snapshot
  where snapshot.company_id = p_company_id
    and snapshot.contract_id = v_contract_id
  group by snapshot.model_id
  order by max(snapshot.refreshed_at) desc
  limit 1;

  if v_model_id is null then
    raise exception 'Driver Scorecard facts are not built for this contract. Run the targeted rebuild.'
      using errcode = '55000';
  end if;

  if v_snapshot_as_of > least(p_as_of_date, p_end_date) then
    raise exception 'Stored Driver Scorecard facts are newer than the requested analytics context.'
      using errcode = '22023';
  end if;

  with period_keys(period_key) as (
    values
      ('LAST_5_WEEKS'::text),
      ('LAST_MONTH'),
      ('MTD'),
      ('CONTRACT')
  ),
  roster as (
    select
      person.id as roster_id,
      person.full_name,
      person.employment_status,
      identity.fx_id,
      identity.dswid,
      operations.daily_pay_rate
    from core.company_roster person
    left join core.company_roster_identity_v identity on identity.roster_id = person.id
    left join core.company_roster_operations_fact operations on operations.roster_id = person.id
    where person.company_id = p_company_id
      and person.employment_status in ('Active', 'Trainee')
  ),
  roster_periods as (
    select roster.*, period_keys.period_key
    from roster cross join period_keys
  ),
  drivers as (
    select jsonb_build_object(
      'roster_id', roster_periods.roster_id,
      'full_name', roster_periods.full_name,
      'fx_id', roster_periods.fx_id,
      'dswid', roster_periods.dswid,
      'employment_status', roster_periods.employment_status,
      'daily_pay_rate', roster_periods.daily_pay_rate,
      'periods', jsonb_object_agg(
        roster_periods.period_key,
        jsonb_build_object(
          'operating_days', coalesce(snapshot.operating_days, 0),
          'route_days', coalesce(snapshot.route_days, 0),
          'delivery_stops', coalesce(snapshot.delivery_stops, 0),
          'delivery_packages', coalesce(snapshot.delivery_packages, 0),
          'pickup_stops', coalesce(snapshot.pickup_stops, 0),
          'pickup_packages', coalesce(snapshot.pickup_packages, 0),
          'early_pickups', coalesce(snapshot.early_pickups, 0),
          'late_pickups', coalesce(snapshot.late_pickups, 0),
          'potential_missed_pickups', coalesce(snapshot.potential_missed_pickups, 0),
          'exceptions', coalesce(snapshot.exceptions, 0),
          'code_85', coalesce(snapshot.code_85, 0),
          'dna', coalesce(snapshot.dna, 0),
          'send_again', coalesce(snapshot.send_again, 0),
          'required_signature', coalesce(snapshot.required_signature, 0),
          'miles', coalesce(snapshot.miles, 0),
          'road_hours', coalesce(snapshot.road_hours, 0),
          'duty_hours', coalesce(snapshot.duty_hours, 0),
          'observed_ils', snapshot.observed_ils
        ) order by roster_periods.period_key
      )
    ) as value
    from roster_periods
    left join core.driver_scorecard_snapshot snapshot
      on snapshot.contract_id = v_contract_id
      and snapshot.model_id = v_model_id
      and snapshot.roster_member_id = roster_periods.roster_id
      and snapshot.period_key = roster_periods.period_key
    group by roster_periods.roster_id, roster_periods.full_name,
      roster_periods.fx_id, roster_periods.dswid,
      roster_periods.employment_status, roster_periods.daily_pay_rate
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'contract_start', p_start_date,
      'contract_end', p_end_date,
      'as_of_date', v_snapshot_as_of,
      'last_five_weeks_start', min(snapshot.period_start) filter (where snapshot.period_key = 'LAST_5_WEEKS'),
      'last_five_weeks_end', max(snapshot.period_end) filter (where snapshot.period_key = 'LAST_5_WEEKS'),
      'last_month_start', min(snapshot.period_start) filter (where snapshot.period_key = 'LAST_MONTH'),
      'last_month_end', max(snapshot.period_end) filter (where snapshot.period_key = 'LAST_MONTH'),
      'mtd_start', min(snapshot.period_start) filter (where snapshot.period_key = 'MTD')
    ),
    'model', jsonb_build_object(
      'id', model.id,
      'title', model.title,
      'version', model.version,
      'metrics', coalesce((
        select jsonb_agg(to_jsonb(metric) - 'id' - 'model_id' - 'created_at' - 'updated_at' order by metric.sort_order)
        from core.driver_scorecard_metric metric
        where metric.model_id = model.id and metric.enabled
      ), '[]'::jsonb)
    ),
    'drivers', coalesce((select jsonb_agg(drivers.value order by drivers.value ->> 'full_name') from drivers), '[]'::jsonb),
    'unmatched_route_rows', coalesce((
      select sum(build.unmatched_route_row_count)
      from core.driver_scorecard_fact_build build
      where build.company_id = p_company_id
        and build.service_date between p_start_date and v_snapshot_as_of
    ), 0),
    'read_model', 'MATERIALIZED_DRIVER_SCORECARD_V1'
  ) into v_result
  from core.driver_scorecard_model model
  join core.driver_scorecard_snapshot snapshot
    on snapshot.model_id = model.id and snapshot.contract_id = v_contract_id
  where model.id = v_model_id
  group by model.id, model.title, model.version;

  return coalesce(v_result, jsonb_build_object('drivers', '[]'::jsonb));
end;
$$;

create or replace function core.get_company_driver_scorecard_detail_materialized(
  p_company_id uuid,
  p_roster_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  service_date date,
  route_name text,
  wa_number text,
  delivery_stops numeric,
  delivery_packages numeric,
  pickup_stops numeric,
  pickup_packages numeric,
  early_pickups numeric,
  late_pickups numeric,
  potential_missed_pickups numeric,
  exceptions numeric,
  code_85 numeric,
  dna numeric,
  send_again numeric,
  required_signature numeric,
  miles numeric,
  road_hours numeric,
  duty_hours numeric,
  observed_ils numeric
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if p_company_id is null or p_roster_id is null or p_start_date is null
    or p_end_date is null or p_end_date < p_start_date or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company, driver, and valid contract range are required.' using errcode = '22023';
  end if;
  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from core.company_roster
    where id = p_roster_id and company_id = p_company_id
  ) then
    raise exception 'Driver not found.' using errcode = '22023';
  end if;

  return query
  select
    fact.service_date, fact.route_name, fact.wa_number,
    fact.delivery_stops, fact.delivery_packages, fact.pickup_stops,
    fact.pickup_packages, fact.early_pickups, fact.late_pickups,
    fact.potential_missed_pickups, fact.exceptions, fact.code_85,
    fact.dna, fact.send_again, fact.required_signature, fact.miles,
    fact.road_hours, fact.duty_hours,
    case when fact.ils_weighted_denominator > 0
      then fact.ils_weighted_numerator / fact.ils_weighted_denominator
      else null end
  from core.driver_scorecard_route_day_fact fact
  where fact.company_id = p_company_id
    and fact.roster_member_id = p_roster_id
    and fact.service_date between p_start_date and p_end_date
  order by fact.service_date, fact.route_name, fact.wa_number;
end;
$$;

revoke all on function core.refresh_driver_scorecard_week(uuid, date) from public;
revoke all on function core.refresh_driver_scorecard_snapshots(uuid, uuid) from public;
revoke all on function core.refresh_driver_scorecard_service_day(uuid, date, boolean) from public;
revoke all on function core.rebuild_company_driver_scorecard_facts(uuid, date, date) from public;
revoke all on function core.materialize_inserted_driver_scorecard_facts() from public;
revoke all on function core.get_company_driver_scorecard_index_materialized(uuid, date, date, date) from public;
revoke all on function core.get_company_driver_scorecard_detail_materialized(uuid, uuid, date, date) from public;
revoke all on function public.rebuild_company_driver_scorecard_facts(uuid, date, date) from public;
revoke all on function public.import_driver_scorecard_observations(uuid, text, text, text, date, date, jsonb, jsonb) from public;

grant execute on function public.rebuild_company_driver_scorecard_facts(uuid, date, date) to authenticated, service_role;
grant execute on function public.import_driver_scorecard_observations(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated, service_role;

comment on table core.driver_scorecard_route_day_fact is
  'Typed driver-owned projection of immutable FINAL DSW JSON; one row per DSW route row.';
comment on table core.driver_scorecard_snapshot is
  'Precomputed scorecard-period facts. Interactive scorecard requests read this table and do not parse DSW JSON.';
comment on table core.driver_scorecard_observation is
  'Prepared external KPI landing contract. Missing observations remain missing and are never treated as zero.';

notify pgrst, 'reload schema';
