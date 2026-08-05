create table if not exists core.driver_scorecard_model (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies(id) on delete cascade,
  model_key text not null,
  title text not null,
  version integer not null default 1,
  status text not null default 'ACTIVE'
    check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  effective_start date,
  effective_end date,
  is_system_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists driver_scorecard_model_system_seed_uq
  on core.driver_scorecard_model(model_key, version)
  where company_id is null;

create unique index if not exists driver_scorecard_model_company_version_uq
  on core.driver_scorecard_model(company_id, model_key, version)
  where company_id is not null;

create table if not exists core.driver_scorecard_metric (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references core.driver_scorecard_model(id) on delete cascade,
  metric_key text not null,
  display_name text not null,
  category_key text not null check (category_key in ('CUSTOMER', 'SERVICE', 'SAFETY')),
  contribution_weight numeric(6,3) not null check (contribution_weight >= 0 and contribution_weight <= 100),
  scoring_method text not null check (scoring_method in ('BAND', 'BINARY_ZERO', 'RYDE_NET')),
  target_primary numeric,
  target_secondary numeric,
  target_tertiary numeric,
  points_primary numeric not null default 10,
  points_secondary numeric,
  points_tertiary numeric,
  source_mode text not null check (source_mode in ('WAREHOUSE', 'FEDEX_IMPORT', 'CLIENT_ENTRY', 'EVENT_LEDGER')),
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(model_id, metric_key)
);

alter table core.driver_scorecard_model enable row level security;
alter table core.driver_scorecard_metric enable row level security;

create policy driver_scorecard_model_read on core.driver_scorecard_model
  for select to authenticated using (
    company_id is null or core.can_read_company_data(company_id)
  );

create policy driver_scorecard_model_admin on core.driver_scorecard_model
  for all to authenticated using (
    company_id is not null and core.can_admin_company(company_id)
  ) with check (
    company_id is not null and core.can_admin_company(company_id)
  );

create policy driver_scorecard_metric_read on core.driver_scorecard_metric
  for select to authenticated using (
    exists (
      select 1 from core.driver_scorecard_model model
      where model.id = model_id
        and (model.company_id is null or core.can_read_company_data(model.company_id))
    )
  );

create policy driver_scorecard_metric_admin on core.driver_scorecard_metric
  for all to authenticated using (
    exists (
      select 1 from core.driver_scorecard_model model
      where model.id = model_id
        and model.company_id is not null
        and core.can_admin_company(model.company_id)
    )
  ) with check (
    exists (
      select 1 from core.driver_scorecard_model model
      where model.id = model_id
        and model.company_id is not null
        and core.can_admin_company(model.company_id)
    )
  );

insert into core.driver_scorecard_model (
  id, company_id, model_key, title, version, status, is_system_seed
)
values (
  '97d41867-6d72-42b7-9390-bb5f36d74e01', null,
  'FEDEX_ALIGNED_BASELINE', 'FedEx-aligned baseline', 1, 'ACTIVE', true
)
on conflict do nothing;

insert into core.driver_scorecard_metric (
  model_id, metric_key, display_name, category_key, contribution_weight,
  scoring_method, target_primary, target_secondary, target_tertiary,
  points_primary, points_secondary, points_tertiary, source_mode, sort_order
)
values
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','PPOD','PPOD','CUSTOMER',6,'BAND',97,95,90,10,5,3,'FEDEX_IMPORT',10),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','RYDE','RYDE','CUSTOMER',5,'RYDE_NET',null,null,null,10,null,null,'FEDEX_IMPORT',20),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','SIGNATURE','Signature compliance','CUSTOMER',5,'BINARY_ZERO',0,null,null,10,null,null,'FEDEX_IMPORT',30),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','LIB','LIB','SERVICE',8,'BAND',99.7,99.3,99,10,5,3,'FEDEX_IMPORT',40),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','TDDS_COMBINED','TDDS Combined','SERVICE',5,'BAND',98.5,96,null,10,5,null,'FEDEX_IMPORT',50),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','TDDS_PO_E2M','TDDS PO & E2M','SERVICE',5,'BAND',98.5,96,null,10,5,null,'FEDEX_IMPORT',60),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','PICKUPS','Pickups','SERVICE',18,'BINARY_ZERO',0,null,null,10,null,null,'WAREHOUSE',70),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','ACCIDENT','Accidents','SAFETY',20,'BINARY_ZERO',0,null,null,10,null,null,'EVENT_LEDGER',80),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','PROPERTY_DAMAGE','Property damage','SAFETY',20,'BINARY_ZERO',0,null,null,10,null,null,'EVENT_LEDGER',90),
  ('97d41867-6d72-42b7-9390-bb5f36d74e01','VEDR','VEDR warnings','SAFETY',8,'BINARY_ZERO',0,null,null,10,null,null,'FEDEX_IMPORT',100)
