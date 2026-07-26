begin;

-- Commercial profiles contain pricing, billing contacts, and lifecycle state.
-- Replace the original unrestricted write policies with company-governed
-- access. Platform workflows continue to use service_role and bypass RLS.
alter table commercial.profile enable row level security;

drop policy if exists commercial_profile_select
  on commercial.profile;
drop policy if exists commercial_profile_insert
  on commercial.profile;
drop policy if exists commercial_profile_update
  on commercial.profile;

create policy commercial_profile_select
on commercial.profile
for select
to authenticated
using (
  core.can_access_company(company_id)
);

create policy commercial_profile_insert
on commercial.profile
for insert
to authenticated
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

create policy commercial_profile_update
on commercial.profile
for update
to authenticated
using (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
)
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

revoke all on commercial.profile from anon;
revoke all on commercial.profile from public;
revoke all on commercial.profile from authenticated;
grant select, insert, update on commercial.profile to authenticated;
grant all on commercial.profile to service_role;

notify pgrst, 'reload schema';

commit;
