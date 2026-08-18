begin;

create temporary table itf_itg_leadership_source (
  source_person_id uuid primary key,
  source_assignment_id uuid,
  full_name text not null,
  email text,
  tech_id text,
  location_code text,
  office_name text,
  position_title text not null,
  worker_type text not null,
  reports_to_source_person_id uuid,
  reports_to_name text,
  additional_assignment_ids jsonb,
  target_roster_id uuid
) on commit drop;

insert into itf_itg_leadership_source (
  source_person_id,
  source_assignment_id,
  full_name,
  email,
  tech_id,
  location_code,
  office_name,
  position_title,
  worker_type,
  reports_to_source_person_id,
  reports_to_name,
  additional_assignment_ids
)
values
  (
    '4e2637bb-6c95-4144-b555-7f72f2d42861',
    'e7bf6081-59d5-4dd5-aa54-b697e6801c60',
    'Austin Lovejoy',
    'alovejoy@itgext.com',
    null,
    '410',
    'Harrisburg',
    'ITG Supervisor',
    'SUPERVISOR',
    '4437678f-39c9-432c-bc41-7ac69ea2c1a4',
    'Lucas Williams',
    '[]'::jsonb
  ),
  (
    '377c2134-0f60-49e5-9f23-7a44e74f48f0',
    'c09e91ff-1da3-4c17-ad47-a95552b70fff',
    'Vadim Sarbu',
    'vadim.sarbu@itgext.com',
    null,
    '410',
    'Pittsburgh',
    'ITG Supervisor',
    'SUPERVISOR',
    '4437678f-39c9-432c-bc41-7ac69ea2c1a4',
    'Lucas Williams',
    '[]'::jsonb
  ),
  (
    '147f270b-f2fd-4c8a-beca-f6926cc724c2',
    'b9a66888-3af9-4112-b888-9e6e50a36901',
    'Devin Brown',
    'devinsuzuki06@hotmail.com',
    'I0JY',
    '427',
    'Egg Harbor',
    'ITG Supervisor',
    'SUPPORT',
    '4b564a30-7b90-4a11-9461-bffdb8511933',
    'George Koelle',
    '[]'::jsonb
  ),
  (
    '27de48c4-d2b8-4152-b0ae-00dc13b33813',
    '95974edc-e8d0-4ab0-b367-d902c389b14d',
    'Les Beus',
    'leslie.beus@itgcomm.com',
    null,
    null,
    null,
    'Director',
    'DIRECTOR',
    null,
    null,
    '["95974edc-e8d0-4ab0-b367-d902c389b14d", "cbc343df-b503-4c7a-9d80-eb99ba2cdf7f"]'::jsonb
  );

do $$
declare
  v_company_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = 'integrated-tech-group'
    and company.company_status = 'active';

  if v_company_id is null then
    raise exception 'Integrated Tech Group company foundation is missing.';
  end if;

  if (select count(*) from itf_itg_leadership_source) <> 4 then
    raise exception 'Expected four missing ITG leadership records.';
  end if;

  if (
    select count(*)
    from core.company_location_office office
    join core.company_location location on location.id = office.company_location_id
    where location.company_id = v_company_id
      and (location.location_code, office.office_name) in (
        ('410', 'Harrisburg'),
        ('410', 'Pittsburgh'),
        ('427', 'Egg Harbor')
      )
      and office.office_status = 'active'
  ) <> 3 then
    raise exception 'Required ITG offices must exist before leadership completion.';
  end if;
end;
$$;

update itf_itg_leadership_source source
set target_roster_id = coalesce(
  (
    select identifier.roster_id
    from core.company_roster_identifier identifier
    where identifier.identifier_type = 'legacy_person_id'
      and identifier.identifier_value = source.source_person_id::text
    limit 1
  ),
  gen_random_uuid()
);

insert into core.company_roster (
  id,
  company_id,
  profile_id,
  full_name,
  email,
  phone,
  worker_type,
  job_title,
  employment_status,
  company_location_id,
  company_location_office_id,
  invite_status,
  compliance_summary,
  roster_record_kind
)
select
  source.target_roster_id,
  company.id,
  null,
  source.full_name,
  lower(source.email),
  null,
  source.worker_type,
  source.position_title,
  'Active',
  location.id,
  office.id,
  'Not Invited',
  'Missing',
  'INTERNAL'
from itf_itg_leadership_source source
cross join lateral (
  select company.id
  from core.companies company
  where company.company_slug = 'integrated-tech-group'
) company
left join core.company_location location
  on location.company_id = company.id
 and location.location_code = source.location_code
left join core.company_location_office office
  on office.company_location_id = location.id
 and office.office_name_normalized = lower(btrim(source.office_name))
on conflict (id) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  worker_type = excluded.worker_type,
  job_title = excluded.job_title,
  employment_status = excluded.employment_status,
  company_location_id = excluded.company_location_id,
  company_location_office_id = excluded.company_location_office_id,
  roster_record_kind = excluded.roster_record_kind;

insert into core.company_roster_entry_provenance (
  roster_id,
  roster_owner_company_id,
  entry_authority,
  entry_channel,
  entered_by_company_id,
  entered_by_profile_id,
  source_system,
  source_record_id
)
select
  source.target_roster_id,
  company.id,
  'owner_company',
  'donor_migration',
  company.id,
  actor.id,
  'itg-insight',
  source.source_person_id::text
