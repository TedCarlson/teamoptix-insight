begin;

drop policy if exists company_engagement_participant_all_admin on core.company_engagement_participant;
create policy company_engagement_participant_insert_admin
on core.company_engagement_participant for insert to authenticated
with check (core.is_platform_owner() or core.can_admin_company(company_id) or core.can_admin_company(reporting_company_id));
create policy company_engagement_participant_update_admin
on core.company_engagement_participant for update to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id) or core.can_admin_company(reporting_company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id) or core.can_admin_company(reporting_company_id));

drop policy if exists company_engagement_location_all_admin on core.company_engagement_location;
create policy company_engagement_location_insert_admin
on core.company_engagement_location for insert to authenticated
with check (core.is_platform_owner());
create policy company_engagement_location_update_admin
on core.company_engagement_location for update to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());

drop policy if exists company_engagement_office_all_admin on core.company_engagement_office;
create policy company_engagement_office_insert_admin
on core.company_engagement_office for insert to authenticated
with check (core.is_platform_owner());
create policy company_engagement_office_update_admin
on core.company_engagement_office for update to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());

drop policy if exists itf_workforce_assignment_all_admin on core.itf_workforce_assignment;
create policy itf_workforce_assignment_insert_admin
on core.itf_workforce_assignment for insert to authenticated
with check (core.is_platform_owner() or core.can_admin_company(roster_company_id));
create policy itf_workforce_assignment_update_admin
on core.itf_workforce_assignment for update to authenticated
using (core.is_platform_owner() or core.can_admin_company(roster_company_id))
with check (core.is_platform_owner() or core.can_admin_company(roster_company_id));

commit;
