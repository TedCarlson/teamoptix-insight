create or replace function public.expire_stale_operations_collection_requests()
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_expired_count integer;
begin
  with request_heartbeat as (
    select
      request.id,
      request.request_type,
      request.request_status,
      greatest(
        request.updated_at,
        max(artifact.updated_at)
      ) as last_heartbeat_at,
      case
        when request.request_status = 'CLAIMED' then interval '10 minutes'
        when request.request_type = 'HISTORICAL_BACKFILL' then interval '4 hours'
        when request.request_type in (
          'TARGETED_RECOVERY',
          'PREVIOUS_DAY_CLOSE',
          'OPERATIONS_PULSE'
        ) then interval '30 minutes'
        when request.request_status in ('ARTIFACTS_READY', 'INGESTING')
          then interval '1 hour'
        else interval '1 hour'
      end as lease_duration
    from core.operations_collection_request request
    left join core.operations_collection_artifact artifact
      on artifact.collection_request_id = request.id
    where request.request_status in (
      'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING'
    )
    group by request.id
  ), expired as (
    select id
    from request_heartbeat
    where last_heartbeat_at < now() - lease_duration
  )
  update core.operations_collection_request request
  set
    request_status = 'FAILED',
    error_message = case
      when request.request_status in ('ARTIFACTS_READY', 'INGESTING')
        then 'Ingestion lease expired: artifact processing stopped without completing the request.'
      else 'Runner lease expired: no execution or artifact heartbeat was received before the governed timeout.'
    end,
    completed_at = now(),
    updated_at = now()
  from expired
  where request.id = expired.id;

  get diagnostics v_expired_count = row_count;
  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_operations_collection_requests() from public;
grant execute on function public.expire_stale_operations_collection_requests() to service_role;

create or replace function public.claim_operations_collection_request(p_runner_key text)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  perform public.expire_stale_operations_collection_requests();

  select id into v_request_id
  from core.operations_collection_request
  where request_status = 'QUEUED'
  order by
    public.collection_request_lane_priority(request_type) asc,
    priority asc,
    created_at asc
  for update skip locked
  limit 1;

  if v_request_id is null then
    return null;
  end if;

  update core.operations_collection_request
  set request_status = 'CLAIMED', claimed_by = p_runner_key,
      claimed_at = now(), updated_at = now()
  where id = v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

select public.expire_stale_operations_collection_requests();

notify pgrst, 'reload schema';

