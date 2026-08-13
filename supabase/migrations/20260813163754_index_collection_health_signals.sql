-- Collection and ingestion health are independent, high-frequency dashboard
-- signals. Keep each lookup on its owning ledger and make both constant-time
-- as request and artifact history grows.
create index if not exists operations_collection_request_company_completed_idx
  on core.operations_collection_request (company_id, completed_at desc)
  where request_status = 'COMPLETE' and completed_at is not null;

create index if not exists operations_collection_artifact_company_ingested_idx
  on core.operations_collection_artifact (company_id, ingest_completed_at desc)
  where artifact_status in ('INGESTED', 'IGNORED')
    and ingest_completed_at is not null;
