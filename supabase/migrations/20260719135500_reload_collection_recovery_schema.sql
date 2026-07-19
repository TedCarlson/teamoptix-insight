-- PostgREST occasionally retains its pre-migration relation cache after a new
-- public view is created. Force the API layer to discover the recovery and
-- cost-observation views immediately.
notify pgrst, 'reload schema';

