-- Allow company administrators to remove unused contract configuration rows
-- without cascading or detaching analytics history that already references one.

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
  v_usage_count bigint;
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

  perform 1
  from core.company_contract_config config
  where config.id = p_contract_config_id
    and config.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Contract configuration not found.'
      using errcode = 'P0002';
  end if;

  select count(*)
  into v_usage_count
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

  if v_usage_count > 0 then
    raise exception 'This configuration is already used by analytics history. Mark it Historical and set an end date instead of deleting it.'
      using errcode = '23503';
  end if;

  delete from core.company_contract_config config
  where config.id = p_contract_config_id
    and config.company_id = v_company_id;

  return jsonb_build_object(
    'deleted', true,
    'contract_config_id', p_contract_config_id
  );
end;
$$;

revoke all on function public.delete_company_contract_config(text, uuid)
  from public, anon;

grant execute on function public.delete_company_contract_config(text, uuid)
  to authenticated;

-- Make the new RPC available to PostgREST immediately after deployment.
notify pgrst, 'reload schema';
