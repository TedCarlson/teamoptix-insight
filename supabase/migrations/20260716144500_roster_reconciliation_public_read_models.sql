-- Expose company-authoritative roster facts through public security-invoker views
-- so authenticated server routes can reconcile imports without direct core schema access.

begin;

create or replace view public.company_roster_personal_fact_v
with (security_invoker = true)
as
select
  fact.roster_id,
  roster.company_id,
  fact.date_of_birth,
  fact.address_line_1,
  fact.address_line_2,
  fact.city,
  fact.state_region,
  fact.postal_code,
  fact.created_at,
  fact.updated_at
from core.company_roster_personal_fact fact
join core.company_roster roster
  on roster.id = fact.roster_id;

create or replace view public.company_roster_license_fact_v
with (security_invoker = true)
as
select
  fact.roster_id,
  roster.company_id,
  fact.license_number,
  fact.issuing_state,
  fact.issue_date,
  fact.expiration_date,
  fact.created_at,
  fact.updated_at
from core.company_roster_license_fact fact
join core.company_roster roster
  on roster.id = fact.roster_id;

revoke all on public.company_roster_personal_fact_v from public;
revoke all on public.company_roster_license_fact_v from public;

grant select on public.company_roster_personal_fact_v
  to authenticated, service_role;

grant select on public.company_roster_license_fact_v
  to authenticated, service_role;

comment on view public.company_roster_personal_fact_v is
  'Company-authoritative roster personal facts exposed through RLS-backed security-invoker reads.';

comment on view public.company_roster_license_fact_v is
  'Company-authoritative roster license facts exposed through RLS-backed security-invoker reads.';

commit;
