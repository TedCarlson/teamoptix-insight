begin;

alter table commercial.company_activation_readiness
  drop constraint if exists company_activation_readiness_key_ck;

alter table commercial.company_activation_readiness
  add constraint company_activation_readiness_key_ck
  check (
    readiness_key in (
      'commercial_ready',
      'implementation_payment_ready',
      'contract_ready',
      'legal_signatures_ready',
      'workspace_ready',
      'credentials_ready',
      'automation_ready',
      'training_ready',
      'customer_approval_ready'
    )
  );

insert into commercial.company_activation_readiness (
  company_id,
  readiness_key,
  status,
  source_type,
  is_blocking,
  blocking_reason
)
select
  company.id,
  'legal_signatures_ready',
  'incomplete',
  'computed',
  true,
  'Required customer legal documents have not yet been executed and vaulted.'
from core.companies company
on conflict (company_id, readiness_key) do nothing;

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
  task.completed_at,
  source_template.document_key as source_template_document_key
from legal.customer_legal_task task
join legal.document document
  on document.id = task.document_id
join legal.document_version version
  on version.id = task.document_version_id
left join legal.document source_template
  on source_template.id = document.source_template_document_id
left join core.companies company
  on company.id = task.company_id;

grant select on public.legal_customer_legal_task_v to authenticated;
grant select on public.legal_customer_legal_task_v to service_role;

with target_company as (
  select id
  from core.companies
  where company_slug = 'beacon-point-ventures'
)
update commercial.company_activation activation
set
  lifecycle_status = 'implementation',
  implementation_completed_at = null,
  implementation_completed_by = null,
  ready_for_go_live_at = null,
  ready_for_go_live_by = null,
  go_live_requested_at = null,
  go_live_requested_by = null,
  go_live_at = null,
  go_live_by = null,
  first_billing_date = null,
  subscription_activation_status = 'not_started',
  subscription_activated_at = null,
  last_transition = 'legal_signature_readiness_reopened',
  last_transition_at = now(),
  last_transition_by = null,
  updated_at = now()
from target_company
where activation.company_id = target_company.id;

with target_company as (
  select id
  from core.companies
  where company_slug = 'beacon-point-ventures'
)
update commercial.company_activation_run run
set
  status = 'partial',
  failure_summary = 'Administratively invalidated: Go Live occurred before required legal document signatures were established as an independent readiness gate.',
  updated_at = now()
from target_company
where run.company_id = target_company.id
  and run.run_type = 'go_live'
  and run.status = 'complete';

notify pgrst, 'reload schema';

commit;
