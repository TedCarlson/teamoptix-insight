alter table core.operations_collection_request
  drop constraint if exists operations_collection_request_request_type_check;

alter table core.operations_collection_request
  add constraint operations_collection_request_request_type_check
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
