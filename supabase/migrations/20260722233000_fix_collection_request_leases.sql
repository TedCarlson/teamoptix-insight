-- Expire stale work through the governed status RPC so terminal receipts and
-- completion semantics match every other request outcome. Status-specific
-- ingestion leases must be selected before request-type leases.

create or replace function public.expire_stale_operations_collection_requests()
returns integer
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_request record;
  v_expired_count integer := 0;
  v_error text;
begin
  for v_request in
    select
      request.id,
      request.request_status,
      greatest(
        request.updated_at,
        coalesce((
          select max(artifact.updated_at)
          from core.operations_collection_artifact artifact
          where artifact.collection_request_id = request.id
        ), request.updated_at)
      ) as last_heartbeat_at,
      case
        when request.request_status = 'CLAIMED' then interval '10 minutes'
        when request.request_status in ('ARTIFACTS_READY', 'INGESTING') then interval '1 hour'
        when request.request_type = 'HISTORICAL_BACKFILL' then interval '4 hours'
        when request.request_type in ('TARGETED_RECOVERY', 'PREVIOUS_DAY_CLOSE', 'OPERATIONS_PULSE') then interval '30 minutes'
        else interval '1 hour'
      end as lease_duration
    from core.operations_collection_request request
    where request.request_status in ('CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
    for update of request skip locked
  loop
    if v_request.last_heartbeat_at >= now() - v_request.lease_duration then
      continue;
    end if;

    v_error := case
      when v_request.request_status in ('ARTIFACTS_READY', 'INGESTING')
        then 'Ingestion lease expired: artifact processing stopped without completing the request.'
      else 'Runner lease expired: no execution or artifact heartbeat was received before the governed timeout.'
    end;

    perform public.update_operations_collection_request_status(
      v_request.id,
      'FAILED',
      v_error,
      null,
      null
    );
    v_expired_count := v_expired_count + 1;
  end loop;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_operations_collection_requests() from public;
grant execute on function public.expire_stale_operations_collection_requests() to service_role;

notify pgrst, 'reload schema';
