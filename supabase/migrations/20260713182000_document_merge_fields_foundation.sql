begin;

alter table legal.document
  add column if not exists customer_legal_name text,
  add column if not exists customer_project_lead text,
  add column if not exists teamoptix_project_lead text,
  add column if not exists provider_name text not null default 'Team Optix, LLC';

update legal.document
set provider_name = 'Team Optix, LLC'
where provider_name is null or btrim(provider_name) = '';

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
  created_at,
  updated_at
from legal.document;

grant all on table public.legal_document_v to authenticated;
grant all on table public.legal_document_v to service_role;

commit;
