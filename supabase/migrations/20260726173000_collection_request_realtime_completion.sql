-- Collection pages hydrate once, then listen for the terminal transition of
-- the active request. Publishing the governed base table avoids recurring
-- route refreshes and request-status polling.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'core'
      and tablename = 'operations_collection_request'
  ) then
    alter publication supabase_realtime
      add table core.operations_collection_request;
  end if;
end
$$;
