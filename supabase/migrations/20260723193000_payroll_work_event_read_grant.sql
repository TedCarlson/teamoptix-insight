grant select on table core.company_payroll_work_event
  to authenticated, service_role;

grant select on table public.company_payroll_work_event_v
  to authenticated, service_role;

notify pgrst, 'reload schema';
