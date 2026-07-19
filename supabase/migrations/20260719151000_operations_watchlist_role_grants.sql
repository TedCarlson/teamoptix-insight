begin;

-- The public read models are security-invoker views. PostgreSQL therefore
-- requires both the table privilege below and a passing RLS policy before a
-- company-scoped row can be returned.
grant select, insert, update on table core.operations_watchlist_item
  to authenticated, service_role;

grant select, insert on table core.operations_watchlist_note
  to authenticated, service_role;

grant select, insert on table core.operations_daily_report_share
  to authenticated, service_role;

-- No DELETE grants are intentional. Watchlist history, action notes, and
-- governed share snapshots are durable audit evidence.

commit;
