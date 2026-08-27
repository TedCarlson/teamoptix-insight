-- DEMO companies are grant-scoped product sandboxes. They must never inherit
-- the broad, relationship-based authority reserved for LIVE company admins.
-- Platform-owner access remains unchanged and continues to be evaluated
-- independently by the application access context.

create or replace function core.enforce_demo_membership_grants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.relationship_type = 'admin'
     and exists (
       select 1
       from core.companies company
       where company.id = new.company_id
         and company.experience_mode = 'DEMO'
     ) then
    new.relationship_type := 'member';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_demo_membership_grants
  on core.company_memberships;

create trigger enforce_demo_membership_grants
before insert or update of company_id, relationship_type
on core.company_memberships
for each row
execute function core.enforce_demo_membership_grants();

comment on function core.enforce_demo_membership_grants() is
  'Prevents DEMO company memberships from acquiring implicit LIVE administrator authority; DEMO access is controlled by explicit workspace grants.';

-- Remediate reviewers provisioned before this invariant was introduced.
update core.company_memberships membership
set relationship_type = 'member',
    title = case
      when membership.title = 'Demo Administrator' then 'App Reviewer'
      else membership.title
    end,
    updated_at = pg_catalog.now()
from core.companies company
where company.id = membership.company_id
  and company.experience_mode = 'DEMO'
  and membership.relationship_type = 'admin';
