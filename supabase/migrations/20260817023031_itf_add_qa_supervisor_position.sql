begin;

update core.company_roster roster
set
  job_title = 'QA Supervisor',
  seat_type = 'SUPPORT'
from core.company_roster_identifier identifier
where roster.id = identifier.roster_id
  and identifier.identifier_type = 'legacy_person_id'
  and identifier.identifier_value = '147f270b-f2fd-4c8a-beca-f6926cc724c2';

do $$
begin
  if not exists (
    select 1
    from public.itf_company_roster_v roster
    where roster.company_slug = 'integrated-tech-group'
      and roster.full_name = 'Devin Brown'
      and roster.job_title = 'QA Supervisor'
      and roster.seat_type = 'SUPPORT'
      and roster.location_code = '427'
      and roster.office_name = 'Egg Harbor'
      and roster.reports_to_name = 'George Koelle'
  ) then
    raise exception 'Devin Brown QA Supervisor contract was not applied correctly.';
  end if;
end;
$$;

commit;
