begin;

create or replace function legal.customer_legal_task_sync_from_vault_item()
returns trigger
language plpgsql
security definer
set search_path = public, legal, core
as $$
begin
  if new.document_version_id is not null and new.acceptance_id is not null then
    update legal.customer_legal_task
    set
      status = case
        when status in ('READY_FOR_CUSTOMER_REVIEW') then 'CUSTOMER_ACCEPTED'
        else status
      end,
      vault_item_id = coalesce(vault_item_id, new.id),
      customer_accepted_at = coalesce(customer_accepted_at, new.accepted_at, now()),
      customer_accepted_by_email = coalesce(customer_accepted_by_email, new.accepted_by_email),
      blocking_reason = case
        when status in ('READY_FOR_CUSTOMER_REVIEW') then 'Team Optix final execution is pending.'
        else blocking_reason
      end,
      metadata = metadata || jsonb_build_object(
        'customer_acceptance_synced_at', now(),
        'customer_acceptance_source', 'document_vault_item'
      )
    where document_version_id = new.document_version_id
      and task_type = 'CLIENT_DOCUMENT_ACCEPTANCE'
      and status <> 'CANCELLED';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_legal_task_sync_from_vault_item on legal.document_vault_item;
create trigger customer_legal_task_sync_from_vault_item
after insert or update of acceptance_id, accepted_by_email, accepted_at
on legal.document_vault_item
for each row
execute function legal.customer_legal_task_sync_from_vault_item();

update legal.customer_legal_task task
set
  status = 'CUSTOMER_ACCEPTED',
  vault_item_id = vault.id,
  customer_accepted_at = coalesce(task.customer_accepted_at, vault.accepted_at),
  customer_accepted_by_email = coalesce(task.customer_accepted_by_email, vault.accepted_by_email),
  blocking_reason = 'Team Optix final execution is pending.',
  metadata = task.metadata || jsonb_build_object('customer_acceptance_backfilled_at', now())
from legal.document_vault_item vault
where vault.document_version_id = task.document_version_id
  and vault.acceptance_id is not null
  and task.task_type = 'CLIENT_DOCUMENT_ACCEPTANCE'
  and task.status = 'READY_FOR_CUSTOMER_REVIEW';

notify pgrst, 'reload schema';

commit;
