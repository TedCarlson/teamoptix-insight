-- Bring existing Assistant BC leadership assignments into the Assets grant model.
-- Assets covers scanners and fuel cards only; Fleet remains a separate grant.
insert into core.company_user_grant (
  company_id,
  profile_id,
  grant_key,
  is_active,
  granted_by_profile_id,
  updated_at
)
select
  assignment.company_id,
  roster.profile_id,
  'assets',
  true,
  null,
  now()
from core.company_leadership_assignment assignment
join core.company_roster roster
  on roster.id = assignment.roster_member_id
 and roster.company_id = assignment.company_id
where assignment.role_key = 'assistant_bc'
  and roster.profile_id is not null
  and roster.employment_status in ('Active', 'Trainee')
on conflict (company_id, profile_id, grant_key) do update
set is_active = true,
    updated_at = now();
