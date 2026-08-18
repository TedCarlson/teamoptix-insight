-- Run after 20260815174549_tenancy_relationship_entitlement_foundation.sql.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000104');

insert into core.profiles (
  id,
  auth_user_id,
  email,
  first_name,
  last_name
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'event1-itg-admin@example.invalid',
    'ITG',
    'Admin'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000102',
    'event1-contractor-admin@example.invalid',
    'Contractor',
    'Admin'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000103',
    'event1-unrelated-admin@example.invalid',
    'Unrelated',
    'Admin'
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000104',
    'event1-teamoptix-operator@example.invalid',
    'TeamOptix',
    'Operator'
  );

insert into core.companies (
  id,
  company_name,
  company_slug,
  contact_email
) values
  (
    '00000000-0000-4000-8000-000000000301',
    'Event 1 ITG',
    'event-1-itg',
    'event1-itg@example.invalid'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    'Event 1 Contractor',
    'event-1-contractor',
    'event1-contractor@example.invalid'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    'Event 1 Unrelated',
    'event-1-unrelated',
    'event1-unrelated@example.invalid'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    'Event 1 Team Optix',
    'event-1-teamoptix',
    'event1-teamoptix@example.invalid'
  );

insert into core.company_memberships (
  company_id,
  profile_id,
  membership_status,
  relationship_type
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    'active',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    'active',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000203',
    'active',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000204',
    'active',
    'admin'
  );

insert into ref.industries (
  id,
  industry_key,
  industry_label,
  is_active,
  sort_order
) values (
  '00000000-0000-4000-8000-000000000401',
  'event-1-field-services',
  'Event 1 Field Services',
  true,
  999
);

insert into ref.lines_of_business (
  id,
  industry_id,
  lob_key,
  lob_label
) values (
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000401',
  'utility-locate',
  'Utility Locate'
);

insert into core.company_industry (
  company_id,
  industry_id,
  is_primary
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000401',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000401',
    true
  );

insert into core.company_line_of_business (
  company_id,
  line_of_business_id,
  is_primary
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000402',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000402',
    true
  );

insert into core.company_relationship (
  id,
  principal_company_id,
  provider_company_id,
  relationship_kind,
  relationship_status,
  is_exclusive,
  starts_on,
  invited_by_profile_id,
  accepted_by_profile_id,
  accepted_at
) values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000302',
  'subcontractor',
  'active',
  false,
  current_date,
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  now()
);

insert into core.company_engagement (
  id,
  relationship_id,
  engagement_key,
  engagement_name,
  industry_id,
  line_of_business_id,
  engagement_status,
  starts_on,
  created_by_profile_id
) values (
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000501',
  'itg-utility-locate',
  'ITG Utility Locate',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402',
  'active',
  current_date,
  '00000000-0000-4000-8000-000000000201'
);

insert into core.company_roster (
  id,
  company_id,
  full_name,
  email,
  phone,
  worker_type,
  job_title,
  employment_status
) values
  (
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000302',
    'Assigned Contractor Worker',
    'assigned-worker-private@example.invalid',
    '555-0101',
    'Contractor',
    'Locator',
    'Active'
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000302',
    'Private Contractor Worker',
    'private-worker@example.invalid',
    '555-0102',
    'Contractor',
    'Internal Operations',
    'Active'
  );

insert into core.company_roster_entry_provenance (
  roster_id,
  roster_owner_company_id,
  entry_authority,
  entry_channel,
  entered_by_company_id,
  entered_by_profile_id,
  source_engagement_id,
  source_system,
  source_record_id
) values
  (
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000302',
    'principal_on_behalf',
    'donor_migration',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000502',
    'itg-insight',
    'known-itg-worker-001'
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000302',
    'owner_company',
    'manual',
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    null,
    null,
    null
  );

insert into core.engagement_roster_assignment (
  id,
  engagement_id,
  roster_id,
  roster_owner_company_id,
  shared_display_name,
  shared_role,
  client_worker_reference,
  assignment_status,
  starts_on,
  recorded_by_company_id,
  recorded_by_profile_id,
  record_origin
) values (
  '00000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000302',
  'Assigned Contractor Worker',
  'Locator',
  'ITG-LOC-001',
  'active',
  current_date,
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'principal_on_behalf'
);

