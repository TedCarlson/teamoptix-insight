begin;

alter table core.company_roster
  add column if not exists seat_type text;

alter table core.company_roster
  drop constraint if exists company_roster_seat_type_ck;

alter table core.company_roster
  add constraint company_roster_seat_type_ck check (
    seat_type is null
    or seat_type in (
      'FIELD',
      'LEADERSHIP',
      'SUPPORT',
      'TRAVEL',
      'DROP_BURY',
      'TRAINING',
      'FMLA'
    )
  );

-- Seat is an operational assignment attribute. It is deliberately separate
-- from Position Title so records such as Devin Brown (ITG Supervisor / Support)
-- remain donor-authentic.
update core.company_roster roster
set seat_type = case
  when roster.worker_type = 'SUPPORT' then 'SUPPORT'
  when roster.job_title = 'Drop Bury' then 'DROP_BURY'
  when roster.job_title in (
    'BP Supervisor',
    'BP Lead',
    'BP Owner',
    'ITG Supervisor',
    'Project Manager',
    'Regional Manager',
    'Director',
    'VP',
    'Admin'
  ) then 'LEADERSHIP'
  else 'FIELD'
end
where roster.company_id = (
  select company.id
  from core.companies company
  where company.company_slug = 'integrated-tech-group'
);

-- The Freedom export places George at Egg Harbor. Ted and Les remain one
-- company-wide row each because duplicate location assignments do not create
-- duplicate people in the commercial roster.
update core.company_roster roster
set company_location_office_id = office.id
from core.company_roster_identifier identifier
join core.company_location location
  on location.location_code = '427'
join core.companies company
  on company.id = location.company_id
 and company.company_slug = 'integrated-tech-group'
join core.company_location_office office
  on office.company_location_id = location.id
 and office.office_name_normalized = 'egg harbor'
where roster.id = identifier.roster_id
  and identifier.identifier_type = 'legacy_person_id'
  and identifier.identifier_value = '4b564a30-7b90-4a11-9461-bffdb8511933'
  and roster.company_location_id = location.id;

create or replace view public.itf_company_roster_v
with (security_invoker = true)
as
select
  roster.id as roster_member_id,
  roster.company_id,
  company.company_name,
  company.company_slug,
  roster.profile_id,
  roster.full_name,
  roster.email,
  roster.phone,
  roster.worker_type,
  roster.job_title,
  roster.employment_status,
  roster.company_location_id,
  location.location_code,
  location.location_name,
  roster.reports_to_roster_id,
  supervisor.full_name as reports_to_name,
  identifiers.tech_id,
  identifiers.fuse_emp_id,
  identifiers.nt_login,
  identifiers.csg,
  identifiers.legacy_person_id,
  identifiers.legacy_assignment_id,
  import_event.event_metadata ->> 'office_name' as donor_office_name,
  provenance.entry_channel,
  provenance.source_system,
  provenance.source_record_id,
  case
    when provenance.entry_channel = 'donor_migration' then 'Donor import'
    when provenance.entered_by_company_id = roster.company_id then 'Company added'
    else 'Added on behalf'
  end as source_label,
  office.id as office_id,
  office.office_name,
  office.address as office_address,
  office.sub_region as office_sub_region,
  roster.seat_type
from core.company_roster roster
join core.companies company
  on company.id = roster.company_id
join core.company_product company_product
  on company_product.company_id = company.id
 and company_product.participation_status in ('active', 'review')
join ref.insight_products product
  on product.id = company_product.product_id
 and product.product_key = 'insight-telecom-fulfillment'
left join core.company_location location
  on location.id = roster.company_location_id
left join core.company_location_office office
  on office.id = roster.company_location_office_id
 and office.company_location_id = roster.company_location_id
left join core.company_roster supervisor
  on supervisor.id = roster.reports_to_roster_id
left join core.company_roster_entry_provenance provenance
  on provenance.roster_id = roster.id
left join lateral (
  select
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'tech_id') as tech_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'fuse_emp_id') as fuse_emp_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'nt_login') as nt_login,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'csg') as csg,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_person_id') as legacy_person_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_assignment_id') as legacy_assignment_id
  from core.company_roster_identifier identifier
  where identifier.roster_id = roster.id
) identifiers on true
left join lateral (
  select event.event_metadata
  from core.company_roster_event event
  where event.roster_id = roster.id
    and event.event_type = 'donor_roster_imported'
  order by event.occurred_at desc, event.created_at desc
  limit 1
) import_event on true;

comment on view public.itf_company_roster_v is
  'Company-authorized ITF roster projection composed from the platform roster, telecom identifiers, primary location, office, seat, reporting line, and provenance.';

revoke all on table public.itf_company_roster_v from public, anon;
grant select on table public.itf_company_roster_v to authenticated;

do $$
declare
  v_company_id uuid;
  v_field integer;
  v_leadership integer;
  v_support integer;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = 'integrated-tech-group';

  select
    count(*) filter (where roster.seat_type = 'FIELD'),
    count(*) filter (where roster.seat_type = 'LEADERSHIP'),
    count(*) filter (where roster.seat_type = 'SUPPORT')
  into v_field, v_leadership, v_support
  from public.itf_company_roster_v roster
  where roster.company_id = v_company_id;

  if v_field <> 29 or v_leadership <> 12 or v_support <> 1 then
    raise exception 'ITG seat parity failed: field %, leadership %, support %.',
      v_field, v_leadership, v_support;
  end if;

  if not exists (
    select 1
    from public.itf_company_roster_v roster
    where roster.company_id = v_company_id
      and roster.full_name = 'George Koelle'
      and roster.location_code = '427'
      and roster.office_name = 'Egg Harbor'
  ) then
    raise exception 'George Koelle must be assigned to the 427 Egg Harbor office.';
  end if;
end;
$$;

commit;
