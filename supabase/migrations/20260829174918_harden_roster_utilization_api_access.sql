begin;

revoke all on public.company_roster_driver_utilization_v
  from public, anon;
revoke all on public.company_roster_utilization_view
  from public, anon;

grant select on public.company_roster_driver_utilization_v
  to authenticated, service_role;
grant select on public.company_roster_utilization_view
  to authenticated, service_role;

alter function public.update_company_driver_utilization_config(text, smallint)
  security invoker;

notify pgrst, 'reload schema';

commit;