insert into core.company_capability_entitlement (
  id,
  company_id,
  capability_id,
  engagement_id,
  entitlement_status,
  entitlement_source,
  granted_by_profile_id
) values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000302',
    (select id from ref.insight_capabilities where capability_key = 'kpi-access'),
    '00000000-0000-4000-8000-000000000502',
    'active',
    'included',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000302',
    (select id from ref.insight_capabilities where capability_key = 'payroll'),
    null,
    'active',
    'subscription',
    '00000000-0000-4000-8000-000000000202'
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    '00000000-0000-4000-8000-000000000304',
    (select id from ref.insight_capabilities where capability_key = 'asset-management'),
    null,
    'active',
    'subscription',
    '00000000-0000-4000-8000-000000000204'
  ),
  (
    '00000000-0000-4000-8000-000000000604',
    '00000000-0000-4000-8000-000000000301',
    (select id from ref.insight_capabilities where capability_key = 'roster-on-behalf'),
    '00000000-0000-4000-8000-000000000502',
    'active',
    'included',
    '00000000-0000-4000-8000-000000000202'
  );

insert into core.delegated_access_grant (
  id,
  operator_company_id,
  target_company_id,
  operator_profile_id,
  grant_status,
  purpose,
  starts_at,
  ends_at,
  approved_by_profile_id,
  approved_at
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000204',
  'active',
  'Event 1 support verification',
  now() - interval '1 minute',
  now() + interval '1 hour',
  '00000000-0000-4000-8000-000000000201',
  now() - interval '1 minute'
);

insert into core.delegated_access_workspace_grant (
  delegated_access_grant_id,
  grant_key
) values (
  '00000000-0000-4000-8000-000000000701',
  'admin_config'
);

insert into core.delegated_access_session (
  id,
  delegated_access_grant_id,
  actor_profile_id,
  reason
) values (
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000204',
  'Verify customer configuration'
);

insert into core.legacy_identity_link (
  id,
  source_system,
  source_subject,
  target_profile_id,
  link_status,
  verified_at,
  verified_by_profile_id
) values (
  '00000000-0000-4000-8000-000000000801',
  'itg-insight',
  'donor-auth-subject-operator',
  '00000000-0000-4000-8000-000000000204',
  'verified',
  now(),
  '00000000-0000-4000-8000-000000000204'
);

