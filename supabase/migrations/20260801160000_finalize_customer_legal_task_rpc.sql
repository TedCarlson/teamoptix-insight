begin;

create or replace function public.legal_finalize_customer_task(
  p_task_id uuid,
  p_executed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, legal
as $$
declare
  v_task legal.customer_legal_task%rowtype;
begin
  if p_task_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Missing legal task id.'
    );
  end if;

  if p_executed_by is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Missing Team Optix executor id.'
    );
  end if;

  select task.*
  into v_task
  from legal.customer_legal_task task
  where task.id = p_task_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Legal task not found.'
    );
  end if;

  if v_task.status <> 'CUSTOMER_ACCEPTED' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Legal task is not ready for Team Optix finalization.',
      'status', v_task.status
    );
  end if;

  update legal.customer_legal_task
  set
    status = 'EXECUTED_AND_VAULTED',
    teamoptix_executed_at = now(),
    teamoptix_executed_by = p_executed_by,
    completed_at = now(),
    blocking_reason = 'Legal execution complete and vault evidence recorded.'
  where id = p_task_id
    and status = 'CUSTOMER_ACCEPTED'
  returning *
  into v_task;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Legal task status changed before finalization completed.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'taskId', v_task.id,
    'status', v_task.status,
    'teamoptixExecutedAt', v_task.teamoptix_executed_at,
    'completedAt', v_task.completed_at
  );
end;
$$;

revoke all
  on function public.legal_finalize_customer_task(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.legal_finalize_customer_task(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
