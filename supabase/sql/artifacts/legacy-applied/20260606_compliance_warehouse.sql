create table if not exists core.profile_document (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null,

  document_type text not null,

  file_name text not null,
  storage_path text not null,

  content_type text,
  file_size bigint,

  issue_date date,
  expiration_date date,

  uploaded_at timestamptz not null default now(),
  uploaded_by_profile_id uuid,

  verified_at timestamptz,
  verified_by_profile_id uuid,

  is_archived boolean not null default false
);

create table if not exists core.roster_compliance_requirement (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,

  compliance_item_type text not null,

  required boolean not null default true,
  expiration_required boolean not null default false,

  days_before_warning integer not null default 30,

  created_at timestamptz not null default now()
);

create table if not exists core.roster_compliance_status (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  roster_id uuid not null,

  compliance_item_type text not null,

  document_id uuid references core.profile_document(id),

  status text not null default 'MISSING',

  expires_on date,

  verified_by_profile_id uuid,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profile_document_profile
on core.profile_document(profile_id);

create index if not exists idx_roster_compliance_status_roster
on core.roster_compliance_status(roster_id);

create index if not exists idx_roster_compliance_status_company
on core.roster_compliance_status(company_id);

insert into core.roster_compliance_requirement (
  company_id,
  compliance_item_type,
  required,
  expiration_required,
  days_before_warning
)
select
  c.id,
  x.compliance_item_type,
  true,
  x.expiration_required,
  30
from core.companies c
cross join (
  values
    ('Driver License', true),
    ('DOT Medical Card', true),
    ('MVR', true),
    ('Drug Screen', true),
    ('Background Check', false),
    ('TSA Background Check', false),
    ('FedEx Badge', false),
    ('Safety Training', false),
    ('Contractor Agreement', false),
    ('Vehicle Insurance', true),
    ('Vehicle Registration', true),
    ('Georgia Employment Form', false)
) as x(compliance_item_type, expiration_required)
where not exists (
  select 1
  from core.roster_compliance_requirement r
  where r.company_id = c.id
    and r.compliance_item_type = x.compliance_item_type
);

