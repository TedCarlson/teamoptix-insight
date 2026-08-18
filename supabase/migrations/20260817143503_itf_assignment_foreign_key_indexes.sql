begin;

create index if not exists itf_workforce_assignment_roster_idx
  on core.itf_workforce_assignment (roster_id, effective_start desc);

create index if not exists itf_workforce_assignment_created_by_idx
  on core.itf_workforce_assignment (created_by_profile_id)
  where created_by_profile_id is not null;

commit;
