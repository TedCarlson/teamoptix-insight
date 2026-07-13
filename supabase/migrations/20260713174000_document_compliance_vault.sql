begin;

create table if not exists legal.document_vault_item (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references legal.document(id) on delete cascade,
  document_version_id uuid not null references legal.document_version(id) on delete cascade,
  acceptance_id uuid references legal.document_version_acceptance(id) on delete set null,
  company_id uuid references core.companies(id) on delete set null,
  document_type text not null,
  document_title text not null,
  version_label text not null,
  artifact_type text not null default 'ACCEPTANCE_RECORD',
  artifact_status text not null default 'STORED',
  storage_status text not null default 'METADATA_ONLY',
  storage_path text,
  pdf_storage_path text,
  checksum text,
  content_snapshot jsonb not null default '{}'::jsonb,
  accepted_by_name text,
  accepted_by_email text,
  accepted_by_title text,
  accepted_by_company text,
  accepted_at timestamptz,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_vault_item_artifact_type_ck check (
    artifact_type in ('ACCEPTANCE_RECORD', 'SIGNED_PDF', 'EVIDENCE_PACKET')
  ),
  constraint document_vault_item_artifact_status_ck check (
    artifact_status in ('STORED', 'SUPERSEDED', 'VOIDED', 'ARCHIVED')
  ),
  constraint document_vault_item_storage_status_ck check (
    storage_status in ('METADATA_ONLY', 'PDF_PENDING', 'PDF_STORED', 'EXTERNAL_STORED')
  ),
  constraint document_vault_item_title_ck check (length(btrim(document_title)) > 0),
  constraint document_vault_item_version_ck check (length(btrim(version_label)) > 0)
);

create unique index if not exists document_vault_item_acceptance_uidx
  on legal.document_vault_item (acceptance_id)
  where acceptance_id is not null;

create index if not exists document_vault_item_document_idx
  on legal.document_vault_item (document_id, created_at desc);

create index if not exists document_vault_item_version_idx
  on legal.document_vault_item (document_version_id, created_at desc);

create index if not exists document_vault_item_accepted_idx
  on legal.document_vault_item (accepted_at desc);

drop trigger if exists document_vault_item_set_updated_at on legal.document_vault_item;
create trigger document_vault_item_set_updated_at
before update on legal.document_vault_item
for each row
execute function core.set_updated_at();

alter table legal.document_vault_item enable row level security;

drop policy if exists document_vault_item_select on legal.document_vault_item;
create policy document_vault_item_select
on legal.document_vault_item
for select
to authenticated
using (
  core.is_platform_owner()
);

drop policy if exists document_vault_item_all_platform_owner on legal.document_vault_item;
create policy document_vault_item_all_platform_owner
on legal.document_vault_item
for all
to authenticated
using (
  core.is_platform_owner()
)
with check (
  core.is_platform_owner()
);

create or replace view public.legal_document_vault_item_v
with (security_invoker = true)
as
select
  vault.id,
  vault.document_id,
  vault.document_version_id,
  vault.acceptance_id,
  vault.company_id,
  vault.accepted_by_company as company_name,
  vault.document_type,
  vault.document_title,
  vault.version_label,
  vault.artifact_type,
  vault.artifact_status,
  vault.storage_status,
  vault.storage_path,
  vault.pdf_storage_path,
  vault.checksum,
  vault.content_snapshot,
  vault.accepted_by_name,
  vault.accepted_by_email,
  vault.accepted_by_title,
  vault.accepted_by_company,
  vault.accepted_at,
  vault.retained_until,
  vault.created_at,
  vault.updated_at
from legal.document_vault_item vault;

insert into legal.document_vault_item (
  document_id,
  document_version_id,
  acceptance_id,
  company_id,
  document_type,
  document_title,
  version_label,
  artifact_type,
  artifact_status,
  storage_status,
  content_snapshot,
  accepted_by_name,
  accepted_by_email,
  accepted_by_title,
  accepted_by_company,
  accepted_at,
  created_at,
  updated_at
)
select
  acceptance.document_id,
  acceptance.document_version_id,
  acceptance.id,
  acceptance.company_id,
  document.document_key,
  version.title,
  version.version_label,
  'ACCEPTANCE_RECORD',
  'STORED',
  'METADATA_ONLY',
  acceptance.content_snapshot,
  acceptance.accepted_by_name,
  acceptance.accepted_by_email,
  acceptance.accepted_by_title,
  acceptance.accepted_by_company,
  acceptance.accepted_at,
  now(),
  now()
from legal.document_version_acceptance acceptance
join legal.document_version version on version.id = acceptance.document_version_id
join legal.document document on document.id = acceptance.document_id
on conflict (acceptance_id) where acceptance_id is not null do update
set
  company_id = excluded.company_id,
  document_type = excluded.document_type,
  document_title = excluded.document_title,
  version_label = excluded.version_label,
  artifact_status = excluded.artifact_status,
  storage_status = excluded.storage_status,
  content_snapshot = excluded.content_snapshot,
  accepted_by_name = excluded.accepted_by_name,
  accepted_by_email = excluded.accepted_by_email,
  accepted_by_title = excluded.accepted_by_title,
  accepted_by_company = excluded.accepted_by_company,
  accepted_at = excluded.accepted_at,
  updated_at = now();

grant select, insert, update on legal.document_vault_item to authenticated;
grant all on legal.document_vault_item to service_role;
grant all on table public.legal_document_vault_item_v to authenticated;
grant all on table public.legal_document_vault_item_v to service_role;

commit;
