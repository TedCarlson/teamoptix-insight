begin;

alter table legal.document
  add column if not exists document_scope text not null default 'TEMPLATE',
  add column if not exists source_template_document_id uuid references legal.document(id),
  add column if not exists source_template_version_id uuid references legal.document_version(id),
  add column if not exists customer_company_id uuid references core.companies(id),
  add column if not exists customer_document_label text;

update legal.document
set document_scope = 'TEMPLATE'
where document_scope is null or btrim(document_scope) = '';

alter table legal.document
  drop constraint if exists legal_document_scope_ck;

alter table legal.document
  add constraint legal_document_scope_ck
  check (document_scope in ('TEMPLATE', 'CLIENT_DOCUMENT'));

create index if not exists legal_document_scope_idx
  on legal.document (document_scope, updated_at desc);

create index if not exists legal_document_template_lineage_idx
  on legal.document (source_template_document_id, source_template_version_id)
  where document_scope = 'CLIENT_DOCUMENT';

drop view if exists public.legal_document_v;

create view public.legal_document_v
with (security_invoker = true)
as
select
  id,
  document_key,
  title,
  version_major,
  version_minor,
  version_patch,
  status,
  effective_at,
  published_at,
  current_version,
  last_reviewed_at,
  owner_name,
  customer_legal_name,
  customer_project_lead,
  teamoptix_project_lead,
  provider_name,
  document_scope,
  source_template_document_id,
  source_template_version_id,
  customer_company_id,
  customer_document_label,
  created_at,
  updated_at
from legal.document;

grant all on table public.legal_document_v to authenticated;
grant all on table public.legal_document_v to service_role;

commit;
