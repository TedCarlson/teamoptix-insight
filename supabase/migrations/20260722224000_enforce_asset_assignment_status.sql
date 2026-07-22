-- ASSIGNED is derived from custody. Moving an asset to any other status ends
-- custody automatically; users must never perform a second release action.

create or replace function core.enforce_asset_assignment_status()
returns trigger
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_new_status_key text;
  v_has_open_assignment boolean;
begin
  select status_key into v_new_status_key
  from core.asset_status
  where id = new.asset_status_id;

  select exists (
    select 1 from core.asset_assignment assignment
    where assignment.asset_id = old.id and assignment.released_at is null
  ) into v_has_open_assignment;

  if v_new_status_key = 'ASSIGNED' then
    if new.assigned_person_id is null
      and new.assigned_roster_member_id is null
      and not v_has_open_assignment then
      raise exception 'Assigned status is created by assigning custody, not by editing asset status';
    end if;
    return new;
  end if;

  if old.assigned_person_id is null
    and old.assigned_roster_member_id is null
    and not v_has_open_assignment then
    return new;
  end if;

  update core.asset_assignment
  set released_at = now(),
      release_reason = 'ASSET_STATUS_' || v_new_status_key,
      updated_at = now()
  where asset_id = old.id and released_at is null;

  new.assigned_person_id := null;
  new.assigned_roster_member_id := null;
  new.assigned_at := null;
  new.released_at := now();

  insert into core.asset_event (
    asset_id, company_id, event_key, event_label, from_status_id,
    to_status_id, person_id, roster_member_id, event_notes
  ) values (
    old.id, old.company_id, 'STATUS_RELEASE',
    'Assignment released by asset status change', old.asset_status_id,
    new.asset_status_id, old.assigned_person_id, old.assigned_roster_member_id,
    'Status changed to ' || v_new_status_key || '; active custody ended automatically.'
  );

  return new;
end;
$$;

drop trigger if exists asset_release_assignment_on_retirement on core.asset;
drop trigger if exists asset_enforce_assignment_status on core.asset;

create trigger asset_enforce_assignment_status
before update of asset_status_id on core.asset
for each row
when (old.asset_status_id is distinct from new.asset_status_id)
execute function core.enforce_asset_assignment_status();

-- Repair every historical contradiction, not only retired assets.
update core.asset_assignment assignment
set released_at = now(),
    release_reason = 'ASSET_STATUS_BACKFILL',
    updated_at = now()
from core.asset asset
join core.asset_status status on status.id = asset.asset_status_id
where assignment.asset_id = asset.id
  and assignment.released_at is null
  and status.status_key <> 'ASSIGNED';

update core.asset asset
set assigned_person_id = null,
    assigned_roster_member_id = null,
    assigned_at = null,
    released_at = coalesce(asset.released_at, now()),
    updated_at = now()
from core.asset_status status
where status.id = asset.asset_status_id
  and status.status_key <> 'ASSIGNED'
  and (asset.assigned_person_id is not null
    or asset.assigned_roster_member_id is not null
    or asset.assigned_at is not null);
