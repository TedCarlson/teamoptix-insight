-- Allow authenticated drivers to record their own breadcrumb/location evidence.
-- This completes the normal driver activity write contract:
-- driver activity event + optional location breadcrumb.

grant insert on table core.driver_breadcrumb_point to authenticated;

drop policy if exists driver_breadcrumb_point_insert_self on core.driver_breadcrumb_point;

create policy driver_breadcrumb_point_insert_self
on core.driver_breadcrumb_point
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
    and (
      source_activity_event_id is null
      or exists (
        select 1
        from core.driver_activity_event event
        where event.id = source_activity_event_id
          and event.company_id = driver_breadcrumb_point.company_id
          and (
            event.profile_id = core.current_profile_id()
            or core.is_platform_owner()
          )
      )
    )
  )
);
