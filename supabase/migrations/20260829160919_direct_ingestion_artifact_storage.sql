-- Runner 2.0 previously used direct-ingestion-v2/receipt/<artifact-id> as a
-- virtual receipt address while parsing the request body in memory. Make that
-- address a real private object-store contract before the endpoint can report
-- a durable handoff.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'direct-ingestion-v2',
  'direct-ingestion-v2',
  false,
  4000000
)
on conflict (id)
do update set
  public = false,
  file_size_limit = excluded.file_size_limit;

create index if not exists operations_collection_direct_retention_audit_idx
  on core.operations_collection_artifact (created_at, id)
  where storage_bucket = 'direct-ingestion-v2'
    and artifact_status in ('INGESTED', 'IGNORED');

create or replace function public.audit_operations_direct_ingestion_source_retention(
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core, storage
as $$
declare
  v_missing integer := 0;
begin
  with candidates as (
    select artifact.id
    from core.operations_collection_artifact artifact
    where artifact.storage_bucket = 'direct-ingestion-v2'
      and artifact.artifact_status in ('INGESTED', 'IGNORED')
      and artifact.created_at <= now() - interval '10 minutes'
      and upper(coalesce(
        artifact.ingest_metadata_json #>> '{source_retention,status}', ''
      )) <> 'STORED'
      and not exists (
        select 1
        from storage.objects object
        where object.bucket_id = artifact.storage_bucket
          and object.name = artifact.storage_path
      )
    order by artifact.created_at, artifact.id
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  update core.operations_collection_artifact artifact
  set ingest_metadata_json = coalesce(
        artifact.ingest_metadata_json,
        '{}'::jsonb
      ) || jsonb_build_object(
        'source_retention',
        jsonb_build_object(
          'status', 'MISSING_LEGACY_DIRECT_OBJECT',
          'audited_at', now(),
          'reason', 'DIRECT_ENDPOINT_DID_NOT_PERSIST_REQUEST_BODY'
        )
      ),
      updated_at = now()
  from candidates
  where artifact.id = candidates.id;
  get diagnostics v_missing = row_count;

  return jsonb_build_object(
    'missing_legacy_object_count', v_missing,
    'audited_at', now()
  );
end;
$$;

revoke all on function public.audit_operations_direct_ingestion_source_retention(integer)
  from public, anon, authenticated;
grant execute on function public.audit_operations_direct_ingestion_source_retention(integer)
  to service_role;

comment on function public.audit_operations_direct_ingestion_source_retention(integer) is
  'Marks successful legacy direct-ingestion receipts whose virtual storage paths never received an object, preventing futile retained-file backfill retries.';

commit;
