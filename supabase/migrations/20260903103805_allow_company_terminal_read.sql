grant select on table public.company_terminal to authenticated;
revoke select on table public.company_terminal from anon;

create policy company_terminal_select_access
on public.company_terminal
for select
to authenticated
using (core.can_access_company(company_id));
