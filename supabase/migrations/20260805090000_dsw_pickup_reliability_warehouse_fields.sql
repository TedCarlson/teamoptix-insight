alter table core.operations_report_raw_row
  add column if not exists early_late_pickups_raw text,
  add column if not exists early_pickups integer,
  add column if not exists late_pickups integer,
  add column if not exists potential_missed_pickups integer;

comment on column core.operations_report_raw_row.early_late_pickups_raw is
  'Authoritative DSW E/L PUs source string, preserved for audit and reparsing.';
comment on column core.operations_report_raw_row.early_pickups is
  'Early pickup count parsed from the first value in the DSW E/L PUs pair.';
comment on column core.operations_report_raw_row.late_pickups is
  'Late pickup count parsed from the second value in the DSW E/L PUs pair.';
comment on column core.operations_report_raw_row.potential_missed_pickups is
  'Provisional potential missed pickup count. This field may be adjudicated later.';

alter table core.operations_report_raw_row
  add constraint operations_report_raw_row_early_pickups_nonnegative
    check (early_pickups is null or early_pickups >= 0) not valid,
  add constraint operations_report_raw_row_late_pickups_nonnegative
    check (late_pickups is null or late_pickups >= 0) not valid,
  add constraint operations_report_raw_row_potential_missed_pickups_nonnegative
    check (
      potential_missed_pickups is null
      or potential_missed_pickups >= 0
    ) not valid;

create or replace function core.hydrate_dsw_pickup_reliability_fields()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_pair text;
  v_potential text;
begin
  if new.row_kind <> 'ROUTE' then
    return new;
  end if;

  if not (new.raw_row_json ? 'E/L PUs') then
    new.early_late_pickups_raw := null;
    new.early_pickups := null;
    new.late_pickups := null;
  else
    v_pair := coalesce(new.raw_row_json ->> 'E/L PUs', '');
    new.early_late_pickups_raw := nullif(v_pair, '');

    if btrim(v_pair) = '' then
      new.early_pickups := 0;
      new.late_pickups := 0;
    elsif v_pair ~ '^\s*[0-9]+\s*/\s*[0-9]+\s*$' then
      new.early_pickups := btrim(split_part(v_pair, '/', 1))::integer;
      new.late_pickups := btrim(split_part(v_pair, '/', 2))::integer;
    else
      new.early_pickups := null;
      new.late_pickups := null;
    end if;
  end if;

  v_potential := regexp_replace(
    coalesce(new.raw_row_json ->> 'Pot. Miss PUs', ''),
    '[,%[:space:]]',
    '',
    'g'
  );

  if not (new.raw_row_json ? 'Pot. Miss PUs') then
    new.potential_missed_pickups := null;
  elsif v_potential = '' then
    new.potential_missed_pickups := 0;
  elsif v_potential ~ '^[0-9]+(\.[0-9]+)?$' then
    new.potential_missed_pickups := trunc(v_potential::numeric)::integer;
  else
    new.potential_missed_pickups := null;
  end if;

  return new;
end;
$$;

drop trigger if exists hydrate_dsw_pickup_reliability_fields
  on core.operations_report_raw_row;

create trigger hydrate_dsw_pickup_reliability_fields
before insert or update of raw_row_json, row_kind
on core.operations_report_raw_row
for each row
execute function core.hydrate_dsw_pickup_reliability_fields();

update core.operations_report_raw_row r
set
  early_late_pickups_raw = nullif(r.raw_row_json ->> 'E/L PUs', ''),
  early_pickups = case
    when not (r.raw_row_json ? 'E/L PUs') then null
    when coalesce(r.raw_row_json ->> 'E/L PUs', '') ~
      '^\s*[0-9]+\s*/\s*[0-9]+\s*$'
    then btrim(split_part(r.raw_row_json ->> 'E/L PUs', '/', 1))::integer
    when btrim(coalesce(r.raw_row_json ->> 'E/L PUs', '')) = '' then 0
    else null
  end,
  late_pickups = case
    when not (r.raw_row_json ? 'E/L PUs') then null
    when coalesce(r.raw_row_json ->> 'E/L PUs', '') ~
      '^\s*[0-9]+\s*/\s*[0-9]+\s*$'
    then btrim(split_part(r.raw_row_json ->> 'E/L PUs', '/', 2))::integer
    when btrim(coalesce(r.raw_row_json ->> 'E/L PUs', '')) = '' then 0
    else null
  end,
  potential_missed_pickups = case
    when not (r.raw_row_json ? 'Pot. Miss PUs') then null
    when regexp_replace(
      coalesce(r.raw_row_json ->> 'Pot. Miss PUs', ''),
      '[,%[:space:]]',
      '',
      'g'
    ) = '' then 0
    when regexp_replace(
      coalesce(r.raw_row_json ->> 'Pot. Miss PUs', ''),
      '[,%[:space:]]',
      '',
      'g'
    ) ~ '^[0-9]+(\.[0-9]+)?$'
    then trunc(
      regexp_replace(
        r.raw_row_json ->> 'Pot. Miss PUs',
        '[,%[:space:]]',
        '',
        'g'
      )::numeric
    )::integer
    else null
  end
from core.operations_report_batch b
where b.id = r.batch_id
  and b.report_family_key = 'DSW'
  and r.row_kind = 'ROUTE';

alter table core.operations_report_raw_row
  validate constraint operations_report_raw_row_early_pickups_nonnegative;
alter table core.operations_report_raw_row
  validate constraint operations_report_raw_row_late_pickups_nonnegative;
alter table core.operations_report_raw_row
  validate constraint operations_report_raw_row_potential_missed_pickups_nonnegative;

create or replace function public.get_company_pickup_reliability_history(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  service_date date,
  actual_pickup_stops numeric,
  early_pickups bigint,
  late_pickups bigint,
  potential_missed_pickups bigint,
  pickup_reliability_complete boolean
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if p_company_id is null
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A valid company and date range of no more than 366 days is required.'
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
      and b.service_date between p_start_date and p_end_date
    order by b.service_date, b.created_at desc, b.id desc
  )
  select
    b.service_date,
    sum(
      case
        when nullif(r.normalized_row_json ->> 'actual_pickup_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'actual_pickup_stops')::numeric
        else 0
      end
    ) as actual_pickup_stops,
    sum(coalesce(r.early_pickups, 0))::bigint as early_pickups,
    sum(coalesce(r.late_pickups, 0))::bigint as late_pickups,
    sum(coalesce(r.potential_missed_pickups, 0))::bigint
      as potential_missed_pickups,
    bool_and(
      r.early_pickups is not null
      and r.late_pickups is not null
      and r.potential_missed_pickups is not null
    ) as pickup_reliability_complete
  from latest_final_batches b
  join core.operations_report_raw_row r
    on r.batch_id = b.id
  where r.row_kind = 'ROUTE'
    and nullif(r.normalized_row_json ->> 'wa_name', '') is not null
    and coalesce(r.source_route_key, '') !~ '^[0-9]+$'
  group by b.service_date
  order by b.service_date;
end;
$$;

revoke all on function public.get_company_pickup_reliability_history(
  uuid,
  date,
  date
) from public;

grant execute on function public.get_company_pickup_reliability_history(
  uuid,
  date,
  date
) to authenticated, service_role;
