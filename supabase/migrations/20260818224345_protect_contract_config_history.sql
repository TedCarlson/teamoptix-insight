-- Preserve the final contract configuration and refuse deletion whenever
-- warehouse uploads or analytics history overlap the configuration period.

create or replace function public.delete_company_contract_config(
  p_company_slug text,
  p_contract_config_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_contract_number text;
  v_effective_start_date date;
  v_effective_end_date date;
  v_config_count bigint;
  v_warehouse_upload_count bigint;
  v_analytics_reference_count bigint;
begin
  if nullif(btrim(p_company_slug), '') is null
    or p_contract_config_id is null
  then
    raise exception 'A company and contract configuration are required.'
      using errcode = '22023';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.'
      using errcode = 'P0002';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'You do not have permission to manage this company.'
      using errcode = '42501';
  end if;

  -- Lock every configuration row for this company so two concurrent deletes
  -- cannot both pass the "one must remain" check.
  perform 1
  from core.company_contract_config config
  where config.company_id = v_company_id
  order by config.id
  for update;

  select
    config.contract_number,
    config.effective_start_date,
    config.effective_end_date
  into
    v_contract_number,
    v_effective_start_date,
    v_effective_end_date
  from core.company_contract_config config
  where config.id = p_contract_config_id
    and config.company_id = v_company_id;

  if not found then
    raise exception 'Contract configuration not found.'
      using errcode = 'P0002';
  end if;

  select count(*)
  into v_config_count
  from core.company_contract_config config
  where config.company_id = v_company_id;

  if v_config_count <= 1 then
    raise exception 'The only contract configuration cannot be deleted. Edit it instead.'
      using errcode = '23503';
  end if;

  select
    (
      select count(*)
      from core.operations_report_batch batch
      where batch.company_id = v_company_id
        and (
          batch.metadata_json #>> '{ownership_context,config_id}' = p_contract_config_id::text
          or (
            batch.service_date >= v_effective_start_date
            and (
              v_effective_end_date is null
              or batch.service_date <= v_effective_end_date
            )
          )
        )
    )
    + (
      select count(*)
      from core.driver_scorecard_observation_batch batch
      where batch.company_id = v_company_id
        and batch.period_end >= v_effective_start_date
        and (
          v_effective_end_date is null
          or batch.period_start <= v_effective_end_date
        )
    )
    + (
      select count(*)
      from core.operations_dsw_package_status_snapshot snapshot
      where snapshot.company_id = v_company_id
        and upper(nullif(btrim(snapshot.contract_number), '')) =
          upper(nullif(btrim(v_contract_number), ''))
        and snapshot.service_date >= v_effective_start_date
        and (
          v_effective_end_date is null
          or snapshot.service_date <= v_effective_end_date
        )
    )
  into v_warehouse_upload_count;

  select count(*)
  into v_analytics_reference_count
  from (
    select 1
    from core.driver_scorecard_route_day_fact fact
    where fact.contract_id = p_contract_config_id
    union all
    select 1
    from core.driver_scorecard_day_fact fact
    where fact.contract_id = p_contract_config_id
    union all
    select 1
    from core.driver_scorecard_week_fact fact
    where fact.contract_id = p_contract_config_id
    union all
    select 1
    from core.driver_scorecard_snapshot snapshot
    where snapshot.contract_id = p_contract_config_id
  ) usage;

  if v_warehouse_upload_count > 0 or v_analytics_reference_count > 0 then
    raise exception 'Deletion blocked: this configuration has % warehouse upload(s) and % analytics record(s). Edit it or mark it Historical instead.',
      v_warehouse_upload_count,
      v_analytics_reference_count
      using errcode = '23503';
  end if;

  delete from core.company_contract_config config
  where config.id = p_contract_config_id
    and config.company_id = v_company_id;

  return jsonb_build_object(
    'deleted', true,
    'contract_config_id', p_contract_config_id,
    'remaining_configurations', v_config_count - 1,
    'warehouse_upload_count', v_warehouse_upload_count,
    'analytics_reference_count', v_analytics_reference_count
  );
end;
$$;

revoke all on function public.delete_company_contract_config(text, uuid)
  from public, anon;

grant execute on function public.delete_company_contract_config(text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
