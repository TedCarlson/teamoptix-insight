-- A GPX-only request may be marked FAILED by the legacy DSW completion guard
-- before the GPX scope exception is installed. Permit only a fully ingested,
-- GPX-only request to reconcile from FAILED to COMPLETE.

create or replace function core.guard_operations_collection_request_transition()
returns trigger
language plpgsql
set search_path to 'public', 'core'
as $$
declare
  v_allowed boolean := false;
begin
  if new.request_status = old.request_status then
    if old.request_status in ('COMPLETE', 'FAILED', 'CANCELLED') then
      new.completed_at := old.completed_at;
    end if;
    return new;
  end if;

  if old.request_status = 'FAILED'
    and new.request_status = 'COMPLETE'
    and coalesce(old.request_payload ->> 'collect_scope', '') =
      'ROUTE_GPX_BASELINE'
  then
    v_allowed := exists (
      select 1
      from core.operations_collection_artifact artifact
      where artifact.collection_request_id = old.id
        and artifact.artifact_kind = 'REPORT_FILE'
    ) and not exists (
      select 1
      from core.operations_collection_artifact artifact
      where artifact.collection_request_id = old.id
        and artifact.artifact_kind = 'REPORT_FILE'
        and (
          artifact.artifact_status <> 'INGESTED'
          or upper(coalesce(
            artifact.runner_artifact_json ->> 'artifact_key',
            ''
          )) <> 'ROUTE_GPX'
        )
    );
  else
    v_allowed := case old.request_status
      when 'QUEUED' then new.request_status in (
        'CLAIMED', 'FAILED', 'CANCELLED'
      )
      when 'CLAIMED' then new.request_status in (
        'RUNNING', 'FAILED', 'CANCELLED'
      )
      when 'RUNNING' then new.request_status in (
        'ARTIFACTS_READY', 'COMPLETE', 'FAILED', 'CANCELLED'
      )
      when 'ARTIFACTS_READY' then new.request_status in (
        'INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED'
      )
      when 'INGESTING' then new.request_status in (
        'COMPLETE', 'FAILED', 'CANCELLED'
      )
      else false
    end;
  end if;

  if not v_allowed then
    raise exception 'Illegal collection request transition: % -> % for request %',
      old.request_status, new.request_status, old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function core.guard_operations_collection_request_transition() is
  'Keeps request state monotonic, with a narrow FAILED-to-COMPLETE reconciliation for fully ingested ROUTE_GPX_BASELINE artifacts.';
