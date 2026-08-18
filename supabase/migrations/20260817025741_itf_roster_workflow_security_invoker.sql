begin;

-- Both tables already enforce company-admin and platform-owner RLS. Keep the
-- roster workflow inside the caller's policy boundary in addition to the
-- explicit authorization checks inside each function.
alter function public.itf_update_roster_status(text, uuid, text)
  security invoker;

alter function public.itf_retire_roster_leader(text, uuid, uuid)
  security invoker;

commit;
