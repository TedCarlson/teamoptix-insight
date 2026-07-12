alter table core.operations_collection_request
  drop constraint if exists operations_collection_request_type_chk;

alter table core.operations_collection_request
  add constraint operations_collection_request_type_chk
  check (
    request_type in (
      'PREVIOUS_DAY_CLOSE',
      'LAST_LOOK',
      'HISTORICAL_BACKFILL',
      'TARGETED_RECOVERY',
      'OPERATIONS_FEED',
      'OPERATIONS_PULSE'
    )
  );