from itf_itg_leadership_source source
cross join lateral (
  select company.id
  from core.companies company
  where company.company_slug = 'integrated-tech-group'
) company
cross join lateral (
  select profile.id
  from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
on conflict (roster_id) do nothing;

insert into core.company_roster_identifier (
  roster_id,
  identifier_type,
  identifier_value
)
select
  source.target_roster_id,
  identifier.identifier_type,
  identifier.identifier_value
from itf_itg_leadership_source source
cross join lateral (
  values
    ('tech_id'::text, nullif(btrim(coalesce(source.tech_id, '')), '')),
    ('legacy_person_id'::text, source.source_person_id::text),
    ('legacy_assignment_id'::text, source.source_assignment_id::text)
) identifier(identifier_type, identifier_value)
where identifier.identifier_value is not null
on conflict (roster_id, identifier_type) do update
set identifier_value = excluded.identifier_value;

insert into core.company_roster_event (
  company_id,
  roster_id,
  event_category,
  event_type,
  event_detail,
  event_metadata,
  occurred_at,
  created_by_profile_id
)
select
  company.id,
  source.target_roster_id,
  'system',
  'donor_roster_imported',
  'Missing ITG leadership record completed from the donor roster export.',
  jsonb_strip_nulls(jsonb_build_object(
    'source_system', 'itg-insight',
    'source_person_id', source.source_person_id,
    'source_assignment_id', source.source_assignment_id,
    'additional_assignment_ids', source.additional_assignment_ids,
    'location_code', source.location_code,
    'office_name', source.office_name,
    'position_title', source.position_title,
    'role_type', source.worker_type,
    'is_field', false,
    'is_leadership', true,
    'reports_to_source_person_id', source.reports_to_source_person_id,
    'reports_to_name', source.reports_to_name
  )),
  now(),
  actor.id
from itf_itg_leadership_source source
cross join lateral (
  select company.id
  from core.companies company
  where company.company_slug = 'integrated-tech-group'
) company
cross join lateral (
  select profile.id
  from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1
) actor
where not exists (
  select 1
  from core.company_roster_event event
  where event.roster_id = source.target_roster_id
    and event.event_type = 'donor_roster_imported'
);

-- Apply the known management chain across both existing and newly completed
-- rows. The source person IDs remain the stable donor identity seam.
with reporting_chain(child_source_person_id, parent_source_person_id) as (
  values
    ('4e2637bb-6c95-4144-b555-7f72f2d42861'::text, '4437678f-39c9-432c-bc41-7ac69ea2c1a4'::text),
    ('377c2134-0f60-49e5-9f23-7a44e74f48f0'::text, '4437678f-39c9-432c-bc41-7ac69ea2c1a4'::text),
    ('147f270b-f2fd-4c8a-beca-f6926cc724c2'::text, '4b564a30-7b90-4a11-9461-bffdb8511933'::text),
    ('4b564a30-7b90-4a11-9461-bffdb8511933'::text, '5caaec2e-b083-4714-b17e-f89701de3399'::text),
    ('4437678f-39c9-432c-bc41-7ac69ea2c1a4'::text, '5caaec2e-b083-4714-b17e-f89701de3399'::text),
    ('5caaec2e-b083-4714-b17e-f89701de3399'::text, '27de48c4-d2b8-4152-b0ae-00dc13b33813'::text)
), resolved as (
  select
    child.roster_id as child_roster_id,
    parent.roster_id as parent_roster_id
  from reporting_chain chain
  join core.company_roster_identifier child
    on child.identifier_type = 'legacy_person_id'
   and child.identifier_value = chain.child_source_person_id
  join core.company_roster_identifier parent
    on parent.identifier_type = 'legacy_person_id'
   and parent.identifier_value = chain.parent_source_person_id
)
update core.company_roster child
set reports_to_roster_id = resolved.parent_roster_id
from resolved
where child.id = resolved.child_roster_id
  and child.reports_to_roster_id is distinct from resolved.parent_roster_id;

do $$
declare
  v_company_id uuid;
  v_total integer;
  v_office_assigned integer;
  v_chain_count integer;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = 'integrated-tech-group';

  select count(*), count(*) filter (where roster.office_id is not null)
  into v_total, v_office_assigned
  from public.itf_company_roster_v roster
  where roster.company_id = v_company_id;

  if v_total <> 42 or v_office_assigned <> 39 then
    raise exception 'ITG leadership completion parity failed: total %, office-assigned %.',
      v_total, v_office_assigned;
  end if;

  select count(*)
  into v_chain_count
  from public.itf_company_roster_v roster
  where roster.company_id = v_company_id
    and (roster.full_name, roster.reports_to_name) in (
      ('Austin Lovejoy', 'Lucas Williams'),
      ('Vadim Sarbu', 'Lucas Williams'),
      ('Devin Brown', 'George Koelle'),
      ('George Koelle', 'Ted Carlson'),
      ('Lucas Williams', 'Ted Carlson'),
      ('Ted Carlson', 'Les Beus')
    );

  if v_chain_count <> 6 then
    raise exception 'ITG reporting-chain completion failed: expected 6 links, found %.',
      v_chain_count;
  end if;

  if exists (
    select 1
    from public.itf_company_roster_v roster
    where roster.company_id = v_company_id
      and roster.full_name = 'Les Beus'
      and roster.reports_to_roster_id is not null
  ) then
    raise exception 'Les Beus must remain the top company leadership row.';
  end if;
end;
$$;

commit;
