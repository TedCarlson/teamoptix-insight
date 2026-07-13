begin;

create table if not exists legal.document_version_acceptance (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references legal.document_version(id) on delete cascade,
  document_id uuid not null references legal.document(id) on delete cascade,
  company_id uuid references core.companies(id) on delete set null,
  accepted_by_profile_id uuid references core.profiles(id) on delete set null,
  accepted_by_name text not null,
  accepted_by_email text not null,
  accepted_by_title text,
  accepted_by_company text,
  acceptance_method text not null default 'READ_AND_ACCEPT',
  acknowledgment_checked boolean not null default true,
  content_snapshot jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint document_version_acceptance_name_ck check (length(btrim(accepted_by_name)) > 0),
  constraint document_version_acceptance_email_ck check (length(btrim(accepted_by_email)) > 0),
  constraint document_version_acceptance_method_ck check (
    acceptance_method in ('READ_AND_ACCEPT')
  ),
  constraint document_version_acceptance_ack_ck check (acknowledgment_checked = true)
);

create index if not exists document_version_acceptance_document_idx
  on legal.document_version_acceptance (document_id, accepted_at desc);

create index if not exists document_version_acceptance_version_idx
  on legal.document_version_acceptance (document_version_id, accepted_at desc);

create unique index if not exists document_version_acceptance_version_email_uidx
  on legal.document_version_acceptance (document_version_id, lower(accepted_by_email));

alter table legal.document_version_acceptance enable row level security;

drop policy if exists document_version_acceptance_select on legal.document_version_acceptance;
create policy document_version_acceptance_select
on legal.document_version_acceptance
for select
to authenticated
using (
  core.is_platform_owner()
);

drop policy if exists document_version_acceptance_all_platform_owner on legal.document_version_acceptance;
create policy document_version_acceptance_all_platform_owner
on legal.document_version_acceptance
for all
to authenticated
using (
  core.is_platform_owner()
)
with check (
  core.is_platform_owner()
);

create or replace view public.legal_document_version_acceptance_v
with (security_invoker = true)
as
select
  a.id,
  a.document_version_id,
  a.document_id,
  a.company_id,
  a.accepted_by_profile_id,
  a.accepted_by_name,
  a.accepted_by_email,
  a.accepted_by_title,
  a.accepted_by_company,
  a.acceptance_method,
  a.acknowledgment_checked,
  a.content_snapshot,
  a.ip_address::text as ip_address,
  a.user_agent,
  a.accepted_at,
  a.created_at,
  v.version_label,
  v.title as document_title,
  v.section_count
from legal.document_version_acceptance a
join legal.document_version v on v.id = a.document_version_id;

grant select, insert, update on legal.document_version_acceptance to authenticated;
grant all on legal.document_version_acceptance to service_role;
grant all on table public.legal_document_version_acceptance_v to authenticated;
grant all on table public.legal_document_version_acceptance_v to service_role;

commit;
