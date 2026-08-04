begin;

-- Make the manual onboarding RPC available to PostgREST immediately after
-- deployment instead of waiting for the schema cache to expire.
notify pgrst, 'reload schema';

commit;
