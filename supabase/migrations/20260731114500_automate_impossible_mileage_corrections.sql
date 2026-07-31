begin;

-- Mileage correction is no longer a manual work queue. Missing, invalid, and
-- zero values are ignored. Only values above the impossible-mileage threshold
-- are candidates. They use the company-wide native median immediately, then
-- promote to the route-native median after the route has three native rows.
-- System-corrected rows never enter either median model.
create or replace function public.get_operations_mileage_audit(
  p_company_id uuid,
  p_max_reasonable_miles numeric default 500,
  p_before_date date default (current_date + 1)
)
returns table(
  raw_row_id uuid,
  batch_id uuid,
  service_date date,
  route_baseline_id uuid,
  route_name text,
  wa_number text,
  driver_name text,
  recorded_miles_text text,
  recorded_miles numeric,
  suggested_miles numeric,
  reason text,
  sample_size bigint
)
language sql
security definer
set search_path to 'core', 'public'
as $$
  with dsw_rows as (
    select
      raw.id as raw_row_id,
      raw.batch_id,
      batch.service_date,
      nullif(raw.normalized_row_json ->> 'route_baseline_id', '')::uuid
        as route_baseline_id,
      coalesce(
        raw.normalized_row_json ->> 'wa_name',
        raw.source_route_key
      ) as route_name,
      coalesce(
        raw.normalized_row_json ->> 'wa_number',
        raw.source_wa_number
      ) as wa_number,
      coalesce(
        raw.normalized_row_json ->> 'driver_name',
        raw.source_driver_name
      ) as driver_name,
      nullif(raw.normalized_row_json ->> 'miles', '')
        as recorded_miles_text,
      case
        when regexp_replace(
          coalesce(raw.normalized_row_json ->> 'miles', ''),
          ',', '', 'g'
        ) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then regexp_replace(
          raw.normalized_row_json ->> 'miles', ',', '', 'g'
        )::numeric
        else null
      end as recorded_miles,
      coalesce(
        nullif(raw.normalized_row_json ->> 'route_baseline_id', ''),
        nullif(raw.normalized_row_json ->> 'wa_number', ''),
        nullif(raw.source_wa_number, ''),
        nullif(raw.normalized_row_json ->> 'wa_name', ''),
        nullif(raw.source_route_key, '')
      ) as route_key,
      correction.id is not null as is_corrected
    from core.operations_report_batch batch
    join core.operations_report_raw_row raw
      on raw.batch_id = batch.id
     and raw.company_id = batch.company_id
    left join core.operations_mileage_correction_log correction
      on correction.raw_row_id = raw.id
     and correction.company_id = raw.company_id
    where batch.company_id = p_company_id
      and batch.service_date < p_before_date
      and batch.report_family_key = 'DSW'
      and batch.status in ('LOADED', 'INGESTED')
      and raw.row_kind = 'ROUTE'
  ),
  clean_route_samples as (
    select *
    from dsw_rows
    where route_key is not null
      and recorded_miles > 0
      and recorded_miles <= p_max_reasonable_miles
      and not is_corrected
  ),
  route_model as (
    select
      route_key,
      percentile_cont(0.5) within group (order by recorded_miles)
        as median_miles,
      count(*) as sample_size
    from clean_route_samples
    group by route_key
  ),
  company_model as (
    select
      percentile_cont(0.5) within group (order by median_miles)
        as median_miles
    from route_model
  ),
  impossible_rows as (
    select
      row.*,
      model.median_miles as route_median_miles,
      company_model.median_miles as company_median_miles,
      coalesce(model.sample_size, 0)::bigint as sample_size
    from dsw_rows row
    left join route_model model on model.route_key = row.route_key
    cross join company_model
    where row.recorded_miles > p_max_reasonable_miles
  )
  select
    row.raw_row_id,
    row.batch_id,
    row.service_date,
    row.route_baseline_id,
    row.route_name,
    row.wa_number,
    row.driver_name,
    row.recorded_miles_text,
    row.recorded_miles,
    case
      when row.sample_size >= 3 and row.route_median_miles is not null
        then round(row.route_median_miles::numeric, 1)
      when row.company_median_miles is not null
        then round(row.company_median_miles::numeric, 1)
      else null
    end as suggested_miles,
    'IMPOSSIBLE_MILEAGE'::text as reason,
    row.sample_size
  from impossible_rows row
  order by row.service_date desc, row.route_name asc;
