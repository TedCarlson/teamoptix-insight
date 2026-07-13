begin;

create table if not exists legal.document_version (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references legal.document(id) on delete cascade,
  version_label text not null,
  version_major integer not null default 0,
  version_minor integer not null default 1,
  version_patch integer not null default 0,
  title text not null,
  status text not null default 'LOCKED',
  section_count integer not null default 0,
  content_snapshot jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references core.profiles(id),
  created_at timestamptz not null default now(),

  constraint document_version_status_ck check (status in ('LOCKED', 'SUPERSEDED', 'VOIDED')),
  constraint document_version_label_ck check (length(btrim(version_label)) > 0),
  constraint document_version_unique unique (document_id, version_label)
);

create index if not exists document_version_document_created_idx
  on legal.document_version (document_id, created_at desc);

alter table legal.document_version enable row level security;

drop policy if exists document_version_select on legal.document_version;
create policy document_version_select
on legal.document_version
for select
to authenticated
using (
  core.is_platform_owner()
);

drop policy if exists document_version_all_platform_owner on legal.document_version;
create policy document_version_all_platform_owner
on legal.document_version
for all
to authenticated
using (
  core.is_platform_owner()
)
with check (
  core.is_platform_owner()
);

create or replace view public.legal_document_version_v
with (security_invoker = true)
as
select
  id,
  document_id,
  version_label,
  version_major,
  version_minor,
  version_patch,
  title,
  status,
  section_count,
  content_snapshot,
  created_by_profile_id,
  created_at
from legal.document_version;

grant select, insert, update on legal.document_version to authenticated;
grant all on legal.document_version to service_role;
grant all on table public.legal_document_version_v to authenticated;
grant all on table public.legal_document_version_v to service_role;

commit;
