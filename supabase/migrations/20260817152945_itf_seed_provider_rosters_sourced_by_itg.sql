-- Approved first-pass service-provider roster seed for Insight Telecom Fulfillment.
--
-- The August 2026 410/427 roster exports are the roster authority for this
-- event. Donor assignments enrich effective dates and identifiers where an
-- exact person/company match exists. Rows without an authoritative donor
-- assignment begin commercial assignment history on 2026-08-17 and say so in
-- their event metadata.
--
-- Ownership boundary:
--   * every roster row belongs to the service-provider company;
--   * ITG is recorded as the principal that entered the row on its behalf;
--   * relationships remain proposed and engagements remain draft/review;
--   * no company is granted access and no invitation is sent by this migration.

begin;

-- A company owner can participate across more than one ITG location. Keep one
-- company-owned roster identity and allow a relationship assignment without a
-- single location rather than duplicating that person.
alter table core.itf_workforce_assignment
  drop constraint if exists itf_workforce_assignment_location_path_ck;

alter table core.itf_workforce_assignment
  add constraint itf_workforce_assignment_location_path_ck
  check (
    (
      engagement_participant_id is null
      and engagement_location_id is null
      and engagement_office_id is null
    )
    or
    (
      engagement_participant_id is not null
      and company_location_id is null
      and company_location_office_id is null
      and (engagement_location_id is not null or engagement_office_id is null)
    )
  );

create or replace function core.validate_itf_workforce_assignment()
returns trigger
language plpgsql
set search_path = 'core', 'public'
as $$
declare
  v_participant_company_id uuid;
  v_engagement_id uuid;
  v_principal_company_id uuid;
  v_reports_to_company_id uuid;
begin
  if not exists (
    select 1 from core.company_roster roster
    where roster.id = new.roster_id and roster.company_id = new.roster_company_id
  ) then
    raise exception 'The ITF assignment must retain company roster ownership.';
  end if;

  if new.engagement_participant_id is null then
    if new.company_location_id is not null and not exists (
      select 1 from core.company_location location
      where location.id = new.company_location_id and location.company_id = new.roster_company_id
    ) then
      raise exception 'A direct assignment location must belong to the roster company.';
    end if;
    if new.company_location_office_id is not null and not exists (
      select 1 from core.company_location_office office
      where office.id = new.company_location_office_id
        and office.company_location_id = new.company_location_id
    ) then
      raise exception 'A direct assignment office must belong to the selected location.';
    end if;
  else
    select participant.company_id, participant.engagement_id, relationship.principal_company_id
    into v_participant_company_id, v_engagement_id, v_principal_company_id
    from core.company_engagement_participant participant
    join core.company_engagement engagement on engagement.id = participant.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    where participant.id = new.engagement_participant_id;

    if v_participant_company_id is distinct from new.roster_company_id then
      raise exception 'The relationship participant must own the roster member.';
    end if;
    if new.engagement_location_id is not null and not exists (
      select 1 from core.company_engagement_location location
      where location.id = new.engagement_location_id and location.engagement_id = v_engagement_id
    ) then
      raise exception 'The relationship location is not part of this engagement.';
    end if;
    if new.engagement_office_id is not null and not exists (
      select 1 from core.company_engagement_office office
      where office.id = new.engagement_office_id
        and office.engagement_location_id = new.engagement_location_id
    ) then
      raise exception 'The relationship office is not part of this location.';
    end if;
  end if;

  if new.reports_to_roster_id is not null then
    select roster.company_id into v_reports_to_company_id
    from core.company_roster roster where roster.id = new.reports_to_roster_id;
    if v_reports_to_company_id is distinct from new.roster_company_id
       and (new.engagement_participant_id is null or v_reports_to_company_id is distinct from v_principal_company_id) then
      raise exception 'Reports to must be a leader in the roster company or the engagement principal.';
    end if;
  end if;
  return new;
end;
$$;

create temporary table itf_provider_roster_source (
  source_record_id text primary key,
  company text not null,
  full_name text not null,
  email text,
  phone text,
  tech_id text,
  fuse_emp_id text,
  nt_login text,
  csg text,
  epon text,
  position_title text not null,
  worker_type text not null,
  seat_type text not null,
  location_code text,
  office_name text,
  source_location_codes text[] not null,
  source_office_names text[] not null,
  effective_start date not null,
  effective_date_basis text not null,
  source_person_id uuid,
  source_assignment_id uuid,
  source_person_ids text[] not null,
  source_assignment_ids text[] not null,
  reports_to_source_person_id uuid,
  reports_to_name text,
  source_files text[] not null,
  source_rows integer[] not null,
  target_company_id uuid,
  target_engagement_id uuid,
  target_participant_id uuid,
  target_roster_id uuid
) on commit drop;

