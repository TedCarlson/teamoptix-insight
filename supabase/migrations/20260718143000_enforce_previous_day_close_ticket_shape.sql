-- PREVIOUS_DAY_CLOSE is a single-day collection contract. Date ranges belong to
-- HISTORICAL_BACKFILL or another explicitly authored recovery request.

update core.operations_collection_request
set
  request_status = 'CANCELLED',
  completed_at = now(),
  error_message = 'Cancelled: PREVIOUS_DAY_CLOSE must target exactly one service date; multi-day ranges require a historical sweep ticket.',
  updated_at = now()
where request_type = 'PREVIOUS_DAY_CLOSE'
  and request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
  and (
    service_date is null
    or service_date_start is not null
    or service_date_end is not null
  );

alter table core.operations_collection_request
  add constraint operations_previous_day_close_single_date_ck
  check (
    request_type <> 'PREVIOUS_DAY_CLOSE'
    or (
      service_date is not null
      and service_date_start is null
      and service_date_end is null
    )
  ) not valid;

create or replace function public.create_operations_collection_request(
  p_company_slug text,
  p_request_type text,
  p_service_date date default null,
  p_service_date_start date default null,
  p_service_date_end date default null,
  p_requested_reports text[] default '{}'::text[],
  p_request_payload jsonb default '{}'::jsonb,
  p_priority integer default 100
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  if p_request_type = 'PREVIOUS_DAY_CLOSE' and (
    p_service_date is null
    or p_service_date_start is not null
    or p_service_date_end is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'PREVIOUS_DAY_CLOSE requires one service_date and does not accept a date range. Use a historical sweep ticket for multi-day collection.';
  end if;

  insert into core.operations_collection_request (
    company_id,
    request_type,
    priority,
    service_date,
    service_date_start,
    service_date_end,
    requested_reports,
    request_payload
  )
  values (
    v_company_id,
    p_request_type,
    p_priority,
    p_service_date,
    p_service_date_start,
    p_service_date_end,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb)
  )
  returning id into v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

revoke all on function public.create_operations_collection_request(
  text, text, date, date, date, text[], jsonb, integer
) from public;
grant all on function public.create_operations_collection_request(
  text, text, date, date, date, text[], jsonb, integer
) to authenticated;
grant all on function public.create_operations_collection_request(
  text, text, date, date, date, text[], jsonb, integer
) to service_role;

