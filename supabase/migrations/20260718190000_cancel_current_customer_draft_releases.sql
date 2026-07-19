begin;

create temporary table customer_draft_release_cancellation_scope
on commit drop
as
select distinct
  task.id as task_id,
  task.document_id
from legal.customer_legal_task task
join legal.document document
  on document.id = task.document_id
where task.status = 'READY_FOR_CUSTOMER_REVIEW'
  and document.document_scope = 'CLIENT_DOCUMENT'
  and document.status = 'DRAFT';

update legal.customer_legal_task task
set
  status = 'CANCELLED',
  cancelled_at = now(),
  completed_at = now(),
  blocking_reason = 'Cancelled before customer acceptance so the agreement can be regenerated from the current governed contract templates.',
  metadata = coalesce(task.metadata, '{}'::jsonb) || jsonb_build_object(
    'cancellation_reason', 'CURRENT_GOVERNED_TEMPLATE_REISSUE',
    'cancelled_by', '20260718190000_cancel_current_customer_draft_releases'
  ),
  updated_at = now()
from customer_draft_release_cancellation_scope scope
where task.id = scope.task_id
  and task.status = 'READY_FOR_CUSTOMER_REVIEW';

update legal.document document
set
  status = 'CANCELLED',
  updated_at = now()
from customer_draft_release_cancellation_scope scope
where document.id = scope.document_id
  and document.document_scope = 'CLIENT_DOCUMENT'
  and document.status = 'DRAFT';

commit;