$$;

create or replace function public.apply_operations_mileage_heal(
  p_company_id uuid,
  p_max_reasonable_miles numeric default 500,
  p_before_date date default (current_date + 1),
  p_corrected_by_profile_id uuid default null,
  p_min_sample_size bigint default 0
)
returns table(corrected_count integer)
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_count integer := 0;
begin
  with audit as (
    select *
    from public.get_operations_mileage_audit(
      p_company_id,
      p_max_reasonable_miles,
      p_before_date
    )
    where reason = 'IMPOSSIBLE_MILEAGE'
      and suggested_miles is not null
  ),
  targets as (
    select
      audit.*,
      raw.normalized_row_json as original_json,
      jsonb_set(
        raw.normalized_row_json,
        '{miles}',
        to_jsonb(audit.suggested_miles),
        true
      ) as healed_json
    from audit
    join core.operations_report_raw_row raw
      on raw.id = audit.raw_row_id
     and raw.company_id = p_company_id
  ),
  logged as (
    insert into core.operations_mileage_correction_log (
      company_id,
      raw_row_id,
      batch_id,
      service_date,
      route_baseline_id,
      route_name,
      wa_number,
      driver_name,
      original_miles_text,
      original_miles,
      corrected_miles,
      correction_reason,
      correction_method,
      original_normalized_row_json,
      corrected_normalized_row_json,
      corrected_by_profile_id
    )
    select
      p_company_id,
      raw_row_id,
      batch_id,
      service_date,
      route_baseline_id,
      route_name,
      wa_number,
      driver_name,
      recorded_miles_text,
      recorded_miles,
      suggested_miles,
      reason,
      case
        when sample_size >= 3 then 'AUTOMATIC_ROUTE_MEDIAN_NATIVE_3'
        else 'AUTOMATIC_COMPANY_MEDIAN_ROUTE_WARMUP'
      end,
      original_json,
      healed_json,
      p_corrected_by_profile_id
    from targets
    on conflict (raw_row_id) do nothing
    returning raw_row_id
  )
  update core.operations_report_raw_row raw
  set normalized_row_json = target.healed_json
  from targets target
  join logged on logged.raw_row_id = target.raw_row_id
  where raw.id = target.raw_row_id
    and raw.company_id = p_company_id;

  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- Run the policy after a DSW ingest transaction has staged all of its rows.
-- The deferred trigger prevents a partially staged batch from being used as
-- route history and keeps the correction in the same database transaction.
create or replace function core.apply_automatic_mileage_policy_after_dsw()
returns trigger
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
begin
  perform corrected_count
  from public.apply_operations_mileage_heal(
    new.company_id,
    500,
    greatest(current_date, new.service_date + 1),
    null,
    0
  );
  return new;
end;
$$;

drop trigger if exists operations_automatic_mileage_policy_trg
  on core.operations_report_batch;
create constraint trigger operations_automatic_mileage_policy_trg
after insert on core.operations_report_batch
deferrable initially deferred
for each row
when (
  new.report_family_key = 'DSW'
  and new.status in ('LOADED', 'INGESTED')
)
execute function core.apply_automatic_mileage_policy_after_dsw();

revoke all on function public.apply_operations_mileage_heal(
  uuid, numeric, date, uuid, bigint
) from public, anon, authenticated;
grant execute on function public.apply_operations_mileage_heal(
  uuid, numeric, date, uuid, bigint
) to service_role;

revoke all on function core.apply_automatic_mileage_policy_after_dsw()
  from public, anon, authenticated;
grant execute on function core.apply_automatic_mileage_policy_after_dsw()
  to service_role;

-- Apply the new policy immediately to existing impossible values. Missing
-- values remain untouched; warming routes use the company-native median.
do $$
declare
  company record;
begin
  for company in
    select distinct batch.company_id
    from core.operations_report_batch batch
    where batch.report_family_key = 'DSW'
  loop
    perform corrected_count
    from public.apply_operations_mileage_heal(
      company.company_id,
      500,
      current_date + 1,
      null,
      0
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