-- An unrelated company cannot discover relationship, engagement, entitlement,
-- delegation, session, or identity-link records.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000103',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if exists (
    select 1 from core.company_relationship
    where id = '00000000-0000-4000-8000-000000000501'
  ) then
    raise exception 'Unrelated company discovered a company relationship';
  end if;

  if exists (
    select 1 from core.company_engagement
    where id = '00000000-0000-4000-8000-000000000502'
  ) then
    raise exception 'Unrelated company discovered an engagement';
  end if;

  if exists (
    select 1 from core.company_capability_entitlement
    where id in (
      '00000000-0000-4000-8000-000000000601',
      '00000000-0000-4000-8000-000000000602',
      '00000000-0000-4000-8000-000000000603',
      '00000000-0000-4000-8000-000000000604'
    )
  ) then
    raise exception 'Unrelated company discovered a capability entitlement';
  end if;

  if exists (
    select 1 from core.engagement_roster_assignment
    where id = '00000000-0000-4000-8000-000000000903'
  ) then
    raise exception 'Unrelated company discovered an engagement roster assignment';
  end if;

  if exists (
    select 1 from core.company_roster_entry_provenance
    where roster_owner_company_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'Unrelated company discovered contractor roster provenance';
  end if;

  if exists (
    select 1 from core.company_roster
    where company_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'Unrelated company discovered the contractor roster';
  end if;

  if exists (
    select 1 from core.delegated_access_grant
    where id = '00000000-0000-4000-8000-000000000701'
  ) then
    raise exception 'Unrelated company discovered a delegated access grant';
  end if;

  if exists (
    select 1 from core.legacy_identity_link
    where id = '00000000-0000-4000-8000-000000000801'
  ) then
    raise exception 'Unrelated company discovered a legacy identity link';
  end if;

  if core.has_active_delegated_company_access(
    '00000000-0000-4000-8000-000000000301',
    'admin_config'
  ) then
    raise exception 'Unrelated user received delegated company access';
  end if;
end;
$$;

reset role;

-- The contractor can see its relationship, engagement, included engagement
-- capability, and private company entitlement.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000102',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*) from core.company_relationship
    where id = '00000000-0000-4000-8000-000000000501'
  ) <> 1 then
    raise exception 'Contractor could not see its company relationship';
  end if;

  if (
    select count(*) from core.company_engagement
    where id = '00000000-0000-4000-8000-000000000502'
  ) <> 1 then
    raise exception 'Contractor could not see its engagement';
  end if;

  if (
    select count(*) from core.company_capability_entitlement
    where id in (
      '00000000-0000-4000-8000-000000000601',
      '00000000-0000-4000-8000-000000000602'
    )
  ) <> 2 then
    raise exception 'Contractor could not see its scoped and company entitlements';
  end if;

  if exists (
    select 1 from core.company_capability_entitlement
    where id = '00000000-0000-4000-8000-000000000603'
  ) then
    raise exception 'Contractor discovered Team Optix private entitlement';
  end if;

  if (
    select count(*) from core.company_roster
    where company_id = '00000000-0000-4000-8000-000000000302'
  ) <> 2 then
    raise exception 'Contractor could not manage its complete private roster';
  end if;

  if not exists (
    select 1 from core.engagement_roster_assignment
    where id = '00000000-0000-4000-8000-000000000903'
      and roster_owner_company_id = '00000000-0000-4000-8000-000000000302'
      and recorded_by_company_id = '00000000-0000-4000-8000-000000000301'
      and record_origin = 'principal_on_behalf'
  ) then
    raise exception 'Contractor could not audit ITG on-behalf roster provenance';
  end if;

  if (
    select count(*) from core.company_roster_entry_provenance
    where roster_owner_company_id = '00000000-0000-4000-8000-000000000302'
  ) <> 2 then
    raise exception 'Contractor could not audit provenance for its complete roster';
  end if;
end;
$$;

reset role;

-- ITG can see engagement-shared capability access but not the contractor's
-- unrelated company-wide payroll upgrade.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if not exists (
    select 1 from core.company_capability_entitlement
    where id = '00000000-0000-4000-8000-000000000601'
  ) then
    raise exception 'ITG could not see engagement-shared KPI access';
  end if;

  if exists (
    select 1 from core.company_capability_entitlement
    where id = '00000000-0000-4000-8000-000000000602'
  ) then
    raise exception 'ITG discovered contractor company-private payroll access';
  end if;

  if not exists (
    select 1 from core.company_capability_entitlement
    where id = '00000000-0000-4000-8000-000000000604'
  ) then
    raise exception 'ITG could not see its engagement-scoped on-behalf roster authority';
  end if;

  if exists (
    select 1 from core.company_roster
    where company_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'ITG relationship granted global contractor roster visibility';
  end if;

  if not exists (
    select 1 from core.engagement_roster_assignment
    where id = '00000000-0000-4000-8000-000000000903'
      and shared_display_name = 'Assigned Contractor Worker'
      and shared_role = 'Locator'
  ) then
    raise exception 'ITG could not see the explicitly shared roster assignment';
  end if;

  if not exists (
    select 1 from core.company_roster_entry_provenance
    where roster_id = '00000000-0000-4000-8000-000000000901'
      and entry_authority = 'principal_on_behalf'
      and entry_channel = 'donor_migration'
      and entered_by_company_id = '00000000-0000-4000-8000-000000000301'
  ) then
    raise exception 'ITG could not see provenance for the contractor row it loaded';
  end if;

  if exists (
    select 1 from core.company_roster_entry_provenance
    where roster_id = '00000000-0000-4000-8000-000000000902'
  ) then
    raise exception 'ITG discovered provenance for a contractor-private roster row';
  end if;

  if exists (
    select 1 from core.engagement_roster_assignment
    where roster_id = '00000000-0000-4000-8000-000000000902'
  ) then
    raise exception 'Contractor-private worker was implicitly shared with ITG';
  end if;

  if not exists (
    select 1 from core.delegated_access_grant
    where id = '00000000-0000-4000-8000-000000000701'
  ) then
    raise exception 'Target company administrator could not audit delegation';
  end if;
end;
$$;

reset role;

-- The Team Optix operator remains the real actor. Delegation requires both an
-- active grant and an active session and is limited by workspace grant.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000104',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if core.can_access_company('00000000-0000-4000-8000-000000000301') then
    raise exception 'Delegated operator received an implicit direct ITG membership';
  end if;

  if not core.has_active_delegated_company_access(
    '00000000-0000-4000-8000-000000000301',
    'admin_config'
  ) then
    raise exception 'Active delegated session did not authorize its workspace grant';
  end if;

  if core.has_active_delegated_company_access(
    '00000000-0000-4000-8000-000000000301',
    'payroll'
  ) then
    raise exception 'Delegated session exceeded its workspace grant';
  end if;

  if not exists (
    select 1 from core.legacy_identity_link
    where id = '00000000-0000-4000-8000-000000000801'
  ) then
    raise exception 'Profile could not inspect its own legacy identity link';
  end if;

  if exists (
    select 1 from core.company_relationship
    where id = '00000000-0000-4000-8000-000000000501'
  ) then
    raise exception 'Delegation silently bypassed engagement row policies';
  end if;
end;
$$;

reset role;
rollback;