on conflict (model_id, metric_key) do nothing;

create or replace function core.driver_scorecard_hours(p_value text)
returns numeric
language sql
immutable
set search_path = core, public
as $$
  select case
    when nullif(btrim(coalesce(p_value,'')),'') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest(btrim(p_value)::numeric,0)
    when nullif(btrim(coalesce(p_value,'')),'') ~ '^[0-9]+:[0-5][0-9]$'
      then split_part(btrim(p_value),':',1)::numeric
        + split_part(btrim(p_value),':',2)::numeric / 60
    else 0
  end;
$$;

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
  v_model_id uuid;
  v_last_month_start date;
  v_last_month_end date;
  v_mtd_start date;
  v_result jsonb;
begin
  if p_company_id is null or p_start_date is null or p_end_date is null
    or p_as_of_date is null or p_end_date < p_start_date
    or p_as_of_date < p_start_date or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company and valid contract range are required.' using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;

  select model.id into v_model_id
  from core.driver_scorecard_model model
  where model.status = 'ACTIVE'
    and (model.company_id = p_company_id or model.company_id is null)
    and (model.effective_start is null or model.effective_start <= p_as_of_date)
    and (model.effective_end is null or model.effective_end >= p_as_of_date)
  order by (model.company_id is not null) desc, model.version desc
  limit 1;

  v_last_month_start := (date_trunc('month', p_as_of_date)::date - interval '1 month')::date;
  v_last_month_end := (date_trunc('month', p_as_of_date)::date - interval '1 day')::date;
  v_mtd_start := date_trunc('month', p_as_of_date)::date;

  with latest_final_batches as (
    select distinct on (batch.service_date)
      batch.id, batch.service_date
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date between p_start_date and least(p_end_date, p_as_of_date)
    order by batch.service_date, batch.created_at desc, batch.id desc
  ),
  source_facts as (
    select
      batch.service_date,
      coalesce(
        raw.matched_roster_member_id,
        core.resolve_roster_identity(
          p_company_id,
          coalesce(nullif(raw.normalized_row_json ->> 'driver_name',''), raw.source_driver_name),
          raw.source_dswid,
          null
        )
      ) as roster_id,
      coalesce(nullif(raw.normalized_row_json ->> 'wa_name',''), raw.source_route_key) as route_name,
      coalesce(nullif(raw.normalized_row_json ->> 'wa_number',''), raw.source_wa_number) as wa_number,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_stops'),0),0) as delivery_stops,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_packages'),0),0) as delivery_packages,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_stops'),0),0) as pickup_stops,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_packages'),0),0) as pickup_packages,
      greatest(coalesce(raw.early_pickups, core.safe_numeric(raw.normalized_row_json ->> 'early_pickups'),0),0) as early_pickups,
      greatest(coalesce(raw.late_pickups, core.safe_numeric(raw.normalized_row_json ->> 'late_pickups'),0),0) as late_pickups,
      greatest(coalesce(raw.potential_missed_pickups, core.safe_numeric(raw.normalized_row_json ->> 'potential_missed_pickups'),0),0) as potential_missed,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'exceptions'),0),0) as exceptions,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'code_85'),0),0) as code_85,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'dna'),0),0) as dna,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'send_again'),0),0) as send_again,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'required_signature'),0),0) as required_signature,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'miles'),0),0) as miles,
      core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_road_hours') as road_hours,
      core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_duty_hours') as duty_hours,
      core.safe_numeric(raw.normalized_row_json ->> 'ils_percent') as ils_percent
    from latest_final_batches batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    where raw.company_id = p_company_id and raw.row_kind = 'ROUTE'
  ),
  periods as (
    select 'LAST_MONTH'::text as period_key, v_last_month_start as period_start, v_last_month_end as period_end
    union all select 'MTD', v_mtd_start, p_as_of_date
    union all select 'CONTRACT', p_start_date, least(p_end_date, p_as_of_date)
  ),
  roster as (
    select
      person.id as roster_id,
      person.full_name,
      person.employment_status,
      ops.fx_id,
      ops.dswid,
      ops.daily_pay_rate
    from core.company_roster person
    left join core.company_roster_operations_fact ops on ops.roster_id = person.id
    where person.company_id = p_company_id
      and person.employment_status in ('Active','Trainee')
  ),
  aggregate as (
    select
      roster.roster_id,
      period.period_key,
      count(distinct fact.service_date) filter (where fact.roster_id is not null) as operating_days,
      count(*) filter (where fact.roster_id is not null) as route_days,
      coalesce(sum(fact.delivery_stops),0) as delivery_stops,
      coalesce(sum(fact.delivery_packages),0) as delivery_packages,
      coalesce(sum(fact.pickup_stops),0) as pickup_stops,
      coalesce(sum(fact.pickup_packages),0) as pickup_packages,
      coalesce(sum(fact.early_pickups),0) as early_pickups,
      coalesce(sum(fact.late_pickups),0) as late_pickups,
      coalesce(sum(fact.potential_missed),0) as potential_missed,
      coalesce(sum(fact.exceptions),0) as exceptions,
      coalesce(sum(fact.code_85),0) as code_85,
      coalesce(sum(fact.dna),0) as dna,
      coalesce(sum(fact.send_again),0) as send_again,
      coalesce(sum(fact.required_signature),0) as required_signature,
      coalesce(sum(fact.miles),0) as miles,
      coalesce(sum(fact.road_hours),0) as road_hours,
      coalesce(sum(fact.duty_hours),0) as duty_hours,
      case when sum(fact.delivery_packages) filter (where fact.ils_percent is not null) > 0
        then sum(fact.ils_percent * fact.delivery_packages) filter (where fact.ils_percent is not null)
          / sum(fact.delivery_packages) filter (where fact.ils_percent is not null)
        else null end as observed_ils
    from roster
    cross join periods period
    left join source_facts fact on fact.roster_id = roster.roster_id
      and fact.service_date between period.period_start and period.period_end
    group by roster.roster_id, period.period_key
  ),
  drivers as (
    select jsonb_build_object(
      'roster_id', roster.roster_id,
      'full_name', roster.full_name,
      'fx_id', roster.fx_id,
      'dswid', roster.dswid,
      'employment_status', roster.employment_status,
      'daily_pay_rate', roster.daily_pay_rate,
      'periods', jsonb_object_agg(aggregate.period_key, jsonb_build_object(
        'operating_days', aggregate.operating_days,
        'route_days', aggregate.route_days,
        'delivery_stops', aggregate.delivery_stops,
        'delivery_packages', aggregate.delivery_packages,
        'pickup_stops', aggregate.pickup_stops,
        'pickup_packages', aggregate.pickup_packages,
        'early_pickups', aggregate.early_pickups,
        'late_pickups', aggregate.late_pickups,
        'potential_missed_pickups', aggregate.potential_missed,
        'exceptions', aggregate.exceptions,
        'code_85', aggregate.code_85,
        'dna', aggregate.dna,
        'send_again', aggregate.send_again,
        'required_signature', aggregate.required_signature,
        'miles', aggregate.miles,
        'road_hours', aggregate.road_hours,
        'duty_hours', aggregate.duty_hours,
        'observed_ils', aggregate.observed_ils
      ))
    ) as value
    from roster
    join aggregate on aggregate.roster_id = roster.roster_id
    group by roster.roster_id, roster.full_name, roster.fx_id, roster.dswid,
      roster.employment_status, roster.daily_pay_rate
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'contract_start', p_start_date,
      'contract_end', p_end_date,
      'as_of_date', p_as_of_date,
      'last_month_start', v_last_month_start,
      'last_month_end', v_last_month_end,
      'mtd_start', v_mtd_start
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
    'unmatched_route_rows', (select count(*) from source_facts where roster_id is null)
  ) into v_result
  from core.driver_scorecard_model model
  where model.id = v_model_id;

  return coalesce(v_result, jsonb_build_object('drivers','[]'::jsonb));
