begin;

-- The candidate Bio RPC was introduced in the preceding migration. Prompt
-- PostgREST to discover it immediately instead of waiting for cache expiry.
notify pgrst, 'reload schema';

commit;
