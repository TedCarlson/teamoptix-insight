-- Migration Event 1: additive tenancy, relationship, entitlement, and delegation foundation.
--
-- This migration intentionally does not alter existing routes, access_context(), company grants,
-- Auth configuration, or donor data. Existing application behavior remains unchanged until a
-- later migration event explicitly adopts these tables.

create table if not exists ref.lines_of_business (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references ref.industries(id) on delete restrict,
  lob_key text not null,
  lob_label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lines_of_business_key_ck
    check (lob_key = lower(lob_key) and lob_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint lines_of_business_label_ck check (length(btrim(lob_label)) > 0),
  constraint lines_of_business_industry_key_uk unique (industry_id, lob_key),
  constraint lines_of_business_id_industry_uk unique (id, industry_id)
);

create table if not exists core.company_industry (
  company_id uuid not null references core.companies(id) on delete cascade,
  industry_id uuid not null references ref.industries(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  primary key (company_id, industry_id)
);

create unique index if not exists company_industry_one_primary_uk
  on core.company_industry (company_id)
  where is_primary;

create index if not exists company_industry_industry_idx
  on core.company_industry (industry_id, company_id);

create table if not exists core.company_line_of_business (
  company_id uuid not null references core.companies(id) on delete cascade,
  line_of_business_id uuid not null references ref.lines_of_business(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  primary key (company_id, line_of_business_id)
);

create unique index if not exists company_lob_one_primary_uk
  on core.company_line_of_business (company_id)
  where is_primary;

create index if not exists company_lob_lob_idx
  on core.company_line_of_business (line_of_business_id, company_id);

create table if not exists core.company_relationship (
  id uuid primary key default gen_random_uuid(),
  principal_company_id uuid not null references core.companies(id) on delete restrict,
  provider_company_id uuid not null references core.companies(id) on delete restrict,
  relationship_kind text not null default 'subcontractor',
  relationship_status text not null default 'proposed',
  is_exclusive boolean not null default false,
  starts_on date,
  ends_on date,
  invited_by_profile_id uuid references core.profiles(id) on delete set null,
  accepted_by_profile_id uuid references core.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_relationship_distinct_companies_ck
    check (principal_company_id <> provider_company_id),
  constraint company_relationship_kind_ck
    check (relationship_kind in ('subcontractor', 'customer', 'vendor', 'partner', 'managed_service')),
  constraint company_relationship_status_ck
    check (relationship_status in ('proposed', 'active', 'suspended', 'ended')),
  constraint company_relationship_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint company_relationship_acceptance_ck
    check (
      (accepted_at is null and accepted_by_profile_id is null)
      or (accepted_at is not null and accepted_by_profile_id is not null)
    ),
  constraint company_relationship_active_acceptance_ck
    check (relationship_status <> 'active' or accepted_at is not null)
);

create unique index if not exists company_relationship_open_uk
  on core.company_relationship (
    principal_company_id,
    provider_company_id,
    relationship_kind
  )
  where relationship_status in ('proposed', 'active', 'suspended');

create index if not exists company_relationship_principal_status_idx
  on core.company_relationship (principal_company_id, relationship_status);

create index if not exists company_relationship_provider_status_idx
  on core.company_relationship (provider_company_id, relationship_status);

create table if not exists core.company_engagement (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references core.company_relationship(id) on delete restrict,
  engagement_key text not null,
  engagement_name text not null,
  industry_id uuid not null references ref.industries(id) on delete restrict,
  line_of_business_id uuid not null,
  engagement_status text not null default 'draft',
  starts_on date,
  ends_on date,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_engagement_key_ck
    check (
      engagement_key = lower(engagement_key)
      and engagement_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  constraint company_engagement_name_ck check (length(btrim(engagement_name)) > 0),
  constraint company_engagement_status_ck
    check (engagement_status in ('draft', 'active', 'paused', 'ended')),
  constraint company_engagement_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint company_engagement_relationship_key_uk unique (relationship_id, engagement_key),
  constraint company_engagement_lob_industry_fk
    foreign key (line_of_business_id, industry_id)
    references ref.lines_of_business(id, industry_id)
    on delete restrict
);

create index if not exists company_engagement_relationship_status_idx
  on core.company_engagement (relationship_id, engagement_status);

create index if not exists company_engagement_industry_lob_idx
  on core.company_engagement (industry_id, line_of_business_id, engagement_status);

-- Immutable provenance for creation of a company-owned roster record. This is
-- separate from engagement assignment provenance because a worker can be added
-- once and later assigned to several clients.
create table if not exists core.company_roster_entry_provenance (
  roster_id uuid primary key references core.company_roster(id) on delete restrict,
  roster_owner_company_id uuid not null references core.companies(id) on delete restrict,
  entry_authority text not null,
  entry_channel text not null default 'manual',
  entered_by_company_id uuid not null references core.companies(id) on delete restrict,
  entered_by_profile_id uuid not null references core.profiles(id) on delete restrict,
  source_engagement_id uuid references core.company_engagement(id) on delete restrict,
  source_system text,
  source_record_id text,
  created_at timestamptz not null default now(),
  constraint company_roster_entry_authority_ck
    check (entry_authority in ('owner_company', 'principal_on_behalf')),
  constraint company_roster_entry_channel_ck
    check (entry_channel in ('manual', 'csv_import', 'donor_migration', 'api')),
  constraint company_roster_entry_authority_company_ck
    check (
      (entry_authority = 'owner_company' and entered_by_company_id = roster_owner_company_id)
      or (
        entry_authority = 'principal_on_behalf'
        and entered_by_company_id <> roster_owner_company_id
        and source_engagement_id is not null
      )
    ),
  constraint company_roster_entry_source_pair_ck
    check (
      (source_system is null and source_record_id is null)
      or (
        source_system is not null
        and source_record_id is not null
        and length(btrim(source_system)) > 0
        and length(btrim(source_record_id)) > 0
      )
    )
);

create unique index if not exists company_roster_entry_source_uk
  on core.company_roster_entry_provenance (source_system, source_record_id)
  where source_system is not null and source_record_id is not null;

create index if not exists company_roster_entry_owner_created_idx
  on core.company_roster_entry_provenance (roster_owner_company_id, created_at desc);

create index if not exists company_roster_entry_entered_by_created_idx
  on core.company_roster_entry_provenance (entered_by_company_id, created_at desc);

create or replace function core.validate_company_roster_entry_provenance()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_principal_company_id uuid;
  v_provider_company_id uuid;
begin
  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = new.roster_id
      and roster.company_id = new.roster_owner_company_id
  ) then
    raise exception 'Roster entry provenance must name the roster-owning company.';
  end if;

  if not exists (
    select 1
    from core.profiles profile
    where profile.id = new.entered_by_profile_id
      and (
        profile.is_platform_owner
        or exists (
          select 1
          from core.company_memberships membership
          where membership.company_id = new.entered_by_company_id
            and membership.profile_id = profile.id
            and membership.membership_status = 'active'
        )
      )
  ) then
    raise exception 'Roster entry actor must be an active member of the entering company.';
  end if;

  if new.source_engagement_id is not null then
    select
      relationship.principal_company_id,
      relationship.provider_company_id
    into
      v_principal_company_id,
      v_provider_company_id
    from core.company_engagement engagement
    join core.company_relationship relationship
      on relationship.id = engagement.relationship_id
    where engagement.id = new.source_engagement_id;

    if new.roster_owner_company_id not in (
      v_principal_company_id,
      v_provider_company_id
    ) then
      raise exception 'Roster owner must participate in the source engagement.';
    end if;
  end if;

  if new.entry_authority = 'principal_on_behalf' and not (
    new.entered_by_company_id = v_principal_company_id
    and new.roster_owner_company_id = v_provider_company_id
  ) then
    raise exception 'On-behalf roster entry must flow from principal to provider.';
  end if;

  return new;
end;
$$;

create trigger validate_company_roster_entry_provenance_before_write
before insert or update on core.company_roster_entry_provenance
for each row execute function core.validate_company_roster_entry_provenance();

-- A contractor roster remains owned by the contractor company. This table is the
-- explicit, narrow projection of one roster member into one client engagement.
-- It does not grant either engagement party access to core.company_roster.
create table if not exists core.engagement_roster_assignment (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references core.company_engagement(id) on delete restrict,
  roster_id uuid not null references core.company_roster(id) on delete restrict,
  roster_owner_company_id uuid not null references core.companies(id) on delete restrict,
  shared_display_name text not null,
  shared_role text,
  client_worker_reference text,
  assignment_status text not null default 'active',
  starts_on date,
  ends_on date,
  recorded_by_company_id uuid not null references core.companies(id) on delete restrict,
  recorded_by_profile_id uuid not null references core.profiles(id) on delete restrict,
  record_origin text not null default 'roster_owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_roster_assignment_display_name_ck
    check (length(btrim(shared_display_name)) > 0),
  constraint engagement_roster_assignment_status_ck
    check (assignment_status in ('proposed', 'active', 'paused', 'ended')),
  constraint engagement_roster_assignment_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint engagement_roster_assignment_origin_ck
    check (record_origin in ('roster_owner', 'principal_on_behalf')),
  constraint engagement_roster_assignment_origin_company_ck
    check (
      (record_origin = 'roster_owner' and recorded_by_company_id = roster_owner_company_id)
      or (record_origin = 'principal_on_behalf' and recorded_by_company_id <> roster_owner_company_id)
    )
);

create unique index if not exists engagement_roster_assignment_open_uk
  on core.engagement_roster_assignment (engagement_id, roster_id)
  where assignment_status in ('proposed', 'active', 'paused');

create unique index if not exists engagement_roster_assignment_client_reference_uk
  on core.engagement_roster_assignment (engagement_id, client_worker_reference)
  where client_worker_reference is not null
    and assignment_status in ('proposed', 'active', 'paused');

create index if not exists engagement_roster_assignment_owner_status_idx
  on core.engagement_roster_assignment (roster_owner_company_id, assignment_status);

create index if not exists engagement_roster_assignment_engagement_status_idx
  on core.engagement_roster_assignment (engagement_id, assignment_status);

create or replace function core.validate_engagement_roster_assignment()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_principal_company_id uuid;
  v_provider_company_id uuid;
begin
  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = new.roster_id
      and roster.company_id = new.roster_owner_company_id
  ) then
    raise exception 'Roster member must be owned by the declared roster company.';
  end if;

  select
    relationship.principal_company_id,
    relationship.provider_company_id
  into
    v_principal_company_id,
    v_provider_company_id
  from core.company_engagement engagement
  join core.company_relationship relationship
    on relationship.id = engagement.relationship_id
  where engagement.id = new.engagement_id;

  if new.roster_owner_company_id not in (
    v_principal_company_id,
    v_provider_company_id
  ) then
    raise exception 'Roster owner must participate in the engagement.';
  end if;

  if new.recorded_by_company_id not in (
    v_principal_company_id,
    v_provider_company_id
  ) then
    raise exception 'Recording company must participate in the engagement.';
  end if;

  if not exists (
    select 1
    from core.profiles profile
    where profile.id = new.recorded_by_profile_id
      and (
        profile.is_platform_owner
        or exists (
          select 1
          from core.company_memberships membership
          where membership.company_id = new.recorded_by_company_id
            and membership.profile_id = profile.id
            and membership.membership_status = 'active'
        )
      )
  ) then
    raise exception 'Recording profile must be an active member of the recording company.';
  end if;

  if new.record_origin = 'principal_on_behalf' and not (
    new.recorded_by_company_id = v_principal_company_id
    and new.roster_owner_company_id = v_provider_company_id
  ) then
    raise exception 'On-behalf roster loading must flow from principal to provider.';
  end if;

  return new;
end;
$$;

create trigger validate_engagement_roster_assignment_before_write
before insert or update on core.engagement_roster_assignment
for each row execute function core.validate_engagement_roster_assignment();

create table if not exists core.company_capability_entitlement (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  capability_id uuid not null references ref.insight_capabilities(id) on delete restrict,
  engagement_id uuid references core.company_engagement(id) on delete cascade,
  entitlement_status text not null default 'active',
  entitlement_source text not null default 'included',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by_profile_id uuid references core.profiles(id) on delete set null,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_capability_entitlement_status_ck
    check (entitlement_status in ('pending', 'active', 'suspended', 'ended')),
  constraint company_capability_entitlement_source_ck
    check (entitlement_source in ('included', 'trial', 'subscription', 'sponsored', 'contract')),
  constraint company_capability_entitlement_dates_ck
    check (ends_at is null or ends_at >= starts_at)
);

create unique index if not exists company_capability_entitlement_company_uk
  on core.company_capability_entitlement (company_id, capability_id)
  where engagement_id is null and entitlement_status in ('pending', 'active', 'suspended');

create unique index if not exists company_capability_entitlement_engagement_uk
  on core.company_capability_entitlement (company_id, engagement_id, capability_id)
  where engagement_id is not null and entitlement_status in ('pending', 'active', 'suspended');

create index if not exists company_capability_entitlement_company_status_idx
  on core.company_capability_entitlement (company_id, entitlement_status);

create index if not exists company_capability_entitlement_engagement_idx
  on core.company_capability_entitlement (engagement_id, entitlement_status)
  where engagement_id is not null;

create or replace function core.validate_company_capability_entitlement()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if new.engagement_id is not null and not exists (
    select 1
    from core.company_engagement engagement
    join core.company_relationship relationship
      on relationship.id = engagement.relationship_id
    where engagement.id = new.engagement_id
      and new.company_id in (
        relationship.principal_company_id,
        relationship.provider_company_id
      )
  ) then
    raise exception 'Entitled company must participate in the scoped engagement.';
  end if;

  return new;
end;
$$;

create trigger validate_company_capability_entitlement_before_write
before insert or update on core.company_capability_entitlement
for each row execute function core.validate_company_capability_entitlement();

create table if not exists core.delegated_access_grant (
  id uuid primary key default gen_random_uuid(),
  operator_company_id uuid not null references core.companies(id) on delete restrict,
  target_company_id uuid not null references core.companies(id) on delete restrict,
  operator_profile_id uuid not null references core.profiles(id) on delete cascade,
  grant_status text not null default 'pending',
  purpose text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  approved_by_profile_id uuid references core.profiles(id) on delete set null,
  approved_at timestamptz,
  revoked_by_profile_id uuid references core.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegated_access_distinct_companies_ck
    check (operator_company_id <> target_company_id),
  constraint delegated_access_status_ck
    check (grant_status in ('pending', 'active', 'suspended', 'revoked', 'expired')),
  constraint delegated_access_purpose_ck check (length(btrim(purpose)) > 0),
  constraint delegated_access_dates_ck
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint delegated_access_approval_ck
    check (
      (approved_at is null and approved_by_profile_id is null)
      or (approved_at is not null and approved_by_profile_id is not null)
    ),
  constraint delegated_access_active_approval_ck
    check (grant_status <> 'active' or approved_at is not null),
  constraint delegated_access_revocation_ck
    check (
      (revoked_at is null and revoked_by_profile_id is null)
      or (revoked_at is not null and revoked_by_profile_id is not null)
    )
);

create unique index if not exists delegated_access_grant_open_uk
  on core.delegated_access_grant (
    operator_company_id,
    target_company_id,
    operator_profile_id
  )
  where grant_status in ('pending', 'active', 'suspended');

create index if not exists delegated_access_target_status_idx
  on core.delegated_access_grant (target_company_id, grant_status);

create index if not exists delegated_access_operator_profile_status_idx
  on core.delegated_access_grant (operator_profile_id, grant_status);

create table if not exists core.delegated_access_workspace_grant (
  delegated_access_grant_id uuid not null
    references core.delegated_access_grant(id) on delete cascade,
  grant_key text not null,
  created_at timestamptz not null default now(),
  primary key (delegated_access_grant_id, grant_key),
  constraint delegated_access_workspace_grant_key_ck
    check (
      grant_key = lower(grant_key)
      and grant_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    )
);

create table if not exists core.delegated_access_session (
  id uuid primary key default gen_random_uuid(),
  delegated_access_grant_id uuid not null
    references core.delegated_access_grant(id) on delete restrict,
  actor_profile_id uuid not null references core.profiles(id) on delete restrict,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delegated_access_session_reason_ck check (length(btrim(reason)) > 0),
  constraint delegated_access_session_dates_ck
    check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists delegated_access_session_active_uk
  on core.delegated_access_session (delegated_access_grant_id, actor_profile_id)
  where ended_at is null;

create index if not exists delegated_access_session_actor_started_idx
  on core.delegated_access_session (actor_profile_id, started_at desc);

create table if not exists core.legacy_identity_link (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_subject text not null,
  target_profile_id uuid not null references core.profiles(id) on delete restrict,
  link_status text not null default 'pending',
  verified_at timestamptz,
  verified_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_identity_link_source_system_ck
    check (
      source_system = lower(source_system)
      and source_system ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'
    ),
  constraint legacy_identity_link_source_subject_ck
    check (length(btrim(source_subject)) > 0),
  constraint legacy_identity_link_status_ck
    check (link_status in ('pending', 'verified', 'retired')),
  constraint legacy_identity_link_verification_ck
    check (
      (verified_at is null and verified_by_profile_id is null)
      or (verified_at is not null and verified_by_profile_id is not null)
    ),
  constraint legacy_identity_link_verified_status_ck
    check (link_status <> 'verified' or verified_at is not null),
  constraint legacy_identity_link_source_uk unique (source_system, source_subject)
);

create index if not exists legacy_identity_link_profile_idx
  on core.legacy_identity_link (target_profile_id, link_status);

create trigger set_updated_at_on_lines_of_business
before update on ref.lines_of_business
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_company_relationship
before update on core.company_relationship
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_company_engagement
before update on core.company_engagement
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_engagement_roster_assignment
before update on core.engagement_roster_assignment
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_company_capability_entitlement
before update on core.company_capability_entitlement
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_delegated_access_grant
before update on core.delegated_access_grant
for each row execute function core.set_updated_at();

create trigger set_updated_at_on_legacy_identity_link
before update on core.legacy_identity_link
for each row execute function core.set_updated_at();

alter table ref.lines_of_business enable row level security;
alter table core.company_industry enable row level security;
alter table core.company_line_of_business enable row level security;
alter table core.company_relationship enable row level security;
alter table core.company_engagement enable row level security;
alter table core.company_roster_entry_provenance enable row level security;
alter table core.engagement_roster_assignment enable row level security;
alter table core.company_capability_entitlement enable row level security;
alter table core.delegated_access_grant enable row level security;
alter table core.delegated_access_workspace_grant enable row level security;
alter table core.delegated_access_session enable row level security;
alter table core.legacy_identity_link enable row level security;

create policy lines_of_business_read_active
on ref.lines_of_business for select to authenticated
using (is_active or core.is_platform_owner());

create policy company_industry_read_member
on core.company_industry for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_lob_read_member
on core.company_line_of_business for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_relationship_read_party
on core.company_relationship for select to authenticated
using (
  core.is_platform_owner()
  or core.can_access_company(principal_company_id)
  or core.can_access_company(provider_company_id)
);

create policy company_engagement_read_party
on core.company_engagement for select to authenticated
using (
  core.is_platform_owner()
  or exists (
    select 1
    from core.company_relationship relationship
    where relationship.id = company_engagement.relationship_id
      and (
        core.can_access_company(relationship.principal_company_id)
        or core.can_access_company(relationship.provider_company_id)
      )
  )
);

create policy company_roster_entry_provenance_read_participant
on core.company_roster_entry_provenance for select to authenticated
using (
  core.is_platform_owner()
  or core.can_access_company(roster_owner_company_id)
  or core.can_access_company(entered_by_company_id)
);

create policy engagement_roster_assignment_read_party
on core.engagement_roster_assignment for select to authenticated
using (
  core.is_platform_owner()
  or core.can_access_company(roster_owner_company_id)
  or exists (
    select 1
    from core.company_engagement engagement
    join core.company_relationship relationship
      on relationship.id = engagement.relationship_id
    where engagement.id = engagement_roster_assignment.engagement_id
      and (
        core.can_access_company(relationship.principal_company_id)
        or core.can_access_company(relationship.provider_company_id)
      )
  )
);

create policy company_capability_entitlement_read_scope
on core.company_capability_entitlement for select to authenticated
using (
  core.is_platform_owner()
  or core.can_access_company(company_id)
  or (
    engagement_id is not null
    and exists (
      select 1
      from core.company_engagement engagement
      join core.company_relationship relationship
        on relationship.id = engagement.relationship_id
      where engagement.id = company_capability_entitlement.engagement_id
        and (
          core.can_access_company(relationship.principal_company_id)
          or core.can_access_company(relationship.provider_company_id)
        )
    )
  )
);

create policy delegated_access_grant_read_participant
on core.delegated_access_grant for select to authenticated
using (
  core.is_platform_owner()
  or operator_profile_id = core.current_profile_id()
  or core.can_admin_company(operator_company_id)
  or core.can_admin_company(target_company_id)
);

create policy delegated_access_workspace_grant_read_participant
on core.delegated_access_workspace_grant for select to authenticated
using (
  exists (
    select 1
    from core.delegated_access_grant delegated_grant
    where delegated_grant.id = delegated_access_workspace_grant.delegated_access_grant_id
      and (
        core.is_platform_owner()
        or delegated_grant.operator_profile_id = core.current_profile_id()
        or core.can_admin_company(delegated_grant.operator_company_id)
        or core.can_admin_company(delegated_grant.target_company_id)
      )
  )
);

create policy delegated_access_session_read_participant
on core.delegated_access_session for select to authenticated
using (
  actor_profile_id = core.current_profile_id()
  or exists (
    select 1
    from core.delegated_access_grant delegated_grant
    where delegated_grant.id = delegated_access_session.delegated_access_grant_id
      and (
        core.is_platform_owner()
        or core.can_admin_company(delegated_grant.operator_company_id)
        or core.can_admin_company(delegated_grant.target_company_id)
      )
  )
);

create policy legacy_identity_link_read_subject
on core.legacy_identity_link for select to authenticated
using (
  core.is_platform_owner()
  or target_profile_id = core.current_profile_id()
);

create or replace function core.has_active_delegated_company_access(
  p_target_company_id uuid,
  p_grant_key text default null
)
returns boolean
language sql
stable
security invoker
set search_path = core, public
as $$
  select exists (
    select 1
    from core.delegated_access_grant delegated_grant
    join core.delegated_access_session delegated_session
      on delegated_session.delegated_access_grant_id = delegated_grant.id
     and delegated_session.actor_profile_id = delegated_grant.operator_profile_id
     and delegated_session.ended_at is null
    where delegated_grant.target_company_id = p_target_company_id
      and delegated_grant.operator_profile_id = core.current_profile_id()
      and delegated_grant.grant_status = 'active'
      and delegated_grant.starts_at <= now()
      and (delegated_grant.ends_at is null or delegated_grant.ends_at > now())
      and (
        p_grant_key is null
        or exists (
          select 1
          from core.delegated_access_workspace_grant workspace_grant
          where workspace_grant.delegated_access_grant_id = delegated_grant.id
            and workspace_grant.grant_key = p_grant_key
        )
      )
  );
$$;

grant select on ref.lines_of_business to authenticated;
grant select on core.company_industry to authenticated;
grant select on core.company_line_of_business to authenticated;
grant select on core.company_relationship to authenticated;
grant select on core.company_engagement to authenticated;
grant select on core.company_roster_entry_provenance to authenticated;
grant select on core.engagement_roster_assignment to authenticated;
grant select on core.company_capability_entitlement to authenticated;
grant select on core.delegated_access_grant to authenticated;
grant select on core.delegated_access_workspace_grant to authenticated;
grant select on core.delegated_access_session to authenticated;
grant select on core.legacy_identity_link to authenticated;

revoke all on function core.validate_company_capability_entitlement() from public;
revoke all on function core.validate_company_roster_entry_provenance() from public;
revoke all on function core.validate_engagement_roster_assignment() from public;
revoke all on function core.has_active_delegated_company_access(uuid, text) from public;
grant execute on function core.has_active_delegated_company_access(uuid, text) to authenticated;

insert into ref.insight_capabilities (
  capability_key,
  capability_label,
  description,
  is_active,
  sort_order
) values
  (
    'kpi-access',
    'KPI Access',
    'Basic operational KPI visibility within an authorized company or engagement.',
    true,
    5
  ),
  (
    'roster-management',
    'Roster Management',
    'Company-owned roster administration with explicitly shared engagement assignments.',
    true,
    6
  ),
  (
    'roster-on-behalf',
    'Roster Administration on Behalf',
    'Engagement-scoped authority for a principal to create and assign provider-owned roster records.',
    true,
    7
  )
on conflict (capability_key) do update
set
  capability_label = excluded.capability_label,
  description = excluded.description,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
