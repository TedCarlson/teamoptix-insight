begin;

create or replace view public.legal_customer_legal_task_v as
select
  task.id,
  task.task_key,
  task.company_id,
  company.company_slug,
  coalesce(document.customer_legal_name, company.company_slug) as company_name,
  task.document_id,
  document.document_key,
  document.title as document_title,
  document.status as document_status,
  document.customer_legal_name,
  task.document_version_id,
  version.version_label,
  version.status as version_status,
  version.created_at as locked_at,
  task.status,
  task.released_at,
  task.customer_accepted_at,
  task.customer_accepted_by_email,
  task.teamoptix_executed_at,
  task.vault_item_id,
  task.blocking_reason,
  task.cancelled_at,
  task.created_at,
  task.updated_at,
  task.completed_at
from legal.customer_legal_task task
join legal.document document
  on document.id = task.document_id
join legal.document_version version
  on version.id = task.document_version_id
left join core.companies company
  on company.id = task.company_id;

grant select on public.legal_customer_legal_task_v to authenticated;
grant select on public.legal_customer_legal_task_v to service_role;

notify pgrst, 'reload schema';

commit;
