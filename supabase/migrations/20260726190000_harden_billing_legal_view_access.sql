begin;

-- Scope billing access to the governed company instead of granting every
-- authenticated user access to every customer and subscription.
alter table billing.customer enable row level security;
alter table billing.subscription enable row level security;

drop policy if exists billing_customer_select on billing.customer;
drop policy if exists billing_customer_insert on billing.customer;
drop policy if exists billing_customer_update on billing.customer;

create policy billing_customer_select
on billing.customer
for select
to authenticated
using (core.can_access_company(company_id));

create policy billing_customer_insert
on billing.customer
for insert
to authenticated
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

create policy billing_customer_update
on billing.customer
for update
to authenticated
using (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
)
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

drop policy if exists billing_subscription_select on billing.subscription;
drop policy if exists billing_subscription_insert on billing.subscription;
drop policy if exists billing_subscription_update on billing.subscription;

create policy billing_subscription_select
on billing.subscription
for select
to authenticated
using (core.can_access_company(company_id));

create policy billing_subscription_insert
on billing.subscription
for insert
to authenticated
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

create policy billing_subscription_update
on billing.subscription
for update
to authenticated
using (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
)
with check (
  core.is_platform_owner()
  or core.can_admin_company(company_id)
);

revoke all on billing.customer from anon;
revoke all on billing.customer from public;
revoke all on billing.customer from authenticated;
grant select, insert, update on billing.customer to authenticated;
grant all on billing.customer to service_role;

revoke all on billing.subscription from anon;
revoke all on billing.subscription from public;
revoke all on billing.subscription from authenticated;
grant select, insert, update on billing.subscription to authenticated;
grant all on billing.subscription to service_role;

-- Customer legal tasks were introduced without RLS. Platform owners retain
-- global governance access; company users are limited to governed companies.
alter table legal.customer_legal_task enable row level security;

drop policy if exists customer_legal_task_select
  on legal.customer_legal_task;
drop policy if exists customer_legal_task_insert
  on legal.customer_legal_task;
drop policy if exists customer_legal_task_update
  on legal.customer_legal_task;

create policy customer_legal_task_select
on legal.customer_legal_task
for select
to authenticated
using (
  core.is_platform_owner()
  or (
    company_id is not null
    and core.can_access_company(company_id)
  )
);

create policy customer_legal_task_insert
on legal.customer_legal_task
for insert
to authenticated
with check (
  core.is_platform_owner()
  or (
    company_id is not null
    and core.can_admin_company(company_id)
  )
);

create policy customer_legal_task_update
on legal.customer_legal_task
for update
to authenticated
using (
  core.is_platform_owner()
  or (
    company_id is not null
    and core.can_admin_company(company_id)
  )
)
with check (
  core.is_platform_owner()
  or (
    company_id is not null
    and core.can_admin_company(company_id)
  )
);

revoke all on legal.customer_legal_task from anon;
revoke all on legal.customer_legal_task from public;
revoke all on legal.customer_legal_task from authenticated;
grant select, insert, update
  on legal.customer_legal_task
  to authenticated;
grant all on legal.customer_legal_task to service_role;

-- Security-invoker legal-task reads must also be able to see the associated
-- customer document and version through company-scoped base-table policies.
drop policy if exists legal_document_select_company_client
  on legal.document;

create policy legal_document_select_company_client
on legal.document
for select
to authenticated
using (
  customer_company_id is not null
  and core.can_access_company(customer_company_id)
);

drop policy if exists document_version_select_company_client
  on legal.document_version;

create policy document_version_select_company_client
on legal.document_version
for select
to authenticated
using (
  exists (
    select 1
    from legal.document document
    where document.id = document_version.document_id
      and document.customer_company_id is not null
      and core.can_access_company(document.customer_company_id)
  )
);

-- Views execute as the caller so the underlying RLS policies are enforced.
alter view billing.customer_subscription_v
  set (security_invoker = true);

alter view public.legal_customer_legal_task_v
  set (security_invoker = true);

revoke all on billing.customer_subscription_v from anon;
revoke all on billing.customer_subscription_v from public;
revoke all on billing.customer_subscription_v from authenticated;
grant select on billing.customer_subscription_v to authenticated;
grant all on billing.customer_subscription_v to service_role;

revoke all on public.legal_customer_legal_task_v from anon;
revoke all on public.legal_customer_legal_task_v from public;
revoke all on public.legal_customer_legal_task_v from authenticated;
grant select on public.legal_customer_legal_task_v to authenticated;
grant all on public.legal_customer_legal_task_v to service_role;

notify pgrst, 'reload schema';

commit;