insert into itf_provider_roster_source (
  source_record_id, company, full_name, email, phone, tech_id, fuse_emp_id,
  nt_login, csg, epon, position_title, worker_type, seat_type, location_code,
  office_name, source_location_codes, source_office_names, effective_start,
  effective_date_basis, source_person_id, source_assignment_id,
  source_person_ids, source_assignment_ids, reports_to_source_person_id,
  reports_to_name, source_files, source_rows
)
select *
from jsonb_to_recordset($itf_seed$[{"source_record_id":"roster-export:brunderground:4899-002","company":"BR Underground","full_name":"Fousto Morataya","email":null,"phone":null,"tech_id":"4899-002","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Drop Bury","worker_type":"TECH","seat_type":"DROP_BURY","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[23]},{"source_record_id":"roster-export:brunderground:4899-003","company":"BR Underground","full_name":"Luis Morataya","email":null,"phone":null,"tech_id":"4899-003","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Drop Bury","worker_type":"TECH","seat_type":"DROP_BURY","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[41]},{"source_record_id":"donor-person:432ae458-35f6-4988-893b-55523d3d31b8","company":"BR Underground","full_name":"Marcelo Pereira","email":"marcelopereira@live.com","phone":"2038984505","tech_id":"4899","fuse_emp_id":"260011","nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"432ae458-35f6-4988-893b-55523d3d31b8","source_assignment_id":"32aafa8f-8333-4ce9-bce7-135a9fe8bd8d","source_person_ids":["432ae458-35f6-4988-893b-55523d3d31b8"],"source_assignment_ids":["32aafa8f-8333-4ce9-bce7-135a9fe8bd8d"],"reports_to_source_person_id":"4437678f-39c9-432c-bc41-7ac69ea2c1a4","reports_to_name":"Lucas Williams","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[42]},{"source_record_id":"roster-export:brunderground:4899-001","company":"BR Underground","full_name":"Rafael Araujo","email":null,"phone":null,"tech_id":"4899-001","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Drop Bury","worker_type":"TECH","seat_type":"DROP_BURY","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[58]},{"source_record_id":"roster-export:cablewarriors:olegmosienko","company":"Cable Warriors","full_name":"Oleg Mosienko","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[52]},{"source_record_id":"roster-export:cablewarriors:I0CD","company":"Cable Warriors","full_name":"Pierre Guillaume","email":null,"phone":null,"tech_id":"I0CD","fuse_emp_id":null,"nt_login":"bp-pguill276","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[57]},{"source_record_id":"roster-export:cablewarriors:I060","company":"Cable Warriors","full_name":"Willy Ilfrena","email":null,"phone":null,"tech_id":"I060","fuse_emp_id":null,"nt_login":"bp-wilfre110","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[71]},{"source_record_id":"roster-export:conex:alexcurrcheriu","company":"Conex","full_name":"Alex Currcheriu","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[5]},{"source_record_id":"roster-export:generalcable:I03F","company":"General Cable","full_name":"Batraz Zasseev","email":null,"phone":null,"tech_id":"I03F","fuse_emp_id":null,"nt_login":"bp-bzasse220","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[9]},{"source_record_id":"roster-export:generalcable:pavelpopov","company":"General Cable","full_name":"Pavel Popov","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[54]},{"source_record_id":"roster-export:generalcable:IOL6","company":"General Cable","full_name":"Petru Popov","email":null,"phone":null,"tech_id":"IOL6","fuse_emp_id":null,"nt_login":"bp-ppopov155","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[56]},{"source_record_id":"roster-export:generalcable:IH98","company":"General Cable","full_name":"Sergei Pliev","email":null,"phone":null,"tech_id":"IH98","fuse_emp_id":null,"nt_login":"bp-spliev020","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[62]},{"source_record_id":"donor-person:6454085a-9b79-4040-b1cd-9dce7d91e515","company":"Grand Trade","full_name":"Anton Platonov","email":"Anton.platonov@gmail.com","phone":"2673348887","tech_id":"7003","fuse_emp_id":"295000","nt_login":"bp-aplato050","csg":"APA2257","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"6454085a-9b79-4040-b1cd-9dce7d91e515","source_assignment_id":"19600dec-0785-47d6-b776-5d604886ff83","source_person_ids":["6454085a-9b79-4040-b1cd-9dce7d91e515"],"source_assignment_ids":["19600dec-0785-47d6-b776-5d604886ff83"],"reports_to_source_person_id":"0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","reports_to_name":"Vasyl Yanovskyi","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[4]},{"source_record_id":"roster-export:grandtrade:I0KJ","company":"Grand Trade","full_name":"Denys Turchyniak","email":null,"phone":null,"tech_id":"I0KJ","fuse_emp_id":null,"nt_login":"bp-dturch733","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[23]},{"source_record_id":"roster-export:grandtrade:I0KQ","company":"Grand Trade","full_name":"Dmytro Koshkin","email":null,"phone":null,"tech_id":"I0KQ","fuse_emp_id":null,"nt_login":"bp-dkoshk587","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[27]},{"source_record_id":"donor-person:6b5570b2-3d71-4ae5-8acd-dc288567bd94","company":"Grand Trade","full_name":"Eduard Tishchenko","email":"mr.teisintai@gmail.com","phone":"5513447164","tech_id":"7095","fuse_emp_id":"232811","nt_login":"bp-etishc825","csg":"ETIS4170","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"6b5570b2-3d71-4ae5-8acd-dc288567bd94","source_assignment_id":"18cac93e-c766-4021-b81d-2557345e8144","source_person_ids":["6b5570b2-3d71-4ae5-8acd-dc288567bd94"],"source_assignment_ids":["18cac93e-c766-4021-b81d-2557345e8144"],"reports_to_source_person_id":"0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","reports_to_name":"Vasyl Yanovskyi","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[31]},{"source_record_id":"donor-person:4b791121-80e1-4cd0-9427-1301dc5ee1eb","company":"Grand Trade","full_name":"Taras Milian","email":"miltar89@gmail.com","phone":"7324336557","tech_id":"7036","fuse_emp_id":"223229","nt_login":"bp-tmilia251","csg":"TMIL6018","epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"4b791121-80e1-4cd0-9427-1301dc5ee1eb","source_assignment_id":"ae9f4438-e10a-45d4-9fea-ef9861c5c8f2","source_person_ids":["4b791121-80e1-4cd0-9427-1301dc5ee1eb"],"source_assignment_ids":["ae9f4438-e10a-45d4-9fea-ef9861c5c8f2"],"reports_to_source_person_id":"0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","reports_to_name":"Vasyl Yanovskyi","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[70]},{"source_record_id":"donor-person:0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","company":"Grand Trade","full_name":"Vasyl Yanovskyi","email":"V.Yanovskyi@gtcable.net","phone":"3134045217","tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","source_assignment_id":"7503f83c-0d26-4404-8cba-935b37de2a4e","source_person_ids":["0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a"],"source_assignment_ids":["7503f83c-0d26-4404-8cba-935b37de2a4e"],"reports_to_source_person_id":"90161d56-4e77-4849-a1de-d3d7416cc037","reports_to_name":"Nakash Llewellyn","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[73]},{"source_record_id":"roster-export:grandtrade:yevheniisots","company":"Grand Trade","full_name":"Yevhenii Sots","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[76]},{"source_record_id":"donor-person:c04d6188-4ee9-4c2c-87de-44b3c1eab1f2","company":"Grand Trade","full_name":"Zhamil Seidaliev","email":"seidalievjamil781@gmail.com","phone":"6095155018","tech_id":"7081","fuse_emp_id":"219117","nt_login":"bp-zseida627","csg":"ZSEi8034","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"c04d6188-4ee9-4c2c-87de-44b3c1eab1f2","source_assignment_id":"28bd31eb-91fe-457e-ae43-8e659e0f53f6","source_person_ids":["c04d6188-4ee9-4c2c-87de-44b3c1eab1f2"],"source_assignment_ids":["28bd31eb-91fe-457e-ae43-8e659e0f53f6"],"reports_to_source_person_id":"0d1dc0a7-f3ab-42c0-8147-da45ac49dd5a","reports_to_name":"Vasyl Yanovskyi","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[80]},{"source_record_id":"roster-export:hightekcontracting:I0HU","company":"HighTek Contracting","full_name":"Ashley Arnault","email":null,"phone":null,"tech_id":"I0HU","fuse_emp_id":null,"nt_login":"bp-aarnau607","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[7]},{"source_record_id":"donor-person:3b521834-174b-4985-9df2-9645bfa02bf8","company":"HighTek Contracting","full_name":"Daniel Gertsen","email":"Daniel.gertsen@aol.com","phone":"9086566694","tech_id":"7064","fuse_emp_id":"253548","nt_login":"bp-dgerts830","csg":"DGER6953","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"3b521834-174b-4985-9df2-9645bfa02bf8","source_assignment_id":"89e891ef-3f75-4fc3-9e5d-55c46688fd4c","source_person_ids":["3b521834-174b-4985-9df2-9645bfa02bf8"],"source_assignment_ids":["89e891ef-3f75-4fc3-9e5d-55c46688fd4c"],"reports_to_source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","reports_to_name":"Matthew Cassel","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[16]},{"source_record_id":"roster-export:hightekcontracting:I06S","company":"HighTek Contracting","full_name":"Daniel Yeboah","email":null,"phone":null,"tech_id":"I06S","fuse_emp_id":null,"nt_login":"bp-dyeboa832","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[17]},{"source_record_id":"roster-export:hightekcontracting:I0LV","company":"HighTek Contracting","full_name":"Darius World Dickens","email":null,"phone":null,"tech_id":"I0LV","fuse_emp_id":null,"nt_login":"bp-dworld765","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[18]},{"source_record_id":"donor-person:f5c92154-0e5a-47b9-ac5f-8323dd28e791","company":"HighTek Contracting","full_name":"David Pomponio","email":"Emmasdaddavid@gmail.com","phone":"7325690698","tech_id":"I08Q","fuse_emp_id":"2126974","nt_login":"bp-dpompo195","csg":"DPOM0685","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-03-23","effective_date_basis":"donor_assignment","source_person_id":"f5c92154-0e5a-47b9-ac5f-8323dd28e791","source_assignment_id":"0af7ea26-ad1a-4be7-ae85-24a05a96beea","source_person_ids":["f5c92154-0e5a-47b9-ac5f-8323dd28e791"],"source_assignment_ids":["0af7ea26-ad1a-4be7-ae85-24a05a96beea"],"reports_to_source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","reports_to_name":"Matthew Cassel","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[21]},{"source_record_id":"donor-person:48dad95f-9ec8-498d-8c61-0466002cccae","company":"HighTek Contracting","full_name":"Edward Sarbu","email":"e.sarbu@icloud.com","phone":"2672685067","tech_id":null,"fuse_emp_id":"223882","nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"48dad95f-9ec8-498d-8c61-0466002cccae","source_assignment_id":"ed3c233f-8bec-4f22-849b-a9cead2167e5","source_person_ids":["48dad95f-9ec8-498d-8c61-0466002cccae"],"source_assignment_ids":["ed3c233f-8bec-4f22-849b-a9cead2167e5"],"reports_to_source_person_id":"97e5e8c8-06c6-4313-b6e1-d44623c0019c","reports_to_name":"Lawrence J Scott Jr.","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[32]},{"source_record_id":"donor-person:b0a62c25-3457-4a97-9edc-7cb55703b25d","company":"HighTek Contracting","full_name":"Jaqwon Johnson","email":"jaqwontv@gmail.com","phone":"6096861541","tech_id":"7094","fuse_emp_id":"293646","nt_login":"bp-jjohns779","csg":"JJOH2213","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"b0a62c25-3457-4a97-9edc-7cb55703b25d","source_assignment_id":"b7019551-91f4-49a5-86a0-8679919c935c","source_person_ids":["b0a62c25-3457-4a97-9edc-7cb55703b25d"],"source_assignment_ids":["b7019551-91f4-49a5-86a0-8679919c935c"],"reports_to_source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","reports_to_name":"Matthew Cassel","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[43]},{"source_record_id":"donor-person:05ca1da5-ae13-4fb7-99d4-b9c9b99f8d2d","company":"HighTek Contracting","full_name":"Jean St Fleur","email":null,"phone":"7327990835","tech_id":"7004","fuse_emp_id":null,"nt_login":"bp-jstfle566","csg":"JSTF4384","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"05ca1da5-ae13-4fb7-99d4-b9c9b99f8d2d","source_assignment_id":"bc4196c5-444d-4aed-b3ce-d6a861c79735","source_person_ids":["05ca1da5-ae13-4fb7-99d4-b9c9b99f8d2d"],"source_assignment_ids":["bc4196c5-444d-4aed-b3ce-d6a861c79735"],"reports_to_source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","reports_to_name":"Matthew Cassel","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[44]},{"source_record_id":"roster-export:hightekcontracting:I0D7","company":"HighTek Contracting","full_name":"Jeffrey Latouche","email":null,"phone":null,"tech_id":"I0D7","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[45]},{"source_record_id":"donor-person:7e9fbd6e-1a19-4256-98b9-0a446e83db5d","company":"HighTek Contracting","full_name":"Matthew Cassel","email":"Mcassel609@gmail.com","phone":"6097051756","tech_id":null,"fuse_emp_id":"274711","nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","source_assignment_id":"1e885dbe-ad37-4d6b-86e7-69f91b5b37aa","source_person_ids":["7e9fbd6e-1a19-4256-98b9-0a446e83db5d"],"source_assignment_ids":["1e885dbe-ad37-4d6b-86e7-69f91b5b37aa"],"reports_to_source_person_id":"97e5e8c8-06c6-4313-b6e1-d44623c0019c","reports_to_name":"Lawrence J Scott Jr.","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[55]},{"source_record_id":"donor-person:f957c03f-a568-4c6e-a799-470c72c98dff","company":"HighTek Contracting","full_name":"Wil Parada","email":"Palex24@aol.com","phone":"2013788282","tech_id":"7012","fuse_emp_id":"280621","nt_login":"bp-wparad644","csg":"WPAR2175","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"f957c03f-a568-4c6e-a799-470c72c98dff","source_assignment_id":"9c48fb1f-ce8c-44e7-9190-19a4d8cb4589","source_person_ids":["f957c03f-a568-4c6e-a799-470c72c98dff"],"source_assignment_ids":["9c48fb1f-ce8c-44e7-9190-19a4d8cb4589"],"reports_to_source_person_id":"7e9fbd6e-1a19-4256-98b9-0a446e83db5d","reports_to_name":"Matthew Cassel","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[75]},{"source_record_id":"roster-export:jlunlimited:I0D1","company":"J&L Unlimited","full_name":"Abdulalim Omar El Marghani Tantoush","email":null,"phone":null,"tech_id":"I0D1","fuse_emp_id":null,"nt_login":"bp-aelmar354","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[2]},{"source_record_id":"donor-person:cbe9327b-b815-48ac-b53c-798675831c15","company":"J&L Unlimited","full_name":"Adriano Gil Collado","email":"agilco23@gmail.com","phone":"570-407-7372","tech_id":"4833","fuse_emp_id":"256761","nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"cbe9327b-b815-48ac-b53c-798675831c15","source_assignment_id":"b45a068e-9cbb-42ad-98ce-4ebc69084fd2","source_person_ids":["cbe9327b-b815-48ac-b53c-798675831c15"],"source_assignment_ids":["b45a068e-9cbb-42ad-98ce-4ebc69084fd2"],"reports_to_source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","reports_to_name":"Juan Tejeda","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[3]},{"source_record_id":"roster-export:jlunlimited:I0IW","company":"J&L Unlimited","full_name":"Edward Leonardo Espinal","email":null,"phone":null,"tech_id":"I0IW","fuse_emp_id":null,"nt_login":"bp-eespin156","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[17]},{"source_record_id":"donor-person:229c9f5b-f784-42dc-a788-a35cb6f4b2d9","company":"J&L Unlimited","full_name":"Jeisson Cabrerra Perez","email":null,"phone":"929-779-6391","tech_id":"4707","fuse_emp_id":null,"nt_login":"Bp-jcabre367","csg":"JCAB2020","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"229c9f5b-f784-42dc-a788-a35cb6f4b2d9","source_assignment_id":"0da62546-89e1-49a0-967c-630b248bf45a","source_person_ids":["229c9f5b-f784-42dc-a788-a35cb6f4b2d9"],"source_assignment_ids":["0da62546-89e1-49a0-967c-630b248bf45a"],"reports_to_source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","reports_to_name":"Juan Tejeda","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[28]},{"source_record_id":"roster-export:jlunlimited:I00D","company":"J&L Unlimited","full_name":"Joel David Hernandez Cabada","email":null,"phone":null,"tech_id":"I00D","fuse_emp_id":null,"nt_login":"bp-jherna467","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[29]},{"source_record_id":"donor-person:5e12eb68-a0b8-4bec-aa34-3337eff88f97","company":"J&L Unlimited","full_name":"Juan Tejeda","email":"Jlunlimitedcontractingllc@gmail.com","phone":"2727721656","tech_id":null,"fuse_emp_id":"267387","nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","source_assignment_id":"af8372e1-84c0-490e-bcf8-7b2fc1ad1b3e","source_person_ids":["5e12eb68-a0b8-4bec-aa34-3337eff88f97"],"source_assignment_ids":["af8372e1-84c0-490e-bcf8-7b2fc1ad1b3e"],"reports_to_source_person_id":"61d467c1-b028-4dca-b2a4-2eafb81eb11b","reports_to_name":"John Evans","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[33]},{"source_record_id":"donor-person:bc266a1b-f42f-4554-9b17-a04753c1aeed","company":"J&L Unlimited","full_name":"Kevin Mauricio Carias Guevara","email":"Kmcariasg@gmail.com","phone":"5709559138","tech_id":"4740","fuse_emp_id":"297494","nt_login":"bp-kcaria357","csg":"KCAR4746","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"bc266a1b-f42f-4554-9b17-a04753c1aeed","source_assignment_id":"eb3e2aec-3703-49c9-ac17-8a49e43c8cd8","source_person_ids":["bc266a1b-f42f-4554-9b17-a04753c1aeed"],"source_assignment_ids":["eb3e2aec-3703-49c9-ac17-8a49e43c8cd8"],"reports_to_source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","reports_to_name":"Juan Tejeda","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[34]},{"source_record_id":"donor-person:0cb612b0-6e52-4f30-9f68-46b116ed5929","company":"J&L Unlimited","full_name":"Marlon Isidro Perdomo Herasme","email":"Marlonp_17@hotmail.com","phone":"5708177855","tech_id":"4704","fuse_emp_id":"295467","nt_login":"bp-mperdo696","csg":"MPER3517","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"0cb612b0-6e52-4f30-9f68-46b116ed5929","source_assignment_id":"b0b87086-9188-4657-9fc9-53e365e79a1e","source_person_ids":["0cb612b0-6e52-4f30-9f68-46b116ed5929"],"source_assignment_ids":["b0b87086-9188-4657-9fc9-53e365e79a1e"],"reports_to_source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","reports_to_name":"Juan Tejeda","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[43]},{"source_record_id":"roster-export:jlunlimited:I0CY","company":"J&L Unlimited","full_name":"Mohamed Giumaa\tAbdulsalam Alswani","email":null,"phone":null,"tech_id":"I0CY","fuse_emp_id":null,"nt_login":"bp-mabdul660","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[49]},{"source_record_id":"donor-person:fe128bc0-df8f-423e-b7e1-070d3fc215cf","company":"J&L Unlimited","full_name":"Morel Guevara","email":null,"phone":"973-346-0621","tech_id":"4824","fuse_emp_id":null,"nt_login":"bp-mvalde069","csg":"MVAL7410","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"fe128bc0-df8f-423e-b7e1-070d3fc215cf","source_assignment_id":"3a9145d0-e373-42e9-ad83-86c1da2828ad","source_person_ids":["fe128bc0-df8f-423e-b7e1-070d3fc215cf"],"source_assignment_ids":["3a9145d0-e373-42e9-ad83-86c1da2828ad"],"reports_to_source_person_id":"5e12eb68-a0b8-4bec-aa34-3337eff88f97","reports_to_name":"Juan Tejeda","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[50]},{"source_record_id":"donor-person:5fb62d3a-7320-4830-8544-ec04e6faa488","company":"JComm","full_name":"Argenis I Duran Dittren","email":"argenisduran22@gmail.com","phone":"8624130844","tech_id":"7102","fuse_emp_id":"254792","nt_login":"bp-aduran034","csg":"ADUR5398","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"5fb62d3a-7320-4830-8544-ec04e6faa488","source_assignment_id":"aca249e9-393d-43f4-b40f-5a6524f86478","source_person_ids":["5fb62d3a-7320-4830-8544-ec04e6faa488"],"source_assignment_ids":["aca249e9-393d-43f4-b40f-5a6524f86478"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[5]},{"source_record_id":"donor-person:ebe4f19a-3b12-4cbb-9e82-163c73e69544","company":"JComm","full_name":"Byron Cerracchio Jr","email":"wasabiyaki@yahoo.com","phone":"6094126734","tech_id":"BP SUP","fuse_emp_id":"269618","nt_login":"bp-cerra364","csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","source_assignment_id":"42b3dbb7-5d39-40bd-9787-e3a9dc70d82e","source_person_ids":["ebe4f19a-3b12-4cbb-9e82-163c73e69544"],"source_assignment_ids":["42b3dbb7-5d39-40bd-9787-e3a9dc70d82e"],"reports_to_source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","reports_to_name":"Josh Blair","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[9]},{"source_record_id":"roster-export:jcomm:I0EG","company":"JComm","full_name":"Caleb Powell","email":null,"phone":null,"tech_id":"I0EG","fuse_emp_id":null,"nt_login":"bp-cpowel055","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[11]},{"source_record_id":"donor-person:29f27cda-15eb-4d85-862c-7e28348328c2","company":"JComm","full_name":"Dalkeith Smith","email":null,"phone":"8489864647","tech_id":"I08X","fuse_emp_id":null,"nt_login":"bp-dsmith295","csg":"DSMI1786","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-03-23","effective_date_basis":"donor_assignment","source_person_id":"29f27cda-15eb-4d85-862c-7e28348328c2","source_assignment_id":"aebe3b3e-a24a-4809-8e36-2896a6597aad","source_person_ids":["29f27cda-15eb-4d85-862c-7e28348328c2"],"source_assignment_ids":["aebe3b3e-a24a-4809-8e36-2896a6597aad"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[14]},{"source_record_id":"donor-person:6651b5dd-a9bc-4a07-a122-00cf8d6009bf","company":"JComm","full_name":"Dennis Shotwell","email":"azbadboyz@hotmail.com","phone":"6026965875","tech_id":"7077","fuse_emp_id":"275356","nt_login":"bp-dshot830","csg":"DSHO0769","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"6651b5dd-a9bc-4a07-a122-00cf8d6009bf","source_assignment_id":"5a2a5006-2675-47ad-ad81-cc500276a048","source_person_ids":["6651b5dd-a9bc-4a07-a122-00cf8d6009bf"],"source_assignment_ids":["5a2a5006-2675-47ad-ad81-cc500276a048"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[22]},{"source_record_id":"donor-person:f3167974-71e6-48e5-9fb7-6d54f5969fce","company":"JComm","full_name":"Dilshod Maksudov","email":"mrdilik@gmail.com","phone":"8562787155","tech_id":"7006","fuse_emp_id":"230253","nt_login":"bp-dmaksu513","csg":"DMAK0723","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"f3167974-71e6-48e5-9fb7-6d54f5969fce","source_assignment_id":"f23eabef-89b1-49fd-a236-1b14b5fec903","source_person_ids":["f3167974-71e6-48e5-9fb7-6d54f5969fce"],"source_assignment_ids":["f23eabef-89b1-49fd-a236-1b14b5fec903"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[26]},{"source_record_id":"donor-person:41545bcf-6d92-4022-95d0-9bb515b63d6f","company":"JComm","full_name":"Dmytro Nazarenko","email":"contact@blackhearts-club.com","phone":"6464742003","tech_id":"7080","fuse_emp_id":"243157","nt_login":"bp-dnazar543","csg":"DNAZ0958","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"41545bcf-6d92-4022-95d0-9bb515b63d6f","source_assignment_id":"49f8be5d-c677-45c1-a759-76e16d776f19","source_person_ids":["41545bcf-6d92-4022-95d0-9bb515b63d6f"],"source_assignment_ids":["49f8be5d-c677-45c1-a759-76e16d776f19"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[28]},{"source_record_id":"roster-export:jcomm:I0O3","company":"JComm","full_name":"Eden Louis","email":null,"phone":null,"tech_id":"I0O3","fuse_emp_id":null,"nt_login":"bp-elouis165","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[29]},{"source_record_id":"donor-person:9afd2ebb-b5e7-4a46-b9aa-c842801b0c48","company":"JComm","full_name":"Ernso Bedard","email":"ernsobedard@gmail.com","phone":"8162887953","tech_id":"4882","fuse_emp_id":"220959","nt_login":"Bp-ebedar179","csg":"EBED2479","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"9afd2ebb-b5e7-4a46-b9aa-c842801b0c48","source_assignment_id":"db2066d9-8fd8-4dd0-8c33-2582626125cd","source_person_ids":["9afd2ebb-b5e7-4a46-b9aa-c842801b0c48"],"source_assignment_ids":["db2066d9-8fd8-4dd0-8c33-2582626125cd"],"reports_to_source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","reports_to_name":"Josh Blair","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[19]},{"source_record_id":"donor-person:f60c9b10-46b6-4c5a-8f35-66685528df77","company":"JComm","full_name":"Fouad Belrhazi","email":"fouad_7-77@hotmail.com","phone":"8049222596","tech_id":"4888","fuse_emp_id":"203396","nt_login":"Bp-fbelrh967","csg":"FBEL8288","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"f60c9b10-46b6-4c5a-8f35-66685528df77","source_assignment_id":"15fee89b-8ce9-4d9d-a1fa-8f53465062fc","source_person_ids":["f60c9b10-46b6-4c5a-8f35-66685528df77"],"source_assignment_ids":["15fee89b-8ce9-4d9d-a1fa-8f53465062fc"],"reports_to_source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","reports_to_name":"Josh Blair","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[22]},{"source_record_id":"donor-person:8086cbc7-a6b0-4ab8-afbf-7999d5b75f15","company":"JComm","full_name":"Ilya Kaiden","email":"kaidin2320@gmail.com","phone":"7327371636","tech_id":"I06I","fuse_emp_id":"287219","nt_login":"bp-ikaidi586","csg":"IKAI7600","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-03-16","effective_date_basis":"donor_assignment","source_person_id":"8086cbc7-a6b0-4ab8-afbf-7999d5b75f15","source_assignment_id":"614103af-2d69-4971-b622-ee77aadef5f5","source_person_ids":["8086cbc7-a6b0-4ab8-afbf-7999d5b75f15"],"source_assignment_ids":["614103af-2d69-4971-b622-ee77aadef5f5"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[39]},{"source_record_id":"donor-person:bd11193a-33c7-4b55-9969-569b16eb2d1b","company":"JComm","full_name":"Josh Blair","email":"joshua.blair@jcommllc.com","phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":null,"office_name":null,"source_location_codes":["410","427"],"source_office_names":["Egg Harbor","Harrisburg"],"effective_start":"2026-05-09","effective_date_basis":"donor_assignment","source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","source_assignment_id":null,"source_person_ids":["bd11193a-33c7-4b55-9969-569b16eb2d1b"],"source_assignment_ids":["1e3a6fa1-785d-40e0-a6b1-d98f98bcbd69","35b98efb-c4cb-451c-8489-abdd74e98ed9"],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv","Roster Export - freedom - august-2026.csv"],"source_rows":[32,47]},{"source_record_id":"roster-export:jcomm:ID70","company":"JComm","full_name":"Mikhail Rusanov","email":null,"phone":null,"tech_id":"ID70","fuse_emp_id":null,"nt_login":"bp-mrusan004","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[59]},{"source_record_id":"donor-person:383d2815-f38f-4877-9dc8-5fa9d6c4d0f8","company":"JComm","full_name":"Nathan Staples","email":"nathancstaples86@gmail.com","phone":"6823908984","tech_id":"IE49","fuse_emp_id":"271282","nt_login":"Bp-nstapl301","csg":"NSTA4344","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-04-06","effective_date_basis":"donor_assignment","source_person_id":"383d2815-f38f-4877-9dc8-5fa9d6c4d0f8","source_assignment_id":"2024b93f-288d-45f6-a20c-6be4815b9535","source_person_ids":["383d2815-f38f-4877-9dc8-5fa9d6c4d0f8"],"source_assignment_ids":["2024b93f-288d-45f6-a20c-6be4815b9535"],"reports_to_source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","reports_to_name":"Josh Blair","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[51]},{"source_record_id":"donor-person:27c0e718-191c-4fb0-9d25-becda5efdb23","company":"JComm","full_name":"Oleksandr Iots","email":"alexiots182@gmail.com","phone":"8484695779","tech_id":"7122","fuse_emp_id":"201127","nt_login":"bp-oiots330","csg":"OIOT6403","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"27c0e718-191c-4fb0-9d25-becda5efdb23","source_assignment_id":"de4f7b3a-e800-48d9-bb08-4b965c13dd3f","source_person_ids":["27c0e718-191c-4fb0-9d25-becda5efdb23"],"source_assignment_ids":["de4f7b3a-e800-48d9-bb08-4b965c13dd3f"],"reports_to_source_person_id":"90161d56-4e77-4849-a1de-d3d7416cc037","reports_to_name":"Nakash Llewellyn","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[64]},{"source_record_id":"donor-person:7e6c8ad7-569e-4412-9b39-cd3be56c4eed","company":"JComm","full_name":"Robert Markley III","email":"markley67123@gmail.com","phone":"6098646534","tech_id":"7034","fuse_emp_id":"244491","nt_login":"bp-rmarkl492","csg":"RMAR4065","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"7e6c8ad7-569e-4412-9b39-cd3be56c4eed","source_assignment_id":"3937d8ca-f09a-4621-ad14-34176bb52192","source_person_ids":["7e6c8ad7-569e-4412-9b39-cd3be56c4eed"],"source_assignment_ids":["3937d8ca-f09a-4621-ad14-34176bb52192"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[66]},{"source_record_id":"roster-export:jcomm:I0E3","company":"JComm","full_name":"Rodolfo Rodriguez","email":null,"phone":null,"tech_id":"I0E3","fuse_emp_id":null,"nt_login":"bp-rrodri107","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[67]},{"source_record_id":"donor-person:aa2e7fac-03d5-46be-805f-1f03242b9e6b","company":"JComm","full_name":"Victoritchy Hector","email":"Victoritchy@gmail.com","phone":"7177587418","tech_id":"IJ05","fuse_emp_id":"251277","nt_login":"Bp-vhecto236","csg":"HAUG8159","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-04-01","effective_date_basis":"donor_assignment","source_person_id":"aa2e7fac-03d5-46be-805f-1f03242b9e6b","source_assignment_id":"fcab60fd-b4e6-445e-93d1-c43e112029ce","source_person_ids":["aa2e7fac-03d5-46be-805f-1f03242b9e6b"],"source_assignment_ids":["fcab60fd-b4e6-445e-93d1-c43e112029ce"],"reports_to_source_person_id":"bd11193a-33c7-4b55-9969-569b16eb2d1b","reports_to_name":"Josh Blair","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[68]},{"source_record_id":"donor-person:76429d36-7f6d-4eb0-b046-51c84e542394","company":"JComm","full_name":"Yurii Dutkevych","email":"yuraw95@gmail.com","phone":"2013005508","tech_id":"IK01","fuse_emp_id":"289842","nt_login":"bp-ydutke235","csg":"YDUT5399","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-04-13","effective_date_basis":"donor_assignment","source_person_id":"76429d36-7f6d-4eb0-b046-51c84e542394","source_assignment_id":"350681b3-a764-464a-b8a4-fefcee51c1bf","source_person_ids":["76429d36-7f6d-4eb0-b046-51c84e542394"],"source_assignment_ids":["350681b3-a764-464a-b8a4-fefcee51c1bf"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[77]},{"source_record_id":"roster-export:jcomm:I0E7","company":"JComm","full_name":"Yves Martial Desir","email":null,"phone":null,"tech_id":"I0E7","fuse_emp_id":null,"nt_login":"bp-ydesir873","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[79]},{"source_record_id":"donor-person:b975b594-5738-4e1d-adf3-82d9f167f684","company":"JComm","full_name":"Zilvinas Merkevicius","email":"Zmpaintingcorp@gmail.com","phone":"7188772239","tech_id":"7026","fuse_emp_id":"247295","nt_login":"bp-zmerke208","csg":"ZMER7167","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"b975b594-5738-4e1d-adf3-82d9f167f684","source_assignment_id":"606b3458-ea5e-4431-b791-02c9a1526df7","source_person_ids":["b975b594-5738-4e1d-adf3-82d9f167f684"],"source_assignment_ids":["606b3458-ea5e-4431-b791-02c9a1526df7"],"reports_to_source_person_id":"ebe4f19a-3b12-4cbb-9e82-163c73e69544","reports_to_name":"Byron Cerracchio Jr","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[81]},{"source_record_id":"donor-person:51b16b5e-d5cf-401b-ba51-8891402d4385","company":"Leon Cable","full_name":"Artem Buzolin","email":null,"phone":"9294660217","tech_id":"7142","fuse_emp_id":"264616","nt_login":"bp-abuzol466","csg":"ABUZ4170","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"51b16b5e-d5cf-401b-ba51-8891402d4385","source_assignment_id":"9e75418d-ed0c-417c-999e-61c87cf92419","source_person_ids":["51b16b5e-d5cf-401b-ba51-8891402d4385"],"source_assignment_ids":["9e75418d-ed0c-417c-999e-61c87cf92419"],"reports_to_source_person_id":"9515449b-688e-4098-95e3-dbadfdc8f5c6","reports_to_name":"Egor Chechin","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[6]},{"source_record_id":"roster-export:leoncable:constantinnipomici","company":"Leon Cable","full_name":"Constantin Nipomici","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[13]},{"source_record_id":"donor-person:9515449b-688e-4098-95e3-dbadfdc8f5c6","company":"Leon Cable","full_name":"Egor Chechin","email":"egor@cableleon.com","phone":"9176605765","tech_id":null,"fuse_emp_id":"252626","nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"9515449b-688e-4098-95e3-dbadfdc8f5c6","source_assignment_id":"bd0ccc9c-e35f-4438-b0dc-f7d25e3ef114","source_person_ids":["9515449b-688e-4098-95e3-dbadfdc8f5c6"],"source_assignment_ids":["bd0ccc9c-e35f-4438-b0dc-f7d25e3ef114"],"reports_to_source_person_id":"90161d56-4e77-4849-a1de-d3d7416cc037","reports_to_name":"Nakash Llewellyn","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[33]},{"source_record_id":"donor-person:6b6a5ef2-9568-4089-af82-9db422b9c4ee","company":"Mold Cable","full_name":"Aleksandr Zozulia","email":"sashahhx@icloud.com","phone":"7869425907","tech_id":"4760","fuse_emp_id":"276650","nt_login":"bp-azozul386","csg":"AZOZ1767","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"6b6a5ef2-9568-4089-af82-9db422b9c4ee","source_assignment_id":"18beb5ee-f7e1-497c-91a9-6933ea3968c4","source_person_ids":["6b6a5ef2-9568-4089-af82-9db422b9c4ee"],"source_assignment_ids":["18beb5ee-f7e1-497c-91a9-6933ea3968c4"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[4]},{"source_record_id":"donor-person:4ff1f870-e2b2-4bc2-ab31-bb6dab02c708","company":"Mold Cable","full_name":"Andrei Iulin","email":"andreiyulin@gmail.com","phone":"4709078697","tech_id":"4722","fuse_emp_id":"248510","nt_login":"bp-aiulin937","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"4ff1f870-e2b2-4bc2-ab31-bb6dab02c708","source_assignment_id":"dcbc4352-e241-4b98-b603-fd0c28f73cd8","source_person_ids":["4ff1f870-e2b2-4bc2-ab31-bb6dab02c708"],"source_assignment_ids":["dcbc4352-e241-4b98-b603-fd0c28f73cd8"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[7]},{"source_record_id":"donor-person:a24ca7f6-bcef-43ee-9faa-2134bf51a652","company":"Mold Cable","full_name":"Khaled Swissy","email":null,"phone":null,"tech_id":"I08O","fuse_emp_id":null,"nt_login":"bp-kswiss155","csg":"KSWI1488","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-03-24","effective_date_basis":"donor_assignment","source_person_id":"a24ca7f6-bcef-43ee-9faa-2134bf51a652","source_assignment_id":"623c8f54-6b33-47b5-8bdc-3fa59c18de2f","source_person_ids":["a24ca7f6-bcef-43ee-9faa-2134bf51a652"],"source_assignment_ids":["623c8f54-6b33-47b5-8bdc-3fa59c18de2f"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[35]},{"source_record_id":"donor-person:68aa82ae-62e1-44f7-b10a-774864accc6c","company":"Mold Cable","full_name":"Oleksandr Danylenko","email":"danylenko86@gmail.com","phone":"4127589777","tech_id":"4828","fuse_emp_id":"299768","nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"68aa82ae-62e1-44f7-b10a-774864accc6c","source_assignment_id":"8bf37495-253e-4581-a92b-c0da56efc227","source_person_ids":["68aa82ae-62e1-44f7-b10a-774864accc6c"],"source_assignment_ids":["8bf37495-253e-4581-a92b-c0da56efc227"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[53]},{"source_record_id":"donor-person:f3d518f5-29b8-4715-a646-93b6492a985c","company":"Mold Cable","full_name":"Roman Furman","email":"Fur.roman@gmail.com","phone":"6465081008","tech_id":"4895","fuse_emp_id":"203591","nt_login":"Bp-rfurma843","csg":"RFUR5204","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"f3d518f5-29b8-4715-a646-93b6492a985c","source_assignment_id":"15468bbf-0a0a-450b-bfab-be751d2a2c6b","source_person_ids":["f3d518f5-29b8-4715-a646-93b6492a985c"],"source_assignment_ids":["15468bbf-0a0a-450b-bfab-be751d2a2c6b"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[61]},{"source_record_id":"donor-person:6079b156-6b26-47b5-ba6c-2db1ba15db61","company":"Mold Cable","full_name":"Sergiu Turcan","email":"sergiutu1978@gmail.com","phone":"4129303938","tech_id":"4840","fuse_emp_id":"208597","nt_login":"bp-sturca051","csg":"STUR7826","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"6079b156-6b26-47b5-ba6c-2db1ba15db61","source_assignment_id":"97de42da-f1d9-4973-af13-62c2869f0cb8","source_person_ids":["6079b156-6b26-47b5-ba6c-2db1ba15db61"],"source_assignment_ids":["97de42da-f1d9-4973-af13-62c2869f0cb8"],"reports_to_source_person_id":"377c2134-0f60-49e5-9f23-7a44e74f48f0","reports_to_name":"Vadim Sarbu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[63]},{"source_record_id":"roster-export:northcableusa:I0CM","company":"North Cable USA","full_name":"Vladyslav Vladov","email":null,"phone":null,"tech_id":"I0CM","fuse_emp_id":null,"nt_login":"bp-vvlado659","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[74]},{"source_record_id":"donor-person:d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516","company":"Regiistek","full_name":"Alex Ghenciu","email":"sghenciu@regiistek.com","phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516","source_assignment_id":"6b490a29-dbee-41eb-af66-b75cc9c2141e","source_person_ids":["d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516"],"source_assignment_ids":["6b490a29-dbee-41eb-af66-b75cc9c2141e"],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[6]},{"source_record_id":"donor-person:be04a37f-05b4-4ff0-8ed8-85851042a0a8","company":"Regiistek","full_name":"Dmytro Trokhaiev","email":"dima.forest@gmail.com","phone":"717-307-7982","tech_id":"4798","fuse_emp_id":"209229","nt_login":"Bp-dtrokh893","csg":"DTRO6033","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"be04a37f-05b4-4ff0-8ed8-85851042a0a8","source_assignment_id":"eec2c937-9ed0-4992-83dd-ddc0d33a97b0","source_person_ids":["be04a37f-05b4-4ff0-8ed8-85851042a0a8"],"source_assignment_ids":["eec2c937-9ed0-4992-83dd-ddc0d33a97b0"],"reports_to_source_person_id":"d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516","reports_to_name":"Alex Ghenciu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[16]},{"source_record_id":"donor-person:0214fe5c-f515-4846-a763-2eb50d00deab","company":"Regiistek","full_name":"Ivan Frolov","email":"frolvan@icloud.com","phone":"2233398980","tech_id":"I810","fuse_emp_id":"247650","nt_login":"Bp-ifrolo051","csg":"FRO6794","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"0214fe5c-f515-4846-a763-2eb50d00deab","source_assignment_id":"f17009e9-0262-4bae-aab0-1f7228de90bb","source_person_ids":["0214fe5c-f515-4846-a763-2eb50d00deab"],"source_assignment_ids":["f17009e9-0262-4bae-aab0-1f7228de90bb"],"reports_to_source_person_id":"d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516","reports_to_name":"Alex Ghenciu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[25]},{"source_record_id":"roster-export:regiistek:I0AZ","company":"Regiistek","full_name":"Sviatoslav Chernysh","email":null,"phone":null,"tech_id":"I0AZ","fuse_emp_id":null,"nt_login":"bp-schern816","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[64]},{"source_record_id":"donor-person:25605dce-6f15-470d-b51e-47993b535109","company":"Regiistek","full_name":"Yurii Zabula","email":"zabick1994@gmail.com","phone":"2232400379","tech_id":"IK63","fuse_emp_id":"206549","nt_login":"bp-yzabul300","csg":"YZAB1437","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"25605dce-6f15-470d-b51e-47993b535109","source_assignment_id":"1ae915d1-6958-4fbc-b9e4-dce7e70f8762","source_person_ids":["25605dce-6f15-470d-b51e-47993b535109"],"source_assignment_ids":["1ae915d1-6958-4fbc-b9e4-dce7e70f8762"],"reports_to_source_person_id":"d1b781ce-8e0b-4dbc-8ba0-06c3b9ac7516","reports_to_name":"Alex Ghenciu","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[72]},{"source_record_id":"roster-export:sigma:I672","company":"Sigma","full_name":"Fahad Aljafin","email":null,"phone":null,"tech_id":"I672","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[21]},{"source_record_id":"roster-export:sigma:loyeaelmussrati","company":"Sigma","full_name":"Loyea Elmussrati","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[39]},{"source_record_id":"roster-export:sigma:IC25","company":"Sigma","full_name":"Mohamed Abudabbus","email":null,"phone":null,"tech_id":"IC25","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[46]},{"source_record_id":"donor-person:7d8bdbdf-d561-4c45-b378-35ed9689208f","company":"Sigma","full_name":"Mohamed Alkhadashi","email":null,"phone":null,"tech_id":"IC36","fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-04-29","effective_date_basis":"donor_assignment","source_person_id":"7d8bdbdf-d561-4c45-b378-35ed9689208f","source_assignment_id":"cc0a0319-bfde-4e0b-a070-18b0532da43e","source_person_ids":["7d8bdbdf-d561-4c45-b378-35ed9689208f"],"source_assignment_ids":["cc0a0319-bfde-4e0b-a070-18b0532da43e"],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[47]},{"source_record_id":"donor-person:592a4aeb-d6aa-485d-9830-1054f9f5c295","company":"Sigma","full_name":"Mohamed Bayod","email":null,"phone":"310-309-0363","tech_id":"IC57","fuse_emp_id":null,"nt_login":"Bp-mbayod084","csg":"PSAM2346","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-04-29","effective_date_basis":"donor_assignment","source_person_id":"592a4aeb-d6aa-485d-9830-1054f9f5c295","source_assignment_id":"c1d93e6f-c785-4eca-9830-d0bc7a3cf81b","source_person_ids":["592a4aeb-d6aa-485d-9830-1054f9f5c295"],"source_assignment_ids":["c1d93e6f-c785-4eca-9830-d0bc7a3cf81b"],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[48]},{"source_record_id":"roster-export:smartcabletechllc:I0IL","company":"Smart Cable Tech LLC","full_name":"Damian Davis","email":null,"phone":null,"tech_id":"I0IL","fuse_emp_id":null,"nt_login":"bp-ddavis311","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[13]},{"source_record_id":"roster-export:smartcabletechllc:ivankikalov","company":"Smart Cable Tech LLC","full_name":"Ivan Kikalov","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[26]},{"source_record_id":"roster-export:smartcabletechllc:I0IX","company":"Smart Cable Tech LLC","full_name":"Vladyslav Smetaniuk","email":null,"phone":null,"tech_id":"I0IX","fuse_emp_id":null,"nt_login":"bp-vsmeta440","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[69]},{"source_record_id":"roster-export:stvictorservices:I0HW","company":"St. Victor Services","full_name":"Larony Estache","email":null,"phone":null,"tech_id":"I0HW","fuse_emp_id":null,"nt_login":"bp-lestac160","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[36]},{"source_record_id":"roster-export:stvictorservices:marsheatorres","company":"St. Victor Services","full_name":"Marshea Torres","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[44]},{"source_record_id":"roster-export:stvictorservices:I0LB","company":"St. Victor Services","full_name":"Rewens Antoine","email":null,"phone":null,"tech_id":"I0LB","fuse_emp_id":null,"nt_login":"bp-rantoi002","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"410","office_name":"Pittsburgh","source_location_codes":["410"],"source_office_names":["Pittsburgh"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[59]},{"source_record_id":"donor-person:ca4e4948-424d-489c-aae6-3ab12964d632","company":"Star Communications","full_name":"Dani Matias","email":"Danimatías.0618@gmail.com","phone":"5705829380","tech_id":"4874","fuse_emp_id":"248590","nt_login":"bp-dmatia045","csg":"DMAT7785","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"ca4e4948-424d-489c-aae6-3ab12964d632","source_assignment_id":"0f1872ca-1d1d-41f0-9bb0-c4eebb3bebc6","source_person_ids":["ca4e4948-424d-489c-aae6-3ab12964d632"],"source_assignment_ids":["0f1872ca-1d1d-41f0-9bb0-c4eebb3bebc6"],"reports_to_source_person_id":"ce2b7524-4f0a-4782-81c3-f1f28eff9655","reports_to_name":"Peter Ortiz","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[14]},{"source_record_id":"donor-person:1f1b4edd-fc0d-43d3-9d12-686b750f3e67","company":"Star Communications","full_name":"Enmanuel Duran","email":"wilkesbarre27@gmail.com","phone":"862-264-8276","tech_id":"4879","fuse_emp_id":"246645","nt_login":"bp-eduran045","csg":"EDUR3150","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"1f1b4edd-fc0d-43d3-9d12-686b750f3e67","source_assignment_id":"de0ed119-522c-4633-8982-da491a7a4cca","source_person_ids":["1f1b4edd-fc0d-43d3-9d12-686b750f3e67"],"source_assignment_ids":["de0ed119-522c-4633-8982-da491a7a4cca"],"reports_to_source_person_id":"ce2b7524-4f0a-4782-81c3-f1f28eff9655","reports_to_name":"Peter Ortiz","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[18]},{"source_record_id":"donor-person:3cef0d71-cec6-426c-9256-d07f9db64368","company":"Star Communications","full_name":"Estarlin Rosario","email":"estarlinrosario98@gmail.com","phone":"9175382964","tech_id":null,"fuse_emp_id":"203387","nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"3cef0d71-cec6-426c-9256-d07f9db64368","source_assignment_id":"008d373a-4d7e-4601-a3a3-efc83d10d445","source_person_ids":["3cef0d71-cec6-426c-9256-d07f9db64368"],"source_assignment_ids":["008d373a-4d7e-4601-a3a3-efc83d10d445"],"reports_to_source_person_id":"61d467c1-b028-4dca-b2a4-2eafb81eb11b","reports_to_name":"John Evans","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[20]},{"source_record_id":"donor-person:287cb8f4-58c2-40f2-96b9-1919fc21219d","company":"Star Communications","full_name":"Miguelson Valdez D Oleo","email":"miguelson1590@gmail.com","phone":"9733460621","tech_id":"4783","fuse_emp_id":"216835","nt_login":"bp-mvalde069","csg":"MVAL7410","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"287cb8f4-58c2-40f2-96b9-1919fc21219d","source_assignment_id":"bf89758b-2cc4-4e9c-a954-1f2ddc52f171","source_person_ids":["287cb8f4-58c2-40f2-96b9-1919fc21219d"],"source_assignment_ids":["bf89758b-2cc4-4e9c-a954-1f2ddc52f171"],"reports_to_source_person_id":"ce2b7524-4f0a-4782-81c3-f1f28eff9655","reports_to_name":"Peter Ortiz","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[45]},{"source_record_id":"donor-person:ce2b7524-4f0a-4782-81c3-f1f28eff9655","company":"Star Communications","full_name":"Peter Ortiz","email":"pitbullpete0330@gmail.com","phone":"5186056727","tech_id":"I04K","fuse_emp_id":"203606","nt_login":"Bp-portiz919","csg":"PORT9374","epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"FIELD","location_code":"410","office_name":"Scranton","source_location_codes":["410"],"source_office_names":["Scranton"],"effective_start":"2026-02-22","effective_date_basis":"donor_assignment","source_person_id":"ce2b7524-4f0a-4782-81c3-f1f28eff9655","source_assignment_id":"c25d1db4-dff3-49a2-b918-2b739b7627a9","source_person_ids":["ce2b7524-4f0a-4782-81c3-f1f28eff9655"],"source_assignment_ids":["c25d1db4-dff3-49a2-b918-2b739b7627a9"],"reports_to_source_person_id":"3cef0d71-cec6-426c-9256-d07f9db64368","reports_to_name":"Estarlin Rosario","source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[55]},{"source_record_id":"roster-export:terokarllc:I040","company":"Terokar LLC","full_name":"Igor Dosanov","email":null,"phone":null,"tech_id":"I040","fuse_emp_id":null,"nt_login":"bp-idosan253","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAVEL","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[24]},{"source_record_id":"roster-export:terokarllc:vadymmatsiiovskyi","company":"Terokar LLC","full_name":"Vadym Matsiiovskyi","email":null,"phone":null,"tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"LEADERSHIP","location_code":"410","office_name":"Harrisburg","source_location_codes":["410"],"source_office_names":["Harrisburg"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - keystone - august-2026.csv"],"source_rows":[67]},{"source_record_id":"roster-export:videoinstallationpros:I0N5","company":"Video Installation Pros","full_name":"Carlos Pallazhco","email":null,"phone":null,"tech_id":"I0N5","fuse_emp_id":null,"nt_login":"bp-cpalla898","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[10]},{"source_record_id":"donor-person:da983a5b-e511-4c5e-91ad-3075bc1ed418","company":"Video Installation Pros","full_name":"Humberto Bazurto","email":"vippros2015@gmail.com","phone":"8623730717","tech_id":"7109","fuse_emp_id":"251478","nt_login":"bp-hbazur766","csg":"HBAZ2602","epon":null,"position_title":"BP Owner","worker_type":"OWNER","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2025-12-22","effective_date_basis":"donor_assignment","source_person_id":"da983a5b-e511-4c5e-91ad-3075bc1ed418","source_assignment_id":"47a66540-075a-4afd-a1a6-5748a830e29e","source_person_ids":["da983a5b-e511-4c5e-91ad-3075bc1ed418"],"source_assignment_ids":["47a66540-075a-4afd-a1a6-5748a830e29e"],"reports_to_source_person_id":"f614ba58-f4b2-4528-a232-d070876fa77e","reports_to_name":"Fritz F Frage","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[37]},{"source_record_id":"donor-person:c413eafb-912e-4193-b885-defe7a1ad060","company":"Video Installation Pros","full_name":"Jorge Yupa","email":"yupajorge21@gmail.com","phone":"8623479411","tech_id":"7005","fuse_emp_id":"235948","nt_login":"bp-jyupa764","csg":"JYUP9319","epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-04-30","effective_date_basis":"donor_assignment","source_person_id":"c413eafb-912e-4193-b885-defe7a1ad060","source_assignment_id":"e3f09179-dc63-4dff-b4f6-2106be7bbfde","source_person_ids":["c413eafb-912e-4193-b885-defe7a1ad060"],"source_assignment_ids":["e3f09179-dc63-4dff-b4f6-2106be7bbfde"],"reports_to_source_person_id":"da983a5b-e511-4c5e-91ad-3075bc1ed418","reports_to_name":"Humberto Bazurto","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[46]},{"source_record_id":"roster-export:videoinstallationpros:I0KT","company":"Video Installation Pros","full_name":"Mario Martinez Romero","email":null,"phone":null,"tech_id":"I0KT","fuse_emp_id":null,"nt_login":"bp-mmarti755","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[54]},{"source_record_id":"roster-export:wifirenet:I0KU","company":"WIFIRENET","full_name":"Andrei Smirekhin","email":null,"phone":null,"tech_id":"I0KU","fuse_emp_id":null,"nt_login":"bp-asmire170","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[3]},{"source_record_id":"roster-export:wifirenet:I0O2","company":"WIFIRENET","full_name":"Aslan Kuroev","email":null,"phone":null,"tech_id":"I0O2","fuse_emp_id":null,"nt_login":"bp-akuroe818","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[8]},{"source_record_id":"roster-export:wifirenet:I0N3","company":"WIFIRENET","full_name":"Eduard Serna","email":null,"phone":null,"tech_id":"I0N3","fuse_emp_id":null,"nt_login":"bp-eserna362","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[30]},{"source_record_id":"roster-export:wifirenet:I0O1","company":"WIFIRENET","full_name":"Giorgi Gogishvili","email":null,"phone":null,"tech_id":"I0O1","fuse_emp_id":null,"nt_login":"bp-ggogis068","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[36]},{"source_record_id":"roster-export:wifirenet:I0KE","company":"WIFIRENET","full_name":"James Walker","email":null,"phone":null,"tech_id":"I0KE","fuse_emp_id":null,"nt_login":"bp-jwalke177","csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[42]},{"source_record_id":"roster-export:wifirenet:I0LW","company":"WIFIRENET","full_name":"Kanstantsin Piatsevich","email":null,"phone":null,"tech_id":"I0LW","fuse_emp_id":null,"nt_login":"bp-kpiats291","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[48]},{"source_record_id":"roster-export:wifirenet:I0O0","company":"WIFIRENET","full_name":"Michael Senderov","email":null,"phone":null,"tech_id":"I0O0","fuse_emp_id":null,"nt_login":"bp-msende815","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"TRAINING","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[58]},{"source_record_id":"roster-export:wifirenet:I0KS","company":"WIFIRENET","full_name":"Mikita Klyshevich","email":null,"phone":null,"tech_id":"I0KS","fuse_emp_id":null,"nt_login":"bp-mklysh864","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[60]},{"source_record_id":"donor-person:8a9cc770-6127-4719-8b38-ba44d83ec950","company":"WIFIRENET","full_name":"Mykyta Panchuk","email":"npancher@icloud.com","phone":"3472165200","tech_id":"I06Z","fuse_emp_id":"234948","nt_login":"bp-mpanch856","csg":null,"epon":null,"position_title":"Technician","worker_type":"TECH","seat_type":"FIELD","location_code":"427","office_name":"Egg Harbor","source_location_codes":["427"],"source_office_names":["Egg Harbor"],"effective_start":"2026-07-28","effective_date_basis":"donor_assignment","source_person_id":"8a9cc770-6127-4719-8b38-ba44d83ec950","source_assignment_id":"c59b7784-e094-46e9-a1cd-46e1ca530f89","source_person_ids":["8a9cc770-6127-4719-8b38-ba44d83ec950"],"source_assignment_ids":["c59b7784-e094-46e9-a1cd-46e1ca530f89"],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[61]},{"source_record_id":"roster-export:wifirenet:I0KY","company":"WIFIRENET","full_name":"Taras Kalishchuk","email":null,"phone":null,"tech_id":"I0KY","fuse_emp_id":null,"nt_login":"bp-tkalis256","csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-08-17","effective_date_basis":"commercial_seed_date","source_person_id":null,"source_assignment_id":null,"source_person_ids":[],"source_assignment_ids":[],"reports_to_source_person_id":null,"reports_to_name":null,"source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[69]},{"source_record_id":"donor-person:56aa4c54-ef4e-4177-923a-7be10f1885c9","company":"WYRI","full_name":"Yurri Hohots","email":"yurri.hohots@itgext.com","phone":"7032708338","tech_id":null,"fuse_emp_id":null,"nt_login":null,"csg":null,"epon":null,"position_title":"BP Supervisor","worker_type":"SUPERVISOR","seat_type":"LEADERSHIP","location_code":"427","office_name":"Edison","source_location_codes":["427"],"source_office_names":["Edison"],"effective_start":"2026-03-04","effective_date_basis":"donor_assignment","source_person_id":"56aa4c54-ef4e-4177-923a-7be10f1885c9","source_assignment_id":"7f24b2f6-9371-442a-957d-3657fcc11d71","source_person_ids":["56aa4c54-ef4e-4177-923a-7be10f1885c9"],"source_assignment_ids":["7f24b2f6-9371-442a-957d-3657fcc11d71"],"reports_to_source_person_id":"f614ba58-f4b2-4528-a232-d070876fa77e","reports_to_name":"Fritz F Frage","source_files":["Roster Export - freedom - august-2026.csv"],"source_rows":[78]}]$itf_seed$::jsonb) as source (
  source_record_id text,
  company text,
  full_name text,
  email text,
  phone text,
  tech_id text,
  fuse_emp_id text,
  nt_login text,
  csg text,
  epon text,
  position_title text,
  worker_type text,
  seat_type text,
  location_code text,
  office_name text,
  source_location_codes text[],
  source_office_names text[],
  effective_start date,
  effective_date_basis text,
  source_person_id uuid,
  source_assignment_id uuid,
  source_person_ids text[],
  source_assignment_ids text[],
  reports_to_source_person_id uuid,
  reports_to_name text,
  source_files text[],
  source_rows integer[]
);

do $$
begin
  if (select count(*) from itf_provider_roster_source) <> 110 then
    raise exception 'Expected 110 canonical service-provider people.';
  end if;
  if (select count(distinct company) from itf_provider_roster_source) <> 20 then
    raise exception 'Expected 20 service-provider companies.';
  end if;
  if exists (
    select tech_id from itf_provider_roster_source
    where tech_id is not null
    group by tech_id having count(*) > 1
  ) then
    raise exception 'The approved roster contains a duplicate Tech ID.';
  end if;
  if not exists (
    select 1 from core.companies
    where company_slug = 'integrated-tech-group' and company_status = 'active'
  ) then
    raise exception 'Integrated Tech Group is not available.';
  end if;
  if not exists (
    select 1 from core.profiles where is_platform_owner
  ) then
    raise exception 'A platform owner profile is required for provenance.';
  end if;
  if not exists (
    select 1 from ref.insight_products
    where product_key = 'insight-telecom-fulfillment'
  ) then
    raise exception 'The ITF product is not available.';
  end if;
  if exists (
    select 1
    from (select distinct company from itf_provider_roster_source) source
    left join core.companies company
      on lower(company.company_name) = lower(source.company)
     and company.company_status = 'active'
    where company.id is null
  ) then
    raise exception 'At least one service-provider company is missing.';
  end if;
  if exists (
    select 1
    from (select distinct company from itf_provider_roster_source) source
    join core.companies provider on lower(provider.company_name) = lower(source.company)
    cross join core.companies principal
    left join core.company_relationship relationship
      on relationship.principal_company_id = principal.id
     and relationship.provider_company_id = provider.id
     and relationship.relationship_kind = 'subcontractor'
    where principal.company_slug = 'integrated-tech-group'
      and relationship.id is null
  ) then
    raise exception 'At least one ITG service-provider relationship is missing.';
  end if;
  if exists (
    select 1
    from itf_provider_roster_source source
    cross join core.companies principal
    left join core.company_location location
      on location.company_id = principal.id
     and location.location_code = source.location_code
    left join core.company_location_office office
      on office.company_location_id = location.id
     and office.office_name = source.office_name
    where principal.company_slug = 'integrated-tech-group'
      and source.location_code is not null
      and (location.id is null or (source.office_name is not null and office.id is null))
  ) then
    raise exception 'At least one approved ITG location or office is missing.';
  end if;
end;
$$;

update itf_provider_roster_source source
set target_company_id = company.id
from core.companies company
where lower(company.company_name) = lower(source.company)
  and company.company_status = 'active';

with scope as (
  select target_company_id, min(effective_start) as starts_on
  from itf_provider_roster_source
  group by target_company_id
),
target as (
  select relationship.id as relationship_id, relationship.provider_company_id,
         industry.id as industry_id, lob.id as lob_id, scope.starts_on
  from scope
  join core.company_relationship relationship
    on relationship.provider_company_id = scope.target_company_id
  join core.companies principal
    on principal.id = relationship.principal_company_id
   and principal.company_slug = 'integrated-tech-group'
  join ref.industries industry on industry.industry_key = 'telecom-fulfillment'
  join ref.lines_of_business lob
    on lob.industry_id = industry.id and lob.lob_key = 'fulfillment'
  where relationship.relationship_kind = 'subcontractor'
)
insert into core.company_engagement (
  relationship_id, engagement_key, engagement_name, industry_id,
  line_of_business_id, engagement_status, starts_on, created_by_profile_id
)
select target.relationship_id, 'itg-telecom-fulfillment',
       'ITG Telecom Fulfillment', target.industry_id, target.lob_id,
       'draft', target.starts_on, actor.id
from target
cross join lateral (
  select profile.id
  from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
on conflict (relationship_id, engagement_key) do update
set engagement_name = excluded.engagement_name,
    industry_id = excluded.industry_id,
    line_of_business_id = excluded.line_of_business_id,
    starts_on = least(core.company_engagement.starts_on, excluded.starts_on),
    updated_at = now();

update itf_provider_roster_source source
set target_engagement_id = engagement.id
from core.company_engagement engagement
join core.company_relationship relationship on relationship.id = engagement.relationship_id
where relationship.provider_company_id = source.target_company_id
  and engagement.engagement_key = 'itg-telecom-fulfillment';

insert into core.company_engagement_participant (
  engagement_id, company_id, source_relationship_id, reporting_company_id,
  participant_kind, participant_status, starts_on
)
select distinct source.target_engagement_id, source.target_company_id,
       relationship.id, source.target_company_id, 'direct_provider', 'review',
       min(source.effective_start) over (partition by source.target_company_id)
from itf_provider_roster_source source
join core.company_engagement engagement on engagement.id = source.target_engagement_id
join core.company_relationship relationship on relationship.id = engagement.relationship_id
on conflict (engagement_id, company_id) do update
set starts_on = least(core.company_engagement_participant.starts_on, excluded.starts_on),
    updated_at = now();

update itf_provider_roster_source source
set target_participant_id = participant.id
from core.company_engagement_participant participant
where participant.engagement_id = source.target_engagement_id
  and participant.company_id = source.target_company_id;

with location_scope as (
  select distinct source.target_engagement_id, source.effective_start,
         unnest(source.source_location_codes) as location_code
  from itf_provider_roster_source source
),
collapsed as (
  select target_engagement_id, location_code, min(effective_start) as starts_on
  from location_scope
  group by target_engagement_id, location_code
)
insert into core.company_engagement_location (
  engagement_id, principal_company_location_id, location_status, starts_on
)
select collapsed.target_engagement_id, location.id, 'review', collapsed.starts_on
from collapsed
join core.company_engagement engagement on engagement.id = collapsed.target_engagement_id
join core.company_relationship relationship on relationship.id = engagement.relationship_id
join core.company_location location
  on location.company_id = relationship.principal_company_id
 and location.location_code = collapsed.location_code
on conflict (engagement_id, principal_company_location_id) do update
set starts_on = least(core.company_engagement_location.starts_on, excluded.starts_on),
    updated_at = now();

with office_scope as (
  select distinct source.target_engagement_id, source.location_code,
         source.office_name, source.effective_start
  from itf_provider_roster_source source
  where source.location_code is not null and source.office_name is not null
),
collapsed as (
  select target_engagement_id, location_code, office_name,
         min(effective_start) as starts_on
  from office_scope
  group by target_engagement_id, location_code, office_name
)
insert into core.company_engagement_office (
  engagement_location_id, principal_company_location_office_id,
  office_status, starts_on
)
select engagement_location.id, office.id, 'review', collapsed.starts_on
from collapsed
join core.company_engagement engagement on engagement.id = collapsed.target_engagement_id
join core.company_relationship relationship on relationship.id = engagement.relationship_id
join core.company_location location
  on location.company_id = relationship.principal_company_id
 and location.location_code = collapsed.location_code
join core.company_engagement_location engagement_location
  on engagement_location.engagement_id = collapsed.target_engagement_id
 and engagement_location.principal_company_location_id = location.id
join core.company_location_office office
  on office.company_location_id = location.id
 and office.office_name = collapsed.office_name
on conflict (engagement_location_id, principal_company_location_office_id) do update
set starts_on = least(core.company_engagement_office.starts_on, excluded.starts_on),
    updated_at = now();

update itf_provider_roster_source source
set target_roster_id = provenance.roster_id
from core.company_roster_entry_provenance provenance
where provenance.roster_owner_company_id = source.target_company_id
  and provenance.source_system = 'itg-roster-export'
  and provenance.source_record_id = source.source_record_id;

update itf_provider_roster_source
set target_roster_id = gen_random_uuid()
where target_roster_id is null;

insert into core.company_roster (
  id, company_id, full_name, email, phone, worker_type, job_title,
  employment_status, hire_date, invite_status, compliance_summary, notes,
  roster_record_kind, seat_type
)
select source.target_roster_id, source.target_company_id, source.full_name,
       source.email, source.phone, source.worker_type, source.position_title,
       'Active', source.effective_start, 'Not Invited', 'Missing',
       'ITG-sourced from the approved August 2026 410/427 roster export.',
       'INTERNAL', source.seat_type
from itf_provider_roster_source source
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    worker_type = excluded.worker_type,
    job_title = excluded.job_title,
    employment_status = excluded.employment_status,
    hire_date = excluded.hire_date,
    notes = excluded.notes,
    seat_type = excluded.seat_type;

insert into core.company_roster_entry_provenance (
  roster_id, roster_owner_company_id, entry_authority, entry_channel,
  entered_by_company_id, entered_by_profile_id, source_engagement_id,
  source_system, source_record_id
)
select source.target_roster_id, source.target_company_id,
       'principal_on_behalf', 'donor_migration', principal.id, actor.id,
       source.target_engagement_id, 'itg-roster-export', source.source_record_id
from itf_provider_roster_source source
cross join lateral (
  select company.id from core.companies company
  where company.company_slug = 'integrated-tech-group'
) principal
cross join lateral (
  select profile.id from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
on conflict (roster_id) do nothing;

insert into core.company_roster_identifier (
  roster_id, identifier_type, identifier_value
)
select source.target_roster_id, identifier.identifier_type, identifier.identifier_value
from itf_provider_roster_source source
cross join lateral (
  values
    ('tech_id'::text, nullif(btrim(coalesce(source.tech_id, '')), '')),
    ('fuse_emp_id'::text, nullif(btrim(coalesce(source.fuse_emp_id, '')), '')),
    ('nt_login'::text, nullif(btrim(coalesce(source.nt_login, '')), '')),
    ('csg'::text, nullif(btrim(coalesce(source.csg, '')), '')),
    ('legacy_person_id'::text, source.source_person_id::text),
    ('legacy_assignment_id'::text, source.source_assignment_id::text)
) identifier(identifier_type, identifier_value)
where identifier.identifier_value is not null
on conflict (roster_id, identifier_type) do update
set identifier_value = excluded.identifier_value;

-- Prefer the donor reporting edge when it resolves to either the provider's
-- roster or the ITG principal roster.
update core.company_roster child
set reports_to_roster_id = parent.id
from itf_provider_roster_source source
join core.company_roster_identifier parent_identifier
  on parent_identifier.identifier_type = 'legacy_person_id'
 and parent_identifier.identifier_value = source.reports_to_source_person_id::text
join core.company_roster parent on parent.id = parent_identifier.roster_id
cross join core.companies principal
where child.id = source.target_roster_id
  and source.reports_to_source_person_id is not null
  and principal.company_slug = 'integrated-tech-group'
  and parent.company_id in (source.target_company_id, principal.id)
  and child.reports_to_roster_id is distinct from parent.id;

-- New export-only technicians inherit a provider leader in the same ITG
-- location when one exists. This leaves genuinely unresolved structures visible
-- as unassigned instead of inventing a supervisor.
update core.company_roster child
set reports_to_roster_id = leader.target_roster_id
from itf_provider_roster_source source
join lateral (
  select candidate.target_roster_id
  from itf_provider_roster_source candidate
  where candidate.target_company_id = source.target_company_id
    and candidate.target_roster_id <> source.target_roster_id
    and candidate.seat_type = 'LEADERSHIP'
    and (candidate.location_code = source.location_code or candidate.location_code is null)
  order by
    case
      when candidate.position_title ilike '%supervisor%' then 1
      when candidate.position_title ilike '%manager%' then 2
      when candidate.position_title ilike '%owner%' then 3
      else 4
    end,
    candidate.full_name
  limit 1
) leader on true
where child.id = source.target_roster_id
  and source.worker_type = 'TECH'
  and child.reports_to_roster_id is null;

insert into core.company_roster_event (
  company_id, roster_id, event_category, event_type, event_detail,
  event_metadata, occurred_at, created_by_profile_id
)
select source.target_company_id, source.target_roster_id, 'system',
       'donor_roster_imported',
       'Service-provider roster record sourced by Integrated Tech Group.',
       jsonb_strip_nulls(jsonb_build_object(
         'source_system', 'itg-roster-export',
         'source_record_id', source.source_record_id,
         'sourced_by', 'Integrated Tech Group',
         'entry_authority', 'principal_on_behalf',
         'source_files', to_jsonb(source.source_files),
         'source_rows', to_jsonb(source.source_rows),
         'source_person_ids', to_jsonb(source.source_person_ids),
         'source_assignment_ids', to_jsonb(source.source_assignment_ids),
         'effective_date_basis', source.effective_date_basis,
         'effective_start', source.effective_start,
         'location_codes', to_jsonb(source.source_location_codes),
         'office_names', to_jsonb(source.source_office_names),
         'position_title', source.position_title,
         'seat_type', source.seat_type,
         'epon', source.epon,
         'reports_to_source_person_id', source.reports_to_source_person_id,
         'reports_to_name', source.reports_to_name
       )),
       now(), actor.id
from itf_provider_roster_source source
cross join lateral (
  select profile.id from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
where not exists (
  select 1 from core.company_roster_event event
  where event.roster_id = source.target_roster_id
    and event.event_type = 'donor_roster_imported'
    and event.event_metadata ->> 'source_record_id' = source.source_record_id
);

insert into core.itf_workforce_assignment (
  product_id, roster_id, roster_company_id, engagement_participant_id,
  engagement_location_id, engagement_office_id, job_title, seat_type,
  assignment_status, reports_to_roster_id, effective_start, source_channel,
  created_by_profile_id
)
select product.id, source.target_roster_id, source.target_company_id,
       source.target_participant_id, engagement_location.id, engagement_office.id,
       source.position_title, source.seat_type, 'active',
       roster.reports_to_roster_id, source.effective_start,
       'donor_migration', actor.id
from itf_provider_roster_source source
join core.company_roster roster on roster.id = source.target_roster_id
cross join ref.insight_products product
cross join lateral (
  select profile.id from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
left join core.company_engagement engagement on engagement.id = source.target_engagement_id
left join core.company_relationship relationship on relationship.id = engagement.relationship_id
left join core.company_location location
  on location.company_id = relationship.principal_company_id
 and location.location_code = source.location_code
left join core.company_engagement_location engagement_location
  on engagement_location.engagement_id = source.target_engagement_id
 and engagement_location.principal_company_location_id = location.id
left join core.company_location_office office
  on office.company_location_id = location.id
 and office.office_name = source.office_name
left join core.company_engagement_office engagement_office
  on engagement_office.engagement_location_id = engagement_location.id
 and engagement_office.principal_company_location_office_id = office.id
where product.product_key = 'insight-telecom-fulfillment'
  and not exists (
    select 1 from core.itf_workforce_assignment assignment
    where assignment.product_id = product.id
      and assignment.roster_id = source.target_roster_id
      and assignment.effective_end is null
  );

do $$
declare
  v_itg_id uuid;
  v_product_id uuid;
begin
  select id into v_itg_id
  from core.companies where company_slug = 'integrated-tech-group';
  select id into v_product_id
  from ref.insight_products where product_key = 'insight-telecom-fulfillment';

  if exists (
    select 1 from itf_provider_roster_source where target_roster_id is null
  ) then
    raise exception 'At least one source row has no target roster identity.';
  end if;
  if (
    select count(*)
    from itf_provider_roster_source source
    join core.company_roster_entry_provenance provenance
      on provenance.roster_id = source.target_roster_id
     and provenance.roster_owner_company_id = source.target_company_id
     and provenance.entry_authority = 'principal_on_behalf'
     and provenance.entered_by_company_id = v_itg_id
     and provenance.source_system = 'itg-roster-export'
  ) <> 110 then
    raise exception 'ITG provenance validation failed.';
  end if;
  if (
    select count(*)
    from itf_provider_roster_source source
    join core.itf_workforce_assignment assignment
      on assignment.product_id = v_product_id
     and assignment.roster_id = source.target_roster_id
     and assignment.effective_end is null
  ) <> 110 then
    raise exception 'ITF current assignment validation failed.';
  end if;
end;
$$;

commit;