end;
$$;

create or replace function public.get_company_driver_scorecard_detail(
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
  then raise exception 'A company, driver, and valid contract range are required.' using errcode = '22023';
  end if;
  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;
  if not exists(select 1 from core.company_roster where id=p_roster_id and company_id=p_company_id) then
    raise exception 'Driver not found.' using errcode = '22023';
  end if;

  return query
  with latest as (
    select distinct on (batch.service_date) batch.id, batch.service_date
    from core.operations_report_batch batch
    where batch.company_id=p_company_id and batch.report_family_key='DSW'
      and batch.snapshot_kind='FINAL' and batch.status='LOADED'
      and batch.service_date between p_start_date and p_end_date
    order by batch.service_date,batch.created_at desc,batch.id desc
  )
  select
    latest.service_date,
    coalesce(nullif(raw.normalized_row_json->>'wa_name',''),raw.source_route_key),
    coalesce(nullif(raw.normalized_row_json->>'wa_number',''),raw.source_wa_number),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'actual_delivery_stops'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'actual_delivery_packages'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'actual_pickup_stops'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'actual_pickup_packages'),0),0),
    greatest(coalesce(raw.early_pickups,core.safe_numeric(raw.normalized_row_json->>'early_pickups'),0),0),
    greatest(coalesce(raw.late_pickups,core.safe_numeric(raw.normalized_row_json->>'late_pickups'),0),0),
    greatest(coalesce(raw.potential_missed_pickups,core.safe_numeric(raw.normalized_row_json->>'potential_missed_pickups'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'exceptions'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'code_85'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'dna'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'send_again'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'required_signature'),0),0),
    greatest(coalesce(core.safe_numeric(raw.normalized_row_json->>'miles'),0),0),
    core.driver_scorecard_hours(raw.normalized_row_json->>'on_road_hours'),
    core.driver_scorecard_hours(raw.normalized_row_json->>'on_duty_hours'),
    core.safe_numeric(raw.normalized_row_json->>'ils_percent')
  from latest join core.operations_report_raw_row raw on raw.batch_id=latest.id
  where raw.company_id=p_company_id and raw.row_kind='ROUTE'
    and coalesce(raw.matched_roster_member_id, core.resolve_roster_identity(
      p_company_id,
      coalesce(nullif(raw.normalized_row_json->>'driver_name',''),raw.source_driver_name),
      raw.source_dswid,
      null
    ))=p_roster_id
  order by latest.service_date, raw.source_row_index;
end;
$$;

revoke all on function public.get_company_driver_scorecard_index(uuid,date,date,date) from public;
revoke all on function public.get_company_driver_scorecard_detail(uuid,uuid,date,date) from public;
grant execute on function public.get_company_driver_scorecard_index(uuid,date,date,date) to authenticated, service_role;
grant execute on function public.get_company_driver_scorecard_detail(uuid,uuid,date,date) to authenticated, service_role;

notify pgrst, 'reload schema';
