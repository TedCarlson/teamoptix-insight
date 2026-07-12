-- Allow authenticated drivers to record their own activity events.
-- This supports normal clock actions and driver-submitted timekeeping corrections
-- while preserving company/profile/roster RLS boundaries.

grant insert on table core.driver_activity_event to authenticated;

drop policy if exists driver_activity_event_insert_self on core.driver_activity_event;

create policy driver_activity_event_insert_self
on core.driver_activity_event
for insert
to authenticated
with check (
  core.is_platform_owner()
  or (
    profile_id = core.current_profile_id()
    and core.can_access_company(company_id)
    and (
      roster_member_id is null
      or core.can_access_roster_member(roster_member_id)
    )
  )
);
