-- Run after the Event 1 tenancy foundation and Event 2 ITF context migrations.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000001101'),
  ('00000000-0000-4000-8000-000000001102'),
  ('00000000-0000-4000-8000-000000001103');

insert into core.profiles (
  id,
  auth_user_id,
  email,
  first_name,
  last_name,
  is_platform_owner
) values
  (
    '00000000-0000-4000-8000-000000001201',
    '00000000-0000-4000-8000-000000001101',
    'event2-platform@example.invalid',
    'Platform',
    'Owner',
    true
  ),
  (
    '00000000-0000-4000-8000-000000001202',
    '00000000-0000-4000-8000-000000001102',
    'event2-admin@example.invalid',
    'Company',
    'Admin',
    false
  ),
  (
    '00000000-0000-4000-8000-000000001203',
    '00000000-0000-4000-8000-000000001103',
    'event2-member@example.invalid',
    'Company',
    'Member',
    false
  );

insert into core.companies (
  id,
  company_name,
  company_slug,
  contact_email
) values (
  '00000000-0000-4000-8000-000000001301',
  'Event 2 Company',
  'event-2-company',
  'event2-company@example.invalid'
);

insert into core.company_memberships (
  company_id,
  profile_id,
  membership_status,
  relationship_type
) values
  (
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001202',
    'active',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001203',
    'active',
    'member'
  );

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000001101',
  true
);

do $$
declare
  v_context jsonb;
begin
  v_context := public.itf_workspace_context('event-2-company');

  if v_context->>'authorization_source' <> 'platform_preview'
     or (v_context->>'can_enter')::boolean is not true
     or v_context->>'entitlement_status' is not null then
    raise exception 'Platform preview must not invent a company entitlement: %', v_context;
  end if;
end;
$$;

insert into core.company_capability_entitlement (
  company_id,
  capability_id,
  entitlement_status,
  entitlement_source,
  granted_by_profile_id
)
select
  '00000000-0000-4000-8000-000000001301',
  capability.id,
  'active',
  'included',
  '00000000-0000-4000-8000-000000001201'
from ref.insight_capabilities capability
where capability.capability_key = 'insight-telecom-fulfillment';

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000001102',
  true
);

do $$
declare
  v_context jsonb;
begin
  v_context := public.itf_workspace_context('event-2-company');

  if v_context->>'authorization_source' <> 'company_admin'
     or (v_context->>'can_manage')::boolean is not true
     or v_context->>'entitlement_status' <> 'active' then
    raise exception 'Company admin entitlement was not resolved: %', v_context;
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000001103',
  true
);

do $$
declare
  v_context jsonb;
begin
  v_context := public.itf_workspace_context('event-2-company');

  if (v_context->>'can_enter')::boolean is true
     or v_context->>'access_reason' <> 'workspace_grant_required' then
    raise exception 'Ungranted member must be denied: %', v_context;
  end if;

  if public.itf_workspace_context('not-their-company') is not null then
    raise exception 'Unknown or cross-company context must not be disclosed.';
  end if;
end;
$$;

insert into core.company_user_grant (
  company_id,
  profile_id,
  grant_key,
  is_active,
  granted_by_profile_id
) values (
  '00000000-0000-4000-8000-000000001301',
  '00000000-0000-4000-8000-000000001203',
  'insight_telecom_fulfillment',
  true,
  '00000000-0000-4000-8000-000000001202'
);

do $$
declare
  v_context jsonb;
begin
  v_context := public.itf_workspace_context('event-2-company');

  if v_context->>'authorization_source' <> 'company_grant'
     or (v_context->>'can_enter')::boolean is not true
     or (v_context->>'can_manage')::boolean is true then
    raise exception 'Explicit member grant was not resolved correctly: %', v_context;
  end if;
end;
$$;

rollback;
