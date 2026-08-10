-- Roster invitation endpoints run as the signed-in user. Keep token access
-- company-scoped while allowing company administrators to create and rotate
-- invitation tokens.

create policy hiring_invite_token_select_admin
on public.hiring_invite_token
for select
to authenticated
using (core.can_admin_company(pc_org_id));

create policy hiring_invite_token_insert_admin
on public.hiring_invite_token
for insert
to authenticated
with check (core.can_admin_company(pc_org_id));

create policy hiring_invite_token_update_admin
on public.hiring_invite_token
for update
to authenticated
using (core.can_admin_company(pc_org_id))
with check (core.can_admin_company(pc_org_id));
